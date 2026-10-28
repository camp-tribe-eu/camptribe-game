// GAME-175 · те, що гравець бачить, діючи на мапі: кільце наближення, рюкзак на герої, бульбашки потреб над авто, стрілка до мети,
// сплив «+1». Лише малювання (Phaser Graphics/Text) — рішення й команди в сцені/main.ts. Усе з простих пікселів палітри гри.
import Phaser from 'phaser';
import type { Dir } from './character';

const FONT = { fontFamily: "CampPixel, monospace", fontSize: '8px', color: '#ffd54a', stroke: '#1b1f23', strokeThickness: 3 };
const POP_S = 0.6;
const TOP = 100_010;   // над усім, що в світі (DEPTH.always у scene.ts = 100_000)

export interface Needs { readonly small: number; readonly bulky: number }

export class MapFx {
  private readonly ring: Phaser.GameObjects.Graphics;
  private readonly guide: Phaser.GameObjects.Graphics;
  private readonly pack: Phaser.GameObjects.Graphics;
  private readonly bubble: Phaser.GameObjects.Graphics;
  private readonly bubbleText: Phaser.GameObjects.Text[] = [];
  private bubbleKey = '';
  /** Скільки спливів показано (для e2e) і яка підказка-стрілка зараз: none | line | edge. */
  pops = 0;
  private floaters: { t: Phaser.GameObjects.Text; y0: number; age: number }[] = [];
  guideMode: 'none' | 'line' | 'edge' = 'none';

  constructor(private readonly scene: Phaser.Scene) {
    this.ring = scene.add.graphics().setDepth(TOP);
    this.guide = scene.add.graphics().setDepth(TOP - 1);
    this.pack = scene.add.graphics();
    this.bubble = scene.add.graphics().setDepth(TOP - 2);
    for (let i = 0; i < 2; i++) this.bubbleText.push(scene.add.text(0, 0, '', FONT).setDepth(TOP - 1).setVisible(false));
  }

