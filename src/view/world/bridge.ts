// Місток сцена/UI → ядро (TD-001): ні сцена, ні UI не змінюють стан напряму — лише наміри
// через команди і вхід симуляції (кадр, пауза). commandId видає місток із `seq` стану ядра:
// після завантаження сейву id не повторюється (рецензія TL PR #13).
import type { Command } from '../../core/commands';
import type { CoreDefs } from '../../core/defs';
import { newSim, step, type SimState } from '../../core/sim';

/** Команда без commandId — його видає місток. */
export type Intent = Command extends infer C ? (C extends Command ? Omit<C, 'commandId'> : never) : never;

/** Реальний час кадру обрізаємо: згорнута вкладка не перемотує ігровий час стрибком (TL PR #13). */
export const MAX_FRAME_MS = 250;

export interface Bridge {
  readonly sent: number;
  readonly state: SimState;
  send(intent: Intent): void;
  /** Реальний час кадру → ігровий годинник ядра (фіксований крок, GAME-13). */
  frame(realMs: number): void;
  setPaused(paused: boolean): void;
  /** Замінити стан завантаженим сейвом (вже перевіреним ядром, fromSave). */
  load(sim: SimState): void;
}

export function createBridge(seed: number, defs: CoreDefs): Bridge {
  let state = newSim(seed, 5_000);
  let sent = 0;
  return {
    get sent() { return sent; },
    get state() { return state; },
    send(intent) {
      sent++;
      const command = { ...intent, commandId: `c${state.game.seq}` } as Command;
      state = step(state, { kind: 'command', command }, { defs });
    },
    frame(realMs) {
      state = step(state, { kind: 'frame', realMs: Math.min(realMs, MAX_FRAME_MS) }, { defs });
    },
    setPaused(paused) {
      state = step(state, { kind: paused ? 'pause' : 'resume' }, { defs });
    },
    load(sim) {
      state = sim;
    },
  };
}
