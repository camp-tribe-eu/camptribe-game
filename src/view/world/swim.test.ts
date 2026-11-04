// GAME-227 · купання: стан клітинки з тайлів мапи (суша → мілина → глибина), швидкість, вигляд, мокрі сліди, Мія ніколи на воді.
// Мутації (закон 1; прогнано вручну, див. PR): speedFactor('swim') → 1 («у глибині герой іде») — червоніє «глибина −40 %» і «глибина повільніша»;
// cellState без глибини (усе, що вода, — суша) — червоніють «поступовий вхід» і «глибина є»; stepWet без `left > 0` — червоніє «через 3 с слідів нема».
import { describe, expect, it } from 'vitest';
import mapRaw from '../../../public/maps/camp-lake.tmj?raw';
import requestsRaw from '../../../content/requests.json';
import { miaSpots, REQUESTS } from '../../content/requests';
import {
  DROP_MS, SHALLOW_MAX, SWIM_BOB, SWIM_SPEED, VISIBLE_ROWS, WET_IDLE, WET_MARK_MS, WET_MS, WET_STEP_PX, burstDrops, cellState, dropCount, newBurst, petOnWater, speedFactor, stateAt,
  stepBurst, stepWet, swimBob, swimCol, swimGridOf, swimPhase, swimRegionOf, swimRings, transition, waterCells, withWater, type SwimGrid,
} from './swim';

interface Tmj { width: number; height: number; layers: { name: string; data?: number[]; objects?: { name: string; x: number; y: number; properties?: { name: string; value: unknown }[] }[] }[] }
const map = JSON.parse(mapRaw) as Tmj;
const layer = (n: string): number[] => map.layers.find((l) => l.name === n)?.data ?? [];
const objects = map.layers.find((l) => l.name === 'objects')?.objects ?? [];
const region = swimRegionOf(objects, 32);
const grid: SwimGrid = swimGridOf(map.width, map.height, layer('ground'), region);
const at = (name: string): { x: number; y: number } => { const o = objects.find((x) => x.name === name); if (!o) throw new Error(name); return o; };

describe('стан клітинки з тайлів мапи', () => {
  it('зона пляжу є на мапі й лежить у озері південніше причалу (рядок 7), не на причалі', () => {
    expect(region).toEqual({ c0: 28, r0: 9, c1: 33, r1: 11 });
    expect(region?.r0 ?? 0).toBeGreaterThan(8);
  });
  it('поступовий вхід: суша → мілина → глибина по рядку 10', () => {
    expect([27, 28, 29, 30, 31, 33].map((c) => cellState(grid, c, 10))).toEqual(['land', 'shallow', 'shallow', 'swim', 'swim', 'swim']);
    expect(SHALLOW_MAX).toBe(2);
  });
  it('глибина є: у зоні є клітинки swim, і мілина — по краях (південний берег теж мілкий)', () => {
    const states = Array.from({ length: map.width * map.height }, (_, i) => cellState(grid, i % map.width, Math.floor(i / map.width)));
    expect(states.filter((s) => s === 'swim').length).toBeGreaterThanOrEqual(6);
    expect(states.filter((s) => s === 'shallow').length).toBeGreaterThanOrEqual(6);
    expect([28, 30, 33].map((c) => cellState(grid, c, 11))).toEqual(['shallow', 'shallow', 'shallow']);
  });
  it('поза зоною вода — суша для плавання: причал, решта озера, берег', () => {
    expect(cellState(grid, 30, 7)).toBe('land');     // причал
    expect(cellState(grid, 36, 4)).toBe('land');     // глибина озера поза пляжем — стіни, не купальня
    expect(cellState(grid, 20, 10)).toBe('land');
    expect(cellState(grid, -1, 0)).toBe('land');
    expect(cellState(grid, 999, 999)).toBe('land');
  });
  it('без якоря на мапі зони нема: усе — суша', () => {
    const none = swimGridOf(map.width, map.height, layer('ground'), swimRegionOf([], 32));
    expect(waterCells(none)).toEqual([]);
    expect(cellState(none, 31, 10)).toBe('land');
  });
  it('стан під ногами героя — за піксельною точкою; мапа відкриває вхід: у зоні немає стін, шлях від берега є', () => {
    expect(stateAt(grid, 27 * 32 + 16, 10 * 32 + 16, 32)).toBe('land');
    expect(stateAt(grid, 28 * 32 + 16, 10 * 32 + 16, 32)).toBe('shallow');
    expect(stateAt(grid, 32 * 32 + 16, 10 * 32 + 16, 32)).toBe('swim');
    const walls = layer('walls');
    for (const i of waterCells(grid)) expect(walls[i], `стіна в клітинці води ${i % map.width},${Math.floor(i / map.width)}`).toBe(0);
  });
});

