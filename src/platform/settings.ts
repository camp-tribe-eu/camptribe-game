// Налаштування гравця: платформний шар (браузерне сховище). Ядро про них не знає.
// Сховище може бути недоступне (приватне вікно, заборона) — тоді працюємо на типових.

export interface Settings {
  /** Масштаб тексту інтерфейсу, %. */
  readonly textScale: 100 | 125 | 150 | 200;
  readonly language: 'uk' | 'en';
  /** Гравець уже діяв (відкрив ☰ чи паузу): підказку першого запуску (GAME-83) більше не показуємо. Не частина сейву. */
  readonly hintSeen: boolean;
}

export const DEFAULT_SETTINGS: Settings = { textScale: 100, language: 'uk', hintSeen: false };
const KEY = 'camplife.settings.v1';
// 200 % — WCAG 1.4.4 (GAME-39): текст удвічі без обрізання й без втрати функцій.
export const TEXT_SCALES = [100, 125, 150, 200] as const;
const SCALES = TEXT_SCALES;

export function loadSettings(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): Settings {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const v = JSON.parse(raw) as Partial<Settings>;
    return {
      textScale: SCALES.includes(v.textScale as never) ? (v.textScale as Settings['textScale']) : DEFAULT_SETTINGS.textScale,
      language: v.language === 'en' ? 'en' : 'uk',
      hintSeen: v.hintSeen === true,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings, storage: Pick<Storage, 'setItem'> | undefined = safeStorage()): boolean {
  try {
    storage?.setItem(KEY, JSON.stringify(s));
    return storage !== undefined;
  } catch {
    return false;
  }
}

function safeStorage(): Storage | undefined {
  try { return globalThis.localStorage; } catch { return undefined; }
}
