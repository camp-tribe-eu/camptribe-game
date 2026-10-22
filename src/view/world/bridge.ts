// Місток сцена → ядро (TD-001): сцена не змінює стан, лише надсилає команду.
import type { Command } from '../../core/commands';
import { newSim, step, type SimState } from '../../core/sim';

export interface Bridge {
  readonly sent: number;
  readonly state: SimState;
  send(command: Command): void;
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
  };
}
