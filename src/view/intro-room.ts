// GAME-191 · тло вступу: затишна кімната Метью зі СПРАВЖНІХ тайлів LPC інтер'єру (assets/tiles/home_*.png — ті самі, що в мапі дому), без нових файлів:
// стіна з вікном, торшер із теплим світлом, полиця, Метью з атласом у руках. Дощ видно ЛИШЕ крізь шибки вікна (маска за чорними пікселями шибок),
// кадр за кадром від мітки requestAnimationFrame — без tweens і таймерів (no-realtime: виняток описано в src/guards/no-realtime.test.ts).
// «Менше руху» → один статичний кадр із краплями. Усе малюється на одному <canvas> у логічних пікселях, у CSS він збільшується без згладжування.
import { FAMILY_LOOKS, FAMILY_THRUST_LOOK, TILESET_IMAGES } from './world/art';
import { ACTION_COLS, DIR_ROW, FRAME, composeSheet, loadImage, type Dir } from './world/character';
import { idlePose } from './world/idle-poses';
import { CAST_X, OBJ, roomGeometry, roomLayout, type Who } from '../ui/intro-geometry';

export { roomLayout };
export type { Layout } from '../ui/intro-geometry';

const WIN = { sx: 0, sy: 26, w: OBJ.window.w, h: OBJ.window.h } as const;   // вікно в home_windows_doors.png (три панелі 4+4 шибки)
const LAMP = { sx: 355, sy: 2, w: 24, h: 49 } as const;   // торшер у home_furniture.png (теплий абажур)
const SHELF = { sx: 5, sy: 28, w: 54, h: 64 } as const; // книжкова полиця в home_shelf.png
const SKY_NIGHT: readonly [number, number, number] = [30, 42, 70];
const SKY_DAY: readonly [number, number, number] = [150, 196, 232];   // GAME-249: ранок — дощ стих, небо світле
const DROPS = 72;   // 26 читались як «кілька крапель» (знімки PR #121) — щільніше, щоб це був дощ

/** GAME-249: ранок (світло, без дощу); `family` — Вікторія, Метью й Джордж у кімнаті (план і метушня), інакше лише Метью; `speaker` — хто говорить (позначка й підскок). */
export interface IntroRoomOpts { readonly morning?: boolean; readonly family?: boolean; readonly speaker?: string | null }
const CAST_DIR: Readonly<Record<Who, Dir>> = { victoria: 'down', matthew: 'down', george: 'left' };
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
export async function paintRoom(target: HTMLCanvasElement, cssW: number, cssH: number, reduced: boolean, isDead: () => boolean, opts: IntroRoomOpts = {}): Promise<() => void> {
  const morning = opts.morning === true;
  const layout = roomLayout(cssW, cssH);
  const ctx = target.getContext('2d');
  if (!ctx) return () => undefined;
  const [walls, floor, doors, furn, shelf, sheet, victoria, george, vThrust, mThrust] = await Promise.all([
    loadImage(TILESET_IMAGES['home-walls'] as string), loadImage(TILESET_IMAGES['home-floor'] as string), loadImage(TILESET_IMAGES['home-windows-doors'] as string),
    loadImage(TILESET_IMAGES['home-furniture'] as string), loadImage(TILESET_IMAGES['home-shelf'] as string), composeSheet(FAMILY_LOOKS.matthew),
    composeSheet(FAMILY_LOOKS.victoria), composeSheet(FAMILY_LOOKS.george), composeSheet(FAMILY_THRUST_LOOK.victoria, ACTION_COLS.thrust), composeSheet(FAMILY_THRUST_LOOK.matthew, ACTION_COLS.thrust),
  ]);
  if (isDead()) return () => undefined;
  const { w, h } = layout;
  const SKY = morning ? SKY_DAY : SKY_NIGHT;
  target.width = w;
  target.height = h;
  const { ox, y0, floorY, castY } = roomGeometry(cssW, cssH);
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

  const winX = ox + OBJ.window.dx;
  const winY = y0 + OBJ.window.dy;
  const lampX = ox + 2;
  const shelfX = ox + 104;
  px(c, furn, LAMP, lampX, floorY - LAMP.h + 4);
  px(c, shelf, SHELF, shelfX, floorY - SHELF.h + 4);
  // Вечірній присмерк на всьому, що намальоване вище (вікно, Метью й світло лампи — поверх нього).
  c.fillStyle = morning ? 'rgba(255,226,170,0.12)' : 'rgba(18,22,48,0.34)';
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

  // Люди стоять НАД рамкою розмови: ноги — на лінії підлоги або вище за верх рамки (≈ 62 % висоти екрана), у портреті — трохи нижче стіни.
  const who: readonly Who[] = opts.family === true ? ['victoria', 'matthew', 'george'] : ['matthew'];
  const sheets: Readonly<Record<Who, HTMLCanvasElement>> = { victoria, matthew: sheet, george };
  const thrust: Partial<Record<Who, HTMLCanvasElement>> = { victoria: vThrust, matthew: mThrust };
  const speaker = (opts.speaker ?? '').replace('npc.', '');
  const drawCast = (t: number): void => {
    who.forEach((id, k) => {
      const pose = reduced ? null : idlePose(id, t, k * 3);
      const tr = pose?.sheet === 'thrust' ? thrust[id] : undefined;
      const dir = (pose?.dir ?? CAST_DIR[id]);
      const src = tr ?? sheets[id];
      const col = tr ? pose?.col ?? 0 : pose?.sheet === 'walk' ? pose.col : 0;
      const bounce = !reduced && id === speaker && Math.floor(t / 320) % 2 === 1 ? 1 : 0;   // підскок за кадрами (мітка rAF), без таймерів
      const x = ox + CAST_X[id] + (id === 'matthew' && !opts.family ? 18 : 0);
      c.drawImage(src, col * FRAME, DIR_ROW[dir] * FRAME, FRAME, FRAME, x, castY - bounce, FRAME, FRAME);
      if (id === speaker) { c.fillStyle = '#ffd54a'; c.fillRect(x + 29, castY + 2 - bounce, 6, 2); c.fillRect(x + 30, castY + 4 - bounce, 4, 2); c.fillRect(x + 31, castY + 6 - bounce, 2, 2); }   // жовта стрілка «говорить»
    });
  };

  // Тепле світло торшера: м'яка пляма на стіні й підлозі й загальна «кав'яна» тінь по краях.
  const gx = lampX + 12;
  const gy = floorY - 36;
  const glow = c.createRadialGradient(gx, gy, 2, gx, gy, morning ? 1 : 92);
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
  vig.addColorStop(1, morning ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.4)');
  c.fillStyle = vig;
  c.fillRect(0, 0, w, h);
  const bg = canvas(w, h);
  bg?.[1].drawImage(target, 0, 0);
  // Знімок усього, крім вікна, — щоб кадр дощу малював лише вікно, а не всю кімнату.
  const frameWindow = (t: number): void => {
    c.drawImage(win[0], winX, winY);
    const rc = rain[1];
    rc.clearRect(0, 0, WIN.w, WIN.h);
    rc.fillStyle = 'rgba(170,200,235,0.85)';
    for (let i = 0; i < (morning ? 0 : DROPS); i++) {
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
  drawCast(0);
  if (reduced) return () => undefined;
  let raf = 0;
  let live = true;
  const tick = (t: number): void => {
    if (!live || isDead()) return;
    if (bg) c.drawImage(bg[0], 0, 0);
    frameWindow(t);
    drawCast(t);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => { live = false; cancelAnimationFrame(raf); };
}
