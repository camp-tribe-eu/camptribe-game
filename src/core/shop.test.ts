// GAME-81 · купівля лише там, де продається. Ядро й меню відповідають на «чи можна купити тут» одним предикатом (canBuyAt).
// Кожен тест має мутацію (прибрана перевірка локації), яку мусить зловити (закон 1) — результати в повідомленні коміту.
import { describe, expect, it } from 'vitest';
import { dispatch, type Command } from './commands';
import { canBuyAt, checkDefs } from './defs';
import { DRIVER, play, SHOP_DEFS } from './story.fixture';
import { initialState } from './state';

const buy = (itemId: string, id = 'z1'): Command => ({ type: 'BuyItem', commandId: id, itemId });
const home = play([DRIVER, { type: 'Visit', locationId: 'loc.home' }, { type: 'CompleteQuest', questId: 'q.start' }], initialState(5_000), SHOP_DEFS);
const shop = play([{ type: 'Visit', locationId: 'loc.shop' }], home, SHOP_DEFS);

describe('BuyItem: місце купівлі (GAME-81)', () => {
  it('каталог фікстури цілий (позитивний контроль: сторож не червоніє на чистому)', () => {
    expect(checkDefs(SHOP_DEFS)).toEqual([]);
  });

  it('удома купити не можна: NOT_SOLD_HERE, гроші й інвентар ті самі', () => {
    expect(dispatch(home, buy('item.stove'), SHOP_DEFS)).toMatchObject({ ok: false, code: 'NOT_SOLD_HERE', state: { moneyCents: home.moneyCents, inventory: home.inventory } });
  });

  it('у крамниці можна: гроші списано, предмет в інвентарі (контроль: відмова вище — саме через місце)', () => {
    const r = dispatch(shop, buy('item.stove'), SHOP_DEFS);
    expect(r.ok && { money: r.state.moneyCents, qty: r.state.inventory['item.stove'] }).toEqual({ money: shop.moneyCents - 300, qty: 1 });
  });

  it('без персонажа (місця немає) купити не можна', () => {
    expect(dispatch(initialState(5_000), buy('item.stove'), SHOP_DEFS)).toMatchObject({ ok: false, code: 'NOT_SOLD_HERE' });
  });

  it('предикат: ніде не продається — ніде не купиш; каталог без сюжету не має локацій і питати «де» нема чого', () => {
    expect(canBuyAt(SHOP_DEFS, 'item.stove', 'loc.shop')).toBe(true);
    expect(canBuyAt(SHOP_DEFS, 'item.stove', 'loc.home')).toBe(false);
    expect(canBuyAt(SHOP_DEFS, 'item.stove', null)).toBe(false);
    expect(canBuyAt(SHOP_DEFS, 'item.ghost', 'loc.shop')).toBe(false);
    expect(canBuyAt(SHOP_DEFS, 'constructor', 'loc.shop')).toBe(false);
    expect(canBuyAt({ items: { 'item.x': { buyCents: 1 } }, interactions: {} }, 'item.x', undefined)).toBe(true);
  });

  it('предмет сюжету (лежить у локації) не продається ніде: NOT_FOR_SALE навіть у крамниці', () => {
    expect(dispatch(shop, buy('item.gold'), SHOP_DEFS)).toMatchObject({ ok: false, code: 'NOT_FOR_SALE' });
    expect(dispatch(home, buy('item.wood'), SHOP_DEFS)).toMatchObject({ ok: false, code: 'NOT_FOR_SALE' });
  });
});
