// GAME-346 · репліка мешканця не лягає на підпис дії біля героя (L05).
// Мутація (перевірено): barkAvoiding завжди повертає `bottom` → «не перетинає підпис» червоніє.
import { describe, expect, it } from 'vitest';
import { barkAvoiding, type Box } from './bark-place';

const overlap = (a: Box, b: Box): boolean => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
const hint: Box = { x0: 100, y0: 100, x1: 180, y1: 112 };
const box = (bottom: number, h: number): Box => ({ x0: 110, y0: bottom - h, x1: 170, y1: bottom });

describe('barkAvoiding', () => {
  it('підпису нема або не заважає — репліка там, де була', () => {
    expect(barkAvoiding(150, 110, 170, 30, null, 0)).toBe(150);
    expect(barkAvoiding(60, 110, 170, 30, hint, 0)).toBe(60);
  });
  it('лягає на підпис — не перетинає його: зсувається вгору', () => {
    const b = barkAvoiding(120, 110, 170, 30, hint, 0);
    expect(overlap(box(b, 30), hint)).toBe(false);
    expect(b).toBeLessThan(120);
  });
  it('угорі нема місця (край кадру) — переходить під підпис, а не за межі кадру', () => {
    const b = barkAvoiding(120, 110, 170, 30, hint, 90);
    expect(overlap(box(b, 30), hint)).toBe(false);
    expect(b - 30).toBeGreaterThanOrEqual(hint.y1);
  });
});
