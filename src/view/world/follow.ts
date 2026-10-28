// GAME-112 · родина йде за героєм ланцюжком. Це ЛИШЕ відображення: ні стан ядра, ні сейв, ні детермінізм не зачеплені
// (позиції слідувачів не зберігаються й не впливають на гру; гравець керує одним героєм — слідувачі безхазяйні).
// Чиста логіка без Phaser: сітка тайлів із шару `walls` мапи, пошук шляху в обхід стін (BFS, 4 напрямки — без зрізання кутів),
// «місце стоянки» біля того, за ким ідуть, і крок руху. Сцена лише малює те, що тут пораховано; тест ганяє це на трьох мапах.

/** Швидкість героя, px/с — 4 тайли за секунду (як було при 16 px: 64 px/с). Одне число для сцени й для сторожа слідувачів. */
export const SPEED = 128;

export interface Pt { x: number; y: number }
export interface Tile { readonly c: number; readonly r: number }

/** Сітка проходимості: solid[r * cols + c] — стіна (будь-який непорожній тайл шару `walls`, як у сцені). */
export interface Grid { readonly cols: number; readonly rows: number; readonly tile: number; readonly solid: readonly boolean[] }

/** Межа розміру сітки: пошук шляху — BFS по всій мапі, кешований по парах тайлів. Більша мапа мусить упасти голосно, а не тихо просісти по fps. */
export const MAX_GRID_TILES = 4096;

export function gridFromWalls(cols: number, rows: number, tile: number, wallsData: readonly number[]): Grid {
  if (cols * rows > MAX_GRID_TILES) throw new Error(`follow: map ${cols}x${rows} exceeds ${MAX_GRID_TILES} tiles — rework the pathing (chunking) before using it`);
  return { cols, rows, tile, solid: Array.from({ length: cols * rows }, (_, i) => (wallsData[i] ?? 0) > 0) };
}

const idx = (g: Grid, t: Tile): number => t.r * g.cols + t.c;
const inside = (g: Grid, t: Tile): boolean => t.c >= 0 && t.r >= 0 && t.c < g.cols && t.r < g.rows;
export const isSolid = (g: Grid, t: Tile): boolean => !inside(g, t) || g.solid[idx(g, t)] === true;
export const tileOf = (g: Grid, p: Pt): Tile => ({ c: Math.floor(p.x / g.tile), r: Math.floor(p.y / g.tile) });
export const centerOf = (g: Grid, t: Tile): Pt => ({ x: (t.c + 0.5) * g.tile, y: (t.r + 0.5) * g.tile });
const STEPS: readonly Tile[] = [{ c: 0, r: -1 }, { c: -1, r: 0 }, { c: 0, r: 1 }, { c: 1, r: 0 }];

/** Найкоротший шлях по вільних тайлах (від `from` до `to` включно) у обхід стін; null — шляху немає. */
export function findPath(g: Grid, from: Tile, to: Tile): Tile[] | null {
  if (isSolid(g, from) || isSolid(g, to)) return null;
  const prev = new Map<number, number>([[idx(g, from), -1]]);
  const queue: Tile[] = [from];
  for (let head = 0; head < queue.length; head++) {
    const t = queue[head] as Tile;
    if (t.c === to.c && t.r === to.r) {
      const out: Tile[] = [];
      for (let i = idx(g, t); i >= 0; i = prev.get(i) ?? -1) out.unshift({ c: i % g.cols, r: Math.floor(i / g.cols) });
      return out;
    }
    for (const s of STEPS) {
      const n = { c: t.c + s.c, r: t.r + s.r };
      if (isSolid(g, n) || prev.has(idx(g, n))) continue;
      prev.set(idx(g, n), idx(g, t));
      queue.push(n);
    }
  }
  return null;
}

