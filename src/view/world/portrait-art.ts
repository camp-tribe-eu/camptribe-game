// GAME-179 · запасний портрет: обрізок голови й плечей зі спрайта ходьби (кадр «вниз, стоїть»), збільшений ×4 без згладжування.
// Лист — той самий canvas, що малює сцена (art.ts), тож зовнішність у розмові й на мапі збігається до пікселя.
import { COLS, FRAME, frameIndex } from './character';
import type { WorldArt } from './art';
import type { SheetId } from '../portraits';

/** Вікно обрізка в кадрі 64×64 (LPC: тім'я ≈ y 13, плечі й груди ≈ до y 46): квадрат 40×40, голова по центру. */
export const CROP = { x: 12, y: 8, w: 40, h: 40 } as const;
export const SCALE = 4;

/** Лист за ідентифікатором; немає — null (портрета не буде, UI покаже нейтральну іконку). */
export function sheetOf(art: WorldArt, id: SheetId): HTMLCanvasElement | null {
  if (id.startsWith('res:')) return art.residents[id.slice(4)] ?? null;
  return art.sheets[id as keyof WorldArt['sheets']] ?? null;
}

/** Обрізок голови листа ходьби як data-URL (кадр dir=down, колонка 0). Кеш — на боці виклику. */
export function headCrop(sheet: HTMLCanvasElement): string {
  const f = frameIndex('down', 0);
  const fx = (f % COLS) * FRAME;
  const fy = Math.floor(f / COLS) * FRAME;
  const out = document.createElement('canvas');
  out.width = CROP.w * SCALE;
  out.height = CROP.h * SCALE;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('2d canvas is unavailable');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sheet, fx + CROP.x, fy + CROP.y, CROP.w, CROP.h, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}
