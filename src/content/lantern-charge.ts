// GAME-311 · рутина «ліхтарі»: зарядити ВДЕНЬ, бо вночі буря і світла не буде. Чиста логіка, час — лише tick.
//
// Два шляхи, і обидва — робота:
//  * сонце: ліхтар треба ПЕРЕКЛАДАТИ — плями світла повзуть по табору, і забутий ліхтар лежить у тіні
//    (а в дощ сонця немає зовсім: тоді лишається динамо);
//  * динамо: ритмічні оберти ручки — тап у смузі оберту дає заряд, невлучний майже нічого.
// Одним дотиком це закрити не можна: один тап заряджає щонайбільше CRANK_GAIN (три ліхтарі — ніколи не 'good').

import { NORMAL, grade, widen, type Difficulty, type Outcome } from './minigame';
import type { Weather } from '../core/weather';

export const LANTERNS = 3;
/** Скільки плям сонця в таборі й за скільки мс сонце переходить на наступну пляму. */
export const SPOTS = 4;
export const SUN_SHIFT_MS = 3000;
/** Заряд за секунду на сонці (ясно) і за хмар. У дощ — нуль. */
export const SUN_RATE = 0.22;
export const CLOUD_RATE = 0.08;
/** Повний оберт ручки динамо, мс, і смуга, у якій тап дає заряд. */
export const CRANK_MS = 900;
export const CRANK_BAND = { from: 0.55, to: 0.85 } as const;
export const CRANK_GAIN = 0.1;
export const CRANK_WEAK = 0.02;

export interface LanternState {
  /** Заряд кожного ліхтаря 0..1. */
  readonly charge: readonly number[];
  /** На якій плямі лежить кожен ліхтар; -1 — у руках/на столі (не заряджається). */
  readonly at: readonly number[];
  /** Яка пляма зараз під сонцем і скільки мс від останнього зсуву. */
  readonly sun: number;
  readonly t: number;
  /** Фаза оберту динамо, мс. */
  readonly crankT: number;
  readonly cranks: number;
  readonly misses: number;
}
export type LanternEvent = 'none' | 'moved' | 'sunShift' | 'crank' | 'weak';
export type LanternInput =
  | { readonly kind: 'tick'; readonly dtMs: number; readonly weather: Weather }
  | { readonly kind: 'put'; readonly lantern: number; readonly spot: number }
  | { readonly kind: 'crank'; readonly lantern: number };

export const startLanterns = (): LanternState => ({ charge: Array.from({ length: LANTERNS }, () => 0), at: Array.from({ length: LANTERNS }, () => -1), sun: 0, t: 0, crankT: 0, cranks: 0, misses: 0 });

/** Скільки заряду за секунду дає сонце за цієї погоди. */
export const sunRate = (w: Weather): number => (w === 'sunny' ? SUN_RATE : w === 'cloudy' ? CLOUD_RATE : 0);
/** Де зараз маркер оберту динамо, 0..1. */
export const crankAt = (s: LanternState): number => ((s.crankT % CRANK_MS) + CRANK_MS) % CRANK_MS / CRANK_MS;

const put = (xs: readonly number[], i: number, v: number): number[] => xs.map((x, k) => (k === i ? v : x));

export function stepLanterns(s: LanternState, i: LanternInput, d: Difficulty = NORMAL): { state: LanternState; event: LanternEvent } {
  if (i.kind === 'put') {
    if (i.lantern < 0 || i.lantern >= LANTERNS || i.spot < -1 || i.spot >= SPOTS) return { state: s, event: 'none' };
    return { state: { ...s, at: put(s.at, i.lantern, i.spot) }, event: 'moved' };
  }
  if (i.kind === 'crank') {
    if (i.lantern < 0 || i.lantern >= LANTERNS) return { state: s, event: 'none' };
    const band = widen(CRANK_BAND, d);
    const pos = crankAt(s);
    const ok = pos >= band.from && pos <= band.to;
    const gain = ok ? CRANK_GAIN : CRANK_WEAK;
    const charge = put(s.charge, i.lantern, Math.min(1, (s.charge[i.lantern] ?? 0) + gain));
    return { state: { ...s, charge, cranks: s.cranks + (ok ? 1 : 0), misses: s.misses + (ok ? 0 : 1) }, event: ok ? 'crank' : 'weak' };
  }
  if (!(i.dtMs > 0)) return { state: s, event: 'none' };
  const rate = sunRate(i.weather);
  const charge = s.charge.map((c, k) => (s.at[k] === s.sun ? Math.min(1, c + (rate * i.dtMs) / 1000) : c));
  const t = s.t + i.dtMs;
  const crankT = s.crankT + i.dtMs;
  if (t >= SUN_SHIFT_MS) return { state: { ...s, charge, t: t - SUN_SHIFT_MS, crankT, sun: (s.sun + 1) % SPOTS }, event: 'sunShift' };
  return { state: { ...s, charge, t, crankT }, event: 'none' };
}

/** Оцінка: середній заряд трьох ліхтарів. */
export const lanternScore = (s: LanternState): number => s.charge.reduce((a, b) => a + b, 0) / LANTERNS;
export const lanternOutcome = (s: LanternState): Outcome => grade(lanternScore(s));
/** Скільки ліхтарів справді світитимуть уночі (заряд від половини). */
export const LIT_AT = 0.5;
export const litCount = (s: LanternState): number => s.charge.filter((c) => c >= LIT_AT).length;