/** Слідувач стоїть не далі стількох кроків шляху від того, за ким іде, — далі він іде. */
export const GAP_STEPS = 2;
/** Слідувач ходить трохи швидше за героя, щоб наздоганяти на поворотах. */
export const FOLLOW_SPEED_FACTOR = 1.15;

/**
 * Куди стати біля `target`: найближчий (за кроками шляху) вільний тайл, що не зайнятий (`taken`) і не є цілью взаємодії (`avoid`).
 * Ціль взаємодії — тайл, на якому стоїть об'єкт мапи: слідувач на ньому закривав би його від погляду й тапа.
 */
function restTile(g: Grid, target: Tile, taken: ReadonlySet<number>, avoid: ReadonlySet<number>): Tile {
  const seen = new Set<number>([idx(g, target)]);
  const queue: Tile[] = [target];
  for (let head = 0; head < queue.length; head++) {
    const t = queue[head] as Tile;
    if (head > 0 && !taken.has(idx(g, t)) && !avoid.has(idx(g, t))) return t;
    for (const s of STEPS) {
      const n = { c: t.c + s.c, r: t.r + s.r };
      if (isSolid(g, n) || seen.has(idx(g, n))) continue;
      seen.add(idx(g, n));
      queue.push(n);
    }
  }
  return target;   // навколо немає жодного вільного тайла (мапа з однієї клітинки) — лишаємось на місці
}

// Кеші на сітку (сітка незмінна): шлях і місце стоянки залежать лише від тайлів, а не від кадру, тож на кадрах, де ніхто не змінив тайла,
// BFS не біжить зовсім. Пар тайлів не більше MAX_GRID_TILES², але реально — одиниці сотень (ходять лише по мапі героя).
const PATHS = new WeakMap<Grid, Map<number, Tile[] | null>>();
const RESTS = new WeakMap<Grid, Map<string, Tile>>();
const CACHE_CAP = 20_000;
const memo = <K, V>(store: WeakMap<Grid, Map<K, V>>, g: Grid): Map<K, V> => {
  let m = store.get(g);
  if (!m || m.size > CACHE_CAP) { m = new Map(); store.set(g, m); }
  return m;
};
function cachedPath(g: Grid, from: Tile, to: Tile): Tile[] | null {
  const m = memo(PATHS, g);
  const k = idx(g, from) * g.cols * g.rows + idx(g, to);
  if (m.has(k)) return m.get(k) ?? null;
  const p = findPath(g, from, to);
  m.set(k, p);
  return p;
}
function cachedRest(g: Grid, target: Tile, taken: ReadonlySet<number>, avoid: ReadonlySet<number>): Tile {
  const m = memo(RESTS, g);
  const k = `${idx(g, target)}|${[...taken].join(',')}|${[...avoid].join(',')}`;
  const hit = m.get(k);
  if (hit) return hit;
  const t = restTile(g, target, taken, avoid);
  m.set(k, t);
  return t;
}

/** Крок точки `f` уздовж шляху `way` (центр наступного тайла; на місці — центр власного): відрізок лежить у двох сусідніх вільних тайлах. */
export function moveToward(g: Grid, f: Pt, way: readonly Tile[] | null, dt: number, speed: number): void {
  const next = way && way.length > 1 ? way[1] : way?.[0];
  if (!next) return;
  const to = centerOf(g, next);
  const dx = to.x - f.x;
  const dy = to.y - f.y;
  const d = Math.hypot(dx, dy);
  const k = d <= speed * dt || d === 0 ? 1 : (speed * dt) / d;
  f.x += dx * k;
  f.y += dy * k;
}

/** Крок `f` до тайла `goal` найкоротшим шляхом у обхід стін (кешований). true — уже на цьому тайлі (далі плавно доходить до центру, без стрибка). */
export function stepTo(g: Grid, f: Pt, goal: Tile, dt: number, speed: number): boolean {
  const c = centerOf(g, goal);
  if (Math.hypot(c.x - f.x, c.y - f.y) < 0.5) return true;
  const own = tileOf(g, f);
  if (own.c === goal.c && own.r === goal.r) { moveToward(g, f, [goal], dt, speed); return true; }
  moveToward(g, f, cachedPath(g, own, goal), dt, speed);
  return false;
}

