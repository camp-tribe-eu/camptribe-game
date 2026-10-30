// GAME-189 · намет руками (OD-022): вигляд і відгук. Логіку (місце, шкала, кілки) веде чистий автомат content/tent-pitch.ts; тут лише малюємо його стан,
// рухаємо героя «ударом» (стиснення + нахил до кілка; лист удару GAME-191 ще не намальований), пил, звук і струс камери. Стан показу: ядро й сейв його не знають.
import Phaser from 'phaser';
import { calmMotion } from '../../platform/motion';
import { playUi } from '../../audio/ui-sounds';
import { PEGS, BAND, FOOT, IDLE, WOBBLE_MS, markerAt, placeOk, startTent, stepTent, type TentEvent, type TentInput, type TentState } from '../../content/tent-pitch';
import type { Key } from '../../i18n';
import type { Dir } from './character';

type Pt = { x: number; y: number };
const REACH = 28;
const OFF: Readonly<Record<Dir, Pt>> = { up: { x: 0, y: -REACH }, down: { x: 0, y: REACH }, left: { x: -REACH, y: 0 }, right: { x: REACH, y: 0 } };
/** Кути підошви, у порядку забивання. */
const CORNERS: readonly Pt[] = [{ x: -FOOT.w / 2 + 3, y: -FOOT.h / 2 + 3 }, { x: FOOT.w / 2 - 3, y: -FOOT.h / 2 + 3 }, { x: FOOT.w / 2 - 3, y: FOOT.h / 2 - 3 }, { x: -FOOT.w / 2 + 3, y: FOOT.h / 2 - 3 }];
const TOP = 100_000;
const FONT = { fontFamily: 'CampPixel, monospace', fontSize: '8px', color: '#f4f1e8', backgroundColor: '#1b1f23dd', padding: { x: 4, y: 3 }, wordWrap: { width: 150 }, align: 'center' } as const;

/** Видимий стан для e2e (лише читання). */
export interface TentProbe { phase: TentState['phase']; pegs: number; marker: number; inBand: boolean; placeOk: boolean; x: number; y: number }
export const TENT_PROBE_IDLE: TentProbe = { phase: 'idle', pegs: 0, marker: 0, inBand: false, placeOk: false, x: 0, y: 0 };

/** Короткий ефект, що рахується кадрами гри (не таймером і не tween: сторож no-realtime): k 0..1 за `dur` мс. */
interface Fx { age: number; readonly dur: number; readonly apply: (k: number) => void; readonly end: () => void }

export class TentRig {
  private fx: Fx[] = [];
  private s: TentState = IDLE;
  private at: Pt = { x: 0, y: 0 };
  private ok = false;
  private wobbleLeft = 0;
  private g: Phaser.GameObjects.Graphics | null = null;
  private meter: Phaser.GameObjects.Graphics | null = null;
  private hint: Phaser.GameObjects.Text | null = null;
  private spot: Pt = { x: 0, y: 0 };
  private solidAt: (x: number, y: number) => boolean = () => false;
  private others: readonly Pt[] = [];

  constructor(private readonly scene: Phaser.Scene, private readonly player: Phaser.GameObjects.Sprite, private readonly text: (key: Key) => string) {}

  get active(): boolean { return this.s.phase === 'place' || this.s.phase === 'peg'; }
  /** Герой стоїть, поки б'є кілки (у фазі розміщення ходить вільно: привид іде за ним). */
  get holdsHero(): boolean { return this.s.phase === 'peg'; }
  get phase(): TentState['phase'] { return this.s.phase; }

  begin(spot: Pt, solidAt: (x: number, y: number) => boolean, others: readonly Pt[]): void {
    this.reset();
    this.spot = spot; this.solidAt = solidAt; this.others = others;
    this.s = startTent();
    this.g = this.scene.add.graphics();
    this.meter = this.scene.add.graphics().setDepth(TOP);
    this.hint = this.scene.add.text(0, 0, '', FONT).setOrigin(0.5, 1).setDepth(TOP + 1);
  }

  /** Четвертий кілок забито: лишається готовий намет, шкала й підказка зникають. */
  finish(): void {
    if (this.g) { this.g.clear(); this.g.setAngle(0).setDepth(this.at.y - 8); drawTent(this.g, PEGS, null, 1, PEGS, -1, 0); }
    this.reset(true);
  }

