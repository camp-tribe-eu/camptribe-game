// GAME-314 · зразковий день в одному проході. Цей модуль — ЗШИВКА, не нова механіка: він збирає ніч із усього, що день уже вміє,
// і віддає її ОДНІЙ моделі (camp-night.nightOf). Ланцюг, який доводить sample-day.test.ts мутаціями:
//   дорога → f.arrival-* (команда ядра FinishMinigame) → freePitches → вибір ділянки f.spot-* → nightAt → ніч;
//   місія зроблена/ні (прапорці місій) → ніч; пристрій з місії → рутина → ніч.
import { PREP_FLAGS, arrivalOf, freePitches, pitchDef, pitchTaken, type NightWeather, type PitchId } from './arrival-pitch';
import { MISSIONS } from './missions';
import type { Devices } from './camp-devices';
import type { NightFacts } from './camp-night';
import type { StrikeSave } from '../core/camp-strike';

/** Режим зразкового дня вмикає ?sampleDay=1 (test-switches); без нього гра поводиться як раніше. */
export const STORM: NightWeather = 'storm';

/** Які ділянки вільні ЗАРАЗ — за часом приїзду, який записала дорога (f.arrival-*). */
export const pitchChoices = (flags: readonly string[]): readonly PitchId[] => freePitches(arrivalOf(flags));

/** Смуга заїзду для обраної ділянки; null — ділянку ще не обрано. */
export const laneIdFor = (flags: readonly string[]): string | null => {
  const p = pitchTaken(flags);
  return p === null ? null : pitchDef(p).lane;
};

const DEVICE_OF: Readonly<Record<string, keyof Devices>> = { 'fish-trap': 'fish-trap', 'solar-charger': 'solar-station', 'woodshed-tarp': 'woodpile' };

/** Пристрої табору з місій: віддача місії дає матеріал (device.flag) — і пристрій стоїть, доглянутий. */
export function devicesFromFlags(flags: readonly string[]): Devices {
  const out: Record<string, { care: number }> = {};
  for (const m of MISSIONS) if (flags.includes(m.device.flag)) out[DEVICE_OF[m.device.kind] as string] = { care: 1 };
  return out as Devices;
}

/**
 * Підготовка до ночі — ВИВОДИТЬСЯ з того, що родина справді зробила за день (прапорці f.prep-* — імена для nightAt, у стані їх ніхто не пише):
 *   «Антена» (Люк) зроблена → прогноз почуто заздалегідь: намет відтягнуто від води, авто поставлене проти вітру (highGround + windbreak);
 *   тент над дровами (пристрій Клер woodshed-tarp) → відтяжки зав'язані як слід (tarp + knots).
 */
export function prepOf(flags: readonly string[]): readonly string[] {
  const aerial = MISSIONS.find((m) => m.id === 'mis.aerial');
  const tarp = MISSIONS.find((m) => m.device.kind === 'woodshed-tarp');
  const out: string[] = [];
  if (aerial && flags.includes(aerial.doneFlag)) out.push(PREP_FLAGS.highGround, PREP_FLAGS.windbreak);
  if (tarp && flags.includes(tarp.device.flag)) out.push(PREP_FLAGS.tarp, PREP_FLAGS.knots);
  return out;
}

/** Додаткові факти ночі з прапорців гри: ділянка, погода ночі, підготовка й місії. Решту (рутини) додає дошка табору. */
export function sampleExtra(flags: readonly string[]): Pick<NightFacts, 'pitch' | 'nightWeather' | 'prep' | 'missions'> {
  const pitch = pitchTaken(flags);
  return {
    ...(pitch !== null ? { pitch } : {}),
    nightWeather: STORM,
    prep: prepOf(flags),
    missions: flags,
  };
}

/** Скільки місій дня зроблено (для підсумку). */
export const missionsDone = (flags: readonly string[]): number => MISSIONS.filter((m) => flags.includes(m.doneFlag)).length;

