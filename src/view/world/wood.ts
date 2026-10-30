// GAME-190 · дрова руками (OD-022): вигляд і відгук. Логіку (гілки, удари, шкала) веде чистий автомат content/wood-chop.ts; тут малюємо гілки на землі, ношу над
// головою, колоду й тріски. Анімацію удару (slash) героєві дає сцена (playAction). Стан показу: ядро й сейв його не знають.
import Phaser from 'phaser';
import { calmMotion } from '../../platform/motion';
import { playUi } from '../../audio/ui-sounds';
import { sfx } from '../../audio/sfx';
import { BAND, BRANCH_AT, BRANCHES, STRIKES, WOOD_IDLE, gotCount, markerAt, startWood, stepWood, woodTarget, type WoodEvent, type WoodInput, type WoodState } from '../../content/wood-chop';
import type { Key } from '../../i18n';
import { FrameFx, HAND_FONT, TOP, drawMeter, meterTop } from './hand-fx';

type Pt = { x: number; y: number };
export const BRANCH_SPOT = 'wood.branch.';

/** Видимий стан для e2e (лише читання). */
export interface WoodProbe { phase: WoodState['phase']; got: number; strikes: number; marker: number; inBand: boolean; branches: { x: number; y: number; got: boolean }[]; block: Pt }
export const WOOD_PROBE_IDLE: WoodProbe = { phase: 'idle', got: 0, strikes: 0, marker: 0, inBand: false, branches: [], block: { x: 0, y: 0 } };

export class WoodRig {
  private s: WoodState = WOOD_IDLE;
  private readonly fx: FrameFx;
  private block: Pt = { x: 0, y: 0 };
  private pts: Pt[] = [];
  private sticks: Phaser.GameObjects.Graphics[] = [];
  private stump: Phaser.GameObjects.Graphics | null = null;
  private carry: Phaser.GameObjects.Graphics | null = null;
  private meter: Phaser.GameObjects.Graphics | null = null;
  private hint: Phaser.GameObjects.Text | null = null;
  private needLeft = 0;
  /** GAME-193: поки герой рибалить, підказка дров мовчить (одне місце під ногами — одна справа). */
  muted = false;

  constructor(private readonly scene: Phaser.Scene, private readonly player: Phaser.GameObjects.Sprite, private readonly text: (key: Key) => string) { this.fx = new FrameFx(scene); }

  get phase(): WoodState['phase'] { return this.s.phase; }
  get active(): boolean { return this.s.phase === 'gather' || this.s.phase === 'chop'; }
  get chopping(): boolean { return this.s.phase === 'chop'; }
  /** Герой стоїть, поки рубає (поки збирає гілки — ходить вільно). */
  get holdsHero(): boolean { return this.s.phase === 'chop'; }

  begin(block: Pt): void {
    this.reset();
    this.block = block;
    this.s = startWood();
    this.pts = BRANCH_AT.map((b) => ({ x: block.x + b.dx, y: block.y + b.dy }));
    this.sticks = this.pts.map((p) => { const g = this.scene.add.graphics().setPosition(p.x, p.y).setDepth(p.y); drawStick(g, 0, 0, 0.3, 0xe0a458); return g; });
    this.stump = this.scene.add.graphics().setPosition(block.x, block.y).setDepth(block.y);
    this.drawStump(0);
    this.carry = this.scene.add.graphics();
    this.meter = this.scene.add.graphics().setDepth(TOP);
    this.hint = this.scene.add.text(0, 0, '', HAND_FONT).setOrigin(0.5, 0).setDepth(TOP + 1);
  }

  /** Дрова готові: усе намальоване зникає; фаза лишається `done`, доки справу не закрито (reset), щоб кадр між командою й новим станом ядра не почав усе заново. */
  finish(): void {
    this.clearVisuals();
    this.s = { ...this.s, phase: 'done' };
  }

  reset(): void {
    this.clearVisuals();
    this.s = WOOD_IDLE;
  }

  private clearVisuals(): void {
    this.fx.clear();
    for (const g of this.sticks) g.destroy();
    this.sticks = [];
    this.stump?.destroy(); this.stump = null;
    this.carry?.destroy(); this.carry = null;
    this.meter?.destroy(); this.meter = null;
    this.hint?.destroy(); this.hint = null;
  }

  /** Назва цілі для стрілки: гілка (`wood.branch.N`) чи колода (назва об'єкта мапи). */
  targetName(blockName: string): string {
    const t = woodTarget(this.s);
    return t?.kind === 'branch' ? `${BRANCH_SPOT}${t.i}` : blockName;
  }
  pointOf(name: string): Pt | null {
    if (!name.startsWith(BRANCH_SPOT)) return null;
    return this.pts[Number(name.slice(BRANCH_SPOT.length))] ?? null;
  }
  /** Найближча непідібрана гілка в зоні дії героя. */
  nearBranch(from: Pt, range: number): number | null {
    let best: number | null = null; let bd = range;
    this.pts.forEach((p, i) => { const d = Math.hypot(p.x - from.x, p.y - from.y); if (!this.s.got[i] && d <= bd) { best = i; bd = d; } });
    return best;
  }
  atBlock(from: Pt, range: number): boolean { return Math.hypot(this.block.x - from.x, this.block.y - from.y) <= range; }
  blockPoint(): Pt { return this.block; }

