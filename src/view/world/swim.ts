// GAME-227 · купання в озері: ЧИСТА логіка без Phaser (вигляд — swim-rig.ts). Той самий принцип, що в fx-live.ts: функції часу сцени, зерна й стану кадру,
// без таймерів і tween (сторож no-realtime), без випадкових чисел — той самий час → та сама картинка.
//   * стан клітинки (суша / мілина / глибина) — з тайлів мапи: вода = тайли ставка шару `ground`, зона пляжу = якір `swim.beach` у camp-lake.tmj;
//   * глибина клітинки = відстань (у клітинках) до найближчої суші; до SHALLOW_MAX — мілина (вода перекриває ноги), далі — глибина (плавання);
//   * плавання: швидкість −40 %, гойдання 0–2 px, цикл із 4 кадрів, кола навколо плечей, 2–4 краплі на початку й на повороті;
//   * після виходу ≈ 3 с мокрі краплі на кроках (+ мокрий крок звуком).
// Нічого тут не знає про сюжет: купання — побічне (content/side.ts), покарань нема, а Мія й дрібні тварини до води не підходять взагалі (petOnWater).
import { CAP, hash01, ripples, splashDrops } from './fx-live';

export type SwimState = 'land' | 'shallow' | 'swim';

/** Тайли ставка в terrain_atlas (глобальні номери шару `ground`): кадри 3×3 берега (кути, краї) і середина. Звірено з мапою в swim.test.ts. */
export const WATER_GIDS: ReadonlySet<number> = new Set([359, 360, 361, 391, 392, 393, 423, 424, 425]);
/** Якір, що позначає пляж: центр верхньої лівої клітинки води зони; властивості `cols` і `rows` — розмір зони в клітинках. */
export const SWIM_BEACH = 'swim.beach';
/** Мілина — до цієї відстані від суші (клітинок) включно; далі — глибина. */
export const SHALLOW_MAX = 2;
/** Швидкість у глибокій воді: −40 % від ходьби. */
export const SWIM_SPEED = 0.6;

export interface SwimRegion { readonly c0: number; readonly r0: number; readonly c1: number; readonly r1: number }
export interface SwimGrid {
  readonly cols: number; readonly rows: number; readonly region: SwimRegion | null;
  /** Клітинка води за шаром `ground`. */
  readonly water: readonly boolean[];
  /** Відстань у клітинках до найближчої клітинки не-води (0 — суша). */
  readonly depth: readonly number[];
}

/** Зона пляжу з об'єктів мапи (Tiled): якір `swim.beach` у піксельних координатах центру клітинки + властивості cols/rows. Немає якоря — зони немає. */
export function swimRegionOf(objects: readonly { name?: string; x?: number; y?: number; properties?: readonly { name: string; value: unknown }[] }[], tile: number): SwimRegion | null {
  const o = objects.find((x) => x.name === SWIM_BEACH);
  if (!o) return null;
  const prop = (n: string): number => Number(o.properties?.find((p) => p.name === n)?.value ?? 0);
  const c0 = Math.floor((o.x ?? 0) / tile); const r0 = Math.floor((o.y ?? 0) / tile);
  const cols = prop('cols'); const rows = prop('rows');
  if (!(cols >= 1 && rows >= 1)) return null;
  return { c0, r0, c1: c0 + cols - 1, r1: r0 + rows - 1 };
}

/** Сітка плавання з тайлів шару `ground` (рядки зліва направо, зверху вниз). Глибина — обхід у ширину від суші по воді. */
export function swimGridOf(cols: number, rows: number, ground: readonly number[], region: SwimRegion | null): SwimGrid {
  const water = Array.from({ length: cols * rows }, (_, i) => WATER_GIDS.has(ground[i] ?? 0));
  const depth: number[] = water.map((w) => (w ? -1 : 0));
  const queue: number[] = [];
  depth.forEach((d, i) => { if (d === 0) queue.push(i); });
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head] as number; const c = i % cols; const r = Math.floor(i / cols);
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nc = c + dc; const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const n = nr * cols + nc;
      if (depth[n] !== -1) continue;
      depth[n] = (depth[i] as number) + 1;
      queue.push(n);
    }
  }
  return { cols, rows, region, water, depth: depth.map((d) => (d < 0 ? 99 : d)) };
}

