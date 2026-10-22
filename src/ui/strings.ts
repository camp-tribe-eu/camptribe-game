// Рядки оболонки UI. Тимчасовий файл локалізації до GAME-26 (там — ключі, псевдолокаль, шрифт).
export const STRINGS = {
  uk: { paused: 'Пауза', resume: 'Продовжити', settings: 'Налаштування', textSize: 'Розмір тексту', language: 'Мова', pause: 'Пауза' },
  en: { paused: 'Paused', resume: 'Resume', settings: 'Settings', textSize: 'Text size', language: 'Language', pause: 'Pause' },
} as const;
export type Lang = keyof typeof STRINGS;
