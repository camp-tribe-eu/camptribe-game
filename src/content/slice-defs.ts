// Каталог гри для ядра: ціни й взаємодії вертикального зрізу + сюжет із перевіреного content/.
// Ціни тимчасово тут, доки схема content/ не має цін і взаємодій (DATA_CONTRACTS DC-023, PROPOSED).
// Головне вже зараз: ціни й нагороди — у каталозі, не в командах (CR-041).
// Предмети сюжету (дрова, ліхтар — лежать у локаціях) не викуповуються: DEFS_STORY_ITEM_SELLABLE.
import type { CoreDefs } from '../core/defs';
import { STORY } from './story';

export const SLICE_DEFS: CoreDefs = {
  items: {
    'item.firewood': { buyCents: 450 },
    'item.lantern': { buyCents: 1_999 },
  },
  interactions: {
    'obj.campfire': { grantId: 'rw.campfire-warmth', moneyCents: 0 },
  },
};

/** Те, з чим працює гра: зріз + сюжет. Перевіряється й заморожується в містку (createBridge). */
export const GAME_DEFS: CoreDefs = { ...SLICE_DEFS, story: STORY };
