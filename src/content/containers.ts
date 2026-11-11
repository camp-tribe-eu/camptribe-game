// GAME-304 · речі вдома лежать у СВОЇХ місцях: продукти — в холодильнику, намет і спорядження — в коморі, одяг і документи — в шафі, гаманець — у тумбі.
// Об'єкт мапи `box.<id>` — контейнер: дотик відкриває «всередину» (крупний план полиць), де гравець бере потрібне й закриває. Нічого не лежить на підлозі.
// Чисті функції без Phaser і DOM. Стан «річ узято» — НЕ нове поле, а факти ядра `f.take-*` / `f.pack-*` (packing.ts): сейв не змінюється.
import type { PackingDefs } from '../core/defs';
import { packFlag, takeFlag, packItemsFor } from '../core/packing';
import type { GameState, PlayerState } from '../core/state';

export interface ContainerDef {
  /** Короткий id: `fridge` → об'єкт мапи `box.fridge`, підписи `box.fridge` / `near.box.fridge` / `agenda.place.fridge` у src/i18n. */
  readonly id: string;
  /** Речі, що тут лежать (id з content/packing.json), у порядку полиць: зверху вниз, зліва направо. */
  readonly items: readonly string[];
}

/** Усі контейнери дому. Кожна річ із content/packing.json — рівно в одному (сторож: containerProblems; тест containers.test.ts). */
export const CONTAINERS: readonly ContainerDef[] = [
  { id: 'fridge', items: ['item.water', 'item.simple-dinner', 'item.snacks'] },
  { id: 'storeroom', items: ['item.tent', 'item.sleeping-bag', 'item.lantern', 'item.lantern-2', 'item.lantern-3', 'item.big-cushion'] },
  { id: 'wardrobe', items: ['item.documents', 'item.clothes', 'item.first-aid'] },
  { id: 'nightstand', items: ['item.wallet', 'item.phones'] },
  { id: 'mia', items: ['item.mia-carrier', 'item.mia-bowl-food', 'item.mia-blanket'] },
];

export const BOX_PREFIX = 'box.';
export const boxSpot = (id: string): string => `${BOX_PREFIX}${id}`;
export const isBoxSpot = (name: string): boolean => name.startsWith(BOX_PREFIX);
export const boxIdOf = (spot: string): string => spot.slice(BOX_PREFIX.length);
export const containerById = (id: string): ContainerDef | undefined => CONTAINERS.find((c) => c.id === id);
export const containerOfItem = (itemId: string): ContainerDef | undefined => CONTAINERS.find((c) => c.items.includes(itemId));
/** Об'єкт мапи, до якого йти по річ. */
export const spotOfItem = (itemId: string): string | null => { const c = containerOfItem(itemId); return c ? boxSpot(c.id) : null; };

/** Речі контейнера, що існують для цього гравця (переноска й миска Мії — лише з кішкою), у порядку полиць. */
export function boxItemsFor(pk: PackingDefs, p: PlayerState, c: ContainerDef): string[] {
  const exist = new Set(packItemsFor(pk, p).map((i) => i.itemId));
  return c.items.filter((id) => exist.has(id));
}

/** Річ узято: у сумці героя або вже в багажнику. З місця вона зникла назавжди (повернути можна лише «що лишимо вдома»). */
export const itemTaken = (flags: readonly string[], itemId: string): boolean => flags.includes(takeFlag(itemId)) || flags.includes(packFlag(itemId));

/** Речі, що ще лежать у контейнері (не взяті). Порожньо — контейнер порожній і на мапі «мовчить». */
export function boxLeft(pk: PackingDefs, g: Pick<GameState, 'flags'>, p: PlayerState, c: ContainerDef): string[] {
  return boxItemsFor(pk, p, c).filter((id) => !itemTaken(g.flags, id));
}

/**
 * СТОРОЖ «нічого не лежить на підлозі» (GAME-304). Повертає список проблем (порожній — усе добре):
 *  * ITEM_NO_CONTAINER — річ зі списку пакування не лежить у жодному контейнері (отже лежала б на підлозі);
 *  * ITEM_TWO_CONTAINERS — річ у двох контейнерах (її місце неоднозначне);
 *  * CONTAINER_UNKNOWN_ITEM — у контейнері лежить річ, якої немає у списку пакування;
 *  * CONTAINER_NOT_ON_MAP — контейнер не має об'єкта `box.<id>` на мапі дому (взяти з нього нічим);
 *  * ITEM_ON_FLOOR — на мапі дому лишився об'єкт `pack.<річ>`: річ лежить просто на підлозі.
 */
export function containerProblems(packingItems: readonly string[], containers: readonly ContainerDef[], mapSpots: readonly string[]): string[] {
  const out: string[] = [];
  for (const id of packingItems) {
    const n = containers.filter((c) => c.items.includes(id)).length;
    if (n === 0) out.push(`ITEM_NO_CONTAINER ${id}`);
    if (n > 1) out.push(`ITEM_TWO_CONTAINERS ${id}`);
  }
  for (const c of containers) {
    for (const id of c.items) if (!packingItems.includes(id)) out.push(`CONTAINER_UNKNOWN_ITEM ${c.id} ${id}`);
    if (!mapSpots.includes(boxSpot(c.id))) out.push(`CONTAINER_NOT_ON_MAP ${c.id}`);
  }
  for (const s of mapSpots) if (s.startsWith('pack.')) out.push(`ITEM_ON_FLOOR ${s}`);
  return out;
}
