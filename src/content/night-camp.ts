// GAME-311 · рутина «порядок у таборі»: міні-гра «нічний табір». Перед сном кожна річ має своє місце:
// їжа — в авто або підвішена, сміття — в бак, спорядження — під тент. Чиста логіка, жодного часу.
//
// Робота, а не кнопка: речей більше, ніж місць «аби куди», і кожну треба СВІДОМО покласти (два дотики:
// річ → місце). Лишена надворі їжа — це лисиця вночі, і цей зв'язок читає camp-night.

import { grade, type Outcome } from './minigame';

export type Place = 'car' | 'hung' | 'bin' | 'tarp' | 'out';
export type ThingKind = 'food' | 'rubbish' | 'gear';
export interface Thing { readonly id: string; readonly kind: ThingKind }

/** Що лишається на столі після вечері. Їжі кілька видів навмисно: одне місце (авто) всього не вміщає. */
export const THINGS: readonly Thing[] = [
  { id: 'pot', kind: 'food' },
  { id: 'bread', kind: 'food' },
  { id: 'berries', kind: 'food' },
  { id: 'tins', kind: 'rubbish' },
  { id: 'wrap', kind: 'rubbish' },
  { id: 'chairs', kind: 'gear' },
  { id: 'rods', kind: 'gear' },
  { id: 'boots', kind: 'gear' },
];
/** Скільки речей влазить в авто: решту їжі треба підвішувати. */
export const CAR_ROOM = 2;

export const PLACES_FOR: Readonly<Record<ThingKind, readonly Place[]>> = {
  food: ['car', 'hung'],
  rubbish: ['bin'],
  gear: ['tarp', 'car'],
};
export const rightPlace = (t: Thing, p: Place): boolean => (PLACES_FOR[t.kind] as readonly Place[]).includes(p);

export interface TidyState {
  /** Куди поклали кожну річ (id → місце). Чого немає — лишилось надворі. */
  readonly put: Readonly<Record<string, Place>>;
  readonly done: boolean;
}
export type TidyEvent = 'none' | 'put' | 'wrong' | 'carFull' | 'done';
export const startTidy = (): TidyState => ({ put: {}, done: false });

export const inCar = (s: TidyState): number => Object.values(s.put).filter((p) => p === 'car').length;

export function putThing(s: TidyState, id: string, place: Place): { state: TidyState; event: TidyEvent } {
  const t = THINGS.find((x) => x.id === id);
  if (!t || s.done) return { state: s, event: 'none' };
  if (place === 'car' && Object.hasOwn(s.put, id) === false && inCar(s) >= CAR_ROOM) return { state: s, event: 'carFull' };
  const put = { ...s.put, [id]: place };
  return { state: { ...s, put }, event: rightPlace(t, place) ? 'put' : 'wrong' };
}
/** Гравець каже «спати»: що не прибрано — лишилось надворі (м'який вихід). */
export const sleepNow = (s: TidyState): TidyState => ({ ...s, done: true });

/** Чи лишилась їжа просто неба: або не покладена нікуди, або покладена не туди. */
export function foodOutside(s: TidyState): boolean {
  return THINGS.filter((t) => t.kind === 'food').some((t) => {
    const p = s.put[t.id];
    return p === undefined || !rightPlace(t, p);
  });
}
export const rightCount = (s: TidyState): number => THINGS.filter((t) => { const p = s.put[t.id]; return p !== undefined && rightPlace(t, p); }).length;
export const tidyScore = (s: TidyState): number => rightCount(s) / THINGS.length;
export const tidyOutcome = (s: TidyState): Outcome => grade(tidyScore(s));
