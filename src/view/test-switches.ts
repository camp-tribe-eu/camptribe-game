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
  /** ?holdToast=1 — GAME-98: тост-підказка не зникає за таймером (лише від дії гравця), щоб e2e міряв її контраст і на
   *  повільному CI, де від старту до готовності сторінки минає більше за 5 с. */
  readonly holdToast?: boolean;
  /** ?daylight=off — GAME-99: вимкнути ефект «день і ніч» (A/B для вимірів fps і негативний контроль e2e). */
  readonly noDaylight?: boolean;
  /** ?atMinute=N (0…1439) — GAME-99: гра стартує о N-й хвилині доби (годинник 1 хв/с, до полудня за 12 хв не дочекаєшся); лише для e2e-знімків і перевірки ефекту. */
  readonly atMinute?: number;
  /** ?hideUi=wave — негативний контроль GAME-170: без картки мети e2e хвилі мусить почервоніти. */
  readonly hideUi: readonly string[];
  /** GAME-175: у збірці e2e панель ☰ за замовчуванням показує всі дії (старі e2e проходять кнопками); ?mapFirst=1 вмикає справжню поведінку — мапа першою (game-175.spec). Панель ☰ показує ВСІ дії, як до мапи-першої гри (кнопки «Піти:», «Узяти:», «Виконати»). Для e2e, що перевіряє не прохід дня 1, а
   *  свою річ і лише швидко доходить до потрібного стану; сам прохід дня 1 (game-175.spec) іде без цього перемикача — лише рухом і дією на мапі. */
  readonly panelActs?: boolean;
  /** ?map=camp|home|shop — GAME-175: показати мапу незалежно від локації гравця (e2e механіки руху на мапі табору без персонажа). */
  readonly map?: 'camp' | 'home' | 'shop';
  /** ?breakSpot=task.firewood — негативний контроль GAME-170: названий об'єкт мапи стає німим (дотик нічого не шле) — прохід мусить почервоніти. */
  readonly breakSpot: readonly string[];
}

export function testSwitches(search: string, mode: string): TestSwitches {
  if (mode !== 'e2e') return { hideTouch: [], hideAct: [], hideUi: [], breakSpot: [] };
  const q = new URLSearchParams(search);
  const list = (k: string): string[] => (q.get(k) ?? '').split(',').filter(Boolean);
  const seed = Number(q.get('seed'));
  const lag = Number(q.get('frameLagMs'));
  const boot = Number(q.get('bootDelayMs'));
  const at = Number(q.get('atMinute'));
  return { ...(Number.isInteger(boot) && boot >= 1 && boot <= 5000 ? { bootDelayMs: boot } : {}), ...(Number.isInteger(lag) && lag >= 1 && lag <= 190 ? { frameLagMs: lag } : {}), hideTouch: list('hideTouch'), hideAct: list('hideAct'), hideUi: list('hideUi'), breakSpot: list('breakSpot'), ...(q.get('noAutosave') === '1' ? { noAutosave: true } : {}), ...(q.get('holdToast') === '1' ? { holdToast: true } : {}), ...((q.get('atMinute') ?? '') !== '' && Number.isInteger(at) && at >= 0 && at <= 1439 ? { atMinute: at } : {}), ...(q.get('daylight') === 'off' ? { noDaylight: true } : {}), ...(q.get('mapFirst') !== '1' ? { panelActs: true } : {}), ...(['camp', 'home', 'shop'].includes(q.get('map') ?? '') ? { map: q.get('map') as 'camp' | 'home' | 'shop' } : {}), ...(q.get('freshSeed') === '1' ? { freshSeed: true } : {}), ...(q.has('seed') && Number.isSafeInteger(seed) && seed >= 0 ? { seed } : {}) };
}
