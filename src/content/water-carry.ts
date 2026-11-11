// GAME-311 · рутина «вода»: набрати й донести, не розхлюпавши. Чиста детермінована логіка (як tent-pitch/wood-chop):
// стан міняють лише вхід гравця й крок кадру. Жодного Math.random — нерівності стежки дає хеш (крок, зерно).
//
// Робота, а не одна кнопка: спершу тримаєш кран (відпустив рано — мало води, тримав довго — через вінця),
// далі КОЖЕН крок стежки треба ступити тією ногою, у який бік хилить земля (підказку видно заздалегідь).
// Повне відро хилиться охочіше: більше води — важче нести. Розхлюпав — просто менше води, ніякого блоку.

import { grade, timeScale, type HelpState, type Outcome } from './minigame';

/** Мс повного набору відра (від порожнього до вінець). */
export const FILL_MS = 2600;
/** Скільки кроків до табору. */
export const STEPS = 10;
/** Наскільки хилить земля за крок і скільки знімає правильна нога. */
export const STEP_TILT = 0.34;
export const CORRECT = 1;
/** Межа нахилу: перелив. Повне відро (понад BRIM) тримати важче. */
export const TILT_MAX = 1;
export const BRIM = 0.85;
export const TILT_MAX_FULL = 0.62;
/** Скільки води вихлюпується за один перехил. */
export const SPILL = 0.22;

export type Side = 'left' | 'right';
export type WaterPhase = 'fill' | 'carry' | 'done';

export interface WaterState {
  readonly phase: WaterPhase;
  /** Скільки води у відрі, 0..1 (1 — по вінця). */
  readonly level: number;
  /** Мс під краном (лише для відгуку) і скільки часу вода вже ллється через вінця. */
  readonly fillMs: number;
  readonly overMs: number;
  readonly step: number;
  readonly tilt: number;
  readonly spills: number;
  readonly seed: number;
}
export type WaterEvent = 'none' | 'filling' | 'over' | 'carry' | 'step' | 'spill' | 'done';
export type WaterInput =
  | { readonly kind: 'tick'; readonly dtMs: number; readonly down: boolean }
  | { readonly kind: 'step'; readonly side: Side };

export const startWater = (seed = 1): WaterState => ({ phase: 'fill', level: 0, fillMs: 0, overMs: 0, step: 0, tilt: 0, spills: 0, seed });

/** Куди хилить земля на кроці `step`: чистий хеш (зерно, крок) — та сама стежка за тим самим зерном. */
export function drift(seed: number, step: number): Side {
  let z = (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(step + 1, 0xc2b2ae35)) >>> 0;
  z = (z ^ (z >>> 15)) >>> 0;
  return (z & 1) === 0 ? 'left' : 'right';
}
/** Яку ногу треба ставити на цьому кроці: протилежну до нахилу землі. Підказку видно гравцеві заздалегідь. */
export const needSide = (s: WaterState): Side => (drift(s.seed, s.step) === 'left' ? 'right' : 'left');
/** Межа нахилу для поточної повноти відра. */
export const tiltLimit = (level: number): number => (level > BRIM ? TILT_MAX_FULL : TILT_MAX);

export function stepWater(s: WaterState, i: WaterInput, help: HelpState = { scrappyRun: 0, help: false }): { state: WaterState; event: WaterEvent } {
  if (i.kind === 'tick') {
    if (s.phase !== 'fill' || !(i.dtMs > 0)) return { state: s, event: 'none' };
    if (!i.down) return s.level > 0 ? { state: { ...s, phase: 'carry', tilt: 0 }, event: 'carry' } : { state: s, event: 'none' };
    const level = Math.min(1, s.level + i.dtMs / (FILL_MS * timeScale(help)));
    const over = level >= 1 ? s.overMs + i.dtMs : s.overMs;
    return { state: { ...s, level, fillMs: s.fillMs + i.dtMs, overMs: over }, event: level >= 1 ? 'over' : 'filling' };
  }
  if (s.phase !== 'carry') return { state: s, event: 'none' };
  const ground = drift(s.seed, s.step) === 'left' ? -1 : 1;
  const foot = i.side === 'left' ? -1 : 1;
  // Правильна нога (протилежна до нахилу землі) гасить нахил рівно в нуль; хибна — додає стільки ж іще.
  const tilt = s.tilt + (ground + foot * CORRECT) * STEP_TILT;
  const step = s.step + 1;
  const limit = tiltLimit(s.level) * (help.help ? 1.3 : 1);
  if (Math.abs(tilt) > limit) {
    const level = Math.max(0, s.level - SPILL);
    const next: WaterState = { ...s, step, tilt: 0, level, spills: s.spills + 1 };
    return step >= STEPS ? { state: { ...next, phase: 'done' }, event: 'done' } : { state: next, event: 'spill' };
  }
  const next: WaterState = { ...s, step, tilt };
  return step >= STEPS ? { state: { ...next, phase: 'done' }, event: 'done' } : { state: next, event: 'step' };
}

/** Оцінка: скільки води дійшло до табору (частка відра). Переливши під краном, часу згаяв більше — це видно в хвилинах, не тут. */
export const waterScore = (s: WaterState): number => Math.min(1, Math.max(0, s.level));
export const waterOutcome = (s: WaterState): Outcome => grade(waterScore(s));
