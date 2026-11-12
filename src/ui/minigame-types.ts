// GAME-308 · порт UI ↔ сесія міні-гри. UI не знає ядра: бачить лише цей знімок і просить дії (тап, перетягування, пауза, «далі без цього»).
export type MinigamePhase = 'open' | 'play' | 'result' | 'closed';

export interface MinigameView {
  readonly id: string;
  readonly phase: MinigamePhase;
  readonly paused: boolean;
  /** Допомога активна (після двох «сяк-так» поспіль): більше часу, ширша смуга, підказка. */
  readonly helped: boolean;
  readonly outcome: 'good' | 'fine' | 'scrappy' | null;
  /** Скільки гри мина: кадр / межа кадрів, 0..1. */
  readonly progress: number;
  readonly titleKey: string;
  readonly introKey: string;
  readonly hintKey: string;
  readonly resultKey: string | null;
  /** Дані для поверхні конкретної гри (MinigameDef.view). */
  readonly surface: unknown;
}

/** Точка дотику в долях поля гри, 0..1. */
export interface MinigamePoint { readonly x: number; readonly y: number }

export interface MinigameSessionPort {
  view(): MinigameView;
  start(): void;
  pause(): void;
  resume(): void;
  /** «Далі без цього»: гру закінчено як «сяк-так», ніхто не застряг. */
  moveOn(): void;
  close(): void;
  tap(p: MinigamePoint): void;
  drag(p: MinigamePoint | null): void;
  subscribe(listener: () => void): () => void;
}
