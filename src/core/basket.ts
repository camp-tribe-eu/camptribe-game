// GAME-246: кошик крамниці. Річ з полиці (ціна `shelfCents`) не стає власністю, а лягає в кошик; власністю її робить лише каса
// (Checkout) тим самим шляхом, що й BuyItem: гроші знімаються, ItemPurchased — у подіях. Кошик — прапорці `f.basket-<річ>`
// (як `f.take-*` пакування): схема збереження не міняється.
import type { CoreDefs } from './defs';

export const BASKET_PREFIX = 'f.basket-';
export const basketFlag = (itemId: string): string => `${BASKET_PREFIX}${itemId.replace(/^item\./, '')}`;

const shelfOf = (defs: CoreDefs, itemId: string): number | undefined => (Object.hasOwn(defs.items, itemId) ? defs.items[itemId]?.shelfCents : undefined);

/** Речі в кошику: лише ті, що мають ціну полиці; порядок — за каталогом (детермінований). */
export function basketOf(flags: readonly string[], defs: CoreDefs): string[] {
  return Object.keys(defs.items).filter((id) => shelfOf(defs, id) !== undefined && flags.includes(basketFlag(id)));
}

/** Сума кошика, центи. */
export function basketTotal(flags: readonly string[], defs: CoreDefs): number {
  return basketOf(flags, defs).reduce((a, id) => a + (shelfOf(defs, id) as number), 0);
}
