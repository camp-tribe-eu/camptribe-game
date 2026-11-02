// GAME-209 · ящик, який можна штовхати: чиста логіка (без Phaser) кроку по клітинках і сторож «ящик ніколи не замкне прохід».
// Ящик стоїть на клітинці мапи й зсувається на ОДНУ клітинку за дію гравця. Штовхати можна лише так, щоб після зсуву від ніг героя
// були досяжні пішки точка появи й КОЖЕН об'єкт мапи (ціль справи, NPC, позначка, якір): інакше ящик у дверях чи вузькому проході
// назавжди відрізав би частину табору (softlock). Заборонений зсув відхиляється — ящик стоїть, гра йде далі (покарань нема, OD-022).
// Стан показу: ядро й сейв про ящик не знають — він живе тільки в сцені й повертається на місце, коли мапу завантажено знову.

export interface Tile { readonly c: number; readonly r: number }
export type PushDir = 'up' | 'down' | 'left' | 'right';
const STEP: Readonly<Record<PushDir, Tile>> = { up: { c: 0, r: -1 }, down: { c: 0, r: 1 }, left: { c: -1, r: 0 }, right: { c: 1, r: 0 } };
export const PUSH_DIRS: readonly PushDir[] = ['up', 'left', 'down', 'right'];

/** Справжній розмір ящика (OD-026: ≈ 28 px/м) і його ширина на екрані: ≈ 0,9 м → 25 px у клітинці 32 px. Гра малює ящик кодом, нового PNG немає. */
export const CRATE_M = 0.9;
export const CRATE_PX = 25;

export interface CrateWorld {
  readonly cols: number;
  readonly rows: number;
  /** Стіни: solid[r * cols + c] (шар `walls` мапи). */
  readonly solid: readonly boolean[];
  /** Точка появи героя. */
  readonly spawn: Tile;
  /** Клітинки об'єктів мапи (цілі, NPC, позначки, якорі): кожна має лишатись досяжною пішки (сама клітинка або сусідня, зона дії — 1,5 клітинки), і ящик на них не стає. */
  readonly spots: readonly Tile[];
}

const idx = (w: CrateWorld, t: Tile): number => t.r * w.cols + t.c;
const inside = (w: CrateWorld, t: Tile): boolean => t.c >= 0 && t.r >= 0 && t.c < w.cols && t.r < w.rows;
const same = (a: Tile, b: Tile): boolean => a.c === b.c && a.r === b.r;
const add = (t: Tile, d: Tile): Tile => ({ c: t.c + d.c, r: t.r + d.r });
export const wallAt = (w: CrateWorld, t: Tile): boolean => !inside(w, t) || w.solid[idx(w, t)] === true;

/** Клітинки, до яких можна дійти пішки від `from` у обхід стін і ящика (4 напрямки, як ходять слідувачі). */
export function reachable(w: CrateWorld, from: Tile, crate: Tile | null): Set<number> {
  const seen = new Set<number>();
  if (wallAt(w, from) || (crate && same(from, crate))) return seen;
  seen.add(idx(w, from));
  const queue: Tile[] = [from];
  for (let head = 0; head < queue.length; head++) {
    const t = queue[head] as Tile;
    for (const d of PUSH_DIRS) {
      const n = add(t, STEP[d]);
      if (wallAt(w, n) || (crate && same(n, crate)) || seen.has(idx(w, n))) continue;
      seen.add(idx(w, n));
      queue.push(n);
    }
  }
  return seen;
}

const AROUND: readonly Tile[] = [{ c: 0, r: 0 }, ...PUSH_DIRS.map((d) => STEP[d])];
/** Об'єкт досяжний, коли від ніг героя можна дійти до його клітинки чи сусідньої (стояти можна й поруч — зона дії 1,5 клітинки). */
const spotReachable = (w: CrateWorld, seen: ReadonlySet<number>, s: Tile): boolean => AROUND.some((a) => { const t = add(s, a); return inside(w, t) && seen.has(idx(w, t)); });

/** Що відрізано від `from`: порожній список — усе досяжне (точка появи й усі об'єкти). */
export function cutOff(w: CrateWorld, from: Tile, crate: Tile): Tile[] {
  const seen = reachable(w, from, crate);
  const out: Tile[] = [];
  if (!seen.has(idx(w, w.spawn))) out.push(w.spawn);
  for (const s of w.spots) if (!spotReachable(w, seen, s)) out.push(s);
  return out;
}

