// GAME-271 · хвости каси (GAME-246): ціни полиці — одне джерело з items.json; стартовий набір по кишені; стрілка «Сплатити» не веде до мертвої каси.
import { describe, expect, it } from 'vitest';
import items from '../../content/items.json';
import { basketFlag } from '../core/basket';
import { GAME_START_MINUTE } from '../core/clock';
import { newSim, step, type SimState } from '../core/sim';
import { characterChoices } from '../view/story-offer';
import { START_MONEY_CENTS } from '../view/world/bridge';
import { nextCommandId, type Command } from '../core/commands';
import { nextTarget } from './map-first';
import type { Move } from './moves';
import { GAME_DEFS as DEFS, SHELF_CENTS } from './slice-defs';

const card = (id: string): number | undefined => (items as { id: string; priceCents?: number }[]).find((i) => i.id === id)?.priceCents;

describe('GAME-271 · ціни полиці', () => {
  it('намет і спальник на полиці коштують рівно стільки, скільки в items.json (одне джерело)', () => {
    for (const id of ['item.tent', 'item.sleeping-bag']) {
      expect(card(id), id).toBeTypeOf('number');
      expect(SHELF_CENTS[id], id).toBe(card(id));
      expect(DEFS.items[id]?.shelfCents ?? DEFS.items[id]?.buyCents, id).toBeDefined();
    }
  });
  it('база по кишені: намет + спальник ≤ стартових грошей (START_MONEY_CENTS)', () => {
    const kit = (SHELF_CENTS['item.tent'] as number) + (SHELF_CENTS['item.sleeping-bag'] as number);
    expect(kit, `${kit} > ${START_MONEY_CENTS}`).toBeLessThanOrEqual(START_MONEY_CENTS);
    expect(kit + (SHELF_CENTS['item.lantern'] as number)).toBeLessThanOrEqual(START_MONEY_CENTS);
  });
});

const send = (s: SimState, c: Record<string, unknown>): SimState => step(s, { kind: 'command', command: { ...c, commandId: nextCommandId(s.game) } as unknown as Command }, { defs: DEFS });
/** Гравець у крамниці на ST-003 із наметом у кошику; година й гроші — параметри. */
function shopWithBasket(minutes: number, cents: number): SimState {
  const s = send(newSim(7, 3_000), (characterChoices(DEFS)[0] as { intent: Move }).intent);
  const g = s.game;
  return { ...s, clock: { ...s.clock, minutes }, game: { ...g, moneyCents: cents, flags: [...g.flags, basketFlag('item.tent'), basketFlag('item.sleeping-bag')].sort(), player: { ...(g.player as NonNullable<typeof g.player>), locationId: 'loc.shop' }, quests: { ...g.quests, 'ST-003': { status: 'active', done: [] } } } } as SimState;
}
const NOON = 12 * 60 - GAME_START_MINUTE, NIGHT = 23 * 60 - GAME_START_MINUTE;   // ігрові хвилини від 08:00

describe('GAME-271 · стрілка «Сплатити» і мертва каса', () => {
  it('жива каса (відкрито, гроші є) — стрілка на прилавок', () => {
    expect(nextTarget(shopWithBasket(NOON, 5_000), DEFS)).toEqual({ key: 'next.pay', spot: 'obj.buy' });
  });
  it('крамниця зачинена — стрілка на авто, не на прилавок', () => {
    expect(nextTarget(shopWithBasket(NIGHT, 5_000), DEFS)).toEqual({ key: 'next.back-home', spot: 'obj.vehicle' });
  });
  it('нічим платити (менше за суму кошика) — стрілка на авто, не на прилавок', () => {
    expect(nextTarget(shopWithBasket(NOON, 1_000), DEFS)).toEqual({ key: 'next.back-home', spot: 'obj.vehicle' });
  });
});
