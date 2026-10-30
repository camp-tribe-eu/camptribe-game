import { describe, expect, it } from 'vitest';
import { HINT_FLASH_MS, HINT_IDLE_MS, HintIdle } from './hint-idle';

const run = (h: HintIdle, ms: number, goal: string | null, progress: unknown): boolean => {
  let v = h.visible();
  for (let t = 0; t < ms; t += 100) v = h.tick(100, goal, progress);
  return v;
};

describe('HintIdle: стрілка лише коли застряг', () => {
  it('на старті прихована, з\'являється після 20 с бездіяльності', () => {
    const h = new HintIdle();
    expect(h.tick(16, 'a', 1)).toBe(false);
    expect(run(h, HINT_IDLE_MS - 500, 'a', 1)).toBe(false);
    expect(run(h, 1000, 'a', 1)).toBe(true);
  });
  it('дія (зміна стану) ховає її й перезапускає відлік', () => {
    const h = new HintIdle();
    h.tick(16, 'a', 1);
    expect(run(h, HINT_IDLE_MS + 100, 'a', 1)).toBe(true);
    expect(h.tick(16, 'a', 2)).toBe(false);
    expect(run(h, HINT_IDLE_MS - 500, 'a', 2)).toBe(false);
  });
  it('poke() (механіка, розмова) теж скидає', () => {
    const h = new HintIdle();
    h.tick(16, 'a', 1);
    run(h, HINT_IDLE_MS + 100, 'a', 1);
    h.poke();
    expect(h.visible()).toBe(false);
  });
  it('нова ціль видна ~6 с, потім ховається до нової бездіяльності', () => {
    const h = new HintIdle();
    h.tick(16, 'a', 1);
    expect(h.tick(16, 'b', 2)).toBe(true);
    expect(run(h, HINT_FLASH_MS - 600, 'b', 2)).toBe(true);
    expect(run(h, 1200, 'b', 2)).toBe(false);
    expect(run(h, HINT_IDLE_MS, 'b', 2)).toBe(true);
  });
  it('режим «завжди» показує одразу', () => {
    const h = new HintIdle();
    h.mode = 'always';
    expect(h.tick(16, 'a', 1)).toBe(true);
  });
  it('довгий кадр (згорнута вкладка) не рахується за 20 с', () => {
    const h = new HintIdle();
    h.tick(16, 'a', 1);
    expect(h.tick(60_000, 'a', 1)).toBe(false);
  });
});
