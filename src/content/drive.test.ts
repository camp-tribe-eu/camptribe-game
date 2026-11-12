// GAME-309 · сторожі дороги. Кожен має мутацію, від якої він ЧЕРВОНІЄ (закон 1) — вона названа в заголовку тесту.
// Мутації, перевірені руками перед комітом:
//   1. `VIEW_M = 200` → «часу на реакцію ... < 8 с» (телеграф).
//   2. у `tick` прибрати `moneyCents -= FINE_CENTS` → «штраф не забрав грошей».
//   3. `freePitchesFor` повертає завжди `PITCHES` → «час приїзду не змінює набору ділянок».
//   4. прибрати гілку сухого бака → «drive did not finish in 120000 frames» (глухий кут).
//   5. `HAZARD_MPS.roadworks = 0` → та сама зупинка назавжди на впертій стратегії.
import { describe, expect, it } from 'vitest';
import {
  ADVENTURE_KINDS, CLOSE_PASS_COST, COMFORT_MAX, FINE_CENTS, FRAZZLED_COMFORT, FREE_PITCH_COUNT, HAZARD_KINDS, HAZARD_MPS,
  MIN_TELEGRAPH_SEC, PACE_MPS, PITCHES, REST_COMFORT, SHARP_CHANGES, SHARP_COST, SHARP_WINDOW_MS, TANK_MAX_L,
  blocker, buildCourse, cameraTelegraphSec, driveResult, freePitchesFor, helpFor, minTelegraphSec, speedOf, startDrive, stepDrive, telegraphSec,
  type Course, type DriveState, type Lane, type Outcome,
} from './drive';
import { BRISK, CALM_FAST, FRAME_MS, SCRAPPY, START_MONEY, STEADY, play } from './drive.fixture';

const SEEDS = [1, 2, 3, 7, 11, 19, 23, 42];
const tick = (s: DriveState, c: Course, ms = FRAME_MS): DriveState => stepDrive(s, c, { kind: 'tick', dtMs: ms }).state;

describe('телеграф: рефлексів гра не вимагає', () => {
  it(`найменший час на реакцію ≥ ${MIN_TELEGRAPH_SEC} с (мутація: звузити VIEW_M)`, () => {
    const min = minTelegraphSec();
    expect(min, `часу на реакцію ${min.toFixed(2)} с < ${MIN_TELEGRAPH_SEC}`).toBeGreaterThanOrEqual(MIN_TELEGRAPH_SEC);
    // Найтісніший випадок — найповільніша перешкода на жвавому ході.
    const slowest = HAZARD_KINDS.reduce((a, b) => (HAZARD_MPS[a] <= HAZARD_MPS[b] ? a : b));
    expect(min).toBeCloseTo(telegraphSec(slowest, 'brisk'), 6);
  });
  it('вимога не порожня: з удвічі коротшим оглядом ТОЙ САМИЙ рахунок падає нижче межі', () => {
    expect(minTelegraphSec(200, 600)).toBeLessThan(MIN_TELEGRAPH_SEC);
  });
  it('кожна перешкода й кожна камера дають час на реакцію на обох швидкостях', () => {
    for (const k of HAZARD_KINDS) for (const pace of ['steady', 'brisk'] as const) {
      expect(telegraphSec(k, pace), `${k} @ ${pace}`).toBeGreaterThanOrEqual(MIN_TELEGRAPH_SEC);
    }
    for (const pace of ['steady', 'brisk'] as const) expect(cameraTelegraphSec(pace), `камера @ ${pace}`).toBeGreaterThanOrEqual(MIN_TELEGRAPH_SEC);
  });
  it('жодна перешкода не стоїть мертво — інакше смуга стає глухим кутом', () => {
    for (const k of HAZARD_KINDS) expect(HAZARD_MPS[k], k).toBeGreaterThan(0);
  });
});

