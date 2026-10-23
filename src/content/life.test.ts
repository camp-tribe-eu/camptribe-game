// GAME-71 · календар життя на СПРАВЖНЬОМУ контенті (content/calendar.json, content/profiles.json): чотири пункти «Способу
// перевірки» картки. Ядро доводить правила на власному каталозі (src/core/life.test.ts); тут — що смак власника в контенті
// їх справді виконує, і що кожна перевірка вміє почервоніти.
import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { dispatch, type Command } from '../core/commands';
import type { CoreDefs } from '../core/defs';
import { isSchoolDay, isWorkday, vacationUsed, yearOf, type LifeDefs } from '../core/life';
import { initialState, type GameState } from '../core/state';
import { step, type SimState } from '../core/sim';
import { DAY_MINUTES } from '../core/weather';
import { enumerateCombos } from '../../scripts/validator/combos.mjs';
import { validate } from '../../scripts/validator/checks.mjs';
import { loadContent } from '../../scripts/validator/load.mjs';
import { LIFE } from './life';
import { moves, progressKey } from './moves';
import { runYearBot, type YearReport } from './life-bot';
import { payCaseArb, payrollViolation, type PayCoverage } from './life-oracle.test.helpers';
import { GAME_DEFS } from './slice-defs';
import { CONTENT } from './story';

const CAL = LIFE.calendar;
const PROFILES = CONTENT.profiles.map((p) => p.id);
/** Кожен профіль контенту — з першим дозволеним транспортом (календар від транспорту не залежить). */
const WHO = enumerateCombos(CONTENT).filter((c, i, all) => all.findIndex((x) => x.profile === c.profile) === i)
  .map((c) => ({ profile: c.profile as string, transport: c.transport as string }));
const withLife = (life: LifeDefs): CoreDefs => ({ ...GAME_DEFS, life });

describe('контент календаря (DC-022, DC-026)', () => {
  it('валідатор контенту чистий; у КОЖНОГО профілю є робота з N днями відпустки в content/ (тимч.)', () => {
    const loaded = loadContent('content');
    expect(loaded.issues).toEqual([]);
    expect(validate(loaded.content, { today: '2026-10-23' })).toEqual([]);
    expect(Object.keys(LIFE.jobs).sort()).toEqual([...PROFILES].sort());
    for (const p of PROFILES) expect(LIFE.jobs[p]?.vacationDays).toBeGreaterThan(0);
    expect(WHO.map((w) => w.profile).sort()).toEqual([...PROFILES].sort());
    expect(LIFE.schoolProfiles).toEqual(['profile.family-teen']);
  });
});

describe('№1 · зарплата кожного профілю — у визначений день, рівно раз (fast-check, 1 000 випадкових станів)', () => {
  // Поїздки тут не перетинають північ: локації контенту відкриває сюжет (квести), а випадковий журнал його не проходить —
  // шлях «дорога через день виплати» доводить ядро на каталозі з дорогами (src/core/life.test.ts), з числом покриття.
  it('кожен крок приносить рівно (зарплата − рахунки) × перетнуті дні виплати; до персонажа — нічого; кадр через північ — теж', () => {
    const seen: PayCoverage = { frame: 0, command: 0, advance: 0 };
    fc.assert(fc.property(payCaseArb(WHO), (c) => payrollViolation(GAME_DEFS, c, (s, i) => step(s, i, { defs: GAME_DEFS }), seen) === null), { numRuns: 1000, seed: 2071 });
    console.info(`GAME-71 оракул (контент): кроків із виплатою — кадр ${seen.frame}, команда ${seen.command}, перемотування ${seen.advance}`);
    expect(seen.frame).toBeGreaterThan(20);
    expect(seen.advance).toBeGreaterThan(20);
  });

  it('негативний контроль: подвійна виплата (той самий день платить двічі) — червоне', () => {
    const twice = (s: SimState, i: Parameters<typeof step>[1]): SimState => {
      const n = step(s, i, { defs: GAME_DEFS });
      // ще раз той самий день із «забутим» лічильником
      return n.game.life.paydays > s.game.life.paydays && n.game.player
        ? step({ ...n, game: { ...n.game, life: { ...n.game.life, paydays: n.game.life.paydays - 1 } } }, { kind: 'advance', minutes: 0 }, { defs: GAME_DEFS })
        : n;
    };
    const r = fc.check(fc.property(payCaseArb(WHO), (c) => payrollViolation(GAME_DEFS, c, twice) === null), { numRuns: 1000, seed: 2071 });
    expect(r.failed).toBe(true);
  });
});

