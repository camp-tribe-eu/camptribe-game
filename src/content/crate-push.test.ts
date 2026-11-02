// GAME-209 · сторож ящика: ящик ніколи не замикає прохід. Закон 1: кожну перевірку показано червоною мутацією (сторож вимкнено → та сама сцена ламається).
import campMap from '../../public/maps/camp-lake.tmj?raw';
import { describe, expect, it } from 'vitest';
import { CRATE_M, CRATE_PX, cutOff, explorePushes, pushCrate, pushDirection, softlockGuard, standTile, crateWorld, type CrateWorld, type PushDir, type PushGuard, type Tile } from './crate-push';

/** '#' — стіна, 'S' — поява, 'T' — ціль, '.' — вільно. */
function ascii(rows: string[]): CrateWorld {
  const cols = rows[0]?.length ?? 0;
  const solid: boolean[] = []; const spots: Tile[] = []; let spawn: Tile = { c: 0, r: 0 };
  rows.forEach((row, r) => [...row].forEach((ch, c) => { solid.push(ch === '#'); if (ch === 'T') spots.push({ c, r }); if (ch === 'S') spawn = { c, r }; }));
  return { cols, rows: rows.length, solid, spawn, spots };
}

// Двері в один тайл (стовпець 4) між двома кімнатами; ціль — у правій кімнаті.
const DOOR = ascii([
  '#########',
  '#...#...#',
  '#S......#',
  '#...#.T.#',
  '#########',
]);
const noGuard: PushGuard = () => true;
/** Мутант 2: «сторож» дивиться лише, чи вільна клітинка поруч із героєм, а не чи досяжні цілі. */
const weakGuard: PushGuard = (w, from) => !w.solid[from.r * w.cols + from.c];

/** Штовхає ящик по черзі напрямків (герой стоїть позаду); повертає ящик і скільки відмов. */
function run(w: CrateWorld, start: Tile, dirs: PushDir[], guard: PushGuard): { crate: Tile; refused: string[] } {
  let crate = start; const refused: string[] = [];
  for (const d of dirs) {
    const r = pushCrate(w, crate, standTile(crate, d), d, guard);
    if (r.ok) crate = r.crate; else refused.push(r.reason);
  }
  return { crate, refused };
}
const START: Tile = { c: 2, r: 2 };
const INTO_DOOR: PushDir[] = ['right', 'right'];   // (2,2) → (3,2) → (4,2) — у двері

