// Перемикачі лише для негативних контролів e2e (?hideTouch=, ?hideAct=). У звичайній збірці — вимкнені:
// посилання «?hideAct=complete», яким хтось поділився, не мусить робити гру непрохідною (рецензія GAME-36).
// e2e збирає гру з `vite build --mode e2e` (playwright.config.ts).
export interface TestSwitches {
  readonly hideTouch: readonly string[];
  readonly hideAct: readonly string[];
  /** Зерно RNG гри (?seed=N): події в дорозі e2e перебирає зернами, а не перезавантаженнями — з тим самим
   *  зерном і майже без прожитих кадрів кидок щоразу той самий (знайдено CI, GAME-31). */
  readonly seed?: number;
  /** ?noAutosave=1 — негативний контроль GAME-86: без автозбереження після дії e2e перезавантаження мусить губити прогрес. */
  readonly noAutosave?: boolean;
}

export function testSwitches(search: string, mode: string): TestSwitches {
  if (mode !== 'e2e') return { hideTouch: [], hideAct: [] };
  const q = new URLSearchParams(search);
  const list = (k: string): string[] => (q.get(k) ?? '').split(',').filter(Boolean);
  const seed = Number(q.get('seed'));
  return { hideTouch: list('hideTouch'), hideAct: list('hideAct'), ...(q.get('noAutosave') === '1' ? { noAutosave: true } : {}), ...(q.has('seed') && Number.isSafeInteger(seed) && seed >= 0 ? { seed } : {}) };
}