/** Стан із персонажем профілю контенту. */
function created(profile: string, defs: CoreDefs = GAME_DEFS): GameState {
  const who = WHO.find((w) => w.profile === profile);
  const r = dispatch(initialState(0), { type: 'CreateCharacter', commandId: 'c', profileId: profile, transportId: who?.transport ?? '' }, defs);
  if (!r.ok) throw new Error(`CreateCharacter ${profile}: ${r.code}`);
  return r.state;
}
let n = 0;
const book = (s: GameState, from: number, days: number, extra: object = {}, defs: CoreDefs = GAME_DEFS) =>
  dispatch(s, { type: 'BookLeave', commandId: `k${n++}`, from, days, ...extra } as Command, defs, undefined, 0);
const firstSchoolDay = (from = 0): number => { let d = from; while (!isSchoolDay(CAL, d)) d++; return d; };

describe('№2 · профіль зі школярем: довга подорож поза канікулами — лише явним рішенням (шкільний календар контенту)', () => {
  it('сім’я: 7 днів зі шкільним днем → SCHOOL_TERM; те саме з schoolOverride: true → так; соло — так без рішення', () => {
    const d = firstSchoolDay();
    const fam = book(created('profile.family-teen'), d, 7);
    expect(fam.ok ? 'ok' : fam.code).toBe('SCHOOL_TERM');
    expect(book(created('profile.family-teen'), d, 7, { schoolOverride: true }).ok).toBe(true);
    expect(book(created('profile.solo-explorer'), d, 7).ok).toBe(true);
  });

  it('кожен день року × 7 і 14 днів: сім’ї відмовлено ⇔ подорож зачіпає шкільний день; у канікули — можна', () => {
    const fam = created('profile.family-teen');
    let inHolidays = 0;
    for (let from = 0; from < 366; from++) for (const days of [7, 14]) {
      const span = Array.from({ length: days }, (_, i) => from + i);
      const r = book(fam, from, days);
      const school = span.some((x) => isSchoolDay(CAL, x));
      if (school) expect(r.ok ? 'ok' : r.code).toBe('SCHOOL_TERM');
      else { expect(r.ok).toBe(true); inHolidays++; }
    }
    expect(inHolidays).toBeGreaterThan(20);   // канікули в контенті справді дають довгі подорожі
  });

  it('негативний контроль: без позначки школяра в профілі — відмов немає, перевірка «SCHOOL_TERM» червоніє', () => {
    const noSchool = withLife({ ...LIFE, schoolProfiles: [] });
    const r = book(created('profile.family-teen', noSchool), firstSchoolDay(), 7, {}, noSchool);
    expect(r.ok).toBe(true);
  });
});

describe('№3 · робочий профіль має N днів відпустки на рік (N — content/profiles.json); усе витрачено → VACATION_EXHAUSTED', () => {
  for (const profile of PROFILES) {
    it(`${profile}: однодневні відпустки в робочі дні 2027 — рівно N приймається, (N + 1)-ша — VACATION_EXHAUSTED; 2028 — знову можна`, () => {
      const N = LIFE.jobs[profile]?.vacationDays as number;
      // Однодневна відпустка коротша за «довгу» подорож — школи не стосується, тож однаково для обох профілів.
      const workdays2027 = Array.from({ length: 214 }, (_, d) => d).filter((d) => isWorkday(CAL, d) && yearOf(CAL, d) === 2027);
      expect(workdays2027.length).toBeGreaterThan(N);
      let s = created(profile);
      for (const d of workdays2027.slice(0, N)) {
        const r = book(s, d, 1);
        expect(r.ok ? 'ok' : r.code).toBe('ok');
        if (r.ok) s = r.state;
      }
      expect(vacationUsed(CAL, s.life, 2027)).toBe(N);
      const over = book(s, workdays2027[N] as number, 1);
      expect(over.ok ? 'ok' : over.code).toBe('VACATION_EXHAUSTED');
      const jan2028 = Array.from({ length: 30 }, (_, i) => 214 + i).find((d) => isWorkday(CAL, d)) as number;
      expect(book(s, jan2028, 1).ok).toBe(true);
    });
  }

  it('негативний контроль: N + 1 у контенті — (N + 1)-ша відпустка проходить, і перевірка вище почервоніла б', () => {
    const p = PROFILES[0] as string;
    const N = LIFE.jobs[p]?.vacationDays as number;
    const more = withLife({ ...LIFE, jobs: { ...LIFE.jobs, [p]: { ...(LIFE.jobs[p] as NonNullable<LifeDefs['jobs'][string]>), vacationDays: N + 1 } } });
    const workdays = Array.from({ length: 214 }, (_, d) => d).filter((d) => isWorkday(CAL, d));
    let s = created(p, more);
    for (const d of workdays.slice(0, N + 1)) { const r = book(s, d, 1, {}, more); expect(r.ok).toBe(true); if (r.ok) s = r.state; }
  });
});

