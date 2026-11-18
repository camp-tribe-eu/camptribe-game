// GAME-319 · поле facts.berries у сейві дошки. Мутації (перевірено): прибрати перевірку berries → «погані значення» червоніє;
// відхиляти будь-яке задане berries → «0 і 8 приймаються» червоніє; прибрати isInteger → «дробове» червоніє.
import { describe, expect, it } from 'vitest';
import { boardError } from './camp-board';

const board = (facts: Record<string, unknown>): unknown => ({
  round: 'morning', picks: [], results: {}, devices: {},
  facts: { water: 0, dryLogs: 0, lit: 0, fish: 0, bitter: 0, foodOut: true, ...facts },
});

describe('boardError: facts.berries', () => {
  it('0 і 8 приймаються, відсутнє — теж (старий сейв)', () => {
    expect(boardError(board({ berries: 0 }))).toBeNull();
    expect(boardError(board({ berries: 8 }))).toBeNull();
    expect(boardError(board({}))).toBeNull();
  });
  it('від’ємне, дробове, більше межі, рядок, null — відхиляються', () => {
    for (const bad of [-1, 2.5, 65, '3', null, NaN]) expect(boardError(board({ berries: bad })), String(bad)).toBe('facts');
  });
});
