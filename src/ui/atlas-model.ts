// GAME-250 · модель першої сторінки Атласу (S9): де ми, перша мета з запискою дідуся, кілька сірих силуетів «попереду», що дає Атлас і одна кнопка дії.
// Чиста функція над знімком `offer.atlas`: без DOM, без часу — тож перевіряється юніт-тестом. Тексти — лише ключі i18n.
import type { Key } from '../i18n';
import type { OfferAtlas } from './story-types';

export type PlaceState = 'here' | 'first' | 'stamped' | 'ahead';
export interface AtlasPlace { readonly id: string; readonly nameKey: Key; readonly state: PlaceState; readonly noteKey: Key | null }
export interface AtlasGain { readonly id: string; readonly labelKey: Key; readonly icon: string }
export interface AtlasMapModel {
  readonly places: readonly AtlasPlace[];
  readonly here: AtlasPlace;
  readonly first: AtlasPlace;
  readonly ahead: readonly AtlasPlace[];
  readonly sentenceKey: Key;
  readonly legendKey: Key;
  readonly gains: readonly AtlasGain[];
  readonly ctaKey: Key;
  readonly stamps: number;
}

/** Не більше п'яти силуетів «попереду»: сторінка — мапа, а не звалище слів. */
export const MAX_AHEAD = 5;
const AHEAD: readonly { id: string; nameKey: Key }[] = [
  { id: 'mountains', nameKey: 'atlas.place.mountains' },
  { id: 'sea', nameKey: 'atlas.place.sea' },
  { id: 'castle', nameKey: 'atlas.place.castle' },
  { id: 'forest', nameKey: 'atlas.place.forest' },
];
const GAINS: readonly AtlasGain[] = [
  { id: 'stamps', labelKey: 'atlas.gain.stamps', icon: 'star' },
  { id: 'memories', labelKey: 'atlas.gain.memories', icon: 'camera' },
  { id: 'routes', labelKey: 'atlas.gain.routes', icon: 'road' },
];

/** `mode`: 'intro' — кнопка веде до розмови про плани; 'menu' — Атлас відкрито з ☰, кнопка закриває. */
export function atlasMapModel(atlas: OfferAtlas, mode: 'intro' | 'menu'): AtlasMapModel {
  const lakeDone = atlas.pages[0]?.done === true;
  const here: AtlasPlace = { id: 'home', nameKey: 'atlas.place.home', state: 'here', noteKey: null };
  const first: AtlasPlace = { id: 'lake', nameKey: 'atlas.place.lake', state: lakeDone ? 'stamped' : 'first', noteKey: 'atlas.note.lake' };
  // GAME-292: Люксембург з'являється на мапі лише з печаткою (родина справді приїхала) — на місці першого силуету («замок»); силуетів попереду стає на один менше.
  const lux: AtlasPlace | null = atlas.luxembourg ? { id: 'luxembourg', nameKey: 'atlas.place.luxembourg', state: 'stamped', noteKey: null } : null;
  const ahead = AHEAD.filter((p) => !(lux && p.id === 'castle')).slice(0, MAX_AHEAD).map((p): AtlasPlace => ({ ...p, state: 'ahead', noteKey: null }));
  return {
    places: [here, first, ...(lux ? [lux] : []), ...ahead], here, first, ahead,
    sentenceKey: 'atlas.sentence', legendKey: 'atlas.legend', gains: GAINS,
    ctaKey: mode === 'intro' ? 'atlas.cta.plan' : 'atlas.cta.close',
    stamps: (lakeDone ? 1 : 0) + (lux ? 1 : 0),
  };
}
