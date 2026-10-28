// GAME-112 · сторож «родина йде за лідером»: ланцюжок із ТРЬОХ слідувачів на ТРЬОХ мапах проєкту (кемпінг, пролог, дім).
// Лідер ходить 60 с довгими маршрутами в обхід стін (крок кадру 1/60 с, швидкість SPEED сцени); перевіряємо:
//  1) ніхто з ланцюжка жодного кроку не стоїть у стіні;
//  2) на кінці (лідер став на 3 с) кожен — не далі N тайлів від лідера;
//  3) слідувач не стоїть на тайлі цілі взаємодії.
// Мутації (кожна робить свій тест червоним, див. PR): `findPath` без стін; `restTile` без `avoid`; крок без руху.
import { describe, expect, it } from 'vitest';
import sceneSource from './scene.ts?raw';
import { FOLLOW_SPEED_FACTOR, centerOf, findPath, gridFromWalls, isSolid, restPoints, stepFollowers, tileOf, type Grid, type Pt, type Tile } from './follow';

const SPEED = Number(/export const SPEED = (\d+)/.exec(sceneSource)?.[1]);
const TILE = 32;
/** N з картки: найдальший слідувач (третій у ланцюжку) на кінці — не далі стількох тайлів від лідера. Заміряно ≤ 4,7 на трьох мапах; поріг із запасом. */
export const N_TILES = 5;
const DT = 1 / 60;

interface TiledMap { width: number; height: number; layers: { name: string; type: string; data?: number[]; objects?: { name: string; type?: string; class?: string; x: number; y: number }[] }[] }
const RAW = import.meta.glob<string>(['../../../public/maps/camp-lake.tmj', '../../../maps/camp-prologue.tmj', '../../../public/maps/trial/home-interior.tmj'], { query: '?raw', import: 'default', eager: true });
const MAPS = Object.keys(RAW).sort() as [string, ...string[]];

function load(rel: string): { grid: Grid; spawn: Pt; spots: Pt[] } {
  const m = JSON.parse(RAW[rel] ?? '') as TiledMap;
  const walls = m.layers.find((l) => l.name === 'walls')?.data ?? [];
  const objs = m.layers.find((l) => l.name === 'objects')?.objects ?? [];
  const kind = (o: (typeof objs)[number]): string => String(o.type || o.class || '');
  const spawn = objs.find((o) => kind(o) === 'spawn');
  if (!spawn) throw new Error(`${rel}: no spawn`);
  return { grid: gridFromWalls(m.width, m.height, TILE, walls), spawn: { x: spawn.x, y: spawn.y }, spots: objs.filter((o) => ['trigger', 'npc'].includes(kind(o))).map((o) => ({ x: o.x, y: o.y })) };
}

const reachable = (g: Grid, from: Tile): Tile[] => {
  const out: Tile[] = [];
  for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) if (!isSolid(g, { c, r }) && findPath(g, from, { c, r })) out.push({ c, r });
  return out;
};

/** Маршрут: щоразу до найдальшого (за шляхом) досяжного тайла — довгі переходи, багато поворотів і обходів стін. */
function route(g: Grid, from: Tile, legs: number): Tile[] {
  const out: Tile[] = [];
  let at = from;
  const all = reachable(g, from);
  for (let i = 0; i < legs; i++) {
    let best = at; let bestLen = -1;
    for (const t of all) { const len = findPath(g, at, t)?.length ?? 0; if (len > bestLen && !out.some((o) => o.c === t.c && o.r === t.r)) { best = t; bestLen = len; } }
    out.push(best); at = best;
  }
  return out;
}

/** Лідер іде по центрах тайлів шляху зі швидкістю SPEED. Повертає, чи дійшов; кожен кадр кличе `tick`. */
function walk(g: Grid, hero: Pt, to: Tile, tick: () => void, frames: { left: number }): void {
  const path = findPath(g, tileOf(g, hero), to) ?? [];
  for (const t of path.slice(1)) {
    const c = centerOf(g, t);
    while (frames.left > 0 && Math.hypot(c.x - hero.x, c.y - hero.y) > 0.01) {
      const d = Math.hypot(c.x - hero.x, c.y - hero.y);
      const k = Math.min(1, (SPEED * DT) / d);
      hero.x += (c.x - hero.x) * k; hero.y += (c.y - hero.y) * k;
      frames.left--; tick();
    }
  }
}

it('усі три мапи завантажено (порожній glob не має тихо пройти)', () => { expect(MAPS).toHaveLength(3); });

for (const rel of MAPS) {
  describe(`ланцюжок із 3 слідувачів: ${rel.split('/').pop()}`, () => {
    const { grid, spawn, spots } = load(rel);
    // Лідер стартує з центру тайла появи; ланцюжок — на місцях стоянки, як у сцені.
    const run = (): { hero: Pt; chain: Pt[]; inWall: number; atSpot: number } => {
      const hero = centerOf(grid, tileOf(grid, spawn));
      const chain = restPoints(grid, hero, 3, spots);
      const state = { inWall: 0, atSpot: 0 };
      const tick = (): void => {
        stepFollowers(grid, hero, chain, DT, SPEED * FOLLOW_SPEED_FACTOR, spots);
        for (const f of chain) if (isSolid(grid, tileOf(grid, f))) state.inWall++;
      };
      const frames = { left: 60 * 60 };   // 60 с
      for (const t of route(grid, tileOf(grid, hero), 12)) { if (frames.left > 0) walk(grid, hero, t, tick, frames); }
      for (let i = 0; i < 180; i++) tick();   // лідер став: 3 с на наздоганяння
      return { hero, chain, ...state };
    };

    it('жоден слідувач жодного кроку не стоїть у стіні (обхід стін)', () => {
      expect(run().inWall).toBe(0);
    });

    it(`на кінці кожен не далі ${N_TILES} тайлів від лідера і ланцюжок справді ішов (не лишився на місці)`, () => {
      const { hero, chain } = run();
      const start = restPoints(grid, centerOf(grid, tileOf(grid, spawn)), 3, spots);
      for (const f of chain) expect(Math.hypot(f.x - hero.x, f.y - hero.y) / TILE).toBeLessThanOrEqual(N_TILES);
      expect(chain.some((f, i) => Math.hypot(f.x - (start[i]?.x ?? 0), f.y - (start[i]?.y ?? 0)) > TILE), 'слідувачі не зрушили з місця — тест нічого не доводить').toBe(true);
    });

    it('після зупинки жоден слідувач не стоїть на цілі взаємодії', () => {
      // Лідер по черзі стає на тайл ПЕРЕД кожною ціллю мапи (як гравець, що підійшов у зону дії): найближчий вільний тайл
      // для слідувача — сама ціль, і саме на неї він не має ставати.
      const hero = centerOf(grid, tileOf(grid, spawn));
      const chain = restPoints(grid, hero, 3, spots);
      const tick = (): void => stepFollowers(grid, hero, chain, DT, SPEED * FOLLOW_SPEED_FACTOR, spots);
      for (const s of spots) {
        const target = tileOf(grid, s);
        const way = findPath(grid, tileOf(grid, hero), target);
        const before = way?.[way.length - 2];
        if (!before) continue;
        walk(grid, hero, before, tick, { left: 60 * 60 });
        for (let i = 0; i < 180; i++) tick();
        for (const f of chain) expect(tileOf(grid, f), `слідувач на цілі (${s.x},${s.y})`).not.toEqual(target);
      }
    });
  });
}
