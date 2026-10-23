// Розмір кадру гри під форму поля (GAME-84 №13). Чиста функція — щоб її перевіряв юніт-тест, а не око.
export interface Frame { readonly width: number; readonly height: number }

/** Висота мапи в пікселях (camp-lake.tmj: 12 × 32, тайли LPC — GAME-93): вище за неї камера лише центрувала б мапу серед порожнечі. */
export const MAP_HEIGHT = 384;

/**
 * Широке поле — 640×352: 20×11 тайлів по 32 px, тобто вся мапа по ширині й 11 з 12 рядків (як проба scene-B-lpc.png); на 1280 px масштаб рівно 2×. Було 240×160 при тайлі 16 px (GAME-93). Вузьке (телефон сторч, GAME-91): мапу вмикаємо на всю висоту поля, а що не влізло
 * по ширині — везе камера за персонажем. Масштаб k — ЦІЛИЙ (чіткі пікселі): k = висота поля / висота мапи, округлено;
 * кадр = поле / k, але не вище за мапу (вище камера лише центрувала б мапу серед порожнечі).
 * Поле без розміру (ще не розкладене) — широкий кадр за замовчуванням.
 */
export function frameSize(w: number, h: number): Frame {
  const aspect = w > 0 && h > 0 ? w / h : 1.5;
  if (aspect >= 1.2) return { width: 640, height: 352 };
  const k = Math.max(1, Math.round(h / MAP_HEIGHT));
  return { width: Math.max(1, Math.floor(w / k)), height: Math.min(MAP_HEIGHT, Math.max(1, Math.floor(h / k))) };
}
