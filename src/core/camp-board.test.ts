// GAME-319 · поле facts.berries у сейві дошки. Мутації (перевірено): прибрати перевірку berries → «погані значення» червоніє;
// відхиляти будь-яке задане berries → «0 і 8 приймаються» червоніє; прибрати isInteger → «дробове» червоніє.
import { describe, expect, it } from 'vitest';
import { boardError, BOARD_DEVICES, BOARD_ROUNDS, BOARD_ROUTINES } from './camp-board';
import { ROUNDS, ROUTINE_IDS } from '../content/camp-day';
import { DEVICE_IDS } from '../content/camp-devices';

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

// GAME-337 · «knots» не було в списку дошки: SaveCampBoard відхилялась, результати дня не доходили до сейву й губились при кожній розмові.
// Мутація (перевірено): прибрати 'knots' з BOARD_ROUTINES → обидва тести червоніють.
describe('boardError: кожна рутина дня зберігається', () => {
  it('список ядра збігається з рутинами контенту', () => {
    expect([...BOARD_ROUTINES].sort()).toEqual([...ROUTINE_IDS].sort());
  });
  it('результат і вибір кожної рутини проходять перевірку', () => {
    for (const id of ROUTINE_IDS) {
      const b = { round: 'morning', picks: [{ id, round: 'morning', full: false }], results: { [id]: 'fine' }, devices: {}, facts: { water: 0, dryLogs: 0, lit: 0, fish: 0, bitter: 0, foodOut: true } };
      expect(boardError(b), id).toBeNull();
    }
  });
});

describe('boardError: списки ядра збігаються з контентом (майбутні додавання)', () => {
  it('раунди, пристрої, рутини — ті самі id', () => {
    expect([...BOARD_ROUNDS]).toEqual([...ROUNDS]);
    expect([...BOARD_DEVICES].sort()).toEqual([...DEVICE_IDS].sort());
  });
  it('дошка з УСІМА рутинами, пристроями й раундами приймається', () => {
    const b = { round: 'evening', picks: ROUTINE_IDS.map((id, i) => ({ id, round: ROUNDS[i % ROUNDS.length], full: true })), results: Object.fromEntries(ROUTINE_IDS.map((id) => [id, 'good'])), devices: Object.fromEntries(DEVICE_IDS.map((d) => [d, { care: 1 }])), facts: { water: 1, dryLogs: 0, lit: 0, fish: 0, bitter: 0, foodOut: false } };
    expect(boardError(b)).toBeNull();
    for (const r of ROUNDS) expect(boardError({ ...b, round: r }), r).toBeNull();
  });
});
