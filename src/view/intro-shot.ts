// GAME-303 · кадр для проби подачі вступу (комікс-панель чи кінокадр): ОДНА кімната з ОДНІЄЮ людиною, зі СПРАВЖНІХ тайлів LPC (ті самі home_*.png й листи персонажів,
// що в intro-room.ts) — без нових файлів і без малювання ШІ. Малюється один раз на закадровому полотні в логічних пікселях і збільшується в CSS цілим числом
// (image-rendering: pixelated). Рух (наїзд камери, «z z Z», перехід) — лише CSS-анімація поверх готового кадру: у цьому файлі немає ні таймерів, ні rAF.
import { CAMPFIRE_SHEET, FAMILY_LOOKS, TILESET_IMAGES } from './world/art';
import { DIR_ROW, FRAME, composeSheet, loadImage, type Dir } from './world/character';
import type { RoomId, ShotSpec } from '../content/intro-scene';
import { roomPlan, type PieceId } from './intro-plan';

type Who = RoomId;
interface Rect { readonly sx: number; readonly sy: number; readonly w: number; readonly h: number }
// Вирізки з home_furniture.png (448×96): ліжко 2×3 тайли, диван, журнальний столик, торшер, картина, вазон, шафа.
const BED: Rect = { sx: 96, sy: 0, w: 64, h: 96 };
const DRESSER: Rect = { sx: 192, sy: 69, w: 32, h: 27 };
const LAMP: Rect = { sx: 356, sy: 2, w: 24, h: 49 };
const PAINTING: Rect = { sx: 397, sy: 1, w: 38, h: 30 };
const PLANT: Rect = { sx: 0, sy: 7, w: 32, h: 73 };
const SOFA: Rect = { sx: 37, sy: 0, w: 55, h: 34 };
const COFFEE: Rect = { sx: 40, sy: 66, w: 48, h: 26 };
const WIN = { sx: 0, sy: 26, w: 64, h: 44 } as const;   // вікно в home_windows_doors.png (як у intro-room.ts)
const BED_HEAD = { x: 26, y: 38 } as const;             // де в ліжку подушка: сюди кладеться потилиця сплячого

const images = new Map<string, Promise<HTMLImageElement>>();
const img = (url: string): Promise<HTMLImageElement> => { let p = images.get(url); if (!p) { p = loadImage(url); images.set(url, p); } return p; };
const sheets = new Map<Who, Promise<HTMLCanvasElement>>();
const sheet = (w: Who): Promise<HTMLCanvasElement> => { let p = sheets.get(w); if (!p) { p = composeSheet(FAMILY_LOOKS[w]); sheets.set(w, p); } return p; };

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  const el = document.createElement('canvas');
  el.width = w;
  el.height = h;
  const c = el.getContext('2d', { willReadFrequently: true });
  return c ? [el, c] : null;
}

/** Ціле збільшення кадру: щоб ліжко (96 px) влізло по висоті, а кімната була не вужчою за ~130 логічних px. Однакове для А й Б → один стиль пікселя. */
export function shotScale(cssW: number, cssH: number): number {
  return Math.max(2, Math.min(4, Math.floor(Math.min(cssW / 130, cssH / 115))));
}

const px = (c: CanvasRenderingContext2D, im: CanvasImageSource, r: Rect, dx: number, dy: number): void => { c.drawImage(im, r.sx, r.sy, r.w, r.h, Math.round(dx), Math.round(dy), r.w, r.h); };

/** Вікно: чорні шибки файла перефарбовано на небо (ніч — синє, ранок — світле), як у intro-room.ts. */
function windowSprite(doors: HTMLImageElement, sky: readonly [number, number, number]): HTMLCanvasElement | null {
  const win = makeCanvas(WIN.w, WIN.h);
  if (!win) return null;
  win[1].drawImage(doors, WIN.sx, WIN.sy, WIN.w, WIN.h, 0, 0, WIN.w, WIN.h);
  const d = win[1].getImageData(0, 0, WIN.w, WIN.h);
  for (let i = 0; i < d.data.length; i += 4) {
    if ((d.data[i + 3] ?? 0) === 255 && (d.data[i] ?? 255) < 6 && (d.data[i + 1] ?? 255) < 6 && (d.data[i + 2] ?? 255) < 6) {
      const row = Math.floor(i / 4 / WIN.w) / WIN.h;
      d.data[i] = sky[0] + Math.round(row * 14);
      d.data[i + 1] = sky[1] + Math.round(row * 16);
      d.data[i + 2] = sky[2] + Math.round(row * 22);
    }
  }
  win[1].putImageData(d, 0, 0);
  return win[0];
}

