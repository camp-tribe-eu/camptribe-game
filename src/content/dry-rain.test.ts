// GAME-88 · «Висушити» просто неба в дощ не пропонується й не приймається — на справжньому контенті (GAME_DEFS),
// повним перебором: кожна локація × кожна погода × мокре спорядження в руках.
// Закон 1: негативний контроль — прибрати правило в commands.ts (або `sheltered` у content/locations.json) → тест червоніє.
import { describe, expect, it } from 'vitest';
import { dispatch } from '../core/commands';
import type { CoreDefs } from '../core/defs';
import { newSim, type SimState } from '../core/sim';
import type { GameState } from '../core/state';
import { WEATHERS, dayOf, weatherOf, type Weather } from '../core/weather';
import { menuMoves, storyOffer } from '../view/story-offer';
import { GAME_DEFS } from './slice-defs';

const DEFS: CoreDefs = GAME_DEFS;
const LOCATIONS = Object.keys((DEFS.story as NonNullable<CoreDefs['story']>).locations);
/** Закріплено літерально, а не виводиться з контенту: змінити «під дахом» мусить свідома правка тесту. */
const SHELTERED = new Set(['loc.home', 'loc.camp.lake']);

const wetAt = (locationId: string): GameState => {
  const r = dispatch(newSim(1, 5_000).game, { type: 'CreateCharacter', commandId: 'c0', profileId: 'profile.solo-explorer', transportId: 'transport.bike' }, DEFS);
  if (!r.ok) throw new Error(r.code);
  const g = r.state;
  return {
    ...g, player: g.player && { ...g.player, locationId },
    inventory: { 'item.tent': 1, 'item.sleeping-bag': 1 },
    gear: { 'item.tent': { condition: 90, wet: true }, 'item.sleeping-bag': { condition: 90, wet: true } },
  };
};
const dryItems = (s: GameState, w?: Weather): string[] =>
  menuMoves(s, DEFS, w).flatMap(({ move }) => (move.type === 'DryGear' ? [move.itemId] : [])).sort();

describe('сушіння в дощ (GAME-88): повний перебір локація × погода', () => {
  it('перебір не порожній: усі локації контенту, обидві групи (під дахом і просто неба), усі погоди', () => {
    expect(LOCATIONS.length).toBeGreaterThanOrEqual(4);
    expect(LOCATIONS.filter((l) => SHELTERED.has(l)).length).toBeGreaterThan(0);
    expect(LOCATIONS.filter((l) => !SHELTERED.has(l)).length).toBeGreaterThan(0);
    expect([...SHELTERED].every((l) => LOCATIONS.includes(l))).toBe(true);
    expect(WEATHERS.length).toBe(3);
    // контроль сторожа: де сушити можна, кнопка справді з'являється (інакше «немає кнопки» ніщо не доводить)
    expect(dryItems(wetAt('loc.home'), 'rain')).toEqual(['item.sleeping-bag', 'item.tent']);
  });

  for (const loc of LOCATIONS) for (const w of WEATHERS) {
    const allowed = w !== 'rain' || SHELTERED.has(loc);
    it(`${loc} / ${w}: ${allowed ? 'кнопка є, ядро приймає' : 'кнопки немає, ядро відхиляє CANNOT_DRY_HERE'}`, () => {
      const s = wetAt(loc);
      expect(dryItems(s, w)).toEqual(allowed ? ['item.sleeping-bag', 'item.tent'] : []);
      const r = dispatch(s, { type: 'DryGear', commandId: 'd1', itemId: 'item.tent' }, DEFS, undefined, 0, w);
      expect(r.ok).toBe(allowed);
      if (!r.ok) {
        expect(r.code).toBe('CANNOT_DRY_HERE');
        expect(r.state.gear).toEqual(s.gear);   // відмова нічого не змінила: стан 90 і мокре
      }
    });
  }

  it('справжнє меню (storyOffer) бере погоду дня зі зерна світу: у дощ у крамниці й на дорозі «висушити» немає', () => {
    const seedWith = (w: Weather): number => { for (let seed = 0; seed < 500; seed++) if (weatherOf(seed, 0) === w) return seed; throw new Error(`немає зерна з ${w}`); };
    const at = (seed: number, loc: string): SimState => ({ ...newSim(seed, 0), game: wetAt(loc) });
    const dries = (s: SimState) => storyOffer(s, DEFS).offer.actions.filter((a) => a.kind === 'dry').map((a) => a.key).sort();
    const rainSim = at(seedWith('rain'), 'loc.shop');
    expect(dayOf(rainSim.clock)).toBe(0);
    expect(dries(rainSim)).toEqual([]);
    expect(dries(at(seedWith('rain'), 'loc.road'))).toEqual([]);
    expect(dries(at(seedWith('rain'), 'loc.home'))).toEqual(['item.sleeping-bag', 'item.tent']);
    expect(dries(at(seedWith('sunny'), 'loc.shop'))).toEqual(['item.sleeping-bag', 'item.tent']);
  });
});