  /** Прибрати все намальоване (кінець мапи, справу закрито іншим шляхом); готовий намет `keepTent` лишається на мапі до її зміни. */
  reset(keepTent = false): void {
    if (!keepTent) { for (const f of this.fx) f.end(); this.fx = []; }
    this.meter?.destroy(); this.meter = null;
    this.hint?.destroy(); this.hint = null;
    if (!keepTent) { this.g?.destroy(); this.g = null; }
    this.s = IDLE;
  }

  probe(): TentProbe {
    const m = markerAt(this.s.t);
    return { phase: this.s.phase, pegs: this.s.pegs, marker: m, inBand: m >= BAND.from && m <= BAND.to, placeOk: this.ok, x: this.at.x, y: this.at.y };
  }

  private feed(i: TentInput): TentEvent {
    const r = stepTent(this.s, i);
    this.s = r.state;
    return r.event;
  }

  /** Кадр: привид іде за героєм (до розміщення), шкала рухається, малюємо. */
  update(dtMs: number, facing: Dir, time: number): void {
    for (const f of this.fx) { f.age += dtMs; f.apply(Math.min(1, f.age / f.dur)); }
    this.fx = this.fx.filter((f) => { if (f.age < f.dur) return true; f.end(); return false; });
    if (!this.active || !this.g) { this.wobbleLeft = 0; return; }
    if (this.s.phase === 'place') {
      const o = OFF[facing];
      // Привид — перед героєм; не вміщається там — пробуємо під ним, на півкроку, а тоді на самій позначці й півнамету вище (у табору стіна
      // одразу під позначкою: стоячи на ній лицем униз привид був червоний — рецензія #117). Без вимоги піксельної точності.
      const tries: Pt[] = [{ x: this.player.x + o.x, y: this.player.y + o.y }, { x: this.player.x + o.x / 2, y: this.player.y + o.y / 2 }, { x: this.player.x, y: this.player.y }, this.spot, { x: this.spot.x, y: this.spot.y - FOOT.h / 2 }].map((q) => ({ x: Math.round(q.x), y: Math.round(q.y) }));
      const good = tries.find((q) => placeOk(q, this.spot, this.solidAt, this.others));
      this.at = good ?? (tries[0] as Pt);
      this.ok = good !== undefined;
    }
    this.feed({ kind: 'tick', dtMs: Math.min(dtMs, 100) });
    this.wobbleLeft = Math.max(0, this.wobbleLeft - dtMs);
    this.draw(time);
  }

  /** Дія гравця (E / кнопка / тап). Повертає подію; `done` — час віддати ядру команду справи. */
  act(facing: Dir): TentEvent {
    if (!this.active) return 'none';
    const placing = this.s.phase === 'place';
    const e = this.feed({ kind: 'act', placeOk: this.ok });
    const peg = CORNERS[Math.min(this.s.pegs - (e === 'hit' || e === 'done' ? 1 : 0), PEGS - 1)] as Pt;
    switch (e) {
      case 'placed': playUi('confirm'); this.dust(this.at.x, this.at.y + 8, 5); break;
      case 'blocked': playUi('back'); this.shake(this.g, 3); break;
      case 'hit': case 'done': this.strike(peg, facing); playUi(e === 'done' ? 'confirm' : 'press'); if (e === 'done') this.dust(this.at.x, this.at.y, 8); break;
      case 'miss': playUi('back'); this.wobbleLeft = WOBBLE_MS; this.shake(this.g, 4); break;
      default: break;
    }
    if (placing && e === 'placed') this.g?.setDepth(this.at.y - 8);
    return e;
  }

  private strike(peg: Pt, facing: Dir): void {
    const px = this.at.x + peg.x; const py = this.at.y + peg.y;
    this.dust(px, py, 6);
    if (!calmMotion()) this.scene.cameras.main.shake(80, 0.003);
    const lean = (px < this.player.x ? -1 : 1) * 10;
    void facing;
    const pl = this.player;
    this.fx.push({ age: 0, dur: 160, apply: (k) => { const w = Math.sin(Math.PI * k); pl.setScale(1 + 0.12 * w, 1 - 0.12 * w).setAngle(lean * w); }, end: () => { pl.setScale(1, 1).setAngle(0); } });
  }