const dot = (c: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number): void => { c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), w, h); };

/** Тінь під ногами — щоб людина стояла на підлозі, а не висіла. */
function shadow(c: CanvasRenderingContext2D, cx: number, y: number, rx: number): void {
  c.fillStyle = 'rgba(20,10,8,0.34)';
  for (let k = 0; k < 4; k++) c.fillRect(Math.round(cx - rx + k), Math.round(y - 1 + (k === 0 || k === 3 ? 1 : 0)), Math.round(rx * 2 - k * 2), k === 0 || k === 3 ? 1 : 2);
}

/** Людина зі спрайта LPC: кадр 64×64, ноги на y = feet. */
function person(c: CanvasRenderingContext2D, sh: HTMLCanvasElement, cx: number, feet: number, dir: Dir): void {
  shadow(c, cx, feet, 13);
  c.drawImage(sh, 0, DIR_ROW[dir] * FRAME, FRAME, FRAME, Math.round(cx - 32), Math.round(feet - 58), FRAME, FRAME);
}

/** Сплячий: потилиця (спрайт «вгору» — голова відвернута) на подушці, поверх — ковдра ліжка. Очі закриті «за побудовою»: обличчя не видно. */
function sleeper(c: CanvasRenderingContext2D, sh: HTMLCanvasElement, bed: HTMLImageElement, bx: number, by: number): void {
  c.drawImage(sh, 22, DIR_ROW.up * FRAME + 8, 20, 22, bx + BED_HEAD.x - 2, by + BED_HEAD.y - 14, 20, 22);
  // Ковдра й подушка зверху: нижня частина ліжка перемальовується поверх шиї.
  c.drawImage(bed, BED.sx, BED.sy + BED_HEAD.y + 6, BED.w, BED.h - BED_HEAD.y - 6, bx, by + BED_HEAD.y + 6, BED.w, BED.h - BED_HEAD.y - 6);
}

interface Pal { readonly sky: readonly [number, number, number]; readonly tint: string; readonly glow: number }

