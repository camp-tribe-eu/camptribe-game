// GAME-190 · вогнище руками (OD-022): чиста детермінована логіка. Скласти 3 поліна (3 дії) → запалити сірник: ТРИМАТИ дію, шкала полум'я росте, відпустити в зеленому.
// Відпустив рано чи пізно (чи тримав до краю) — сірник згас, спробуй знову, без штрафу. `lit` досяжне лише з відпускання в зеленому; далі полум'я росте (tick) і
// подія `done` каже сцені віддати ядру ту саму команду, що й раніше (obj.campfire → сцена вечора). tick без вводу нічого не завершує.

export const LOGS = 3;
/** За скільки мс шкала доходить від 0 до 1, поки гравець тримає дію; далі — згас. */
export const CHARGE_MS = 2000;
export const BAND = { from: 0.5, to: 0.8 } as const;
/** Скільки росте полум'я після запалу, мс. */
export const GROW_MS = 900;

export type FirePhase = 'idle' | 'stack' | 'match' | 'lit' | 'done';
export interface FireState {
  readonly phase: FirePhase;
  readonly logs: number;
  /** Мс утримання поточного сірника. */
  readonly t: number;
  readonly holding: boolean;
  /** Після складання / згасання гравець мусить спершу відпустити дію (інакше та сама дія одразу почала б шкалу). */
  readonly lock: boolean;
  readonly fizzles: number;
  readonly grow: number;
}
export type FireEvent = 'none' | 'log' | 'stacked' | 'strike' | 'lit' | 'fizzle' | 'done';
export type FireInput = { readonly kind: 'tick'; readonly dtMs: number } | { readonly kind: 'act' } | { readonly kind: 'hold'; readonly down: boolean };

export const FIRE_IDLE: FireState = { phase: 'idle', logs: 0, t: 0, holding: false, lock: false, fizzles: 0, grow: 0 };
export const startFire = (): FireState => ({ ...FIRE_IDLE, phase: 'stack' });

export const chargeAt = (t: number): number => Math.max(0, Math.min(1, t / CHARGE_MS));
export const inBand = (pos: number): boolean => pos >= BAND.from && pos <= BAND.to;

export function stepFire(s: FireState, i: FireInput): { state: FireState; event: FireEvent } {
  if (i.kind === 'tick') {
    if (!(i.dtMs > 0)) return { state: s, event: 'none' };
    if (s.phase === 'match' && s.holding) {
      const t = s.t + i.dtMs;
      return t >= CHARGE_MS ? { state: { ...s, holding: false, t: 0, lock: true, fizzles: s.fizzles + 1 }, event: 'fizzle' } : { state: { ...s, t }, event: 'none' };
    }
    if (s.phase === 'lit') {
      const grow = s.grow + i.dtMs;
      return grow >= GROW_MS ? { state: { ...s, phase: 'done', grow: GROW_MS }, event: 'done' } : { state: { ...s, grow }, event: 'none' };
    }
    return { state: s, event: 'none' };
  }
  if (i.kind === 'act') {
    if (s.phase !== 'stack') return { state: s, event: 'none' };
    const logs = s.logs + 1;
    return logs >= LOGS ? { state: { ...s, phase: 'match', logs, lock: true }, event: 'stacked' } : { state: { ...s, logs }, event: 'log' };
  }
  if (s.phase !== 'match') return { state: s, event: 'none' };
  if (s.lock) return i.down ? { state: s, event: 'none' } : { state: { ...s, lock: false }, event: 'none' };
  if (!s.holding) return i.down ? { state: { ...s, holding: true, t: 0 }, event: 'strike' } : { state: s, event: 'none' };
  if (i.down) return { state: s, event: 'none' };
  return inBand(chargeAt(s.t)) ? { state: { ...s, phase: 'lit', holding: false, grow: 0 }, event: 'lit' } : { state: { ...s, holding: false, t: 0, fizzles: s.fizzles + 1 }, event: 'fizzle' };
}
