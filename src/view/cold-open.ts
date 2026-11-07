// GAME-216 · холодний початок демо (OD-025: кіно дозовано, пропуск будь-якої миті): кімната вступу (intro-room.ts, ті самі тайли LPC)
// на закадровому полотні 320×120, а тут — «камера»: наїзд на вікно з дощем, панорама по родині (Джордж біля вікна, Вікторія, Мія, Метью з атласом),
// наїзд на атлас, листівка дідуся Генрі з ескізом половинки медальйона «H+E», затемнення — і керування переходить до вступу (Intro).
// Кадр за кадром від мітки requestAnimationFrame — без tweens і таймерів (виняток описано в src/guards/no-realtime.test.ts): час сцени — це лише картинка,
// кожен біт має вихід за часом, а дотик виходить одразу (ColdOpen.tsx). Підпис друкується в DOM-елемент із голосом (blip) так само, як рамка розмови.
import { FAMILY_LOOKS, PET_SHEETS } from './world/art';
import { FRAME, composeSheet, loadImage } from './world/character';
import { paintRoom, roomLayout } from './intro-room';
import { BEATS, type Cam, beatAt, cameraFor, ease } from './cold-open-beats';
import { blipDue, blipIndices, blipper, speakerPitch } from '../audio/blip';

/** Розмір закадрової кімнати: paintRoom(…, 640, 240) → масштаб 2 → полотно 320×120 (стіна 96 + підлога 24). */
const ROOM_W = 320;
const ROOM_H = 120;
/** Де в кімнаті що стоїть (координати paintRoom при 320×120: ox = 4, y0 = 0, floorY = 96). */
const GEORGE = { x: 30, y: 56 } as const;           // під вікном, дивиться у дощ (кадр «вгору»)
const VICTORIA = { x: 186, y: 56 } as const;        // праворуч, дивиться на Метью (кадр «ліворуч»)
const MIA = { x: 238, y: 88 } as const;             // кішка сидить на підлозі
const CHAR_MS = 16;                                 // як у рамці розмови (DialogueBox.CHAR_MS): ≈ 62 літери/с
const CUT_MS = 400;                                 // затемнення на стику бітів

export interface ColdOpenTexts { readonly line: (key: string) => string }
/** Годинник сцени: мс від дотику «почати»; живе в компоненті, щоб перемальовка при повороті екрана не починала сцену заново. */
export interface ColdOpenClock { elapsed: number }

function drawPostcard(c: CanvasRenderingContext2D, W: number, H: number, alpha: number): void {
  const w = Math.min(W - 12, 196);
  const h = Math.round(w * 0.62);
  const x = Math.round((W - w) / 2);
  const y = Math.round((H - h) / 2) - (H > W ? Math.round(H * 0.08) : 0);
  c.save();
  c.globalAlpha = alpha;
  c.fillStyle = '#1b1208';
  c.fillRect(x + 3, y + 4, w, h);                       // тінь
  c.fillStyle = '#eadfbf';
  c.fillRect(x, y, w, h);
  c.strokeStyle = '#6b5430';
  c.lineWidth = 2;
  c.strokeRect(x + 1, y + 1, w - 2, h - 2);
  // Половинка медальйона: пів кола олівцем, рваний край, літери «H+E».
  const r = Math.round(h * 0.3);
  const mx = x + Math.round(w * 0.3);
  const my = y + Math.round(h * 0.5);
  c.strokeStyle = '#4a3a2a';
  c.lineWidth = 2;
  c.beginPath();
  c.arc(mx, my, r, Math.PI * 0.5, Math.PI * 1.5);
  c.stroke();
  c.beginPath();
  c.moveTo(mx, my - r);
  for (let i = 1; i <= 6; i++) c.lineTo(mx + (i % 2 ? 3 : -2), my - r + (i * 2 * r) / 6);
  c.stroke();
  c.fillStyle = '#4a3a2a';
  c.font = `${Math.max(8, Math.round(r * 0.7))}px CampPixel, monospace`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('H+E', mx - Math.round(r * 0.3), my);
  // Рядки «олівцем» — підпис дідуся друкується в DOM нижче, тут лише натяк на письмо.
  c.strokeStyle = '#8a7658';
  c.lineWidth = 1;
  const lx = x + Math.round(w * 0.56);
  for (let i = 0; i < 4; i++) { const ly = y + Math.round(h * (0.3 + i * 0.14)); c.beginPath(); c.moveTo(lx, ly); c.lineTo(x + w - 12 - (i === 3 ? Math.round(w * 0.12) : 0), ly); c.stroke(); }
  // Марка в кутку.
  c.fillStyle = '#9c5a4a';
  c.fillRect(x + w - 22, y + 6, 16, 12);
  c.restore();
}

/**
 * Малює сцену на `target`, друкує підпис у `caption`; викликає `onEnd` після останнього біта. Повертає зупинку (знімає обидва цикли).
 * Без 2d-полотна (jsdom) — тиха нічого-не-робить, але `onEnd` усе одно прийде за часом від кадрів, яких не буде, — тож без полотна компонент
 * покладається на дотик «пропустити» (у грі полотно є завжди).
 */
