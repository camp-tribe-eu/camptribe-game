// GAME-93 · забарвлення шару LPC і нумерація кадрів. Чисті функції: без браузера.
import { describe, expect, it } from 'vitest';
import { COLS, DIR_ROW, frameIndex, tintPixels } from './character';

const px = (r: number, g: number, b: number, a = 255): Uint8ClampedArray => new Uint8ClampedArray([r, g, b, a]);

describe('tintPixels (як PIL colorize у compose_chars.py)', () => {
  it('чорне лишається чорним, біле стає кольором, сіре середнє — 0,75 кольору', () => {
    const black = px(0, 0, 0); tintPixels(black, [200, 100, 50]);
    expect([...black]).toEqual([0, 0, 0, 255]);
    const white = px(255, 255, 255); tintPixels(white, [200, 100, 50]);
    expect([...white]).toEqual([200, 100, 50, 255]);
    const dark = px(64, 64, 64); tintPixels(dark, [200, 100, 50]);
    expect([...dark]).toEqual([76, 38, 19, 255]);   // тіні: чорне → середнє лінійно (64/127 від 0,75·колір)
    const mid = px(127, 127, 127); tintPixels(mid, [200, 100, 50]);
    expect([...mid]).toEqual([150, 75, 37, 255]);   // 0,75·(200,100,50), відкинуто дробову частину
  });

  it('альфа не змінюється; світліший піксель — світліший після забарвлення (тінь зберігається)', () => {
    const a = px(60, 60, 60, 17); const b = px(180, 180, 180, 17);
    tintPixels(a, [90, 120, 60]); tintPixels(b, [90, 120, 60]);
    expect(a[3]).toBe(17);
    expect(b[1]).toBeGreaterThan(a[1] ?? 255);
  });
});

describe('frameIndex', () => {
  it('рядок × 9 + стовпець; стоїть — стовпець 0; чотири напрямки — чотири різні рядки', () => {
    expect(frameIndex('down', 0)).toBe(2 * COLS);
    expect(frameIndex('right', 8)).toBe(3 * COLS + 8);
    expect(new Set(Object.values(DIR_ROW)).size).toBe(4);
  });
});
