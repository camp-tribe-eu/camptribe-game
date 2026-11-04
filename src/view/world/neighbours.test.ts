// GAME-226 · «Живі сусіди»: таблиця «година × погода × відстань × перший раз сьогодні → стан», дорога додому, привітання раз на добу, значки по кадрах, затор.
// Мутації (перевірено, виводи в PR): (1) routeAt ніколи не повертає 'home' → «вночі сусід іде додому» і рядки ≥18:30 червоні; (2) neighbourState без 'wave' → «привітання при першому наближенні» і рядки wave червоні;
// (3) EMOTE_HOLD 90 → 30 → «значок: 6 кадрів появи й 90 утримання» червоний; (4) RAIN_SPEED 1 → «дощ: додому швидше» червоний.
import { describe, expect, it } from 'vitest';
import { RESIDENTS, TILES_PER_MIN, buildTimeline, residentGrid, walkableAt, type Timeline } from './ambient';
import { findPath, gridFromWalls, tileOf, type Pt } from './follow';
import {
  BLOCK_FRAMES, BLOCK_R, EMOTE_FRAMES, EMOTE_HOLD, EMOTE_IN, HOMES, MIND0, OFF_SPEED, RAIN_SPEED, WAVE_FRAMES, WAVE_R, ZZZ_EVERY,
  emoteScale, flipping, lookDir, neighbourAt, pagesTurned, planHome, routeAt, sinceEvening, stepMind, waveFrame, workFrame, EMOTES,
  type Frame, type Mind, type NState,
} from './neighbours';

const RAW = import.meta.glob<string>('../../../public/maps/camp-lake.tmj', { query: '?raw', import: 'default', eager: true });
const map = JSON.parse(Object.values(RAW)[0] ?? '') as { width: number; height: number; layers: { name: string; data?: number[]; objects?: { type?: string; class?: string; x: number; y: number }[] }[] };
const objs = map.layers.find((l) => l.name === 'objects')?.objects ?? [];
const spots: Pt[] = objs.filter((o) => ['trigger', 'npc', 'anchor'].includes(String(o.type || o.class))).map((o) => ({ x: o.x, y: o.y }));
const grid = gridFromWalls(map.width, map.height, 32, map.layers.find((l) => l.name === 'walls')?.data ?? []);
const walk = residentGrid(grid, spots);
const TL: Timeline[] = RESIDENTS.map((r) => { const t = buildTimeline(walk, r); if (!t) throw new Error(r.id); return t; });
const idx = (id: string): number => RESIDENTS.findIndex((r) => r.id === id);
/** Сира хвилина годинника для «години доби» h (дробової) на 3-тю добу. */
const clock = (h: number): number => 3 * 1440 + Math.round(h * 60) - 480;
function at(id: string, h: number, o: { dist: number; rain?: boolean; waved: boolean; blocked?: boolean }): { state: NState; phase: string; x: number; y: number } {
  const i = idx(id);
  const m = clock(h);
  const plan = planHome(walk, TL[i] as Timeline, HOMES[id] as { c: number; r: number }, m - sinceEvening(m), o.rain === true);
  const r = neighbourAt(walk, TL[i] as Timeline, i, plan, m, { dist: o.dist, raining: o.rain === true, waved: o.waved, ...(o.blocked ? { blocked: true } : {}) });
  return { state: r.state, phase: r.route.phase, x: r.route.x, y: r.route.y };
}

