// GAME-195 · рибка на вогнищі руками (OD-023): чиста детермінована логіка. Жодного годинника, Phaser чи Math.random: час дає лише tick.
// Шлях: нанизати на патичок (одна дія) → тримати над полум'ям. Шкала жару росте, поки риба над вогнем; УТРИМАННЯ дії піднімає патичок
// (жар спадає, приготування стоїть), відпустив — риба знову над вогнем. Жар дійшов до краю — рибка трішки підгоріла (без покарання: все одно
// смачно, лише інша репліка за вечерею) і жар спадає до середини. Приготування росте лише поки риба над вогнем.
// Без softlock: рука втомлюється (LIFT_MAX_MS) і риба сама опускається; загальна межа MAX_MS. Без вводу гравця `done` теж настає — з підгорілою рибою.

export const COOK_MS = 4500;
export const HEAT_UP_MS = 2600;
export const HEAT_DOWN_MS = 1200;
export const HEAT_RESET = 0.55;
export const LIFT_MAX_MS = 1500;
export const MAX_MS = 24000;
/** Зелена смужка жару («не спали»): нижче — риба сира, вище — ось-ось підгорить. */
export const SAFE = { from: 0.2, to: 0.8 } as const;

export type GrillPhase = 'idle' | 'skewer' | 'grill' | 'done';
export interface GrillState {
  readonly phase: GrillPhase;
  /** Жар 0..1 і приготування 0..1. */
  readonly heat: number;
  readonly cook: number;
  readonly holding: boolean;
  /** Мс, відколи патичок піднято (рука втомлюється). */
  readonly lifted: number;
  /** Після нанизування й після втоми гравець мусить спершу відпустити дію. */
  readonly lock: boolean;
  /** Скільки разів жар дійшов до краю: > 0 — рибка трішки підгоріла. */
  readonly chars: number;
  readonly total: number;
}
export type GrillEvent = 'none' | 'skewer' | 'char' | 'done';
export type GrillInput = { readonly kind: 'tick'; readonly dtMs: number } | { readonly kind: 'act' } | { readonly kind: 'hold'; readonly down: boolean };

export const GRILL_IDLE: GrillState = { phase: 'idle', heat: 0.3, cook: 0, holding: false, lifted: 0, lock: false, chars: 0, total: 0 };
export const startGrill = (): GrillState => ({ ...GRILL_IDLE, phase: 'skewer' });
export const charred = (s: GrillState): boolean => s.chars > 0;
export const inSafe = (heat: number): boolean => heat >= SAFE.from && heat <= SAFE.to;

export function stepGrill(s: GrillState, i: GrillInput): { state: GrillState; event: GrillEvent } {
  if (i.kind === 'act') {
    if (s.phase !== 'skewer') return { state: s, event: 'none' };
    return { state: { ...s, phase: 'grill', lock: true, holding: false }, event: 'skewer' };
  }
  if (i.kind === 'hold') {
    if (s.phase !== 'grill') return { state: s, event: 'none' };
    if (s.lock) return i.down ? { state: s, event: 'none' } : { state: { ...s, lock: false, holding: false }, event: 'none' };
    return { state: { ...s, holding: i.down, lifted: i.down ? s.lifted : 0 }, event: 'none' };
  }
  if (!(i.dtMs > 0) || s.phase !== 'grill') return { state: s, event: 'none' };
  const dt = i.dtMs;
  const total = s.total + dt;
  let { heat, cook, chars, lifted, holding, lock } = s;
  if (holding) {
    heat = Math.max(0, heat - dt / HEAT_DOWN_MS);
    lifted += dt;
    if (lifted >= LIFT_MAX_MS) { holding = false; lifted = 0; lock = true; }
  } else {
    heat = Math.min(1, heat + dt / HEAT_UP_MS);
    cook = Math.min(1, cook + dt / COOK_MS);
  }
  let event: GrillEvent = 'none';
  if (heat >= 1) { chars += 1; heat = HEAT_RESET; event = 'char'; }
  if (cook >= 1 || total >= MAX_MS) return { state: { ...s, phase: 'done', heat, cook: 1, holding: false, lifted: 0, lock: false, chars: total >= MAX_MS && cook < 1 ? chars + 1 : chars, total }, event: 'done' };
  return { state: { ...s, heat, cook, chars, lifted, holding, lock, total }, event };
}
