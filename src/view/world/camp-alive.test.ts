// GAME-225 · «Живий табір»: стан кожної реакції до/після, «раз на день», і мутація «потрусили — нічого не впало» (мусить бути червоною).
// Мутації (вручну, перевірено): (1) dropCount → 0 / planDrops повертає [] — червоніють «шишки падають» і «ягоди»; (2) прибрати markUsed у rig-логіці — червоніє «раз на день»;
// (3) stepSeat без SIT_MIN_MS — червоніє «затиснута стрілка»; (4) onPier завжди false — червоніє «пірс».
import { describe, expect, it } from 'vitest';
import {
  BIN_HOP, BINS, COLLECT_R, FALL_MS, MAGNET_R, PIER_STEP_PX, PINE_SHAKE, PUDDLES, PUDDLE_R, REACTIONS, SEATS, SEAT_IDLE, SIT_LEAVE, SIT_MIN_MS, SIT_R, bendAt, bushShift, crownShift, dropAt, dropCount, itemAt, leafAt, leafPlan, lidHeight,
  markUsed, onPier, pickReaction, planDrops, ringAt, stepItems, stepPier, stepPuddles, stepSeat, usedToday, type Item,
} from './camp-alive';
import { findPath, gridFromWalls, isSolid, type Grid, type Pt } from './follow';

const RAW = import.meta.glob<string>('../../../public/maps/camp-lake.tmj', { query: '?raw', import: 'default', eager: true });
const map = JSON.parse(Object.values(RAW)[0] ?? '{}') as { width: number; height: number; layers: { name: string; type: string; data?: number[]; objects?: { name: string; x: number; y: number }[] }[] };
const layer = (n: string): number[] => map.layers.find((l) => l.name === n)?.data ?? [];
const objs = map.layers.find((l) => l.type === 'objectgroup')?.objects ?? [];
const grid: Grid = gridFromWalls(map.width, map.height, 32, layer('walls'));
function must<T>(v: T | undefined | null): T { if (v === undefined || v === null) throw new Error('missing'); return v; }
const tileAt = (p: Pt) => ({ c: Math.floor(p.x / 32), r: Math.floor(p.y / 32) });

describe('лавка', () => {
  const seats = SEATS;
  const at = (i: number): Pt => ({ x: seats[i]?.x ?? 0, y: seats[i]?.y ?? 0 });
  it('зайшов на точку — сів; пішов (після мінімального часу) — встав; повторно лише після відходу', () => {
    let r = stepSeat(SEAT_IDLE, seats, { x: at(0).x + 30, y: at(0).y }, true, false, 16);
    expect(r.event).toBeNull(); expect(r.state.seat).toBeNull();
    r = stepSeat(r.state, seats, { x: at(0).x + 3, y: at(0).y }, true, false, 16);
    expect(r.event).toBe('sit'); expect(r.state.seat).toBe(0);
    let s = r.state;
    s = stepSeat(s, seats, at(0), false, false, 400).state;   // сидить
    expect(s.seat).toBe(0);
    r = stepSeat(s, seats, at(0), true, false, 16);
    expect(r.event).toBe('stand'); expect(r.state.seat).toBeNull(); expect(r.state.blocked).toBe(0);
    // ще на точці — не сідає знову
    r = stepSeat(r.state, seats, at(0), false, false, 16);
    expect(r.event).toBeNull(); expect(r.state.seat).toBeNull();
    // відійшов — знову можна
    r = stepSeat(r.state, seats, { x: at(0).x + SIT_LEAVE + 2, y: at(0).y }, false, false, 16);
    expect(r.state.blocked).toBeNull();
    expect(stepSeat(r.state, seats, at(0), false, false, 16).event).toBe('sit');
  });
  it('затиснута стрілка на вході не збиває посадку раніше SIT_MIN_MS', () => {
    let s = stepSeat(SEAT_IDLE, seats, at(1), true, false, 16).state;
    expect(s.seat).toBe(1);
    s = stepSeat(s, seats, at(1), true, false, SIT_MIN_MS - 20).state;
    expect(s.seat).toBe(1);
    expect(stepSeat(s, seats, at(1), true, false, 30).event).toBe('stand');
  });
  it('зайнятий герой (дія, вода) не сідає', () => { expect(stepSeat(SEAT_IDLE, seats, at(0), false, true, 16).event).toBeNull(); });
  it('точки лавок: на прохідних клітинках, недосяжні центром клітинки (маршрут по центрах не саджає), досяжні від старту', () => {
    const spawn = objs.find((o) => o.name === 's.camp');
    const from = tileAt({ x: spawn?.x ?? 0, y: spawn?.y ?? 0 });
    for (const s of seats) {
      const t = tileAt(s);
      expect(isSolid(grid, t), `лавка ${s.x},${s.y}`).toBe(false);
      expect(findPath(grid, from, t), `шлях до ${s.x},${s.y}`).not.toBeNull();
      expect(Math.hypot(s.x - (t.c * 32 + 16), s.y - (t.r * 32 + 16)), 'не в центрі клітинки').toBeGreaterThan(SIT_R + 4);
    }
  });
});

