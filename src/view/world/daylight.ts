// GAME-99 · ефект 1: день і ніч. Лише відображення: читає ігрову хвилину доби (clock.minutes % 1440), нічого не пише в ядро й сейв.
// Ціна: один напівпрозорий прямокутник на екран (blend MULTIPLY) і одна світла пляма біля вогнища (ADD) — без нових файлів графіки,
// пляма малюється з канви при старті. Удень (darkness = 0) обидва об'єкти приховані — кадр ідентичний до ефекту.
// Гармонія (закон «новий ефект доводиться до палітри основного набору»): КЛЮЧОВІ кольори — з art/palette/lpc.json (daylight.test.ts
// це доводить); проміжні — пряма інтерполяція між ключами.
export const DAY_MINUTES = 1440;

/** Ключові кольори (є в палітрі LPC). Множення: білий — без змін; темно-синій — ніч; теплий жовтогарячий — сутінки/світанок. */
export const NIGHT_TINT = 0x474ea5;
export const DUSK_TINT = 0xf5ad47;
export const FIRE_GLOW = 0xff8a00;
export const FIRE_CORE = 0xfbce7b;
export const PALETTE_COLORS = [NIGHT_TINT, DUSK_TINT, FIRE_GLOW, FIRE_CORE] as const;

/** Найтемніша ніч лишає 20 % світла: гра має лишатися читабельною (контраст HUD — DOM, його ефект не торкається). */
export const MAX_DARKNESS = 0.8;

/** Опорні точки доби: хвилина → { тип кольору, сила }. Між ними — лінійно. */
interface Key { readonly at: number; readonly tint: number; readonly strength: number }
const KEYS: readonly Key[] = [
  { at: 0, tint: NIGHT_TINT, strength: MAX_DARKNESS },        // 00:00 глибока ніч (старт гри — о 00:00, тож перший кадр нічний)
  { at: 5 * 60, tint: NIGHT_TINT, strength: MAX_DARKNESS },    // 05:00
  { at: 6 * 60 + 30, tint: DUSK_TINT, strength: 0.45 },        // 06:30 світанок
  { at: 8 * 60, tint: DUSK_TINT, strength: 0 },                // 08:00 день
  { at: 18 * 60, tint: DUSK_TINT, strength: 0 },               // 18:00 день триває
  { at: 19 * 60 + 30, tint: DUSK_TINT, strength: 0.5 },        // 19:30 сутінки
  { at: 21 * 60 + 30, tint: NIGHT_TINT, strength: MAX_DARKNESS }, // 21:30 ніч
  { at: DAY_MINUTES, tint: NIGHT_TINT, strength: MAX_DARKNESS },
];

export interface Ambient {
  /** Колір множення (RGB 0xRRGGBB), уже змішаний з білим за силою. 0xffffff — без змін. */
  readonly color: number;
  /** 0 (повний день) … MAX_DARKNESS (глибока ніч). */
  readonly darkness: number;
}

const ch = (c: number, shift: number): number => (c >> shift) & 0xff;
const mix = (a: number, b: number, t: number, shift: number): number => Math.round(ch(a, shift) + (ch(b, shift) - ch(a, shift)) * t);
const lerpColor = (a: number, b: number, t: number): number => (mix(a, b, t, 16) << 16) | (mix(a, b, t, 8) << 8) | mix(a, b, t, 0);

/** Освітлення в хвилину доби (будь-яке ціле чи дробове число; береться за модулем доби). */
export function ambientAt(minuteOfDay: number): Ambient {
  const m = ((minuteOfDay % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  let i = KEYS.findIndex((k) => k.at > m) - 1;
  if (i < 0) i = KEYS.length - 2;
  const a = KEYS[i] as Key;
  const b = KEYS[i + 1] as Key;
  const t = (m - a.at) / (b.at - a.at);
  const strength = a.strength + (b.strength - a.strength) * t;
  // Колір ключа береться з того боку, де сила більша: між світанком і днем — теплий, між сутінками й ніччю — синій.
  const tint = lerpColor(a.tint, b.tint, t);
  return { color: lerpColor(0xffffff, tint, strength), darkness: strength };
}

/** Яскравість світлої плями вогнища: гасне вдень (0), повна вночі; дрібне мерехтіння — від часу сцени (мс кадру, не годинник). */
export function glowAlpha(darkness: number, timeMs: number): number {
  if (darkness <= 0) return 0;
  const flicker = 1 + 0.06 * Math.sin(timeMs / 83) + 0.04 * Math.sin(timeMs / 37);
  return Math.min(1, (darkness / MAX_DARKNESS) * 0.85 * flicker);
}
