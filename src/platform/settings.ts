import { DEFAULT_AUDIO, parseAudio, type AudioSettings } from '../audio/mixer';

// Налаштування гравця: платформний шар (браузерне сховище). Ядро про них не знає.
// Сховище може бути недоступне (приватне вікно, заборона) — тоді працюємо на типових.

export interface Settings {
  /** Масштаб тексту інтерфейсу, %. */
  readonly textScale: 100 | 125 | 150 | 200;
  readonly language: 'uk' | 'en';
  /** Гравець уже діяв (відкрив ☰ чи паузу): підказку першого запуску (GAME-83) більше не показуємо. Не частина сейву. */
  readonly hintSeen: boolean;
  /** Подорож, про яку вже нагадали скопіювати код відновлення (GAME-94); null — ще ні. Не частина сейву: формат сейву не змінюється. */
  readonly remindedTrip: string | null;
  /** GAME-261: нагадування про код відновлення вже показано колись — більше ніколи (хоч би скільки подорожей). Не частина сейву. */
  readonly remindShown: boolean;
  /** Гучність (GAME-40): загальна, ефекти, музика, mute. Не частина сейву. */
  readonly audio: AudioSettings;
  /** GAME-192: стрілка «Далі» — лише коли застряг (типово) чи завжди. Не частина сейву. */
  readonly hintMode: 'stuck' | 'always';
  /** GAME-229: екран «Що відкрилось» (нові ранги) перед підсумком дня; вимкнено — навички ростуть так само, але екрана немає. Не частина сейву. */
  readonly levelUps: boolean;
  /** GAME-278 (OD-030): масштаб картинки світу — 0 «Авто» (правило frameSize) або явний ЦІЛИЙ множник (чіткі пікселі). Не частина сейву. */
  readonly zoom: number;
}

export const DEFAULT_SETTINGS: Settings = { textScale: 100, language: 'uk', hintSeen: false, remindedTrip: null, remindShown: false, audio: DEFAULT_AUDIO, hintMode: 'stuck', levelUps: true, zoom: 0 };
/** Найбільший явний масштаб, який можна зберегти (далі — сміття у сховищі → Авто). */
export const MAX_ZOOM = 8;
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
      remindedTrip: typeof v.remindedTrip === 'string' && v.remindedTrip !== '' ? v.remindedTrip : null,
      remindShown: v.remindShown === true,
      audio: parseAudio(v.audio),
      hintMode: v.hintMode === 'always' ? 'always' : 'stuck',
      levelUps: v.levelUps !== false,
      zoom: typeof v.zoom === 'number' && Number.isInteger(v.zoom) && v.zoom >= 1 && v.zoom <= MAX_ZOOM ? v.zoom : 0,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

const listeners = new Set<(s: Settings) => void>();
/** GAME-278: підписка на збереження налаштувань (main.ts перераховує кадр світу одразу). Повертає відписку. */
export function onSettingsSaved(fn: (s: Settings) => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }

/** GAME-279: поточні налаштування в пам'яті — сховище best-effort (приватний режим: setItem кидає), масштаб діє й без нього. */
let live: Settings | undefined;
/** Поточні налаштування без читання сховища на кожен виклик (ResizeObserver): раз зі сховища, далі — з пам'яті, її оновлює saveSettings. */
export function currentSettings(storage?: Pick<Storage, 'getItem'>): Settings { return (live ??= loadSettings(storage)); }
/** Лише для тестів: забути пам'ять. */
export function resetSettingsMemory(): void { live = undefined; }

export function saveSettings(s: Settings, storage: Pick<Storage, 'setItem'> | undefined = safeStorage()): boolean {
  live = s;
  let ok: boolean;
  try {
    storage?.setItem(KEY, JSON.stringify(s));
    ok = storage !== undefined;
  } catch {
    ok = false;
  }
  // Слухачі чують і тоді, коли сховище відмовило: гравець бачить зміну одразу, збереження — найкраще, що можна.
  for (const fn of listeners) fn(s);
  return ok;
}

function safeStorage(): Storage | undefined {
  try { return globalThis.localStorage; } catch { return undefined; }
}
