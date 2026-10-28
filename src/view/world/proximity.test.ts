import { describe, expect, it } from 'vitest';
import { RING_IDLE, RING_S, isAutoSpot, ringMayTake, stepRing } from './proximity';

function run(near: string | null, armed: boolean, hold: boolean, seconds: number, dt = 1 / 60): string | null {
  let r = RING_IDLE;
  for (let t = 0; t < seconds; t += dt) {
    const s = stepRing(r, near, armed, hold, dt);
    if (s.fire) return s.fire;
    r = s.ring;
  }
  return null;
}

describe('кільце наближення (GAME-175)', () => {
  it('спрацьовує за ≤ 0,8 с і лише для автооб\'єктів', () => {
    expect(RING_S).toBeLessThanOrEqual(0.8);
    expect(run('take.item.tent', true, true, 0.8)).toBe('take.item.tent');
    expect(run('npc.george', true, true, 3)).toBeNull();
    expect(run('obj.trunk', true, true, 3)).toBeNull();
  });
  it('не спрацьовує без озброєння, без утримання і після зміни цілі', () => {
    expect(run('step.ST-001', false, true, 3)).toBeNull();
    expect(run('obj.vehicle', true, false, 3)).toBeNull();
    let r = RING_IDLE;
    for (let i = 0; i < 30; i++) r = stepRing(r, 'step.ST-001', true, true, 1 / 60).ring;
    const s = stepRing(r, 'step.ST-002', true, true, 1 / 60);
    expect(s.ring.t).toBeLessThan(0.05);
  });
  it('повз зайву річ на полиці іти можна: кільце бере лише поточну ціль (ringMayTake)', () => {
    expect(ringMayTake('pack.item.lantern-3', 'pack.item.water')).toBe(false);
    expect(ringMayTake('pack.item.water', 'pack.item.water')).toBe(true);
    expect(ringMayTake('step.ST-001', null)).toBe(true);
    expect(ringMayTake('obj.vehicle', 'pack.item.water')).toBe(true);
    expect(ringMayTake(null, null)).toBe(false);
  });
  it('isAutoSpot', () => { expect(isAutoSpot('pack.item.water')).toBe(true); expect(isAutoSpot('task.firewood')).toBe(false); });
});
