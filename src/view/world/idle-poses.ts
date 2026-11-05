// GAME-248 · власні рухи простою: кожна людина має 1–2 «звички» зі стану спокою замість дихання на 1 px (воно читалось як посмикування).
// ЛИШЕ відображення, чиста функція: час — накопичені мс кадрів стояння, жодних твінів, таймерів і Date. Кадри — з листів LPC, що вже в грі:
// ходьба (col 0 — стоїть, 1–8 — крок) і thrust (лише Вікторія й Метью). Різні люди не збігаються: цикл свій + зсув за seed.
import type { Dir } from './character';

export type PoseSheet = 'walk' | 'thrust';
/** Один крок звички: тримати кадр `col` листа `sheet` у напрямку `dir` (null — як стоїть) `ms` мс. */
export interface PoseStep { readonly ms: number; readonly sheet: PoseSheet; readonly col: number; readonly dir: Dir | null }
export interface Habit { readonly name: string; readonly steps: readonly PoseStep[] }
export interface Pose { readonly name: string; readonly sheet: PoseSheet; readonly col: number; readonly dir: Dir | null }

const w = (ms: number, col: number, dir: Dir | null = null): PoseStep => ({ ms, sheet: 'walk', col, dir });
const t = (ms: number, col: number, dir: Dir | null = null): PoseStep => ({ ms, sheet: 'thrust', col, dir });

/** Спільні заготовки з ходьби: озирається (повільно крутить голову), тупцює ногою, дивиться вгору/вниз. */
const lookAround = (a: Dir, b: Dir, c: Dir): Habit => ({ name: 'look-around', steps: [w(900, 0, a), w(900, 0, b), w(800, 0, c), w(700, 0, 'down')] });
const footTap = (name = 'foot-tap'): Habit => ({ name, steps: [w(450, 1, 'down'), w(450, 0, 'down'), w(450, 5, 'down'), w(450, 0, 'down'), w(450, 1, 'down'), w(450, 0, 'down')] });
const stretch: Habit = { name: 'stretch', steps: [w(900, 0, 'up'), w(1100, 0, 'up'), w(700, 0, 'down')] };
const lookDown = (name: string): Habit => ({ name, steps: [w(2200, 0, 'down'), w(700, 0, 'left'), w(900, 0, 'down')] });
const readPage = (side: Dir): Habit => ({ name: 'read', steps: [w(1600, 0, side), w(500, 0, 'down'), w(1500, 0, side)] });

/** Звички по людях (ключ — `look`/ім'я листа). Родина — особисті: Вікторія «підфарбовується» руками (thrust), Метью тупцює й дивиться вниз, George сканує мапу. */
export const HABITS: Readonly<Record<string, readonly Habit[]>> = {
  victoria: [{ name: 'mirror-makeup', steps: [w(700, 0, 'down'), t(450, 1, 'down'), t(450, 2, 'down'), t(450, 1, 'down'), t(450, 2, 'down'), t(450, 1, 'down'), w(500, 0, 'down')] }, lookAround('left', 'right', 'up')],
  matthew: [footTap('foot-tap'), lookDown('phone')],
  george: [{ name: 'check-map', steps: [w(1200, 0, 'down'), w(1400, 0, 'left'), w(1200, 0, 'down'), w(900, 0, 'up')] }, { name: 'scratch-head', steps: [w(600, 0, 'down'), t(400, 1, 'down'), t(400, 2, 'down'), t(400, 1, 'down'), w(600, 0, 'down')] }],
  elise: [readPage('left'), lookAround('right', 'down', 'left')],
  anna: [stretch, lookAround('left', 'up', 'right')],
  nora: [stretch, footTap('shift-weight')],
  luc: [lookAround('right', 'up', 'left'), readPage('right')],
  ingrid: [readPage('left'), stretch],
  sarah: [footTap('foot-tap'), lookAround('up', 'right', 'left')],
  claire: [lookDown('look-down'), stretch],
  amina: [lookAround('up', 'left', 'right'), lookDown('prayer-beads')],
  shopper: [lookDown('phone'), lookAround('left', 'up', 'right')],
  lotte: [lookDown('count-change'), lookAround('left', 'right', 'down')],
};

const FALLBACK: readonly Habit[] = [lookAround('left', 'right', 'down'), stretch];
export const habitsOf = (who: string): readonly Habit[] => HABITS[who] ?? FALLBACK;

/** Тихо стоїмо між звичками (без пози), мс; залежить від seed, щоб різні люди не починали разом. */
export const restMs = (seed: number): number => 900 + (Math.abs(seed) % 4) * 300;
const total = (h: Habit): number => h.steps.reduce((a, s) => a + s.ms, 0);
/** Довжина повного кола: відпочинок + звичка 1 + відпочинок + звичка 2…, мс. */
export const cycleMs = (who: string, seed = 0): number => habitsOf(who).reduce((a, h) => a + restMs(seed) + total(h), 0);

/**
 * Поза через `standMs` мс стояння: null — просто стоїть (кадр 0 за напрямком, що вже є). Детермінована; фаза зсунута на seed·1370 мс.
 * Назва пози 'rest' ніколи не повертається — відпочинок і є null.
 */
export function idlePose(who: string, standMs: number, seed = 0): Pose | null {
  if (standMs < 0) return null;
  const hs = habitsOf(who);
  const len = cycleMs(who, seed);
  let at = (standMs + Math.abs(seed) * 1370) % len;
  for (const h of hs) {
    const r = restMs(seed);
    if (at < r) return null;
    at -= r;
    const d = total(h);
    if (at < d) {
      for (const s of h.steps) {
        if (at < s.ms) return { name: h.name, sheet: s.sheet, col: s.col, dir: s.dir };
        at -= s.ms;
      }
    }
    at -= d;
  }
  return null;
}

/** Є хоч один кадр у позі, що не ходьба-на-місці й не «стоїть» (для проби й сторожа): будь-яка поза з назвою. */
export const isIdlePose = (p: Pose | null): boolean => p !== null;
