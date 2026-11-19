// GAME-333 · рутина «Вузли» (docs/DAY-DESIGN.md §5 №2): відтяжки тенту. У центрі тенту — кільця, навколо на землі — кілки.
// Кожне кільце з'єднують з одним кілком. Три правила, і третє — наш поворот:
//  1. Мотузки не перетинаються (перетин = тертя, і вночі в бурю мотузка луснула).
//  2. Натяг рівний: довжина кожної в смузі (закоротка тягне кілок, задовга провисає).
//  3. Вітер: два кільця з навітряного боку мусять мати найкоротші, тобто найміцніші, мотузки.
// Чиста логіка, жодного часу й Math.random. Рівні — малий набір, обраний насінням дня; кожен розв'язний (solve; доводить тест).
// Допомога (§5а, каркас): послаблення розширює смугу, а підказка показує перетини й довжини.

import { NORMAL, type Difficulty, type Outcome } from './minigame';

export interface Pt { readonly x: number; readonly y: number }
export interface KnotLevel {
  readonly rings: readonly Pt[];
  readonly pegs: readonly Pt[];
  /** Одиничний напрямок на навітряний бік (звідки дме). */
  readonly wind: Pt;
}
/** Поле 100×100, центр тенту — (50, 50). */
export const CENTER: Pt = { x: 50, y: 50 };
/** Смуга довжин мотузки: коротше — тягне кілок, довше — провисає. */
export const BAND = { min: 20, max: 33 } as const;
/** Скільки кілець з навітряного боку мають найміцніші мотузки. */
export const WINDWARD = 2;

export const LEVELS: readonly KnotLevel[] = [
  { rings: [{ x: 37, y: 41 }, { x: 59, y: 37 }, { x: 63, y: 59 }, { x: 41, y: 63 }], pegs: [{ x: 84, y: 38 }, { x: 83, y: 79 }, { x: 40, y: 85 }, { x: 17, y: 61 }, { x: 30, y: 23 }, { x: 55, y: 16 }], wind: { x: 0.71, y: 0.71 } },
  { rings: [{ x: 55, y: 65 }, { x: 37, y: 60 }, { x: 37, y: 41 }, { x: 55, y: 35 }, { x: 66, y: 50 }], pegs: [{ x: 84, y: 50 }, { x: 75, y: 76 }, { x: 41, y: 87 }, { x: 20, y: 65 }, { x: 17, y: 30 }, { x: 35, y: 18 }, { x: 72, y: 20 }], wind: { x: 0, y: -1 } },
  { rings: [{ x: 59, y: 37 }, { x: 66, y: 51 }, { x: 57, y: 64 }, { x: 41, y: 63 }, { x: 34, y: 49 }, { x: 43, y: 36 }], pegs: [{ x: 16, y: 45 }, { x: 26, y: 13 }, { x: 54, y: 11 }, { x: 89, y: 30 }, { x: 84, y: 55 }, { x: 71, y: 85 }, { x: 43, y: 84 }, { x: 10, y: 70 }], wind: { x: 0, y: 1 } },
];

const mirror = (l: KnotLevel): KnotLevel => ({ rings: l.rings.map((p) => ({ x: 100 - p.x, y: p.y })), pegs: l.pegs.map((p) => ({ x: 100 - p.x, y: p.y })), wind: { x: -l.wind.x, y: l.wind.y } });
/** Рівень дня: з малого набору за насінням, дзеркально через раз (усі розв'язні — дзеркало розв'язності не міняє). */
export const levelOf = (seed: number): KnotLevel => {
  const s = Math.abs(Math.trunc(seed));
  const l = LEVELS[s % LEVELS.length] as KnotLevel;
  return Math.floor(s / LEVELS.length) % 2 === 1 ? mirror(l) : l;
};

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);
const turn = (a: Pt, b: Pt, c: Pt): number => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
/** Чи перетинаються відрізки ab і cd (власне перетин, дотик кінцями не рахується). */
export const crosses = (a: Pt, b: Pt, c: Pt, d: Pt): boolean => turn(a, b, c) * turn(a, b, d) < 0 && turn(c, d, a) * turn(c, d, b) < 0;

/** Смуга, послаблена каркасом: ширшає навколо середини. */
export function bandFor(d: Difficulty = NORMAL): { min: number; max: number } {
  const mid = (BAND.min + BAND.max) / 2;
  const half = ((BAND.max - BAND.min) / 2) * d.bandScale;
  return { min: mid - half, max: mid + half };
}
export type Tension = 'short' | 'ok' | 'long';
export function tensionOf(len: number, d: Difficulty = NORMAL): Tension {
  const b = bandFor(d);
  return len < b.min ? 'short' : len > b.max ? 'long' : 'ok';
}

/** Кільця навітряного боку: два з найбільшою проєкцією на напрямок вітру. */
export function windward(l: KnotLevel): readonly number[] {
  return l.rings.map((r, i) => ({ i, k: (r.x - CENTER.x) * l.wind.x + (r.y - CENTER.y) * l.wind.y })).sort((a, b) => b.k - a.k).slice(0, WINDWARD).map((x) => x.i);
}

