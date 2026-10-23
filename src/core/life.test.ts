// GAME-71 · календар життя в ядрі: дата з годинника, зарплата, відпустки, школа. Каталог — LIFE_DEFS (story.fixture),
// не content/: числа тут свідомо інші, ніж у контенті (водій має 10 днів відпустки), і тести від смаку власника не залежать.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { dispatch, type Command } from './commands';
import type { CoreDefs } from './defs';
import {
  civilFromDays, dateOf, daysFromCivil, dayKind, payroll, paydayDay, vacationUsed, weekdayOf, yearOf,
  type LifeDefs,
} from './life';
import { payCaseArb, payrollViolation, utcDate, type Stepper } from '../content/life-oracle.test.helpers';
import { fromSave, serialize } from './save';
import { newSim, step, type SimState } from './sim';
import { initialState, type GameState } from './state';
import { BIKER, DRIVER, LIFE_DEFS, play } from './story.fixture';
import { DAY_MINUTES, dayOf } from './weather';

const LIFE = LIFE_DEFS.life as LifeDefs;
const CAL = LIFE.calendar;
const ctx = { defs: LIFE_DEFS };
/** Той самий каталог без календаря життя. */
const NO_LIFE = Object.fromEntries(Object.entries(LIFE_DEFS).filter(([k]) => k !== 'life')) as CoreDefs;
const real: Stepper = (s, i) => step(s, i, ctx);

describe('дата з годинника (SIM-TIME-008): цілочисельний григоріанський календар = Date', () => {
  it('30 років щодня: дата й день тижня збігаються з Date (UTC); високосні 2028, 2032 і невисокосний 2100', () => {
    for (let d = 0; d < 366 * 30; d++) {
      const want = utcDate(CAL.start, d);
      const got = dateOf(CAL, d);
      if (got.y !== want.getUTCFullYear() || got.m !== want.getUTCMonth() + 1 || got.d !== want.getUTCDate() || weekdayOf(CAL, d) !== (want.getUTCDay() || 7)) {
        expect({ d, got, wd: weekdayOf(CAL, d) }).toEqual({ d, want: want.toISOString(), wd: want.getUTCDay() || 7 });
      }
    }
    expect(civilFromDays(daysFromCivil(2100, 3, 1) - 1)).toEqual({ y: 2100, m: 2, d: 28 });
    expect(civilFromDays(daysFromCivil(2000, 3, 1) - 1)).toEqual({ y: 2000, m: 2, d: 29 });
  });

  it('день 0 — вівторок 2027-06-01; перша виплата — 25 червня (день 24)', () => {
    expect(dateOf(CAL, 0)).toEqual({ y: 2027, m: 6, d: 1 });
    expect(weekdayOf(CAL, 0)).toBe(2);
    expect(paydayDay(CAL, 0)).toBe(24);
    expect(dateOf(CAL, paydayDay(CAL, 7))).toEqual({ y: 2028, m: 1, d: 25 });
  });

  it('старт після дня виплати: перша виплата — наступного місяця, не «заднім числом»', () => {
    const late = { ...CAL, start: '2027-06-26' };
    expect(dateOf(late, paydayDay(late, 0))).toEqual({ y: 2027, m: 7, d: 25 });
  });

  it('вид дня: вихідний, свято, робочий, відпустка', () => {
    const life = { paydays: 0, leave: [{ from: 6, days: 2, vacation: 2 }] };
    expect(dayKind(CAL, life, 4)).toBe('weekend');                      // сб 5 червня
    expect(dayKind(CAL, life, 6)).toBe('leave');                        // пн 7 червня — у відпустці
    expect(dayKind(CAL, life, 8)).toBe('work');
    expect(dayKind(CAL, life, daysFromCivil(2028, 5, 1) - daysFromCivil(2027, 6, 1))).toBe('holiday'); // пн 1 травня 2028
  });
});