describe('стан сусіда: година × погода × відстань × перший раз сьогодні', () => {
  // [id, година, дощ, відстань px, вже махав сьогодні, очікуваний стан]
  const ROWS: readonly (readonly [string, number, boolean, number, boolean, NState])[] = [
    ['npc.luc', 7, false, 500, true, 'sit'],        // на лавці
    ['npc.luc', 7, false, 50, false, 'wave'],       // перше наближення за добу — махає
    ['npc.luc', 7, false, 50, true, 'sit'],         // вже махав — не махає
    ['npc.luc', 7, false, WAVE_R + 10, false, 'sit'], // далеко — не махає
    ['npc.luc', 7.5, false, 500, true, 'work'],
    ['npc.luc', 8, false, 500, true, 'walk'],
    ['npc.amina', 7, false, 500, true, 'look'],
    ['npc.amina', 7.5, false, 500, true, 'read'],
    ['npc.amina', 13.5, false, 40, false, 'wave'],
    ['npc.amina', 13.5, false, 40, true, 'work'],
    ['npc.amina', 18, false, 500, true, 'walk'],    // вечір: іде додому
    ['npc.amina', 18, true, 500, true, 'hurry'],    // дощ: поспішає
    ['npc.amina', 18.5, false, 500, true, 'sit'],   // біля намету
    ['npc.amina', 19, true, 500, true, 'sit'],
    ['npc.amina', 20.5, false, 500, true, 'sleep'], // після 20:00 спить
    ['npc.amina', 23.5, false, 20, false, 'sleep'], // спить — не махає навіть поруч
    ['npc.nora', 6, false, 500, true, 'sleep'],     // ще спить
    ['npc.nora', 6 + 50 / 60, false, 500, true, 'walk'], // зранку йде на місце
    ['npc.claire', 12, false, 500, true, 'work'],
  ];
  it.each(ROWS)('%s о %s год, дощ=%s, %s px, махав=%s → %s', (id, h, rain, dist, waved, want) => {
    expect(at(id, h, { dist, rain, waved }).state).toBe(want);
  });
  it('таблиця має щонайменше 12 рядків і покриває всі стани доби', () => {
    expect(ROWS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(ROWS.map((r) => r[5]))).toEqual(new Set(['sit', 'wave', 'work', 'walk', 'look', 'read', 'hurry', 'sleep']));
  });
  it('затор: герой надто довго на шляху → «обходить»', () => {
    expect(at('npc.amina', 13.5, { dist: 10, waved: true, blocked: true }).state).toBe('around');
    expect(at('npc.amina', 9, { dist: 10, waved: true, blocked: true }).state).toBe('around');
  });
});

describe('вечір 18–20: додому', () => {
  it('вночі сусід іде додому: о 19:00 і о 23:00 стоїть у своєму наметі, а вранці — деінде', () => {
    for (const r of RESIDENTS) {
      const h = HOMES[r.id] as { c: number; r: number };
      for (const hour of [19, 23]) {
        const p = at(r.id, hour, { dist: 500, waved: true });
        expect(p.phase, `${r.id} о ${hour}`).toBe('home');
        expect([Math.floor(p.x / 32), Math.floor(p.y / 32)], `${r.id} о ${hour}: клітинка`).toEqual([h.c, h.r]);
      }
      const morning = at(r.id, 12, { dist: 500, waved: true });
      expect(morning.phase).toBe('out');
    }
  });
  it('намети: прохідні, не цілі взаємодії, шлях зі стоянок і назад є, герой зі старту дійде; дорога вкладається у вечір', () => {
    const start = tileOf(grid, { x: 6.5 * 32, y: 5.5 * 32 });
    for (const [i, r] of RESIDENTS.entries()) {
      const home = HOMES[r.id];
      expect(home, r.id).toBeDefined();
      if (!home) continue;
      const c = { x: (home.c + 0.5) * 32, y: (home.r + 0.5) * 32 };
      expect(walkableAt(walk, c), `${r.id}: намет у стіні чи на цілі`).toBe(true);
      expect(findPath(grid, start, home), `${r.id}: герой не дійде до намету`).not.toBeNull();
      for (const night of [0, 1, 2, 3, 4]) for (const rain of [false, true]) {
        const m = 1440 * (night + 2) + 600;   // 18:00 тієї доби
        const plan = planHome(walk, TL[i] as Timeline, home, m, rain);
        expect(plan, `${r.id}: нема дороги`).not.toBeNull();
        expect(plan?.goMin ?? 999, `${r.id}: до намету до 20:00`).toBeLessThan(120);
        expect((plan?.goMin ?? 999) + (plan?.leaveMin ?? 999), `${r.id}: туди й назад у ніч`).toBeLessThan(780);
      }
    }
  });
  it('рух безперервний: за хвилину не далі, ніж ходить сусід (без телепортів о 18:00, 7:00 і на межах)', () => {
    for (const [i, r] of RESIDENTS.entries()) {
      const home = HOMES[r.id] as { c: number; r: number };
      for (const rain of [false, true]) {
        let prev: Pt | null = null;
        const base = clock(16);
        const plan = planHome(walk, TL[i] as Timeline, home, base + 120, rain);
        for (let t = 0; t <= 16 * 60; t += 1) {
          const m = base + t;
          const rt = routeAt(walk, TL[i] as Timeline, home, m >= base + 120 ? plan : null, m);
          if (prev && t > 120) expect(Math.hypot(rt.x - prev.x, rt.y - prev.y), `${r.id} дощ=${rain} хв ${t}`).toBeLessThanOrEqual(TILES_PER_MIN * RAIN_SPEED * 32 + 24);
          prev = rt;
        }
      }
    }
  });
  it('дощ: додому швидше', () => {
    const i = idx('npc.nora');
    const home = HOMES['npc.nora'] as { c: number; r: number };
    const m = clock(18);
    const dry = planHome(walk, TL[i] as Timeline, home, m, false);
    const wet = planHome(walk, TL[i] as Timeline, home, m, true);
    expect(wet?.goMin ?? 99).toBeLessThan((dry?.goMin ?? 0) / 1.5);
    // через 15 хв після 18:00 у дощ нора вже вдома, без дощу ще в дорозі
    const noraAt = (rain: boolean): string => routeAt(walk, TL[i] as Timeline, home, rain ? wet : dry, m + 18).phase;
    expect(noraAt(true)).toBe('home');
    expect(noraAt(false)).toBe('going');
  });
});