describe('кадри, а не годинник', () => {
  it('той самий набір кадрів дає той самий стан — двічі поспіль', () => {
    const c = buildCourse(7);
    const run = (): DriveState => { let s = startDrive(c, START_MONEY); for (let i = 0; i < 2000; i++) s = tick(s, c); return s; };
    expect(run()).toEqual(run());
  });
  it('довгий кадр обрізається: лаг не телепортує авто крізь перешкоду', () => {
    const c = buildCourse(3);
    const s = startDrive(c, START_MONEY);
    const long = tick(s, c, 5000);
    expect(long.metres).toBeLessThanOrEqual(PACE_MPS.steady * 0.1 + 0.001);
  });
  it('швидкість ніколи не від’ємна і ніколи не більша за бажану', () => {
    const c = buildCourse(11);
    let s = startDrive(c, START_MONEY);
    for (let i = 0; i < 20_000 && s.phase !== 'arrived'; i++) {
      const v = speedOf(s, c);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(PACE_MPS[s.pace]);
      s = tick(s, c);
    }
  });
});

describe('пригоди, а не аварії', () => {
  it('за перешкодою просто їдеш її швидкістю — зіткнення в правилах немає', () => {
    const c = buildCourse(5);
    let s = startDrive(c, START_MONEY);
    let met = 0;
    for (let i = 0; i < 40_000 && s.phase !== 'arrived'; i++) {
      const b = blocker(s, c);
      if (b && s.phase === 'drive') { met++; expect(speedOf(s, c)).toBe(Math.min(PACE_MPS[s.pace], HAZARD_MPS[b.kind])); }
      s = tick(s, c);
    }
    expect(met, 'жодної перешкоди не зустріли — перевірка нічого не довела').toBeGreaterThan(0);
  });
  it('на трасі є всі чотири види перешкод і всі три пригоди (за зернами)', () => {
    const kinds = new Set(buildCourse(1).hazards.map((h) => h.kind));
    expect([...kinds].sort()).toEqual([...HAZARD_KINDS].sort());
    const advs = new Set(SEEDS.concat([4, 5, 6, 8, 9, 13, 17]).map((x) => buildCourse(x).adventures[0]?.kind));
    expect([...advs].sort()).toEqual([...ADVENTURE_KINDS].sort());
  });
});

describe('три результати', () => {
  const runs = SEEDS.map((seed) => {
    const c = buildCourse(seed);
    return { seed, good: play(c, CALM_FAST), fine: play(c, STEADY), bad: play(c, SCRAPPY) };
  });

  it('усі три досяжні, і «сяк-так» НЕ блокує приїзд', () => {
    const seen = new Set<Outcome>();
    for (const r of runs) for (const run of [r.good, r.fine, r.bad]) {
      expect(run.state.phase).toBe('arrived');
      expect(run.result.freePitches.length).toBeGreaterThan(0);
      seen.add(run.result.outcome);
    }
    expect([...seen].sort()).toEqual(['fine', 'good', 'scrappy']);
    for (const r of runs) {
      expect(r.good.result.outcome, `зерно ${r.seed}: спокійно-жваво`).toBe('good');
      expect(r.fine.result.outcome, `зерно ${r.seed}: рівно спокійно`).toBe('fine');
      expect(r.bad.result.outcome, `зерно ${r.seed}: уперто й із кожною зупинкою`).toBe('scrappy');
    }
  });

  it('поїздка триває приблизно п’ять хвилин', () => {
    const secs = runs.flatMap((r) => [r.good.result.arrivalSec, r.fine.result.arrivalSec, r.bad.result.arrivalSec]);
    for (const x of secs) expect(x, `${x} с — це вже не «близько 5 хв»`).toBeGreaterThan(210);
    for (const x of secs) expect(x, `${x} с — це вже не «близько 5 хв»`).toBeLessThan(420);
    const mean = secs.reduce((a, b) => a + b, 0) / secs.length;
    expect(mean).toBeGreaterThan(240);
    expect(mean).toBeLessThan(360);
  });

  it('«пізно» — це справді пізно, «рано» — справді рано', () => {
    for (const r of runs) {
      expect(r.bad.result.lateSec).toBeGreaterThan(0);
      expect(r.good.result.lateSec).toBe(0);
      expect(r.good.result.comfort).toBeGreaterThanOrEqual(FRAZZLED_COMFORT);
    }
  });
});

