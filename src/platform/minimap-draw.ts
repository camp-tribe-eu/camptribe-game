// GAME-243: малювання мінімапи. База (плитки мапи) малюється ОДИН раз на мапу в маленьке полотно й кешується; щокадру — лише копія + крапки.
import type { MiniFrame } from '../content/agenda';

const TONE = ['#7f8f68', '#2b2f36', '#3d79b5'] as const;
const BASE = new Map<string, HTMLCanvasElement>();

/** Підкладка мапи: 1 плитка = CELL px; кеш за ключем мапи. */
export function baseOf(f: MiniFrame): HTMLCanvasElement {
  const hit = BASE.get(f.key);
  if (hit) return hit;
  const cell = Math.max(2, Math.ceil(192 / Math.max(f.cols, f.rows)));
  const c = document.createElement('canvas');
  c.width = f.cols * cell; c.height = f.rows * cell;
  const g = c.getContext('2d');
  if (g) for (let i = 0; i < f.tones.length; i++) { g.fillStyle = TONE[f.tones[i] ?? 0] ?? TONE[0]; g.fillRect((i % f.cols) * cell, Math.floor(i / f.cols) * cell, cell, cell); }
  BASE.set(f.key, c);
  return c;
}

/** Малює знімок у полотно `cv` (розмір беремо з його CSS-розміру); повертає кількість крапок цілей. */
export function paintMini(cv: HTMLCanvasElement, f: MiniFrame): number {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.max(1, Math.round(cv.clientWidth * dpr));
  const H = Math.max(1, Math.round(cv.clientHeight * dpr));
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const g = cv.getContext('2d');
  if (!g) return f.dots.length;
  const k = Math.min(W / f.cols, H / f.rows);
  const ox = (W - f.cols * k) / 2; const oy = (H - f.rows * k) / 2;
  g.clearRect(0, 0, W, H);
  g.imageSmoothingEnabled = false;
  g.drawImage(baseOf(f), ox, oy, f.cols * k, f.rows * k);
  const r = Math.max(3, Math.min(W, H) / 22);
  for (const d of f.dots) {
    g.beginPath(); g.arc(ox + d.x * k, oy + d.y * k, r, 0, Math.PI * 2);
    g.fillStyle = '#ffd54a'; g.fill(); g.lineWidth = Math.max(1, r / 3); g.strokeStyle = '#1b1f23'; g.stroke();
  }
  // Гравець: білий трикутник, носом у бік погляду.
  const ang = { up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 }[f.dir];
  const px = ox + f.px * k; const py = oy + f.py * k; const s = r * 1.5;
  g.save(); g.translate(px, py); g.rotate(ang);
  g.beginPath(); g.moveTo(s, 0); g.lineTo(-s * 0.7, s * 0.75); g.lineTo(-s * 0.7, -s * 0.75); g.closePath();
  g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = Math.max(1, r / 3); g.strokeStyle = '#1b1f23'; g.stroke();
  g.restore();
  return f.dots.length;
}
