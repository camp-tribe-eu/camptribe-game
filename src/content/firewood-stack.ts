// GAME-311 · рутина «дрова»: знайти СУХІ, нарубати, укласти під тент. Рубання вже є (wood-chop.ts, GAME-190) —
// тут те, чого бракувало: вибір із ціною і вкладання, від якого залежить, чи дрова доживуть сухими до ночі.
//
// Вибір: близький сушняк (швидко, але після вчорашнього дощу вогкий) або далі в ліс (довго, зате сухий).
// Робота після рубання: укласти під тент — товсті вниз, тонкі зверху, і все в межах тенту. Що стирчить
// з-під тенту — вночі намокне, і вечеря наступного дня буде холодною.

import { grade, type Outcome } from './minigame';

export type WoodPlace = 'near' | 'far';
export type LogSize = 'thick' | 'split' | 'kindling';
/** Порядок укладання: що нижче, то товстіше. */
export const ORDER: readonly LogSize[] = ['thick', 'split', 'kindling'];
/** Скільки полін влазить під тент. Полін завжди більше — отже, вибір, що лишити під відкритим небом. */
export const COVER = 6;
export const LOGS: readonly LogSize[] = ['thick', 'thick', 'split', 'split', 'split', 'kindling', 'kindling', 'kindling'];

export interface StackState {
  readonly place: WoodPlace;
  /** Поліна під тентом, за порядком укладання (індекси в LOGS). */
  readonly under: readonly number[];
  /** Поліна, свідомо лишені назовні. */
  readonly outside: readonly number[];
  readonly done: boolean;
}
export type StackEvent = 'none' | 'under' | 'outside' | 'noRoom' | 'done';
export const startStack = (place: WoodPlace): StackState => ({ place, under: [], outside: [], done: false });

const sizeOf = (i: number): LogSize => LOGS[i] ?? 'kindling';
/** Чи лягає це поліно за правилом «товсті вниз»: не товстіше за попереднє покладене. */
export function fits(s: StackState, i: number): boolean {
  const last = s.under.at(-1);
  return last === undefined || ORDER.indexOf(sizeOf(i)) >= ORDER.indexOf(sizeOf(last));
}

export function placeLog(s: StackState, i: number, under: boolean): { state: StackState; event: StackEvent } {
  if (s.done || i < 0 || i >= LOGS.length || s.under.includes(i) || s.outside.includes(i)) return { state: s, event: 'none' };
  if (!under) return { state: { ...s, outside: [...s.outside, i] }, event: 'outside' };
  if (s.under.length >= COVER) return { state: s, event: 'noRoom' };
  if (!fits(s, i)) return { state: { ...s, outside: [...s.outside, i] }, event: 'outside' };
  return { state: { ...s, under: [...s.under, i] }, event: 'under' };
}
export const finishStack = (s: StackState): StackState => ({ ...s, done: true });

/** Скільки дров доживе сухими до вечора: під тентом і (якщо брали близький сушняк) уже вогкі наполовину. */
export const DAMP_KEEP = 0.5;
export function dryLogs(s: StackState): number {
  const keep = s.place === 'far' ? 1 : DAMP_KEEP;
  return s.under.length * keep;
}
/** Чи вистачить сухих дров на вечерю й вечір. */
export const ENOUGH_DRY = 4;
export const enoughDry = (s: StackState): boolean => dryLogs(s) >= ENOUGH_DRY;
/** Оцінка: скільки з потрібного на вечір пощастило зберегти сухим. */
export const stackScore = (s: StackState): number => Math.min(1, dryLogs(s) / COVER);
export const stackOutcome = (s: StackState): Outcome => grade(stackScore(s));
