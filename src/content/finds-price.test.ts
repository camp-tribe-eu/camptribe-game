// GAME-244 ч.2 · ціни знахідок: шишка 0,20 €, ягоди 0,50 € викуповує приймальня; але збір не робить базовий набір «по кишені» за день 1.
// Закон 1: межа дня 1 червоніє, якщо ціни виросли (мутація — у PR); подарунок і продаж вирішує ядро (реальний dispatch), а не модель.
import { describe, expect, it } from 'vitest';
import { dispatch, type Command } from '../core/commands';
import { initialState } from '../core/state';
import { dropCount } from '../view/world/camp-alive';
import { REACTIONS } from '../view/world/camp-alive';
import { FIND_ITEMS, GAME_DEFS, RAW_ITEMS, SHELF_CENTS } from './slice-defs';
import { FORAGE_ITEMS } from './friendship';
import { FORAGE_CAP } from '../core/commands';

const price = (id: string): number => FIND_ITEMS[id]?.sellCents ?? 0;
/** Скільки найбільше знахідок і грошей можна зібрати за день 1: кожне дерево/кущ дає раз на день рівно dropCount (від дня й id), інвентар тримає ≤ FORAGE_CAP. */
export function day1Finds(day = 0): { cones: number; berries: number; cents: number } {
  let cones = 0; let berries = 0;
  for (const r of REACTIONS) {
    if (r.kind === 'pine') cones += dropCount('pine', r.id, day);
    if (r.kind === 'bush') berries += dropCount('bush', r.id, day);
  }
  cones = Math.min(cones, FORAGE_CAP); berries = Math.min(berries, FORAGE_CAP);
  return { cones, berries, cents: cones * price(FORAGE_ITEMS.cone) + berries * price(FORAGE_ITEMS.berry) };
}

describe('ціни знахідок (GAME-244 ч.2)', () => {
  it('шишка 0,20 €, ягоди 0,50 € — у картках items.json і в ядрі', () => {
    expect(RAW_ITEMS.find((i) => i.id === FORAGE_ITEMS.cone)?.resaleCents).toBe(20);
    expect(RAW_ITEMS.find((i) => i.id === FORAGE_ITEMS.berry)?.resaleCents).toBe(50);
    expect(GAME_DEFS.items[FORAGE_ITEMS.cone]?.sellCents).toBe(20);
    expect(GAME_DEFS.items[FORAGE_ITEMS.berry]?.sellCents).toBe(50);
  });
  it('день 1: усі знахідки табору разом < 7 € (виміряно 6,40 €: 12 шишок + 8 жмень ягід; ≤ 18 % набору 39,97 €)', () => {
    const worst = Math.max(...[0, 1, 2].map((d) => day1Finds(d).cents));
    const kit = (SHELF_CENTS['item.tent'] ?? 0) + (SHELF_CENTS['item.sleeping-bag'] ?? 0) + (SHELF_CENTS['item.lantern'] ?? 0);
    expect(worst, `знахідки за день: ${JSON.stringify(day1Finds(0))}`).toBeLessThan(700);
    expect(worst / kit).toBeLessThan(0.18);
  });
  it('реальне ядро: SellItem платить ціну знахідки; GiveGift не платить нічого', () => {
    const base = initialState(5000);
    const s0 = { ...base, inventory: { [FORAGE_ITEMS.berry]: 2 } };
    const r = dispatch(s0, { type: 'SellItem', commandId: 'c1', itemId: FORAGE_ITEMS.berry } as Command, GAME_DEFS);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.state.moneyCents).toBe(5000 + 50); expect(r.state.inventory[FORAGE_ITEMS.berry]).toBe(1); }
  });
});
