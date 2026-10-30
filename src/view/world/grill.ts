// GAME-195 · рибка на вогнищі руками (OD-023): вигляд і відгук. Логіку (нанизати, жар, підгоряння) веде чистий автомат content/fish-grill.ts;
// тут малюємо патичок із рибкою над вогнем, шкалу жару («не спали») під героєм, пар і дим. Анімацію героя дає сцена.
import Phaser from 'phaser';
import { playUi } from '../../audio/ui-sounds';
import { GRILL_IDLE, SAFE, charred, startGrill, stepGrill, type GrillEvent, type GrillInput, type GrillState } from '../../content/fish-grill';
import type { Key } from '../../i18n';
import { FrameFx, HAND_FONT, TOP, drawMeter, meterTop } from './hand-fx';

type Pt = { x: number; y: number };

/** Видимий стан для e2e (лише читання). */
export interface GrillProbe { phase: GrillState['phase']; heat: number; cook: number; holding: boolean; chars: number; charred: boolean }
export const GRILL_PROBE_IDLE: GrillProbe = { phase: 'idle', heat: 0, cook: 0, holding: false, chars: 0, charred: false };

export class GrillRig {
  private s: GrillState = GRILL_IDLE;
  private readonly fx: FrameFx;
  private at: Pt = { x: 0, y: 0 };
  private g: Phaser.GameObjects.Graphics | null = null;
  private meter: Phaser.GameObjects.Graphics | null = null;
  private hint: Phaser.GameObjects.Text | null = null;
  private msg = 0;
  private note: Key | null = null;

  constructor(private readonly scene: Phaser.Scene, private readonly player: Phaser.GameObjects.Sprite, private readonly text: (key: Key) => string) { this.fx = new FrameFx(scene); }

  get phase(): GrillState['phase'] { return this.s.phase; }
  get active(): boolean { return this.s.phase === 'skewer' || this.s.phase === 'grill'; }
  get skewering(): boolean { return this.s.phase === 'skewer'; }
  get finished(): boolean { return this.s.phase === 'done'; }
  /** Рибка підгоріла (хоч раз жар дійшов до краю). */
  get charred(): boolean { return charred(this.s); }
  /** Герой стоїть біля вогню, поки смажить. */
  get holdsHero(): boolean { return this.active; }
  point(): Pt { return this.at; }
  near(from: Pt, range: number): boolean { return Math.hypot(this.at.x - from.x, this.at.y - from.y) <= range; }

  begin(at: Pt): void {
    this.reset();
    this.at = at; this.s = startGrill();
    this.g = this.scene.add.graphics().setDepth(TOP - 2);
    this.meter = this.scene.add.graphics().setDepth(TOP);
    this.hint = this.scene.add.text(0, 0, '', HAND_FONT).setOrigin(0.5, 0).setDepth(TOP + 1);
  }

  /** Рибка готова: малюнок зникає, фаза лишається `done` до reset. */
  finish(): void { this.clearVisuals(); this.s = { ...this.s, phase: 'done' }; }

  reset(): void { this.clearVisuals(); this.s = GRILL_IDLE; this.msg = 0; this.note = null; }

  private clearVisuals(): void {
    this.fx.clear();
    this.g?.destroy(); this.g = null;
    this.meter?.destroy(); this.meter = null;
    this.hint?.destroy(); this.hint = null;
  }

  probe(): GrillProbe { return { phase: this.s.phase, heat: this.s.heat, cook: this.s.cook, holding: this.s.holding, chars: this.s.chars, charred: charred(this.s) }; }

  private feed(i: GrillInput): GrillEvent {
    const r = stepGrill(this.s, i);
    this.s = r.state;
    return r.event;
  }

  /** Кадр: `down` — гравець тримає дію біля вогнища. Повертає події кадру (підгоріло, `done`). */
  update(dtMs: number, down: boolean, time: number): GrillEvent[] {
    this.fx.update(dtMs);
    if (this.msg > 0) this.msg = Math.max(0, this.msg - dtMs);
    if (!this.active) return [];
    const out: GrillEvent[] = [];
    this.feed({ kind: 'hold', down });
    const t = this.feed({ kind: 'tick', dtMs: Math.min(dtMs, 100) });
    if (t !== 'none') out.push(t);
    for (const e of out) this.react(e);
    this.draw(time);
    return out;
  }

  /** Дія гравця (E / кнопка) — нанизав рибку. */
  act(): GrillEvent {
    const e = this.feed({ kind: 'act' });
    if (e === 'skewer') { playUi('confirm'); this.fx.burst(this.at.x, this.at.y - 16, 5, 0xdff3ff, { r: 10, rise: 4 }); }
    return e;
  }

  private react(e: GrillEvent): void {
    const x = this.at.x; const y = this.at.y;
    if (e === 'char') { playUi('back'); this.note = 'grill.char'; this.msg = 1800; this.fx.burst(x, y - 14, 6, 0x4a4a4a, { r: 12, rise: 14, dur: 600, size: 3 }); }
    if (e === 'done') { playUi('confirm'); this.fx.burst(x, y - 16, 10, 0xffe58a, { r: 22, rise: 10, dur: 700, size: 2 }); }
  }

  private draw(time: number): void {
    const g = this.g; const meter = this.meter; const hint = this.hint;
    if (!g || !meter || !hint) return;
    g.clear(); meter.clear();
    const s = this.s;
    const lift = s.holding ? 14 : 0;
    const bob = Math.sin(time / 120) * (s.holding ? 0.5 : 1);
    const { x, y } = this.at;
    g.lineStyle(2, 0x7a5a2e, 1).lineBetween(x - 22, y - 12 - lift, x + 22, y - 18 - lift + bob);
    const k = s.cook;   // сира → золотава → темна
    const col = s.chars > 0 && s.heat > 0.7 ? 0x3b2f26 : k < 0.4 ? 0xb9c7cf : k < 0.8 ? 0xd9a24a : 0xb0722f;
    g.fillStyle(col, 1).fillEllipse(x, y - 16 - lift + bob, 18, 7).fillTriangle(x + 8, y - 16 - lift + bob, x + 15, y - 21 - lift + bob, x + 15, y - 11 - lift + bob);
    const cx = this.player.x; const top = meterTop(this.scene, this.player);
    let msg = '';
    if (s.phase === 'skewer') msg = this.text('grill.skewer');
    else if (s.phase === 'grill') {
      drawMeter(meter, cx, top, SAFE, s.heat);
      msg = this.msg > 0 && this.note ? this.text(this.note) : this.text('grill.hold');
    }
    if (hint.text !== msg) hint.setText(msg);
    hint.setVisible(msg !== '').setPosition(cx, top + 14);
  }
}
