// GAME-244 (S3, ч.1) · рюкзак: чиста модель екрана «що в мене є». Лише читає стан і журнал — нічого не змінює й не вигадує:
// «звідки» береться з журналу (останній запис про річ), ціна продажу — та сама, яку дасть ядро (sellPriceOf), а кнопка «Продати»
// з'являється, лише коли гравець стоїть біля приймальні (`atReception`) І ядро саме це продаж прийняло (`canSell` — сухий прогін
// SellItem у ядрі). Ніяких своїх економічних правил: модель не знає, скільки що коштує і чи можна — вона питає ядро.
import type { CoreDefs } from '../core/defs';
import { gearOf, sellPriceOf } from '../core/gear';
import type { JournalEntry } from '../core/sim';
import type { GameState } from '../core/state';

import type { BackpackGroup, BackpackOrigin, BackpackRow, BackpackTrade, OfferBackpack } from '../ui/story-types';
export type { BackpackGroup, BackpackOrigin, BackpackRow, BackpackTrade, OfferBackpack };

export const GROUP_ORDER: readonly BackpackGroup[] = ['gear', 'story', 'finds'];

/** Звідки річ: останній запис журналу про неї. Річ з ціною полиці (shelfCents) лежить у руках лише після каси (ядро: власність — після Checkout; сам Checkout у журналі ланцюга ходів не завжди є), тож Pickup такої речі в інвентарі = куплено. */
export function originOf(itemId: string, journal: readonly JournalEntry[], defs: Pick<CoreDefs, 'items' | 'story' | 'friendship'>, grants: readonly string[]): BackpackOrigin {
  for (let i = journal.length - 1; i >= 0; i--) {
    const e = journal[i] as JournalEntry;
    if (e.type === 'BuyItem' && e.ref === itemId) return 'bought';
    if (e.type === 'Pickup' && e.ref !== null) {
      const d = Object.hasOwn(defs.items, e.ref) ? defs.items[e.ref] : undefined;
      // «Узяти» безкоштовне дає ІНШУ річ (дарунок Анни, asItem): запис про Pickup — на річ-дарунок, а в руках — звичайна.
      if (d?.asItem?.itemId === itemId) return 'gift';
      if (e.ref === itemId) return d?.shelfCents !== undefined ? 'bought' : 'found';
    }
    if (e.type === 'TakeItem' && e.ref === itemId) return 'home';
    if (e.type === 'CompleteQuest' && e.ref !== null) {
      const rw = Object.hasOwn(defs.story?.quests ?? {}, e.ref) ? defs.story?.quests[e.ref]?.reward : undefined;
      if (rw && grants.includes(rw.grantId) && rw.items.some((x) => x.itemId === itemId)) return 'reward';
    }
  }
  return defs.friendship?.forage.includes(itemId) ? 'found' : 'other';
}

export function backpackModel(
  game: Pick<GameState, 'inventory' | 'gear' | 'grants'>, journal: readonly JournalEntry[], defs: Pick<CoreDefs, 'items' | 'story' | 'friendship'>,
  atReception: boolean, canSell: (itemId: string) => boolean,
  gift: { readonly npcId: string; readonly can: (itemId: string) => boolean } | null = null,
  /** GAME-276: сусід поруч з обміном: його пропозиції; `can` — сухий прогін TradeItem у ядрі. */
  trade: { readonly npcId: string; readonly can: (offerId: string) => boolean } | null = null,
): OfferBackpack {
  const forage = new Set(defs.friendship?.forage ?? []);
  const rows = Object.entries(game.inventory).filter(([, q]) => q > 0).sort(([a], [b]) => a.localeCompare(b)).map(([id, qty]): BackpackRow => {
    const def = Object.hasOwn(defs.items, id) ? defs.items[id] : undefined;
    const origin = originOf(id, journal, defs, game.grants);
    const group: BackpackGroup = def?.gear ? 'gear' : forage.has(id) || origin === 'found' ? 'finds' : 'story';
    const sellCents = def && def.sellCents !== undefined ? (sellPriceOf(def, game.gear, id) ?? null) : null;
    return {
      id, qty, group, origin, sellCents,
      ...(def?.gear ? { gear: gearOf(game.gear, id) } : {}),
      sellId: atReception && sellCents !== null && canSell(id) ? `bp|sell|${id}` : null,
      // Подарунок — лише біля мешканця й лише те, що ядро саме прийме (сухий прогін GiveGift: той самий НПС у локації, раз на день, квест-замок).
      giftId: gift !== null && gift.can(id) ? `bp|gift|${gift.npcId}|${id}` : null,
    };
  });
  const trades = trade === null ? [] : (defs.friendship?.trades ?? []).filter((t) => t.npcId === trade.npcId).map((t): BackpackTrade => ({
    id: t.id, give: t.give.map((l) => ({ id: l.itemId, qty: l.qty })), get: t.get.map((l) => ({ id: l.itemId, qty: l.qty })),
    tradeId: trade.can(t.id) ? `bp|trade|${trade.npcId}|${t.id}` : null,
  }));
  return { trades, groups: GROUP_ORDER.map((group) => ({ group, rows: rows.filter((r) => r.group === group) })).filter((g) => g.rows.length > 0), atReception, giftTo: gift?.npcId ?? null, count: rows.reduce((n, r) => n + r.qty, 0) };
}
