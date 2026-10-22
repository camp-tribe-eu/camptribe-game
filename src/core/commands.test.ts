// GAME-12 · властивості командної шини. fast-check із фіксованим зерном, ≥ 1000 випадків.
// Кожна властивість має мутацію (вимкнений запобіжник), яку вона мусить зловити (закон 1).
// Команди — наміри; ціни й нагороди — з каталогу DEFS (рецензія TL PR #13).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { dispatch, type Command, type Safeguards } from './commands';
import type { CoreDefs } from './defs';
import { initialState, REJECT_CODES, type GameState, type RejectCode } from './state';

const SEED = 20261022;
const RUNS = 1000;
const SAFE: Safeguards = { commandId: true, grantId: true, rollback: true };

const DEFS: CoreDefs = {
  items: {
    'item.tent': { buyCents: 12_000, sellCents: 5_000 },
    'item.stove': { buyCents: 3_500, sellCents: 1_000 },
    'item.lamp': { buyCents: 900 },                     // не викуповується
    'item.map': { sellCents: 100 },                      // не продається
  },
  interactions: {
    'obj.campfire': { grantId: 'rw.warmth', moneyCents: 0 },
    'obj.lost-wallet': { grantId: 'rw.finder', moneyCents: 2_000, items: [{ itemId: 'item.map', qty: 1 }] },
    'obj.ranger': { grantId: 'rw.ranger', moneyCents: 500 },
  },
};

const itemId = fc.constantFrom('item.tent', 'item.stove', 'item.lamp', 'item.map', 'item.ghost');
const targetId = fc.constantFrom('obj.campfire', 'obj.lost-wallet', 'obj.ranger', 'obj.ghost');
const cmdId = fc.stringMatching(/^[a-z0-9]{1,6}$/);

const command: fc.Arbitrary<Command> = fc.oneof(
  fc.record({ type: fc.constant('BuyItem' as const), commandId: cmdId, itemId }),
  fc.record({ type: fc.constant('SellItem' as const), commandId: cmdId, itemId }),
  fc.record({ type: fc.constant('Interact' as const), commandId: cmdId, targetId }),
);

/** Випадковий, але досяжний стан: старт + історія команд. */
const reachableState = fc
  .tuple(fc.integer({ min: 0, max: 50_000 }), fc.array(command, { maxLength: 15 }))
  .map(([money, cmds]) => cmds.reduce<GameState>((s, c) => dispatch(s, c, DEFS).state, initialState(money)));

const bytes = (s: GameState): string => JSON.stringify(s);

function holds<Ts extends [unknown, ...unknown[]]>(prop: fc.IProperty<Ts>): boolean {
  return !fc.check(prop, { seed: SEED, numRuns: RUNS }).failed;
}

const replayIsNoop = (g: Safeguards) =>
  fc.property(reachableState, command, (s0, cmd) => {
    const once = dispatch(s0, cmd, DEFS, g).state;
    const twice = dispatch(once, cmd, DEFS, g).state;
    return bytes(twice) === bytes(once);
  });

const grantOnce = (g: Safeguards) =>
  fc.property(reachableState, fc.array(cmdId, { minLength: 2, maxLength: 5 }), (s0, ids) => {
    const uniq = [...new Set(ids.map((id) => `grant-once:${id}`))];
    let s = s0;
    const before = s0.grants.includes('rw.finder');
    for (const id of uniq) s = dispatch(s, { type: 'Interact', commandId: id, targetId: 'obj.lost-wallet' }, DEFS, g).state;
    // Об'єкт «використано» кілька разів (різні commandId) — нагорода рівно раз, а якщо вже була — жодного.
    const expected = before ? s0.moneyCents : s0.moneyCents + 2_000;
    return s.moneyCents === expected && s.grants.filter((x) => x === 'rw.finder').length === 1;
  });

const rejectIsAtomic = (g: Safeguards) =>
  fc.property(reachableState, command, (s0, cmd) => {
    const r = dispatch(s0, cmd, DEFS, g);
    if (r.ok) return true;
    // Побайтно рівний вихідному, крім запису про оброблений commandId і лічильника.
    return bytes({ ...r.state, processed: {}, seq: 0 }) === bytes({ ...s0, processed: {}, seq: 0 });
  });

/** Модель: що МАЄ зробити успішна команда — і жодних інших змін. */
const effectMatchesModel = fc.property(reachableState, command, (s0, cmd) => {
  const r = dispatch(s0, cmd, DEFS);
  if (!r.ok || r.repeated) return true;
  const qty = (s: GameState, id: string): number => (Object.hasOwn(s.inventory, id) ? (s.inventory[id] ?? 0) : 0);
  switch (cmd.type) {
    case 'BuyItem': {
      const price = DEFS.items[cmd.itemId]?.buyCents ?? NaN;
      return r.state.moneyCents === s0.moneyCents - price && qty(r.state, cmd.itemId) === qty(s0, cmd.itemId) + 1
        && r.events.length === 1 && r.events[0]?.type === 'ItemPurchased';
    }
    case 'SellItem': {
      const price = DEFS.items[cmd.itemId]?.sellCents ?? NaN;
      return r.state.moneyCents === s0.moneyCents + price && qty(r.state, cmd.itemId) === qty(s0, cmd.itemId) - 1
        && r.events.length === 1 && r.events[0]?.type === 'ItemSold';
    }
    case 'Interact': {
      const def = DEFS.interactions[cmd.targetId];
      if (!def) return false;
      return r.state.moneyCents === s0.moneyCents + def.moneyCents
        && (def.items ?? []).every(({ itemId: id, qty: n }) => qty(r.state, id) === qty(s0, id) + n)
        && r.state.grants.includes(def.grantId)
        && r.events.length === 1 && r.events[0]?.type === 'RewardGranted';
    }
  }
});