describe('Спосіб перевірки №1 · зарплата приходить у визначений день, рівно раз (SIM-LIFE-002)', () => {
  const who = [
    { profile: 'profile.a', transport: 'transport.bike' },
    { profile: 'profile.b', transport: 'transport.car' },
    { profile: 'profile.any', transport: 'transport.car' },
  ];

  it('fast-check, 1 000 випадкових станів: кожен крок приносить рівно (зарплата − рахунки) × перетнуті дні виплати', () => {
    fc.assert(fc.property(payCaseArb(who), (c) => payrollViolation(LIFE_DEFS, c, real) === null), { numRuns: 1000, seed: 71 });
  });

  it('негативний контроль: подвійна виплата того самого дня — перевірник червоніє (і називає крок)', () => {
    // Зламаний крок: на день виплати лічильник «забуває» останню виплату — кожен кадр того дня платить знову.
    const twice: Stepper = (s, i) => {
      const n = step(s, i, ctx);
      const day = dayOf(n.clock);
      if (n.game.player && utcDate(CAL.start, day).getUTCDate() === CAL.payday) {
        return { ...n, game: payroll({ ...n.game, life: { ...n.game.life, paydays: n.game.life.paydays - 1 } }, day, LIFE) };
      }
      return n;
    };
    const r = fc.check(fc.property(payCaseArb(who.slice(0, 2)), (c) => payrollViolation(LIFE_DEFS, c, twice) === null), { numRuns: 1000, seed: 71 });
    expect(r.failed).toBe(true);
    // і детермінований випадок: крок, що дійшов до 25 червня, і ще один крок у межах того самого дня
    const v = payrollViolation(LIFE_DEFS, { profile: 'profile.a', transport: 'transport.bike', preMinutes: 0, inputs: [{ kind: 'advance', minutes: 24 * DAY_MINUTES + 60 }, { kind: 'advance', minutes: 10 }] }, twice);
    expect(v).toMatch(/^step 0 .*day 0→24, money \+140000, expected \+70000$/);
  });

  it('негативний контроль: виплата на день пізніше — червоне', () => {
    // Крок без календаря (ядро не платить) + та сама payroll, але з «учора» замість «сьогодні».
    const noLife = { defs: NO_LIFE };
    const late: Stepper = (s, i) => {
      const n = step(s, i, noLife);
      return { ...n, game: payroll(n.game, dayOf(n.clock) - 1, LIFE) };
    };
    const v = payrollViolation(LIFE_DEFS, { profile: 'profile.a', transport: 'transport.bike', preMinutes: 0, inputs: [{ kind: 'advance', minutes: 24 * DAY_MINUTES }, { kind: 'advance', minutes: DAY_MINUTES }] }, late);
    expect(v).toMatch(/^step 0 .*money \+0, expected \+70000$/);
    // контроль контролю: та сама обгортка з «сьогодні» — зелена
    const same: Stepper = (s, i) => { const n = step(s, i, noLife); return { ...n, game: payroll(n.game, dayOf(n.clock), LIFE) }; };
    expect(payrollViolation(LIFE_DEFS, { profile: 'profile.a', transport: 'transport.bike', preMinutes: 0, inputs: [{ kind: 'advance', minutes: 24 * DAY_MINUTES }, { kind: 'advance', minutes: DAY_MINUTES }] }, same)).toBeNull();
  });

  it('10 років в одному кроці: рівно 120 виплат, гроші не зменшуються ніколи; без роботи — нуль', () => {
    for (const [profile, transport, net] of [['profile.a', 'transport.bike', 70_000], ['profile.b', 'transport.car', 0], ['profile.any', 'transport.car', 0]] as const) {
      let s = step(newSim(1), { kind: 'command', command: { type: 'CreateCharacter', commandId: 'c', profileId: profile, transportId: transport } }, ctx);
      s = step(s, { kind: 'advance', minutes: 3653 * DAY_MINUTES }, ctx);
      expect(s.game.life.paydays).toBe(120);
      expect(s.game.moneyCents).toBe(120 * net);
    }
  });

  it('зарплата до персонажа не нараховується заднім числом; лічильник іде вперед', () => {
    let s = step(newSim(1), { kind: 'advance', minutes: 100 * DAY_MINUTES }, ctx);
    expect(s.game.life.paydays).toBe(3);   // день 100 = 9 вересня: 25.06, 25.07, 25.08 минули без персонажа
    s = step(s, { kind: 'command', command: { ...BIKER, commandId: 'c' } }, ctx);
    expect(s.game.moneyCents).toBe(0);
    s = step(s, { kind: 'advance', minutes: 30 * DAY_MINUTES }, ctx);   // 25 вересня — перша виплата персонажу
    expect(s.game.moneyCents).toBe(70_000);
  });

  it('без календаря (defs.life немає) — ні грошей, ні лічильника: старі журнали відтворюються як були', () => {
    const noLife = NO_LIFE;
    let s = step(newSim(1), { kind: 'command', command: { ...BIKER, commandId: 'c' } }, { defs: noLife });
    s = step(s, { kind: 'advance', minutes: 400 * DAY_MINUTES }, { defs: noLife });
    expect(s.game.life).toEqual({ paydays: 0, leave: [] });
    expect(s.game.moneyCents).toBe(0);
  });
});

