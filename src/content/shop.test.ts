// GAME-81 · купівля лише там, де продається — на справжньому каталозі гри (GAME_DEFS), повним перебором.
// Закон 1: кожен пункт має мутацію (прибрана перевірка в ядрі / ціна повернута предмету сюжету), яку мусить зловити.
import { describe, expect, it } from 'vitest';
import { dispatch, nextCommandId, type Command } from '../core/commands';
import { storyItems } from '../core/defs';
import { initialState, type GameState } from '../core/state';
import { menuMoves, storyOffer } from '../view/story-offer';
import { GAME_DEFS, SHOP } from './slice-defs';
import { resolveSpot } from './map-first';
import { newSim, step, type SimState } from '../core/sim';
import { exploreView, inertLocations, moves } from './moves';
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
        // GAME-283: інертні локації (без посилань із сюжету) перебір не відвідує; решта — усі.
        const inert = inertLocations(STORY);
        for (const id of Object.keys(STORY.locations)) expect(locations.has(id), id).toBe(!inert.has(id));
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

// GAME-246 · речі Анни (0 €, стан 60) — лише тому, кому нічим платити: правило ядра (CAN_PAY, canPay = готівка + викуп наявного),
// і фільтр moves() — той самий предикат. Закон 1: мутація «canPay без викупу» червонить випадок «11 € + синтетичний спальник»;
// мутація «фільтр moves() = гроші < ціни» червонить рівність «пропоновано = прийнято ядром».
describe('GAME-246 · дарунок Анни лише коли платити нічим', () => {
  const ANNA = ['item.tent-anna', 'item.sleeping-bag-anna'];
  const atShop = (money: number, cmds: readonly Record<string, unknown>[] = []): GameState => {
    let s = initialState(money);
    const all: Record<string, unknown>[] = [
      { type: 'CreateCharacter', profileId: 'profile.solo-explorer', transportId: 'transport.bike' },
      { type: 'CompleteQuest', questId: 'PROLOGUE-HOME-001' }, { type: 'CompleteQuest', questId: 'ST-001' }, { type: 'CompleteQuest', questId: 'ST-002' },
      { type: 'Visit', locationId: 'loc.shop' }, ...cmds,
    ];
    for (const c of all) { const r = dispatch(s, { ...c, commandId: nextCommandId(s) } as unknown as Command, GAME_DEFS); if (!r.ok) throw new Error(`${String(c.type)}: ${r.code}`); s = r.state; }
    return s;
  };
  const offered = (s: GameState): string[] => moves(s, GAME_DEFS).filter((m) => m.type === 'Pickup' && ANNA.includes(m.itemId)).map((m) => (m as { itemId: string }).itemId);
  const accepted = (s: GameState): string[] => ANNA.filter((id) => dispatch(s, { type: 'Pickup', commandId: nextCommandId(s), itemId: id }, GAME_DEFS).ok);
  const cases: [string, GameState, string[]][] = [
    ['100 € — нічого', atShop(10_000), []],
    ['0 € — обидві', atShop(0), ANNA],
    ['11 € готівки без викупу — лише намет (24,99 €); спальник (9,99 €) по кишені', atShop(1_100), ['item.tent-anna']],
    ['11 € + синтетичний спальник (викуп 30 €) — нічого: продай і заплати', atShop(10_000, [{ type: 'BuyItem', itemId: 'item.sleeping-bag-synthetic' }]), []],
    ['6 € + синтетичний спальник — нічого (викуп покриває і намет)', atShop(9_500, [{ type: 'BuyItem', itemId: 'item.sleeping-bag-synthetic' }]), []],
  ];
  it.each(cases)('%s', (_label, s, want) => {
    expect(accepted(s)).toEqual(want);
    expect(offered(s)).toEqual(accepted(s));                                   // фільтр перебору = правило ядра
    for (const id of ANNA) if (!want.includes(id)) expect(dispatch(s, { type: 'Pickup', commandId: nextCommandId(s), itemId: id }, GAME_DEFS)).toMatchObject({ ok: false, code: 'CAN_PAY' });
  });
  it('полиця — лише за готівку: з 0 € намет (24,99 €) у кошик не лягає (INSUFFICIENT_FUNDS) і не пропонується; з 50 € — лягає', () => {
    const poor = atShop(0);
    expect(dispatch(poor, { type: 'Pickup', commandId: nextCommandId(poor), itemId: 'item.tent' }, GAME_DEFS)).toMatchObject({ ok: false, code: 'INSUFFICIENT_FUNDS' });
    expect(moves(poor, GAME_DEFS).some((m) => m.type === 'Pickup' && m.itemId === 'item.tent')).toBe(false);
    const rich = atShop(5_000);
    expect(dispatch(rich, { type: 'Pickup', commandId: nextCommandId(rich), itemId: 'item.tent' }, GAME_DEFS)).toMatchObject({ ok: true, state: { flags: expect.arrayContaining(['f.basket-tent']) } });
    expect(moves(rich, GAME_DEFS).some((m) => m.type === 'Pickup' && m.itemId === 'item.tent')).toBe(true);
    // з наметом у кошику (24,99 €) і 30 € ліхтар (4,99 €) ще лягає, спальник (9,99 €) — уже ні: готівки на весь кошик бракує
    const mid = atShop(3_000, [{ type: 'Pickup', itemId: 'item.tent' }]);
    expect(dispatch(mid, { type: 'Pickup', commandId: nextCommandId(mid), itemId: 'item.lantern' }, GAME_DEFS).ok).toBe(true);
    expect(dispatch(mid, { type: 'Pickup', commandId: nextCommandId(mid), itemId: 'item.sleeping-bag' }, GAME_DEFS)).toMatchObject({ ok: false, code: 'INSUFFICIENT_FUNDS' });
    const mid2 = atShop(3_600, [{ type: 'Pickup', itemId: 'item.tent' }]);
    expect(dispatch(mid2, { type: 'Pickup', commandId: nextCommandId(mid2), itemId: 'item.sleeping-bag' }, GAME_DEFS).ok).toBe(true);
    // з кошиком у меню/переборі — каса, «піти» і полиця, за яку вистачить готівки понад кошик (36 € − намет 24,99 € → спальник 9,99 € і ліхтар 4,99 €
    // ще лягають): гравець кладе кілька речей і платить раз (e2e game-246, intro-walk). Розмов/купівель/продажів з кошиком немає.
    expect([...new Set(moves(mid2, GAME_DEFS).map((m) => m.type))].sort()).toEqual(['Checkout', 'Pickup', 'Visit']);
    expect(moves(mid2, GAME_DEFS).filter((m) => m.type === 'Pickup').map((m) => m.itemId).sort()).toEqual(['item.lantern', 'item.sleeping-bag']);
    // 30 € − намет 24,99 € = 5,01 €: ліхтар (4,99 €) ще лягає, спальник (9,99 €) — ні
    expect(moves(mid, GAME_DEFS).filter((m) => m.type === 'Pickup').map((m) => m.itemId)).toEqual(['item.lantern']);
  });
  it('30 € і спальник у кошику (9,99 €): намет (24,99 €) у кошик не лягає, а дарунок Анни дають — готівки поза кошиком 20,01 €', () => {
    const s = atShop(3_000, [{ type: 'Pickup', itemId: 'item.sleeping-bag' }]);
    expect(dispatch(s, { type: 'Pickup', commandId: nextCommandId(s), itemId: 'item.tent' }, GAME_DEFS)).toMatchObject({ ok: false, code: 'INSUFFICIENT_FUNDS' });
    expect(accepted(s)).toEqual(['item.tent-anna']);
    expect(resolveSpot({ ...newSim(1, 0), game: s }, GAME_DEFS, 'take.item.tent')?.moves).toEqual([{ type: 'Pickup', itemId: 'item.tent-anna' }]);
  });
  it('мапа: полиця намету без грошей дає дарунок Анни, з грошима — намет (resolveSpot take.item.tent)', () => {
    const at = (money: number): SimState => { let sim = newSim(1, money); for (const c of [{ type: 'CreateCharacter', profileId: 'profile.solo-explorer', transportId: 'transport.bike' }, { type: 'CompleteQuest', questId: 'PROLOGUE-HOME-001' }, { type: 'CompleteQuest', questId: 'ST-001' }, { type: 'CompleteQuest', questId: 'ST-002' }, { type: 'Visit', locationId: 'loc.shop' }]) sim = step(sim, { kind: 'command', command: { ...c, commandId: nextCommandId(sim.game) } as unknown as Command }, { defs: GAME_DEFS }); return sim; };
    expect(resolveSpot(at(0), GAME_DEFS, 'take.item.tent')?.moves).toEqual([{ type: 'Pickup', itemId: 'item.tent-anna' }]);
    expect(resolveSpot(at(5_000), GAME_DEFS, 'take.item.tent')?.moves).toEqual([{ type: 'Pickup', itemId: 'item.tent' }]);
  });
  it('мапа: авто з кошиком — удень лише «Сплатити»; о 20:30 (крамниця зачинена) — їде додому, речі лишаються на полиці (як ядро й меню)', () => {
    const g = atShop(5_000, [{ type: 'Pickup', itemId: 'item.lantern' }]);
    const at = (minutes: number): SimState => ({ ...newSim(1, 0), game: g, clock: { ...newSim(1, 0).clock, minutes } });
    expect(resolveSpot(at(240), GAME_DEFS, 'obj.vehicle')?.options).toEqual([{ type: 'Checkout' }]);                 // 12:00
    const night = resolveSpot(at(750), GAME_DEFS, 'obj.vehicle');                                                     // 20:30
    expect(night?.moves).toEqual([{ type: 'Visit', locationId: 'loc.home' }]);
    const r = dispatch(g, { type: 'Visit', commandId: nextCommandId(g), locationId: 'loc.home' }, GAME_DEFS, undefined, undefined, undefined, 750);
    expect(r.ok && r.state.flags.filter((f) => f.startsWith('f.basket-'))).toEqual([]);
  });
  it('мапа: каса з кошиком — пряма дія: намет і спальник у кошику → оплата + завершення ST-003 одним заходом; лише ліхтар → лише оплата; о 20:30 — мертва', () => {
    const sim = (g: GameState, minutes: number): SimState => ({ ...newSim(1, 0), game: g, clock: { ...newSim(1, 0).clock, minutes } });
    const full = atShop(5_000, [{ type: 'Pickup', itemId: 'item.tent' }, { type: 'Pickup', itemId: 'item.sleeping-bag' }]);
    expect(resolveSpot(sim(full, 240), GAME_DEFS, 'obj.buy')).toEqual({ moves: [{ type: 'Checkout' }, { type: 'CompleteQuest', questId: 'ST-003' }] });
    expect(resolveSpot(sim(full, 750), GAME_DEFS, 'obj.buy')).toBeNull();                                        // 20:30 — зачинено
    const lantern = atShop(5_000, [{ type: 'Pickup', itemId: 'item.lantern' }]);
    expect(resolveSpot(sim(lantern, 240), GAME_DEFS, 'obj.buy')).toEqual({ moves: [{ type: 'Checkout' }] });
    // каса обов'язкова: з неоплаченим кошиком ST-003 не завершити (намет не в руках) і не вийти
    const done = dispatch(full, { type: 'CompleteQuest', commandId: nextCommandId(full), questId: 'ST-003' }, GAME_DEFS);
    expect(done.ok).toBe(false);
    expect(!done.ok && ['QUEST_OBJECTIVES_OPEN', 'QUEST_REQUIRES_UNMET'].includes(done.code), !done.ok ? done.code : 'ok').toBe(true);
    expect(dispatch(full, { type: 'Visit', commandId: nextCommandId(full), locationId: 'loc.home' }, GAME_DEFS, undefined, undefined, undefined, 240)).toMatchObject({ ok: false, code: 'UNPAID_BASKET' });
  });
  it('дарунок — звичайна річ у стані 60 і 0 € з гаманця', () => {
    const s = atShop(0);
    const r = dispatch(s, { type: 'Pickup', commandId: nextCommandId(s), itemId: 'item.tent-anna' }, GAME_DEFS);
    expect(r.ok && r.state.inventory['item.tent']).toBe(1);
    expect(r.ok && r.state.gear['item.tent']).toEqual({ condition: 60, wet: false });
    expect(r.ok && r.state.moneyCents).toBe(0);
  });
});