const inRegion = (g: SwimGrid, c: number, r: number): boolean => g.region !== null && c >= g.region.c0 && c <= g.region.c1 && r >= g.region.r0 && r <= g.region.r1;

/** Стан клітинки: поза зоною пляжу чи не вода — суша; вода біля берега — мілина; далі — глибина (плавання). */
export function cellState(g: SwimGrid, c: number, r: number): SwimState {
  if (c < 0 || r < 0 || c >= g.cols || r >= g.rows || !inRegion(g, c, r)) return 'land';
  const i = r * g.cols + c;
  if (!g.water[i]) return 'land';
  return (g.depth[i] as number) <= SHALLOW_MAX ? 'shallow' : 'swim';
}

/** Стан під ногами (точка світу, px). */
export const stateAt = (g: SwimGrid, x: number, y: number, tile: number): SwimState => cellState(g, Math.floor(x / tile), Math.floor(y / tile));

/** Індекси клітинок зони, що вода (мілина й глибина). */
export function waterCells(g: SwimGrid): number[] {
  const out: number[] = [];
  for (let i = 0; i < g.cols * g.rows; i++) if (cellState(g, i % g.cols, Math.floor(i / g.cols)) !== 'land') out.push(i);
  return out;
}

/** Проходимість для слідувачів, мешканців і ящика: стіни мапи + вся вода пляжу (герой пливе сам, інші лишаються на березі). */
export function withWater(walls: readonly number[], g: SwimGrid): number[] {
  const out = walls.slice();
  for (const i of waterCells(g)) out[i] = out[i] || 1;
  return out;
}

/** Чи стоїть істота на воді: Мія й тварини — ніколи (перевіряє swim.test.ts за всіма їхніми точками, а сцена — щокадру в зонді). */
export const petOnWater = (g: SwimGrid, x: number, y: number, tile: number): boolean => stateAt(g, x, y, tile) !== 'land';

/** Множник швидкості героя за станом. Глибина — −40 %; мілина й суша — звичайна. */
export const speedFactor = (s: SwimState): number => (s === 'swim' ? SWIM_SPEED : 1);

// ---------- вигляд героя у воді ----------
/** Скільки верхніх рядків кадру 64 px лишається видно: суша — весь кадр; мілина — вода перекриває ноги (по коліна); глибина — голова й плечі. */
export const VISIBLE_ROWS: Readonly<Record<SwimState, number>> = { land: 64, shallow: 46, swim: 34 };
/** Лінія води над ногами героя, px (ноги — 0,9 висоти кадру, ≈ 57,6). */
export const WATERLINE_ABOVE_FEET: Readonly<Record<SwimState, number>> = { land: 0, shallow: 11, swim: 23 };

/** Цикл плавання з 4 кадрів: період кадру 160 мс; гойдання 0–2 px (на скільки опущено, ціле). */
export const SWIM_PHASE_MS = 160;
export const SWIM_BOB = [0, 1, 2, 1] as const;
export const swimPhase = (timeMs: number): number => Math.floor(Math.max(0, timeMs) / SWIM_PHASE_MS) % 4;
export const swimBob = (timeMs: number): number => SWIM_BOB[swimPhase(timeMs)] as number;
/** Стовпець листа ходьби для гребка: у русі — 1, 3, 5, 7 по колу (руки на рівні плечей), на місці — «стоїть». */
export const STROKE_COLS = [1, 3, 5, 7] as const;
export const swimCol = (timeMs: number, moving: boolean): number => (moving ? (STROKE_COLS[swimPhase(timeMs)] as number) : 0);

