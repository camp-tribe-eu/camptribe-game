// Пакування для тестів ядра (GAME-109).
import type { CoreDefs } from './defs';
import { STORY_DEFS } from './story.fixture';

/**
 * Удома після `q.start` — тент (потрібне, 2), спальник (корисне, 1), стілець (корисне, 2) і лежанка для собаки
 * (потрібне, 1, лише з собакою). Місце: авто 4, велосипед 3. Прапорці — `f.pack-<річ>`.
 */
export const PACK_DEFS: CoreDefs = {
  ...STORY_DEFS,
  packing: {
    openAfter: 'q.start', at: ['loc.home'],
    capacity: { 'transport.car': 4, 'transport.bike': 3 },
    items: [
      { itemId: 'item.tent', group: 'needed', units: 2 },
      { itemId: 'item.bag', group: 'useful', units: 1 },
      { itemId: 'item.chair', group: 'useful', units: 2 },
      { itemId: 'item.dog-bed', group: 'needed', units: 1, when: { animals: ['animal.dog'] } },
    ],
    notes: [{ missing: 'item.tent', textKey: 'pack.note.x' }],
  },
};