const near = (over: Partial<Frame> = {}): Frame => ({ tod: 12 * 60, day: 5, phase: 'out', moving: false, dist: 50, raining: false, activity: 'work', side: { x: 28, y: 0 }, bench: null, hold: false, ...over });
const run = (m: Mind, n: number, f: Frame | ((k: number) => Frame)): Mind[] => { const out: Mind[] = []; for (let k = 0; k < n; k++) { m = stepMind(m, typeof f === 'function' ? f(k) : f); out.push(m); } return out; };

describe('привітання', () => {
  it('при першому наближенні за добу — рівно один раз: 60 кадрів руки, далі заняття; наступної доби знову', () => {
    const ms = run(MIND0, 300, near());
    const waving = ms.filter((m) => m.state === 'wave').length;
    expect(ms[0]?.state).toBe('wave');
    expect(waving).toBe(WAVE_FRAMES);
    expect(ms[WAVE_FRAMES]?.state).toBe('work');
    expect(ms[299]?.waveDay).toBe(5);
    const next = run(ms[299] as Mind, 3, near({ day: 6 }));
    expect(next[0]?.state).toBe('wave');
  });
  it('привітання «руки»: 2 кадри ×3 (0,1,0,1,0,1), потім опущена', () => {
    const seq = Array.from({ length: WAVE_FRAMES }, (_, f) => waveFrame(f));
    expect(seq.filter((v, i) => v === 1 && seq[i - 1] !== 1).length).toBe(3);
    expect(waveFrame(WAVE_FRAMES)).toBe(0);
  });
  it('далеко — не махає; ходить — не махає; розмова (hold) — не махає', () => {
    expect(run(MIND0, 5, near({ dist: WAVE_R + 5 })).every((m) => m.state !== 'wave')).toBe(true);
    expect(run(MIND0, 5, near({ moving: true })).every((m) => m.state === 'walk')).toBe(true);
    expect(run(MIND0, 5, near({ hold: true })).every((m) => m.state === 'stand')).toBe(true);
  });
});

