// GAME-311 · рутина «риба»: зона влучання вже є (fishing.ts, GAME-193) — тут те, чого бракувало: РИБА
// ЗАЛЕЖИТЬ ВІД ЧАСУ ДОБИ Й ПОГОДИ. Чиста таблиця: ті самі (частина дня, погода) завжди дають той самий список.
//
// Ранок і вечір — клює краще; опівдні на сонці риба стоїть глибоко. Перед дощем бере щука, у дощ — короп.
// Це дає причину йти по рибу САМЕ ЗАРАЗ, а не «колись».

import type { Weather } from '../core/weather';
import type { Species } from './fishing';
import { SPECIES } from './fishing';

export type DayPart = 'morning' | 'noon' | 'afternoon' | 'evening';
export const DAY_PARTS: readonly DayPart[] = ['morning', 'noon', 'afternoon', 'evening'];

/** Які види беруть у цю частину дня за цієї погоди. Порожнього списку не буває: щось клює завжди. */
export function speciesAt(part: DayPart, weather: Weather): readonly Species['id'][] {
  const base: Species['id'][] = part === 'noon' ? ['perch'] : part === 'evening' ? ['perch', 'trout', 'pike'] : ['perch', 'carp', 'trout'];
  if (weather === 'rain') return [...new Set<Species['id']>([...base, 'carp'])];
  if (weather === 'cloudy') return [...new Set<Species['id']>([...base, 'pike'])];
  return base.filter((id) => id !== 'pike' || part === 'evening');
}
/** Індекси тих самих видів у SPECIES (fishing.ts) — щоб міні-гра брала швидкість із наявної таблиці. */
export const speciesIndexes = (part: DayPart, weather: Weather): readonly number[] =>
  speciesAt(part, weather).map((id) => SPECIES.findIndex((s) => s.id === id)).filter((i) => i >= 0);

/** Як швидко клює: множник до очікування поклівки. Більше — довше чекати. */
export function waitFactor(part: DayPart, weather: Weather): number {
  const byPart = part === 'noon' ? 1.6 : part === 'evening' ? 0.7 : part === 'morning' ? 0.8 : 1;
  const byWeather = weather === 'rain' ? 0.85 : weather === 'cloudy' ? 0.9 : 1.1;
  return Math.round(byPart * byWeather * 100) / 100;
}

/** Скільки риб треба на вечерю всій родині. Менше — вечеря пісніша, але вечеря буде завжди. */
export const SUPPER_FISH = 2;
export const supperFish = (kept: number): boolean => kept >= SUPPER_FISH;