describe('сосна, кущ: раз на день', () => {
  it('потрусили — НІЧОГО не впало → червоний: кількість ≥ 1 для будь-якого дерева й дня (шишки 1–3, ягоди 2–4)', () => {
    for (const r of REACTIONS.filter((x) => x.kind === 'pine' || x.kind === 'bush')) for (let day = 0; day < 60; day++) {
      const n = dropCount(r.kind, r.id, day);
      const items = planDrops(r.kind, r.id, day, { x: r.at.x, y: r.at.y - 100 }, r.at, 1);
      expect(items.length, `${r.id} день ${day}`).toBe(n);
      if (r.kind === 'pine') { expect(n).toBeGreaterThanOrEqual(1); expect(n).toBeLessThanOrEqual(3); expect(items.every((i) => i.kind === 'cone')).toBe(true); }
      else { expect(n).toBeGreaterThanOrEqual(2); expect(n).toBeLessThanOrEqual(4); expect(items.every((i) => i.kind === 'berry')).toBe(true); }
    }
  });
  it('усі значення 1..3 трапляються (кількість справді залежить від дня)', () => {
    const seen = new Set(Array.from({ length: 80 }, (_, d) => dropCount('pine', 'pine.camp', d)));
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });
  it('журнал: до дії — не діяло, після — діяло; наступного дня — знову можна; інше дерево не зачеплене', () => {
    let log = {};
    expect(usedToday(log, 'pine.camp', 4)).toBe(false);
    log = markUsed(log, 'pine.camp', 4);
    expect(usedToday(log, 'pine.camp', 4)).toBe(true);
    expect(usedToday(log, 'pine.forest.1', 4)).toBe(false);
    expect(usedToday(log, 'pine.camp', 5)).toBe(false);
  });
  it('шишка: падає, лежить; герой поруч — летить і підбирається рівно раз; далеко — лежить', () => {
    const hero = { x: 100, y: 200 };
    const [cone] = planDrops('pine', 'pine.camp', 3, { x: 100, y: 100 }, { x: 100, y: 190 }, 1);
    let items: Item[] = [must(cone)];
    expect(items[0]?.y).toBe(100);   // стартує в кроні
    let got = 0; let t = 0;
    for (; t < 3000 && got === 0; t += 16) { const r = stepItems(items, hero, 16); items = r.items; got += r.collected.length; }
    expect(got).toBe(1); expect(items).toHaveLength(0); expect(t).toBeGreaterThan(FALL_MS * 0.5); expect(t).toBeLessThan(2500);
    // герой далеко — шишка лишається (не зникає)
    let far: Item[] = [must(cone)];
    for (let i = 0; i < 400; i++) far = stepItems(far, { x: 900, y: 900 }, 16).items;
    expect(far).toHaveLength(1);
    expect(Math.hypot(must(far[0]).x - hero.x, must(far[0]).y - hero.y)).toBeGreaterThan(COLLECT_R);
    expect(MAGNET_R).toBeGreaterThan(COLLECT_R);
  });
  it('падіння неперервне й закінчується точно в точці посадки', () => {
    const [it0] = planDrops('pine', 'pine.camp', 1, { x: 50, y: 0 }, { x: 50, y: 100 }, 1);
    const it = must(it0);
    expect(itemAt({ ...it, age: 0 })).toEqual({ x: it.x0, y: it.y0 });
    expect(itemAt({ ...it, age: FALL_MS })).toEqual({ x: it.x1, y: it.y1 });
  });
  it('тремтіння: крона 4 кадри по 2 px і спокій; кущ 3 кадри; листя 3–6, гасне', () => {
    expect([0, 1, 2, 3].map((f) => crownShift(f * 66 + 5))).toEqual([...PINE_SHAKE]);
    expect(Math.max(...PINE_SHAKE.map(Math.abs))).toBe(2);
    expect(crownShift(4 * 66 + 5)).toBe(0);
    expect([0, 1, 2].map((f) => bushShift(f * 66 + 5)).every((x) => x !== 0)).toBe(true); expect(bushShift(3 * 66 + 5)).toBe(0);
    const ls = leafPlan('pine.camp', 2, { x: 0, y: 0 });
    expect(ls.length).toBeGreaterThanOrEqual(3); expect(ls.length).toBeLessThanOrEqual(6);
    expect(leafAt(must(ls[0]), 0).alpha).toBe(1); expect(leafAt(must(ls[0]), 900).alpha).toBe(0);
  });
});

