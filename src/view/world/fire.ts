// GAME-190 · вогнище руками (OD-022): вигляд і відгук. Логіку (поліна, шкала сірника, полум'я) веде чистий автомат content/campfire-light.ts; тут малюємо холодне
// кострище, поліна, шкалу під ногами героя, іскри й полум'я, що росте (спрайт вогнища, який сцена ховає до запалу). Анімацію «cast» героєві дає сцена (playAction).
import Phaser from 'phaser';
import { calmMotion } from '../../platform/motion';
import { playUi } from '../../audio/ui-sounds';
import { BAND, FIRE_IDLE, GROW_MS, LOGS, chargeAt, startFire, stepFire, type FireEvent, type FireInput, type FireState } from '../../content/campfire-light';
import type { Key } from '../../i18n';
import { FrameFx, HAND_FONT, TOP, drawMeter, meterTop } from './hand-fx';

type Pt = { x: number; y: number };

/** Видимий стан для e2e (лише читання). */
export interface FireProbe { phase: FireState['phase']; logs: number; charge: number; inBand: boolean; holding: boolean; fizzles: number; x: number; y: number }
export const FIRE_PROBE_IDLE: FireProbe = { phase: 'idle', logs: 0, charge: 0, inBand: false, holding: false, fizzles: 0, x: 0, y: 0 };

export class FireRig {
  private s: FireState = FIRE_IDLE;
  private readonly fx: FrameFx;
  private at: Pt = { x: 0, y: 0 };
  private flame: Phaser.GameObjects.Sprite | null = null;
  private pit: Phaser.GameObjects.Graphics | null = null;
  private meter: Phaser.GameObjects.Graphics | null = null;
  private hint: Phaser.GameObjects.Text | null = null;

  constructor(private readonly scene: Phaser.Scene, private readonly player: Phaser.GameObjects.Sprite, private readonly text: (key: Key) => string) { this.fx = new FrameFx(scene); }

  get phase(): FireState['phase'] { return this.s.phase; }
  /** Кострище чекає на вогонь: полум'я ще не горить (сцена тримає спрайт сховану). */
  get cold(): boolean { return this.s.phase === 'stack' || this.s.phase === 'match'; }
  get stacking(): boolean { return this.s.phase === 'stack'; }
  get matching(): boolean { return this.s.phase === 'match'; }
  /** Герой стоїть, поки тримає сірник (відпустив — може піти). */
  get holdsHero(): boolean { return this.s.phase === 'match' && (this.s.holding || this.s.lock); }
  get lit(): boolean { return this.s.phase === 'lit'; }
  point(): Pt { return this.at; }
  near(from: Pt, range: number): boolean { return Math.hypot(this.at.x - from.x, this.at.y - from.y) <= range; }

  /** `flame` — спрайт вогнища мапи (рig його ховає й показує); `at` — центр кострища. */
  begin(at: Pt, flame: Phaser.GameObjects.Sprite | null): void {
    this.reset();
    this.at = at; this.flame = flame;
    this.s = startFire();
    flame?.setVisible(false);
    this.pit = this.scene.add.graphics().setPosition(at.x, at.y).setDepth(at.y);
    this.meter = this.scene.add.graphics().setDepth(TOP);
    this.hint = this.scene.add.text(0, 0, '', HAND_FONT).setOrigin(0.5, 0).setDepth(TOP + 1);
    this.drawPit();
  }

  /** Полум'я догорає до повного: кострище-малюнок зникає, спрайт показано, фаза лишається `done` до reset (кадр між командою й станом ядра). */
  finish(): void {
    this.clearVisuals();
    this.flame?.setVisible(true).setScale(1).setAlpha(1);
    this.s = { ...this.s, phase: 'done' };
  }

  reset(): void {
    this.clearVisuals();
    this.flame?.setVisible(true).setScale(1).setAlpha(1);
    this.flame = null;
    this.s = FIRE_IDLE;
  }

  private clearVisuals(): void {
    this.fx.clear();
    this.pit?.destroy(); this.pit = null;
    this.meter?.destroy(); this.meter = null;
    this.hint?.destroy(); this.hint = null;
  }

  probe(): FireProbe {
    const c = chargeAt(this.s.t);
    return { phase: this.s.phase, logs: this.s.logs, charge: c, inBand: c >= BAND.from && c <= BAND.to, holding: this.s.holding, fizzles: this.s.fizzles, x: this.at.x, y: this.at.y };
  }

