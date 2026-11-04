// GAME-229 · підсумок дня: затримки появи категорій і лічильник — без таймерів у коді (механізм — CSS, як у картці розділу).
import { describe, expect, it } from 'vitest';
import { COUNT_MS, REVEAL_STEP_MS, countStyle, revealDelay } from './summary-reveal';
import daySummary from './DaySummary.tsx?raw';
import css from '../../index.html?raw';

describe('категорії розгортаються по одній', () => {
  it('перша — одразу, далі кожна пізніше за попередню рівно на крок', () => {
    expect(revealDelay(0)).toBe(0);
    const d = Array.from({ length: 8 }, (_, i) => revealDelay(i));
    for (let i = 1; i < d.length; i++) expect((d[i] as number) - (d[i - 1] as number)).toBe(REVEAL_STEP_MS);
  });
  it('від’ємний індекс не дає від’ємної затримки', () => {
    expect(revealDelay(-3)).toBe(0);
  });
  it('екран ставить затримку КОЖНІЙ категорії (зростаючу), а не лише першій', () => {
    const delays = [...daySummary.matchAll(/style=\{at\((\d[^)]*)\)\}/g)].map((m) => m[1]);
    expect(delays.length).toBeGreaterThanOrEqual(6);   // нагорода, далі, завтра, секції, гроші, безпека
    expect(delays.slice(0, 3)).toEqual(['0', '1', '2']);
  });
});

describe('лічильник прокручується', () => {
  it('кінцеве число — у --to (ціле, ≥ 0), тривалість стала', () => {
    expect(countStyle(45)).toEqual({ '--to': 45, '--count-ms': `${COUNT_MS}ms` });
    expect(countStyle(-5)['--to']).toBe(0);
    expect(countStyle(7.9)['--to']).toBe(7);
  });
  it('CSS: @property --n ціле, анімація від 0 до --to, а «менше руху» її скорочує до нуля', () => {
    expect(css).toMatch(/@property --n \{ syntax: '<integer>'/);
    expect(css).toMatch(/@keyframes ui-tick \{ from \{ --n: 0; \} to \{ --n: var\(--to, 0\); \} \}/);
    const reduce = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)', css.indexOf('GAME-39 #3')));
    expect(reduce).toMatch(/animation-duration: 0s !important/);
  });
  it('справжнє число лишається в DOM для читача (ui-sr-only), не лише в ::after', () => {
    expect(daySummary).toMatch(/class="ui-sr-only">\{summary\.reward\.xp\}/);
  });
});
