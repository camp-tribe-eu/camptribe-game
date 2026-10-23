// GAME-73 · спорядження: знос від невисушеного після дощу, сушіння, продаж уживаного за станом, відмова продати
// потрібне активному квесту. Погоду задає тест (StepCtx.weather.of) — день за днем, без везіння зерна.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { dispatch, type Command } from './commands';
import { checkDefs, type CoreDefs } from './defs';
import { CONDITION_MAX, NEW_GEAR, WET_WEAR, gearOf, pruneGear, salePrice, sellPriceOf, wearAfterTrip } from './gear';
import { stateHash } from './hash';
import { fromSave, serialize } from './save';
import { newSim, step, type Input, type SimState, type StepCtx } from './sim';
import { initialState, type GameState } from './state';
import { DRIVER, GEAR_DEFS, play } from './story.fixture';
import type { Weather } from './weather';

const DAY = 1440;
let n = 0;
const cmd = (c: Record<string, unknown>): Input => ({ kind: 'command', command: { ...c, commandId: `w${n++}` } as unknown as Command });
/** Контекст із погодою за розкладом: день → погода (за межами розкладу — сонце). */
const ctxOf = (days: readonly Weather[], defs: CoreDefs = GEAR_DEFS): StepCtx => ({ defs, weather: { of: (_seed, day) => days[day] ?? 'sunny' } });
const runAll = (s: SimState, log: readonly Input[], ctx: StepCtx): SimState => log.reduce((acc, i) => step(acc, i, ctx), s);

/** Водій із наметом і спальником удома, квест q.start завершено — крамниця відкрита. День 0. */
const START: readonly Input[] = [
  cmd(DRIVER), cmd({ type: 'Visit', locationId: 'loc.home' }), cmd({ type: 'CompleteQuest', questId: 'q.start' }),
  cmd({ type: 'BuyItem', itemId: 'item.tent-a' }), cmd({ type: 'BuyItem', itemId: 'item.bag-a' }),
];
const trip = (to: 'loc.shop' | 'loc.home'): Input[] => [cmd({ type: 'Visit', locationId: to }), { kind: 'advance', minutes: DAY }];
const started = (ctx: StepCtx): SimState => runAll(newSim(7, 20_000), START, ctx);