export interface KnotState {
  readonly seed: number;
  /** Кілок кожного кільця; -1 — кільце вільне. */
  readonly links: readonly number[];
  /** Вибране кільце (перший дотик). */
  readonly sel: number | null;
}
export type KnotEvent = 'none' | 'select' | 'link' | 'undo';
export const startKnots = (seed: number): KnotState => ({ seed, links: levelOf(seed).rings.map(() => -1), sel: null });

/** Дотик по кільцю: вільне — вибрати (повторно — зняти вибір); з'єднане — зняти мотузку (undo). */
export function tapRing(s: KnotState, i: number): { state: KnotState; event: KnotEvent } {
  if (i < 0 || i >= s.links.length) return { state: s, event: 'none' };
  if ((s.links[i] ?? -1) >= 0) return { state: { ...s, links: s.links.map((p, k) => (k === i ? -1 : p)), sel: null }, event: 'undo' };
  return { state: { ...s, sel: s.sel === i ? null : i }, event: 'select' };
}
/** Дотик по кілку: вибране кільце лягає на вільний кілок. Без вибору або на зайнятий кілок — нічого. */
export function tapPeg(s: KnotState, j: number): { state: KnotState; event: KnotEvent } {
  if (s.sel === null || j < 0 || j >= levelOf(s.seed).pegs.length || s.links.includes(j)) return { state: s, event: 'none' };
  return { state: { ...s, links: s.links.map((p, k) => (k === s.sel ? j : p)), sel: null }, event: 'link' };
}

const seg = (l: KnotLevel, links: readonly number[], i: number): [Pt, Pt] | null => {
  const j = links[i] ?? -1;
  const a = l.rings[i]; const b = l.pegs[j];
  return j >= 0 && a !== undefined && b !== undefined ? [a, b] : null;
};
/** Довжина мотузки кільця (null — кільце вільне). */
export const lineLen = (l: KnotLevel, links: readonly number[], i: number): number | null => { const s = seg(l, links, i); return s === null ? null : dist(s[0], s[1]); };

/** Пари кілець, чиї мотузки перетинаються. */
export function crossingPairs(l: KnotLevel, links: readonly number[]): readonly (readonly [number, number])[] {
  const out: [number, number][] = [];
  for (let i = 0; i < links.length; i++) for (let k = i + 1; k < links.length; k++) {
    const a = seg(l, links, i); const b = seg(l, links, k);
    if (a && b && crosses(a[0], a[1], b[0], b[1])) out.push([i, k]);
  }
  return out;
}
/** Вітер: навітряні мотузки не довші за решту (тобто вони найкоротші, найміцніші). Не зі всіх кілець з'єднано — правило не судить. */
export function windOk(l: KnotLevel, links: readonly number[]): boolean {
  const lens = l.rings.map((_, i) => lineLen(l, links, i));
  if (lens.some((x) => x === null)) return true;
  const w = windward(l);
  const strong = Math.max(...w.map((i) => lens[i] as number));
  const rest = lens.filter((_, i) => !w.includes(i)).map((x) => x as number);
  return rest.length === 0 || strong <= Math.min(...rest);
}

export interface Faults { readonly open: number; readonly crossings: number; readonly tension: number; readonly wind: boolean }
export function faults(s: KnotState, d: Difficulty = NORMAL): Faults {
  const l = levelOf(s.seed);
  const lens = l.rings.map((_, i) => lineLen(l, s.links, i));
  return {
    open: lens.filter((x) => x === null).length,
    crossings: crossingPairs(l, s.links).length,
    tension: lens.filter((x) => x !== null && tensionOf(x, d) !== 'ok').length,
    wind: windOk(l, s.links),
  };
}
const total = (f: Faults): number => f.open + f.crossings + f.tension + (f.wind ? 0 : 1);
/** Добре: усе за правилами. Нормально: нічого не перетинається, не більше двох огріхів натягу чи вітру (тент провис, але тримає). Сяк-так: є перетин або вільні кільця — мотузка лусне. */
export function knotsOutcome(s: KnotState, d: Difficulty = NORMAL): Outcome {
  const f = faults(s, d);
  return total(f) === 0 ? 'good' : f.crossings === 0 && total(f) <= 2 ? 'fine' : 'scrappy';
}

/** Повний розв'язок за правилами (перебір із відсіканням): кілок кожного кільця або null. */
export function solve(l: KnotLevel, d: Difficulty = NORMAL): readonly number[] | null {
  const links: number[] = l.rings.map(() => -1);
  const go = (i: number): boolean => {
    if (i === l.rings.length) return windOk(l, links);
    for (let j = 0; j < l.pegs.length; j++) {
      if (links.includes(j)) continue;
      links[i] = j;
      const len = lineLen(l, links, i) as number;
      if (tensionOf(len, d) === 'ok' && !crossingPairs(l, links).length && go(i + 1)) return true;
      links[i] = -1;
    }
    return false;
  };
  return go(0) ? [...links] : null;
}

/** Стрілка вітру в центрі тенту: від навітряного боку до протилежного, з наконечником. */
export function windPath(w: Pt): string {
  const p = (k: number, side = 0): string => `${CENTER.x + w.x * k - w.y * side} ${CENTER.y + w.y * k + w.x * side}`;
  return ['M', p(11), 'L', p(-6), 'M', p(-2, 3), 'L', p(-6), 'L', p(-2, -3)].join(' ');
}

