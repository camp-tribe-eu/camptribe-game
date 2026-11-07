// GAME-276 · обмін із сусідами: ядро (TradeItem) приймає/відхиляє, раз на день на пропозицію, сейв туди-назад, гроші з нічого не створюються.
// Мутації (перевірено, див. PR): прибрати tradeDoneToday у ядрі → «раз на день» червоніє; прибрати tradeIsFair → «гроші з нічого» червоніє;
// у npcs.json 2 ягоди замість 1 → «не дорожче, ніж віддано» (контент) червоніє.
import { describe, expect, it } from 'vitest';
import { dispatch, nextCommandId, type Command } from '../core/commands';
import { newSim, step, type SimState } from '../core/sim';
import { fromSave, serialize } from '../core/save';
import { tradeDoneToday, tradeIsFair, tradeValue, type TradeDef } from '../core/friendship';
import { characterChoices } from '../view/story-offer';
import { backpackModel } from '../view/backpack-model';
import { FRIEND_DEFS } from './friendship';
import type { Move } from './moves';
import { GAME_DEFS as DEFS } from './slice-defs';
import { STORY } from './story';
import { LIFE } from './life';

const CAMP = 'loc.camp.lake';
const CONE = 'item.pine-cone';
const BERRY = 'item.berries';
const send = (sim: SimState, m: Move): SimState => step(sim, { kind: 'command', command: { ...m, commandId: nextCommandId(sim.game) } as Command }, { defs: DEFS });
function camp(inv: Record<string, number> = {}): SimState {
  const s = send(newSim(7, 3_000), (characterChoices(DEFS)[0] as { intent: Move }).intent);
  const g = s.game;
  return { ...s, game: { ...g, player: { ...(g.player as NonNullable<typeof g.player>), locationId: CAMP }, inventory: { ...g.inventory, ...inv } } };
}
const trade = (npcId: string, offerId: string): Move => ({ type: 'TradeItem', npcId, offerId });
const tryTrade = (g: SimState['game'], m: Move, day = 0): { ok: boolean; code?: string; state?: SimState['game'] } => {
  const r = dispatch(g, { ...m, commandId: nextCommandId(g) } as Command, DEFS, undefined, day) as { ok: boolean; code?: string; state?: SimState['game'] };
  return r;
};
const sell = (id: string): number => DEFS.items[id]?.sellCents ?? 0;
const CLAIRE = trade('npc.claire', 'trade.claire-cones');

describe('обмін: каталог із npcs.json', () => {
  it('є 1–2 пропозиції, предмети існують, обмін не створює грошей', () => {
    const t = FRIEND_DEFS.trades ?? [];
    expect(t.length).toBeGreaterThanOrEqual(1);
    expect(t.length).toBeLessThanOrEqual(2);
    for (const o of t) {
      expect(tradeIsFair(o, sell), o.id).toBe(true);
      expect(tradeValue(o.get, sell), `${o.id}: resale(get) ≤ resale(give)`).toBeLessThanOrEqual(tradeValue(o.give, sell));
      for (const l of [...o.give, ...o.get]) expect(DEFS.items[l.itemId], `${o.id}:${l.itemId}`).toBeDefined();
    }
  });
  it('страж вміє червоніти: дорожча «отримую» — нечесний обмін', () => {
    const bad: TradeDef = { id: 'trade.x', npcId: 'npc.claire', give: [{ itemId: CONE, qty: 3 }], get: [{ itemId: BERRY, qty: 2 }] };
    expect(tradeIsFair(bad, sell)).toBe(false);
  });
});

