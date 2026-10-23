// Погода дня (GAME-46, SIMULATION_RULES SIM-WX-001, SIM-WX-005…007). Чиста функція (зерно світу, день):
// ні годинника браузера, ні RNG стану — кидки знахідок і подій у дорозі від погоди не зсуваються,
// а той самий сейв завжди бачить ту саму погоду.

import type { GameClock } from './clock';

export const WEATHERS = ['sunny', 'cloudy', 'rain'] as const;
export type Weather = (typeof WEATHERS)[number];

/** Хвилин в ігровій добі: день = floor(хвилини / 1440) (SIM-WX-005). */
export const DAY_MINUTES = 1440;

export const dayOf = (clock: Pick<GameClock, 'minutes'>): number => Math.floor(clock.minutes / DAY_MINUTES);

/** Частки на 100 днів: сонце 50, хмари 30, дощ 20 (SIM-WX-006, тимч.). */
export const WEATHER_SHARE: Readonly<Record<Weather, number>> = { sunny: 50, cloudy: 30, rain: 20 };

/** Перемішування 32-бітного слова (фіналізатор murmur3): сусідні дні дають незалежні значення. */
function mix32(x: number): number {
  let z = x >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  return (z ^ (z >>> 16)) >>> 0;
}

export function weatherOf(worldSeed: number, day: number): Weather {
  if (!Number.isSafeInteger(day) || day < 0) throw new RangeError(`weatherOf: day ${day}`);
  // Зерно й день — через два раунди перемішування, щоб (зерно, день) і (зерно+1, день-1) не збігались.
  const h = mix32(mix32(worldSeed ^ 0x9e3779b9) ^ Math.imul(day + 1, 0x27d4eb2f));
  const roll = h % 100;  // зсув від 2^32 mod 100 — менше за 1e-7, для погоди несуттєвий
  if (roll < WEATHER_SHARE.sunny) return 'sunny';
  if (roll < WEATHER_SHARE.sunny + WEATHER_SHARE.cloudy) return 'cloudy';
  return 'rain';
}

/** Дощ сповільнює велосипед: ×1.5 з округленням угору (SIM-WX-007). Авто, гроші — без змін. */
export function tripMinutes(minutes: number, transportId: string, weather: Weather): number {
  return weather === 'rain' && transportId === 'transport.bike' ? Math.ceil((minutes * 3) / 2) : minutes;
}
