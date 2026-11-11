// GAME-311 · договір міні-ігор. Мутації, кожна з яких робить цей файл червоним:
//   «два результати» (grade без 'scrappy') · «сяк-так блокує» (blocks → true) · «допомога ніколи» (afterTry без help)
//   · «допомога нічого не міняє» (widen повертає ту саму смугу).
import { describe, expect, it } from 'vitest';
import { BAND_HELP, FINE_AT, GOOD_AT, HELP_AFTER, NO_HELP, OUTCOMES, afterTry, bandScale, blocks, grade, timeScale, widen } from './minigame';

describe('три результати', () => {
  it('добре / нормально / сяк-так — усі три існують і межі саме такі', () => {
    expect(OUTCOMES).toEqual(['good', 'fine', 'scrappy']);
    expect(grade(1)).toBe('good');
    expect(grade(GOOD_AT)).toBe('good');
    expect(grade(GOOD_AT - 0.01)).toBe('fine');
    expect(grade(FINE_AT)).toBe('fine');
    expect(grade(FINE_AT - 0.01)).toBe('scrappy');
    expect(grade(0)).toBe('scrappy');
    expect(new Set(OUTCOMES.map((o) => o))).toEqual(new Set(['good', 'fine', 'scrappy']));
  });
  it('жоден результат не блокує — зокрема «сяк-так»', () => {
    for (const o of OUTCOMES) expect(blocks(o)).toBe(false);
  });
  it('оцінка поза 0..1 і не-число не ламають шкалу', () => {
    expect(grade(5)).toBe('good');
    expect(grade(-3)).toBe('scrappy');
    expect(grade(Number.NaN)).toBe('scrappy');
  });
});

describe('допомога після двох «сяк-так» поспіль', () => {
  it(`приходить рівно після ${HELP_AFTER} і не раніше`, () => {
    const one = afterTry(NO_HELP, 'scrappy');
    expect(one.help).toBe(false);
    const two = afterTry(one, 'scrappy');
    expect(two.help).toBe(true);
    expect(two.scrappyRun).toBe(HELP_AFTER);
  });
  it('нормальна спроба збиває лічильник, але вже видану допомогу не забирає', () => {
    const after = afterTry(afterTry(NO_HELP, 'scrappy'), 'fine');
    expect(after).toEqual({ scrappyRun: 0, help: false });
    const helped = afterTry(afterTry(afterTry(NO_HELP, 'scrappy'), 'scrappy'), 'good');
    expect(helped).toEqual({ scrappyRun: 0, help: true });
  });
  it('допомога справді полегшує: смуга ширша, часу більше', () => {
    const help = { scrappyRun: 2, help: true };
    expect(bandScale(NO_HELP)).toBe(1);
    expect(timeScale(NO_HELP)).toBe(1);
    expect(bandScale(help)).toBe(BAND_HELP);
    expect(timeScale(help)).toBeGreaterThan(1);
    const band = { from: 0.4, to: 0.6 };
    expect(widen(band, NO_HELP)).toEqual(band);
    const wide = widen(band, help);
    expect(wide.to - wide.from).toBeGreaterThan(band.to - band.from);
    expect(wide.from).toBeGreaterThanOrEqual(0);
    expect(wide.to).toBeLessThanOrEqual(1);
  });
  it('смуга з допомогою не вилазить за межі шкали', () => {
    const wide = widen({ from: 0, to: 1 }, { scrappyRun: 2, help: true });
    expect(wide).toEqual({ from: 0, to: 1 });
  });
});
