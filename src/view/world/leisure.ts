// GAME-173 · родина живе, а не марширує. Лише відображення: ні ядро, ні сейв, ні детермінізм не зачеплені (позиції не зберігаються,
// випадковості нема — вибір точок повністю визначається мапою, героєм і порядком родини).
// Поки герой стоїть > IDLE_AFTER_S, кожен член родини іде до власної «точки дозвілля» (вогнище, берег, намет, лавка) і там стоїть зверненим
// до справи, трохи погойдуючись; щойно герой рушає — вертається у строй (follow.ts). Нової графіки нема: той самий спрайт, кадр «стоїть».
import { findPath, tileOf, type Grid, type Pt, type Tile } from './follow';

export type LeisureKind = 'campfire' | 'shore' | 'tent' | 'bench';
export type Facing = 'up' | 'left' | 'down' | 'right';
export interface LeisureSpot { readonly kind: LeisureKind; readonly c: number; readonly r: number; readonly face: Facing }

/** Скільки секунд герой мусить простояти (довше за 3 с «наздоганяння» строю в GAME-112), щоб родина розійшлася по справах. */
export const IDLE_AFTER_S = 4;
/** Точка дозвілля «поруч»: не далі стількох кроків шляху від героя (інакше член родини лишається у строю). */
export const MAX_LEISURE_STEPS = 14;
/** Не ближче стількох кроків від героя: на сусідньому тайлі член родини закривав би героя (і відчувався б «у спину»). */
export const MIN_LEISURE_STEPS = 2;
/** Штраф (кроків) за точку того ж виду, що вже зайнята іншим членом родини: родина розходиться по різних справах, а не тулиться до одного вогнища. */
const SAME_KIND_PENALTY = 3;

/**
 * Точки дозвілля за назвою мапи (тайли). Мапа кемпінгу їх не містить; коли вона отримає об'єкти типу `leisure`
 * (name `leisure.<вид>`, властивість `face`), вони мають перевагу над цим списком (див. `leisureFromObjects`) — GAME-172 додає їх без правок коду.
 */
export const LEISURE_BY_MAP: Readonly<Record<string, readonly LeisureSpot[]>> = {
  'camp-lake': [
    { kind: 'campfire', c: 2, r: 4, face: 'right' },
    { kind: 'campfire', c: 4, r: 4, face: 'left' },
    { kind: 'campfire', c: 3, r: 5, face: 'up' },
    { kind: 'shore', c: 8, r: 9, face: 'right' },
    { kind: 'tent', c: 6, r: 4, face: 'up' },
    { kind: 'bench', c: 8, r: 6, face: 'left' },
  ],
};

const KINDS: readonly LeisureKind[] = ['campfire', 'shore', 'tent', 'bench'];
const FACES: readonly Facing[] = ['up', 'left', 'down', 'right'];

/** Точки дозвілля з об'єктів мапи (`type: leisure`, name `leisure.<вид>[.n]`, властивість `face`); невідомий вид чи кут — об'єкт пропускається. */
export function leisureFromObjects(objects: readonly { name: string; type?: string; class?: string; x: number; y: number; properties?: readonly { name: string; value: unknown }[] }[], tile: number): LeisureSpot[] {
  const out: LeisureSpot[] = [];
  for (const o of objects) {
    if (String(o.type || o.class || '') !== 'leisure') continue;
    const kind = KINDS.find((k) => o.name.startsWith(`leisure.${k}`));
    const face = String(o.properties?.find((p) => p.name === 'face')?.value ?? 'down') as Facing;
    if (kind && FACES.includes(face)) out.push({ kind, c: Math.floor(o.x / tile), r: Math.floor(o.y / tile), face });
  }
  return out;
}

/**
 * Кожному з `n` членів родини — своя точка дозвілля або null (лишається у строю). Точки не збігаються; не на героєві, не на цілі взаємодії (`avoidTiles`),
 * не в стіні, і з ними можна дійти (шлях ≤ MAX_LEISURE_STEPS). Жадібно: найближча до героя, з штрафом за вид, що вже узято.
 */
export function assignLeisure(g: Grid, hero: Pt, n: number, spots: readonly LeisureSpot[], avoidTiles: ReadonlySet<number>): (LeisureSpot | null)[] {
  const heroTile = tileOf(g, hero);
  const reach = new Map<LeisureSpot, number>();
  for (const s of spots) {
    const t: Tile = { c: s.c, r: s.r };
    if (avoidTiles.has(t.r * g.cols + t.c) || (t.c === heroTile.c && t.r === heroTile.r)) continue;
    const way = findPath(g, heroTile, t);
    if (way && way.length - 1 >= MIN_LEISURE_STEPS && way.length - 1 <= MAX_LEISURE_STEPS) reach.set(s, way.length - 1);
  }
  const used = new Map<LeisureKind, number>();
  const out: (LeisureSpot | null)[] = [];
  for (let i = 0; i < n; i++) {
    let best: LeisureSpot | null = null;
    let bestCost = Infinity;
    for (const [s, steps] of reach) {
      const cost = steps + SAME_KIND_PENALTY * (used.get(s.kind) ?? 0);
      if (cost < bestCost) { best = s; bestCost = cost; }
    }
    if (best) { reach.delete(best); used.set(best.kind, (used.get(best.kind) ?? 0) + 1); }
    out.push(best);
  }
  return out;
}
