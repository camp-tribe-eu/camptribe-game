// Ігровий годинник (SIMULATION_RULES SIM-TIME-001…008). Фіксований крок: реальний час кадру
// накопичується, симуляція просувається цілими кроками. Пауза (меню, діалог) зупиняє час.

/** 1 реальна секунда вільної сцени = 1 ігрова хвилина (SIM-TIME-002, тимчасово). */
export const STEP_MS = 1000;

export interface GameClock {
  /** Ігрові хвилини від початку проходження. */
  readonly minutes: number;
  /** Накопичений реальний час, менший за крок. */
  readonly accMs: number;
  readonly paused: boolean;
}

/**
 * GAME-262: один кадр дає годиннику не більше стільки реального часу. Згорнута вкладка, поворот телефону, зміна розміру чи
 * збій рендера зупиняють кадри на секунди, а перший кадр після цього приносить сиру дельту (GAME-238: Phaser без згладжування).
 * Без межі така дельта перемотала б день. Межу ставить міст сцена→ядро (bridge.frame) через `clampFrame`: сам `tick` лишається чистим, бо тести й відтворення годують його довгими кадрами.
 */
export const MAX_FRAME_MS = 250;
export const clampFrame = (realMs: number): number => Math.min(realMs, MAX_FRAME_MS);

export const newClock = (): GameClock => ({ minutes: 0, accMs: 0, paused: false });

/** Кадр: додає реальний час; повертає годинник і кількість зроблених ігрових кроків. */
export function tick(clock: GameClock, realMs: number): { clock: GameClock; steps: number } {
  if (clock.paused || !(realMs > 0)) return { clock, steps: 0 };
  const total = clock.accMs + realMs;
  const steps = Math.floor(total / STEP_MS);
  return { clock: { ...clock, minutes: clock.minutes + steps, accMs: total - steps * STEP_MS }, steps };
}

/** Довга дія (сон, дорога, ремонт): перемотує час одним кроком (SIM-TIME-004). */
export function advance(clock: GameClock, minutes: number): GameClock {
  if (!Number.isSafeInteger(minutes) || minutes < 0) throw new RangeError(`advance: ${minutes}`);
  return { ...clock, minutes: clock.minutes + minutes };
}

export const pause = (c: GameClock): GameClock => ({ ...c, paused: true });
export const resume = (c: GameClock): GameClock => ({ ...c, paused: false });

// ── Ритм дня (GAME-242): доба, «пора спати», сон, години крамниці. Усе — чисті функції від ігрових хвилин (без Date і таймерів). ──
/** Хвилин у добі. */
const DAY_MINUTES = 1440;
/** Час доби на старті гри (08:00). Ядро стартує з `minutes = 0`: зсув — лише для читання «котра година». */
export const GAME_START_MINUTE = 8 * 60;
/** Хвилина доби 0…1439 з ігрових хвилин. */
export const minuteOfDay = (minutes: number): number => (minutes + GAME_START_MINUTE) % DAY_MINUTES;

/** Вечір (з нього можна лягти спати біля ліжка чи намету). */
export const EVENING = 18 * 60;
/** «Пора спати» — м'яка підказка від Вікторії. */
export const BEDTIME = 22 * 60;
/** Герой засинає сам (хвилина доби 00:30). */
export const AUTO_SLEEP = 30;
/** Ранок після свідомого сну / після того, як герой заснув сам (трохи пізніше). */
export const WAKE = 7 * 60;
export const WAKE_LATE = 7 * 60 + 30;
/** Години крамниці 08:00–20:00. */
export const SHOP_OPEN = 8 * 60;
export const SHOP_CLOSE = 20 * 60;

/** Ніч: від «пора спати» до ранку. */
export const isNight = (minutes: number): boolean => { const t = minuteOfDay(minutes); return t >= BEDTIME || t < WAKE; };
/** Вечір або ніч: коли ліжко й намет приймають. */
export const isEveningOrNight = (minutes: number): boolean => { const t = minuteOfDay(minutes); return t >= EVENING || t < WAKE; };
/** Крамниця відчинена. */
export const shopOpen = (minutes: number): boolean => { const t = minuteOfDay(minutes); return t >= SHOP_OPEN && t < SHOP_CLOSE; };

/** Наступна після `minutes` ігрова хвилина, коли на годиннику `tod` (хвилина доби). Завжди строго пізніше. */
export const nextAt = (minutes: number, tod: number): number => minutes + ((tod - minuteOfDay(minutes) + DAY_MINUTES - 1) % DAY_MINUTES) + 1;

/** Хвилина доби 00:30 → ігрові хвилини: m ≡ 30 − 480 (mod 1440). Скільки разів годинник перетнув 00:30 між `prev` (виключно) і `now` (включно). */
const nightEdge = (m: number): number => Math.floor((m - ((AUTO_SLEEP - GAME_START_MINUTE + DAY_MINUTES) % DAY_MINUTES)) / DAY_MINUTES);
export const autoSleepDue = (prev: number, now: number): boolean => nightEdge(now) > nightEdge(prev);

/** Номер ночі (доба, у якій настало 22:00), поки триває вікно підказки [22:00, 00:30); інакше null. */
export const bedtimeNight = (minutes: number): number | null => {
  const t = minuteOfDay(minutes);
  if (t >= BEDTIME) return Math.floor((minutes + GAME_START_MINUTE) / DAY_MINUTES);
  return t < AUTO_SLEEP ? Math.floor((minutes + GAME_START_MINUTE) / DAY_MINUTES) - 1 : null;
};
