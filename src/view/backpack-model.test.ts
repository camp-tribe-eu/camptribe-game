// GAME-244 · модель рюкзака: групи, «звідки», продаж лише біля приймальні й лише коли ядро прийме. Закон 1: кожен рядок мутовано (див. PR).
import { describe, expect, it } from 'vitest';
import type { JournalEntry } from '../core/sim';
import { backpackModel, originOf } from './backpack-model';

const defs = {
  items: {
    'item.tent': { buyCents: 2499, sellCents: 1500, gear: { kind: 'tent' } },
    'item.bag': { buyCents: 1000, sellCents: 600, gear: { kind: 'sleeping-bag' } },
    'item.tent-anna': { asItem: { itemId: 'item.tent', condition: 60 } },
    'item.documents': {},
    'item.cone': {},
    'item.wood': {},
    'item.shelf': { shelfCents: 500, sellCents: 300 },
    'item.medal': {},
  },
  story: { quests: { 'Q.1': { reward: { grantId: 'g.1', moneyCents: 0, items: [{ itemId: 'item.medal', qty: 1 }] } } } },
  friendship: { forage: ['item.cone'] },
} as never;
const j = (type: JournalEntry['type'], ref: string | null): JournalEntry => ({ at: 0, commandId: `${type}${ref}`, type, ref });
const game = (inv: Record<string, number>, grants: string[] = []) => ({ inventory: inv, gear: {}, grants }) as never;

describe('originOf (GAME-244)', () => {
  it('BuyItem → bought', () => expect(originOf('item.tent', [j('BuyItem', 'item.tent')], defs, [])).toBe('bought'));
  it('Pickup з полиці без каси не «куплено», з Checkout після — куплено', () => {
    expect(originOf('item.shelf', [j('Pickup', 'item.shelf')], defs, [])).toBe('other');
    expect(originOf('item.shelf', [j('Pickup', 'item.shelf'), j('Checkout', null)], defs, [])).toBe('bought');
  });
  it('Pickup речі без ціни полиці → found; дарунок Анни (asItem) → gift', () => {
    expect(originOf('item.wood', [j('Pickup', 'item.wood')], defs, [])).toBe('found');
    expect(originOf('item.tent', [j('Pickup', 'item.tent-anna')], defs, [])).toBe('gift');
  });
  it('нагорода квесту — лише коли її видано (grant), інакше other', () => {
    expect(originOf('item.medal', [j('CompleteQuest', 'Q.1')], defs, ['g.1'])).toBe('reward');
    expect(originOf('item.medal', [j('CompleteQuest', 'Q.1')], defs, [])).toBe('other');
  });
  it('TakeItem → home; нове перекриває старе (куплено, потім продано й знайдено → found)', () => {
    expect(originOf('item.documents', [j('TakeItem', 'item.documents')], defs, [])).toBe('home');
    expect(originOf('item.wood', [j('BuyItem', 'item.wood'), j('Pickup', 'item.wood')], defs, [])).toBe('found');
  });
  it('без журналу: збирання (forage) → found, решта → other', () => {
    expect(originOf('item.cone', [], defs, [])).toBe('found');
    expect(originOf('item.documents', [], defs, [])).toBe('other');
  });
});

describe('backpackModel (GAME-244)', () => {
  const journal = [j('TakeItem', 'item.documents'), j('BuyItem', 'item.tent'), j('Pickup', 'item.wood')];
  const inv = { 'item.tent': 1, 'item.documents': 1, 'item.wood': 2, 'item.cone': 1 };
  it('групи: спорядження → речі історії → знахідки, порожні групи зникають', () => {
    const m = backpackModel(game(inv), journal, defs, false, () => true);
    expect(m.groups.map((g) => [g.group, g.rows.map((r) => r.id)])).toEqual([['gear', ['item.tent']], ['story', ['item.documents']], ['finds', ['item.cone', 'item.wood']]]);
    expect(m.count).toBe(5);
    expect(backpackModel(game({ 'item.documents': 1 }), journal, defs, false, () => true).groups.map((g) => g.group)).toEqual(['story']);
  });
  it('«звідки» й ціна продажу в рядках', () => {
    const rows = backpackModel(game(inv), journal, defs, false, () => true).groups.flatMap((g) => g.rows);
    expect(rows.find((r) => r.id === 'item.tent')).toMatchObject({ origin: 'bought', sellCents: 1500 });
    expect(rows.find((r) => r.id === 'item.documents')).toMatchObject({ origin: 'home', sellCents: null });
  });
  it('продаж пропонується лише біля приймальні', () => {
    const away = backpackModel(game(inv), journal, defs, false, () => true).groups.flatMap((g) => g.rows);
    expect(away.every((r) => r.sellId === null)).toBe(true);
    const at = backpackModel(game(inv), journal, defs, true, () => true).groups.flatMap((g) => g.rows);
    expect(at.find((r) => r.id === 'item.tent')?.sellId).toBe('bp|sell|item.tent');
  });
  it('продаж — лише коли ядро приймає й річ має ціну викупу', () => {
    const at = backpackModel(game(inv), journal, defs, true, (id) => id !== 'item.tent').groups.flatMap((g) => g.rows);
    expect(at.find((r) => r.id === 'item.tent')?.sellId).toBeNull();     // ядро відмовило (квест-замок, зачинено)
    expect(at.find((r) => r.id === 'item.wood')?.sellId).toBeNull();     // ціни викупу немає
  });
});