/** Кола навколо плечей: у русі вужчі й виразніші, на місці — ширші й тихіші. Межа кіл — CAP.ripples (fx-live). */
export function swimRings(timeMs: number, moving: boolean): { r: number; alpha: number }[] {
  return moving ? ripples(timeMs, 15, 900) : ripples(timeMs, 22, 1700).map((k) => ({ r: k.r, alpha: k.alpha * 0.6 }));
}

/** Краплі «старт чи поворот»: вилітають 2–4 штуки й гаснуть за DROP_MS. */
export const DROP_MS = 200;
export interface Burst { readonly age: number; readonly seed: number; readonly n: number }
export const dropCount = (seed: number): number => 2 + Math.floor(hash01(seed, 227) * 3);
export const newBurst = (seed: number): Burst => ({ age: 0, seed, n: dropCount(seed) });
export const stepBurst = (b: Burst | null, dtMs: number): Burst | null => (b && b.age + Math.max(0, dtMs) < DROP_MS ? { ...b, age: b.age + Math.max(0, dtMs) } : null);
export const burstDrops = (b: Burst | null): { dx: number; dy: number; alpha: number }[] => (b ? splashDrops(b.age / DROP_MS, b.seed, b.n) : []);

/** Звуки купання: «enter» — плюх на вході, «swim» — гребок (раз на STROKE_MS руху в глибині), «exit» — вихід, «wet» — мокрий крок. */
export type SwimSound = 'enter' | 'swim' | 'exit' | 'wet';
export const STROKE_MS = 700;

/** Перехід між станами: з суші у воду — «enter», з води на сушу — «exit». Мілина ↔ глибина окремого звуку не має (гребок і так звучить). */
export function transition(prev: SwimState, next: SwimState): 'enter' | 'exit' | null {
  if (prev === 'land' && next !== 'land') return 'enter';
  if (prev !== 'land' && next === 'land') return 'exit';
  return null;
}

// ---------- після виходу ----------
/** Мокрі сліди: ≈ 3 с після виходу, крапля на кожні WET_STEP_PX пройденого, кожна живе WET_MARK_MS. */
export const WET_MS = 3000;
export const WET_STEP_PX = 14;
export const WET_MARK_MS = 1400;
export interface WetMark { readonly x: number; readonly y: number; readonly age: number }
export interface WetState { readonly left: number; readonly walked: number; readonly marks: readonly WetMark[]; readonly steps: number }
export const WET_IDLE: WetState = { left: 0, walked: 0, marks: [], steps: 0 };

/** Крок: `landed` — цього кадру вийшов на сушу (відлік 3 с з початку); у русі на суші лишає краплю на кожні WET_STEP_PX. `stepped` — з'явилась нова крапля (мокрий крок). */
export function stepWet(s: WetState, f: { x: number; y: number; movedPx: number; dtMs: number; landed: boolean; onLand: boolean }): { state: WetState; stepped: boolean } {
  const dt = Math.max(0, f.dtMs);
  let left = f.landed ? WET_MS : Math.max(0, s.left - dt);
  if (!f.onLand) left = 0;   // знову у воді — підсихати нема коли
  let marks = s.marks.map((m) => ({ ...m, age: m.age + dt })).filter((m) => m.age < WET_MARK_MS);
  let walked = left > 0 && f.movedPx > 0 ? s.walked + f.movedPx : 0;
  let steps = s.steps;
  let stepped = false;
  if (walked >= WET_STEP_PX) {
    walked -= WET_STEP_PX; steps++; stepped = true;
    marks = [...marks, { x: f.x + (hash01(steps, 227) - 0.5) * 6, y: f.y + 1, age: 0 }].slice(-CAP.drops);
  }
  return { state: { left, walked, marks, steps }, stepped };
}

/** Як малювати мокру краплю віку `age`: спершу темна пляма, далі підсихає (прозорість спадає до нуля). */
export const wetLook = (m: WetMark): { rx: number; ry: number; alpha: number } => { const k = Math.min(1, m.age / WET_MARK_MS); return { rx: 3 - k, ry: 1.5 - k * 0.5, alpha: 0.55 * (1 - k) }; };