describe('SIM-GEAR-002/003: мокре й невисушене зношується в НАСТУПНІЙ дорозі; висушене — ні (Спосіб перевірки №2)', () => {
  // День 0 — дощ (дорога в крамницю), день 1 — сонце (дорога додому).
  const ctx = ctxOf(['rain', 'sunny', 'sunny']);

  it('дорога в дощ мочить спорядження, але стану ще не знімає', () => {
    const s = runAll(started(ctx), trip('loc.shop'), ctx);
    expect(gearOf(s.game.gear, 'item.tent-a')).toEqual({ condition: 100, wet: true });
    expect(gearOf(s.game.gear, 'item.bag-a')).toEqual({ condition: 100, wet: true });
    expect(s.game.inventory['item.stove']).toBeUndefined();
  });

  it('не висушив → наступна дорога (у сонце) знімає WET_WEAR стану, і річ лишається мокрою', () => {
    const s = runAll(started(ctx), [...trip('loc.shop'), ...trip('loc.home')], ctx);
    expect(gearOf(s.game.gear, 'item.tent-a')).toEqual({ condition: CONDITION_MAX - WET_WEAR, wet: true });
    expect(gearOf(s.game.gear, 'item.bag-a')).toEqual({ condition: CONDITION_MAX - WET_WEAR, wet: true });
  });

  it('висушив між дорогами → наступна дорога стану не знімає (і запис зникає: нове сухе)', () => {
    const dried = [...trip('loc.shop'), cmd({ type: 'DryGear', itemId: 'item.tent-a' }), ...trip('loc.home')];
    const s = runAll(started(ctx), dried, ctx);
    expect(gearOf(s.game.gear, 'item.tent-a')).toEqual(NEW_GEAR);
    expect(s.game.gear['item.tent-a']).toBeUndefined();
    // спальник не сушили — він той самий контроль усередині прогону: зносився
    expect(gearOf(s.game.gear, 'item.bag-a')).toEqual({ condition: CONDITION_MAX - WET_WEAR, wet: true });
  });

  // Рецензія 14117b9 (M1): усі дороги вище — на початку дня, тож «погода виїзду» і «погода приїзду» збігались.
  // Дорога через північ розводить їх: мочить лише дощ дня ВИЇЗДУ (SIM-WX-007).
  const overMidnight = (days: readonly Weather[]): SimState => {
    const c = ctxOf(days);
    const s0 = started(c);
    const late = step(s0, { kind: 'advance', minutes: DAY - 5 - (s0.clock.minutes % DAY) }, c);
    const s = step(late, cmd({ type: 'Visit', locationId: 'loc.shop' }), c);
    expect([Math.floor(late.clock.minutes / DAY), Math.floor(s.clock.minutes / DAY)]).toEqual([0, 1]);   // справді через північ
    return s;
  };
  it('через північ: виїзд у дощ, приїзд у сонце — мокре', () => {
    expect(gearOf(overMidnight(['rain', 'sunny']).game.gear, 'item.tent-a')).toEqual({ condition: 100, wet: true });
  });
  it('через північ: виїзд у сонце, приїзд у дощ — сухе', () => {
    expect(overMidnight(['sunny', 'rain']).game.gear).toEqual({});
  });

  it('сонце щодня — жодного зносу, gear лишається {} (звичайного зносу v1 немає)', () => {
    const sunny = ctxOf([]);
    const s = runAll(started(sunny), [...trip('loc.shop'), ...trip('loc.home'), ...trip('loc.shop')], sunny);
    expect(s.game.gear).toEqual({});
  });

  it('стан не падає нижче нуля: дванадцять мокрих доріг — 0', () => {
    const wet = ctxOf(Array.from({ length: 30 }, () => 'rain' as const));
    const log = Array.from({ length: 12 }, (_, i) => trip(i % 2 ? 'loc.home' : 'loc.shop')).flat();
    const s = runAll(started(wet), log, wet);
    expect(gearOf(s.game.gear, 'item.tent-a')).toEqual({ condition: 0, wet: true });
  });

  it('модель: будь-яка послідовність погоди й сушінь → стан = 100 − 10 × (доріг, у які річ вирушила мокрою)', () => {
    fc.assert(fc.property(
      fc.array(fc.record({ rain: fc.boolean(), dry: fc.boolean() }), { minLength: 1, maxLength: 14 }),
      (plan) => {
        const c = ctxOf(plan.map((p) => (p.rain ? 'rain' : 'cloudy')));
        let s = started(c);
        let wet = false; let wetTrips = 0;
        plan.forEach((p, i) => {
          if (wet) wetTrips++;
          wet = wet || p.rain;
          s = runAll(s, trip(i % 2 ? 'loc.home' : 'loc.shop'), c);
          if (p.dry && wet) { s = step(s, cmd({ type: 'DryGear', itemId: 'item.tent-a' }), c); wet = false; }
        });
        expect(gearOf(s.game.gear, 'item.tent-a')).toEqual({ condition: Math.max(0, CONDITION_MAX - WET_WEAR * wetTrips), wet });
      },
    ), { numRuns: 200 });
  });

  it('стан — лише для того, що в руках: продав мокрий намет — запису немає; купив знову — новий сухий', () => {
    const s = runAll(started(ctx), [...trip('loc.shop'), cmd({ type: 'SellItem', itemId: 'item.tent-a' })], ctx);
    expect(s.game.inventory['item.tent-a']).toBeUndefined();
    expect(Object.keys(s.game.gear)).toEqual(['item.bag-a']);
    const again = step(s, cmd({ type: 'BuyItem', itemId: 'item.tent-a' }), ctx);
    expect(gearOf(again.game.gear, 'item.tent-a')).toEqual(NEW_GEAR);
  });

  it('wearAfterTrip чиста: нічого не змінилось — той самий об\'єкт; предмет без картки не мокне', () => {
    const g = play([DRIVER, { type: 'Visit', locationId: 'loc.home' }, { type: 'CompleteQuest', questId: 'q.start' }, { type: 'BuyItem', itemId: 'item.stove' }], initialState(1_000), GEAR_DEFS);
    expect(wearAfterTrip(g, GEAR_DEFS.items, 'rain')).toBe(g);
    expect(wearAfterTrip(g, GEAR_DEFS.items, 'sunny')).toBe(g);
  });
});

