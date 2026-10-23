// GAME-46 · погода дня: чиста функція (зерно світу, день), не читає Date і не споживає RNG стану;
// дощ сповільнює велосипед ×1.5 угору за днем виїзду, авто й гроші — без змін.
import { describe, expect, it } from 'vitest';
import type { Command } from './commands';
import type { CoreDefs } from './defs';
import { stateHash } from './hash';
import { newSim, step, todayWeather, type SimState, type StepCtx } from './sim';
import { BIKER, DRIVER, ROAD_DEFS } from './story.fixture';
import { DAY_MINUTES, WEATHERS, WEATHER_SHARE, dayOf, tripMinutes, weatherOf, type Weather } from './weather';

const days = (seed: number, n: number): Weather[] => Array.from({ length: n }, (_, d) => weatherOf(seed, d));

describe('weatherOf: детермінізм (SIM-WX-005)', () => {
  it('той самий seed і день → та сама погода (два виклики, 1000 днів × 5 зерен)', () => {
    for (const seed of [0, 1, 20261022, 20261023, 0xffff_ffff]) expect(days(seed, 1000)).toEqual(days(seed, 1000));
  });
  it('зерно справді вирішує: 30 днів різних зерен — різні послідовності (інакше «однаково» нічого не доводить)', () => {
    const seqs = Array.from({ length: 20 }, (_, i) => days(i + 1, 30).join(','));
    expect(new Set(seqs).size).toBe(20);
    expect(days(1, 30)).not.toEqual(days(2, 30));
  });
  it('день справді вирішує: за 30 днів одного зерна трапляються всі три види', () => {
    expect(new Set(days(20261022, 30))).toEqual(new Set(WEATHERS));
  });
  it('день — ціле число діб годинника', () => {
    expect([0, 1439, 1440, 2879, 2880].map((minutes) => dayOf({ minutes }))).toEqual([0, 0, 1, 1, 2]);
    expect(DAY_MINUTES).toBe(1440);
  });
  it('некоректний день — виняток, а не «якась погода»', () => {
    for (const d of [-1, 1.5, Number.NaN]) expect(() => weatherOf(1, d)).toThrow(RangeError);
  });
});

describe('розподіл (SIM-WX-006, тимч. 50/30/20): 10 000 днів, кожен вид у межах ±5 п.п.', () => {
  // Ціль — числами з правила, а не з WEATHER_SHARE: інакше зміна константи переписала б і очікування
  // (мутація 60/30/10 виживала — закон 1).
  const TARGET: Record<Weather, number> = { sunny: 50, cloudy: 30, rain: 20 };
  it('константа частот = правило', () => { expect(WEATHER_SHARE).toEqual(TARGET); });
  for (const seed of [1, 20261022]) {
    it(`зерно ${seed}`, () => {
      const n = 10_000;
      const count: Record<Weather, number> = { sunny: 0, cloudy: 0, rain: 0 };
      for (const w of days(seed, n)) count[w]++;
      for (const w of WEATHERS) expect(Math.abs((count[w] / n) * 100 - TARGET[w]), `${w}: ${count[w]}`).toBeLessThanOrEqual(5);
    });
  }
});

describe('tripMinutes (SIM-WX-007)', () => {
  it('дощ: велосипед ×1.5 угору; авто — без змін; не дощ — без змін', () => {
    expect([1, 2, 3, 15, 30, 45].map((m) => tripMinutes(m, 'transport.bike', 'rain'))).toEqual([2, 3, 5, 23, 45, 68]);
    expect(tripMinutes(45, 'transport.car', 'rain')).toBe(45);
    for (const w of ['sunny', 'cloudy'] as const) expect(tripMinutes(45, 'transport.bike', w)).toBe(45);
    expect(tripMinutes(0, 'transport.bike', 'rain')).toBe(0);
  });
});