describe('командна шина (GAME-12)', () => {
  it('властивість: успішна команда змінює гроші й інвентар рівно на значення з каталогу й дає одну подію', () => {
    expect(holds(effectMatchesModel)).toBe(true);
  });

  it('властивість: інвентар — лише додатні цілі, гроші — безпечне ціле ≥ 0, seq = кількість оброблених', () => {
    expect(holds(fc.property(reachableState, (s) => Number.isSafeInteger(s.moneyCents) && s.moneyCents >= 0
      && Object.values(s.inventory).every((q) => Number.isSafeInteger(q) && q > 0)
      && s.seq >= Object.keys(s.processed).length))).toBe(true);
  });

  it('властивість: повтор команди з тим самим commandId не змінює стан', () => {
    expect(holds(replayIsNoop(SAFE))).toBe(true);
  });

  it('властивість: нагорода з одним grantId — рівно раз, хоч скільки разів використано об’єкт', () => {
    expect(holds(grantOnce(SAFE))).toBe(true);
  });

  it('властивість: відмовлена команда лишає стан побайтно рівним вихідному', () => {
    expect(holds(rejectIsAtomic(SAFE))).toBe(true);
  });

  it('властивості справді щось перевіряють: у вибірці є і успіхи, і відмови', () => {
    const sample = fc.sample(fc.tuple(reachableState, command), { seed: SEED, numRuns: RUNS }).map(([s, c]) => dispatch(s, c, DEFS).ok);
    expect(sample.filter((ok) => !ok).length).toBeGreaterThan(50);
    expect(sample.filter((ok) => ok).length).toBeGreaterThan(50);
  });

  describe('мутації: вимкнений запобіжник ловиться своєю властивістю', () => {
    it('без перевірки commandId повтор змінює стан', () => {
      expect(holds(replayIsNoop({ ...SAFE, commandId: false }))).toBe(false);
    });
    it('без перевірки grantId нагорода видається двічі', () => {
      expect(holds(grantOnce({ ...SAFE, grantId: false }))).toBe(false);
    });
    it('без відкату відмова лишає часткові зміни', () => {
      expect(holds(rejectIsAtomic({ ...SAFE, rollback: false }))).toBe(false);
    });
  });
});

describe('команда — намір, а не ефект (рецензія TL PR #13)', () => {
  it('ціна з команди ігнорується: зайве поле не змінює списання', () => {
    const forged = { type: 'BuyItem', commandId: 'f1', itemId: 'item.stove', priceCents: 0 } as unknown as Command;
    const r = dispatch(initialState(10_000), forged, DEFS);
    expect(r.state.moneyCents).toBe(10_000 - 3_500);
  });
  it('команди «видати нагороду» не існує: невідомий тип — відмова', () => {
    const forged = { type: 'GrantReward', commandId: 'f2', grantId: 'rw.x', moneyCents: 1e9 } as unknown as Command;
    const r = dispatch(initialState(0), forged, DEFS);
    expect(r).toMatchObject({ ok: false, code: 'INVALID_COMMAND' });
    expect(r.state.moneyCents).toBe(0);
  });
});