describe('значки над головою', () => {
  it('значок: 6 кадрів появи й 90 утримання — рівно 96 кадрів, без чисел', () => {
    expect(EMOTE_IN).toBe(6);
    expect(EMOTE_HOLD).toBe(90);
    const ms = run(MIND0, 200, near());
    const shown = ms.filter((m) => m.emote === 'heart').length;
    expect(shown).toBe(EMOTE_FRAMES);
    expect(ms[0]?.emote).toBe('heart');
    expect(ms[EMOTE_FRAMES - 1]?.emote).toBe('heart');
    expect(ms[EMOTE_FRAMES]?.emote).toBeNull();
    const scales = Array.from({ length: EMOTE_FRAMES + 1 }, (_, a) => emoteScale(a));
    expect(scales.slice(0, EMOTE_IN).every((v, i, a) => v > 0 && v < 1 === (i < EMOTE_IN - 1) && (i === 0 || v > (a[i - 1] as number)))).toBe(true);
    expect(scales.slice(EMOTE_IN, EMOTE_FRAMES).every((v) => v === 1)).toBe(true);
    expect(scales[EMOTE_FRAMES]).toBe(0);
  });
  it('усі п’ять гліфів — піксельні 5×7 без літер і цифр', () => {
    expect(Object.keys(EMOTES).sort()).toEqual(['ask', 'bang', 'dots', 'heart', 'zzz']);
    for (const rows of Object.values(EMOTES)) { expect(rows.length).toBe(7); for (const r of rows) expect(r).toMatch(/^[.#]{5}$/); }
  });
  it('сон: «Z» одразу й повторюється раз на ZZZ_EVERY кадрів; дощ → «!» один раз; затор → «?»', () => {
    const sleep = run(MIND0, ZZZ_EVERY * 2 + 5, near({ phase: 'home', tod: 22 * 60, dist: 500 }));
    expect(sleep[0]?.emote).toBe('zzz');
    expect(sleep[0]?.state).toBe('sleep');
    expect(sleep[EMOTE_FRAMES + 3]?.emote).toBeNull();
    expect(sleep[ZZZ_EVERY]?.emote).toBe('zzz');
    expect(sleep[ZZZ_EVERY]?.emoteAge).toBe(0);
    const rain = run(MIND0, 3, near({ phase: 'going', moving: true, raining: true, dist: 500 }));
    expect(rain[0]?.state).toBe('hurry');
    expect(rain[0]?.emote).toBe('bang');
    const dry = run(MIND0, 3, near({ phase: 'going', moving: true, dist: 500 }));
    expect(dry[0]?.emote).toBeNull();
  });
});

describe('герой стоїть на шляху', () => {
  const stuck = near({ dist: BLOCK_R - 8, activity: 'stand' });
  it(`до ${BLOCK_FRAMES} кадрів — терпить; далі «?» і м’який обхід убік (1 px за кадр); відійшов — повертається`, () => {
    const pre = run({ ...MIND0, waveDay: 5 }, BLOCK_FRAMES - 1, stuck);
    expect(pre.every((m) => m.state !== 'around')).toBe(true);
    const all = run({ ...MIND0, waveDay: 5 }, BLOCK_FRAMES + 40, stuck);
    const first = all.findIndex((m) => m.state === 'around');
    expect(first).toBe(BLOCK_FRAMES - 1);
    expect(all[first]?.emote).toBe('ask');
    const last = all[all.length - 1] as Mind;
    expect(last.off.x).toBeGreaterThan(0);
    expect(last.off.x).toBeLessThanOrEqual(28);
    for (let k = 1; k < all.length; k++) expect(Math.hypot((all[k] as Mind).off.x - (all[k - 1] as Mind).off.x, (all[k] as Mind).off.y - (all[k - 1] as Mind).off.y)).toBeLessThanOrEqual(OFF_SPEED + 1e-9);
    const gone = run(last, 400, near({ dist: 400, activity: 'stand', side: null }));
    expect(gone[gone.length - 1]?.state).toBe('stand');
    expect(gone[gone.length - 1]?.off).toEqual({ x: 0, y: 0 });
  });
  it('мимохідь поруч — без «?»', () => {
    const ms = run({ ...MIND0, waveDay: 5 }, 600, (k) => near({ dist: k % 100 < 20 ? 10 : 200, activity: 'stand' }));
    expect(ms.every((m) => m.state !== 'around')).toBe(true);
  });
});

describe('заняття: кадри', () => {
  it('оглядається: ліворуч → пауза → праворуч → пауза', () => {
    const seen: string[] = [];
    for (let f = 0; f < 240; f++) { const d = lookDir(f); if (seen[seen.length - 1] !== d) seen.push(d); }
    expect(seen).toEqual(['down', 'left', 'down', 'right', 'down']);
  });
  it('читає: сторінка гортається раз на 4–5 с (при 60 к/с — 240 і 300 кадрів), гортання коротке', () => {
    const flips: number[] = [];
    for (let f = 1; f < 2000; f++) if (pagesTurned(f) !== pagesTurned(f - 1)) flips.push(f);
    for (let k = 1; k < flips.length; k++) { const gap = (flips[k] as number) - (flips[k - 1] as number); expect(gap / 60).toBeGreaterThanOrEqual(4); expect(gap / 60).toBeLessThanOrEqual(5); }
    expect(flips.length).toBeGreaterThanOrEqual(6);
    expect(flipping(flips[0] as number)).toBe(true);
    expect(flipping((flips[0] as number) + 30)).toBe(false);
  });
  it('працює: нахил у 3 кадри (0,1,2,1)', () => {
    expect(new Set(Array.from({ length: 200 }, (_, f) => workFrame(f)))).toEqual(new Set([0, 1, 2]));
  });
});

describe('сторожі', () => {
  const SRC = import.meta.glob<string>(['./neighbours.ts', './neighbours-rig.ts'], { query: '?raw', import: 'default', eager: true });
  it('no-realtime: ні tween, ні таймерів, Date, performance, Math.random; логіка не тягне Phaser; текстів у коді нема (лише i18n/гліфи)', () => {
    expect(Object.keys(SRC).length).toBe(2);
    for (const [f, src] of Object.entries(SRC)) {
      expect(src, f).not.toMatch(/tweens|setTimeout|setInterval|Date\.now|new Date|performance\.now|time\.addEvent|delayedCall|Math\.random|requestAnimationFrame/);
      expect(src, f).not.toMatch(/\.add\.text\(/);
    }
    expect(SRC['./neighbours.ts']).not.toMatch(/from 'phaser'/);
  });
  it('нічого не пишеться в сейв/SIDE: у модулях нема звернень до ядра й сховищ', () => {
    for (const [f, src] of Object.entries(SRC)) expect(src, f).not.toMatch(/core\/|localStorage|grant\(|SIDE\./);
  });
});
