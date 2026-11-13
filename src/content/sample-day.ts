// GAME-314 · зразковий день в одному проході. Цей модуль — ЗШИВКА, не нова механіка: він збирає ніч із усього, що день уже вміє,
// і віддає її ОДНІЙ моделі (camp-night.nightOf). Ланцюг, який доводить sample-day.test.ts мутаціями:
//   дорога → f.arrival-* (команда ядра FinishMinigame) → freePitches → вибір ділянки f.spot-* → nightAt → ніч;
//   місія зроблена/ні (прапорці місій) → ніч; пристрій з місії → рутина → ніч.
import { PREP_FLAGS, arrivalOf, freePitches, pitchDef, pitchTaken, type NightWeather, type PitchId } from './arrival-pitch';
import { MISSIONS } from './missions';
import type { Devices } from './camp-devices';
import type { NightFacts } from './camp-night';

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

/** Додаткові факти ночі з прапорців гри: ділянка, погода ночі, підготовка й місії. Решту (рутини) додає дошка табору. */
export function sampleExtra(flags: readonly string[]): Pick<NightFacts, 'pitch' | 'nightWeather' | 'prep' | 'missions'> {
  const pitch = pitchTaken(flags);
  return {
    ...(pitch !== null ? { pitch } : {}),
    nightWeather: STORM,
    prep: Object.values(PREP_FLAGS).filter((f) => flags.includes(f)),
    missions: flags,
  };
}

/** Скільки місій дня зроблено (для підсумку). */
export const missionsDone = (flags: readonly string[]): number => MISSIONS.filter((m) => flags.includes(m.doneFlag)).length;
