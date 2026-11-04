// GAME-99 · день і ніч: чиста функція освітлення. Кожен тест тут має мутацію, що його червонить (див. research/visual-audit.md).
import { describe, expect, it } from 'vitest';
import { DAY_MINUTES, DAY_START_MINUTE, GRADE_STEP_MINUTES, MAX_DARKNESS, MORNING_TINT, PALETTE_COLORS, VIOLET_TINT, ambientAt, ambientAtClock, glowAlpha, timeOfDay } from './daylight';

const LPC = import.meta.glob<string>('../../../art/palette/lpc.json', { query: '?raw', import: 'default', eager: true });
const palette = new Set((JSON.parse(Object.values(LPC)[0] ?? '{}') as { colors?: string[] }).colors ?? []);
const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

describe('день і ніч (GAME-99)', () => {
  it('перший кадр нової гри (clock.minutes = 0) — день: 08:00, затемнення 0 (BLOCKER рецензії PR #91)', () => {
    expect(DAY_START_MINUTE).toBe(8 * 60);
    expect(timeOfDay(0)).toBe(8 * 60);
    expect(ambientAtClock(0).darkness).toBe(0);
    expect(ambientAtClock(0).color).toBe(0xffffff);
    expect(ambientAtClock(16 * 60).darkness).toBe(MAX_DARKNESS);   // 00:00 показу — ніч настає за 16 ігрових годин (≈ 16 реальних хвилин)
  });

  it('палітра прочитана (інакше перевірка кольорів порожня)', () => {
    expect(palette.size).toBeGreaterThan(400);
  });

  it('ключові кольори ефекту — з палітри LPC (гармонія набору)', () => {
    for (const c of PALETTE_COLORS) expect(palette.has(hex(c)), `${hex(c)} немає в art/palette/lpc.json`).toBe(true);
  });

  it('опівдні — без затемнення і колір білий (множення нічого не змінює)', () => {
    expect(ambientAt(12 * 60)).toEqual({ color: 0xffffff, darkness: 0 });
  });

  it('опівночі й о 03:00 — глибока ніч: затемнення = MAX_DARKNESS, колір синій', () => {
    for (const m of [0, 3 * 60]) {
      const a = ambientAt(m);
      expect(a.darkness).toBe(MAX_DARKNESS);
      expect((a.color & 0xff) > (a.color >> 16)).toBe(true);   // синього більше, ніж червоного
    }
  });

  it('вечір темнішає, ранок світлішає: 17:00 < 20:00 < 22:00 і 06:00 > 07:00', () => {
    const d = (m: number): number => ambientAt(m).darkness;
    expect(d(17 * 60)).toBe(0);
    expect(d(20 * 60)).toBeGreaterThan(d(17 * 60));
    expect(d(22 * 60)).toBeGreaterThan(d(20 * 60));
    expect(d(6 * 60)).toBeGreaterThan(d(7 * 60));
    expect(d(7 * 60)).toBeGreaterThan(d(8 * 60));
  });

  it('без стрибків: за хвилину затемнення змінюється не більш ніж на 0,06 (східець 10 хв), і в межах 0…MAX', () => {
    let prev = ambientAt(0).darkness;
    for (let m = 1; m <= DAY_MINUTES; m++) {
      const a = ambientAt(m);
      expect(Math.abs(a.darkness - prev), `стрибок о ${m}`).toBeLessThanOrEqual(0.06);
      expect(a.darkness).toBeGreaterThanOrEqual(0);
      expect(a.darkness).toBeLessThanOrEqual(MAX_DARKNESS);
      prev = a.darkness;
    }
  });

  it('доба по колу: 1440 + m дає те саме, що m; від’ємні не ламають', () => {
    for (const m of [0, 400, 1200]) {
      expect(ambientAt(m + DAY_MINUTES)).toEqual(ambientAt(m));
      expect(ambientAt(m - DAY_MINUTES)).toEqual(ambientAt(m));
    }
  });

  it('пляма вогнища: вдень 0, вночі > 0.5 і не вище 1, мерехтить', () => {
    expect(glowAlpha(0, 1234)).toBe(0);
    const night = Array.from({ length: 50 }, (_, i) => glowAlpha(MAX_DARKNESS, i * 40));
    expect(Math.min(...night)).toBeGreaterThan(0.5);
    expect(Math.max(...night)).toBeLessThanOrEqual(1);
    expect(new Set(night.map((x) => x.toFixed(3))).size).toBeGreaterThan(5);
  });

  // GAME-232 · теплий колір дня
  it('таблиця (GAME-232): 07:00 рожево-жовтий, 12:00 нейтральний, 18:00–18:30 фіолетовий росте, 20:00 темно-синій, 23:00 глибока ніч', () => {
    const hex6 = (c: number): string => c.toString(16).padStart(6, '0');
    const rows: [number, string, number][] = [
      [7 * 60, 'feeee1', 0.3], [12 * 60, 'ffffff', 0], [18 * 60, 'fbf7fb', 0.06], [18 * 60 + 30, 'edddf1', 0.24],
      [20 * 60, 'acafd7', 0.45], [20 * 60 + 30, '979bcc', 0.567], [23 * 60, '6c71b7', 0.8],
    ];
    for (const [m, color, dark] of rows) {
      const a = ambientAt(m);
      expect(hex6(a.color), `колір о ${m}`).toBe(color);
      expect(a.darkness, `сила о ${m}`).toBeCloseTo(dark, 2);
    }
    const c = (m: number): number => ambientAt(m).color;
    expect((c(7 * 60) >> 16) > (c(7 * 60) & 0xff), 'ранок: червоного більше, ніж синього (рожево-жовтий)').toBe(true);
    expect((c(18 * 60 + 30) >> 16) > ((c(18 * 60 + 30) >> 8) & 0xff) && (c(18 * 60 + 30) & 0xff) > ((c(18 * 60 + 30) >> 8) & 0xff), 'вечір: R і B вищі за G — фіолетовий').toBe(true);
    expect((c(20 * 60) & 0xff) > (c(20 * 60) >> 16), 'після 20:00 синій переважає').toBe(true);
  });

  it('тільки східці (GAME-232): усередині кожних 10 хвилин значення одне й те саме, змінюється лише на межі', () => {
    expect(GRADE_STEP_MINUTES).toBe(10);
    let changes = 0;
    let prev = ambientAt(0);
    for (let m = 1; m < DAY_MINUTES; m++) {
      const a = ambientAt(m);
      const changed = a.color !== prev.color || a.darkness !== prev.darkness;
      if (changed) { changes++; expect(m % GRADE_STEP_MINUTES, `зміна колір усередині східця о ${m}`).toBe(0); }
      expect(a, `о ${m} має дорівнювати початку східця`).toEqual(ambientAt(m - (m % GRADE_STEP_MINUTES)));
      prev = a;
    }
    expect(changes, 'доба не застигла на одному кольорі').toBeGreaterThan(30);
    expect(ambientAt(18 * 60 + 29.9)).toEqual(ambientAt(18 * 60 + 20));   // дробові хвилини теж у східець
  });

  it('ключі кольору — суміші ключів палітри: фіолетовий тепліший за синій, ранок рожево-жовтий', () => {
    expect(VIOLET_TINT >> 16, 'фіолетовий несе багато червоного (теплий)').toBeGreaterThan(0.9 * (VIOLET_TINT & 0xff));
    expect(VIOLET_TINT >> 16).toBeGreaterThan(((VIOLET_TINT >> 8) & 0xff) + 40);
    expect(VIOLET_TINT & 0xff, 'і синє').toBeGreaterThan((VIOLET_TINT >> 8) & 0xff);
    expect(MORNING_TINT >> 16).toBeGreaterThan(MORNING_TINT & 0xff);
  });
});