describe('DryGear (SIM-GEAR-005)', () => {
  const ctx = ctxOf(['rain', 'rain', 'rain']);
  const wetAfter2 = runAll(started(ctx), [...trip('loc.shop'), ...trip('loc.home')], ctx);

  it('знімає «мокре», стану не повертає (90 лишається 90)', () => {
    const r = dispatch(wetAfter2.game, { type: 'DryGear', commandId: 'd1', itemId: 'item.tent-a' }, GEAR_DEFS);
    expect(r.ok).toBe(true);
    expect(gearOf(r.state.gear, 'item.tent-a')).toEqual({ condition: 90, wet: false });
  });
  it('сухе — NOT_WET; не в руках — ITEM_NOT_OWNED; не спорядження — NOT_WET; невідоме — UNKNOWN_ITEM', () => {
    const dry = started(ctx).game;
    expect(dispatch(dry, { type: 'DryGear', commandId: 'd2', itemId: 'item.tent-a' }, GEAR_DEFS)).toMatchObject({ ok: false, code: 'NOT_WET' });
    expect(dispatch(dry, { type: 'DryGear', commandId: 'd3', itemId: 'item.stove' }, GEAR_DEFS)).toMatchObject({ ok: false, code: 'ITEM_NOT_OWNED' });
    const stove = play([{ type: 'BuyItem', itemId: 'item.stove' }], dry, GEAR_DEFS);
    expect(dispatch(stove, { type: 'DryGear', commandId: 'd4', itemId: 'item.stove' }, GEAR_DEFS)).toMatchObject({ ok: false, code: 'NOT_WET' });
    expect(dispatch(dry, { type: 'DryGear', commandId: 'd5', itemId: 'item.ghost' }, GEAR_DEFS)).toMatchObject({ ok: false, code: 'UNKNOWN_ITEM' });
  });
  it('спорядження — один примірник моделі: друга купівля — ITEM_ALREADY_HELD, гроші ті самі', () => {
    const g = started(ctx).game;
    expect(dispatch(g, { type: 'BuyItem', commandId: 'd6', itemId: 'item.tent-a' }, GEAR_DEFS)).toMatchObject({ ok: false, code: 'ITEM_ALREADY_HELD', state: { moneyCents: g.moneyCents } });
  });
});

