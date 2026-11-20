// GAME-344 · фіксований крок: міні-ігри лічать час у кадрах гри (1/60 с), а не в кадрах показу. Реальна дельта (мс) копиться в акумуляторі,
// і з нього знімаються цілі кроки; решта лишається на наступний показ. Дельту довшу за межу (вкладку згорнули) ріжемо — гра не вичерпає ліміт за мить.
export const STEP_MS = 1000 / 60;
export const MAX_CATCH_UP_MS = 250;

export interface FixedStep {
  /** Додати реальну дельту (мс); повертає, скільки кроків гри прожити зараз. */
  advance(dtMs: number): number;
  reset(): void;
}

export function createFixedStep(stepMs: number = STEP_MS, maxCatchUpMs: number = MAX_CATCH_UP_MS): FixedStep {
  let acc = 0;
  return {
    advance(dtMs) {
      if (!(dtMs > 0)) return 0;
      acc += Math.min(dtMs, maxCatchUpMs);
      // Допуск на похибку f64: 6 × 16,6667 мс мають дати рівно 6 кроків, а не 5.
      const n = Math.floor(acc / stepMs + 1e-9);
      acc -= n * stepMs;
      if (acc < 0) acc = 0;
      return n;
    },
    reset() { acc = 0; },
  };
}
