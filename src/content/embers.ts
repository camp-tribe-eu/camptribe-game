// GAME-311 · рутина «вогонь»: міні-гра «жар у смузі». Чиста логіка, час — лише tick.
//
// Жар сам по собі падає. Три дії, і кожна має ціну: підкинути дрова (багато жару, але спершу дим і провал),
// роздмухати (швидко й коротко), розгребти (жар нижче, зате рівний). Страви йдуть одна за одною, у кожної
// своя смуга: те, що добре юшці, спалить рибу. Перегрів — підгоріло, недогрів — сире; і те, і те лише
// гірша вечеря, ніколи не блок.

import { grade, timeScale, widen, type HelpState, type Outcome } from './minigame';

export interface Dish { readonly id: 'soup' | 'fish' | 'tea'; readonly band: { readonly from: number; readonly to: number }; readonly ms: number }
/** Страви вечері за порядком. Смуги різні навмисно: одним рівнем жару всі три не зробиш. */
export const DISHES: readonly Dish[] = [
  { id: 'soup', band: { from: 0.45, to: 0.75 }, ms: 9000 },
  { id: 'fish', band: { from: 0.6, to: 0.85 }, ms: 8000 },
  { id: 'tea', band: { from: 0.3, to: 0.6 }, ms: 6000 },
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
}
export type EmberEvent = 'none' | 'wood' | 'blow' | 'rake' | 'dishDone' | 'done';
export type EmberInput = { readonly kind: 'tick'; readonly dtMs: number } | { readonly kind: 'act'; readonly act: EmberAct };

export const startEmbers = (dry = true): EmberState => ({ heat: 0.35, smokeMs: 0, dish: 0, dishMs: 0, goodMs: 0, quality: [], done: false, dry });

export const dishOf = (s: EmberState): Dish | null => DISHES[s.dish] ?? null;
export function inBand(s: EmberState, help: HelpState = { scrappyRun: 0, help: false }): boolean {
  const d = dishOf(s);
  if (!d) return false;
  const b = widen(d.band, help);
  return s.heat >= b.from && s.heat <= b.to;
}

export function stepEmbers(s: EmberState, i: EmberInput, help: HelpState = { scrappyRun: 0, help: false }): { state: EmberState; event: EmberEvent } {
  if (s.done) return { state: s, event: 'none' };
  if (i.kind === 'act') {
    const gain = s.dry ? 1 : WET_WOOD;
    if (i.act === 'wood') return { state: { ...s, heat: Math.min(1, Math.max(0, s.heat - SMOKE_DROP)), smokeMs: SMOKE_MS * (s.dry ? 1 : 2), }, event: 'wood' };
    if (i.act === 'blow') return { state: { ...s, heat: Math.min(1, s.heat + BLOW_GAIN * gain) }, event: 'blow' };
    return { state: { ...s, heat: s.heat + (RAKE_TO - s.heat) * RAKE_PULL }, event: 'rake' };
  }
  if (!(i.dtMs > 0)) return { state: s, event: 'none' };
  const dt = i.dtMs / 1000;
  // Дим догорів — дрова віддають жар.
  const smokeMs = Math.max(0, s.smokeMs - i.dtMs);
  const burst = s.smokeMs > 0 && smokeMs === 0 ? WOOD_GAIN * (s.dry ? 1 : WET_WOOD) : 0;
  const heat = Math.min(1, Math.max(0, s.heat - COOL_PER_S * dt + burst));
  const moved: EmberState = { ...s, heat, smokeMs };
  const good = inBand(moved, help) ? i.dtMs : 0;
  const d = dishOf(s);
  if (!d) return { state: { ...moved, done: true }, event: 'done' };
  const dishMs = s.dishMs + i.dtMs;
  const goodMs = s.goodMs + good;
  if (dishMs < d.ms * timeScale(help)) return { state: { ...moved, dishMs, goodMs }, event: 'none' };
  const quality = [...s.quality, Math.min(1, goodMs / d.ms)];
  const dish = s.dish + 1;
  const next: EmberState = { ...moved, dish, dishMs: 0, goodMs: 0, quality };
  return dish >= DISHES.length ? { state: { ...next, done: true }, event: 'done' } : { state: next, event: 'dishDone' };
}

/** Оцінка вечері: середня готовність страв. Нічого не приготовано — 0, і це теж не блок. */
export const emberScore = (s: EmberState): number => (s.quality.length === 0 ? 0 : s.quality.reduce((a, b) => a + b, 0) / DISHES.length);
export const emberOutcome = (s: EmberState): Outcome => grade(emberScore(s));
