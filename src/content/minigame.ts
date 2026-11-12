// GAME-311 · перехідник до каркаса міні-ігор GAME-308 (`src/core/minigame.ts`). Свого договору тут НЕМАЄ:
// три результати, м'який провал і допомога після двох «сяк-так» поспіль живуть у каркасі, а роботи рутин
// (вода, жар, ягоди, порядок, дрова, ліхтарі) беруть звідси лише оцінку 0..1 → результат і послаблення смуги.
//
// Складність — це `Difficulty` каркаса (timeScale, bandScale, hint): NORMAL звичайно, RELAXED після двох
// «сяк-так» поспіль (difficultyFor за записом у стані гри). Жодного власного лічильника допомоги.

import { NORMAL, type Difficulty, type Outcome } from '../core/minigame';

export { HELP_AFTER, NORMAL, OUTCOMES, RELAXED, difficultyFor, helpActive, resultOf } from '../core/minigame';
export type { Difficulty, MinigameRecord, MinigameResults, Outcome } from '../core/minigame';

/** Межі оцінки 0..1: від GOOD — «добре», від FINE — «нормально», нижче — «сяк-так». */
export const GOOD_AT = 0.75;
export const FINE_AT = 0.4;

export function grade(score: number): Outcome {
  const s = Number.isFinite(score) ? Math.min(1, Math.max(0, score)) : 0;
  return s >= GOOD_AT ? 'good' : s >= FINE_AT ? 'fine' : 'scrappy';
}

/** Смуга [from..to], розширена послабленням каркаса: ширшає навколо свого центра й не вилазить за 0..1. */
export function widen(band: { readonly from: number; readonly to: number }, d: Difficulty = NORMAL): { from: number; to: number } {
  const mid = (band.from + band.to) / 2;
  const half = ((band.to - band.from) / 2) * d.bandScale;
  return { from: Math.max(0, mid - half), to: Math.min(1, mid + half) };
}
