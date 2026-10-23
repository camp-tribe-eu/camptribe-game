// GAME-93 · персонаж LPC із шарів (як research/art-spike/compose_chars.py): лист ходьби 9 кадрів × 4 напрямки по 64 px.
// Складання — на старті в браузері з шарів assets/characters/ (похідних PNG немає), тож майбутній редактор персонажа
// (GAME-76) міняє лише список шарів і кольорів.

export const FRAME = 64;
export const COLS = 9;
export type Dir = 'up' | 'left' | 'down' | 'right';
/** Рядки листа LPC: вгору, ліворуч, вниз, праворуч. */
export const DIR_ROW: Readonly<Record<Dir, number>> = { up: 0, left: 1, down: 2, right: 3 };
export interface LayerSpec { readonly url: string; readonly tint?: readonly [number, number, number] }

/** Номер кадру в листі: рядок напрямку × 9 + стовпець (0 — стоїть, 1–8 — крок). Той самий номер, що в probe.playerFrame. */
export const frameIndex = (dir: Dir, col: number): number => DIR_ROW[dir] * COLS + col;

/**
 * Забарвлення шару як PIL ImageOps.colorize(сіре, чорне→(0,0,0), біле→rgb, середнє(127)→0,75·rgb) у пробі: тінь шару
 * зберігається, колір — задається. Альфа не змінюється. Змінює масив на місці.
 */
export function tintPixels(data: Uint8ClampedArray, rgb: readonly [number, number, number]): void {
  const mid = rgb.map((c) => Math.trunc(c * 0.75));
  for (let i = 0; i < data.length; i += 4) {
    const g = ((data[i] ?? 0) * 299 + (data[i + 1] ?? 0) * 587 + (data[i + 2] ?? 0) * 114) / 1000;
    for (let k = 0; k < 3; k++) {
      const m = mid[k] ?? 0;
      const hi = rgb[k] ?? 0;
      data[i + k] = g < 127 ? (m * g) / 127 : m + ((hi - m) * (g - 127)) / (255 - 127);
    }
  }
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image failed to load: ${url.slice(0, 80)}`));
    img.src = url;
  });
}

/** Лист ходьби з шарів (знизу вгору), кожен за потреби забарвлений. */
export async function composeSheet(layers: readonly LayerSpec[]): Promise<HTMLCanvasElement> {
  const out = document.createElement('canvas');
  out.width = FRAME * COLS;
  out.height = FRAME * 4;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('2d canvas is unavailable');
  for (const layer of layers) {
    const img = await loadImage(layer.url);
    if (img.width !== out.width || img.height !== out.height) throw new Error(`LPC layer is ${img.width}×${img.height}, expected ${out.width}×${out.height}`);
    if (!layer.tint) { ctx.drawImage(img, 0, 0); continue; }
    const tmp = document.createElement('canvas');
    tmp.width = out.width;
    tmp.height = out.height;
    const t = tmp.getContext('2d', { willReadFrequently: true });
    if (!t) throw new Error('2d canvas is unavailable');
    t.drawImage(img, 0, 0);
    const px = t.getImageData(0, 0, tmp.width, tmp.height);
    tintPixels(px.data, layer.tint);
    t.putImageData(px, 0, 0);
    ctx.drawImage(tmp, 0, 0);
  }
  return out;
}
