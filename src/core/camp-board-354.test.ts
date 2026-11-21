// GAME-354 · причини «сяк-так» («Чому:») живуть у сейві дошки. Мутація (перевірено, див. звіт): прибрати рядок `reasons` у boardError → «відхиляє» червоніє.
import { describe, expect, it } from 'vitest';
import { boardError } from './camp-board';

const base = { round: 'noon', picks: [], results: { knots: 'scrappy' }, facts: { water: 0, dryLogs: 0, lit: 0, fish: 0, bitter: 0, foodOut: true }, devices: {} };
describe('GAME-354 · camp-board reasons', () => {
  it('старий сейв без reasons і запис із чинною причиною — годяться', () => {
    expect(boardError(base)).toBeNull();
    expect(boardError({ ...base, reasons: { knots: 'camp.reason.knots.cross' } })).toBeNull();
  });
  it('відхиляє чужі дані: не та рутина, не ключ camp.reason, не рядок, не обʼєкт', () => {
    expect(boardError({ ...base, reasons: { nope: 'camp.reason.knots.cross' } })).toBe('reasons');
    expect(boardError({ ...base, reasons: { knots: '<script>' } })).toBe('reasons');
    expect(boardError({ ...base, reasons: { knots: 7 } })).toBe('reasons');
    expect(boardError({ ...base, reasons: 'x' })).toBe('reasons');
  });
  // За рецензією: причина належить своїй справі. Мутація (перевірено): прибрати перевірку префікса в boardError → червоне.
  it('причина чужої справи (порядок біля «Вузлів») — відхилено', () => {
    expect(boardError({ ...base, reasons: { knots: 'camp.reason.tidy.food' } })).toBe('reasons');
  });
});
