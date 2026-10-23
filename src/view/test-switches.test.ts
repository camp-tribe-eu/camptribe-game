import { describe, expect, it } from 'vitest';
import { testSwitches } from './test-switches';

describe('перемикачі e2e (рецензія GAME-36)', () => {
  it('у збірці e2e — працюють', () => {
    expect(testSwitches('?hideAct=complete&hideTouch=interact,up', 'e2e')).toEqual({ hideAct: ['complete'], hideTouch: ['interact', 'up'] });
  });
  it('у звичайній збірці (production, development) — вимкнені', () => {
    for (const mode of ['production', 'development']) expect(testSwitches('?hideAct=complete&hideTouch=interact&seed=7', mode)).toEqual({ hideAct: [], hideTouch: [] });
  });
  it('зерно: лише ціле невід’ємне; інакше — без зерна', () => {
    expect(testSwitches('?seed=7', 'e2e').seed).toBe(7);
    for (const bad of ['?seed=x', '?seed=-1', '?seed=1.5', '']) expect(testSwitches(bad, 'e2e').seed).toBeUndefined();
  });

  it('noAutosave: лише в e2e і лише =1 (GAME-86)', () => {
    expect(testSwitches('?noAutosave=1', 'e2e').noAutosave).toBe(true);
    expect(testSwitches('?noAutosave=0', 'e2e').noAutosave).toBeUndefined();
    expect(testSwitches('?noAutosave=1', 'production').noAutosave).toBeUndefined();
  });
});