  /** Кільце над об'єктом: частка 0..1 (0 — не малювати). */
  drawRing(x: number, y: number, t: number): void {
    const g = this.ring.clear();
    if (t <= 0) return;
    g.lineStyle(4, 0x1b1f23, 0.8).beginPath().arc(x, y - 34, 9, 0, Math.PI * 2).strokePath();
    g.lineStyle(3, 0xffd54a, 1).beginPath().arc(x, y - 34, 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, t)).strokePath();
  }

  /** Рюкзак на спині героя (з'являється, коли в ньому щось є): ззаду, а коли герой іде вгору — видно збоку-спереду. */
  drawBackpack(on: boolean, x: number, y: number, facing: Dir): void {
    const g = this.pack.clear();
    if (!on) return;
    const side = facing === 'left' ? 5 : facing === 'right' ? -5 : 0;
    const bx = x + side - 5;
    g.fillStyle(0x7a4b25, 1).fillRoundedRect(bx, y - 36, 10, 13, 2);
    g.fillStyle(0xb67a3d, 1).fillRect(bx + 1, y - 34, 8, 3);
    g.lineStyle(1, 0x1b1f23, 1).strokeRoundedRect(bx, y - 36, 10, 13, 2);
    g.setDepth(facing === 'up' ? y + 0.5 : y - 0.5);
  }

  /** Бульбашка потреб над авто: рюкзак × дрібного, намет × громіздкого. Нічого не бракує — не показується. */
  drawNeeds(x: number, y: number, n: Needs | null): void {
    const g = this.bubble;
    const key = n && n.small + n.bulky > 0 ? `${x}|${y}|${n.small}|${n.bulky}` : '';
    if (key === this.bubbleKey) return;
    this.bubbleKey = key;
    g.clear();
    this.bubbleText.forEach((t) => t.setVisible(false));
    if (!n || key === '') return;
    const items: { kind: 'pack' | 'tent'; n: number }[] = [];
    if (n.small > 0) items.push({ kind: 'pack', n: n.small });
    if (n.bulky > 0) items.push({ kind: 'tent', n: n.bulky });
    const w = 8 + items.length * 26;
    const left = x - w / 2;
    g.fillStyle(0xf4efe6, 0.95).fillRoundedRect(left, y - 18, w, 18, 5).fillTriangle(x - 4, y, x + 4, y, x, y + 5);
    g.lineStyle(1, 0x1b1f23, 1).strokeRoundedRect(left, y - 18, w, 18, 5);
    items.forEach((it, i) => {
      const ix = left + 6 + i * 26;
      if (it.kind === 'pack') g.fillStyle(0x7a4b25, 1).fillRoundedRect(ix, y - 14, 8, 10, 2).fillStyle(0xb67a3d, 1).fillRect(ix + 1, y - 12, 6, 2);
      else g.fillStyle(0x3f7f5a, 1).fillTriangle(ix, y - 4, ix + 4, y - 14, ix + 8, y - 4);
      const t = this.bubbleText[i];
      t?.setText(String(it.n)).setPosition(ix + 11, y - 14).setColor('#1b1f23').setStroke('#f4efe6', 0).setVisible(true);
    });
  }

  /**
   * Стрілка до мети: ціль на екрані — крапки від героя і гойдалка над ціллю; поза екраном — стрілка на краю в її бік.
   * `from` — герой, `to` — ціль (світові координати), `view` — видима частина світу.
   */
  drawGuide(from: { x: number; y: number }, to: { x: number; y: number } | null, view: Phaser.Geom.Rectangle, near: number, time: number): void {
    const g = this.guide.clear();
    this.guideMode = 'none';
    if (!to || Math.hypot(to.x - from.x, to.y - from.y) < near) return;
    const m = 14;
    const inside = to.x > view.x + m && to.x < view.right - m && to.y > view.y + m + 24 && to.y < view.bottom - m;
    g.fillStyle(0xffd54a, 1).lineStyle(1, 0x1b1f23, 1);
    if (inside) {
      this.guideMode = 'line';
      const d = Math.hypot(to.x - from.x, to.y - from.y);
      const n = Math.floor(d / 14);
      for (let i = 1; i < n; i++) {
        const k = (i * 14 + ((time / 40) % 14)) / d;
        if (k < 1) g.fillCircle(from.x + (to.x - from.x) * k, from.y - 10 + (to.y - from.y + 10) * k, 1.6);
      }
      const b = Math.abs(Math.sin(time / 260)) * 4;
      g.fillTriangle(to.x - 6, to.y - 52 - b, to.x + 6, to.y - 52 - b, to.x, to.y - 42 - b).strokeTriangle(to.x - 6, to.y - 52 - b, to.x + 6, to.y - 52 - b, to.x, to.y - 42 - b);
      return;
    }
    this.guideMode = 'edge';
    const cx = view.centerX;
    const cy = view.centerY;
    const dx = to.x - cx;
    const dy = to.y - cy;
    const k = Math.min((view.width / 2 - m) / Math.max(Math.abs(dx), 1e-6), (view.height / 2 - m - 24) / Math.max(Math.abs(dy), 1e-6), 1);
    const px = cx + dx * k;
    const py = cy + dy * k;
    const a = Math.atan2(dy, dx);
    const pt = (r: number, da: number): [number, number] => [px + Math.cos(a + da) * r, py + Math.sin(a + da) * r];
    const [x1, y1] = pt(9, 0);
    const [x2, y2] = pt(7, 2.5);
    const [x3, y3] = pt(7, -2.5);
    g.fillTriangle(x1, y1, x2, y2, x3, y3).strokeTriangle(x1, y1, x2, y2, x3, y3);
  }

  /** Сплив над героєм: «+1»/«OK» піднімається й гасне (≈0,6 с; рухає tick — без таймерів реального часу). */
  pop(x: number, y: number, text: string): void {
    this.pops++;
    this.floaters.push({ t: this.scene.add.text(x, y - 44, text, FONT).setOrigin(0.5, 1).setDepth(TOP), y0: y - 44, age: 0 });
  }

  /** Кадр: спливи пливуть угору й гаснуть за час гри (dt — секунди кадру). */
  tick(dt: number): void {
    for (const f of this.floaters) {
      f.age += dt;
      const k = Math.min(1, f.age / POP_S);
      f.t.setY(f.y0 - 20 * (1 - (1 - k) * (1 - k))).setAlpha(1 - k);
    }
    this.floaters = this.floaters.filter((f) => { if (f.age < POP_S) return true; f.t.destroy(); return false; });
  }

  destroy(): void {
    for (const f of this.floaters) f.t.destroy();
    for (const o of [this.ring, this.guide, this.pack, this.bubble, ...this.bubbleText]) o.destroy();
  }
}
