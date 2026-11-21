// GAME-311 · рутина «вогонь»: міні-гра «жар у смузі». Чиста логіка, час — лише tick.
//
// Жар сам по собі падає. Три дії, і кожна має ціну: підкинути дрова (багато жару, але спершу дим і провал),
// роздмухати (швидко й коротко), розгребти (жар нижче, зате рівний). Страви йдуть одна за одною, у кожної
// своя смуга: те, що добре юшці, спалить рибу. Перегрів — підгоріло, недогрів — сире; і те, і те лише
// гірша вечеря, ніколи не блок.

import { canFinish } from './camp-day';
import { NORMAL, grade, widen, type Difficulty, type Outcome } from './minigame';

export interface Dish { readonly id: 'soup' | 'fish' | 'tea'; readonly band: { readonly from: number; readonly to: number }; readonly ms: number }
/** Страви вечері за порядком. Смуги різні навмисно: одним рівнем жару всі три не зробиш. */
export const DISHES: readonly Dish[] = [
  { id: 'soup', band: { from: 0.45, to: 0.75 }, ms: 20000 },
  { id: 'fish', band: { from: 0.6, to: 0.85 }, ms: 18000 },
  { id: 'tea', band: { from: 0.3, to: 0.6 }, ms: 14000 },
];

/** Падіння жару за секунду і що дає кожна дія. */
export const COOL_PER_S = 0.09;
export const WOOD_GAIN = 0.34;
/** Підкинуті дрова спершу ПРИБИРАЮТЬ жар (дим): стільки мс і на стільки. */
export const SMOKE_MS = 1200;
export const SMOKE_DROP = 0.12;
export const BLOW_GAIN = 0.14;
export const RAKE_PULL = 0.5;
export const RAKE_TO = 0.5;
/** Вогкі дрова (рутина «дрова» не зроблена або сяк-так): жару з них менше, диму більше. */
export const WET_WOOD = 0.55;

export type EmberAct = 'wood' | 'blow' | 'rake';
export interface EmberState {
  /** Жар 0..1 і скільки мс триває дим від останніх дров. */
  readonly heat: number;
  readonly smokeMs: number;
  /** Яку страву готуємо, скільки мс вона вже на вогні і скільки з них жар був у смузі. */
  readonly dish: number;
  readonly dishMs: number;
  readonly goodMs: number;
  /** Готовність кожної страви 0..1 (частка часу в смузі). */
  readonly quality: readonly number[];
  readonly done: boolean;
  /** Чи дрова сухі (наслідок рутини «дрова»). */
  readonly dry: boolean;
  /** GAME-321: скільки дій зробив гравець і скільки мс вогонь стоїть без жодної (без дій страви не готуються). */
  readonly acts: number;
  readonly idle: number;
}
/** GAME-321: вогонь без жодної дії догорає сам лише за стільки мс — і це завжди «сяк-так». */
export const IDLE_MS = 80000;
export type EmberEvent = 'none' | 'wood' | 'blow' | 'rake' | 'dishDone' | 'done';
export type EmberInput = { readonly kind: 'tick'; readonly dtMs: number } | { readonly kind: 'act'; readonly act: EmberAct };

export const startEmbers = (dry = true): EmberState => ({ heat: 0.35, smokeMs: 0, dish: 0, dishMs: 0, goodMs: 0, quality: [], done: false, dry, acts: 0, idle: 0 });

