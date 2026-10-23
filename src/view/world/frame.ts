// Розмір кадру гри під форму поля (GAME-84 №13). Чиста функція — щоб її перевіряв юніт-тест, а не око.
export interface Frame { readonly width: number; readonly height: number }

/** Висота мапи в пікселях (camp-lake.tmj: 12 × 16): вище за неї камера лише центрувала б мапу серед порожнечі. */
export const MAP_HEIGHT = 192;

/**
 * Широке поле — як і було, 240×160. Вузьке (телефон сторч, GAME-91): мапу вмикаємо на всю висоту поля, а що не влізло
 * по ширині — везе камера за персонажем. Масштаб k — ЦІЛИЙ (чіткі пікселі): k = висота поля / висота мапи, округлено;
 * кадр = поле / k, але не вище за мапу (вище камера лише центрувала б мапу серед порожнечі).
 * Поле без розміру (ще не розкладене) — широкий кадр за замовчуванням.
 */
export function frameSize(w: number, h: number): Frame {
  const aspect = w > 0 && h > 0 ? w / h : 1.5;
  if (aspect >= 1.2) return { width: 240, height: 160 };
  const k = Math.max(1, Math.round(h / MAP_HEIGHT));
  return { width: Math.max(1, Math.floor(w / k)), height: Math.min(MAP_HEIGHT, Math.max(1, Math.floor(h / k))) };
}