describe('SIM-GEAR-004: продаж уживаного ≤ ціни купівлі (Спосіб перевірки №3)', () => {
  it('властивість: будь-які ціна, викуп ≤ ціни і стан 0…100 → виплата ≤ викупу ≤ ціни; більший стан — не менша виплата', () => {
    fc.assert(fc.property(
      fc.integer({ min: 0, max: 1_000_000_000 }).chain((price) => fc.tuple(fc.constant(price), fc.integer({ min: 0, max: price }))),
      fc.integer({ min: 0, max: 100 }), fc.integer({ min: 0, max: 100 }),
      ([price, resale], c1, c2) => {
        const p1 = salePrice(resale, c1);
        expect(p1).toBeLessThanOrEqual(resale);
        expect(p1).toBeLessThanOrEqual(price);
        expect(Number.isSafeInteger(p1) && p1 >= 0).toBe(true);
        if (c1 <= c2) expect(p1).toBeLessThanOrEqual(salePrice(resale, c2));
        expect(salePrice(resale, 100)).toBe(resale);
        expect(salePrice(resale, 0)).toBe(0);
      },
    ), { numRuns: 2_000 });
  });

  it('властивість через ядро: SellItem уживаного дає ⌊викуп × стан / 100⌋ і ніколи більше за ціну купівлі', () => {
    const owned = started(ctxOf([])).game;
    fc.assert(fc.property(fc.integer({ min: 0, max: 100 }), fc.boolean(), (condition, wet) => {
      const s: GameState = { ...owned, gear: pruneGear({ 'item.tent-a': { condition, wet } }, owned.inventory) };
      const r = dispatch(s, { type: 'SellItem', commandId: 'p1', itemId: 'item.tent-a' }, GEAR_DEFS);
      expect(r.ok).toBe(true);
      const got = r.state.moneyCents - s.moneyCents;
      expect(got).toBe(Math.floor((4_000 * condition) / 100));
      expect(got).toBeLessThanOrEqual(GEAR_DEFS.items['item.tent-a']?.buyCents ?? -1);
      expect(r.events).toEqual([{ type: 'ItemSold', commandId: 'p1', itemId: 'item.tent-a', priceCents: got }]);
      expect(sellPriceOf(GEAR_DEFS.items['item.tent-a'], s.gear, 'item.tent-a')).toBe(got);   // меню показує ту саму ціну
    }), { numRuns: 300 });
  });

  it('купи-продай нового не дає грошей: після купівлі й продажу — не більше, ніж було', () => {
    const g = started(ctxOf([])).game;
    for (const id of ['item.tent-a', 'item.bag-a', 'item.stove']) {
      const sold = play([{ type: 'SellItem', itemId: id }, { type: 'BuyItem', itemId: id }, { type: 'SellItem', itemId: id }], id === 'item.stove' ? play([{ type: 'BuyItem', itemId: id }], g, GEAR_DEFS) : g, GEAR_DEFS);
      expect(sold.moneyCents).toBeLessThanOrEqual(g.moneyCents);
    }
  });
});

