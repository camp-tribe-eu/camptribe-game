// GAME-213 · камера в телефоні героя: фото на трьох наявних об'єктах мапи табору (без правок мапи). Дія («E»/тап біля об'єкта) — та сама
// команда Interact, що в слідів: прапорець f.photo-<назва> + нагорода «0 центів» раз за grantId (повторне фото — відмова ядра). Фото косметичні для
// сюжету (жоден квест їх не читає; перебір їх не розрізняє — moves.ts exploreView, story.ts requestFlags). Атлас показує розділ «Фото» (photoPage).
//
// GAME-287 · розділ 2, день 1: два кадри «орхідея» — сухий (obj.photo-orchid, край лісу біля виходу на офіційну стежку) і дощовий (obj.photo-drops, крапі на листі з-під навісу).
// Живий рівно один за погодою дня; обидва дають той самий предмет item.photo.orchid і той самий прапорець f.photo-ch2-orchid — запис в Атласі (orchidPage) є ЛИШЕ
// після такої дії. Живі, лише поки квест CH2-D1-WALK-001 активний (до розділу 2 гравець їх не бачить). Окремо від PHOTOS: розділ «Фото» (камера табору) лишається 0/3.
import type { InteractionDef } from '../core/defs';
import type { GameState } from '../core/state';
import type { Weather } from '../core/weather';

export interface PhotoDef {
  readonly id: string; readonly spot: string; readonly flag: string; readonly grantId: string; readonly nameKey: string;
  /** GAME-287: предмет, який дає кадр (лягає в рюкзак разом із прапорцем). */
  readonly item?: string;
  /** GAME-287: у яку погоду кадр живий: `rain` — лише в дощ, `dry` — в усі інші. Немає — за будь-якої. */
  readonly when?: 'rain' | 'dry';
  /** GAME-287: кадр живий лише поки активний хоч один із цих квестів (день 1: прогулянка, потім вечір — кадр можна знімати й після повернення з лісу). */
  readonly atQuests?: readonly string[];
}
const mk = (name: string, spot: string): PhotoDef => ({ id: `photo.${name}`, spot, flag: `f.photo-${name}`, grantId: `rw.photo-${name}`, nameKey: `photo.${name}` });
/** Місце, з якого знімають: наявні об'єкти мапи табору (camp-lake.tmj). */
export const PHOTOS: readonly PhotoDef[] = [mk('pier', 'obj.pier-end'), mk('lake', 'obj.water'), mk('pitch', 'obj.pitch-1')];
export const PHOTO_FLAG_PREFIX = 'f.photo-';
export const PHOTO_GRANT_PREFIX = 'rw.photo-';

export const CH2_WALK_QUEST = 'CH2-D1-WALK-001';
export const CH2_DAY1: readonly string[] = [CH2_WALK_QUEST, 'CH2-D1-SUMMARY-001'];
export const ORCHID_ITEM = 'item.photo.orchid';
export const ORCHID_FLAG = 'f.photo-ch2-orchid';
export const CH2_PHOTOS: readonly PhotoDef[] = [
  { id: 'photo.orchid', spot: 'obj.photo-orchid', flag: ORCHID_FLAG, grantId: 'rw.photo-orchid', nameKey: 'photo.orchid', item: ORCHID_ITEM, when: 'dry', atQuests: CH2_DAY1 },
  { id: 'photo.drops', spot: 'obj.photo-drops', flag: ORCHID_FLAG, grantId: 'rw.photo-drops', nameKey: 'photo.drops', item: ORCHID_ITEM, when: 'rain', atQuests: CH2_DAY1 },
];
/** Усі кадри гри: камера табору (PHOTOS) і кадри розділу 2. Реєстр взаємодій і прапорців (side.ts) бере звідси. */
export const ALL_PHOTOS: readonly PhotoDef[] = [...PHOTOS, ...CH2_PHOTOS];

export const photoOfSpot = (name: string, ps: readonly PhotoDef[] = ALL_PHOTOS): PhotoDef | undefined => ps.find((p) => p.spot === name);
export const isPhotoSpot = (name: string): boolean => photoOfSpot(name) !== undefined;
export const photoFlags = (ps: readonly PhotoDef[] = ALL_PHOTOS): string[] => [...new Set(ps.map((p) => p.flag))];

export function photoInteractions(ps: readonly PhotoDef[] = ALL_PHOTOS): Record<string, InteractionDef> {
  return Object.fromEntries(ps.map((p) => [p.spot, { grantId: p.grantId, moneyCents: 0, flags: [p.flag], ...(p.item === undefined ? {} : { items: [{ itemId: p.item, qty: 1 }] }) }] as const));
}
/** Чи кадр підходить до погоди дня: `rain` — лише дощ, `dry` — сонце й хмари, без умови — будь-яка. Погоду не передано — кадр із умовою мертвий (німий, а не вгадує). */
export const photoWeatherOk = (p: PhotoDef, weather?: Weather): boolean => p.when === undefined || (weather !== undefined && (p.when === 'rain') === (weather === 'rain'));
/** Об'єкт-«кадр» живий, поки фото не зроблено (як позначка сліду); кадр розділу 2 — ще й лише за своєї погоди й поки триває день 1 розділу 2. */
export const livePhotoSpot = (g: GameState, name: string, weather?: Weather, ps: readonly PhotoDef[] = ALL_PHOTOS): boolean => {
  const p = photoOfSpot(name, ps);
  if (p === undefined || g.flags.includes(p.flag)) return false;
  if (p.atQuests !== undefined && !p.atQuests.some((q) => g.quests[q]?.status === 'active')) return false;
  return photoWeatherOk(p, weather);
};
/** Живі кадри розділу 2 за погоди: для кожної з WEATHERS рівно один (сторож ch2-walk.test). */
export const liveOrchidSpots = (g: GameState, weather: Weather, ps: readonly PhotoDef[] = CH2_PHOTOS): string[] => ps.filter((p) => livePhotoSpot(g, p.spot, weather, ps)).map((p) => p.spot);

/**
 * GAME-287 · запис Атласу «засушена орхідея» і підпис дідуся. Є ЛИШЕ коли кадр знято — прапорець f.photo-ch2-orchid ставить тільки взаємодія-кадр (Interact), і разом
 * із ним у рюкзак лягає item.photo.orchid. `shot` — який кадр: сухий чи дощовий (за нагородою, яку видала взаємодія); у спільній сторінці однаково гербарій і підпис.
 */
export interface OrchidPage { readonly found: boolean; readonly shot: 'orchid' | 'drops' | null }
export function orchidPage(flags: readonly string[], grants: readonly string[], ps: readonly PhotoDef[] = CH2_PHOTOS): OrchidPage {
  const taken = ps.filter((p) => flags.includes(p.flag));
  if (taken.length === 0) return { found: false, shot: null };
  const by = ps.find((p) => grants.includes(p.grantId));
  return { found: true, shot: by?.id === 'photo.drops' ? 'drops' : 'orchid' };
}

export interface PhotoRow { readonly id: string; readonly nameKey: string; readonly taken: boolean }
export interface PhotoPage { readonly photos: readonly PhotoRow[]; readonly taken: number; readonly total: number }
export function photoPage(flags: readonly string[], ps: readonly PhotoDef[] = PHOTOS): PhotoPage {
  const photos = ps.map((p) => ({ id: p.id, nameKey: p.nameKey, taken: flags.includes(p.flag) }));
  return { photos, taken: photos.filter((p) => p.taken).length, total: photos.length };
}