/** GAME-327: дрова щойно підкинуто — жар ще не росте (дим); гравець бачить це словом, а не нулем, що «не рухається». */
export const smoking = (s: EmberState): boolean => s.smokeMs > 0;
export const dishOf = (s: EmberState): Dish | null => DISHES[s.dish] ?? null;
/** GAME-338 · чому вогонь «сяк-так»: 'idle' — дій майже не було (страви не готувались), 'heat' — жар здебільшого поза смугою страви. null — «добре». */
export type FireWhy = 'idle' | 'heat';
export const FIRE_WHY_KEY: Readonly<Record<FireWhy, string>> = { idle: 'camp.reason.fire.idle', heat: 'camp.reason.fire.heat' };
export const fireWhy = (s: EmberState): FireWhy | null => (emberOutcome(s) === 'good' ? null : canFinish('fire', s.acts, 0) ? 'heat' : 'idle');
export function inBand(s: EmberState, d: Difficulty = NORMAL): boolean {
  const dish = dishOf(s);
  if (!dish) return false;
  const b = widen(dish.band, d);
  return s.heat >= b.from && s.heat <= b.to;
}

export function stepEmbers(s0: EmberState, i: EmberInput, d: Difficulty = NORMAL): { state: EmberState; event: EmberEvent } {
  if (s0.done) return { state: s0, event: 'none' };
  const s = i.kind === 'act' ? { ...s0, acts: s0.acts + 1 } : s0;
  if (i.kind === 'act') {
    const gain = s.dry ? 1 : WET_WOOD;
    // GAME-346: дрова, підкинуті, поки попередні ще димлять, нічого не збивають і дим не подовжують — нетерплячий тап не гасить вогонь у нуль.
    if (i.act === 'wood' && s.smokeMs > 0) return { state: s, event: 'wood' };
    if (i.act === 'wood') return { state: { ...s, heat: Math.min(1, Math.max(0, s.heat - SMOKE_DROP)), smokeMs: SMOKE_MS * (s.dry ? 1 : 2), }, event: 'wood' };
    if (i.act === 'blow') return { state: { ...s, heat: Math.min(1, s.heat + BLOW_GAIN * gain) }, event: 'blow' };
    return { state: { ...s, heat: s.heat + (RAKE_TO - s.heat) * RAKE_PULL }, event: 'rake' };
  }
  if (!(i.dtMs > 0)) return { state: s, event: 'none' };
  const dt = i.dtMs / 1000;
  if (s.acts === 0) {
    const idle = s.idle + i.dtMs;
    return { state: { ...s, idle, heat: Math.max(0, s.heat - COOL_PER_S * dt), done: idle >= IDLE_MS }, event: idle >= IDLE_MS ? 'done' : 'none' };
  }
  // Дим догорів — дрова віддають жар.
  const smokeMs = Math.max(0, s.smokeMs - i.dtMs);
  const burst = s.smokeMs > 0 && smokeMs === 0 ? WOOD_GAIN * (s.dry ? 1 : WET_WOOD) : 0;
  const heat = Math.min(1, Math.max(0, s.heat - COOL_PER_S * dt + burst));
  const moved: EmberState = { ...s, heat, smokeMs };
  const good = inBand(moved, d) ? i.dtMs : 0;
  const dish0 = dishOf(s);
  if (!dish0) return { state: { ...moved, done: true }, event: 'done' };
  const dishMs = s.dishMs + i.dtMs;
  const goodMs = s.goodMs + good;
  if (dishMs < dish0.ms * d.timeScale) return { state: { ...moved, dishMs, goodMs }, event: 'none' };
  const quality = [...s.quality, Math.min(1, goodMs / dish0.ms)];
  const dish = s.dish + 1;
  const next: EmberState = { ...moved, dish, dishMs: 0, goodMs: 0, quality };
  return dish >= DISHES.length ? { state: { ...next, done: true }, event: 'done' } : { state: next, event: 'dishDone' };
}

/** Оцінка вечері: середня готовність страв. Нічого не приготовано — 0, і це теж не блок. */
export const emberScore = (s: EmberState): number => (s.quality.length === 0 ? 0 : s.quality.reduce((a, b) => a + b, 0) / DISHES.length);
export const emberOutcome = (s: EmberState): Outcome => (canFinish('fire', s.acts, 0) ? grade(emberScore(s)) : 'scrappy');
