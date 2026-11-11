// GAME-311 · рутина «ягоди»: доповнити стіл. Стиглі, недостиглі й ГІРКИЙ ДВІЙНИК — схожий кущ, чия ягода
// нікого не отруїть, але вечерю зіпсує. Чиста логіка; кущі розкладає хеш (зерно, номер), не Math.random.
//
// Правило двійника гравець може ВИВЧИТИ (у цьому й перевага гри): у двійника ягода матова (без полиску)
// і листок гладенький. Це справжня ознака, а не випадковість: її видно на картинці й у тексті.
// Кошик скінченний, тож брати все підряд не вийде: зірвав двійника — місце в кошику витрачено.

import { grade, type HelpState, type Outcome } from './minigame';

export type BerryKind = 'ripe' | 'unripe' | 'bitter';
export interface Berry {
  readonly kind: BerryKind;
  /** Ознаки, видні гравцеві: полиск ягоди й край листка. */
  readonly shiny: boolean;
  readonly leaf: 'toothed' | 'smooth';
}
export const BUSHES = 12;
export const BASKET = 8;

/** Детермінований хеш (зерно, номер) → 0..1. */
function h01(seed: number, i: number): number {
  let z = (Math.imul(seed ^ 0x27d4eb2f, 0x85ebca6b) ^ Math.imul(i + 1, 0xc2b2ae35)) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0x165667b1) >>> 0;
  return ((z ^ (z >>> 16)) >>> 0) / 4294967296;
}

/** Скільки яких кущів на галявині: склад однаковий завжди, зерно лише тасує порядок — тож двійник є ЗАВЖДИ. */
export const MIX: readonly BerryKind[] = [...Array.from({ length: 6 }, (): BerryKind => 'ripe'), ...Array.from({ length: 3 }, (): BerryKind => 'unripe'), ...Array.from({ length: 3 }, (): BerryKind => 'bitter')];

/** Галявина: той самий склад, детерміноване тасування (Фішер — Єйтс на хеші), ознаки завжди чесні. */
export function patchOf(seed: number): readonly Berry[] {
  const kinds = [...MIX];
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(h01(seed, i) * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j] as BerryKind, kinds[i] as BerryKind];
  }
  // Двійник: матова ягода й гладенький листок. Недостигла: полиску ще немає, але листок зубчастий, як у стиглої.
  return kinds.map((kind) => ({ kind, shiny: kind === 'ripe', leaf: kind === 'bitter' ? 'smooth' : 'toothed' } as Berry));
}
/** Чи ягоду можна відрізнити лише за ознаками (правило, яке гра вчить): матова + гладенький листок = двійник. */
export const looksBitter = (b: Berry): boolean => !b.shiny && b.leaf === 'smooth';

export interface BerryState {
  readonly seed: number;
  readonly picked: readonly number[];
  readonly basket: readonly BerryKind[];
  readonly done: boolean;
}
export type BerryEvent = 'none' | 'ripe' | 'unripe' | 'bitter' | 'full';
export const startBerries = (seed = 1): BerryState => ({ seed, picked: [], basket: [], done: false });

export function pickBerry(s: BerryState, i: number): { state: BerryState; event: BerryEvent } {
  if (s.done || i < 0 || i >= BUSHES || s.picked.includes(i)) return { state: s, event: 'none' };
  const b = patchOf(s.seed)[i] as Berry;
  const basket = [...s.basket, b.kind];
  const done = basket.length >= BASKET;
  return { state: { ...s, picked: [...s.picked, i], basket, done }, event: done ? 'full' : b.kind };
}
/** Гравець каже «досить» — рутина закінчена тим, що вже в кошику (м'який вихід, ніколи не блок). */
export const enoughBerries = (s: BerryState): BerryState => ({ ...s, done: true });

/** З допомогою (два «сяк-так» поспіль) сумнівні кущі підсвічено: це підказка, а не автозбір. */
export const hinted = (s: BerryState, help: HelpState): readonly number[] =>
  help.help ? patchOf(s.seed).map((b, i) => (looksBitter(b) ? i : -1)).filter((i) => i >= 0 && !s.picked.includes(i)) : [];

export const ripeCount = (s: BerryState): number => s.basket.filter((k) => k === 'ripe').length;
export const bitterCount = (s: BerryState): number => s.basket.filter((k) => k === 'bitter').length;
/** Оцінка: стиглі з повного кошика, мінус по пів місця за кожного двійника (гірка ягода псує миску). */
export const berryScore = (s: BerryState): number => Math.max(0, Math.min(1, (ripeCount(s) - bitterCount(s) * 0.5) / BASKET));
export const berryOutcome = (s: BerryState): Outcome => grade(berryScore(s));
