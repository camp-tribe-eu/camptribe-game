// GAME-304 · вікно «всередині контейнера»: знімок для екрана (src/ui/BoxPanel.tsx). Чиста функція без Phaser і DOM.
// Що лежить на полицях — з каталогу контейнерів (src/content/containers.ts); що вже взято — з фактів ядра (f.take-*, f.pack-*); чи можна взяти зараз — відповідь самого ядра
// (сухий прогін TakeItem). Єдина дія вікна — «взяти» (TakeItem, та сама команда, що була дотиком до речі на підлозі до GAME-304) і «закрити».
import { dispatch, nextCommandId, type Command } from '../core/commands';
import type { CoreDefs } from '../core/defs';
import { packItemsFor } from '../core/packing';
import type { GameState } from '../core/state';
import type { Key } from '../i18n';
import { boxIdOf, boxItemsFor, containerById, itemTaken } from '../content/containers';
import { itemSpot } from '../content/objective-icons';
import type { Move } from '../content/moves';
import type { OfferBox } from '../ui/story-types';

/** id відповіді «Закрити» у вікні контейнера: команди не має — гра лише закриває вікно. */
export const BOX_CLOSE_ID = 'box|close';
/** Префікс id відповіді «Взяти»: `box|take|item.water`. */
export const BOX_TAKE_PREFIX = 'box|take|';

/** Знімок відкритого контейнера (`spot` — об'єкт мапи `box.<id>`); null — нічого не відкрито, гравця немає чи контейнера нема. Наміри «взяти» додає в `intents`. */
export function boxOffer(g: GameState, defs: CoreDefs, spot: string | null, intents: Map<string, Move>, keyOf: (id: string) => string | null, now?: number): OfferBox | null {
  const p = g.player;
  const pk = defs.packing;
  const c = spot === null ? undefined : containerById(boxIdOf(spot));
  if (!p || !pk || !c) return null;
  const info = new Map(packItemsFor(pk, p).map((i) => [i.itemId, i]));
  const slots = boxItemsFor(pk, p, c).map((id) => {
    const taken = itemTaken(g.flags, id);
    const move: Move = { type: 'TakeItem', itemId: id };
    const ok = !taken && dispatch(g, { ...move, commandId: nextCommandId(g) } as Command, defs, undefined, undefined, undefined, now).ok;
    const action = ok ? `${BOX_TAKE_PREFIX}${id}` : null;
    if (action !== null) intents.set(action, move);
    const def = info.get(id);
    return { id, key: keyOf(id) ?? id, spot: itemSpot(id), group: def?.group ?? 'useful', state: taken ? ('taken' as const) : ('here' as const), action };
  });
  return { id: c.id, nameKey: `box.${c.id}` as Key, slots, left: slots.filter((s) => s.state === 'here').length, close: BOX_CLOSE_ID };
}