describe('GAME-209 · штовхання ящика по клітинках', () => {
  it('ящик зсувається на одну клітинку; стіна й клітинка цілі — відмова', () => {
    const w = ascii(['#####', '#S..#', '#.T.#', '#####']);
    expect(pushCrate(w, { c: 2, r: 1 }, { c: 1, r: 1 }, 'right')).toEqual({ ok: true, crate: { c: 3, r: 1 } });
    expect(pushCrate(w, { c: 3, r: 1 }, { c: 2, r: 1 }, 'right')).toEqual({ ok: false, reason: 'wall' });
    expect(pushCrate(w, { c: 2, r: 1 }, { c: 2, r: 0 }, 'down')).toEqual({ ok: false, reason: 'spot' });
  });

  it('напрямок штовхання — вісь із більшим зсувом, від героя', () => {
    expect(pushDirection({ x: 0, y: 0 }, { x: 30, y: 10 })).toBe('right');
    expect(pushDirection({ x: 0, y: 0 }, { x: -5, y: -30 })).toBe('up');
    expect(pushDirection({ x: 10, y: 10 }, { x: 10, y: 10 })).toBeNull();
  });

  it('сторож: ящик у дверях відхилено, прохід лишається, ящик стоїть', () => {
    const { crate, refused } = run(DOOR, START, INTO_DOOR, softlockGuard);
    expect(refused).toEqual(['softlock', 'softlock']);   // і перед дверима (3,2), і в дверях (4,2) ящик відрізав би правну кімнату
    expect(crate).toEqual(START);
    expect(cutOff(DOOR, DOOR.spawn, crate)).toEqual([]);
  });

  it('МУТАЦІЯ «ящик застряг у дверях»: без сторожа той самий зсув ріже ціль — перевірка червоніє', () => {
    for (const mutant of [noGuard, weakGuard]) {
      const { crate, refused } = run(DOOR, START, INTO_DOOR, mutant);
      expect(refused, 'мутант пропустив зсув у двері').toEqual([]);
      expect(crate).toEqual({ c: 4, r: 2 });
      expect(cutOff(DOOR, { c: 3, r: 2 }, crate).length, 'ціль відрізано: саме це ловить сторож').toBeGreaterThan(0);
    }
  });

  it('ящик лишається в межах мапи: край — стіна', () => {
    const w = ascii(['S..']);
    expect(pushCrate(w, { c: 2, r: 0 }, { c: 1, r: 0 }, 'right')).toEqual({ ok: false, reason: 'wall' });
  });

  it('вичерпно на малій мапі: жодне досяжне розташування ящика нічого не відрізає, відмови були; мутант — ламає', () => {
    const ok = explorePushes(DOOR, START);
    expect(ok.broken).toEqual([]);
    expect(ok.refused).toBeGreaterThan(0);
    expect(ok.accepted).toBeGreaterThan(0);
    expect(ok.states.some((s) => s.c === 4 && s.r === 2)).toBe(false);
    const bad = explorePushes(DOOR, START, noGuard);
    expect(bad.broken.length, 'без сторожа вичерпний пошук мусить знайти softlock').toBeGreaterThan(0);
  });

  it('розмір ящика відповідає масштабу 28 px/м (OD-026) ±25 %', () => {
    expect(CRATE_PX / CRATE_M).toBeGreaterThan(28 * 0.75);
    expect(CRATE_PX / CRATE_M).toBeLessThan(28 * 1.25);
  });
});

describe('GAME-209 · справжня мапа табору', () => {
  interface Tmj { width: number; height: number; layers: { name: string; data?: number[]; objects?: { name: string; type: string; x: number; y: number }[] }[] }
  const map = JSON.parse(campMap) as Tmj;
  const objects = map.layers.find((l) => l.name === 'objects')?.objects ?? [];
  const start = objects.find((o) => o.name === 'crate.start');
  const world = crateWorld(map.width, map.height, 32, map.layers.find((l) => l.name === 'walls')?.data ?? [], objects.find((o) => o.type === 'spawn') ?? { x: 0, y: 0 }, objects.filter((o) => o.type !== 'spawn'));
  const startTile: Tile = { c: Math.floor((start?.x ?? -1) / 32), r: Math.floor((start?.y ?? -1) / 32) };

  it('на мапі є старт ящика, і сам старт нічого не відрізає', () => {
    expect(start, 'crate.start на мапі табору').toBeDefined();
    expect(world.spots.length).toBeGreaterThan(50);
    expect(cutOff(world, world.spawn, startTile)).toEqual([]);
  });

  it('вичерпно: будь-яка послідовність законних зсувів лишає досяжними точку появи й усі об\'єкти (стан = розташування ящика)', () => {
    const ex = explorePushes(world, startTile);
    expect(ex.broken).toEqual([]);
    expect(ex.states.length, 'ящик справді можна пересунути в багато місць').toBeGreaterThan(20);
    expect(ex.refused, 'сторож на цій мапі має що відхиляти (вузький прохід поруч)').toBeGreaterThan(0);
  });

  it('МУТАЦІЯ на справжній мапі: без сторожа вичерпний пошук знаходить розташування, що відрізає частину табору', () => {
    const bad = explorePushes(world, startTile, noGuard);
    expect(bad.broken.length).toBeGreaterThan(0);
  });
});
