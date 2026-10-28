// GAME-99 · день і ніч: чиста функція освітлення. Кожен тест тут має мутацію, що його червонить (див. research/visual-audit.md).
import { describe, expect, it } from 'vitest';
import { DAY_MINUTES, MAX_DARKNESS, PALETTE_COLORS, ambientAt, glowAlpha } from './daylight';

const LPC = import.meta.glob<string>('../../../art/palette/lpc.json', { query: '?raw', import: 'default', eager: true });
const palette = new Set((JSON.parse(Object.values(LPC)[0] ?? '{}') as { colors?: string[] }).colors ?? []);
const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

describe('день і ніч (GAME-99)', () => {
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

  it('без стрибків: за хвилину затемнення змінюється не більш ніж на 0,05, і в межах 0…MAX', () => {
    let prev = ambientAt(0).darkness;
    for (let m = 1; m <= DAY_MINUTES; m++) {
      const a = ambientAt(m);
      expect(Math.abs(a.darkness - prev), `стрибок о ${m}`).toBeLessThanOrEqual(0.05);
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
});