describe('погода в симуляції', () => {
  const cmd = (c: Record<string, unknown>, id: string): Command => ({ ...c, commandId: id } as Command);
  const forced = (w: Weather): StepCtx => ({ defs: ROAD_DEFS, weather: { of: () => w } });
  const go = (who: Record<string, unknown>, ctx: StepCtx, from: SimState = newSim(1, 1_000)): { before: SimState; after: SimState } => {
    const before = [cmd(who, 'a0'), cmd({ type: 'Visit', locationId: 'loc.home' }, 'a1'), cmd({ type: 'CompleteQuest', questId: 'q.start' }, 'a2')]
      .reduce((s, c) => step(s, { kind: 'command', command: c }, ctx), from);
    return { before, after: step(before, { kind: 'command', command: cmd({ type: 'Visit', locationId: 'loc.shop' }, 'a3') }, ctx) };
  };
  const took = (r: { before: SimState; after: SimState }): number => r.after.clock.minutes - r.before.clock.minutes;

  it('newSim кладе зерно світу в стан (uint32)', () => {
    expect(newSim(20261022).worldSeed).toBe(20261022);
    expect(newSim(-1).worldSeed).toBe(0xffff_ffff);
  });
  it('дощ: велосипед 30 → 45 хв; авто 10 → 10 хв; гроші дороги однакові', () => {
    expect(took(go(BIKER, forced('sunny')))).toBe(30);
    expect(took(go(BIKER, forced('rain')))).toBe(45);
    expect(took(go(DRIVER, forced('sunny')))).toBe(10);
    expect(took(go(DRIVER, forced('rain')))).toBe(10);
    const cost = (w: Weather) => { const r = go(DRIVER, forced(w)); return r.before.game.moneyCents - r.after.game.moneyCents; };
    expect(cost('rain')).toBe(cost('sunny'));
    expect(cost('rain')).toBeGreaterThan(0);                // дорога справді платна — порівняння не порожнє
  });
  it('без підміни: погода — з зерна світу й дня годинника (той самий виїзд у дощовий і сухий день)', () => {
    const rainy = Array.from({ length: 60 }, (_, d) => d).find((d) => weatherOf(1, d) === 'rain') as number;
    const dry = Array.from({ length: 60 }, (_, d) => d).find((d) => weatherOf(1, d) === 'sunny') as number;
    const at = (day: number): SimState => step(newSim(1, 1_000), { kind: 'advance', minutes: day * DAY_MINUTES }, {});
    expect(todayWeather(at(rainy))).toBe('rain');
    expect(took(go(BIKER, { defs: ROAD_DEFS }, at(rainy)))).toBe(45);
    expect(took(go(BIKER, { defs: ROAD_DEFS }, at(dry)))).toBe(30);
  });
  it('рахується день ВИЇЗДУ: виїзд о 23:59 дощового дня, приїзд наступного — усе одно ×1.5', () => {
    const rainy = Array.from({ length: 60 }, (_, d) => d).find((d) => weatherOf(1, d) === 'rain' && weatherOf(1, d + 1) !== 'rain') as number;
    const start = newSim(1, 1_000);
    const prep = [cmd(BIKER, 'a0'), cmd({ type: 'Visit', locationId: 'loc.home' }, 'a1'), cmd({ type: 'CompleteQuest', questId: 'q.start' }, 'a2')]
      .reduce((s, c) => step(s, { kind: 'command', command: c }, { defs: ROAD_DEFS }), start);
    const late = step(prep, { kind: 'advance', minutes: (rainy + 1) * DAY_MINUTES - 1 - prep.clock.minutes }, {});
    expect(dayOf(late.clock)).toBe(rainy);
    const after = step(late, { kind: 'command', command: cmd({ type: 'Visit', locationId: 'loc.shop' }, 'a3') }, { defs: ROAD_DEFS });
    expect(after.clock.minutes - late.clock.minutes).toBe(45);
    expect(dayOf(after.clock)).toBe(rainy + 1);
  });
  it('погода не споживає RNG стану: дощ і сонце — той самий RNG, ті самі знахідки', () => {
    const frames = (s: SimState, ctx: StepCtx): SimState => Array.from({ length: 50 }, () => ({ kind: 'frame', realMs: 1000 }) as const).reduce((a, i) => step(a, i, ctx), s);
    const rain = frames(go(BIKER, forced('rain')).after, forced('rain'));
    const sun = frames(go(BIKER, forced('sunny')).after, forced('sunny'));
    expect(stateHash(rain.rng)).toBe(stateHash(sun.rng));
    expect(rain.finds).toBe(sun.finds);
    expect(rain.clock.minutes).not.toBe(sun.clock.minutes);  // а погода справді щось змінила
  });
  it('без доріг (сюжет без roads) погода нічого не змінює', () => {
    const noRoads: CoreDefs = { ...ROAD_DEFS, story: { ...(ROAD_DEFS.story as NonNullable<CoreDefs['story']>), roads: [] } };
    const a = go(BIKER, { defs: noRoads, weather: { of: () => 'rain' } });
    expect(took(a)).toBe(0);
  });
});