/** Кімната: стіна, плінтус, підлога, вікно, речі кімнати; повертає, де ставити людину. */
async function paintRoomShot(target: HTMLCanvasElement, w: number, h: number, spec: Extract<ShotSpec, { kind: 'room' }>): Promise<void> {
  const [walls, floor, doors, furn, sh] = await Promise.all([img(TILESET_IMAGES['home-walls'] as string), img(TILESET_IMAGES['home-floor'] as string), img(TILESET_IMAGES['home-windows-doors'] as string), img(TILESET_IMAGES['home-furniture'] as string), sheet(spec.room)]);
  const c = target.getContext('2d');
  if (!c) return;
  c.imageSmoothingEnabled = false;
  const morning = spec.phase === 'morning';
  const sleep = spec.pose === 'sleep';
  const pal: Pal = morning ? { sky: [150, 196, 232], tint: 'rgba(255,226,170,0.10)', glow: 0 } : sleep ? { sky: [22, 30, 58], tint: 'rgba(10,14,36,0.52)', glow: 0 } : { sky: [30, 42, 70], tint: 'rgba(18,22,48,0.34)', glow: 1 };
  const plan = roomPlan(w, h, spec.room);
  const { floorY, feet } = plan;
  for (let x = 0; x < w; x += 32) for (let y = floorY - 9 - 32; y > -32; y -= 32) c.drawImage(walls, 32, 16, 32, 32, x, y, 32, 32);
  for (let x = 0; x < w; x += 32) c.drawImage(walls, 32, 87, 32, 9, x, floorY - 9, 32, 9);
  for (let x = 0; x < w; x += 32) for (let y = floorY; y < h; y += 32) c.drawImage(floor, 0, 0, 32, 32, x, y, 32, 32);
  const fg = c.createLinearGradient(0, floorY, 0, h);
  fg.addColorStop(0, 'rgba(30,15,10,0)');
  fg.addColorStop(1, 'rgba(30,15,10,0.40)');
  c.fillStyle = fg;
  c.fillRect(0, floorY, w, h - floorY);
  dot(c, 'rgba(30,15,10,0.25)', 0, floorY, w, 3);
  const win = windowSprite(doors, pal.sky);
  const SRC: Readonly<Record<PieceId, Rect>> = { bed: BED, sofa: SOFA, coffee: COFFEE, lamp: LAMP, plant: PLANT, dresser: DRESSER, painting: PAINTING, window: BED };
  // Речі й людина — в одному порядку за низом (що нижче на екрані, те попереду), тож людина, що стоїть перед ліжком чи тумбою, їх перекриває, а не навпаки.
  type Item = { readonly base: number; readonly draw: () => void };
  const items: Item[] = plan.pieces.map((pc): Item => ({
    base: pc.wall ? -1 : pc.y + pc.h,
    draw: () => {
      if (pc.id === 'window') { if (win) c.drawImage(win, pc.x, pc.y); return; }
      px(c, furn, SRC[pc.id], pc.x, pc.y);
      if (sleep && pc.id === 'bed') sleeper(c, sh, furn, pc.x, pc.y);
      if (sleep && pc.id === 'sofa') {
        // Заснув на дивані: потилиця на спинці, зверху ковдра з ліжка.
        c.drawImage(sh, 22, DIR_ROW.up * FRAME + 8, 20, 22, pc.x + 16, pc.y - 10, 20, 22);
        c.drawImage(furn, 100, 52, 56, 22, pc.x, pc.y + 6, 55, 22);
      }
    },
  }));
  if (!sleep) items.push({ base: feet, draw: () => person(c, sh, plan.person.x, feet, plan.person.dir) });
  items.sort((a, b) => a.base - b.base).forEach((it) => it.draw());
  // Присмерк / ранкове світло на всьому; тепла пляма торшера (лише вночі й не уві сні).
  c.fillStyle = pal.tint;
  c.fillRect(0, 0, w, h);
  if (pal.glow > 0) {
    const gx = plan.glow.x;
    const gy = plan.glow.y - 24;
    const g = c.createRadialGradient(gx, gy, 2, gx, gy, 80);
    g.addColorStop(0, 'rgba(255,205,120,0.45)');
    g.addColorStop(0.5, 'rgba(255,170,80,0.14)');
    g.addColorStop(1, 'rgba(255,170,80,0)');
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.restore();
  }
  const vg = c.createRadialGradient(w / 2, h * 0.5, Math.min(w, h) * 0.35, w / 2, h * 0.5, Math.max(w, h) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, morning ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.42)');
  c.fillStyle = vg;
  c.fillRect(0, 0, w, h);
}