/** Слот у вільному строю (GAME-173): не позаду в одну лінію, а клином — по черзі ліворуч і праворуч від напрямку руху, на крок-два позаду. */
export function slotTile(g: Grid, leader: Tile, heading: Pt, i: number): Tile {
  const hx = Math.abs(heading.x) >= Math.abs(heading.y) ? Math.sign(heading.x) : 0;
  const hy = hx === 0 ? Math.sign(heading.y) : 0;
  if (hx === 0 && hy === 0) return leader;
  const side = i % 2 === 0 ? 1 : -1;
  const back = 1 + Math.floor(i / 2);
  const tries: Tile[] = [
    { c: leader.c - hx * back - hy * side, r: leader.r - hy * back + hx * side },
    { c: leader.c - hx * back, r: leader.r - hy * back },
  ];
  // Слот по той бік стіни (шлях до нього довший за «клин» на крок-два) не годиться: слідувач пішов би в обхід замість стати поруч.
  return tries.find((t) => !isSolid(g, t) && (cachedPath(g, leader, t)?.length ?? Infinity) - 1 <= 2 + back) ?? leader;
}

const avoidSet = (g: Grid, spots: readonly Pt[]): Set<number> => new Set(spots.map((s) => idx(g, tileOf(g, s))));

/** Початкові місця стоянки n слідувачів ланцюжка за лідером (поява на мапі). */
export function restPoints(g: Grid, leader: Pt, n: number, spots: readonly Pt[]): Pt[] {
  const avoid = avoidSet(g, spots);
  const taken = new Set<number>([idx(g, tileOf(g, leader))]);
  let target = tileOf(g, leader);
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    target = restTile(g, target, taken, avoid);
    taken.add(idx(g, target));
    out.push(centerOf(g, target));
  }
  return out;
}

/** Один крок: кожен слідувач іде за попереднім у ланцюжку (перший — за лідером). Змінює `chain` на місці. dt — секунди. */
export function stepFollowers(g: Grid, leader: Pt, chain: Pt[], dt: number, speed: number, spots: readonly Pt[], heading?: Pt): void {
  const avoid = avoidSet(g, spots);
  const taken = new Set<number>([idx(g, tileOf(g, leader))]);
  let ahead: Pt = leader;
  for (const [i, f] of chain.entries()) {
    const own = tileOf(g, f);
    // GAME-173: з напрямком руху — слот клином біля героя (вільний стрій); без нього — старий ланцюжок «за попереднім».
    const target = heading ? slotTile(g, tileOf(g, leader), heading, i) : tileOf(g, ahead);
    const route = cachedPath(g, own, target);
    // Стоїть, якщо вже поруч (≤ GAP_STEPS кроків) і не на зайнятому чи «цільовому» тайлі; інакше — до місця стоянки біля цілі.
    const settled = route !== null && route.length - 1 <= (heading ? 0 : GAP_STEPS) && !taken.has(idx(g, own)) && !avoid.has(idx(g, own));
    if (!settled) {
      // Вільний строй: стають саме на свій слот (restTile пропускає цілі тайл — він шукав би сусіда й повертав би до лінії героя).
      const goal = heading && !taken.has(idx(g, target)) && !avoid.has(idx(g, target)) ? target : cachedRest(g, target, taken, avoid);
      const way = cachedPath(g, own, goal);
      // Наступна точка — центр наступного тайла шляху (на місці — центр власного): відрізок до неї лежить у двох сусідніх вільних тайлах.
      moveToward(g, f, way, dt, speed);
    }
    taken.add(idx(g, tileOf(g, f)));
    ahead = f;
  }
}
