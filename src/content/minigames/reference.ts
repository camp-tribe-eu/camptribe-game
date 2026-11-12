// GAME-308 · еталонна міні-гра каркаса (`mg.reference`): три зупинки маркера в смузі. Найпростіше, що вміє показати весь договір: дотик, три результати, допомога (ширша смуга, більше часу, підсвітка).
// Це НЕ контент гри: її не відкриває жоден об'єкт мапи, вона існує, щоб тести й e2e проганяли каркас до кожного з трьох результатів. Справжні міні-ігри (багажник, вузли, вогнище…) додаються так само: defineMinigame + запис у index.ts.
import { defineMinigame, FPS, type Difficulty, type FrameInput, type Outcome } from '../../core/minigame';

/** Повний хід маркера туди-назад, кадрів (2 с). */
export const PERIOD = 2 * FPS;
export const STOPS = 3;
/** Півширина «влучно» (2 бали) і «в смузі» (1 бал) за звичайної складності; допомога множить на bandScale. */
export const CORE_HALF = 0.06;
export const BAND_HALF = 0.16;
export const CENTER = 0.5;

export interface RefState { readonly t: number; readonly scores: readonly number[] }
export interface RefView {
  readonly marker: number;
  readonly scores: readonly number[];
  readonly need: number;
  readonly core: { readonly from: number; readonly to: number };
  readonly band: { readonly from: number; readonly to: number };
  /** Підказка допомоги: підсвітити влучну зону. */
  readonly hint: boolean;
}

/** Позиція маркера 0..1 на кадрі t: трикутна хвиля, без розривів. Чиста функція — її читає й e2e. */
export function markerAt(t: number): number {
  const x = (((t % PERIOD) + PERIOD) % PERIOD) / PERIOD;
  return x < 0.5 ? x * 2 : 2 - x * 2;
}
export const coreOf = (d: Difficulty): number => CORE_HALF * d.bandScale;
export const bandOf = (d: Difficulty): number => BAND_HALF * d.bandScale;
export function scoreAt(marker: number, d: Difficulty): number {
  const off = Math.abs(marker - CENTER);
  return off <= coreOf(d) ? 2 : off <= bandOf(d) ? 1 : 0;
}
/** 5–6 балів із 6 — добре, 3–4 — нормально, решта — сяк-так (м'який провал: гра йде далі). */
export const outcomeFromScore = (total: number): Outcome => (total >= 5 ? 'good' : total >= 3 ? 'fine' : 'scrappy');
const total = (s: readonly number[]): number => s.reduce((a, b) => a + b, 0);

export const REFERENCE = defineMinigame<RefState, RefView>({
  id: 'mg.reference',
  titleKey: 'mg.ref.title',
  introKey: 'mg.ref.intro',
  hintKey: 'mg.ref.hint',
  limitFrames: 40 * FPS,
  outcomes: {
    good: { consequence: 'ref.tidy', resultKey: 'mg.ref.result.good' },
    fine: { consequence: 'ref.ok', resultKey: 'mg.ref.result.fine' },
    scrappy: { consequence: 'ref.messy', resultKey: 'mg.ref.result.scrappy' },
  },
  init: () => ({ t: 0, scores: [] }),
  step: (s: RefState, input: FrameInput, d: Difficulty): RefState => {
    // Один дотик за кадр — одна зупинка: маркер на момент ЦЬОГО кадру.
    const tapped = input.taps.length > 0 && s.scores.length < STOPS;
    const scores = tapped ? [...s.scores, scoreAt(markerAt(s.t), d)] : s.scores;
    return { t: s.t + 1, scores };
  },
  done: (s) => s.scores.length >= STOPS,
  outcomeOf: (s) => outcomeFromScore(total(s.scores)),
  view: (s, d) => ({
    marker: markerAt(s.t), scores: s.scores, need: STOPS, hint: d.hint,
    core: { from: CENTER - coreOf(d), to: CENTER + coreOf(d) }, band: { from: CENTER - bandOf(d), to: CENTER + bandOf(d) },
  }),
});