/** Сон про дорогу: сутінкове небо із зірками, трава, авто, намет, багаття, родина йде до вогню — усе з тайлів і спрайтів гри. */
async function paintDream(target: HTMLCanvasElement, w: number, h: number): Promise<void> {
  const [terrain, tent, car, fire, george, victoria, matthew] = await Promise.all([
    img(TILESET_IMAGES['lpc-terrain'] as string), img(TILESET_IMAGES['camp-tent'] as string), img(TILESET_IMAGES['camp-car'] as string), img(CAMPFIRE_SHEET), sheet('george'), sheet('victoria'), sheet('matthew'),
  ]);
  const c = target.getContext('2d');
  if (!c) return;
  c.imageSmoothingEnabled = false;
  // Родина — внизу кадру (ноги за 8 px від краю), авто й намет на другому плані над нею: так композиція влазить і в низьке вікно (ландшафт), і у високе (портрет).
  const feet = h - 8;
  const ground = feet - 34;
  const horizon = Math.min(Math.round(h * 0.55), ground - 26);
  const sky = c.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#1a2250');
  sky.addColorStop(0.7, '#6a4a7a');
  sky.addColorStop(1, '#e89a6a');
  c.fillStyle = sky;
  c.fillRect(0, 0, w, horizon);
  for (let i = 0; i < 36; i++) {   // зірки — детерміновано (без Math.random)
    const s = Math.sin(i * 127.1) * 43758.5453;
    const f = s - Math.floor(s);
    const s2 = Math.sin(i * 311.7) * 43758.5453;
    dot(c, i % 5 === 0 ? '#fff6c8' : '#c9d4ff', f * w, (s2 - Math.floor(s2)) * horizon * 0.8, 1, 1);
  }
  // Місяць-серп: піксельний малюнок 7×7 (1 — світло).
  const moon = ['0011100', '0111000', '1110000', '1110000', '1110000', '0111000', '0011100'];
  moon.forEach((row, y) => [...row].forEach((v, x) => { if (v === '1') dot(c, '#fff3c4', Math.round(w * 0.16) + x, Math.round(horizon * 0.16) + y, 1, 1); }));
  const gids: readonly number[] = [672, 704, 736];
  for (let x = 0, k = 0; x < w; x += 32, k++) for (let y = horizon, j = 0; y < h; y += 32, j++) c.drawImage(terrain, gids[(k + j * 2) % 3] ?? 672, 160, 32, 32, x, y, 32, 32);
  const g = c.createLinearGradient(0, horizon, 0, h);
  g.addColorStop(0, 'rgba(20,16,50,0.45)');
  g.addColorStop(1, 'rgba(20,16,50,0.15)');
  c.fillStyle = g;
  c.fillRect(0, horizon, w, h - horizon);
  const cx = Math.round(w / 2);
  // Глибина: авто й намет — другий план (вище по екрану), багаття — посередині, родина — на передньому плані; усе в ~200 px, тож влазить і в вузький портрет.
  c.drawImage(car, 0, 0, 128, 64, Math.round(cx - 104), ground - 74, 128, 64);                  // авто ліворуч (профіль)
  c.drawImage(tent, 0, 0, 96, 64, Math.round(cx + 6), ground - 70, 96, 64);                    // намет праворуч
  c.drawImage(fire, 0, 0, 64, 64, Math.round(cx - 32), ground - 40, 64, 64);                   // перший кадр багаття
  const walk: readonly [HTMLCanvasElement, number][] = [[george, cx - 54], [victoria, cx - 22], [matthew, cx + 52]];
  for (const [sh, x] of walk) { shadow(c, x, feet, 12); c.drawImage(sh, 0, DIR_ROW.right * FRAME, FRAME, FRAME, x - 32, feet - 58, FRAME, FRAME); }
  const warm = c.createRadialGradient(cx, ground - 10, 4, cx, ground - 10, Math.max(w, h) * 0.5);
  warm.addColorStop(0, 'rgba(255,170,80,0.30)');
  warm.addColorStop(1, 'rgba(255,170,80,0)');
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.fillStyle = warm;
  c.fillRect(0, 0, w, h);
  c.restore();
}

/** Намалювати кадр на `target` за розміром у CSS-пікселях. Кадр завжди ціле збільшення; без 2d-полотна (jsdom) — тиха нічого-не-робить. */
export async function paintShot(target: HTMLCanvasElement, cssW: number, cssH: number, spec: ShotSpec): Promise<void> {
  if (!target.getContext('2d')) return;
  const scale = spec.kind === 'dream' ? Math.max(2, Math.min(3, Math.floor(cssW / 190), Math.floor(cssH / 130))) : shotScale(cssW, cssH);
  const w = Math.max(60, Math.ceil(cssW / scale));
  const h = Math.max(60, Math.ceil(cssH / scale));
  const draw = spec.kind === 'dream' ? paintDream(makeLogical(target, w, h), w, h) : paintRoomShot(makeLogical(target, w, h), w, h, spec);
  await draw;
}
function makeLogical(target: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement { target.width = w; target.height = h; return target; }

