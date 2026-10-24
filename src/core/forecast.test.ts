// GAME-131 · прогноз ≠ факт (R1-12: forecast_weather окремо від current_weather).
// 1) прогноз дощу при ясному факті не вмикає жодного ефекту дощу (дорога, мокре спорядження);
// 2) прогноз може не справдитись — детерміновано від зерна світу;
// 3) прогноз не залежить від годинника браузера і не потрапляє в сейв (похідна від зерна й дня).
// Закон 1: мутації forecastOf = weatherOf і todayWeather = прогноз мусять почервоніти (див. звіт картки).
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Command } from './commands';
import { gearOf } from './gear';
import { fromSave, serialize } from './save';
import { newSim, step, todayForecast, todayWeather, type Input, type SimState, type StepCtx } from './sim';
import { BIKER, DRIVER, GEAR_DEFS, ROAD_DEFS } from './story.fixture';
import { DAY_MINUTES, FORECAST_HIT_PERCENT, WEATHERS, forecastOf, weatherOf, type Weather } from './weather';

const SEEDS = [0, 1, 7, 20261022, 0xffff_ffff] as const;
const days = (n: number): number[] => Array.from({ length: n }, (_, d) => d);

describe('forecastOf: детермінізм і може не справдитись (Спосіб перевірки №2)', () => {
  it('той самий seed і день → той самий прогноз (два виклики, 1000 днів × 5 зерен)', () => {
    for (const seed of SEEDS) expect(days(1000).map((d) => forecastOf(seed, d))).toEqual(days(1000).map((d) => forecastOf(seed, d)));
  });
  it('щонайменше раз прогноз ≠ факт — для кожного зерна за 30 днів', () => {
    for (const seed of SEEDS) expect(days(30).some((d) => forecastOf(seed, d) !== weatherOf(seed, d)), `seed ${seed}`).toBe(true);
  });
  it('і щонайменше раз прогноз = факт (не анти-прогноз): для кожного зерна за 30 днів', () => {
    for (const seed of SEEDS) expect(days(30).some((d) => forecastOf(seed, d) === weatherOf(seed, d)), `seed ${seed}`).toBe(true);
  });
  it(`точність ${FORECAST_HIT_PERCENT}% ±5 п.п. на 10 000 днів; промах — завжди ІНША погода, і трапляються всі види прогнозу`, () => {
    expect(FORECAST_HIT_PERCENT).toBe(70);   // ціль — числом, а не з константи (мутація константи інакше виживе)
    for (const seed of [1, 20261022]) {
      const n = 10_000;
      const hits = days(n).filter((d) => forecastOf(seed, d) === weatherOf(seed, d)).length;
      expect(Math.abs((hits / n) * 100 - 70), `seed ${seed}: ${hits}`).toBeLessThanOrEqual(5);
      expect(new Set(days(n).map((d) => forecastOf(seed, d)))).toEqual(new Set(WEATHERS));
    }
  });
  it('некоректний день — виняток, як у weatherOf', () => {
    for (const d of [-1, 1.5, Number.NaN]) expect(() => forecastOf(1, d)).toThrow(RangeError);
  });
  it('прогноз не споживає RNG стану і не змінює стан: todayForecast — читання', () => {
    const s = newSim(7, 1_000);
    const before = JSON.stringify(s);
    for (let i = 0; i < 5; i++) todayForecast(s);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('прогноз дощу при ясному факті — жодного ефекту дощу (Спосіб перевірки №1)', () => {
  const cmd = (c: Record<string, unknown>, id: string): Input => ({ kind: 'command', command: { ...c, commandId: id } as Command });
  /** День зерна, де прогноз — дощ, а факт — сонце (без підміни погоди: справжні weatherOf і forecastOf). */
  const SEED = 7;
  const DAY = days(400).find((d) => d > 0 && forecastOf(SEED, d) === 'rain' && weatherOf(SEED, d) === 'sunny') as number;
  /** Контроль: день, де і прогноз, і факт — дощ (ефект дощу мусить бути, інакше «немає ефекту» ніщо не доводить). */
  const WET = days(400).find((d) => d > 0 && forecastOf(SEED, d) === 'rain' && weatherOf(SEED, d) === 'rain') as number;
  const NO_OVERRIDE: StepCtx = { defs: ROAD_DEFS };

  const prepared = (who: Record<string, unknown>, ctx: StepCtx, extra: readonly Input[] = []): SimState => {
    return [cmd(who, 'a0'), cmd({ type: 'Visit', locationId: 'loc.home' }, 'a1'), cmd({ type: 'CompleteQuest', questId: 'q.start' }, 'a2'), ...extra]
      .reduce((acc, i) => step(acc, i, ctx), newSim(SEED, 20_000));
  };
  const atDay = (s: SimState, day: number): SimState => step(s, { kind: 'advance', minutes: day * DAY_MINUTES + 60 - s.clock.minutes }, {});
  const ride = (s: SimState, ctx: StepCtx): SimState => step(s, cmd({ type: 'Visit', locationId: 'loc.shop' }, 'a9'), ctx);

  it('фікстура знайшла обидва дні (прогноз дощ / факт сонце і прогноз дощ / факт дощ)', () => {
    expect(DAY).toBeGreaterThan(0);
    expect(WET).toBeGreaterThan(0);
  });

  it('велосипед: у день «прогноз дощ, факт сонце» дорога 30 хв, а не 45; погода дня — сонце, прогноз — дощ', () => {
    const s = atDay(prepared(BIKER, NO_OVERRIDE), DAY);
    expect(todayWeather(s)).toBe('sunny');
    expect(todayForecast(s)).toBe('rain');
    expect(ride(s, NO_OVERRIDE).clock.minutes - s.clock.minutes).toBe(30);
    // контроль: справжній дощ на тій самій дорозі — 45 хв
    const w = atDay(prepared(BIKER, NO_OVERRIDE), WET);
    expect(ride(w, NO_OVERRIDE).clock.minutes - w.clock.minutes).toBe(45);
  });

  it('спорядження: після дороги в день «прогноз дощ, факт сонце» намет сухий; у справжній дощ — мокрий (контроль)', () => {
    const ctx: StepCtx = { defs: GEAR_DEFS };
    const buy = [cmd({ type: 'BuyItem', itemId: 'item.tent-a' }, 'b0')];
    const dry = ride(atDay(prepared(DRIVER, ctx, buy), DAY), ctx);
    expect(gearOf(dry.game.gear, 'item.tent-a')).toEqual({ condition: 100, wet: false });
    const wet = ride(atDay(prepared(DRIVER, ctx, buy), WET), ctx);
    expect(gearOf(wet.game.gear, 'item.tent-a')).toEqual({ condition: 100, wet: true });
  });
});

describe('прогноз не залежить від годинника браузера і не живе в сейві (Спосіб перевірки №3)', () => {
  afterEach(() => { vi.useRealTimers(); });
  const snapshot = (): { forecasts: Weather[]; save: string } => {
    const s = step(newSim(20261022, 1_000), { kind: 'advance', minutes: 3 * DAY_MINUTES }, {});
    return { forecasts: days(365).map((d) => forecastOf(20261022, d)), save: serialize(s) };
  };

  it('два різні системні годинники (2001 і 2099) — однакові прогнози на 365 днів і байт-у-байт однаковий сейв', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2001-01-01T00:00:00Z'));
    const a = snapshot();
    vi.setSystemTime(new Date('2099-12-31T23:59:59Z'));
    const b = snapshot();
    expect(b).toEqual(a);
  });

  it('сейв не має поля прогнозу, а прогноз після завантаження той самий (похідна від зерна й дня)', () => {
    const s = step(newSim(20261022, 1_000), { kind: 'advance', minutes: 5 * DAY_MINUTES + 7 }, {});
    const text = serialize(s);
    expect(text.toLowerCase()).not.toContain('forecast');
    const r = fromSave(text);
    expect(r.ok).toBe(true);
    if (r.ok) expect(todayForecast(r.sim)).toBe(todayForecast(s));
  });
});