/** Сторож: чи після зсуву (герой стоїть на `from`, ящик на `crate`) усе в таборі лишається досяжним. */
export type PushGuard = (w: CrateWorld, from: Tile, crate: Tile) => boolean;
export const softlockGuard: PushGuard = (w, from, crate) => cutOff(w, from, crate).length === 0;

export type PushRefusal = 'wall' | 'spot' | 'softlock';
export type PushResult = { readonly ok: true; readonly crate: Tile } | { readonly ok: false; readonly reason: PushRefusal };

/**
 * Зсув ящика на одну клітинку в напрямку `dir`; герой стоїть на `player` (по той бік ящика). Відмова — ящик не рухається:
 * стіна/край мапи, клітинка об'єкта, або (сторож) після зсуву щось відрізано. `guard` підміняють лише тести мутацій (закон 1).
 */
export function pushCrate(w: CrateWorld, crate: Tile, player: Tile, dir: PushDir, guard: PushGuard = softlockGuard): PushResult {
  const to = add(crate, STEP[dir]);
  if (wallAt(w, to)) return { ok: false, reason: 'wall' };
  if (w.spots.some((s) => same(s, to)) || same(to, w.spawn)) return { ok: false, reason: 'spot' };
  if (!guard(w, player, to)) return { ok: false, reason: 'softlock' };
  return { ok: true, crate: to };
}

/** Куди штовхне герой, що стоїть у `from` (px), ящик у `crate` (px): вісь із більшим зсувом, у бік від героя. null — герой стоїть майже в ящику (напрямку нема). */
export function pushDirection(from: { x: number; y: number }, crate: { x: number; y: number }): PushDir | null {
  const dx = crate.x - from.x; const dy = crate.y - from.y;
  if (Math.hypot(dx, dy) < 1) return null;
  return Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
}

/** Клітинка, з якої герой штовхає ящик у `dir`: по той бік від напрямку зсуву. */
export const standTile = (crate: Tile, dir: PushDir): Tile => add(crate, { c: -STEP[dir].c, r: -STEP[dir].r });

/** Клітинка (за пікселем) на сітці `tile` px. */
export const tileAtPx = (p: { x: number; y: number }, tile: number): Tile => ({ c: Math.floor(p.x / tile), r: Math.floor(p.y / tile) });

export interface Exploration { readonly states: Tile[]; readonly refused: number; readonly accepted: number; readonly broken: { crate: Tile; cut: Tile[] }[] }

/**
 * Усі розташування ящика, до яких можна дійти законними зсувами від `start` (герой стоїть у будь-якій досяжній клітинці по той бік). Для кожного
 * станy перевіряється головна властивість: нічого не відрізано. Порожній `broken` — доведено для всієї мапи, а не для кількох сценаріїв.
 */
export function explorePushes(w: CrateWorld, start: Tile, guard: PushGuard = softlockGuard): Exploration {
  const states: Tile[] = [start];
  const seen = new Set<number>([idx(w, start)]);
  const broken: Exploration['broken'] = [];
  let refused = 0; let accepted = 0;
  for (let head = 0; head < states.length; head++) {
    const crate = states[head] as Tile;
    const free = reachable(w, w.spawn, crate);
    const cut = cutOff(w, w.spawn, crate);
    if (cut.length > 0) broken.push({ crate, cut });
    for (const dir of PUSH_DIRS) {
      const stand = standTile(crate, dir);
      if (!inside(w, stand) || !free.has(idx(w, stand))) continue;   // героєві нема звідки штовхати
      const r = pushCrate(w, crate, stand, dir, guard);
      if (!r.ok) { refused++; continue; }
      accepted++;
      if (seen.has(idx(w, r.crate))) continue;
      seen.add(idx(w, r.crate));
      states.push(r.crate);
    }
  }
  return { states, refused, accepted, broken };
}

/** Світ для сцени: сітка стін, точка появи й клітинки всіх об'єктів мапи (пікселі → клітинки). */
export function crateWorld(cols: number, rows: number, tile: number, wallsData: readonly number[], spawn: { x: number; y: number }, spotPx: readonly { x: number; y: number }[]): CrateWorld {
  return {
    cols, rows,
    solid: Array.from({ length: cols * rows }, (_, i) => (wallsData[i] ?? 0) > 0),
    spawn: tileAtPx(spawn, tile),
    spots: spotPx.map((p) => tileAtPx(p, tile)),
  };
}