describe('GAME-273 · зачинена крамниця не дає брати з полиці', () => {
  const run = (money: number, cmds: readonly Record<string, unknown>[]): GameState => {
    let s = initialState(money);
    for (const c of cmds) { const r = dispatch(s, { ...c, commandId: nextCommandId(s) } as unknown as Command, GAME_DEFS); if (!r.ok) throw new Error(`${String(c.type)}: ${r.code}`); s = r.state; }
    return s;
  };
  const toShop = [
    { type: 'CreateCharacter', profileId: 'profile.solo-explorer', transportId: 'transport.bike' },
    { type: 'CompleteQuest', questId: 'PROLOGUE-HOME-001' }, { type: 'CompleteQuest', questId: 'ST-001' }, { type: 'CompleteQuest', questId: 'ST-002' },
    { type: 'Visit', locationId: 'loc.shop' },
  ];
  const T2030 = 750, T1000 = 120;   // хвилини від 08:00
  const pick = (s: GameState, itemId: string, now?: number) => dispatch(s, { type: 'Pickup', commandId: nextCommandId(s), itemId } as Command, GAME_DEFS, undefined, undefined, undefined, now);
  /** Те саме, але крізь sim.step (світ і журнал як у грі) — мапа питає й їх. */
  const simAt = (money: number, minutes: number): SimState => { let x = newSim(1, money); for (const c of toShop) x = step(x, { kind: 'command', command: { ...c, commandId: nextCommandId(x.game) } as unknown as Command }, { defs: GAME_DEFS }); return { ...x, clock: { ...x.clock, minutes } }; };

  it('ядро: 20:30 Pickup полиці → SHOP_CLOSED (стан не змінено); 10:00 → ок', () => {
    const s = run(5_000, toShop);
    expect(pick(s, 'item.tent', T2030)).toMatchObject({ ok: false, code: 'SHOP_CLOSED', state: { flags: s.flags } });
    expect(pick(s, 'item.lantern', T2030)).toMatchObject({ ok: false, code: 'SHOP_CLOSED' });
    const day = pick(s, 'item.tent', T1000);
    expect(day.ok && day.state.flags.some((f) => f.startsWith('f.basket-'))).toBe(true);
  });
  it('дарунок Анни (персонал крамниці) о 20:30 теж SHOP_CLOSED; вдень без грошей — ок', () => {
    const s = run(0, toShop);
    expect(pick(s, 'item.tent-anna', T2030)).toMatchObject({ ok: false, code: 'SHOP_CLOSED' });
    expect(pick(s, 'item.tent-anna', T1000).ok).toBe(true);
  });
  it('не полиця: Pickup поза крамницею о 20:30 не відхиляється годинником крамниці', () => {
    const s = run(5_000, toShop);
    const home = run(5_000, [...toShop.slice(0, 4), { type: 'Visit', locationId: 'loc.home' }]);
    const r = pick(home, 'item.tent', T2030);
    expect(!r.ok && r.code).not.toBe('SHOP_CLOSED');
    expect(s.player?.locationId).toBe('loc.shop');
  });
  it('мапа й меню: о 20:30 немає ні take.*, ні кнопок «взяти»; о 10:00 є', () => {
    for (const spot of ['take.item.tent', 'take.item.sleeping-bag', 'take.item.lantern']) {
      expect(resolveSpot(simAt(5_000, T2030), GAME_DEFS, spot), spot).toBeNull();
      expect(resolveSpot(simAt(5_000, T1000), GAME_DEFS, spot), spot).not.toBeNull();
    }
    const kinds = (m: number) => storyOffer(simAt(5_000, m), GAME_DEFS).offer.actions.map((a) => a.kind);
    expect(kinds(T2030)).not.toContain('pickup');
    expect(kinds(T1000)).toContain('pickup');
  });
});