describe('коди відмов: кожен код із реєстру має тест, на якому він повертається', () => {
  const s = initialState(1000);
  const reused = dispatch(s, { type: 'BuyItem', commandId: 'u1', itemId: 'item.lamp' }, DEFS);
  const granted = dispatch(s, { type: 'Interact', commandId: 'g1', targetId: 'obj.ranger' }, DEFS);
  const brokenDefs: CoreDefs = { items: { 'item.bad': { buyCents: 1.5 } }, interactions: {} };
  const cases: [RejectCode, GameState, Command, CoreDefs][] = [
    ['INVALID_COMMAND', s, { type: 'BuyItem', commandId: 'c1', itemId: '' }, DEFS],
    ['INVALID_AMOUNT', s, { type: 'BuyItem', commandId: 'c2', itemId: 'item.bad' }, brokenDefs],
    ['INSUFFICIENT_FUNDS', s, { type: 'BuyItem', commandId: 'c3', itemId: 'item.tent' }, DEFS],
    ['ITEM_NOT_OWNED', s, { type: 'SellItem', commandId: 'c4', itemId: 'item.tent' }, DEFS],
    ['GRANT_ALREADY_GIVEN', granted.state, { type: 'Interact', commandId: 'g2', targetId: 'obj.ranger' }, DEFS],
    ['COMMAND_ID_REUSED', reused.state, { type: 'BuyItem', commandId: 'u1', itemId: 'item.stove' }, DEFS],
    ['UNKNOWN_ITEM', s, { type: 'BuyItem', commandId: 'c5', itemId: 'item.ghost' }, DEFS],
    ['UNKNOWN_TARGET', s, { type: 'Interact', commandId: 'c6', targetId: 'obj.ghost' }, DEFS],
    ['NOT_FOR_SALE', s, { type: 'BuyItem', commandId: 'c7', itemId: 'item.map' }, DEFS],
  ];

  it('кожен код реєстру покрито рівно одним прикладом', () => {
    expect(cases.map(([c]) => c).sort()).toEqual([...REJECT_CODES].sort());
  });

  for (const [code, state, cmd, defs] of cases) {
    it(`повертає ${code}`, () => {
      const r = dispatch(state, cmd, defs);
      expect(r.ok).toBe(false);
      expect(r.ok ? null : r.code).toBe(code);
      expect(r.state.moneyCents).toBe(state.moneyCents);
      expect(r.events).toEqual([]);
    });
  }

  it('ключі прототипу як id не створюють предметів і грошей (рецензія PR #13)', () => {
    for (const id of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
      expect(dispatch(initialState(0), { type: 'SellItem', commandId: 'p1', itemId: id }, DEFS)).toMatchObject({ ok: false, code: 'INVALID_COMMAND' });
      expect(dispatch(initialState(0), { type: 'Interact', commandId: 'p2', targetId: id }, DEFS)).toMatchObject({ ok: false, code: 'INVALID_COMMAND' });
    }
    expect(dispatch(s, { type: 'BuyItem', commandId: 'constructor', itemId: 'item.lamp' }, DEFS))
      .toMatchObject({ ok: false, code: 'INVALID_COMMAND', repeated: false });
  });

  it('від\u2019ємні суми в каталозі — INVALID_AMOUNT (зламаний каталог не дарує гроші)', () => {
    const neg: CoreDefs = {
      items: { 'item.neg': { buyCents: -500, sellCents: -1 } },
      interactions: { 'obj.neg': { grantId: 'rw.neg', moneyCents: -1 }, 'obj.zero-qty': { grantId: 'rw.z', moneyCents: 0, items: [{ itemId: 'item.neg', qty: 0 }] } },
    };
    const rich = { ...initialState(1000), inventory: { 'item.neg': 1 } };
    expect(dispatch(rich, { type: 'BuyItem', commandId: 'n1', itemId: 'item.neg' }, neg)).toMatchObject({ code: 'INVALID_AMOUNT' });
    expect(dispatch(rich, { type: 'SellItem', commandId: 'n2', itemId: 'item.neg' }, neg)).toMatchObject({ code: 'INVALID_AMOUNT' });
    expect(dispatch(rich, { type: 'Interact', commandId: 'n3', targetId: 'obj.neg' }, neg)).toMatchObject({ code: 'INVALID_AMOUNT' });
    expect(dispatch(rich, { type: 'Interact', commandId: 'n4', targetId: 'obj.zero-qty' }, neg)).toMatchObject({ code: 'INVALID_AMOUNT' });
  });

  it('переповнення суми грошей — INVALID_AMOUNT, стан не псується', () => {
    const rich = initialState(Number.MAX_SAFE_INTEGER);
    const r = dispatch(rich, { type: 'Interact', commandId: 'o1', targetId: 'obj.ranger' }, DEFS);
    expect(r).toMatchObject({ ok: false, code: 'INVALID_AMOUNT' });
    expect(r.state.moneyCents).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('повтор відмовленої команди повертає ту саму відмову, а не новий результат', () => {
    const cmd: Command = { type: 'BuyItem', commandId: 'r1', itemId: 'item.tent' };
    const first = dispatch(s, cmd, DEFS);
    expect(dispatch(first.state, cmd, DEFS)).toMatchObject({ ok: false, code: 'INSUFFICIENT_FUNDS', repeated: true });
  });

  it('seq росте на кожну нову команду (і на відмову), але не на повтор', () => {
    const a = dispatch(s, { type: 'BuyItem', commandId: 'q1', itemId: 'item.lamp' }, DEFS).state;
    const b = dispatch(a, { type: 'BuyItem', commandId: 'q2', itemId: 'item.ghost' }, DEFS).state;
    const c = dispatch(b, { type: 'BuyItem', commandId: 'q2', itemId: 'item.ghost' }, DEFS).state;
    expect([a.seq, b.seq, c.seq]).toEqual([1, 2, 2]);
  });

  it('вхідний стан не мутується ніколи', () => {
    const frozen = Object.freeze({ ...s, inventory: Object.freeze({}), grants: Object.freeze([]), processed: Object.freeze({}) });
    expect(() => dispatch(frozen, { type: 'BuyItem', commandId: 'f1', itemId: 'item.lamp' }, DEFS)).not.toThrow();
  });
});
