import { describe, expect, it } from 'vitest';
import { isPhone, needsRotate } from './phone';

describe('телефон чи ні (GAME-96)', () => {
  it('телефон сторч і вбік — телефон; накладка лише сторч', () => {
    expect(isPhone(true, 390, 844)).toBe(true);
    expect(needsRotate(true, 390, 844)).toBe(true);
    expect(isPhone(true, 844, 390)).toBe(true);
    expect(needsRotate(true, 844, 390)).toBe(false);
    expect(needsRotate(true, 568, 320)).toBe(false);
    expect(needsRotate(true, 320, 568)).toBe(true);
  });
  it('планшет (820×1180, 744×1133) і десктоп без дотику — ніколи', () => {
    expect(needsRotate(true, 820, 1180)).toBe(false);
    expect(needsRotate(true, 744, 1133)).toBe(false);
    expect(needsRotate(false, 1280, 800)).toBe(false);
    expect(needsRotate(false, 390, 844)).toBe(false);   // вузьке вікно десктопа без дотику
    expect(needsRotate(true, 1280, 800)).toBe(false);   // сенсорний ноутбук
  });
  it('межа: короткий бік 500 — телефон, 501 — ні', () => {
    expect(isPhone(true, 500, 900)).toBe(true);
    expect(isPhone(true, 501, 900)).toBe(false);
  });
});
