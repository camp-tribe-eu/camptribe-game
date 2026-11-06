// GAME-246: кошик крамниці. Річ з полиці (ціна `shelfCents`) не стає власністю, а лягає в кошик; власністю її робить лише каса
// (Checkout) тим самим шляхом, що й BuyItem: гроші знімаються, ItemPurchased — у подіях. Кошик — прапорці `f.basket-<річ>`
// (як `f.take-*` пакування): схема збереження не міняється.
import type { CoreDefs } from './defs';
import { sellPriceOf } from './gear';
import type { GameState } from './state';

export const BASKET_PREFIX = 'f.basket-';
export const basketFlag = (itemId: string): string => `${BASKET_PREFIX}${itemId.replace(/^item\./, '')}`;

const shelfOf = (defs: CoreDefs, itemId: string): number | undefined => (Object.hasOwn(defs.items, itemId) ? defs.items[itemId]?.shelfCents : undefined);

/** Речі в кошику: лише ті, що мають ціну полиці; порядок — за каталогом (детермінований). */
export function basketOf(flags: readonly string[], defs: CoreDefs): string[] {
  return Object.keys(defs.items).filter((id) => shelfOf(defs, id) !== undefined && flags.includes(basketFlag(id)));
}

/**
 * Чи є чим заплатити `cents`: готівка поза кошиком (кошик — уже обіцяні гроші) плюс викуп усього, що крамниця забирає назад
 * (sellPriceOf — за станом). Речі Анни (0 €,
 * `asItem`) ядро дає ЛИШЕ коли платити нічим: інакше дарунок — паралельна гілка (інший стан спорядження й гаманця) через усі
 * дні розділу, і повний перебір (menu-here, bot) ріс у 1,7 раза без нового досяжного кінця (виміряно в GAME-246).
 */
export function canPay(g: Pick<GameState, 'moneyCents' | 'inventory' | 'gear' | 'flags'>, defs: CoreDefs, cents: number): boolean {
  let have = g.moneyCents - basketTotal(g.flags, defs);
  for (const [id, qty] of Object.entries(g.inventory)) {
    const price = Object.hasOwn(defs.items, id) ? sellPriceOf(defs.items[id], g.gear, id) : undefined;
    if (price !== undefined) have += price * qty;
  }
  return have >= cents;
}

/** Сума кошика, центи. */
export function basketTotal(flags: readonly string[], defs: CoreDefs): number {
  return basketOf(flags, defs).reduce((a, id) => a + (shelfOf(defs, id) as number), 0);
}
