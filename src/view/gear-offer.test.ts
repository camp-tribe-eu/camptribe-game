// GAME-73 · меню для спорядження: «висушити» з'являється лише для мокрого, з назвою предмета в обох мовах;
// ціна продажу в меню — та сама, що дасть ядро (за станом).
import { describe, expect, it } from 'vitest';
import { dispatch } from '../core/commands';
import { newSim, type SimState } from '../core/sim';
import type { GameState } from '../core/state';
import { GAME_DEFS } from '../content/slice-defs';
import uk from '../../content/locales/uk.json';
import en from '../../content/locales/en.json';
import ukUi from '../i18n/uk.json';
import enUi from '../i18n/en.json';
import { storyOffer } from './story-offer';

function withGame(patch: (g: GameState) => GameState): SimState {
  const sim = newSim(1, 5_000);
  const r = dispatch(sim.game, { type: 'CreateCharacter', commandId: 'c0', profileId: 'profile.solo-explorer', transportId: 'transport.bike' }, GAME_DEFS);
  if (!r.ok) throw new Error(r.code);
  return { ...sim, game: patch(r.state) };
}

describe('меню спорядження (GAME-73)', () => {
  it('мокрий стартовий намет → дія «висушити» з ключем намету; сухий — дії немає', () => {
    const wet = withGame((g) => ({ ...g, inventory: { 'item.tent': 1 }, gear: { 'item.tent': { condition: 90, wet: true } } }));
    const dry = withGame((g) => ({ ...g, inventory: { 'item.tent': 1 }, gear: {} }));
    const acts = (s: SimState) => storyOffer(s, GAME_DEFS).offer.actions.filter((a) => a.kind === 'dry').map((a) => a.key);
    expect(acts(wet)).toEqual(['item.tent']);
    expect(acts(dry)).toEqual([]);
    expect([uk, en].every((t) => 'item.tent' in t)).toBe(true);
    expect([ukUi, enUi].every((t) => 'act.dry' in t)).toBe(true);
  });

  it('продаж уживаного в меню — за станом: легкий намет на 50 % → половина викупу', () => {
    const s = withGame((g) => ({ ...g, inventory: { 'item.tent-trek': 1 }, gear: { 'item.tent-trek': { condition: 50, wet: false } } }));
    const sell = storyOffer(s, GAME_DEFS).offer.actions.find((a) => a.kind === 'sell' && a.key === 'item.tent-trek');
    expect(sell?.priceCents).toBe(Math.floor((GAME_DEFS.items['item.tent-trek']?.sellCents ?? 0) / 2));
    expect(sell?.priceCents).toBe(5_500);
  });
});

describe('недоступні купівлі, HUD і спорядження в меню (GAME-83)', () => {
  const inShop = (money: number, patch: (g: GameState) => GameState = (g) => g): SimState => {
    const base = withGame((g) => patch({ ...g, moneyCents: money, player: g.player && { ...g.player, locationId: 'loc.shop' } }));
    return base;
  };
  const tentTrek = GAME_DEFS.items['item.tent-trek']?.buyCents ?? 0;

  it('у крамниці без грошей на дорогий намет: він у locked з бракуючою сумою, а не в actions; дешевий — у actions', () => {
    const o = storyOffer(inShop(tentTrek - 2_400), GAME_DEFS).offer;
    const l = o.locked.find((a) => a.key === 'item.tent-trek');
    expect(l?.shortCents).toBe(2_400);
    expect(l?.priceCents).toBe(tentTrek);
    expect(o.actions.some((a) => a.kind === 'buy' && a.key === 'item.tent-trek')).toBe(false);
    // Недоступні не мають наміру: активувати їх нічим.
    expect(storyOffer(inShop(tentTrek - 2_400), GAME_DEFS).intents.has(l?.id ?? '')).toBe(false);
  });
  it('вистачає грошей рівно — купівля в actions, у locked її немає (межа)', () => {
    const o = storyOffer(inShop(tentTrek), GAME_DEFS).offer;
    expect(o.locked.some((a) => a.key === 'item.tent-trek')).toBe(false);
    expect(o.actions.some((a) => a.kind === 'buy' && a.key === 'item.tent-trek')).toBe(true);
  });
  it('поза крамницею (NOT_SOLD_HERE) і для вже наявного (ITEM_ALREADY_HELD) — не показуємо навіть вимкненим', () => {
    const away = withGame((g) => ({ ...g, moneyCents: 0 }));   // гравець удома
    expect(storyOffer(away, GAME_DEFS).offer.locked).toEqual([]);
    const held = inShop(0, (g) => ({ ...g, inventory: { 'item.tent-trek': 1 } }));
    expect(storyOffer(held, GAME_DEFS).offer.locked.some((a) => a.key === 'item.tent-trek')).toBe(false);
  });
  it('HUD: день з 1 і час доби з годинника симуляції', () => {
    const s = inShop(0);
    const at = (minutes: number) => storyOffer({ ...s, clock: { ...s.clock, minutes } }, GAME_DEFS).offer;
    // GAME-99: показ часу зсунуто на DAY_START_MINUTE (08:00 на старті), ядро не чіпали
    expect([at(0).day, at(0).timeMinutes]).toEqual([1, 8 * 60]);
    expect([at(1440 + 75).day, at(1440 + 75).timeMinutes]).toEqual([2, 8 * 60 + 75]);
    expect(at(16 * 60).timeMinutes).toBe(0);   // 16 год після старту — північ показу
  });
  it('інвентар: спорядження зі станом і «мокре», решта речей без gear', () => {
    const s = withGame((g) => ({ ...g, inventory: { 'item.tent': 1, 'item.firewood': 1 }, gear: { 'item.tent': { condition: 80, wet: true } } }));
    const inv = storyOffer(s, GAME_DEFS).offer.inventory;
    expect(inv.find((i) => i.key === 'item.tent')?.gear).toEqual({ condition: 80, wet: true });
    expect(inv.find((i) => i.key === 'item.firewood')?.gear).toBeUndefined();
  });
});