export async function paintColdOpen(target: HTMLCanvasElement, caption: HTMLElement, cssW: number, cssH: number, reduced: boolean, isDead: () => boolean, texts: ColdOpenTexts, clock: ColdOpenClock, onEnd: () => void): Promise<() => void> {
  const ctx = target.getContext('2d');
  if (!ctx) return () => undefined;
  const off = document.createElement('canvas');
  const [stopRoom, george, victoria, mia] = await Promise.all([
    paintRoom(off, ROOM_W * 2, ROOM_H * 2, reduced, isDead), composeSheet(FAMILY_LOOKS.george), composeSheet(FAMILY_LOOKS.victoria), loadImage(PET_SHEETS.mia.url),
  ]);
  if (isDead()) { stopRoom(); return () => undefined; }
  const { scale } = roomLayout(cssW, cssH);
  const W = Math.ceil(cssW / scale);
  const H = Math.ceil(cssH / scale);
  target.width = W;
  target.height = H;
  const zBase = Math.min(H / ROOM_H, W / 160);
  const c = ctx;
  c.imageSmoothingEnabled = false;
  const voices = new Map<string, number>();
  const pitch = (voice: string): number => { let hz = voices.get(voice); if (hz === undefined) { hz = speakerPitch(voice); voices.set(voice, hz); } return hz; };
  let shownKey: string | null = null;
  let shownN = -1;
  let blips: number[] = [];

  const drawRoom = (cam: Cam): void => {
    c.setTransform(cam.z, 0, 0, cam.z, W / 2 - cam.cx * cam.z, H / 2 - cam.cy * cam.z);
    c.drawImage(off, 0, 0);
    c.drawImage(george, 0, 0, FRAME, FRAME, GEORGE.x, GEORGE.y, FRAME, FRAME);          // ряд «вгору», стоїть
    c.drawImage(victoria, 0, FRAME, FRAME, FRAME, VICTORIA.x, VICTORIA.y, FRAME, FRAME); // ряд «ліворуч», стоїть
    const f = PET_SHEETS.mia.frame;
    c.drawImage(mia, 0, PET_SHEETS.mia.sitRow * f, f, f, MIA.x, MIA.y, f, f);
    c.setTransform(1, 0, 0, 1, 0, 0);
  };
  const frame = (ms: number): boolean => {
    const at = beatAt(ms);
    c.fillStyle = '#07080d';
    c.fillRect(0, 0, W, H);
    if (!at) { caption.textContent = ''; return false; }
    const { beat, local, u } = at;
    const cam = cameraFor(beat, u, zBase, reduced);
    if (beat.kind === 'postcard' || beat.kind === 'fade') {
      drawRoom(cam);
      c.fillStyle = 'rgba(7,8,13,0.62)';
      c.fillRect(0, 0, W, H);
      if (beat.kind === 'postcard') drawPostcard(c, W, H, Math.min(1, local / 600));
    } else drawRoom(cam);
    // Стики бітів: коротке затемнення на вході й виході (перший біт — повільніший вихід із чорного).
    const inMs = at.index === 0 ? 1200 : CUT_MS;
    const dark = Math.max(0, 1 - local / inMs, beat.kind === 'fade' ? ease(u) : 1 - (beat.ms - local) / CUT_MS);
    if (dark > 0) { c.fillStyle = `rgba(0,0,0,${Math.min(1, dark).toFixed(3)})`; c.fillRect(0, 0, W, H); }
    // Підпис: друк літера за літерою з голосом; «менше руху» — одразу весь рядок і без писку.
    const key = beat.text;
    if (key === null) { if (shownKey !== null) { caption.textContent = ''; shownKey = null; } return true; }
    const chars = Array.from(texts.line(key));
    if (shownKey !== key) { shownKey = key; shownN = -1; blips = blipIndices(chars); caption.dataset['voice'] = beat.voice; caption.dataset['beat'] = beat.kind; caption.textContent = chars.join(''); }   // GAME-265: ціле речення одразу — друк літера за літерою обривав його («Мама…») на знімку й екранному читачі
    // Голос (blip) іде за «віртуальним друком», текст на екрані вже повний; «менше руху» — без писку.
    const n = reduced ? chars.length : Math.min(chars.length, Math.floor(Math.max(0, local - 500) / CHAR_MS));
    if (n !== shownN) {
      if (!reduced && shownN >= 0 && blipDue(blips, shownN, n)) blipper.blip(pitch(beat.voice));
      shownN = n;
    }
    return true;
  };
  frame(clock.elapsed);
  let raf = 0;
  let live = true;
  let base = -1;
  const tick = (t: number): void => {
    if (!live || isDead()) return;
    if (base < 0) base = t - clock.elapsed;
    clock.elapsed = t - base;
    if (!frame(clock.elapsed)) { live = false; stopRoom(); onEnd(); return; }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => { live = false; cancelAnimationFrame(raf); stopRoom(); };
}

export { BEATS };
