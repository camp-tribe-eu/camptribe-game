// Перемикачі лише для негативних контролів e2e (?hideTouch=, ?hideAct=). У звичайній збірці — вимкнені:
// посилання «?hideAct=complete», яким хтось поділився, не мусить робити гру непрохідною (рецензія GAME-36).
// e2e збирає гру з `vite build --mode e2e` (playwright.config.ts).
export interface TestSwitches {
  readonly hideTouch: readonly string[];
  readonly hideAct: readonly string[];
  /** Зерно RNG гри (?seed=N): події в дорозі e2e перебирає зернами, а не перезавантаженнями — з тим самим
   *  зерном і майже без прожитих кадрів кидок щоразу той самий (знайдено CI, GAME-31). */
  readonly seed?: number;
  /** ?freshSeed=1 — GAME-89 №2: гра без ?seed у збірці e2e бере СТАЛИЙ сід (інакше погода й події в дорозі робили б
   *  решту e2e випадковою); цей перемикач вмикає свіжий сід, як у звичайній збірці, — щоб e2e перевіряв саме його. */
  readonly freshSeed?: boolean;
  /** ?noAutosave=1 — негативний контроль GAME-86: без автозбереження після дії e2e перезавантаження мусить губити прогрес. */
  readonly noAutosave?: boolean;
  /** ?frameLagMs=N (1…190) — GAME-97: кожен кадр сцени довший на N мс, як на слабкому телефоні. e2e так перевіряє, що
   *  годинник гри при низькому fps іде в ногу з реальним часом, на будь-якій машині CI однаково. */
  readonly frameLagMs?: number;
  /** ?bootDelayMs=N (1…5000) — GAME-38: старт гри довший на N мс; негативний контроль проби першого кадру (бюджет 1,5 с). */
  readonly bootDelayMs?: number;
}

export function testSwitches(search: string, mode: string): TestSwitches {
  if (mode !== 'e2e') return { hideTouch: [], hideAct: [] };
  const q = new URLSearchParams(search);
  const list = (k: string): string[] => (q.get(k) ?? '').split(',').filter(Boolean);
  const seed = Number(q.get('seed'));
  const lag = Number(q.get('frameLagMs'));
  const boot = Number(q.get('bootDelayMs'));
  return { ...(Number.isInteger(boot) && boot >= 1 && boot <= 5000 ? { bootDelayMs: boot } : {}), ...(Number.isInteger(lag) && lag >= 1 && lag <= 190 ? { frameLagMs: lag } : {}), hideTouch: list('hideTouch'), hideAct: list('hideAct'), ...(q.get('noAutosave') === '1' ? { noAutosave: true } : {}), ...(q.get('freshSeed') === '1' ? { freshSeed: true } : {}), ...(q.has('seed') && Number.isSafeInteger(seed) && seed >= 0 ? { seed } : {}) };
}