describe('камери й гроші', () => {
  it('штраф справді забирає гроші родини (мутація: не віднімати — тест червоніє)', () => {
    const c = buildCourse(2);
    const fast = play(c, BRISK);
    expect(fast.result.finesCents).toBe(FINE_CENTS * c.cameras.length);
    expect(fast.result.moneyCents).toBe(START_MONEY - FINE_CENTS * c.cameras.length);
    expect(fast.events.filter((e) => e.kind === 'fined')).toHaveLength(c.cameras.length);
  });
  it('знак попереджає ЗАЗДАЛЕГІДЬ, і хто скинув швидкість — не платить', () => {
    const c = buildCourse(2);
    const calm = play(c, STEADY);
    expect(calm.result.finesCents).toBe(0);
    expect(calm.result.moneyCents).toBe(START_MONEY);
    const sign = calm.events.find((e) => e.kind === 'camera-sign');
    const shot = calm.events.find((e) => e.kind === 'camera-ok');
    expect(sign).toBeDefined();
    expect(shot).toBeDefined();
    expect((shot?.at ?? 0) - (sign?.at ?? 0)).toBeGreaterThanOrEqual(MIN_TELEGRAPH_SEC);
  });
});

describe('пальне без глухого кута', () => {
  it('сухий бак: дотягли до колонки, поїздка доїжджає (мутація: прибрати гілку — бак не висихає, перевірка червоніє)', () => {
    const c: Course = { ...buildCourse(9), startFuelL: 0.9 };
    const run = play(c, { pace: () => 'brisk' });
    expect(run.events.some((e) => e.kind === 'dry-tank'), 'бак так і не висох — перевірка нічого не довела').toBe(true);
    expect(run.state.phase).toBe('arrived');
    expect(run.result.fuelL).toBeGreaterThan(0);
    expect(run.result.freePitches.length).toBeGreaterThan(0);
  });
  it('жвава їзда їсть більше за спокійну', () => {
    const c = buildCourse(1);
    expect(play(c, BRISK).state.fuelL).toBeLessThan(play(c, STEADY).state.fuelL);
  });
  it('заправка коштує час і гроші, а бак стає повним', () => {
    const c = buildCourse(1);
    let s = startDrive(c, START_MONEY);
    while (s.offer === null) s = tick(s, c);
    const paid = stepDrive(s, c, { kind: 'stop' }).state;
    expect(paid.phase).toBe('stopped');
    expect(paid.fuelL).toBe(TANK_MAX_L);
    expect(paid.moneyCents).toBeLessThan(s.moneyCents);
  });
});

describe('комфорт родини', () => {
  it('кілька різких перестроювань підряд коштують комфорту; одиничне — ні', () => {
    const c = buildCourse(4);
    let s = startDrive(c, START_MONEY);
    s = stepDrive(s, c, { kind: 'lane', to: 0 }).state;
    expect(s.comfort).toBe(COMFORT_MAX);
    for (let i = 0; i < SHARP_CHANGES; i++) {
      while (s.changing > 0) s = tick(s, c);
      s = stepDrive(s, c, { kind: 'lane', to: (s.lane === 0 ? 1 : 0) as Lane }).state;
    }
    expect(s.comfort).toBeLessThanOrEqual(COMFORT_MAX - SHARP_COST);
    expect(s.sec * 1000).toBeLessThan(SHARP_WINDOW_MS);
  });
  it('перепочинок справді піднімає комфорт і коштує час', () => {
    const c = buildCourse(1);
    let s = startDrive(c, START_MONEY);
    s = { ...s, comfort: 40 };
    while (s.offer === null || s.offer.kind !== 'rest') s = tick(s, c);
    const rested = stepDrive(s, c, { kind: 'stop' }).state;
    expect(rested.comfort).toBe(40 + REST_COMFORT);
    expect(rested.stoppedFor).toBeGreaterThan(0);
  });
  it('обгін велосипедиста впритул на жвавому ході коштує комфорту, спокійний — ні', () => {
    const c = buildCourse(1);
    const fast = play(c, BRISK);
    expect(fast.events.filter((e) => e.kind === 'close-pass').length).toBeGreaterThan(0);
    expect(play(c, STEADY).events.some((e) => e.kind === 'close-pass')).toBe(false);
    expect(CLOSE_PASS_COST).toBeGreaterThan(0);
  });
  it('знервована родина — це «сяк-так», навіть коли приїхали вчасно', () => {
    const c = buildCourse(1);
    const s = startDrive(c, START_MONEY);
    const arrived: DriveState = { ...s, phase: 'arrived', sec: 100, metres: c.routeM, comfort: FRAZZLED_COMFORT - 1 };
    expect(driveResult(arrived, c).outcome).toBe('scrappy');
    expect(driveResult({ ...arrived, comfort: COMFORT_MAX }, c).outcome).toBe('good');
  });
});

