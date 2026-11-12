// GAME-311 · дві рутинні міні-гри в каркасі GAME-308: «жар у смузі» (вечеря) і «нічний табір» (щоб не прийшли звірі).
// Логіка та сама, що й на дошці рутин (../embers, ../night-camp) — тут лише обгортка під договір каркаса:
// кадр замість мілісекунд, дотик по полю 0..1 замість кнопок, і наслідок кожного результату для сценарію.
import { defineMinigame, FPS, type Difficulty, type FrameInput } from '../../core/minigame';
import { emberOutcome, startEmbers, stepEmbers, type EmberAct, type EmberState } from '../embers';
import { THINGS, foodOutside, putThing, rightCount, startTidy, tidyOutcome, type Place, type TidyState } from '../night-camp';

/** Один кадр = стільки мілісекунд ігрового часу (каркас рахує лише кадри). */
export const MS_PER_FRAME = 1000 / FPS;

/** Поле вогнища поділене на три смуги по висоті: підкинути дров / роздмухати / розгребти. */
export const EMBER_ACTS: readonly EmberAct[] = ['wood', 'blow', 'rake'];
export const actAt = (y: number): EmberAct => EMBER_ACTS[Math.min(EMBER_ACTS.length - 1, Math.max(0, Math.floor(y * EMBER_ACTS.length)))] as EmberAct;

export interface EmberView { readonly heat: number; readonly dish: number; readonly quality: readonly number[]; readonly hint: boolean }

export const EMBERS_GAME = defineMinigame<EmberState, EmberView>({
  id: 'mg.embers',
  titleKey: 'mg.embers.title',
  introKey: 'mg.embers.intro',
  hintKey: 'mg.embers.hint',
  limitFrames: 45 * FPS,
  outcomes: {
    good: { consequence: 'supper.hot', resultKey: 'mg.embers.result.good' },
    fine: { consequence: 'supper.uneven', resultKey: 'mg.embers.result.fine' },
    scrappy: { consequence: 'supper.cold', resultKey: 'mg.embers.result.scrappy' },
  },
  init: (): EmberState => startEmbers(true),
  step: (s: EmberState, input: FrameInput): EmberState => {
    const tap = input.taps[0];
    const acted = tap ? stepEmbers(s, { kind: 'act', act: actAt(tap.y) }).state : s;
    return stepEmbers(acted, { kind: 'tick', dtMs: MS_PER_FRAME }).state;
  },
  done: (s) => s.done,
  outcomeOf: (s) => emberOutcome(s),
  view: (s: EmberState, d: Difficulty): EmberView => ({ heat: s.heat, dish: s.dish, quality: s.quality, hint: d.hint }),
});

/** Поле нічного табору: стовпчик речей ліворуч (x < 0.5), чотири місця праворуч. */
export const PLACES: readonly Place[] = ['car', 'hung', 'bin', 'tarp'];
export interface TidyGameState { readonly tidy: TidyState; readonly picked: number }
export interface TidyView { readonly put: Readonly<Record<string, Place>>; readonly picked: number; readonly right: number; readonly hint: boolean }
const indexAt = (y: number, n: number): number => Math.min(n - 1, Math.max(0, Math.floor(y * n)));

export const NIGHT_CAMP_GAME = defineMinigame<TidyGameState, TidyView>({
  id: 'mg.night-camp',
  titleKey: 'mg.night.title',
  introKey: 'mg.night.intro',
  hintKey: 'mg.night.hint',
  limitFrames: 40 * FPS,
  outcomes: {
    good: { consequence: 'camp.safe', resultKey: 'mg.night.result.good' },
    fine: { consequence: 'camp.half', resultKey: 'mg.night.result.fine' },
    scrappy: { consequence: 'camp.fox', resultKey: 'mg.night.result.scrappy' },
  },
  init: (): TidyGameState => ({ tidy: startTidy(), picked: 0 }),
  step: (s: TidyGameState, input: FrameInput): TidyGameState => {
    const tap = input.taps[0];
    if (!tap) return s;
    // Ліва половина — вибрати річ, права — покласти обрану на місце. Два дотики на річ: однією кнопкою не закрити.
    if (tap.x < 0.5) return { ...s, picked: indexAt(tap.y, THINGS.length) };
    const thing = THINGS[s.picked];
    const place = PLACES[indexAt(tap.y, PLACES.length)];
    return thing && place ? { ...s, tidy: putThing(s.tidy, thing.id, place).state } : s;
  },
  done: (s) => Object.keys(s.tidy.put).length >= THINGS.length,
  outcomeOf: (s) => tidyOutcome(s.tidy),
  view: (s: TidyGameState, d: Difficulty): TidyView => ({ put: s.tidy.put, picked: s.picked, right: rightCount(s.tidy), hint: d.hint }),
});

/** Чи лишилась їжа надворі за станом гри — це читає ніч (camp-night). */
export const tidyFoodOutside = (s: TidyGameState): boolean => foodOutside(s.tidy);
