// GAME-206 · «враження складається з дрібниць»: спільний модуль покадрових ефектів світу. ЛИШЕ математика — чисті функції часу сцени,
// зерна й стану кадру, без Phaser, без генератора випадкових чисел, без таймерів і tween (сторож no-realtime): той самий час → та сама картинка, пауза
// зупиняє все, prefers-reduced-motion вирішує сцена (ці функції нічого про нього не знають). Малює шар fx-live-layer.ts і fishing.ts.
// Кольори — з палітри LPC (art/palette/lpc.json, доводить fx-live.test.ts): новий ефект доводиться до палітри набору або не додається.

export type Pt = { readonly x: number; readonly y: number };

/** Пікселі ефектів: вода й піна, дим, пил, іскри й жар, трава. Кожен колір є в палітрі LPC. */
export const FX_PALETTE = {
  water: 0x83c6ff, foam: 0xe9f1f1, smoke: 0x818b8b, dust: 0xc4b188, dustLight: 0xe7c8a9,
  spark: 0xe3c654, ember: 0xff8a00, sparkCore: 0xfbce7b, grass: 0x499231, grassDark: 0x386a30,
} as const;
export const FX_COLORS: readonly number[] = Object.values(FX_PALETTE);

/** Межі частинок на кадр (телефон): іскри, пил, дим, краплі сплеску, кільця, стебла. Понад — не малюється. */
export const CAP = { sparks: 6, dust: 8, exhaust: 4, drops: 8, ripples: 3, blades: 6 } as const;

import { hash01 } from '../../core/hash01';
export { hash01 };

const frac = (v: number): number => v - Math.floor(v);
export const clamp01 = (k: number): number => (k <= 0 ? 0 : k >= 1 ? 1 : k);

/**
 * Дуга закиду поплавка: від руки `from` до точки `to` за часткою польоту k (0..1), з підйомом `height` посередині.
 * k = 0 — точно `from`, k = 1 — точно `to` (поплавок сідає туди, куди закинули, а не поруч і не стрибком).
 */
export function castArc(from: Pt, to: Pt, k: number, height = 34): Pt {
  const c = clamp01(k);
  if (c === 0) return { x: from.x, y: from.y };
  if (c === 1) return { x: to.x, y: to.y };   // точно в точку: sin(π) у рухомій комі — не нуль
  return { x: from.x + (to.x - from.x) * c, y: from.y + (to.y - from.y) * c - Math.sin(c * Math.PI) * height };
}

/** n + 1 точок дуги від k = 0 до k = 1 (для перевірок неперервності). */
export const castArcSamples = (from: Pt, to: Pt, height: number, n: number): Pt[] => Array.from({ length: n + 1 }, (_, i) => castArc(from, to, i / n, height));

/** Хвилі гойдають поплавок: зсув по y (px) і нахил (рад) — дві повільні хвилі різної довжини, без різких рухів. */
export function floatBob(timeMs: number): { dy: number; tilt: number } {
  return { dy: Math.sin(timeMs / 420) * 1.5 + Math.sin(timeMs / 730) * 0.6, tilt: Math.sin(timeMs / 560) * 0.12 };
}

/** Кільця на воді від поплавка: `count` кілець, що розходяться по черзі (період `periodMs`) до радіуса `maxR` і гаснуть. */
export function ripples(timeMs: number, maxR = 12, periodMs = 1100, count: number = CAP.ripples): { r: number; alpha: number }[] {
  const out: { r: number; alpha: number }[] = [];
  for (let i = 0; i < Math.min(count, CAP.ripples); i++) {
    const k = frac(timeMs / periodMs + i / count);
    out.push({ r: 2 + (maxR - 2) * k, alpha: 0.55 * (1 - k) });
  }
  return out;
}

/** Краплі сплеску в мить k (0..1) після удару поплавка об воду: кожна летить по своїй параболі (кут і сила — від зерна) і гасне. */
export function splashDrops(k: number, seed: number, n: number = CAP.drops): { dx: number; dy: number; alpha: number }[] {
  const c = clamp01(k);
  const out: { dx: number; dy: number; alpha: number }[] = [];
  for (let i = 0; i < Math.min(n, CAP.drops); i++) {
    const a = (i / n) * Math.PI * 2 + hash01(i, seed) * 0.8;
    const v = 8 + hash01(i + 100, seed) * 8;
    out.push({ dx: Math.cos(a) * v * c, dy: Math.sin(a) * v * 0.45 * c - (10 + hash01(i + 200, seed) * 8) * c + 22 * c * c, alpha: 1 - c });
  }
  return out;
}

/**
 * Дим із вихлопу: `n` клубків, кожен живе `periodMs` і народжується знову (фаза — від номера й зерна), пливе назад (`back` = ±1) і вгору,
 * росте й тане. Чиста функція часу: без списку частинок і без стану.
 */
export function exhaustPuffs(timeMs: number, seed: number, back = -1, n: number = CAP.exhaust, periodMs = 1500): { dx: number; dy: number; r: number; alpha: number }[] {
  const out: { dx: number; dy: number; r: number; alpha: number }[] = [];
  for (let i = 0; i < Math.min(n, CAP.exhaust); i++) {
    const k = frac(timeMs / periodMs + hash01(i, seed));
    out.push({ dx: back * (3 + 11 * k) + Math.sin(timeMs / 300 + i) * 1.2 * k, dy: -(1 + 7 * k), r: 1 + 2.5 * k, alpha: 0.5 * (1 - k) });
  }
  return out;
}

