// Місток сцена/UI → ядро (TD-001): ні сцена, ні UI не змінюють стан напряму — лише через команди
// і вхід симуляції (кадр, пауза).
import type { Command } from '../../core/commands';
import { newSim, step, type SimState } from '../../core/sim';

export interface Bridge {
  readonly sent: number;
  readonly state: SimState;
  send(command: Command): void;
  /** Реальний час кадру → ігровий годинник ядра (фіксований крок, GAME-13). */
  frame(realMs: number): void;
  setPaused(paused: boolean): void;
}

export function createBridge(seed: number): Bridge {
  let state = newSim(seed, 5_000);
  let sent = 0;
  return {
    get sent() { return sent; },
    get state() { return state; },
    send(command) {
      sent++;
      state = step(state, { kind: 'command', command });
    },
    frame(realMs) {
      state = step(state, { kind: 'frame', realMs });
    },
    setPaused(paused) {
      state = step(state, { kind: paused ? 'pause' : 'resume' });
    },
  };
}
