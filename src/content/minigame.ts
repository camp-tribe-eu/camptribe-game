// GAME-311 · спільний договір міні-ігор табору. Гілка claude/game-308-minigame-core на мить написання цієї картки
// не була запушена, тож той самий договір реалізовано тут; коли ядро міні-ігор з'явиться, цей файл стає його
// адаптером (один тип Outcome, одна шкала, одна допомога).
//
// Договір:
//  * три результати: 'good' | 'fine' | 'scrappy' — і ЖОДНОГО «програв»;
//  * м'який провал: 'scrappy' пускає далі завжди (blocks() === false для всіх трьох);
//  * після ДВОХ 'scrappy' поспіль у тій самій справі приходить допомога (ширша смуга, більше часу, підказка) —
//    ніколи не блок і ніколи не докір.
// Жодного годинника: час приходить лише кроком кадру (dtMs), випадковість — лише переданим генератором.

export const OUTCOMES = ['good', 'fine', 'scrappy'] as const;
export type Outcome = (typeof OUTCOMES)[number];

/** Межі оцінки 0..1: від GOOD — «добре», від FINE — «нормально», нижче — «сяк-так». */
export const GOOD_AT = 0.75;
export const FINE_AT = 0.4;

export function grade(score: number): Outcome {
  const s = Number.isFinite(score) ? Math.min(1, Math.max(0, score)) : 0;
  return s >= GOOD_AT ? 'good' : s >= FINE_AT ? 'fine' : 'scrappy';
}

/** М'який провал: жоден результат не перекриває шлях далі. Мутація «scrappy блокує» → червоне в minigame.test. */
export const blocks = (outcome: Outcome): boolean => OUTCOMES.indexOf(outcome) < 0;

/** Скільки «сяк-так» поспіль до появи допомоги. */
export const HELP_AFTER = 2;

export interface HelpState {
  /** Скільки 'scrappy' поспіль у цій справі. */
  readonly scrappyRun: number;
  /** Допомога ввімкнена: ширша смуга, більше часу, підказка. */
  readonly help: boolean;
}
export const NO_HELP: HelpState = { scrappyRun: 0, help: false };

/** Новий стан допомоги після спроби. Допомога, раз увімкнена, лишається на цю справу (знімати її — це докір). */
export function afterTry(h: HelpState, o: Outcome): HelpState {
  const scrappyRun = o === 'scrappy' ? h.scrappyRun + 1 : 0;
  return { scrappyRun, help: h.help || scrappyRun >= HELP_AFTER };
}

/** Наскільки поблажливіша гра з допомогою: смуга ширша, часу більше. Без допомоги — рівно 1 (нічого не змінює). */
export const BAND_HELP = 1.5;
export const TIME_HELP = 1.4;
export const bandScale = (h: HelpState): number => (h.help ? BAND_HELP : 1);
export const timeScale = (h: HelpState): number => (h.help ? TIME_HELP : 1);

/** Смуга [from..to] з урахуванням допомоги: ширшає навколо свого центра й не вилазить за 0..1. */
export function widen(band: { readonly from: number; readonly to: number }, h: HelpState): { from: number; to: number } {
  const mid = (band.from + band.to) / 2;
  const half = ((band.to - band.from) / 2) * bandScale(h);
  return { from: Math.max(0, mid - half), to: Math.min(1, mid + half) };
}
