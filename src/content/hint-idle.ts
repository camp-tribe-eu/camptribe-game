// GAME-192 (OD-022, стовп 7: воля замість повідка): стрілка «Далі» на мапі не веде гравця за руку постійно.
// Вона з'являється, коли гравець застряг (≈20 с без дії), і на ≈6 с після зміни цілі, щоб нову ціль помітили. Чиста логіка таймера — без Phaser і DOM.

export const HINT_IDLE_MS = 20_000;
export const HINT_FLASH_MS = 6_000;
/** Кадр довший за це (згорнута вкладка, пауза) не рахується за час гри. */
const MAX_DT_MS = 250;

export type HintMode = 'stuck' | 'always';

export class HintIdle {
  mode: HintMode = 'stuck';
  private idle = 0;
  private flash = 0;
  private lastGoal: string | null | undefined = undefined;
  private lastProgress: unknown = undefined;

  constructor(private readonly idleMs: number = HINT_IDLE_MS, private readonly flashMs: number = HINT_FLASH_MS) {}

  /** Гравець щось робить (рух ґудзиком дії, розмова, механіка): лічильник бездіяльності й вікно показу скидаються. */
  poke(): void { this.idle = 0; this.flash = 0; }

  /** Крок кадру: `dtMs` — реальний час кадру, `goal` — ціль підказки, `progress` — будь-яке значення, що міняється на кожній дії (знімок стану ядра). */
  tick(dtMs: number, goal: string | null, progress: unknown): boolean {
    const dt = Math.min(Math.max(dtMs, 0), MAX_DT_MS);
    if (this.lastGoal === undefined) { this.lastGoal = goal; this.lastProgress = progress; }   // перша ціль після старту/завантаження — не «нова»
    else if (goal !== this.lastGoal) { this.lastGoal = goal; this.lastProgress = progress; this.idle = 0; this.flash = goal === null ? 0 : this.flashMs; }
    else if (progress !== this.lastProgress) { this.lastProgress = progress; this.poke(); }
    else { this.idle += dt; if (this.flash > 0) this.flash = Math.max(0, this.flash - dt); }
    return this.visible();
  }

  visible(): boolean { return this.mode === 'always' || this.flash > 0 || this.idle >= this.idleMs; }
}