/** Мікропогойдування авто з увімкненим двигуном: зсув по y (px) і кут (рад) — дрібне, під піксель. */
export function carSway(timeMs: number): { dy: number; angle: number } {
  return { dy: Math.sin(timeMs / 95) * 0.45, angle: Math.sin(timeMs / 140) * 0.004 };
}

/**
 * Іскри вогнища: `n` іскор, кожна злітає `periodMs`, хитаючись, і гасне; гаряча (жовта серцевина) у першій третині життя, далі — жар.
 * Фаза — від номера й зерна, тож іскри не злітають одночасно.
 */
export function fireSparks(timeMs: number, seed: number, n: number = CAP.sparks, periodMs = 1100): { dx: number; dy: number; alpha: number; hot: boolean }[] {
  const out: { dx: number; dy: number; alpha: number; hot: boolean }[] = [];
  for (let i = 0; i < Math.min(n, CAP.sparks); i++) {
    const k = frac(timeMs / periodMs + hash01(i, seed));
    const side = (hash01(i + 50, seed) - 0.5) * 10;
    out.push({ dx: side + Math.sin(timeMs / 160 + i * 1.7) * 2 * k, dy: -(2 + 24 * k), alpha: 1 - k, hot: k < 0.35 });
  }
  return out;
}

/** Нахил (−1..1) наближається до цілі: за `rateMs` — приблизно 63 % шляху. Довгий кадр не стрибає далі за ціль. */
export function stepLean(lean: number, target: number, dtMs: number, rateMs = 120): number {
  const a = 1 - Math.exp(-Math.max(0, dtMs) / rateMs);
  return lean + (target - lean) * a;
}

/** Куди гнеться трава під ногами: герой іде — стебла лягають від напрямку руху (по x), стоїть — ціль 0 (стебла випростуються, вітер хитає сам). */
export const leanTarget = (heading: Pt, moving: boolean): number => (moving && heading.x !== 0 ? Math.sign(heading.x) : 0);

/** Стебла трави коло ніг героя: позиція відносно ніг (стала, від зерна), нахил верхівки (px по x) = спільний нахил + вітер. */
export function grassBlades(timeMs: number, lean: number, seed: number, n: number = CAP.blades): { dx: number; dy: number; h: number; tip: number }[] {
  const out: { dx: number; dy: number; h: number; tip: number }[] = [];
  for (let i = 0; i < Math.min(n, CAP.blades); i++) {
    const dx = (hash01(i, seed) - 0.5) * 22;
    const dy = (hash01(i + 30, seed) - 0.5) * 6;
    const h = 3 + Math.round(hash01(i + 60, seed) * 2);
    out.push({ dx, dy, h, tip: lean * 3 + Math.sin(timeMs / 900 + i) * 0.8 });
  }
  return out;
}

/** Рід землі під ногами за глобальним номером тайла шару `ground`: трава чи земля (стежка, пісок) з набору terrain; інше (підлога дому) — нічого. */
export type Ground = 'grass' | 'earth' | 'none';
/** Локальні номери трави в terrain_atlas (3 варіанти підряд; 180 перед ними — земля стежки, 184 — темний край). Звірено за кольором тайлів (fx-live.test). */
export const GRASS_LOCAL = { from: 181, to: 183 } as const;
export function groundKind(gid: number, terrainFirst: number, terrainCount: number): Ground {
  const local = gid - terrainFirst;
  if (gid <= 0 || local < 0 || local >= terrainCount) return 'none';
  return local >= GRASS_LOCAL.from && local <= GRASS_LOCAL.to ? 'grass' : 'earth';
}

/** Пил з-під ніг: клубок народжується на кожні DUST_STEP_PX пройденого по землі шляху, живе DUST_LIFE_MS; не більше CAP.dust (старий зникає). */
export const DUST_STEP_PX = 22;
export const DUST_LIFE_MS = 460;
export interface Puff { readonly x: number; readonly y: number; readonly age: number; readonly seed: number }
export interface DustState { readonly puffs: readonly Puff[]; readonly walked: number; readonly spawned: number }
export const DUST_IDLE: DustState = { puffs: [], walked: 0, spawned: 0 };

export function stepDust(s: DustState, f: { x: number; y: number; movedPx: number; ground: Ground; dtMs: number }): DustState {
  const dt = Math.max(0, f.dtMs);
  let puffs = s.puffs.map((p) => ({ ...p, age: p.age + dt })).filter((p) => p.age < DUST_LIFE_MS);
  let walked = f.ground === 'earth' && f.movedPx > 0 ? s.walked + f.movedPx : 0;
  let spawned = s.spawned;
  if (walked >= DUST_STEP_PX) {
    walked -= DUST_STEP_PX;
    spawned++;
    puffs = [...puffs, { x: f.x + (hash01(spawned, 206) - 0.5) * 8, y: f.y + 1, age: 0, seed: spawned }].slice(-CAP.dust);
  }
  return { puffs, walked, spawned };
}

/** Як малювати клубок пилу віку `age`: радіус росте, сам клубок трохи підіймається й тане. */
export function dustLook(p: Puff): { dy: number; r: number; alpha: number } {
  const k = clamp01(p.age / DUST_LIFE_MS);
  return { dy: -3 * k, r: 1 + 2 * k, alpha: 0.5 * (1 - k) };
}