/** Стан із персонажем і «сьогодні» для прямого dispatch. */
const withChar = (c: typeof BIKER | typeof DRIVER, defs: CoreDefs = LIFE_DEFS): GameState => play([c], initialState(0), defs);
let id = 0;
const book = (s: GameState, from: number, days: number, today = 0, extra: object = {}, defs: CoreDefs = LIFE_DEFS) =>
  dispatch(s, { type: 'BookLeave', commandId: `b${id++}`, from, days, ...extra } as Command, defs, undefined, today);

describe('Спосіб перевірки №3 · відпустка — N днів на рік; вичерпано → VACATION_EXHAUSTED (SIM-LIFE-003)', () => {
  it('водій (10 днів): 7–18 червня витрачає рівно 10; далі будь-який робочий день — VACATION_EXHAUSTED', () => {
    const r = book(withChar(DRIVER), 6, 12);
    expect(r.ok).toBe(true);
    expect(r.state.life.leave).toEqual([{ from: 6, days: 12, vacation: 10 }]);
    expect(vacationUsed(CAL, r.state.life, 2027)).toBe(10);
    for (const day of [20, 21, 50, 100, 150]) {   // пн 21.06, вт 22.06, ср 21.07, чт 9.09, пт 29.10 — робочі
      expect(dayKind(CAL, r.state.life, day)).toBe('work');
      const again = book(r.state, day, 1);
      expect(again.ok ? 'ok' : again.code).toBe('VACATION_EXHAUSTED');
    }
    // вихідні відпустки не витрачають: субота-неділя — можна й після вичерпання
    const weekend = book(r.state, 18, 2);
    expect(weekend.ok).toBe(true);
    expect(weekend.state.life.leave.find((e) => e.from === 18)?.vacation).toBe(0);
  });

  it('межа: рівно N — можна; N + 1 — ні (водій: 9 днів, потім 1 і ще 1)', () => {
    const nine = book(withChar(DRIVER), 6, 11);           // пн 7 — пт 17 червня: 9 робочих
    expect(nine.ok && nine.state.life.leave[0]?.vacation).toBe(9);
    const ten = book(nine.state, 20, 1);                   // пн 21 червня
    expect(ten.ok).toBe(true);
    const eleven = book(ten.state, 21, 1);
    expect(eleven.ok ? 'ok' : eleven.code).toBe('VACATION_EXHAUSTED');
  });

  it('новий рік — новий ліміт; скасування повертає дні; свято не витрачає', () => {
    const full = book(withChar(DRIVER), 6, 12);
    const jan = daysFromCivil(2028, 1, 10) - daysFromCivil(2027, 6, 1);          // пн 10 січня 2028
    const nextYear = book(full.state, jan, 5, 200);
    expect(nextYear.ok).toBe(true);
    expect(vacationUsed(CAL, nextYear.state.life, 2028)).toBe(5);
    const cancelled = dispatch(full.state, { type: 'CancelLeave', commandId: 'x1', from: 6 }, LIFE_DEFS, undefined, 1);
    expect(cancelled.ok && vacationUsed(CAL, cancelled.state.life, 2027)).toBe(0);
    const may1 = daysFromCivil(2028, 5, 1) - daysFromCivil(2027, 6, 1);          // пн 1 травня 2028 — свято
    const hol = book(withChar(DRIVER), may1, 1, 300);
    expect(hol.ok && hol.state.life.leave[0]?.vacation).toBe(0);
  });

  it('fast-check: за будь-якої послідовності бронювань і скасувань використано ≤ N за кожен рік, відпустки без перетинів, сейв вантажиться', () => {
    const op = fc.oneof(
      fc.record({ kind: fc.constant('book' as const), from: fc.integer({ min: 0, max: 900 }), days: fc.integer({ min: 0, max: 35 }), override: fc.boolean() }),
      fc.record({ kind: fc.constant('cancel' as const), from: fc.integer({ min: 0, max: 900 }) }),
      fc.record({ kind: fc.constant('wait' as const), days: fc.integer({ min: 0, max: 120 }) }),
    );
    fc.assert(fc.property(fc.constantFrom(BIKER, DRIVER), fc.array(op, { maxLength: 40 }), (who, ops) => {
      let s: SimState = step(newSim(3), { kind: 'command', command: { ...who, commandId: 'c' } }, ctx);
      let k = 0;
      for (const o of ops) {
        if (o.kind === 'wait') s = step(s, { kind: 'advance', minutes: o.days * DAY_MINUTES }, ctx);
        else if (o.kind === 'book') s = step(s, { kind: 'command', command: { type: 'BookLeave', commandId: `o${k++}`, from: o.from, days: o.days, schoolOverride: o.override } }, ctx);
        else s = step(s, { kind: 'command', command: { type: 'CancelLeave', commandId: `o${k++}`, from: o.from } }, ctx);
        const job = LIFE.jobs[who.profileId];
        const years = new Set(s.game.life.leave.map((e) => yearOf(CAL, e.from)));
        for (const y of years) if (vacationUsed(CAL, s.game.life, y) > (job?.vacationDays ?? 0)) return false;
        const L = s.game.life.leave;
        if (L.some((e, i) => i > 0 && e.from < (L[i - 1]?.from ?? 0) + (L[i - 1]?.days ?? 0))) return false;
      }
      return fromSave(serialize(s)).ok;
    }), { numRuns: 300, seed: 71 });
  });
});

