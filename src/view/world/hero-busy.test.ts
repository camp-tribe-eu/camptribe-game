// GAME-235: кожна зайнятість героя окремо блокує сцену серця; вільний герой — ні.
import { describe, expect, it } from 'vitest';
import { heroBusy, type HeroActivity } from './hero-busy';

const FREE: HeroActivity = { acting: false, inWater: false, fishing: false, tent: false, wood: false, fire: false, grill: false, smash: false };

describe('heroBusy', () => {
  it('вільний герой — не зайнятий', () => { expect(heroBusy(FREE)).toBe(false); });
  for (const k of Object.keys(FREE) as (keyof HeroActivity)[]) {
    it(`${k} → зайнятий`, () => { expect(heroBusy({ ...FREE, [k]: true })).toBe(true); });
  }
});