/** GAME-338 · хто з видавців місій ще чекає (джерело те саме, що в `missionsDone`): їх називає ціль дня, над ними на мапі «★». Зроблена місія знімає ім'я. */
export const openMissionGivers = (flags: readonly string[]): string[] => MISSIONS.filter((m) => !flags.includes(m.doneFlag)).map((m) => m.giver);

/** GAME-317 · ОДНА ціль зразкового дня на ключ i18n. Раніше після дороги в шапці лишалась «Ціль: Прибуття» зі старої гри розділу 1 і не змінювалась до кінця.
 *  null — дорогу ще не проїхано: ціль тоді стара (збори й виїзд — це й є мета дня до дороги). */
export type SampleGoal = 'pitch' | 'day' | 'evening' | 'done';
export function sampleGoal(flags: readonly string[], stormPlayed: boolean): SampleGoal | null {
  if (!flags.some((f) => f.startsWith('f.arrival-'))) return null;
  if (stormPlayed) return 'done';
  if (pitchTaken(flags) === null) return 'pitch';
  return missionsDone(flags) >= 2 ? 'evening' : 'day';
}

/** GAME-340 · кого називає чип цілі: видавців місій, що ще чекають, — і в «Допомогти сусідам», і в «Вечеря й порядок» (після двох місій ціль перемикалась на вечір і мовчки губила третього). Зроблені місії, ніч і вибір ділянки імен не мають. */
export const goalNames = (goal: SampleGoal | null, open: readonly string[], report: string | null = null): readonly string[] => (goal === 'day' || goal === 'evening' ? (report !== null ? [report] : open) : []);   // GAME-346: після міні-гри — лише той, до кого вертатись

/** Година, на якій світ зразкового дня стоїть: опівночі гра розділу 1 засинала сама, перегортала день і відкривала свій «Підсумок дня 1» посеред місії. Ніч тут — кнопка дошки, не годинник. */
export const SAMPLE_HOLD_MINUTE = 23 * 60 + 30;

/** GAME-342: стеля кроків швидкого старту (ціль — ~14; запас на справи «Зробити»), щоб збій не зациклив завантаження. */
export const SAMPLE_QUICK_STEPS = 40;
/** GAME-329 · у виборі героя зразка — лише той, кого день справді грає: родина, авто (дорога — міні-гра авто) і без тварини (її день не показує). Решта суперечила б дню. */
export const SAMPLE_PROFILE = 'profile.family-teen';
export const SAMPLE_TRANSPORT = 'transport.car';
export const sampleHeroes = <T extends { readonly profileKey: string; readonly transportKey: string; readonly animalKey: string | null }>(all: readonly T[]): readonly T[] =>
  all.filter((c) => c.profileKey === SAMPLE_PROFILE && c.transportKey === SAMPLE_TRANSPORT && c.animalKey === null);

/** GAME-350/351 · що показує зразковий день ПІСЛЯ ночі: ранок «згортаємо табір» (strike) → дорога додому (road-home) → підсумок (summary). 'day' — ніч ще не зіграно.
 *  Порядок етапів — ЄДИНЕ місце, що його знає: масив `AFTER_NIGHT`. Етап R3 (прихід додому, `home`) вставляється ПІСЛЯ 'road-home' одним рядком у цей масив. */
export type DayStage = 'day' | 'strike' | 'road-home' | 'summary';
/** Що вже відомо про етапи після ночі: ранок (game.strike) і результат дороги додому (останній `last` міні-гри mg.drive-home; немає — не їхали). */
export interface AfterNight { readonly strike: StrikeSave | undefined; readonly roadHome: string | null | undefined }
const AFTER_NIGHT: readonly { readonly stage: Exclude<DayStage, 'day' | 'summary'>; readonly done: (a: AfterNight) => boolean }[] = [
  { stage: 'strike', done: (a) => a.strike?.closed === true },
  { stage: 'road-home', done: (a) => typeof a.roadHome === 'string' },
];
export const dayStage = (goal: SampleGoal | null, strike: StrikeSave | undefined, roadHome?: string | null): DayStage =>
  goal !== 'done' ? 'day' : (AFTER_NIGHT.find((s) => !s.done({ strike, roadHome }))?.stage ?? 'summary');
