// Налаштування гравця: платформний шар (браузерне сховище). Ядро про них не знає.
// Сховище може бути недоступне (приватне вікно, заборона) — тоді працюємо на типових.

export interface Settings {
  /** Масштаб тексту інтерфейсу, %. */
  readonly textScale: 100 | 125 | 150;
  readonly language: 'uk' | 'en';
}

export const DEFAULT_SETTINGS: Settings = { textScale: 100, language: 'uk' };
const KEY = 'camplife.settings.v1';
const SCALES = [100, 125, 150] as const;

export function loadSettings(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): Settings {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const v = JSON.parse(raw) as Partial<Settings>;
    return {
      textScale: SCALES.includes(v.textScale as never) ? (v.textScale as Settings['textScale']) : DEFAULT_SETTINGS.textScale,
      language: v.language === 'en' ? 'en' : 'uk',
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
