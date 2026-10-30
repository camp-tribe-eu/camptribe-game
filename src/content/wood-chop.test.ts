// GAME-190 · дрова руками. Мутації (кожна має зробити тест червоним): «завжди влучає» (inBand → true), «done без вводу» (tick доводить до done), «колода без гілок» (need → chopStart).
import campMap from '../../public/maps/camp-lake.tmj?raw';
import { describe, expect, it } from 'vitest';
import { BAND, BRANCHES, BRANCH_AT, PERIOD_MS, STRIKES, WOOD_IDLE, gotCount, inBand, markerAt, startWood, stepWood, woodTarget, type WoodState } from './wood-chop';

const act = (s: WoodState, branch: number | null, atBlock = false) => stepWood(s, { kind: 'act', branch, atBlock });
const tick = (s: WoodState, dtMs: number): WoodState => stepWood(s, { kind: 'tick', dtMs }).state;
const MID = PERIOD_MS / 4;
const gathered = (): WoodState => [0, 1, 2].reduce((s, i) => act(s, i).state, startWood());
const chopping = (): WoodState => act(gathered(), null, true).state;

describe('гілки', () => {
  it('3 гілки піднімаються по одній; повторно ту саму не підняти; стрілка веде до першої непідібраної, потім до колоди', () => {
    let s = startWood();
    expect(woodTarget(s)).toEqual({ kind: 'branch', i: 0 });
    let r = act(s, 1); expect(r.event).toBe('picked'); s = r.state;
    expect(woodTarget(s)).toEqual({ kind: 'branch', i: 0 });
    r = act(s, 1); expect(r.event).toBe('none');
    s = act(s, 0).state; s = act(s, 2).state;
    expect(gotCount(s)).toBe(BRANCHES);
    expect(woodTarget(s)).toEqual({ kind: 'block' });
  });
  it('дія в нікуди нічого не робить; колода без трьох гілок — «спершу збери»', () => {
    const s = startWood();
    expect(act(s, null, false)).toEqual({ state: s, event: 'none' });
    expect(act(s, null, true).event).toBe('need');
    expect(act(act(s, 0).state, null, true).state.phase).toBe('gather');
    expect(act(s, 7).event).toBe('none');
  });
});

describe('колода: удари по шкалі', () => {
  it('3 влучних удари → done; між ними хід шкали з нуля', () => {
    let s = chopping();
    expect(s.phase).toBe('chop');
    for (let k = 1; k <= STRIKES; k++) {
      s = tick(s, MID);
      const r = act(s, null, true);
      expect(r.event).toBe(k === STRIKES ? 'done' : 'hit');
      s = r.state;
    }
    expect(s.phase).toBe('done');
  });
  it('промах: шкала з нуля, лічильник вдалих не падає, штрафу нема', () => {
    let s = chopping();
    s = tick(s, MID); s = act(s, null, true).state;
    const before = s.strikes;
    s = tick(s, 50);   // маркер біля нуля — поза зеленим
    const r = act(s, null, true);
    expect(r.event).toBe('miss');
    expect(r.state.strikes).toBe(before);
    expect(r.state.t).toBe(0);
    expect(r.state.misses).toBe(1);
  });
  it('шкала: туди-назад, зелена смуга посередині', () => {
    expect(markerAt(0)).toBe(0); expect(markerAt(PERIOD_MS / 2)).toBe(1); expect(inBand(markerAt(MID))).toBe(true);
    expect(inBand(BAND.from - 0.01)).toBe(false); expect(inBand(BAND.to + 0.01)).toBe(false);
    expect(inBand(markerAt(10))).toBe(false);
  });
});

describe('без вводу нічого не завершується (закон 1: сторож, що вміє червоніти)', () => {
  it('скільки б не йшов час — ні в gather, ні в chop done не настає; idle лишається idle', () => {
    for (const s0 of [WOOD_IDLE, startWood(), gathered(), chopping()]) {
      let s = s0;
      for (let i = 0; i < 500; i++) s = tick(s, 100);
      expect(s.phase).not.toBe('done');
      expect(s.phase).toBe(s0.phase);
      expect(s.strikes).toBe(0);
    }
  });
  it('idle не реагує на дії', () => { expect(act(WOOD_IDLE, 0, true).event).toBe('none'); });
  it('удар у кожну мить за хід шкали: влучає рівно тоді, коли inBand (не завжди)', () => {
    let hits = 0; let misses = 0;
    for (let t = 0; t < PERIOD_MS; t += 25) { const e = act({ ...chopping(), t }, null, true).event; if (e === 'hit') hits++; else if (e === 'miss') misses++; }
    expect(hits).toBeGreaterThan(10);
    expect(misses).toBeGreaterThan(10);
  });
});

describe('гілки на справжній мапі табору', () => {
  const m = JSON.parse(campMap) as { width: number; height: number; layers: { name: string; data?: number[]; objects?: { name: string; x: number; y: number }[] }[] };
  const walls = m.layers.find((l) => l.name === 'walls')?.data ?? [];
  const objs = m.layers.find((l) => l.name === 'objects')?.objects ?? [];
  const solid = (x: number, y: number): boolean => x < 0 || y < 0 || x >= m.width * 32 || y >= m.height * 32 || (walls[Math.floor(y / 32) * m.width + Math.floor(x / 32)] ?? 1) > 0;
  const block = objs.find((o) => o.name === 'take.item.firewood') as { x: number; y: number };
  it('кожна гілка й сама колода — на вільній землі, на відстані кількох кроків одна від одної', () => {
    expect(solid(block.x, block.y)).toBe(false);
    for (const b of BRANCH_AT) {
      expect(solid(block.x + b.dx, block.y + b.dy), `гілка ${b.dx},${b.dy} у стіні`).toBe(false);
      expect(Math.hypot(b.dx, b.dy)).toBeGreaterThan(48);   // не підбирається «з колоди»: мусиш підійти
      expect(Math.hypot(b.dx, b.dy)).toBeLessThan(160);
    }
    for (const a of BRANCH_AT) for (const b of BRANCH_AT) if (a !== b) expect(Math.hypot(a.dx - b.dx, a.dy - b.dy)).toBeGreaterThan(48);
  });
  it('кожна гілка досяжна пішки від старту (заливка по вільних плитках)', () => {
    const spawn = objs.find((o) => o.name === 's.camp') as { x: number; y: number };
    const seen = new Set<string>([`${Math.floor(spawn.x / 32)},${Math.floor(spawn.y / 32)}`]);
    const q = [...seen].map((k) => k.split(',').map(Number) as [number, number]);
    for (let i = 0; i < q.length; i++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const x = (q[i] as [number, number])[0] + dx; const y = (q[i] as [number, number])[1] + dy;
      if (!seen.has(`${x},${y}`) && !solid(x * 32 + 16, y * 32 + 16)) { seen.add(`${x},${y}`); q.push([x, y]); }
    }
    for (const b of BRANCH_AT) expect(seen.has(`${Math.floor((block.x + b.dx) / 32)},${Math.floor((block.y + b.dy) / 32)}`)).toBe(true);
    expect(seen.has(`${Math.floor(block.x / 32)},${Math.floor(block.y / 32)}`)).toBe(true);
  });
});
