// GAME-81 · купівля лише там, де продається — на справжньому каталозі гри (GAME_DEFS), повним перебором.
// Закон 1: кожен пункт має мутацію (прибрана перевірка в ядрі / ціна повернута предмету сюжету), яку мусить зловити.
import { describe, expect, it } from 'vitest';
import { dispatch, nextCommandId, type Command } from '../core/commands';
import { storyItems } from '../core/defs';
import { initialState, type GameState } from '../core/state';
import { menuMoves } from '../view/story-offer';
import { GAME_DEFS, SHOP } from './slice-defs';
import { exploreView, moves } from './moves';
import { canonical } from '../core/hash';

const MONEY = 10_000;              // достатньо для найдешевшого тир 2 (8 900): купівлі в переборі справді бувають
const STORY = GAME_DEFS.story as NonNullable<typeof GAME_DEFS.story>;
// GAME-110: пам'ятні факти в ключі перебору не множать стани (exploreView, чесність — memory-flags.test).
const progressKey = (s: GameState): string => canonical(exploreView(s, STORY));
const LYING = new Set(Object.values(STORY.locations).flatMap((l) => l.items));
const here = (s: GameState): string | null => s.player?.locationId ?? null;

interface Seen { readonly states: GameState[]; readonly buys: { item: string; at: string | null }[]; readonly menuBuys: { item: string; at: string | null }[] }

/** Повний перебір ходів гравця від створеного персонажа; на кожному стані — і всі спроби ядра, і те, що показало б меню. */
function explore(transportId: string): Seen {
  const created = dispatch(initialState(MONEY), { type: 'CreateCharacter', commandId: 'e0', profileId: 'profile.solo-explorer', transportId }, GAME_DEFS);
  if (!created.ok) throw new Error(`персонаж: ${created.code}`);
  const seen = new Map<string, GameState>([[progressKey(created.state), created.state]]);
  const queue = [created.state];
  const buys: Seen['buys'] = [];
  const menuBuys: Seen['menuBuys'] = [];
  for (let s = queue.shift(); s; s = queue.shift()) {
    // GAME-144: розділ триденний — повний перебір усіх ходів переваливав за 50 000 станів. Крамниця — зміст днів 1–2:
    // після межі дня 2 (вогнище завершено) стани не розгортаємо; день 3 перебирає day3.test.
    if (s.quests['CH1-D2-FIRE-001']?.status === 'completed') continue;
    for (const m of moves(s, GAME_DEFS)) {
      const r = dispatch(s, { ...m, commandId: nextCommandId(s) } as Command, GAME_DEFS);
      if (m.type === 'BuyItem' && r.ok) buys.push({ item: m.itemId, at: here(s) });
      if (!r.ok) continue;
      const k = progressKey(r.state);
      if (!seen.has(k)) { seen.set(k, r.state); queue.push(r.state); }
    }
    for (const { move } of menuMoves(s, GAME_DEFS)) if (move.type === 'BuyItem') menuBuys.push({ item: move.itemId, at: here(s) });
    if (seen.size > 50_000) throw new Error('простір станів вибухнув — тест не доводить нічого');
  }
  return { states: [...seen.values()], buys, menuBuys };
}

const RUNS = ['transport.bike', 'transport.car'].map((t) => [t, explore(t)] as const);

describe('купівля в справжньому каталозі гри (GAME-81)', () => {
  for (const [transport, r] of RUNS) {
    describe(transport, () => {
      it('перебір не порожній: стани в усіх локаціях, купівлі справді бувають (інакше нижче все зелене нічого не доводить)', () => {
        const locations = new Set(r.states.map(here));
        for (const id of Object.keys(STORY.locations)) expect(locations.has(id), id).toBe(true);
        expect(r.buys.length).toBeGreaterThan(0);
        expect(r.menuBuys.length).toBeGreaterThan(0);
      });

      it('№1 ядро: купівля пройшла лише там, де предмет продається', () => {
        for (const b of r.buys) expect(GAME_DEFS.items[b.item]?.soldAt, `${b.item} @ ${b.at}`).toContain(b.at);
        expect(new Set(r.buys.map((b) => b.at))).toEqual(new Set([SHOP]));
      });

      it('№1 меню: кнопка «Купити» є лише там, де предмет продається; в інших локаціях її немає зовсім', () => {
        for (const b of r.menuBuys) expect(GAME_DEFS.items[b.item]?.soldAt, `${b.item} @ ${b.at}`).toContain(b.at);
        for (const loc of Object.keys(STORY.locations)) {
          if (loc !== SHOP) expect(r.menuBuys.filter((b) => b.at === loc), loc).toEqual([]);
        }
      });

      it('№2 те, що сюжет дає безкоштовно в локації, у ній не пропонується до купівлі (у крамниці є «Узяти» ліхтар, але немає «Купити»)', () => {
        for (const s of r.states) {
          const menu = menuMoves(s, GAME_DEFS).map((x) => x.move);
          const loc = here(s);
          const lying = loc === null ? [] : STORY.locations[loc]?.items ?? [];
          for (const id of lying) expect(menu.some((m) => m.type === 'BuyItem' && m.itemId === id), `${id} @ ${loc}`).toBe(false);
        }
        const inShop = r.states.filter((s) => here(s) === SHOP && !s.inventory['item.lantern']);
        expect(inShop.length).toBeGreaterThan(0);
        expect(inShop.some((s) => menuMoves(s, GAME_DEFS).some((x) => x.move.type === 'Pickup' && x.move.itemId === 'item.lantern'))).toBe(true);
      });

      it('№3 властивість: за жодного порядку дій гравець не платить за предмет, що лежить у локації сюжету', () => {
        expect(LYING.has('item.lantern')).toBe(true);
        for (const b of r.buys) expect(LYING.has(b.item), `${b.item} @ ${b.at}`).toBe(false);
        // Наслідок: підняти безкоштовне завжди можна — жоден досяжний стан не тримає предмет сюжету без «Узяти»,
        // тобто ITEM_ALREADY_HELD на Pickup можливий лише після самого Pickup.
        for (const s of r.states) {
          for (const id of LYING) if (s.inventory[id]) expect(s.inventory[id]).toBe(1);
        }
      });
    });
  }

  it('каталог: предмет сюжету не має ціни взагалі, а те, що продається, — тільки в існуючій крамниці', () => {
    for (const id of storyItems(STORY)) expect(GAME_DEFS.items[id]?.buyCents, id).toBeUndefined();
    for (const [id, d] of Object.entries(GAME_DEFS.items)) if (d.buyCents !== undefined) expect(d.soldAt, id).toEqual([SHOP]);
    expect(Object.hasOwn(STORY.locations, SHOP)).toBe(true);
  });

  it('удома, в дорозі й у таборі ядро відмовляє кодом NOT_SOLD_HERE для усього, що має ціну', () => {
    const priced = Object.entries(GAME_DEFS.items).filter(([, d]) => d.buyCents !== undefined).map(([id]) => id);
    expect(priced.length).toBeGreaterThan(0);
    let checked = 0;
    for (const [, r] of RUNS) {
      for (const s of r.states) {
        if (here(s) === SHOP) continue;
        for (const id of priced) {
          const res = dispatch(s, { type: 'BuyItem', commandId: nextCommandId(s), itemId: id } as Command, GAME_DEFS);
          expect(res, `${id} @ ${here(s)}`).toMatchObject({ ok: false, code: 'NOT_SOLD_HERE' });
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
