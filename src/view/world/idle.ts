// GAME-212 · «живий» спокій: дихання, коли персонаж стоїть, пікселі-емоції над головою, погляд на сплеск. ЛИШЕ відображення:
// зсув малюється на спрайті (позиція в пробі й у фізиці лишається справжньою), час — з кадрів, без твінів і таймерів.
import type { Dir } from './character';
import { facingToward } from '../npc-talk';

/** Скільки стоїмо до того, як вмикається дихання, мс. */
export const IDLE_AFTER_MS = 2000;
/** Період дихання, мс: пів періоду — на 1 px нижче. */
export const IDLE_PERIOD_MS = 1600;

export const idleOn = (standMs: number): boolean => standMs > IDLE_AFTER_MS;

/** Зсув спрайта по y (px): 0 до IDLE_AFTER_MS, далі 0/1 по колу; `seed` розводить фази різних людей. */
export function idleBob(standMs: number, seed = 0): number {
  if (!idleOn(standMs)) return 0;
  return ((standMs - IDLE_AFTER_MS + seed * 400) % IDLE_PERIOD_MS) < IDLE_PERIOD_MS / 2 ? 0 : 1;
}

/** Скільки секунд погляд лишається на сплеску і з якої відстані його помічають, px. */
export const LOOK_S = 1.6;
export const LOOK_RANGE = 220;
/** Куди повернутись на сплеск: у бік плеску, якщо він у межах слуху, інакше null. */
export function lookAt(from: { x: number; y: number }, splash: { x: number; y: number }, range = LOOK_RANGE): Dir | null {
  return Math.hypot(splash.x - from.x, splash.y - from.y) <= range ? facingToward(from, splash) : null;
}

/** Вечір — коли мешканці мугикають (ігрові хвилини доби). */
export const isEvening = (minuteOfDay: number): boolean => minuteOfDay >= 18 * 60 && minuteOfDay < 22 * 60;

export type Glyph = 'note' | 'ask';
/** Піксельні гліфи 5×7 (# — піксель); малюються по 1 px, у палітрі бульби NPC. */
export const GLYPHS: Record<Glyph, readonly string[]> = {
  note: ['..###', '..#.#', '..#..', '..#..', '###..', '###..', '.#...'],
  ask: ['.###.', '#...#', '....#', '..##.', '..#..', '.....', '..#..'],
};