  probe(): WoodProbe {
    const m = markerAt(this.s.t);
    return { phase: this.s.phase, got: gotCount(this.s), strikes: this.s.strikes, marker: m, inBand: m >= BAND.from && m <= BAND.to, branches: this.pts.map((p, i) => ({ x: p.x, y: p.y, got: !!this.s.got[i] })), block: this.block };
  }

  private feed(i: WoodInput): WoodEvent {
    const r = stepWood(this.s, i);
    this.s = r.state;
    return r.event;
  }

  update(dtMs: number): void {
    this.fx.update(dtMs);
    this.needLeft = Math.max(0, this.needLeft - dtMs);
    if (!this.active) return;
    this.feed({ kind: 'tick', dtMs: Math.min(dtMs, 100) });
    this.draw();
  }

  /** Дія гравця (E / кнопка / тап). Повертає подію; `done` — час віддати ядру команду. */
  act(branch: number | null, atBlock: boolean): WoodEvent {
    if (!this.active) return 'none';
    const e = this.feed({ kind: 'act', branch, atBlock });
    const g = branch !== null ? this.sticks[branch] : undefined;
    switch (e) {
      case 'picked': sfx('branch'); playUi('press'); if (g) { this.fx.burst(g.x, g.y, 4, 0xcdbfa0, { r: 8, rise: 2 }); g.setVisible(false); } break;
      case 'need': playUi('back'); this.needLeft = 1800; break;
      case 'chopStart': playUi('confirm'); this.drawStump(BRANCHES); break;
      case 'hit': case 'done': this.chip(e === 'done'); sfx('chop'); playUi(e === 'done' ? 'confirm' : 'press'); this.drawStump(BRANCHES - this.s.strikes); break;
      case 'miss': playUi('back'); this.fx.burst(this.block.x, this.block.y - 6, 3, 0xcdbfa0, { r: 8 }); break;
      default: break;
    }
    return e;
  }

  /** Тріски й легкий струс камери на влучний удар. */
  private chip(last: boolean): void {
    this.fx.burst(this.block.x, this.block.y - 8, last ? 12 : 7, 0xd9a860, { r: last ? 22 : 16, rise: 6, size: 2 });
    if (!calmMotion()) this.scene.cameras.main.shake(last ? 140 : 80, last ? 0.004 : 0.0025);
  }

  private drawStump(logs: number): void {
    const g = this.stump;
    if (!g) return;
    g.clear();
    g.fillStyle(0x1b1f23, 0.35).fillEllipse(0, 2, 26, 8);
    g.fillStyle(0x6b4423, 1).fillRect(-9, -10, 18, 12);
    g.fillStyle(0xb98852, 1).fillEllipse(0, -10, 18, 8);
    g.lineStyle(1, 0x7a5430, 1).strokeEllipse(0, -10, 10, 4);
    for (let i = 0; i < logs; i++) drawStick(g, -6 + i * 6, -14 - (i % 2), 1.45, 0xc98f4a);
  }

  private draw(): void {
    const carry = this.carry; const meter = this.meter; const hint = this.hint;
    if (!carry || !meter || !hint) return;
    const n = this.s.phase === 'gather' ? gotCount(this.s) : 0;
    carry.clear();
    // Ноша над головою: стопка гілок (їх видно з будь-якого боку).
    for (let i = 0; i < n; i++) drawStick(carry, this.player.x - 5 + i * 5, this.player.y - 46 - i * 2, 0.15, 0xe0a458);
    carry.setDepth(this.player.y + 1);
    meter.clear();
    const cx = this.player.x; const top = meterTop(this.scene, this.player);
    let msg: string;
    if (this.s.phase === 'chop') {
      drawMeter(meter, cx, top, BAND, markerAt(this.s.t));
      msg = `${this.text('wood.chop')} ${Math.min(this.s.strikes + 1, STRIKES)}/${STRIKES}`;
    } else msg = this.needLeft > 0 ? this.text('wood.need') : gotCount(this.s) >= BRANCHES ? this.text('wood.bring') : `${this.text('wood.pick')} ${gotCount(this.s)}/${BRANCHES}`;
    if (hint.text !== msg) hint.setText(msg);
    hint.setVisible(!this.muted).setPosition(cx, this.s.phase === 'chop' ? top + 14 : top - 2);
  }
}

/** Гілка: тонкий брусок із вузликом; `tilt` — нахил (рад). */
function drawStick(g: Phaser.GameObjects.Graphics, x: number, y: number, tilt: number, color: number): void {
  const c = Math.cos(tilt); const s = Math.sin(tilt);
  const a = { x: x - 8 * c, y: y - 8 * s }; const b = { x: x + 8 * c, y: y + 8 * s };
  g.lineStyle(3, 0x5a3a1c, 1).lineBetween(a.x, a.y + 1, b.x, b.y + 1);
  g.lineStyle(2, color, 1).lineBetween(a.x, a.y, b.x, b.y);
  g.fillStyle(0x5a3a1c, 1).fillRect(x + 2, y - 3, 2, 3);
}
