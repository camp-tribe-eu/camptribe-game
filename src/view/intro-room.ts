// GAME-191 · тло вступу: затишна кімната Метью зі СПРАВЖНІХ тайлів LPC інтер'єру (assets/tiles/home_*.png — ті самі, що в мапі дому), без нових файлів:
// стіна з вікном, торшер із теплим світлом, полиця, Метью з атласом у руках. Дощ видно ЛИШЕ крізь шибки вікна (маска за чорними пікселями шибок),
// кадр за кадром від мітки requestAnimationFrame — без tweens і таймерів (no-realtime: виняток описано в src/guards/no-realtime.test.ts).
// «Менше руху» → один статичний кадр із краплями. Усе малюється на одному <canvas> у логічних пікселях, у CSS він збільшується без згладжування.
import { FAMILY_LOOKS, TILESET_IMAGES } from './world/art';
import { FRAME, composeSheet, loadImage } from './world/character';
import { iconRects } from '../ui/atlas-icons';

const SCENE_W = 160;
const WALL_H = 96;          // стіна 3 тайли: полотно 87 px + плінтус до 96
const WIN = { sx: 0, sy: 26, w: 64, h: 44 } as const;   // вікно в home_windows_doors.png (три панелі 4+4 шибки)
const LAMP = { sx: 355, sy: 2, w: 24, h: 49 } as const;   // торшер у home_furniture.png (теплий абажур)
const SHELF = { sx: 5, sy: 28, w: 54, h: 64 } as const; // книжкова полиця в home_shelf.png
const SKY: readonly [number, number, number] = [30, 42, 70];
const DROPS = 72;   // 26 читались як «кілька крапель» (знімки PR #121) — щільніше, щоб це був дощ

export interface Layout { readonly scale: number; readonly w: number; readonly h: number }

/** Ціле збільшення, щоб сцена 160 px влізла за шириною, а стіна з підлогою — за висотою; полотно вкриває весь екран. */
export function roomLayout(cssW: number, cssH: number): Layout {
  const scale = Math.max(1, Math.min(Math.floor(cssW / SCENE_W), Math.floor(cssH / 120), 6));
  return { scale, w: Math.ceil(cssW / scale), h: Math.ceil(cssH / scale) };
}

const px = (c: CanvasRenderingContext2D, img: CanvasImageSource, r: { sx: number; sy: number; w: number; h: number }, dx: number, dy: number): void => { c.drawImage(img, r.sx, r.sy, r.w, r.h, dx, dy, r.w, r.h); };
function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  const el = document.createElement('canvas');
  el.width = w;
  el.height = h;
  const c = el.getContext('2d', { willReadFrequently: true });
  return c ? [el, c] : null;
}

/** Мала лінійна «випадковість» без Math.random: крапля i завжди в одному місці — кадр відтворюваний. */
const hash = (i: number, k: number): number => { const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return v - Math.floor(v); };

/**
 * Малює кімнату на `target` і повертає функцію зупинки. `reduced` — «менше руху»: один кадр. Без 2d-полотна (jsdom) — тиха нічого-не-робить.
 */
