// GAME-314 · стан дошки рутин табору в сейві. Без нього дошка жила б у пам'яті сторінки й губилась при кожній розмові з сусідом.
// Поле `game.campBoard` необов'язкове (відсутність ≡ «дошку ще не відкривали»; міграції не треба). Пише лише команда SaveCampBoard.
// Тут лише ФОРМА і перевірка меж: що означають числа, знає дошка (src/content/camp-day.ts), ядро не залежить від контенту.
export const BOARD_ROUNDS = ['morning', 'noon', 'afternoon', 'evening'] as const;
export const BOARD_ROUTINES = ['water', 'firewood', 'fire', 'lanterns', 'fish', 'berries', 'tidy'] as const;
export const BOARD_DEVICES = ['rain-barrel', 'solar-station', 'woodpile', 'food-box', 'fish-trap'] as const;
const OUTCOMES = ['good', 'fine', 'scrappy'] as const;
/** Стеля розміру запису в сейві: дошка — це кілька десятків байтів, а не місце для чужих даних. */
export const BOARD_MAX_BYTES = 2048;

export interface CampBoardSave {
  readonly round: (typeof BOARD_ROUNDS)[number];
  readonly picks: readonly { readonly id: string; readonly round: string; readonly full: boolean }[];
  readonly results: Readonly<Record<string, string>>;
  readonly facts: { readonly water: number; readonly dryLogs: number; readonly lit: number; readonly fish: number; readonly bitter: number; readonly foodOut: boolean };
  readonly devices: Readonly<Record<string, { readonly care: number }>>;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;
const inList = (list: readonly string[], v: unknown): boolean => typeof v === 'string' && list.includes(v);

/** Чому запис не годиться; null — годиться. */
export function boardError(b: unknown): string | null {
  if (!isObj(b)) return 'not an object';
  if (!inList(BOARD_ROUNDS, b.round)) return 'round';
  if (!Array.isArray(b.picks) || b.picks.length > BOARD_ROUTINES.length) return 'picks';
  if (b.picks.some((p) => !isObj(p) || !inList(BOARD_ROUTINES, p.id) || !inList(BOARD_ROUNDS, p.round) || typeof p.full !== 'boolean')) return 'pick';
  if (!isObj(b.results) || Object.entries(b.results).some(([k, v]) => !inList(BOARD_ROUTINES, k) || !inList(OUTCOMES, v))) return 'results';
  const f = b.facts;
  if (!isObj(f) || !isNum(f.water, 1) || !isNum(f.dryLogs, 64) || !isNum(f.lit, 16) || !isNum(f.fish, 64) || !isNum(f.bitter, 64) || typeof f.foodOut !== 'boolean') return 'facts';
  if (!isObj(b.devices) || Object.entries(b.devices).some(([k, v]) => !inList(BOARD_DEVICES, k) || !isObj(v) || !isNum(v.care, 1))) return 'devices';
  return JSON.stringify(b).length > BOARD_MAX_BYTES ? 'size' : null;
}
