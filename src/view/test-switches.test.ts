import { describe, expect, it } from 'vitest';
import { testSwitches } from './test-switches';

describe('перемикачі e2e (рецензія GAME-36)', () => {
  it('у збірці e2e — працюють', () => {
    expect(testSwitches('?hideAct=complete&hideTouch=interact,up', 'e2e')).toEqual({ hideAct: ['complete'], hideTouch: ['interact', 'up'] });
  });
  it('у звичайній збірці (production, development) — вимкнені', () => {
    for (const mode of ['production', 'development']) expect(testSwitches('?hideAct=complete&hideTouch=interact', mode)).toEqual({ hideAct: [], hideTouch: [] });
  });
});
