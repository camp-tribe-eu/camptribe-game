// GAME-350 · стан ранку «згортаємо табір» у сейві. Поле `game.strike` необов'язкове (відсутність ≡ «ранок ще не грали»; міграції не треба,
// старі сейви вантажаться як були). Пише лише команда SaveStrike. Тут лише ФОРМА і межі; що означає результат — src/content/camp-strike.ts.
export const STRIKE_JOBS = ['tent', 'litter', 'fire', 'car'] as const;
export type StrikeJob = (typeof STRIKE_JOBS)[number];
const OUTCOMES = ['good', 'fine', 'scrappy'] as const;

export interface StrikeSave {
  /** Результат кожної справи, яку вже закрито (зроблено чи лишено як є). Немає ключа — справа ще чекає. */
  readonly results: Readonly<Partial<Record<StrikeJob, string>>>;
  /** Ранок закрито: усі справи розв'язано і гравець рушив далі. */
  readonly closed: boolean;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Чому запис не годиться; null — годиться. */
export function strikeError(s: unknown): string | null {
  if (!isObj(s)) return 'not an object';
  if (typeof s.closed !== 'boolean') return 'closed';
  const r = s.results;
  if (!isObj(r) || Object.entries(r).some(([k, v]) => !(STRIKE_JOBS as readonly string[]).includes(k) || typeof v !== 'string' || !(OUTCOMES as readonly string[]).includes(v))) return 'results';
  if (s.closed && STRIKE_JOBS.some((j) => r[j] === undefined)) return 'closed-incomplete';
  return JSON.stringify(s).length > 512 ? 'size' : null;
}
