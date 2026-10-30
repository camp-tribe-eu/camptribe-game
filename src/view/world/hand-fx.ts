// GAME-190 · спільне для «справ руками» (дрова, вогнище): короткі ефекти, що рахуються кадрами гри (не таймером і не tween: сторож no-realtime), і шкала під ногами героя.
import Phaser from 'phaser';

export const TOP = 100_000;
export const HAND_FONT = { fontFamily: 'CampPixel, monospace', fontSize: '8px', color: '#f4f1e8', backgroundColor: '#1b1f23dd', padding: { x: 4, y: 3 }, wordWrap: { width: 150 }, align: 'center' } as const;

interface Fx { age: number; readonly dur: number; readonly apply: (k: number) => void; readonly end: () => void }

export class FrameFx {
  private list: Fx[] = [];
  constructor(private readonly scene: Phaser.Scene) {}
  push(dur: number, apply: (k: number) => void, end: () => void): void { this.list.push({ age: 0, dur, apply, end }); }
  update(dtMs: number): void {
    for (const f of this.list) { f.age += dtMs; f.apply(Math.min(1, f.age / f.dur)); }
    this.list = this.list.filter((f) => { if (f.age < f.dur) return true; f.end(); return false; });
  }
  clear(): void { for (const f of this.list) f.end(); this.list = []; }
  /** Розліт крапок за кутами (без випадковості), що гаснуть; `rise` — куди їх зносить угору (іскри — багато, тріски — мало). */
  burst(x: number, y: number, n: number, color: number, o: { r?: number; rise?: number; dur?: number; size?: number } = {}): void {
    const r = o.r ?? 14; const rise = o.rise ?? 4; const size = o.size ?? 3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.4;
      const p = this.scene.add.rectangle(x, y, size, size, color).setDepth(TOP - 1);
      this.push(o.dur ?? 360, (k) => { p.setPosition(x + Math.cos(a) * r * k, y + Math.sin(a) * r * 0.6 * k - rise * k * k * 4).setAlpha(1 - k); }, () => { p.destroy(); });
    }
  }
}

/** Шкала (зелена смуга + маркер `pos` 0..1) під ногами героя: ні HUD зверху, ні палець знизу її не закривають (знімки GAME-189). */
export function drawMeter(g: Phaser.GameObjects.Graphics, cx: number, top: number, band: { from: number; to: number }, pos: number): void {
  const w = 72; const x0 = cx - w / 2;
  g.fillStyle(0x1b1f23, 1).fillRect(x0 - 2, top - 2, w + 4, 12);
  g.fillStyle(0x4a5058, 1).fillRect(x0, top, w, 8);
  g.fillStyle(0x6fe07a, 1).fillRect(x0 + w * band.from, top, w * (band.to - band.from), 8);
  g.fillStyle(0xf4f1e8, 1).fillRect(x0 + w * pos - 1, top - 4, 3, 16);
}