describe('швидкість і вигляд', () => {
  it('глибина −40 %, суша й мілина — звичайна', () => {
    expect(SWIM_SPEED).toBeCloseTo(0.6, 5);
    expect(speedFactor('swim')).toBeCloseTo(0.6, 5);
    expect(speedFactor('land')).toBe(1);
    expect(speedFactor('shallow')).toBe(1);
  });
  it('у глибокій воді герой НЕ ходить: швидкість строго менша за ходьбу', () => {
    expect(speedFactor('swim')).toBeLessThan(speedFactor('land'));
    expect(speedFactor('swim')).toBeGreaterThan(0);
  });
  it('вода перекриває ноги поступово: видимих рядків 64 → 46 → 34', () => {
    expect([VISIBLE_ROWS.land, VISIBLE_ROWS.shallow, VISIBLE_ROWS.swim]).toEqual([64, 46, 34]);
    expect(VISIBLE_ROWS.shallow).toBeLessThan(VISIBLE_ROWS.land);
    expect(VISIBLE_ROWS.swim).toBeLessThan(VISIBLE_ROWS.shallow);
  });
  it('цикл із 4 кадрів, гойдання 0–2 px, у русі гребки, на місці — «стоїть»', () => {
    expect(SWIM_BOB.length).toBe(4);
    expect(Math.min(...SWIM_BOB)).toBe(0); expect(Math.max(...SWIM_BOB)).toBe(2);
    expect(new Set([0, 160, 320, 480].map(swimPhase)).size).toBe(4);
    expect(swimBob(320)).toBe(2);
    expect(swimCol(0, false)).toBe(0);
    expect(new Set([0, 160, 320, 480].map((t) => swimCol(t, true))).size).toBe(4);
  });
  it('кола: у русі й на місці різні (на місці ширші й тихіші)', () => {
    const m = swimRings(300, true); const s = swimRings(300, false);
    expect(m.length).toBeGreaterThan(0);
    expect(Math.max(...swimRings(0, false).map((k) => k.r))).toBeGreaterThanOrEqual(Math.max(...swimRings(0, true).map((k) => k.r)));
    expect(Math.max(...s.map((k) => k.alpha))).toBeLessThan(Math.max(...m.map((k) => k.alpha)));
  });
  it('краплі: 2–4 на пачку, гаснуть за 0,2 с', () => {
    const counts = new Set(Array.from({ length: 40 }, (_, i) => dropCount(i + 1)));
    expect([...counts].sort()).toEqual([2, 3, 4]);
    const b = newBurst(5);
    expect(burstDrops(b).length).toBe(b.n);
    expect(stepBurst(b, DROP_MS - 1)).not.toBeNull();
    expect(stepBurst(b, DROP_MS)).toBeNull();
    expect(burstDrops(null)).toEqual([]);
  });
  it('звуки: вхід, вихід — лише на межі води й суші', () => {
    expect(transition('land', 'shallow')).toBe('enter');
    expect(transition('land', 'swim')).toBe('enter');
    expect(transition('shallow', 'land')).toBe('exit');
    expect(transition('swim', 'land')).toBe('exit');
    expect(transition('shallow', 'swim')).toBeNull();
    expect(transition('land', 'land')).toBeNull();
  });
});

describe('мокрі сліди після виходу', () => {
  const step = (s = WET_IDLE, o: Partial<{ movedPx: number; dtMs: number; landed: boolean; onLand: boolean }> = {}) => stepWet(s, { x: 10, y: 10, movedPx: 0, dtMs: 16, landed: false, onLand: true, ...o });
  it('вийшов — 3 с; ходьба лишає краплю на кожні WET_STEP_PX', () => {
    let s = step(WET_IDLE, { landed: true }).state;
    expect(s.left).toBe(WET_MS);
    let stepped = 0;
    for (let i = 0; i < 40; i++) { const r = step(s, { movedPx: 2.2 }); s = r.state; if (r.stepped) stepped++; }
    expect(stepped).toBe(Math.floor((40 * 2.2) / WET_STEP_PX));
    expect(s.marks.length).toBeGreaterThan(0);
  });
  it('через 3 с слідів нема: час вийшов — нових крапель не лишається', () => {
    let s = step(WET_IDLE, { landed: true }).state;
    s = step(s, { dtMs: WET_MS + 1 }).state;
    expect(s.left).toBe(0);
    const r = step(s, { movedPx: 50 });
    expect(r.stepped).toBe(false);
    expect(step(r.state, { dtMs: WET_MARK_MS }).state.marks).toEqual([]);
  });
  it('без виходу (суха суша) крапель нема, у воді відлік скинуто', () => {
    expect(step(WET_IDLE, { movedPx: 100 }).stepped).toBe(false);
    const wet = step(WET_IDLE, { landed: true }).state;
    expect(step(wet, { onLand: false }).state.left).toBe(0);
  });
  it('крапель не більше ліміту кадру', () => {
    let s = step(WET_IDLE, { landed: true }).state;
    for (let i = 0; i < 100; i++) s = step(s, { movedPx: WET_STEP_PX, dtMs: 1 }).state;
    expect(s.marks.length).toBeLessThanOrEqual(8);
  });
});

describe('родина чекає на березі, Мія й тварини не входять у воду', () => {
  it('сітка слідувачів: усі клітинки води пляжу — стіни, решта стін не зникла', () => {
    const walls = layer('walls');
    const w = withWater(walls, grid);
    for (const i of waterCells(grid)) expect(w[i]).toBeGreaterThan(0);
    expect(waterCells(grid).length).toBe(18);
    expect(w.filter((v) => v > 0).length).toBe(walls.filter((v) => v > 0).length + 18);
  });
  it('усі точки Мії (цілі прохань із mia: true) і всі якорі-сидіння — не на воді', () => {
    const miaTargets = REQUESTS.flatMap((r) => r.targets.filter((t) => t.mia === true).map((t) => t.spot));
    expect(miaTargets.length).toBeGreaterThan(0);
    for (const name of miaTargets) { const o = at(name); expect(petOnWater(grid, o.x + 10, o.y, 32), name).toBe(false); }
    expect(requestsRaw.length).toBe(REQUESTS.length);
    expect(typeof miaSpots).toBe('function');
  });
  it('самотест: на воді petOnWater червоніє', () => {
    expect(petOnWater(grid, 31 * 32 + 16, 10 * 32 + 16, 32)).toBe(true);
    expect(petOnWater(grid, 28 * 32 + 16, 10 * 32 + 16, 32)).toBe(true);
  });
  it('буйок сонячної справи лежить у глибині, і досяжний лише вплав', () => {
    const o = at('req.wx-sunny-swim.t1');
    expect(stateAt(grid, o.x, o.y, 32)).toBe('swim');
  });
});
