// GAME-189 · намет руками: чиста логіка. Мутації (кожна має зробити тест червоним): «завжди влучає» (inBand → true), «done без вводу» (tick доводить до done).
import campMap from '../../public/maps/camp-lake.tmj?raw';
import { describe, expect, it } from 'vitest';
import { BAND, IDLE, PEGS, PERIOD_MS, inBand, markerAt, placeOk, startTent, stepTent, type TentInput, type TentState } from './tent-pitch';

const act = (s: TentState, placeOk = true) => stepTent(s, { kind: 'act', placeOk });
const tick = (s: TentState, dtMs: number) => stepTent(s, { kind: 'tick', dtMs }).state;
/** Час, коли маркер посередині зеленого (0,5 — у середині ходу вниз-вгору). */
const MID = PERIOD_MS / 4;

describe('шкала', () => {
  it('маркер ходить туди-назад 0..1 і повертається', () => {
    expect(markerAt(0)).toBe(0);
    expect(markerAt(PERIOD_MS / 2)).toBe(1);
    expect(markerAt(PERIOD_MS)).toBe(0);
    expect(markerAt(MID)).toBeCloseTo(0.5, 9);
  });
  it('зелена смуга не порожня й не вся шкала; кінці шкали — промах', () => {
    expect(BAND.to - BAND.from).toBeGreaterThan(0.2);
    expect(BAND.to - BAND.from).toBeLessThan(0.8);
    expect(inBand(0)).toBe(false);
    expect(inBand(1)).toBe(false);
    expect(inBand(0.5)).toBe(true);
  });
});

describe('автомат намету', () => {
  it('без вводу намет не ставиться: жодна кількість tick не виводить із place/peg і не веде до done (мутація «done без вводу»)', () => {
    let s = startTent();
    for (let i = 0; i < 10_000; i++) s = tick(s, 16);
    expect(s.phase).toBe('place');
    s = act(s).state;
    expect(s.phase).toBe('peg');
    for (let i = 0; i < 10_000; i++) s = tick(s, 16);
    expect(s.phase).toBe('peg');
    expect(s.pegs).toBe(0);
    expect(tick(IDLE, 1000)).toEqual(IDLE);
  });
  it('поставити можна лише на вільне місце; на зайняте — подія blocked, фаза лишається', () => {
    const r = act(startTent(), false);
    expect(r.event).toBe('blocked');
    expect(r.state.phase).toBe('place');
    expect(act(startTent(), true).event).toBe('placed');
  });
  it('удар у зелене — кілок; після 4-го — done, подія done рівно раз; після done вхід нічого не робить', () => {
    let s = act(startTent()).state;
    const events: string[] = [];
    for (let k = 0; k < PEGS; k++) {
      s = tick(s, MID);
      const r = act(s);
      events.push(r.event);
      s = r.state;
    }
    expect(events).toEqual(['hit', 'hit', 'hit', 'done']);
    expect(s).toMatchObject({ phase: 'done', pegs: PEGS, misses: 0 });
    expect(act(s).event).toBe('none');
  });
  it('мутація «завжди влучає»: удар на краю шкали МУСИТЬ бути промахом (кілок не додається, штрафу нема, спробувати знову можна)', () => {
    let s = act(startTent()).state;   // маркер на 0 — поза зеленим
    const miss = act(s);
    expect(miss.event).toBe('miss');
    expect(miss.state.pegs).toBe(0);
    expect(miss.state.phase).toBe('peg');
    expect(miss.state.misses).toBe(1);
    s = tick(miss.state, MID);
    expect(act(s).event).toBe('hit');
    // Той самий промах на піку шкали (маркер на 1).
    expect(act(tick(act(startTent()).state, PERIOD_MS / 2)).event).toBe('miss');
  });
  it('цикл із промахами скінчиться перемогою: жодного fail-стану, лічильник промахів не блокує', () => {
    let s = act(startTent()).state;
    let guard = 0;
    while (s.phase !== 'done' && guard++ < 100) {
      s = act(s).state;                       // удар на старті ходу — промах
      s = tick(s, guard % 2 === 0 ? MID : 0);   // кожен другий раз ловимо зелене
      if (guard % 2 === 0) s = act(s).state;
    }
    expect(s.phase).toBe('done');
    expect(s.misses).toBeGreaterThan(0);
  });
  it('детермінізм: той самий потік вводу дає той самий стан', () => {
    const feed: TentInput[] = [{ kind: 'act', placeOk: true }, { kind: 'tick', dtMs: 700 }, { kind: 'act', placeOk: true }, { kind: 'tick', dtMs: 33 }, { kind: 'act', placeOk: true }];
    const run = (): TentState => feed.reduce((s, i) => stepTent(s, i).state, startTent());
    expect(run()).toEqual(run());
  });
});

describe('місце під намет', () => {
  const free = (): boolean => false;
  const spot = { x: 100, y: 100 };
  it('вільне поруч із ціллю — так; далеко, у стіні чи на чужому об\'єкті — ні', () => {
    expect(placeOk({ x: 110, y: 100 }, spot, free, [])).toBe(true);
    expect(placeOk({ x: 400, y: 100 }, spot, free, [])).toBe(false);
    expect(placeOk({ x: 110, y: 100 }, spot, (x) => x > 120, [])).toBe(false);
    expect(placeOk({ x: 110, y: 100 }, spot, free, [{ x: 120, y: 105 }])).toBe(false);
  });
});

describe('місце під намет на справжній мапі табору', () => {
  const m = JSON.parse(campMap) as { width: number; height: number; layers: { name: string; data?: number[]; objects?: { name: string; x: number; y: number }[] }[] };
  const walls = m.layers.find((l) => l.name === 'walls')?.data ?? [];
  const objs = m.layers.find((l) => l.name === 'objects')?.objects ?? [];
  const solidAt = (x: number, y: number): boolean => x < 0 || y < 0 || x >= m.width * 32 || y >= m.height * 32 || (walls[Math.floor(y / 32) * m.width + Math.floor(x / 32)] ?? 1) > 0;
  const spot = objs.find((o) => o.name === 'task.pitch-tent') as { x: number; y: number };
  it('є хоч одна придатна точка навколо цілі «намет» (інакше гравець не зможе поставити); у стіні й далеко — ні', () => {
    const ok: string[] = [];
    for (let dx = -72; dx <= 72; dx += 8) for (let dy = -72; dy <= 72; dy += 8) if (placeOk({ x: spot.x + dx, y: spot.y + dy }, spot, solidAt, [])) ok.push(`${dx},${dy}`);
    expect(ok.length).toBeGreaterThan(10);
    expect(placeOk({ x: spot.x + 300, y: spot.y }, spot, solidAt, [])).toBe(false);
    expect(placeOk({ x: 4, y: 4 }, { x: 4, y: 4 }, solidAt, [])).toBe(false);
  });
});