describe('ланцюг наслідків: час приїзду → вільні ділянки (договір GAME-310)', () => {
  it('набір ділянок РІЗНИЙ для трьох результатів (мутація: повертати завжди всі — червоніє)', () => {
    const sets = (['good', 'fine', 'scrappy'] as const).map((o) => freePitchesFor(o).join(','));
    expect(new Set(sets).size, `набори збіглися: ${sets.join(' | ')}`).toBe(3);
    expect(freePitchesFor('good').length).toBeGreaterThan(freePitchesFor('fine').length);
    expect(freePitchesFor('fine').length).toBeGreaterThan(freePitchesFor('scrappy').length);
  });
  it('кращі ділянки розбирають першими, і жоден результат не лишає порожньо', () => {
    for (const o of ['good', 'fine', 'scrappy'] as const) {
      const free = freePitchesFor(o);
      expect(free.length).toBe(FREE_PITCH_COUNT[o]);
      expect(free.length).toBeGreaterThan(0);
      // Вільні — це хвіст списку бажаності: що краще, те й зайняли раніше.
      expect([...free]).toEqual(PITCHES.slice(PITCHES.length - free.length));
    }
    expect(freePitchesFor('scrappy').every((p) => freePitchesFor('fine').includes(p))).toBe(true);
    expect(freePitchesFor('fine').every((p) => freePitchesFor('good').includes(p))).toBe(true);
  });
  it('підсумок справжньої поїздки несе набір, що відповідає її результату', () => {
    for (const seed of SEEDS) {
      const c = buildCourse(seed);
      for (const p of [CALM_FAST, STEADY, SCRAPPY]) {
        const r = play(c, p).result;
        expect(r.freePitches, `зерно ${seed} → ${r.outcome}`).toEqual(freePitchesFor(r.outcome));
      }
    }
  });
});

describe('допомога після двох «сяк-так» (договір каркаса міні-ігор)', () => {
  it('до двох — жодної допомоги; від двох — більше пального й довша рецепція', () => {
    expect(helpFor(0)).toEqual(helpFor(1));
    expect(helpFor(0).extraFuelL).toBe(0);
    expect(helpFor(2).extraFuelL).toBeGreaterThan(0);
    expect(helpFor(2).extraSec).toBeGreaterThan(0);
  });
  it('допомога не блокує й не докоряє: та сама поїздка з нею не гірша', () => {
    const plain = buildCourse(3);
    const helped = buildCourse(3, helpFor(2));
    expect(helped.startFuelL).toBeGreaterThan(plain.startFuelL);
    expect(helped.receptionSec).toBeGreaterThan(plain.receptionSec);
    const a = play(plain, SCRAPPY).result;
    const b = play(helped, SCRAPPY).result;
    expect(b.lateSec).toBeLessThan(a.lateSec);
    expect(b.freePitches.length).toBeGreaterThanOrEqual(a.freePitches.length);
  });
});