export async function paintRoom(target: HTMLCanvasElement, cssW: number, cssH: number, reduced: boolean, isDead: () => boolean): Promise<() => void> {
  const layout = roomLayout(cssW, cssH);
  const ctx = target.getContext('2d');
  if (!ctx) return () => undefined;
  const [walls, floor, doors, furn, shelf, sheet] = await Promise.all([
    loadImage(TILESET_IMAGES['home-walls'] as string), loadImage(TILESET_IMAGES['home-floor'] as string), loadImage(TILESET_IMAGES['home-windows-doors'] as string),
    loadImage(TILESET_IMAGES['home-furniture'] as string), loadImage(TILESET_IMAGES['home-shelf'] as string), composeSheet(FAMILY_LOOKS.matthew),
  ]);
  if (isDead()) return () => undefined;
  const { w, h } = layout;
  target.width = w;
  target.height = h;
  const ox = w >= 240 ? 4 : Math.floor((w - SCENE_W) / 2);   // вбік — сцена ліворуч, лист праворуч; у портреті — по центру
  const y0 = Math.max(0, Math.min(Math.round(h * 0.1), h - WALL_H - 34));   // висока кімната (портрет) — стіна трохи нижче верху; низька (вбік) — від самого верху
  const floorY = y0 + WALL_H;
  const c = ctx;
  c.imageSmoothingEnabled = false;

  // Стіна: сама полотнина (без плінтуса) вгору до краю екрана, плінтус, дошки підлоги.
  for (let x = 0; x < w; x += 32) for (let y = floorY - 9 - 32; y > -32; y -= 32) c.drawImage(walls, 32, 16, 32, 32, x, y, 32, 32);
  for (let x = 0; x < w; x += 32) c.drawImage(walls, 32, 87, 32, 9, x, floorY - 9, 32, 9);
  for (let x = 0; x < w; x += 32) for (let y = floorY; y < h; y += 32) c.drawImage(floor, 0, 0, 32, 32, x, y, 32, 32);
  // Підлога темнішає до низу — кімната «заглиблюється».
  const fg = c.createLinearGradient(0, floorY, 0, h);
  fg.addColorStop(0, 'rgba(30,15,10,0)');
  fg.addColorStop(1, 'rgba(30,15,10,0.45)');
  c.fillStyle = fg;
  c.fillRect(0, floorY, w, h - floorY);
  // Тінь від стіни на підлозі.
  c.fillStyle = 'rgba(30,15,10,0.25)';
  c.fillRect(0, floorY, w, 3);

  const winX = ox + 22;
  const winY = y0 + 14;
  const lampX = ox + 2;
  const shelfX = ox + 104;
  px(c, furn, LAMP, lampX, floorY - LAMP.h + 4);
  px(c, shelf, SHELF, shelfX, floorY - SHELF.h + 4);
  // Вечірній присмерк на всьому, що намальоване вище (вікно, Метью й світло лампи — поверх нього).
  c.fillStyle = 'rgba(18,22,48,0.34)';
  c.fillRect(0, 0, w, h);

  // Вікно: чорні шибки (за пікселями файла) перефарбовані на нічне небо; маска шибок обрізає дощ.
  const win = canvas(WIN.w, WIN.h);
  const mask = canvas(WIN.w, WIN.h);
  const rain = canvas(WIN.w, WIN.h);
  if (!win || !mask || !rain) return () => undefined;
  win[1].drawImage(doors, WIN.sx, WIN.sy, WIN.w, WIN.h, 0, 0, WIN.w, WIN.h);
  const img = win[1].getImageData(0, 0, WIN.w, WIN.h);
  const mk = mask[1].createImageData(WIN.w, WIN.h);
  for (let i = 0; i < img.data.length; i += 4) {
    if ((img.data[i + 3] ?? 0) === 255 && (img.data[i] ?? 255) < 6 && (img.data[i + 1] ?? 255) < 6 && (img.data[i + 2] ?? 255) < 6) {
      const row = Math.floor(i / 4 / WIN.w) / WIN.h;
      const d = img.data as unknown as number[];
      d[i] = SKY[0] + Math.round(row * 14);
      d[i + 1] = SKY[1] + Math.round(row * 16);
      d[i + 2] = SKY[2] + Math.round(row * 22);
      (mk.data as unknown as number[])[i + 3] = 255;
    }
  }
  win[1].putImageData(img, 0, 0);
  mask[1].putImageData(mk, 0, 0);

  // Метью біля полиці з атласом у руках (кадр «вниз», стоїть); атлас — той самий піксельний значок 8×8, що й в Атласі.
  const mx = shelfX - 34;
  const my = floorY - 52 + 14 + (h > 300 ? 34 : 0);   // висока кімната (портрет): Метью ближче, на підлозі, а не під стіною — менше порожнечі
  const drawMatthew = (): void => {
    c.drawImage(sheet, 0, 2 * FRAME, FRAME, FRAME, mx, my, FRAME, FRAME);
    for (const r of iconRects('atlas')) { c.fillStyle = r.fill; c.fillRect(mx + 34 + r.x * 2, my + 38 + r.y * 2, 2, 2); }   // ×2: 8×8 у руках губився
  };
  drawMatthew();

  // Тепле світло торшера: м'яка пляма на стіні й підлозі й загальна «кав'яна» тінь по краях.
  const gx = lampX + 12;
  const gy = floorY - 36;
  const glow = c.createRadialGradient(gx, gy, 2, gx, gy, 92);
  glow.addColorStop(0, 'rgba(255,205,120,0.50)');
  glow.addColorStop(0.5, 'rgba(255,170,80,0.16)');
  glow.addColorStop(1, 'rgba(255,170,80,0)');
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.fillStyle = glow;
  c.fillRect(0, 0, w, h);
  c.restore();
  const vig = c.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.35, w / 2, h * 0.45, Math.max(w, h) * 0.8);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.4)');
  c.fillStyle = vig;
  c.fillRect(0, 0, w, h);
  // Знімок усього, крім вікна, — щоб кадр дощу малював лише вікно, а не всю кімнату.
  const frameWindow = (t: number): void => {
    c.drawImage(win[0], winX, winY);
    const rc = rain[1];
    rc.clearRect(0, 0, WIN.w, WIN.h);
    rc.fillStyle = 'rgba(170,200,235,0.85)';
    for (let i = 0; i < DROPS; i++) {
      const len = 4 + Math.floor(hash(i, 3) * 4);
      const speed = 0.045 + hash(i, 2) * 0.03;   // px за мс
      const y = reduced ? hash(i, 4) * WIN.h : ((hash(i, 1) * (WIN.h + 8) + t * speed) % (WIN.h + 8)) - 4;
      const x = Math.floor(hash(i, 0) * WIN.w) - Math.floor(y * 0.12);
      rc.fillRect(x, Math.floor(y), 1, len);
    }
    rc.globalCompositeOperation = 'destination-in';
    rc.drawImage(mask[0], 0, 0);
    rc.globalCompositeOperation = 'source-over';
    c.drawImage(rain[0], winX, winY);
  };
  frameWindow(0);
  if (reduced) return () => undefined;
  let raf = 0;
  let live = true;
  const tick = (t: number): void => {
    if (!live || isDead()) return;
    frameWindow(t);
    drawMatthew();
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => { live = false; cancelAnimationFrame(raf); };
}
