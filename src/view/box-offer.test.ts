// GAME-304 · вікно «всередині контейнера» (box-offer.ts): що на полицях, що вже взято, чи можна взяти зараз. Закон 1: кожну перевірку показано червоною мутацією.
import { describe, expect, it } from 'vitest';
import { dispatch, nextCommandId, type Command } from '../core/commands';
import type { PackingDefs } from '../core/defs';
import { packFlag, packItemsFor } from '../core/packing';
import { initialState, type GameState } from '../core/state';
import { CONTAINERS, boxSpot } from '../content/containers';
import type { Move } from '../content/moves';
import { GAME_DEFS } from '../content/slice-defs';
import { BOX_CLOSE_ID, BOX_TAKE_PREFIX, boxOffer } from './box-offer';

const PK = GAME_DEFS.packing as PackingDefs;

/** Гравець удома, пакування відкрите (після крамниці): профіль, транспорт і тварина — за параметрами. */
function packingOpenState(transport: string, animal: string | null): GameState {
  let s = initialState(5_000);
  const send = (m: object): void => {
    const r = dispatch(s, { ...m, commandId: nextCommandId(s) } as Command, GAME_DEFS);
    if (!r.ok) throw new Error(`${JSON.stringify(m)} → ${r.code}`);
    s = r.state;
  };
  send({ type: 'CreateCharacter', profileId: animal ? 'profile.family-teen' : 'profile.solo-explorer', transportId: transport, ...(animal ? { animalId: animal } : {}) });
  for (const q of ['PROLOGUE-HOME-001', 'ST-001', 'ST-002']) send({ type: 'CompleteQuest', questId: q });
  send({ type: 'Visit', locationId: 'loc.shop' }); send({ type: 'Pickup', itemId: 'item.tent' }); send({ type: 'Pickup', itemId: 'item.sleeping-bag' }); send({ type: 'Checkout' });
  send({ type: 'CompleteQuest', questId: 'ST-003' });
  // Ядро на старті вважає все «спакованим за порадою»; удома гра розкладає набір назад по місцях (map-first.unpackMoves) — те саме тут.
  for (const i of packItemsFor(PK, s.player as NonNullable<GameState['player']>)) if (s.flags.includes(packFlag(i.itemId))) send({ type: 'UnpackItem', itemId: i.itemId });
  return s;
}
const key = (id: string): string | null => id;
const take = (s: GameState, itemId: string): GameState => {
  const r = dispatch(s, { type: 'TakeItem', itemId, commandId: nextCommandId(s) } as Command, GAME_DEFS);
  if (!r.ok) throw new Error(`TakeItem ${itemId} → ${r.code}`);
  return r.state;
};

describe('вікно контейнера (GAME-304)', () => {
  it('на полицях — речі контейнера для цього гравця; кожна має відповідь «взяти», що веде до TakeItem; закриття — окрема відповідь без команди', () => {
    const s = packingOpenState('transport.car', 'animal.cat');
    const intents = new Map<string, Move>();
    const box = boxOffer(s, GAME_DEFS, boxSpot('fridge'), intents, key);
    expect(box?.id).toBe('fridge');
    expect(box?.nameKey).toBe('box.fridge');
    expect(box?.slots.map((x) => x.id)).toEqual(['item.water', 'item.simple-dinner', 'item.snacks']);
    expect(box?.left).toBe(3);
    expect(box?.close).toBe(BOX_CLOSE_ID);
    for (const slot of box?.slots ?? []) {
      expect(slot.state).toBe('here');
      expect(slot.action).toBe(`${BOX_TAKE_PREFIX}${slot.id}`);
      expect(intents.get(slot.action as string)).toEqual({ type: 'TakeItem', itemId: slot.id });
    }
    expect(intents.has(BOX_CLOSE_ID), 'закриття команди не має').toBe(false);
  });

  it('узяте стає «взято» без відповіді; лічильник «ще лежить» падає; повторно взяти нічого', () => {
    let s = packingOpenState('transport.car', 'animal.cat');
    s = take(s, 'item.water');
    const intents = new Map<string, Move>();
    const box = boxOffer(s, GAME_DEFS, boxSpot('fridge'), intents, key);
    const water = box?.slots.find((x) => x.id === 'item.water');
    expect(water).toMatchObject({ state: 'taken', action: null });
    expect(intents.has(`${BOX_TAKE_PREFIX}item.water`)).toBe(false);
    expect(box?.left).toBe(2);
  });

  it('речі Мії — лише з кішкою: без неї скринька порожня (її в мапі дому відкрити нічим); кожна річ списку лежить рівно в одному контейнері', () => {
    const solo = packingOpenState('transport.bike', null);
    expect(boxOffer(solo, GAME_DEFS, boxSpot('mia'), new Map(), key)?.slots).toEqual([]);
    const cat = packingOpenState('transport.car', 'animal.cat');
    expect(boxOffer(cat, GAME_DEFS, boxSpot('mia'), new Map(), key)?.slots.map((x) => x.id)).toEqual(['item.mia-carrier', 'item.mia-bowl-food', 'item.mia-blanket']);
    const all = CONTAINERS.flatMap((c) => boxOffer(cat, GAME_DEFS, boxSpot(c.id), new Map(), key)?.slots.map((x) => x.id) ?? []);
    expect(all.sort()).toEqual(PK.items.map((i) => i.itemId).sort());
  });

  it('нічого не відкрито, немає гравця чи невідомий контейнер → null', () => {
    const s = packingOpenState('transport.car', 'animal.cat');
    expect(boxOffer(s, GAME_DEFS, null, new Map(), key)).toBeNull();
    expect(boxOffer(s, GAME_DEFS, 'box.ghost', new Map(), key)).toBeNull();
    expect(boxOffer(initialState(5_000), GAME_DEFS, boxSpot('fridge'), new Map(), key)).toBeNull();
  });

  it('НЕГАТИВНИЙ КОНТРОЛЬ: поки пакування закрите (до кінця крамниці), взяти нічого — відповідей «взяти» немає', () => {
    let s = initialState(5_000);
    const r = dispatch(s, { type: 'CreateCharacter', profileId: 'profile.family-teen', transportId: 'transport.car', animalId: 'animal.cat', commandId: nextCommandId(s) } as Command, GAME_DEFS);
    if (!r.ok) throw new Error(r.code);
    s = r.state;
    const intents = new Map<string, Move>();
    const box = boxOffer(s, GAME_DEFS, boxSpot('fridge'), intents, key);
    expect(box?.slots.every((x) => x.action === null), 'пакування закрите: брати з полиць нічим').toBe(true);
    expect([...intents.keys()]).toEqual([]);
  });
});