describe('№4 · бот: кожен профіль має ≥ 2 подорожі по ≥ 7 днів на ігровий рік (SIM-LIFE-005)', () => {
  const DAYS = 214 + 366 + 365;            // 2027-06-01 … 2029-12-31: неповний 2027, високосний 2028, 2029
  const reports: Record<string, YearReport> = {};
  // У beforeAll, а не під час збору тестів (як bot.test): тайм-аут діє, виняток — провал тесту, а не збою збирання.
  beforeAll(() => { for (const w of WHO) reports[w.profile] = runYearBot(GAME_DEFS, w.profile, w.transport, DAYS); }, 60_000);

  for (const w of WHO) {
    it(`${w.profile}: 2027, 2028, 2029 — по ≥ 2 подорожі ≥ 7 днів; школяр — лише без шкільних днів; гроші не падають`, () => {
      const r = reports[w.profile] as YearReport;
      expect(r.longTripsByYear).toEqual({ 2027: expect.any(Number), 2028: expect.any(Number), 2029: expect.any(Number) });
      for (const y of [2027, 2028, 2029]) expect(r.longTripsByYear[y], `${w.profile} ${y}: ${JSON.stringify(r.trips)}`).toBeGreaterThanOrEqual(2);
      if (LIFE.schoolProfiles.includes(w.profile)) {
        for (const t of r.trips) for (let d = t.from; d < t.from + t.days; d++) expect(isSchoolDay(CAL, d)).toBe(false);
      }
      const job = LIFE.jobs[w.profile];
      expect(r.moneyCents).toBe(r.sim.game.life.paydays * ((job?.salaryCents ?? 0) - (job?.billsCents ?? 0)));
    });
  }

  it('негативний контроль: 5 днів відпустки на рік — у якийсь рік < 2 подорожей (перевірка червоніє)', () => {
    const five = withLife({ ...LIFE, jobs: Object.fromEntries(Object.entries(LIFE.jobs).map(([k, j]) => [k, { ...j, vacationDays: 5 }])) });
    for (const w of WHO) {
      const r = runYearBot(five, w.profile, w.transport, DAYS);
      expect(Math.min(...Object.values(r.longTripsByYear)), `${w.profile}: ${JSON.stringify(r.longTripsByYear)}`).toBeLessThan(2);
    }
  });

  it('негативний контроль: школяр без канікул — жодної подорожі ≥ 7 днів', () => {
    const none = withLife({ ...LIFE, calendar: { ...CAL, schoolHolidays: [] } });
    const r = runYearBot(none, 'profile.family-teen', 'transport.car', DAYS);
    expect(r.trips.filter((t) => t.days >= 7)).toEqual([]);
    expect(r.refusals.SCHOOL_TERM).toBeGreaterThan(0);
  });

  it('звіт (для картки): подорожі й гроші за профілем', () => {
    const lines = WHO.map((w) => {
      const r = reports[w.profile] as YearReport;
      return `${w.profile}: ${JSON.stringify(r.longTripsByYear)} · ${r.trips.map((t) => `${t.year}:${t.days}д/${t.vacation}відп`).join(', ')} · гроші ${r.moneyCents / 100} €`;
    });
    console.log(lines.join('\n'));
    expect(lines).toHaveLength(WHO.length);
  });

  // Час на годиннику гри — ДНІ: бот 3 роки × 2 профілі — сотні тисяч хвилин; переконаймось, що дата не «пливе».
  it('годинник бота — цілі дні: остання дата — 2029-12-31', () => {
    const r = reports[WHO[0]?.profile as string] as YearReport;
    expect(r.sim.clock.minutes).toBe((DAYS - 1) * DAY_MINUTES);
  });
});

describe('межа перебору (SIM-LIFE-012): календар живе поза moves()', () => {
  it('у жодному стані, який бачить бот Прологу, moves() не пропонує BookLeave/CancelLeave; life не змінює жоден хід', () => {
    const seen = new Set<string>();
    let frontier: GameState[] = WHO.map((w) => created(w.profile));
    for (let depth = 0; depth < 12 && frontier.length; depth++) {
      const next: GameState[] = [];
      for (const s of frontier) for (const m of moves(s, GAME_DEFS)) {
        expect(['BookLeave', 'CancelLeave']).not.toContain(m.type);
        const r = dispatch(s, { ...m, commandId: `m${n++}` } as Command, GAME_DEFS);
        if (!r.ok) continue;
        expect(r.state.life).toBe(s.life);
        const k = progressKey(r.state);
        if (!seen.has(k)) { seen.add(k); next.push(r.state); }
      }
      frontier = next;
    }
    expect(seen.size).toBeGreaterThan(100);
  });
});