describe('калюжі, пірс, колонка, смітник', () => {
  it('калюжа: хлюп лише в русі й раз на захід; кільце 3 кадри', () => {
    const p = must(PUDDLES[0]);
    let r = stepPuddles([], PUDDLES, p, false);
    expect(r.splashed).toEqual([]);   // стоїть — тиша
    r = stepPuddles(r.inside, PUDDLES, p, true);
    expect(r.splashed).toEqual([0]);
    r = stepPuddles(r.inside, PUDDLES, { x: p.x + 3, y: p.y }, true);
    expect(r.splashed).toEqual([]);   // ще в ній — не повторює
    r = stepPuddles(r.inside, PUDDLES, { x: p.x + 40, y: p.y }, true);
    r = stepPuddles(r.inside, PUDDLES, { x: p.x + PUDDLE_R - 2, y: p.y }, true);
    expect(r.splashed).toEqual([0]);
    expect([0, 100, 200, 300].map((a) => ringAt(a)?.r ?? null)).toEqual([4, 8, 12, null]);
  });
  it('пірс: звук кожні PIER_STEP_PX по настилу; на землі — нічого; зійшов — скинуто', () => {
    let s = { acc: 0, step: false }; let steps = 0;
    for (let i = 0; i < 100; i++) { s = stepPier(s.acc, true, 2); if (s.step) steps++; }
    expect(steps).toBe(Math.floor(200 / PIER_STEP_PX));
    expect(stepPier(10, false, 5)).toEqual({ acc: 0, step: false });
    expect(onPier(900, 240)).toBe(true); expect(onPier(1140, 200)).toBe(true); expect(onPier(800, 240)).toBe(false); expect(onPier(900, 300)).toBe(false);
  });
  it('пірс на мапі: усі прямокутники лежать на дошках (decor) і без стін', () => {
    const decor = layer('decor'); const walls = layer('walls');
    for (const r of [{ x: 896, y: 224, w: 192, h: 32 }, { x: 1088, y: 192, w: 96, h: 96 }]) for (let c = r.x / 32; c < (r.x + r.w) / 32; c++) for (let rr = r.y / 32; rr < (r.y + r.h) / 32; rr++) {
      const g = (decor[rr * map.width + c] ?? 0) & 0x1fffffff;
      expect([657, 658, 659], `дошка (${c},${rr})`).toContain(g);
      expect(walls[rr * map.width + c]).toBe(0);
    }
  });
  it('колонка: нахил 0 → пік → 0, краплі падають і лягають колом; кришки підскакують 6–8 px і лягають', () => {
    expect(bendAt(0)).toBe(0); expect(bendAt(320)).toBeGreaterThan(0.9); expect(bendAt(700)).toBe(0);
    expect(dropAt(0, 50)).toBeNull(); expect(dropAt(0, 200)?.ground).toBe(false); expect(dropAt(0, 330)?.ground).toBe(true);
    const peak = Math.max(...Array.from({ length: 330 }, (_, a) => lidHeight(a)));
    expect(peak).toBeGreaterThanOrEqual(6); expect(peak).toBeLessThanOrEqual(8); expect(BIN_HOP).toBe(7);
    expect(lidHeight(0)).toBe(0); expect(lidHeight(400)).toBe(0); expect(BINS).toHaveLength(3);
  });
  it('вибір речі: найближча в радіусі; далеко — нічого', () => {
    const tap = must(REACTIONS.find((r) => r.kind === 'tap'));
    expect(pickReaction({ x: tap.at.x + 10, y: tap.at.y + 18 })?.id).toBe('tap.camp');
    expect(pickReaction({ x: 5000, y: 5000 })).toBeNull();
  });
});

describe('карта: речі табору стоять там, де намальовано', () => {
  const ABOVE = layer('above');
  it('крони сосен і кущів — справді в шарі above (тайли набору), сосна — 31, кущ — 409', () => {
    for (const r of REACTIONS.filter((x) => x.crown)) {
      const c = must(r.crown);
      expect((ABOVE[c.r * map.width + c.c] ?? 0) & 0x1fffffff, r.id).toBe(r.kind === 'pine' ? 31 : 409);
    }
  });
  it('до кожної речі можна дійти: прохідна клітинка в радіусі дії, досяжна від старту', () => {
    const spawn = must(objs.find((o) => o.name === 's.camp'));
    const from = tileAt(spawn);
    for (const r of REACTIONS) {
      let ok = false;
      for (let c = 0; c < map.width && !ok; c++) for (let rr = 0; rr < map.height && !ok; rr++) {
        const t = { c, r: rr }; const cp = { x: c * 32 + 16, y: rr * 32 + 16 };
        if (Math.hypot(cp.x - r.at.x, cp.y - r.at.y) <= r.range * 0.8 && !isSolid(grid, t) && findPath(grid, from, t)) ok = true;
      }
      expect(ok, `немає де стати біля ${r.id}`).toBe(true);
    }
  });
  it('Мія ніколи не поруч із водою, кущами й колонкою: цілі Мії далі за 3 клітинки від калюж, колонки, кущів', () => {
    const mia = objs.filter((o) => o.name === 'req.nora-camera.t1' || o.name === 'req.ingrid-starmap.t4');
    expect(mia).toHaveLength(2);
    const wet: Pt[] = [...PUDDLES, ...REACTIONS.filter((r) => r.kind === 'tap' || r.kind === 'bush').map((r) => r.at)];
    for (const m of mia) for (const w of wet) expect(Math.hypot(m.x - w.x, m.y - w.y), `${m.name} ↔ ${w.x},${w.y}`).toBeGreaterThan(96);
  });
});
