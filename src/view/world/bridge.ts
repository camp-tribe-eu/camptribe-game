// Місток сцена/UI → ядро (TD-001): ні сцена, ні UI не змінюють стан напряму — лише наміри
// через команди і вхід симуляції (кадр, пауза). commandId видає місток із `seq` стану ядра:
// після завантаження сейву id не повторюється (рецензія TL PR #13).
import { nextCommandId, type Command } from '../../core/commands';
import { checkDefs, freezeDefs, type CoreDefs } from '../../core/defs';
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
  /** Нова гра: чистий стан зі свіжим сідом (GAME-89 №2) і стартовими грошима. Сід лягає в worldSeed сейву. */
  restart(): void;
}

const START_MONEY_CENTS = 5_000;

/**
 * `freshSeed` — звідки береться сід НОВОЇ гри (GAME-89 №2). Раніше кожна нова гра мала той самий сід 20261022, тож
 * погода першого дня була завжди та сама (15 із 15 — дощ). Ядро від цього не змінюється: сід лише потрапляє в
 * `worldSeed` стану, а значить у сейв (схема не змінена), і та сама гра відтворюється з журналу. Випадковість —
 * тут, на межі (main.ts дає crypto), а не в ядрі. Без `freshSeed` нова гра, як і раніше, бере початковий сід (тести).
 */
export function createBridge(seed: number, catalog: CoreDefs, afterSend?: () => void, freshSeed?: () => number): Bridge {
  const problems = checkDefs(catalog);
  if (problems.length) throw new Error(`catalog is invalid: ${JSON.stringify(problems)}`);
  const defs = freezeDefs(catalog);
  let state = newSim(seed, START_MONEY_CENTS);
  let sent = 0;
  return {
    get sent() { return sent; },
    get state() { return state; },
    send(intent) {
      sent++;
      const command = { ...intent, commandId: nextCommandId(state.game) } as Command;
      state = step(state, { kind: 'command', command }, { defs });
      afterSend?.();   // GAME-86: стан змінила команда — автозбереження (не кожен кадр)
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
    restart() {
      state = newSim(freshSeed ? freshSeed() : seed, START_MONEY_CENTS);
      sent = 0;
    },
  };
}
