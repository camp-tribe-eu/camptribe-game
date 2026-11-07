// GAME-244 ч.2 · збір дарів природи: ліміт «джерело (дерево, кущ) дає раз на день» живе В ЯДРІ, а не у вигляді: вигляд скидається
// з кожною перебудовою сцени чи перезавантаженням, і «струсив → продав → вийшов-зайшов → струсив» давав би гроші з нічого.
// Скільки дає джерело за день — детермінована функція (дерево, день): шишок 1–3, ягід 2–4 (її ж використовує вигляд для падіння).
import { hash01 } from './hash01';
import { friendOf, type FriendState } from './friendship';

export type ForageKind = 'pine' | 'bush';
/** Що дає джерело виду: сосна — шишку, кущ — ягоди (збігається з content/friendship.ts FORAGE_ITEMS; це перевіряє finds-price.test). */
export const FORAGE_SOURCE_ITEM: Readonly<Record<ForageKind, string>> = { pine: 'item.pine-cone', bush: 'item.berries' };

export const forageKindOf = (sourceId: string): ForageKind | null => (/^pine\.[a-z0-9.-]+$/.test(sourceId) ? 'pine' : /^bush\.[a-z0-9.-]+$/.test(sourceId) ? 'bush' : null);
export const idSeed = (id: string): number => { let h = 7; for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0; return h >>> 0; };
/** Скільки впало: шишок 1–3, ягід 2–4; залежить від дерева й дня, не від випадку. */
export function dropCount(kind: ForageKind | string, id: string, day: number): number {
  const h = hash01(day, idSeed(id));
  return kind === 'pine' ? 1 + Math.floor(h * 3) : 2 + Math.floor(h * 3);
}
/** Скільки дарів це джерело вже дало сьогодні (книга веде лише один день — старі дні відпадають самі, сейв не росте). */
export const forageTaken = (f: FriendState | undefined, src: string, day: number): number => {
  const l = friendOf(f).forage;
  return l !== undefined && l.day === day ? (Object.hasOwn(l.n, src) ? (l.n[src] as number) : 0) : 0;
};
/** Скільки ще можна взяти з джерела сьогодні. */
export const forageLeft = (f: FriendState | undefined, src: string, day: number): number => {
  const k = forageKindOf(src);
  return k === null ? 0 : Math.max(0, dropCount(k, src, day) - forageTaken(f, src, day));
};
/** Джерело дарів уже віддало все сьогодні (вигляд не трусить його вдруге). Не джерело дарів (ящик, гілка) — завжди false: їх ліміт інший. */
export const forageSpent = (f: FriendState | undefined, src: string, day: number): boolean => forageKindOf(src) !== null && forageLeft(f, src, day) < 1;
export function foraged(f: FriendState | undefined, src: string, day: number): FriendState {
  const cur = friendOf(f);
  const same = cur.forage !== undefined && cur.forage.day === day;
  return { ...cur, forage: { day, n: { ...(same ? cur.forage?.n : {}), [src]: forageTaken(cur, src, day) + 1 } } };
}
