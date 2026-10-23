// Каталог гри для ядра: ціни й взаємодії вертикального зрізу + спорядження з content/items.json + сюжет.
// Ціни дров і ліхтаря тимчасово тут (DATA_CONTRACTS DC-023): це предмети сюжету без картки спорядження.
// Головне вже зараз: ціни й нагороди — у каталозі, не в командах (CR-041).
// Предмети сюжету (дрова, ліхтар, стартові намет і спальник — лежать у локаціях) не викуповуються: DEFS_STORY_ITEM_SELLABLE.
import { storyItems, type CoreDefs, type GearDef, type ItemDef } from '../core/defs';
import items from '../../content/items.json';
import { STORY } from './story';
import { LIFE } from './life';

/** Рядок content/items.json (GAME-73). Картку спорядження перевіряє валідатор (gear); тут — лише переклад у форму ядра. */
interface RawItem {
  id: string; nameKey: string; kind?: GearDef['kind']; tier?: number;
  weightG?: number; volumeL?: number; waterproofMm?: number; comfortC?: number; sleeps?: number; priceCents?: number; resaleCents?: number;
}
export const RAW_ITEMS: readonly RawItem[] = items as RawItem[];

/**
 * Спорядження для ядра (GAME-73): вид і тир; ціна й викуп — з картки. Стартові намет і спальник видає Пролог (лежать у
 * крамниці-локації, ціль `collect`): їм ціни в грі немає — інакше «підняв, продав, підняв знову» (DEFS_STORY_ITEM_SELLABLE),
 * а купівля другого примірника множила б простір станів. Ціна в картці лишається фактом каталогу (ринкова вартість).
 */
export function compileGear(raw: readonly RawItem[], story: ReadonlySet<string>): Record<string, ItemDef> {
  return Object.fromEntries(raw.filter((i) => i.kind !== undefined).map((i) => {
    const gear: GearDef = { kind: i.kind as GearDef['kind'], tier: i.tier as number };
    const prices = story.has(i.id) ? {} : { buyCents: i.priceCents as number, sellCents: i.resaleCents as number };
    return [i.id, { ...prices, gear }];
  }));
}

export const GEAR_ITEMS: Readonly<Record<string, ItemDef>> = compileGear(RAW_ITEMS, storyItems(STORY));

export const SLICE_DEFS: CoreDefs = {
  items: {
    ...GEAR_ITEMS,
    'item.firewood': { buyCents: 450 },
    'item.lantern': { buyCents: 1_999 },
  },
  interactions: {
    'obj.campfire': { grantId: 'rw.campfire-warmth', moneyCents: 0 },
  },
};

/**
 * Те, з чим працює гра: зріз + сюжет + календар життя (GAME-71). Перевіряється й заморожується в містку (createBridge).
 * Календар читає лише симуляція (зарплата) і команди BookLeave/CancelLeave — у ходах перебору (moves.ts) їх немає.
 */
export const GAME_DEFS: CoreDefs = { ...SLICE_DEFS, story: STORY, life: LIFE };
