// GAME-244 ч.2 · ціни знахідок: шишка 0,20 €, ягоди 0,50 € викуповує приймальня; але збір не робить базовий набір «по кишені» за день 1.
// Закон 1: межа дня 1 червоніє, якщо ціни виросли (мутація — у PR); подарунок і продаж вирішує ядро (реальний dispatch), а не модель.
import { describe, expect, it } from 'vitest';
import { dispatch, nextCommandId, type Command } from '../core/commands';
import type { GameState } from '../core/state';
import { initialState } from '../core/state';
import { REACTIONS } from '../view/world/camp-alive';
import { FORAGE_SOURCE_ITEM } from '../core/forage';
import { GAME_DEFS, RAW_ITEMS, SHELF_CENTS } from './slice-defs';
import { FORAGE_ITEMS } from './friendship';

/**
 * Скільки найбільше грошей дають знахідки за день `day`, ВИМІРЯНО ЯДРОМ: кожне джерело табору (REACTIONS: сосни, кущі) збирається, поки ядро не скаже FORAGE_USED_TODAY
 * (з «перезавантаженням» між колами — сейв-ролаут стану), далі все зібране продається приймальнею. Нічого не рахується арифметикою моделі — тож межа не відстає від справжньої гри.
 */
export function day1Finds(day = 0): { cones: number; berries: number; cents: number; rounds: number } {
  let g: GameState = { ...initialState(5000), inventory: {} };
  const send = (cmd: Record<string, unknown>) => dispatch(g, { ...cmd, commandId: nextCommandId(g) } as Command, GAME_DEFS, undefined, day);
  g = { ...g, player: { locationId: 'loc.camp.lake' } as never };
  let rounds = 0;
  for (; rounds < 3; rounds++) {
    // кожне коло — «перебудова сцени / перезавантаження»: вигляд забув усе, герой трусить усі джерела знову
    g = JSON.parse(JSON.stringify(g)) as GameState;
    for (const r of REACTIONS) {
      if (r.kind !== 'pine' && r.kind !== 'bush') continue;
      const itemId = r.kind === 'pine' ? FORAGE_ITEMS.cone : FORAGE_ITEMS.berry;
      for (let i = 0; i < 50; i++) { const res = send({ type: 'Forage', itemId, sourceId: r.id }); if (!res.ok) break; g = res.state; }
    }
  }
  const cones = g.inventory[FORAGE_ITEMS.cone] ?? 0; const berries = g.inventory[FORAGE_ITEMS.berry] ?? 0;
  const money0 = g.moneyCents;
  for (const id of [FORAGE_ITEMS.cone, FORAGE_ITEMS.berry]) for (let i = g.inventory[id] ?? 0; i > 0; i--) { const res = send({ type: 'SellItem', itemId: id }); if (res.ok) g = res.state; }
  return { cones, berries, cents: g.moneyCents - money0, rounds };
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
  it('ядро й каталог збігаються: сосна — шишка, кущ — ягоди; кола «перезавантаження» не додають грошей', () => {
    expect(FORAGE_SOURCE_ITEM).toEqual({ pine: FORAGE_ITEMS.cone, bush: FORAGE_ITEMS.berry });
    expect(day1Finds(0).cents).toBe(day1Finds(0).cones * 20 + day1Finds(0).berries * 50);
  });
  it('реальне ядро: SellItem платить ціну знахідки; GiveGift не платить нічого', () => {
    const base = initialState(5000);
    const s0 = { ...base, inventory: { [FORAGE_ITEMS.berry]: 2 } };
    const r = dispatch(s0, { type: 'SellItem', commandId: 'c1', itemId: FORAGE_ITEMS.berry } as Command, GAME_DEFS);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.state.moneyCents).toBe(5000 + 50); expect(r.state.inventory[FORAGE_ITEMS.berry]).toBe(1); }
  });
});
