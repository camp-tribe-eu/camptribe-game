import { describe, expect, it } from 'vitest';
import { createFixedStep, MAX_CATCH_UP_MS, STEP_MS } from './fixed-step';
import { createMinigameSession } from './minigame-session';
import { MINIGAMES } from '../content/minigames';

// Прожити `seconds` реального часу з дельтою `dt`; `act` викликається РІВНО раз на кадр гри з його номером (сценарій за ігровим часом).
function drive(dt: number, seconds: number, onGameFrame: (f: number) => void, step = createFixedStep()): number {
  let game = 0;
  for (let t = 0; t < seconds * 1000; t += dt) {
    for (let i = step.advance(dt); i > 0; i--) onGameFrame(game++);
  }
  return game;
}

describe('GAME-344 fixed step', () => {
  it('same game time at 120/60/30 Hz (± one step)', () => {
    const counts = [1000 / 120, 1000 / 60, 1000 / 30].map((dt) => drive(dt, 10, () => {}));
    for (const c of counts) expect(Math.abs(c - 600)).toBeLessThanOrEqual(1);
  });

  it('scripted input lands at the same game frames at any refresh rate', () => {
    const def = MINIGAMES[0];
    if (!def) throw new Error('no minigames');
    const outcomes = [1000 / 120, 1000 / 60, 1000 / 30].map((dt) => {
      const s = createMinigameSession(def, { results: undefined, seed: 7, report: () => {} });
      s.start();
      const step = createFixedStep();
      let game = 0;
      for (let t = 0; t < 4000; t += dt) {
        for (let i = step.advance(dt); i > 0; i--) { if (game % 45 === 0) s.tap({ x: 0.5, y: 0.5 }); s.frame(1); game++; }
      }
      return { frame: s.run.frame, game };
    });
    const ref = outcomes[1] ?? { frame: -1, game: -1 };
    for (const o of outcomes) { expect(Math.abs(o.frame - ref.frame)).toBeLessThanOrEqual(1); expect(Math.abs(o.game - 240)).toBeLessThanOrEqual(1); expect(o.frame).toBeGreaterThan(0); }
  });

  it('a 60 s limit takes ~60 real seconds at 120 Hz, not 30', () => {
    const frames = drive(1000 / 120, 30, () => {});
    expect(frames).toBeLessThanOrEqual(1801);
    expect(frames).toBeGreaterThanOrEqual(1799);
  });

  it('clamps a huge dt (tab resumed) to the catch-up max', () => {
    const step = createFixedStep();
    expect(step.advance(60_000)).toBe(Math.round(MAX_CATCH_UP_MS / STEP_MS));
  });

  it('frame(2) applies a pending tap once; frame(0) keeps it buffered', () => {
    const def = MINIGAMES.find((m) => m.id === 'mg.lantern-crank');
    if (!def) throw new Error('no crank');
    const s = createMinigameSession(def, { results: undefined, seed: 7, report: () => {} });
    s.start();
    s.tap({ x: 0.5, y: 0.5 });
    s.frame(0);
    expect((s.run.state as { lastTap: number | null }).lastTap).toBeNull();
    s.frame(2);
    expect(s.run.frame).toBe(2);
    expect((s.run.state as { lastTap: number | null }).lastTap).toBe(0);   // дотик прийнятий у першому кадрі, у другому — ні
  });

  it('ignores zero and negative dt', () => {
    const step = createFixedStep();
    expect(step.advance(0)).toBe(0);
    expect(step.advance(-5)).toBe(0);
  });
});
