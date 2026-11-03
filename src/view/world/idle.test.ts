import { describe, expect, it } from 'vitest';
import { GLYPHS, IDLE_AFTER_MS, IDLE_PERIOD_MS, idleBob, idleOn, isEvening, lookAt } from './idle';

describe('спокій і дихання (GAME-212)', () => {
  it('до 2 с стоячи — вимкнено, після — вмикається', () => {
    expect(idleOn(0)).toBe(false);
    expect(idleOn(IDLE_AFTER_MS)).toBe(false);
    expect(idleOn(IDLE_AFTER_MS + 1)).toBe(true);
    for (let t = 0; t <= IDLE_AFTER_MS; t += 50) expect(idleBob(t)).toBe(0);
  });
  it('після 2 с зсув справді міняється (0 і 1 px, не більше), з різними фазами', () => {
    const seen = new Set<number>();
    for (let t = IDLE_AFTER_MS + 1; t < IDLE_AFTER_MS + 2 * IDLE_PERIOD_MS; t += 20) seen.add(idleBob(t));
    expect([...seen].sort()).toEqual([0, 1]);
    expect(idleBob(IDLE_AFTER_MS + 1, 0)).not.toBe(idleBob(IDLE_AFTER_MS + 1, 2));
  });
  it('сплеск: чує лише поруч, дивиться в його бік', () => {
    expect(lookAt({ x: 0, y: 0 }, { x: 100, y: 10 })).toBe('right');
    expect(lookAt({ x: 0, y: 0 }, { x: -10, y: -100 })).toBe('up');
    expect(lookAt({ x: 0, y: 0 }, { x: 900, y: 0 })).toBeNull();
  });
  it('вечір 18–22, гліфи прямокутні', () => {
    expect(isEvening(17 * 60 + 59)).toBe(false);
    expect(isEvening(19 * 60)).toBe(true);
    expect(isEvening(22 * 60)).toBe(false);
    for (const g of Object.values(GLYPHS)) { expect(g).toHaveLength(7); for (const row of g) expect(row).toHaveLength(5); }
  });
});