  private shake(g: Phaser.GameObjects.Graphics | null, deg: number): void {
    if (!g || calmMotion()) return;
    this.fx.push({ age: 0, dur: 240, apply: (k) => { g.setAngle(deg * Math.sin(Math.PI * 4 * k)); }, end: () => { g.setAngle(0); } });
  }

  /** Пил: шість крапок розлітаються за кутами (без випадковості) і гаснуть. */
  private dust(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = this.scene.add.rectangle(x, y, 3, 3, 0xcdbfa0).setDepth(TOP - 1);
      this.fx.push({ age: 0, dur: 320, apply: (k) => { r.setPosition(x + Math.cos(a) * 12 * k, y + Math.sin(a) * 7 * k - 4 * k).setAlpha(1 - k); }, end: () => { r.destroy(); } });
    }
  }

  private draw(time: number): void {
    const g = this.g;
    if (!g) return;
    const placing = this.s.phase === 'place';
    const stage = placing ? PEGS : this.s.pegs;
    g.setPosition(this.at.x, this.at.y);
    if (!placing && this.wobbleLeft > 0 && !calmMotion()) g.setAngle(Math.sin(time / 28) * 3 * (this.wobbleLeft / WOBBLE_MS));
    else if (!placing) g.setAngle(0);
    g.setDepth(placing ? TOP - 2 : this.at.y - 8);
    g.clear();
    drawTent(g, stage, placing ? (this.ok ? 0x6fe07a : 0xe05a5a) : null, placing ? 0.55 : 1, this.s.pegs, placing ? -1 : Math.min(this.s.pegs, PEGS - 1), time);
    const meter = this.meter;
    const hint = this.hint;
    if (!meter || !hint) return;
    meter.clear();
    // Під ногами героя, а не над наметом: намет біля верхнього краю мапи, а там HUD — шкала й підказка ховались під рядками «Ціль/Далі» (знімок портрета GAME-189).
    const cx = this.player.x; const top = this.player.y + 30;
    if (!placing) {
      const w = 72; const x0 = cx - w / 2;
      meter.fillStyle(0x1b1f23, 1).fillRect(x0 - 2, top - 2, w + 4, 12);
      meter.fillStyle(0x4a5058, 1).fillRect(x0, top, w, 8);
      meter.fillStyle(0x6fe07a, 1).fillRect(x0 + w * BAND.from, top, w * (BAND.to - BAND.from), 8);
      meter.fillStyle(0xf4f1e8, 1).fillRect(x0 + w * markerAt(this.s.t) - 1, top - 4, 3, 16);
    }
    const msg = placing ? this.text(this.ok ? 'tent.place' : 'tent.blocked') : `${this.text('tent.peg')} ${Math.min(this.s.pegs + 1, PEGS)}/${PEGS}`;
    if (hint.text !== msg) hint.setText(msg);
    hint.setOrigin(0.5, 0).setPosition(cx, top + 14);
  }
}

/** Намет із 5 ступенів: підошва, кілки, каркас і полотно, що виростає з кожним кілком. `tint` — привид (зелений/червоний). */
function drawTent(g: Phaser.GameObjects.Graphics, stage: number, tint: number | null, alpha: number, hits: number, current: number, time: number): void {
  const hw = FOOT.w / 2; const hh = FOOT.h / 2;
  g.fillStyle(tint ?? 0x4f6a3a, alpha * 0.8).fillRect(-hw, -hh, FOOT.w, FOOT.h);
  if (stage > 0) {
    const h = 6 + stage * 5;
    g.fillStyle(tint ?? 0xd9822b, alpha).fillTriangle(-hw, hh, hw, hh, 0, hh - h);
    g.fillStyle(tint ?? 0xa85f1c, alpha).fillTriangle(0, hh - h, hw, hh, 0, hh);
    g.fillStyle(tint ?? 0x1b1f23, alpha).fillTriangle(-6, hh, 6, hh, 0, hh - h * 0.6);
  }
  CORNERS.forEach((c, i) => {
    if (tint !== null) return;
    if (i < hits) g.fillStyle(0x8a5a2b, 1).fillRect(c.x - 1, c.y - 1, 3, 4);
    else g.lineStyle(1, 0xffd54a, i === current ? 0.5 + 0.5 * Math.abs(Math.sin(time / 160)) : 0.5).strokeRect(c.x - 2, c.y - 3, 4, 6);
  });
}
