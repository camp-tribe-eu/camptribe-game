// Місток (рецензія PR #13): без цих тестів сталий commandId `c0` мовчки зупиняв економіку.
import { describe, expect, it } from 'vitest';
import { STEP_MS } from '../../core/clock';
import { nextCommandId } from '../../core/commands';
import type { CoreDefs } from '../../core/defs';
import { SLICE_DEFS } from '../../content/slice-defs';
import { MAX_FRAME_MS, createBridge } from './bridge';

const DEFS: CoreDefs = { items: { 'item.cup': { buyCents: 100, sellCents: 50 } }, interactions: { 'obj.spring': { grantId: 'rw.spring', moneyCents: 0 } } };

describe('місток', () => {
  it('кожна нова дія — новий commandId і справжня зміна стану (а не кешований повтор)', () => {
    const b = createBridge(1, DEFS);
    for (let i = 0; i < 5; i++) b.send({ type: 'BuyItem', itemId: 'item.cup' });
    expect(b.state.game.inventory['item.cup']).toBe(5);
    expect(b.state.game.moneyCents).toBe(5_000 - 500);
    expect(Object.keys(b.state.game.processed).sort()).toEqual(['c0', 'c1', 'c2', 'c3', 'c4']);
  });

  it('після завантаження сейву id продовжуються, а не починаються з c0', () => {
    const a = createBridge(1, DEFS);
    a.send({ type: 'BuyItem', itemId: 'item.cup' });
    a.send({ type: 'BuyItem', itemId: 'item.cup' });
    const b = createBridge(1, DEFS);
    b.load(JSON.parse(JSON.stringify(a.state)) as typeof a.state);
    b.send({ type: 'BuyItem', itemId: 'item.cup' });
    expect(b.state.game.inventory['item.cup']).toBe(3);
  });

  it('сейв із розбіжністю seq і processed не блокує місток назавжди', () => {
    const b = createBridge(1, DEFS);
    b.send({ type: 'BuyItem', itemId: 'item.cup' });
    const broken = { ...b.state, game: { ...b.state.game, seq: 0 } };   // processed має c0, seq відстає
    expect(nextCommandId(broken.game)).toBe('c1');
    b.load(broken);
    b.send({ type: 'BuyItem', itemId: 'item.cup' });
    expect(b.state.game.inventory['item.cup']).toBe(2);
  });

  it('кадр обрізано: згорнута вкладка (10 с) не перемотує годинник більше ніж на MAX_FRAME_MS', () => {
    const b = createBridge(1, DEFS);
    for (let i = 0; i < 4; i++) b.frame(10_000);
    expect(b.state.clock.minutes).toBe(Math.floor((4 * MAX_FRAME_MS) / STEP_MS));
  });

  it('каталог заморожено: змінити ціну під час гри неможливо', () => {
    const catalog = structuredClone(DEFS) as { items: Record<string, { buyCents: number }> };
    const b = createBridge(1, catalog as CoreDefs);
    catalog.items['item.cup'] = { buyCents: 0 };                         // зміна оригіналу не протікає
    b.send({ type: 'BuyItem', itemId: 'item.cup' });
    expect(b.state.game.moneyCents).toBe(5_000 - 100);
  });

  it('зламаний каталог (викуп дорожчий за купівлю) не запускається', () => {
    expect(() => createBridge(1, { items: { 'item.loop': { buyCents: 10, sellCents: 20 } }, interactions: {} })).toThrow(/DEFS_RESALE_ABOVE_PRICE/);
  });

  it('каталог зрізу гри — цілий', () => {
    expect(() => createBridge(1, SLICE_DEFS)).not.toThrow();
  });
});
