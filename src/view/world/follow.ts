// GAME-112 · родина йде за героєм ланцюжком. Це ЛИШЕ відображення: ні стан ядра, ні сейв, ні детермінізм не зачеплені
// (позиції слідувачів не зберігаються й не впливають на гру; гравець керує одним героєм — слідувачі безхазяйні).
// Чиста логіка без Phaser: сітка тайлів із шару `walls` мапи, пошук шляху в обхід стін (BFS, 4 напрямки — без зрізання кутів),
// «місце стоянки» біля того, за ким ідуть, і крок руху. Сцена лише малює те, що тут пораховано; тест ганяє це на трьох мапах.

export interface Pt { x: number; y: number }
export interface Tile { readonly c: number; readonly r: number }

/** Сітка проходимості: solid[r * cols + c] — стіна (будь-який непорожній тайл шару `walls`, як у сцені). */
export interface Grid { readonly cols: number; readonly rows: number; readonly tile: number; readonly solid: readonly boolean[] }

export function gridFromWalls(cols: number, rows: number, tile: number, wallsData: readonly number[]): Grid {
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
export function stepFollowers(g: Grid, leader: Pt, chain: Pt[], dt: number, speed: number, spots: readonly Pt[]): void {
  const avoid = avoidSet(g, spots);
  const taken = new Set<number>([idx(g, tileOf(g, leader))]);
  let ahead: Pt = leader;
  for (const f of chain) {
    const own = tileOf(g, f);
    const target = tileOf(g, ahead);
    const route = findPath(g, own, target);
    // Стоїть, якщо вже поруч (≤ GAP_STEPS кроків) і не на зайнятому чи «цільовому» тайлі; інакше — до місця стоянки біля цілі.
    const settled = route !== null && route.length - 1 <= GAP_STEPS && !taken.has(idx(g, own)) && !avoid.has(idx(g, own));
    if (!settled) {
      const goal = restTile(g, target, taken, avoid);
      const way = findPath(g, own, goal);
      // Наступна точка — центр наступного тайла шляху (на місці — центр власного): відрізок до неї лежить у двох сусідніх вільних тайлах.
      const next = way && way.length > 1 ? way[1] : way?.[0];
      if (next) {
        const to = centerOf(g, next);
        const dx = to.x - f.x;
        const dy = to.y - f.y;
        const d = Math.hypot(dx, dy);
        const k = d <= speed * dt || d === 0 ? 1 : (speed * dt) / d;
        f.x += dx * k;
        f.y += dy * k;
      }
    }
    taken.add(idx(g, tileOf(g, f)));
    ahead = f;
  }
}