  private feed(i: FireInput): FireEvent {
    const r = stepFire(this.s, i);
    this.s = r.state;
    return r.event;
  }

  /** Кадр: `down` — гравець тримає дію біля вогнища. Повертає події кадру (запал, згасання, `done`). */
  update(dtMs: number, down: boolean, time: number): FireEvent[] {
    this.fx.update(dtMs);
    if (this.s.phase === 'idle' || this.s.phase === 'done') return [];
    const out: FireEvent[] = [];
    const dt = Math.min(dtMs, 100);
    const h = this.feed({ kind: 'hold', down });
    if (h !== 'none') out.push(h);
    const t = this.feed({ kind: 'tick', dtMs: dt });
    if (t !== 'none') out.push(t);
    for (const e of out) this.react(e);
    this.draw(time);
    return out;
  }

  /** Дія гравця (E / кнопка) — поклав полінце. */
  act(): FireEvent {
    const e = this.feed({ kind: 'act' });
    if (e === 'log' || e === 'stacked') { playUi(e === 'stacked' ? 'confirm' : 'press'); this.fx.burst(this.at.x, this.at.y - 2, 4, 0xcdbfa0, { r: 8, rise: 2 }); this.drawPit(); }
    return e;
  }

  private react(e: FireEvent): void {
    const x = this.at.x; const y = this.at.y;
    switch (e) {
      case 'strike': playUi('press'); break;
      case 'lit':
        playUi('confirm');
        this.fx.burst(x, y - 6, 14, 0xffc94a, { r: 26, rise: 14, dur: 700, size: 2 });
        if (!calmMotion()) this.scene.cameras.main.shake(100, 0.002);
        break;
      case 'fizzle': playUi('back'); this.fx.burst(x, y - 8, 5, 0x9a9a9a, { r: 10, rise: 10, dur: 600, size: 3 }); break;
      case 'done': break;
      default: break;
    }
  }

  private drawPit(): void {
    const g = this.pit;
    if (!g) return;
    g.clear();
    g.fillStyle(0x1b1f23, 0.35).fillEllipse(0, 2, 34, 12);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.fillStyle(0x8b8f94, 1).fillRect(Math.cos(a) * 14 - 2, Math.sin(a) * 5 - 2 - 2, 4, 4); }
    for (let i = 0; i < this.s.logs; i++) { const a = -0.5 + i * 0.5; drawLog(g, Math.cos(a * 2) * 4, -4 - i * 2, a); }
  }

  private draw(time: number): void {
    const meter = this.meter; const hint = this.hint;
    if (!meter || !hint) return;
    meter.clear();
    const flame = this.flame;
    if (this.s.phase === 'lit' && flame) {
      const k = Math.min(1, this.s.grow / GROW_MS);
      flame.setVisible(true).setScale(0.35 + 0.65 * k).setAlpha(0.6 + 0.4 * k);
    }
    const cx = this.player.x; const top = meterTop(this.scene, this.player);
    const here = this.near({ x: cx, y: this.player.y }, 96);
    let msg = '';
    if (this.s.phase === 'stack') msg = here ? `${this.text('fire.stack')} ${this.s.logs}/${LOGS}` : '';
    else if (this.s.phase === 'match' && here) {
      drawMeter(meter, cx, top, BAND, chargeAt(this.s.t));
      msg = this.s.fizzles > 0 && !this.s.holding ? this.text('fire.fizzle') : this.text('fire.match');
      if (this.s.holding) { const f = Math.sin(time / 60); meter.fillStyle(0xffc94a, 1).fillRect(cx - 1 + f, top - 12, 3, 5); }
    }
    if (hint.text !== msg) hint.setText(msg);
    hint.setVisible(msg !== '').setPosition(cx, top + 14);
  }
}

function drawLog(g: Phaser.GameObjects.Graphics, x: number, y: number, tilt: number): void {
  const c = Math.cos(tilt); const s = Math.sin(tilt);
  g.lineStyle(4, 0x5a3a1c, 1).lineBetween(x - 9 * c, y - 9 * s * 0.4, x + 9 * c, y + 9 * s * 0.4);
  g.lineStyle(2, 0xc98f4a, 1).lineBetween(x - 9 * c, y - 9 * s * 0.4 - 1, x + 9 * c, y + 9 * s * 0.4 - 1);
}
