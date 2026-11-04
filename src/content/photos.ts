// GAME-213 · камера в телефоні героя: фото на трьох наявних об'єктах мапи табору (без правок мапи). Дія («E»/тап біля об'єкта) — та сама
// команда Interact, що в слідів: прапорець f.photo-<назва> + нагорода «0 центів» раз за grantId (повторне фото — відмова ядра). Фото косметичні для
// сюжету (жоден квест їх не читає; перебір їх не розрізняє — moves.ts exploreView, story.ts requestFlags). Атлас показує розділ «Фото» (photoPage).
import type { InteractionDef } from '../core/defs';
import type { GameState } from '../core/state';

export interface PhotoDef { readonly id: string; readonly spot: string; readonly flag: string; readonly grantId: string; readonly nameKey: string }
const mk = (name: string, spot: string): PhotoDef => ({ id: `photo.${name}`, spot, flag: `f.photo-${name}`, grantId: `rw.photo-${name}`, nameKey: `photo.${name}` });
/** Місце, з якого знімають: наявні об'єкти мапи табору (camp-lake.tmj). */
export const PHOTOS: readonly PhotoDef[] = [mk('pier', 'obj.pier-end'), mk('lake', 'obj.water'), mk('pitch', 'obj.pitch-1')];
export const PHOTO_FLAG_PREFIX = 'f.photo-';
export const PHOTO_GRANT_PREFIX = 'rw.photo-';

export const photoOfSpot = (name: string, ps: readonly PhotoDef[] = PHOTOS): PhotoDef | undefined => ps.find((p) => p.spot === name);
export const isPhotoSpot = (name: string): boolean => photoOfSpot(name) !== undefined;
export const photoFlags = (ps: readonly PhotoDef[] = PHOTOS): string[] => ps.map((p) => p.flag);

export function photoInteractions(ps: readonly PhotoDef[] = PHOTOS): Record<string, InteractionDef> {
  return Object.fromEntries(ps.map((p) => [p.spot, { grantId: p.grantId, moneyCents: 0, flags: [p.flag] }] as const));
}
/** Об'єкт-«кадр» живий, поки фото не зроблено (як позначка сліду). */
export const livePhotoSpot = (g: GameState, name: string): boolean => { const p = photoOfSpot(name); return p !== undefined && !g.flags.includes(p.flag); };

export interface PhotoRow { readonly id: string; readonly nameKey: string; readonly taken: boolean }
export interface PhotoPage { readonly photos: readonly PhotoRow[]; readonly taken: number; readonly total: number }
export function photoPage(flags: readonly string[], ps: readonly PhotoDef[] = PHOTOS): PhotoPage {
  const photos = ps.map((p) => ({ id: p.id, nameKey: p.nameKey, taken: flags.includes(p.flag) }));
  return { photos, taken: photos.filter((p) => p.taken).length, total: photos.length };
}