describe('SIM-INV-004: останній примірник, потрібний активному квесту, не продається (Спосіб перевірки №3)', () => {
  const atHome = [DRIVER, { type: 'Visit', locationId: 'loc.home' }] as const;

  it('ціль collect активного квесту: дрова в q.mid — ITEM_QUEST_LOCKED; до старту q.mid — продаються', () => {
    const before = play([...atHome, { type: 'Pickup', itemId: 'item.wood' }], initialState(0), GEAR_DEFS);
    expect(dispatch(before, { type: 'SellItem', commandId: 'l1', itemId: 'item.wood' }, GEAR_DEFS).ok).toBe(true);   // q.mid ще не активний
    const during = play([{ type: 'CompleteQuest', questId: 'q.start' }], before, GEAR_DEFS);
    const r = dispatch(during, { type: 'SellItem', commandId: 'l2', itemId: 'item.wood' }, GEAR_DEFS);
    expect(r).toMatchObject({ ok: false, code: 'ITEM_QUEST_LOCKED', events: [] });
    expect(r.state.inventory).toEqual(during.inventory);
    expect(r.state.moneyCents).toBe(during.moneyCents);
  });

  it('другий примірник продати можна — квестові лишається один', () => {
    const two = play([...atHome, { type: 'Pickup', itemId: 'item.wood' }, { type: 'CompleteQuest', questId: 'q.start' }, { type: 'BuyItem', itemId: 'item.wood' }], initialState(1_000), GEAR_DEFS);
    expect(two.inventory['item.wood']).toBe(2);
    const r = dispatch(two, { type: 'SellItem', commandId: 'l3', itemId: 'item.wood' }, GEAR_DEFS);
    expect(r.ok && r.state.inventory['item.wood']).toBe(1);
    expect(dispatch(r.state, { type: 'SellItem', commandId: 'l4', itemId: 'item.wood' }, GEAR_DEFS)).toMatchObject({ ok: false, code: 'ITEM_QUEST_LOCKED' });
  });

  it('requires квесту, куди веде перехід активного: золото для q.gate (вибір із q.mid) — ITEM_QUEST_LOCKED', () => {
    const s = play([...atHome, { type: 'CompleteQuest', questId: 'q.start' }, { type: 'BuyItem', itemId: 'item.gold' }], initialState(2_000), GEAR_DEFS);
    expect(dispatch(s, { type: 'SellItem', commandId: 'l5', itemId: 'item.gold' }, GEAR_DEFS)).toMatchObject({ ok: false, code: 'ITEM_QUEST_LOCKED' });
    // контроль: предмет, якого квест не потребує, у тому самому стані продається
    const stove = play([{ type: 'BuyItem', itemId: 'item.stove' }], s, GEAR_DEFS);
    expect(dispatch(stove, { type: 'SellItem', commandId: 'l6', itemId: 'item.stove' }, GEAR_DEFS).ok).toBe(true);
  });

  it('у справжньому контенті цей випадок відсікається ще статично: такі defs checkDefs не пропускає (два рубежі)', () => {
    expect(checkDefs(GEAR_DEFS).filter((f) => f.code === 'DEFS_STORY_ITEM_SELLABLE').map((f) => f.where).sort()).toEqual(['item.gold', 'item.wood']);
  });
});

describe('стан спорядження в сейві (SIM-GEAR-006)', () => {
  const ctx = ctxOf(['rain', 'sunny']);
  const live = runAll(started(ctx), [...trip('loc.shop'), ...trip('loc.home')], ctx);

  it('serialize → fromSave: gear той самий, хеш той самий; без поля хеш інший (поле справді в хеші)', () => {
    expect(Object.keys(live.game.gear).sort()).toEqual(['item.bag-a', 'item.tent-a']);
    const r = fromSave(serialize(live));
    expect(r.ok && r.sim.game.gear).toEqual(live.game.gear);
    expect(r.ok && stateHash(r.sim)).toBe(stateHash(live));
    expect(stateHash({ ...live, game: { ...live.game, gear: {} } })).not.toBe(stateHash(live));
  });

  const broken: [string, unknown][] = [
    ['стан 101', { 'item.tent-a': { condition: 101, wet: true } }],
    ['стан −1', { 'item.tent-a': { condition: -1, wet: true } }],
    ['стан дробовий', { 'item.tent-a': { condition: 50.5, wet: false } }],
    ['wet не boolean', { 'item.tent-a': { condition: 90, wet: 'yes' } }],
    ['запис для предмета, якого немає в руках', { 'item.ghost': { condition: 90, wet: true } }],
    ['запис нового сухого (не канонічна форма)', { 'item.tent-a': { condition: 100, wet: false } }],
    ['gear не об\'єкт', []],
  ];
  for (const [name, gear] of broken) {
    it(`SAVE_SHAPE: ${name}`, () => {
      const sim = { ...live, game: { ...live.game, gear } } as unknown as SimState;
      const r = fromSave(serialize(sim));
      expect(r.ok ? 'ok' : `${r.code}: ${r.detail}`).toBe('SAVE_SHAPE: game: gear');
    });
  }
});

describe('SIM-GEAR-004: виплата округлюється вниз (рецензія 14117b9, M6)', () => {
  it('викуп 10,01 € за стану 33 → 3,30 €, а не 3,31', () => {
    expect(salePrice(1001, 33)).toBe(330);
    expect(salePrice(999, 1)).toBe(9);
  });
});
