import { describe, expect, it } from 'vitest';
import { LAMPS_OFF_MINUTE, LAMPS_ON_MINUTE, LAMP_RADIUS, findLamps, lampAlpha, lampsOn } from './lamps';
import { MAX_DARKNESS, ambientAt } from './daylight';

describe('ліхтарі табору (GAME-231)', () => {
  it('вмикаються рівно о 18:00, гаснуть о 06:30', () => {
    expect(lampsOn(17 * 60 + 59)).toBe(false);
    expect(lampsOn(18 * 60)).toBe(true);
    expect(lampsOn(23 * 60)).toBe(true);
    expect(lampsOn(3 * 60)).toBe(true);
    expect(lampsOn(6 * 60 + 29)).toBe(true);
    expect(lampsOn(6 * 60 + 30)).toBe(false);
    expect(lampsOn(12 * 60)).toBe(false);
    expect(LAMPS_ON_MINUTE).toBe(1080);
    expect(LAMPS_OFF_MINUTE).toBe(390);
  });
  it('світло: вдень 0, о 18:00 вже видно, вночі яскравіше за сутінки, у межах 0..1', () => {
    expect(lampAlpha(12 * 60, ambientAt(12 * 60).darkness, 0)).toBe(0);
    expect(lampAlpha(17 * 60 + 59, ambientAt(17 * 60 + 59).darkness, 0)).toBe(0);
    const dusk = lampAlpha(18 * 60, ambientAt(18 * 60).darkness, 0);
    const night = lampAlpha(23 * 60, MAX_DARKNESS, 0);
    expect(dusk).toBeGreaterThan(0.3);
    expect(night).toBeGreaterThan(dusk);
    for (let t = 0; t < 5000; t += 37) expect(lampAlpha(23 * 60, MAX_DARKNESS, t)).toBeLessThanOrEqual(1);
  });
  it('мерехтіння дрібне: розмах < 8 %', () => {
    const v = Array.from({ length: 200 }, (_, i) => lampAlpha(23 * 60, MAX_DARKNESS, i * 16));
    expect(Math.max(...v) - Math.min(...v)).toBeLessThan(0.08);
  });
  it('радіус кола ≈ 2,5 м при 28 px/м', () => { expect(LAMP_RADIUS / 28).toBeGreaterThan(2); expect(LAMP_RADIUS / 28).toBeLessThan(3); });
  it('знаходить ліхтарі за верхом і стовпом під ним (верх без стовпа — не ліхтар)', () => {
    const g = 100; const W = 4; const H = 4;
    const d = new Array(W * H).fill(0) as number[];
    d[0 * W + 1] = g + 126; d[1 * W + 1] = g + 140;   // ліхтар (1,0)
    d[2 * W + 3] = g + 126;                            // верх без стовпа
    expect(findLamps(d, W, H, g)).toEqual([{ x: 48, y: 24 }]);
  });
});
