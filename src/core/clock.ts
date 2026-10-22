// Ігровий годинник (SIMULATION_RULES SIM-TIME-001…008). Фіксований крок: реальний час кадру
// накопичується, симуляція просувається цілими кроками. Пауза (меню, діалог) зупиняє час.

/** 1 реальна секунда вільної сцени = 1 ігрова хвилина (SIM-TIME-002, тимчасово). */
export const STEP_MS = 1000;

export interface GameClock {
  /** Ігрові хвилини від початку проходження. */
  readonly minutes: number;
  /** Накопичений реальний час, менший за крок. */
  readonly accMs: number;
  readonly paused: boolean;
}

export const newClock = (): GameClock => ({ minutes: 0, accMs: 0, paused: false });

/** Кадр: додає реальний час; повертає годинник і кількість зроблених ігрових кроків. */
export function tick(clock: GameClock, realMs: number): { clock: GameClock; steps: number } {
  if (clock.paused || !(realMs > 0)) return { clock, steps: 0 };
  const total = clock.accMs + realMs;
  const steps = Math.floor(total / STEP_MS);
  return { clock: { ...clock, minutes: clock.minutes + steps, accMs: total - steps * STEP_MS }, steps };
}

/** Довга дія (сон, дорога, ремонт): перемотує час одним кроком (SIM-TIME-004). */
export function advance(clock: GameClock, minutes: number): GameClock {
  if (!Number.isSafeInteger(minutes) || minutes < 0) throw new RangeError(`advance: ${minutes}`);
  return { ...clock, minutes: clock.minutes + minutes };
}

export const pause = (c: GameClock): GameClock => ({ ...c, paused: true });
export const resume = (c: GameClock): GameClock => ({ ...c, paused: false });
