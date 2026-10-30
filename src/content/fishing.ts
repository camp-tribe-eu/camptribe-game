// GAME-193 · риболовля на озері табору (OD-022): чиста детермінована логіка. Жодного годинника, Phaser чи Math.random: час дає лише tick, випадковість — лише переданий
// генератор (makeRng з зерном). Шлях: утримання → шкала сили → відпустив: закид → очікування (1,5–4 с) → «клює» (вікно 600 мс) → шкала підсікання (≈3 с) → улов → вибір «відпустити / взяти».
// Жодного покарання: промах чи втеча — просто назад у спокій. Фази `choice` досяжна лише з заповненою шкалою підсікання, а та — лише коли гравець тримає дію (див. fishing.test).

export const CHARGE_MS = 1400;
export const WAIT_MIN_MS = 1500;
export const WAIT_MAX_MS = 4000;
export const BITE_MS = 600;
/** Жорстка межа шкали підсікання: рибка втекла, гравець вільний (без softlock). */
export const REEL_MAX_MS = 8000;
/** Висота зеленої зони (частка шкали) і швидкості її руху (частка/с): тримаєш — росте, відпустив — спадає. */
export const ZONE = 0.28;
export const ZONE_UP = 0.7;
export const ZONE_DOWN = 0.6;
/** Рибка блукає лише над мінімальним положенням зони: без вводу зона лежить унизу й рибки не торкається (доводить тест). */
export const FISH_LO = 0.3;
export const FISH_HI = 0.94;
export const FILL_MS = 2500;
export const DRAIN_MS = 7000;
export const START_PROGRESS = 0.3;

export interface Species { readonly id: 'perch' | 'carp' | 'trout' | 'pike'; readonly speed: number }
/** Від дрібної до більшої: далекий закид підсуває вибір до кінця списку. */
export const SPECIES: readonly Species[] = [{ id: 'perch', speed: 0.8 }, { id: 'carp', speed: 0.9 }, { id: 'trout', speed: 1 }, { id: 'pike', speed: 1.1 }];

export type FishPhase = 'idle' | 'charge' | 'wait' | 'bite' | 'reel' | 'choice';
export interface FishState {
  readonly phase: FishPhase;
  /** Дія була натиснута в попередньому кадрі (для фронту натискання). */
  readonly down: boolean;
  readonly power: number;
  readonly t: number;
  readonly waitMs: number;
  readonly species: number;
  /** Центр зеленої зони 0..1 і прогрес підсікання 0..1. */
  readonly zone: number;
  readonly progress: number;
  readonly reelT: number;
  readonly ph1: number;
  readonly ph2: number;
  readonly casts: number;
  readonly slipped: number;
  readonly aways: number;
  readonly kept: number;
  readonly released: number;
}
export type FishEvent = 'none' | 'charge' | 'cast' | 'bite' | 'hook' | 'slipped' | 'caught' | 'away' | 'kept' | 'released';
export type FishInput = { readonly kind: 'tick'; readonly dtMs: number; readonly down: boolean } | { readonly kind: 'choose'; readonly keep: boolean };

export const FISH_IDLE: FishState = { phase: 'idle', down: false, power: 0, t: 0, waitMs: 0, species: 0, zone: ZONE / 2, progress: 0, reelT: 0, ph1: 0, ph2: 0, casts: 0, slipped: 0, aways: 0, kept: 0, released: 0 };
export const catches = (s: FishState): number => s.kept + s.released;
export const busy = (s: FishState): boolean => s.phase !== 'idle';

/** mulberry32: той самий зерно → та сама послідовність. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Де рибка на шкалі (0..1) у мить `reelT` мс: плавне блукання, швидкість — від виду. */
export function fishAt(s: FishState): number {
  const sp = (SPECIES[s.species] ?? SPECIES[0] as Species).speed; const t = s.reelT / 1000;
  return 0.62 + 0.18 * Math.sin(1.7 * sp * t + s.ph1) + 0.14 * Math.sin(2.6 * sp * t + s.ph2);
}
export const inZone = (s: FishState): boolean => Math.abs(fishAt(s) - s.zone) <= ZONE / 2;
/** Дальність поплавка від берега: 0..1 → мінімум..максимум (px світу). */
export const castDistance = (power: number): number => 8 + 122 * Math.min(1, Math.max(0, power));

export function stepFish(s: FishState, i: FishInput, rng: () => number): { state: FishState; event: FishEvent } {
  if (i.kind === 'choose') {
    if (s.phase !== 'choice') return { state: s, event: 'none' };
    // down: true — вибір зробила та сама дія; поки її не відпустили, нового закиду (фронт натискання) не буде
    return { state: { ...s, phase: 'idle', down: true, kept: s.kept + (i.keep ? 1 : 0), released: s.released + (i.keep ? 0 : 1) }, event: i.keep ? 'kept' : 'released' };
  }
  if (!(i.dtMs >= 0)) return { state: s, event: 'none' };
  const edge = i.down && !s.down;
  const n: FishState = { ...s, down: i.down };
  switch (s.phase) {
    case 'idle': return edge ? { state: { ...n, phase: 'charge', power: 0 }, event: 'charge' } : { state: n, event: 'none' };
    case 'charge':
      if (i.down) return { state: { ...n, power: Math.min(1, s.power + i.dtMs / CHARGE_MS) }, event: 'none' };
      return { state: { ...n, phase: 'wait', t: 0, waitMs: WAIT_MIN_MS + Math.floor(rng() * (WAIT_MAX_MS - WAIT_MIN_MS)), casts: s.casts + 1 }, event: 'cast' };
    case 'wait': {
      const t = s.t + i.dtMs;
      return t >= s.waitMs ? { state: { ...n, phase: 'bite', t: 0 }, event: 'bite' } : { state: { ...n, t }, event: 'none' };
    }
    case 'bite': {
      if (edge) {
        const species = Math.min(SPECIES.length - 1, Math.floor((rng() * 0.7 + s.power * 0.3) * SPECIES.length));
        return { state: { ...n, phase: 'reel', species, zone: ZONE / 2, progress: START_PROGRESS, reelT: 0, ph1: rng() * Math.PI * 2, ph2: rng() * Math.PI * 2 }, event: 'hook' };
      }
      const t = s.t + i.dtMs;
      return t >= BITE_MS ? { state: { ...n, phase: 'idle', t: 0, slipped: s.slipped + 1 }, event: 'slipped' } : { state: { ...n, t }, event: 'none' };
    }
    case 'reel': {
      const dt = i.dtMs / 1000;
      const zone = Math.min(1 - ZONE / 2, Math.max(ZONE / 2, s.zone + (i.down ? ZONE_UP : -ZONE_DOWN) * dt));
      const moved: FishState = { ...n, zone, reelT: s.reelT + i.dtMs };
      const progress = Math.min(1, Math.max(0, s.progress + (inZone(moved) ? i.dtMs / FILL_MS : -i.dtMs / DRAIN_MS)));
      if (progress >= 1) return { state: { ...moved, phase: 'choice', progress: 1 }, event: 'caught' };
      if (progress <= 0 || moved.reelT >= REEL_MAX_MS) return { state: { ...moved, phase: 'idle', progress: 0, aways: s.aways + 1 }, event: 'away' };
      return { state: { ...moved, progress }, event: 'none' };
    }
    default: return { state: n, event: 'none' };
  }
}
