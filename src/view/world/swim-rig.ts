// GAME-227 · купання: вигляд і звук. Логіка — чисті функції swim.ts; тут лише Phaser: другий спрайт героя (той самий лист, обрізаний до голови й плечей — нових
// малюнків нема), кола й краплі через Graphics (fx-live), мокрі краплі на землі. Усе покадрово від часу сцени й dt: без tween і таймерів.
import Phaser from 'phaser';
import { playSwim, swimSounds } from '../../audio/swim-sounds';
import { calmMotion } from '../../platform/motion';
import { FRAME, frameIndex, type Dir } from './character';
import { FX_PALETTE, type Pt } from './fx-live';
import {
  STROKE_MS, VISIBLE_ROWS, WATERLINE_ABOVE_FEET, WET_IDLE, burstDrops, newBurst, petOnWater, speedFactor, stateAt, stepBurst, stepWet, swimBob, swimCol, swimRings, transition, wetLook,
  type Burst, type SwimGrid, type SwimState, type WetState,
} from './swim';

/** Що бачить e2e (лише читання). */
export interface SwimProbe {
  state: SwimState; hidden: boolean; rows: number; bob: number; rings: number; drops: number; wetMarks: number; wetLeftMs: number; steps: number;
  /** Скільки спрайтів Мії стоять на воді (мусить бути 0). */
  petsWet: number; sounds: string[]; enters: number; exits: number; speed: number;
}
export const SWIM_PROBE_IDLE: SwimProbe = { state: 'land', hidden: false, rows: 64, bob: 0, rings: 0, drops: 0, wetMarks: 0, wetLeftMs: 0, steps: 0, petsWet: 0, sounds: [], enters: 0, exits: 0, speed: 1 };

export class SwimRig {
  private grid: SwimGrid | null = null;
  private tile = 32;
  private readonly swimmer: Phaser.GameObjects.Sprite;
  private readonly fx: Phaser.GameObjects.Graphics;
  private readonly wetG: Phaser.GameObjects.Graphics;
  private st: SwimState = 'land';
  private burst: Burst | null = null;
  private bursts = 0;
  private wet: WetState = WET_IDLE;
  private wasMoving = false;
  private wasFacing: Dir = 'down';
  private strokeMs = 0;
  private enters = 0; private exits = 0;
  readonly calm = calmMotion();
  /** Остання точка на суші: родина чекає тут, поки герой у воді. */
  lastLand: Pt = { x: 0, y: 0 };
  readonly probe: SwimProbe = { ...SWIM_PROBE_IDLE };

  constructor(scene: Phaser.Scene, private readonly player: Phaser.GameObjects.Sprite, wetDepth: number) {
    this.swimmer = scene.add.sprite(0, 0, 'player', 0).setOrigin(0.5, 0.9).setVisible(false);
    this.fx = scene.add.graphics();
    this.wetG = scene.add.graphics().setDepth(wetDepth);
  }

  get state(): SwimState { return this.st; }
  get inWater(): boolean { return this.st !== 'land'; }

  /** Нова мапа: сітка плавання (null — на цій мапі води для купання нема). */
  begin(grid: SwimGrid | null, tile: number): void {
    this.grid = grid; this.tile = tile; this.st = 'land'; this.burst = null; this.wet = WET_IDLE; this.strokeMs = 0;
    this.swimmer.setVisible(false); this.player.setVisible(true); this.fx.clear(); this.wetG.clear();
  }

  /** Кадр. Повертає множник швидкості героя. `facing` — куди дивиться, `moving` — зсунувся цього кадру, `pets` — точки Мії (для зонда: на воді їх нема). */
  update(time: number, dtMs: number, f: { moving: boolean; movedPx: number; facing: Dir; pets: readonly Pt[] }): number {
    const p = this.probe; const g = this.grid;
    const x = this.player.x; const y = this.player.y;
    const next: SwimState = g ? stateAt(g, x, y, this.tile) : 'land';
    const tr = transition(this.st, next);
    this.st = next;
    if (next === 'land') this.lastLand = { x, y };
    if (tr === 'enter') { playSwim('enter'); this.enters++; if (!this.calm) this.burst = newBurst(++this.bursts); }
    if (tr === 'exit') { playSwim('exit'); this.exits++; }
    // Краплі «старт чи поворот» у глибині.
    if (next === 'swim' && !this.calm && tr === null && ((f.moving && !this.wasMoving) || (f.facing !== this.wasFacing))) this.burst = newBurst(++this.bursts);
    this.wasMoving = f.moving; this.wasFacing = f.facing;
    this.burst = stepBurst(this.burst, dtMs);
    this.strokeMs = next === 'swim' && f.moving ? this.strokeMs + dtMs : 0;
    if (this.strokeMs >= STROKE_MS) { this.strokeMs -= STROKE_MS; playSwim('swim'); }
    const w = stepWet(this.wet, { x, y, movedPx: f.movedPx, dtMs, landed: tr === 'exit', onLand: next === 'land' });
    this.wet = w.state;
    if (w.stepped) playSwim('wet');
    this.draw(time, next, x, y, f);
    p.state = next; p.wetLeftMs = this.wet.left; p.wetMarks = this.wet.marks.length; p.steps = this.wet.steps; p.enters = this.enters; p.exits = this.exits;
    p.sounds = swimSounds.played.slice(-8); p.speed = speedFactor(next);
    p.petsWet = g ? f.pets.filter((q) => petOnWater(g, q.x, q.y, this.tile)).length : 0;
    return speedFactor(next);
  }

  private draw(time: number, st: SwimState, x: number, y: number, f: { moving: boolean }): void {
    const p = this.probe;
    this.fx.clear(); this.wetG.clear();
    p.rings = 0; p.drops = 0; p.bob = 0;
    for (const m of this.wet.marks) { const l = wetLook(m); this.wetG.fillStyle(FX_PALETTE.water, l.alpha).fillEllipse(m.x, m.y, l.rx * 2, l.ry * 2); }
    const water = st !== 'land';
    p.hidden = water; p.rows = VISIBLE_ROWS[st];
    this.player.setVisible(!water);
    this.swimmer.setVisible(water);
    if (!water) return;
    const bob = st === 'swim' && !this.calm ? swimBob(time) : 0;
    p.bob = bob;
    this.swimmer.setPosition(x, y + bob).setDepth(y);
    if (st === 'swim') this.swimmer.setTexture('player', frameIndex(this.wasFacing, swimCol(time, f.moving && !this.calm)));
    else this.swimmer.setTexture(this.player.texture.key, this.player.frame.name);
    this.swimmer.setCrop(0, 0, FRAME, VISIBLE_ROWS[st]);
    this.fx.setDepth(y + 1);
    const wy = y + bob - WATERLINE_ABOVE_FEET[st];
    const k = st === 'swim' ? 1 : 0.55;
    if (this.calm) return;
    for (const r of swimRings(time, f.moving)) {
      this.fx.lineStyle(1, FX_PALETTE.foam, r.alpha).strokeEllipse(x, wy, r.r * 2.4 * k, r.r * 1.1 * k);
      p.rings++;
    }
    for (const d of burstDrops(this.burst)) {
      this.fx.fillStyle(FX_PALETTE.water, d.alpha).fillRect(Math.round(x + d.dx), Math.round(wy + d.dy), 2, 2);
      p.drops++;
    }
  }

  destroy(): void { this.swimmer.destroy(); this.fx.destroy(); this.wetG.destroy(); }
}
