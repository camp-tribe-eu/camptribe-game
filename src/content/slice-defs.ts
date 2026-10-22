// Каталог визначень вертикального зрізу для ядра (ціни, взаємодії). Тимчасово тут, доки схема
// content/ не має цін і взаємодій (DATA_CONTRACTS DC-023, PROPOSED); тоді каталог збиратиметься
// з перевіреного content/. Головне вже зараз: ціни й нагороди — у каталозі, не в командах (CR-041).
import type { CoreDefs } from '../core/defs';

export const SLICE_DEFS: CoreDefs = {
  items: {
    'item.firewood': { buyCents: 450, sellCents: 0 },
    'item.lantern': { buyCents: 1_999, sellCents: 800 },
  },
  interactions: {
    'obj.campfire': { grantId: 'rw.campfire_warmth', moneyCents: 0 },
  },
};
