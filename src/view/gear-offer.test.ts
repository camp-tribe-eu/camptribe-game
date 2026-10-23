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
