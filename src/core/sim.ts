// Крок симуляції: стан гри + годинник + RNG. Вхід — лише журнал (кадри, команди, перемотування),
// тож той самий seed і той самий журнал дають той самий стан (GAME-13).

import { advance, newClock, pause, resume, tick, type GameClock } from './clock';
import { dispatch, type Command } from './commands';
import { EMPTY_DEFS, type CoreDefs } from './defs';
import { nextInt, seedRng, type RngState } from './rng';
import { initialState, type GameState } from './state';

export interface SimState {
  readonly game: GameState;
  readonly clock: GameClock;
  readonly rng: RngState;
  /** Скільки разів за кроки вільного руху випала дрібна знахідка — приклад системи, що споживає RNG. */
  readonly finds: number;
}

export type Input =
  | { readonly kind: 'frame'; readonly realMs: number }
  | { readonly kind: 'command'; readonly command: Command }
  | { readonly kind: 'advance'; readonly minutes: number }
  | { readonly kind: 'pause' }
  | { readonly kind: 'resume' };

/** Система вільного руху: кожна ігрова хвилина — шанс 1/50 дрібної знахідки. Лише через RNG стану. */
export type System = (s: SimState, steps: number) => SimState;

export const findsSystem: System = (s, steps) => {
  let rng = s.rng;
  let finds = s.finds;
  for (let i = 0; i < steps; i++) {
    const r = nextInt(rng, 50);
    rng = r.state;
    if (r.value === 0) finds++;
  }
  return { ...s, rng, finds };
};

export function newSim(seed: number, moneyCents = 0): SimState {
  return { game: initialState(moneyCents), clock: newClock(), rng: seedRng(seed), finds: 0 };
}

/** Контекст кроку: незмінний каталог визначень і системи. У сейв не потрапляє. */
export interface StepCtx {
  readonly defs?: CoreDefs;
  readonly systems?: readonly System[];
}

export function step(s: SimState, input: Input, ctx: StepCtx = {}): SimState {
  const systems = ctx.systems ?? [findsSystem];
  switch (input.kind) {
    case 'frame': {
      const t = tick(s.clock, input.realMs);
      return systems.reduce((acc, sys) => sys(acc, t.steps), { ...s, clock: t.clock });
    }
    case 'command':
      return { ...s, game: dispatch(s.game, input.command, ctx.defs ?? EMPTY_DEFS).state };
    case 'advance':
      return { ...s, clock: advance(s.clock, input.minutes) };
    case 'pause':
      return { ...s, clock: pause(s.clock) };
    case 'resume':
      return { ...s, clock: resume(s.clock) };
  }
}

export const run = (s: SimState, log: readonly Input[], ctx: StepCtx = {}): SimState =>
  log.reduce((acc, i) => step(acc, i, ctx), s);
