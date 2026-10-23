// Розмір кадру гри під форму поля (GAME-84 №13). Чиста функція — щоб її перевіряв юніт-тест, а не око.
export interface Frame { readonly width: number; readonly height: number }

/** Висота мапи в пікселях (camp-lake.tmj: 12 × 16): вище за неї камера лише центрувала б мапу серед порожнечі. */
export const MAP_HEIGHT = 192;

/**
 * Широке поле — як і було, 240×160. Вузьке (телефон сторч) — кадр 160 завширшки й до висоти мапи: інакше FIT
 * лишав смужку 3:2 посеред чорного екрана. Поле без розміру (ще не розкладене) — широкий кадр за замовчуванням.
 */
export function frameSize(w: number, h: number): Frame {
  const aspect = w > 0 && h > 0 ? w / h : 1.5;
  return aspect >= 1.2 ? { width: 240, height: 160 } : { width: 160, height: Math.min(MAP_HEIGHT, Math.max(160, Math.round(160 / aspect))) };
}
