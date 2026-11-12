// GAME-311 · перехідник до каркаса GAME-308: оцінка 0..1 → результат, смуга ширшає саме від послаблення каркаса,
// і свого договору тут немає. Мутації, що роблять цей файл червоним: «два результати» (grade без 'scrappy')
// · «допомога нічого не міняє» (widen ігнорує bandScale) · «допомога не з каркаса» (підставити свій лічильник).
import { describe, expect, it } from 'vitest';
import { FINE_AT, GOOD_AT, HELP_AFTER, NORMAL, OUTCOMES, RELAXED, difficultyFor, grade, widen } from './minigame';
import { OUTCOMES as CORE_OUTCOMES, type MinigameRecord } from '../core/minigame';

const record = (scrappyStreak: number): MinigameRecord => ({ last: 'scrappy', consequence: 'x', plays: scrappyStreak, scrappyStreak });

describe('оцінка → результат', () => {
  it('три результати каркаса, і межі саме такі', () => {
    expect(OUTCOMES).toEqual(CORE_OUTCOMES);
    expect(grade(1)).toBe('good');
    expect(grade(GOOD_AT)).toBe('good');
    expect(grade(GOOD_AT - 0.01)).toBe('fine');
    expect(grade(FINE_AT)).toBe('fine');
    expect(grade(FINE_AT - 0.01)).toBe('scrappy');
    expect(grade(0)).toBe('scrappy');
  });
  it('оцінка поза 0..1 і не-число не ламають шкалу', () => {
    expect(grade(5)).toBe('good');
    expect(grade(-3)).toBe('scrappy');
    expect(grade(Number.NaN)).toBe('scrappy');
  });
});

describe('допомога — рівно та, що в каркасі', () => {
  it(`приходить після ${HELP_AFTER} «сяк-так» поспіль і не раніше`, () => {
    expect(difficultyFor(undefined)).toBe(NORMAL);
    expect(difficultyFor(record(HELP_AFTER - 1))).toBe(NORMAL);
    expect(difficultyFor(record(HELP_AFTER))).toBe(RELAXED);
  });
  it('послаблення справді ширшає смугу, а не вдає', () => {
    const band = { from: 0.4, to: 0.6 };
    expect(widen(band, NORMAL)).toEqual(band);
    const wide = widen(band, RELAXED);
    expect(wide.to - wide.from).toBeGreaterThan(band.to - band.from);
    expect(RELAXED.bandScale).toBeGreaterThan(1);
    expect(RELAXED.timeScale).toBeGreaterThan(1);
  });
  it('смуга з допомогою не вилазить за межі шкали', () => {
    expect(widen({ from: 0, to: 1 }, RELAXED)).toEqual({ from: 0, to: 1 });
  });
  it('без складності — звичайна гра (нічого не полегшено мовчки)', () => {
    const same = widen({ from: 0.3, to: 0.5 });
    expect(same.from).toBeCloseTo(0.3, 10);
    expect(same.to).toBeCloseTo(0.5, 10);
  });
});