describe('Спосіб перевірки №2 · школяр: довга подорож поза канікулами — лише явним рішенням (SIM-LIFE-004)', () => {
  // Оракул шкільного дня — з Date і рядків календаря, без коду ядра.
  const mmdd = (dt: Date): string => `${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
  const schoolDay = (day: number): boolean => {
    const dt = utcDate(CAL.start, day);
    const x = mmdd(dt);
    const wd = dt.getUTCDay();
    if (wd === 0 || wd === 6 || CAL.publicHolidays.includes(x)) return false;
    return !CAL.schoolHolidays.some((r) => (r.from <= r.to ? r.from <= x && x <= r.to : x >= r.from || x <= r.to));
  };
  const big: CoreDefs = { ...LIFE_DEFS, life: { ...LIFE, calendar: { ...CAL, bookAheadDays: 1000 }, jobs: { ...LIFE.jobs, 'profile.a': { salaryCents: 1, billsCents: 0, vacationDays: 366 }, 'profile.b': { salaryCents: 1, billsCents: 0, vacationDays: 366 } } } };

  it('кожен день 400 днів × довжина 1…20: SCHOOL_TERM ⇔ довга (≥ 4) і зачіпає шкільний день; з рішенням — прийнято; без школяра — ніколи', () => {
    const child = withChar(BIKER, big);
    const solo = withChar(DRIVER, big);
    let refused = 0;
    let accepted = 0;
    for (let from = 0; from < 400; from++) for (let days = 1; days <= 20; days++) {
      const span = Array.from({ length: days }, (_, i) => from + i);
      const want = days >= CAL.longTripDays && span.some(schoolDay);
      const r = book(child, from, days, 0, {}, big);
      const got = !r.ok && r.code === 'SCHOOL_TERM';
      if (got !== want || (!want && !r.ok)) expect({ from, days, code: r.ok ? 'ok' : r.code }).toEqual({ from, days, code: want ? 'SCHOOL_TERM' : 'ok' });
      if (want) {
        refused++;
        expect(book(child, from, days, 0, { schoolOverride: true }, big).ok).toBe(true);
      } else accepted++;
      expect(book(solo, from, days, 0, {}, big).ok).toBe(true);
    }
    // обидві сторони справді трапились: і відмови, і подорожі в канікули
    expect(refused).toBeGreaterThan(1000);
    expect(accepted).toBeGreaterThan(1000);
  });

  it('літні канікули: 16 днів із 3 липня — так; ті самі 16 днів із 23 серпня — SCHOOL_TERM; коротка (3 дні) у шкільний час — так', () => {
    const child = withChar(BIKER);
    expect(book(child, 32, 16).ok).toBe(true);               // сб 3 — нд 18 липня
    const aug = book(child, 83, 16);                          // пн 23 серпня — 7 вересня
    expect(aug.ok ? 'ok' : aug.code).toBe('SCHOOL_TERM');
    expect(book(child, 2, 3).ok).toBe(true);                 // чт 3 — сб 5 червня
  });

  it('рішення має бути саме true: рядок «yes» — INVALID_AMOUNT, а не прийнято', () => {
    const r = book(withChar(BIKER), 4, 9, 0, { schoolOverride: 'yes' });
    expect(r.ok ? 'ok' : r.code).toBe('INVALID_AMOUNT');
  });
});

describe('форма стану календаря в сейві (SAVE_SHAPE)', () => {
  const base = step(step(newSim(5), { kind: 'command', command: { ...DRIVER, commandId: 'c' } }, ctx), { kind: 'command', command: { type: 'BookLeave', commandId: 'b', from: 6, days: 2 } }, ctx);
  const withLife = (life: unknown): string => serialize({ ...base, game: { ...base.game, life } as GameState });
  it.each([
    ['паддей від’ємний', { paydays: -1, leave: [] }],
    ['відпустка 0 днів', { paydays: 0, leave: [{ from: 6, days: 0, vacation: 0 }] }],
    ['витрачено більше за довжину', { paydays: 0, leave: [{ from: 6, days: 2, vacation: 3 }] }],
    ['перетин', { paydays: 0, leave: [{ from: 6, days: 3, vacation: 3 }, { from: 8, days: 1, vacation: 1 }] }],
    ['не відсортовано', { paydays: 0, leave: [{ from: 9, days: 1, vacation: 1 }, { from: 6, days: 1, vacation: 1 }] }],
    ['поля немає', null],
  ])('%s → SAVE_SHAPE', (_, life) => {
    const r = fromSave(withLife(life));
    expect(r.ok ? 'ok' : r.code).toBe('SAVE_SHAPE');
  });
  it('контроль: справжній стан і відпустки встик — вантажаться', () => {
    expect(fromSave(serialize(base)).ok).toBe(true);
    expect(fromSave(withLife({ paydays: 3, leave: [{ from: 6, days: 2, vacation: 2 }, { from: 8, days: 1, vacation: 1 }] })).ok).toBe(true);
  });
});
