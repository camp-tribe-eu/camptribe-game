import { describe, expect, it } from 'vitest';
import { shopOpen, isNight, minuteOfDay } from '../core/clock';
import uk from '../i18n/uk.json';
import { INTRO_START_LABEL, INTRO_START_TOD, INTRO_STEPS, MORNING_AT, PICK_AT, afterPick, skipTarget } from './intro-story';

describe('вступ як розкадровка (GAME-249)', () => {
  it('порядок: пошук → лист → вибір → Атлас → план → ніч → ранок → метушня → мета', () => {
    expect(INTRO_STEPS.map((s) => s.kind)).toEqual(['search', 'letter', 'pick', 'atlas', 'line', 'line', 'line', 'line', 'night', 'morning', 'line', 'line', 'line', 'goal']);
  });
  it('ніч до сну, ранок після; останній рядок ночі — «Завтра рано. Спати.»', () => {
    expect(INTRO_STEPS.slice(0, MORNING_AT).every((s) => s.phase === 'night')).toBe(true);
    expect(INTRO_STEPS.slice(MORNING_AT).every((s) => s.phase === 'morning')).toBe(true);
    expect((uk as Record<string, string>)[INTRO_STEPS[MORNING_AT - 2]?.text ?? '']).toBe('Завтра рано. Спати.');
  });
  it('пропуск: без героя — до вибору, а після вибору — на ранок удома, ніколи повз ранок', () => {
    for (let i = 0; i < MORNING_AT; i++) expect(skipTarget(i, false)).toBe(i < PICK_AT ? PICK_AT : MORNING_AT);
    for (let i = 0; i < MORNING_AT; i++) expect(skipTarget(i, true)).toBe(MORNING_AT);
    expect(afterPick(true)).toBe(MORNING_AT);
    expect(afterPick(false)).toBe(PICK_AT + 1);
    for (let i = MORNING_AT; i < INTRO_STEPS.length; i++) expect(skipTarget(i, true)).toBeNull();
  });
  it('старт світу — 08:00 ранку: годинник ядра, не ніч, крамниця відчинена (підпис кроку «ранок» бере час із годинника)', () => {
    expect(INTRO_START_TOD).toBe(8 * 60);
    expect(INTRO_START_LABEL).toBe('08:00');
    expect(minuteOfDay(0)).toBe(INTRO_START_TOD);
    expect(isNight(0)).toBe(false);
    expect(shopOpen(0)).toBe(true);
    expect(uk['intro.morning' as keyof typeof uk]).toContain(INTRO_START_LABEL);
  });
});