describe('обмін: ядро', () => {
  it('є речі й сусід поруч: шишки йдуть, ягода приходить, гроші не змінились, день запам’ятано', () => {
    const s0 = camp({ [CONE]: 3 });
    const r = tryTrade(s0.game, CLAIRE);
    expect(r.ok).toBe(true);
    const g = (r.state ?? s0.game);
    expect(g.inventory[CONE]).toBeUndefined();
    expect(g.inventory[BERRY]).toBe(1);
    expect(g.moneyCents).toBe(s0.game.moneyCents);
    expect(tradeDoneToday(g.friend, 'trade.claire-cones', 0)).toBe(true);
  });
  it('мало речей — ITEM_NOT_OWNED; нічого не змінилось', () => {
    const s0 = camp({ [CONE]: 2 });
    const r = tryTrade(s0.game, CLAIRE);
    expect(r).toMatchObject({ ok: false, code: 'ITEM_NOT_OWNED' });
  });
  it('раз на день: вдруге того ж дня — GRANT_ALREADY_GIVEN; наступного дня — знову можна', () => {
    const s0 = camp({ [CONE]: 6 });
    const one = tryTrade(s0.game, CLAIRE, 0).state as SimState['game'];
    expect(tryTrade(one, CLAIRE, 0)).toMatchObject({ ok: false, code: 'GRANT_ALREADY_GIVEN' });
    const next = tryTrade(one, CLAIRE, 1);
    expect(next.ok).toBe(true);
    expect(Object.keys((next.state as SimState['game']).friend?.trade ?? {}).sort(), 'книга веде один день').toEqual(['day', 'done']);
    expect((next.state as SimState['game']).friend?.trade?.day).toBe(1);
  });
  it('не там, не той сусід, не та пропозиція, без годинника', () => {
    const s0 = camp({ [CONE]: 3 });
    const away = { ...s0.game, player: { ...(s0.game.player as NonNullable<typeof s0.game.player>), locationId: 'loc.road' } };
    expect(tryTrade(away, CLAIRE)).toMatchObject({ ok: false, code: 'NOT_HERE' });
    expect(tryTrade(s0.game, trade('npc.sarah', 'trade.claire-cones'))).toMatchObject({ ok: false, code: 'UNKNOWN_TARGET' });
    expect(tryTrade(s0.game, trade('npc.claire', 'trade.nope'))).toMatchObject({ ok: false, code: 'UNKNOWN_TARGET' });
    const r = dispatch(s0.game, { ...CLAIRE, commandId: nextCommandId(s0.game) } as Command, DEFS);
    expect(r.ok).toBe(false);
  });
  it('нечесний обмін у зіпсованому контенті ядро теж не пропустить (гроші з нічого)', () => {
    const evil: TradeDef = { id: 'trade.evil', npcId: 'npc.claire', give: [{ itemId: CONE, qty: 3 }], get: [{ itemId: BERRY, qty: 2 }] };
    const defs = { ...DEFS, friendship: { ...FRIEND_DEFS, trades: [evil] } };
    const s0 = camp({ [CONE]: 3 });
    const r = dispatch(s0.game, { ...trade('npc.claire', 'trade.evil'), commandId: nextCommandId(s0.game) } as Command, defs, undefined, 0);
    expect(r).toMatchObject({ ok: false, code: 'CONDITION_FAILED' });
  });
  it('стеля інвентарю: не більше, ніж дозволяє ядро для знахідок', () => {
    const s0 = camp({ [CONE]: 3, [BERRY]: 9999 });
    expect(tryTrade(s0.game, CLAIRE).ok).toBe(false);
  });
  it('сейв туди-назад: книга обмінів повертається; зіпсована відхиляється', () => {
    const s0 = camp({ [CONE]: 3 });
    const sim = { ...s0, game: tryTrade(s0.game, CLAIRE).state as SimState['game'] };
    const back = fromSave(serialize(sim), { story: STORY, life: LIFE });
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.sim.game.friend?.trade).toEqual({ day: 0, done: ['trade.claire-cones'] });
    const fr = sim.game.friend as NonNullable<typeof sim.game.friend>;
    const bad = (trade: unknown): string => { const r = fromSave(serialize({ ...sim, game: { ...sim.game, friend: { ...fr, trade } as never } }), { story: STORY, life: LIFE }); return r.ok ? 'ok' : r.code; };
    expect(bad({ day: 0, done: ['trade.a'] })).toBe('ok');
    expect(bad({ day: 'x', done: [] })).toBe('SAVE_SHAPE');
    expect(bad({ day: 0, done: ['trade.b', 'trade.a'] })).toBe('SAVE_SHAPE');
  });
});

describe('обмін: модель рюкзака', () => {
  const model = (inv: Record<string, number>, can: boolean) => {
    const s = camp(inv).game;
    return backpackModel(s, [], DEFS, false, () => false, null, { npcId: 'npc.claire', can: () => can });
  };
  it('кнопка (tradeId) є лише коли ядро приймає; пропозиція сусіда видна завжди', () => {
    expect(model({ [CONE]: 3 }, true).trades).toEqual([{ id: 'trade.claire-cones', give: [{ id: CONE, qty: 3 }], get: [{ id: BERRY, qty: 1 }], tradeId: 'bp|trade|npc.claire|trade.claire-cones' }]);
    expect(model({ [CONE]: 2 }, false).trades[0]?.tradeId).toBeNull();
    expect(backpackModel(camp({ [CONE]: 3 }).game, [], DEFS, false, () => false).trades).toEqual([]);
  });
});
