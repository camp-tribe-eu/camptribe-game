// GAME-12 · властивості командної шини. fast-check із фіксованим зерном, ≥ 1000 випадків.
// Кожна властивість має мутацію (вимкнений запобіжник), яку вона мусить зловити (закон 1).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { dispatch, type Command, type Safeguards } from './commands';
import { initialState, REJECT_CODES, type GameState, type RejectCode } from './state';

const SEED = 20261022;
const RUNS = 1000;
const SAFE: Safeguards = { commandId: true, grantId: true, rollback: true };

const itemId = fc.constantFrom('item.tent', 'item.stove', 'item.lamp');
const cents = fc.integer({ min: 0, max: 50_000 });
const cmdId = fc.string({ minLength: 1, maxLength: 6 });

const command: fc.Arbitrary<Command> = fc.oneof(
  fc.record({ type: fc.constant('BuyItem' as const), commandId: cmdId, itemId, priceCents: cents }),
  fc.record({ type: fc.constant('SellItem' as const), commandId: cmdId, itemId, priceCents: cents }),
  fc.record({
    type: fc.constant('GrantReward' as const),
    commandId: cmdId,
    grantId: fc.constantFrom('rw.a', 'rw.b', 'rw.c'),
    moneyCents: cents,
    items: fc.array(fc.record({ itemId, qty: fc.integer({ min: 1, max: 3 }) }), { maxLength: 2 }),
  }),
);

/** Випадковий, але досяжний стан: старт + історія команд. */
const reachableState = fc
  .tuple(cents, fc.array(command, { maxLength: 15 }))
  .map(([money, cmds]) => cmds.reduce<GameState>((s, c) => dispatch(s, c).state, initialState(money)));

const bytes = (s: GameState): string => JSON.stringify(s);

function holds<Ts extends [unknown, ...unknown[]]>(prop: fc.IProperty<Ts>): boolean {
  return !fc.check(prop, { seed: SEED, numRuns: RUNS }).failed;
}

// --- три властивості, параметризовані запобіжниками, щоб довести їх мутацією ---

const replayIsNoop = (g: Safeguards) =>
  fc.property(reachableState, command, (s0, cmd) => {
    const once = dispatch(s0, cmd, g).state;
    const twice = dispatch(once, cmd, g).state;
    return bytes(twice) === bytes(once);
  });

const grantOnce = (g: Safeguards) =>
  fc.property(reachableState, cents, fc.array(cmdId, { minLength: 2, maxLength: 5 }), (s0, money, ids) => {
    const fresh = `rw.fresh.${ids.length}`;
    const uniq = [...new Set(ids.map((id) => `grant-once:${id}`))];
    let s = s0;
    for (const id of uniq) s = dispatch(s, { type: 'GrantReward', commandId: id, grantId: fresh, moneyCents: money }, g).state;
    // Квест пройдено кілька разів (різні commandId, той самий grantId) — гроші додано рівно раз.
    return s.moneyCents === s0.moneyCents + money && s.grants.filter((x) => x === fresh).length === 1;
  });

const rejectIsAtomic = (g: Safeguards) =>
  fc.property(reachableState, command, (s0, cmd) => {
    const r = dispatch(s0, cmd, g);
    if (r.ok) return true;
    // Побайтно рівний вихідному, крім запису про оброблений commandId.
    return bytes({ ...r.state, processed: {} }) === bytes({ ...s0, processed: {} });
  });

describe('командна шина (GAME-12)', () => {
  it('властивість: повтор команди з тим самим commandId не змінює стан', () => {
    expect(holds(replayIsNoop(SAFE))).toBe(true);
  });

  it('властивість: нагорода з одним grantId — рівно раз, хоч скільки разів пройдено квест', () => {
    expect(holds(grantOnce(SAFE))).toBe(true);
  });

  it('властивість: відмовлена команда лишає стан побайтно рівним вихідному', () => {
    expect(holds(rejectIsAtomic(SAFE))).toBe(true);
  });

  it('властивості справді щось перевіряють: відмови трапляються у вибірці', () => {
    const rejected = fc.sample(fc.tuple(reachableState, command), { seed: SEED, numRuns: RUNS })
      .filter(([s, c]) => !dispatch(s, c).ok).length;
    expect(rejected).toBeGreaterThan(50);
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

describe('коди відмов: кожен код із реєстру має тест, на якому він повертається', () => {
  const s = initialState(1000);
  const cases: [RejectCode, GameState, Command][] = [
    ['INVALID_COMMAND', s, { type: 'BuyItem', commandId: 'c1', itemId: '', priceCents: 1 }],
    ['INVALID_AMOUNT', s, { type: 'BuyItem', commandId: 'c2', itemId: 'item.tent', priceCents: 1.5 }],
    ['INSUFFICIENT_FUNDS', s, { type: 'BuyItem', commandId: 'c3', itemId: 'item.tent', priceCents: 1001 }],
    ['ITEM_NOT_OWNED', s, { type: 'SellItem', commandId: 'c4', itemId: 'item.tent', priceCents: 1 }],
    [
      'GRANT_ALREADY_GIVEN',
      dispatch(s, { type: 'GrantReward', commandId: 'g1', grantId: 'rw.x', moneyCents: 5 }).state,
      { type: 'GrantReward', commandId: 'g2', grantId: 'rw.x', moneyCents: 5 },
    ],
  ];

  it('кожен код реєстру покрито рівно одним прикладом', () => {
    expect(cases.map(([c]) => c).sort()).toEqual([...REJECT_CODES].sort());
  });

  for (const [code, state, cmd] of cases) {
    it(`повертає ${code}`, () => {
      const r = dispatch(state, cmd);
      expect(r.ok).toBe(false);
      expect(r.ok ? null : r.code).toBe(code);
      expect(r.state.moneyCents).toBe(state.moneyCents);
    });
  }

  it('повтор відмовленої команди повертає ту саму відмову, а не новий результат', () => {
    const cmd: Command = { type: 'BuyItem', commandId: 'r1', itemId: 'item.tent', priceCents: 5000 };
    const first = dispatch(s, cmd);
    const second = dispatch(first.state, cmd);
    expect(second).toMatchObject({ ok: false, code: 'INSUFFICIENT_FUNDS', repeated: true });
  });

  it('вхідний стан не мутується ніколи', () => {
    const frozen = Object.freeze({ ...s, inventory: Object.freeze({}), grants: Object.freeze([]), processed: Object.freeze({}) });
    expect(() => dispatch(frozen, { type: 'BuyItem', commandId: 'f1', itemId: 'item.tent', priceCents: 1 })).not.toThrow();
  });
});
