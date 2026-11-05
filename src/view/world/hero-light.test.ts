import { describe, expect, it } from 'vitest';
import { HERO_LIGHT_MAX_ALPHA, HERO_LIGHT_RADIUS, heroLightAlpha } from './hero-light';
import { MAX_DARKNESS, ambientAt } from './daylight';

describe('світле коло героя (GAME-251)', () => {
  it('вдень 0, вночі більше за 0', () => {
    expect(heroLightAlpha(ambientAt(12 * 60).darkness)).toBe(0);
    expect(heroLightAlpha(0)).toBe(0);
    expect(heroLightAlpha(-1)).toBe(0);
    expect(heroLightAlpha(Number.NaN)).toBe(0);
    expect(heroLightAlpha(ambientAt(23 * 60).darkness)).toBeGreaterThan(0.3);
  });
  it('монотонно зростає з темрявою й не перевищує межі', () => {
    let prev = 0;
    for (let d = 0; d <= MAX_DARKNESS + 1e-9; d += 0.02) {
      const a = heroLightAlpha(d);
      expect(a).toBeGreaterThanOrEqual(prev);
      expect(a).toBeLessThanOrEqual(HERO_LIGHT_MAX_ALPHA);
      prev = a;
    }
    expect(heroLightAlpha(MAX_DARKNESS)).toBe(HERO_LIGHT_MAX_ALPHA);
    expect(heroLightAlpha(MAX_DARKNESS * 2)).toBe(HERO_LIGHT_MAX_ALPHA);
  });
  it('радіус 2,5–3 тайли', () => {
    expect(HERO_LIGHT_RADIUS / 32).toBeGreaterThanOrEqual(2.5);
    expect(HERO_LIGHT_RADIUS / 32).toBeLessThanOrEqual(3);
  });
  it('вечірня ніч (20:30) світліша за сутінки 18:30', () => {
    expect(heroLightAlpha(ambientAt(20 * 60 + 30).darkness)).toBeGreaterThan(heroLightAlpha(ambientAt(18 * 60 + 30).darkness));
  });
});
