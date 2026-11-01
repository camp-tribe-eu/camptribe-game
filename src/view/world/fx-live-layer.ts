// GAME-206 · шар живих дрібниць світу: трава гнеться під ногами, пил з-під ніг на стежці, іскри вогнища, дим і погойдування авто.
// Математика — у fx-live.ts (чисті функції часу сцени й зерна); тут лише два об'єкти Graphics, які щокадру очищаються й малюються наново:
// жодних створених на кадр об'єктів, частинки обмежені CAP. prefers-reduced-motion (calmMotion): частинок і погойдування немає, трава стоїть.
import Phaser from 'phaser';
import { calmMotion } from '../../platform/motion';
import { CAP, DUST_IDLE, FX_PALETTE, carSway, dustLook, exhaustPuffs, fireSparks, grassBlades, leanTarget, stepDust, stepLean, type DustState, type Ground, type Pt } from './fx-live';

/** Що зараз на мапі (сцена знає, шар малює). */
export interface LiveFrame {
  readonly hero: Pt; readonly heading: Pt; readonly moving: boolean; readonly movedPx: number; readonly ground: Ground;
  /** Вогнище горить — центр кострища; ні — null. */
  readonly fire: Pt | null;
  /** Авто з увімкненим двигуном (дорога): низ-центр спрайта і куди дивиться вихлоп (−1 — ліворуч); ні — null. */
  readonly car: { readonly x: number; readonly y: number; readonly back: -1 | 1 } | null;
}
/** Скільки чого намальовано в кадрі (лише для e2e). */
export interface LiveProbe { sparks: number; dust: number; exhaust: number; blades: number; sway: boolean; calm: boolean }
export const LIVE_PROBE_IDLE: LiveProbe = { sparks: 0, dust: 0, exhaust: 0, blades: 0, sway: false, calm: false };

const SEED = 206;

export class LiveFx {
  /** Під декором і спрайтами (трава, пил — на землі), але над запеченою землею. */
  private readonly under: Phaser.GameObjects.Graphics;
  /** Над спрайтами світу, під нічною маскою (іскри, дим). */
  private readonly over: Phaser.GameObjects.Graphics;
  private dust: DustState = DUST_IDLE;
  private lean = 0;
  readonly calm: boolean;
  readonly probe: LiveProbe = { ...LIVE_PROBE_IDLE };

  constructor(scene: Phaser.Scene, underDepth: number, overDepth: number) {
    this.calm = calmMotion();
    this.probe.calm = this.calm;
    this.under = scene.add.graphics().setDepth(underDepth);
    this.over = scene.add.graphics().setDepth(overDepth);
  }

  /** Перехід на іншу мапу: пил і нахил трави з минулої не переносяться. */
  reset(): void { this.dust = DUST_IDLE; this.lean = 0; this.under.clear(); this.over.clear(); }

  /** Кадр. Повертає погойдування авто (сцена прикладає до спрайта сама), або null, коли двигун не працює чи рух гасять. */
  update(time: number, dtMs: number, f: LiveFrame): { dy: number; angle: number } | null {
    const u = this.under.clear(); const o = this.over.clear();
    const p = this.probe;
    p.sparks = p.dust = p.exhaust = p.blades = 0; p.sway = false;
    // Трава: стебла коло ніг гнуться від кроку й випростуються, коли герой став; у спокійному режимі — стоять рівно.
    if (f.ground === 'grass') {
      this.lean = this.calm ? 0 : stepLean(this.lean, leanTarget(f.heading, f.moving), dtMs);
      for (const b of grassBlades(this.calm ? 0 : time, this.lean, SEED)) {
        const x = f.hero.x + b.dx; const y = f.hero.y + 2 + b.dy;
        u.lineStyle(1, FX_PALETTE.grassDark, 1).lineBetween(x, y, x + b.tip * 0.5, y - b.h * 0.6);
        u.lineStyle(1, FX_PALETTE.grass, 1).lineBetween(x + b.tip * 0.5, y - b.h * 0.6, x + b.tip, y - b.h);
        p.blades++;
      }
    } else this.lean = 0;
    // Пил: лише на землі (стежка, пісок) і лише в русі; клубки живуть кадрами гри.
    this.dust = this.calm ? DUST_IDLE : stepDust(this.dust, { x: f.hero.x, y: f.hero.y, movedPx: f.moving ? f.movedPx : 0, ground: f.ground, dtMs });
    for (const d of this.dust.puffs) {
      const l = dustLook(d);
      u.fillStyle(d.seed % 2 === 0 ? FX_PALETTE.dust : FX_PALETTE.dustLight, l.alpha).fillCircle(d.x, d.y + l.dy, l.r);
      p.dust++;
    }
    if (this.calm) return null;
    // Іскри над вогнищем: піксель 2×2, гаряча серцевина → жар.
    const fire = f.fire;
    if (fire) {
      fireSparks(time, SEED).forEach((s, i) => {
        o.fillStyle(s.hot ? FX_PALETTE.sparkCore : i % 2 === 0 ? FX_PALETTE.spark : FX_PALETTE.ember, s.alpha).fillRect(fire.x + s.dx - 1, fire.y - 10 + s.dy - 1, 2, 2);
        p.sparks++;
      });
    }
    // Дим із вихлопу: м'які кола, що ростуть і тануть, позаду авто біля землі.
    if (f.car) {
      const ex = f.car.x + f.car.back * 30; const ey = f.car.y - 6;
      for (const e of exhaustPuffs(time, SEED, f.car.back)) { o.fillStyle(FX_PALETTE.smoke, e.alpha).fillCircle(ex + e.dx, ey + e.dy, e.r); p.exhaust++; }
      p.sway = true;
      return carSway(time);
    }
    return null;
  }

  destroy(): void { this.under.destroy(); this.over.destroy(); }
}

/** Скільки частинок щонайбільше може бути в кадрі (бюджет кадру: усе разом — менше за одну сотню примітивів). */
export const MAX_PRIMITIVES = CAP.sparks + CAP.dust + CAP.exhaust + CAP.blades * 2;
