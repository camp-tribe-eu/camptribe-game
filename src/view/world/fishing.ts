// GAME-193 · риболовля на озері табору (OD-022): вигляд і відгук. Логіку (шкала сили, очікування, клювання, підсікання, улов) веде чистий автомат content/fishing.ts;
// тут малюємо поплавок, сплески, шкалу підсікання, рибку над головою й рамку вибору. Анімацію «thrust» героєві дає сцена (playAction). Лічильник улову — лише показ (сейв і ядро його не знають).
// Мія: кіт до води не підходить, тут його не показуємо й не анімуємо.
import Phaser from 'phaser';
import { playUi } from '../../audio/ui-sounds';
import { BITE_MS, FISH_IDLE, SPECIES, ZONE, castDistance, catches, fishAt, inZone, makeRng, stepFish, type FishEvent, type FishInput, type FishState } from '../../content/fishing';
import type { Key } from '../../i18n';
import { FrameFx, HAND_FONT, TOP, meterTop } from './hand-fx';

type Pt = { x: number; y: number };
export const FISH_SPOT = 'fish.shore';
const FLIGHT_MS = 450;
const MSG_MS = 1600;
const SPECIES_COLOR: Record<string, number> = { perch: 0x8fb04a, carp: 0xd9a860, trout: 0xc9a0dc, pike: 0x5fa88a };
const NAME_KEY: Record<string, Key> = { perch: 'fish.sp.perch', carp: 'fish.sp.carp', trout: 'fish.sp.trout', pike: 'fish.sp.pike' };
const CHOICE_FONT = { ...HAND_FONT, fontSize: '9px', padding: { x: 7, y: 6 } } as const;

/** Видимий стан для e2e (лише читання). Координати кнопок — у пікселях сторінки (для тапу в тесті). */
export interface FishProbe {
  phase: FishState['phase']; power: number; waitMs: number; zone: number; fish: number; progress: number; inZone: boolean; species: string;
  casts: number; slipped: number; aways: number; kept: number; released: number; catches: number; selected: number;
  bobber: Pt; spot: Pt; buttons: { release: Pt; keep: Pt };
}
export const FISH_PROBE_IDLE: FishProbe = { phase: 'idle', power: 0, waitMs: 0, zone: 0, fish: 0, progress: 0, inZone: false, species: '', casts: 0, slipped: 0, aways: 0, kept: 0, released: 0, catches: 0, selected: 0, bobber: { x: 0, y: 0 }, spot: { x: 0, y: 0 }, buttons: { release: { x: 0, y: 0 }, keep: { x: 0, y: 0 } } };

export interface FishFrame { readonly down: boolean; readonly near: boolean; readonly left: boolean; readonly right: boolean; readonly tap: Pt | null; readonly time: number }

export class FishRig {
  private s: FishState = FISH_IDLE;
  private readonly fx: FrameFx;
  private readonly rng = makeRng(193);
  private spot: Pt | null = null;
  private target: Pt = { x: 0, y: 0 };
  private fly = 0;
  private msg: Key | null = null;
  private msgLeft = 0;
  private sel = 0;
  private prevDown = false; private prevL = false; private prevR = false;
  private bobber: Phaser.GameObjects.Graphics | null = null;
  private meter: Phaser.GameObjects.Graphics | null = null;
  private fishG: Phaser.GameObjects.Graphics | null = null;
  private hint: Phaser.GameObjects.Text | null = null;
  private name: Phaser.GameObjects.Text | null = null;
  private btn: [Phaser.GameObjects.Text, Phaser.GameObjects.Text] | null = null;

  constructor(private readonly scene: Phaser.Scene, private readonly player: Phaser.GameObjects.Sprite, private readonly text: (key: Key) => string) { this.fx = new FrameFx(scene); }

  get phase(): FishState['phase'] { return this.s.phase; }
  /** Рибалка триває: ходьба й інші дії дивляться повз неї. */
  get busy(): boolean { return this.s.phase !== 'idle'; }
  get here(): boolean { return this.spot !== null; }
  point(): Pt | null { return this.spot; }
  /** Куди дивиться герой над водою. */
  water(): Pt | null { return this.spot ? { x: this.spot.x + 100, y: this.spot.y } : null; }
  near(from: Pt, range: number): boolean { return this.spot !== null && Math.hypot(this.spot.x - from.x, this.spot.y - from.y) <= range; }

  begin(spot: Pt): void {
    this.reset();
    this.spot = spot;
    this.bobber = this.scene.add.graphics().setVisible(false);
    this.meter = this.scene.add.graphics().setDepth(TOP);
    this.fishG = this.scene.add.graphics().setDepth(TOP);
    this.hint = this.scene.add.text(0, 0, '', HAND_FONT).setOrigin(0.5, 0).setDepth(TOP + 1);
    this.name = this.scene.add.text(0, 0, '', HAND_FONT).setOrigin(0.5, 1).setDepth(TOP + 1).setVisible(false);
    const mk = (key: Key, ox: number): Phaser.GameObjects.Text => this.scene.add.text(0, 0, this.text(key), CHOICE_FONT).setOrigin(ox, 0).setDepth(TOP + 1).setVisible(false);
    this.btn = [mk('fish.release', 1), mk('fish.keep', 0)];
  }

  reset(): void {
    this.fx.clear();
    for (const o of [this.bobber, this.meter, this.fishG, this.hint, this.name, this.btn?.[0], this.btn?.[1]]) o?.destroy();
    this.bobber = this.meter = this.fishG = this.hint = this.name = this.btn = null;
    this.spot = null;
    this.s = { ...FISH_IDLE, kept: this.s.kept, released: this.s.released };   // лічильник улову живе, доки жива сцена
    this.msg = null; this.msgLeft = 0; this.fly = 0;
  }

  probe(): FishProbe {
    const s = this.s;
    const toPage = (p: Pt): Pt => {
      const view = this.scene.cameras.main.worldView; const r = this.scene.game.canvas.getBoundingClientRect();
      return { x: r.left + ((p.x - view.x) / view.width) * r.width, y: r.top + ((p.y - view.y) / view.height) * r.height };
    };
    const b = (i: 0 | 1): Pt => { const t = this.btn?.[i]; if (!t || !t.visible) return { x: 0, y: 0 }; const bb = t.getBounds(); return toPage({ x: bb.centerX, y: bb.centerY }); };
    return {
      phase: s.phase, power: s.power, waitMs: s.waitMs, zone: s.zone, fish: s.phase === 'reel' ? fishAt(s) : 0, progress: s.progress, inZone: s.phase === 'reel' && inZone(s), species: SPECIES[s.species]?.id ?? '',
      casts: s.casts, slipped: s.slipped, aways: s.aways, kept: s.kept, released: s.released, catches: catches(s), selected: this.sel,
      bobber: this.bobberAt(0), spot: this.spot ?? { x: 0, y: 0 }, buttons: { release: b(0), keep: b(1) },
    };
  }

  private bobberAt(time: number): Pt {
    const p = this.spot; if (!p) return { x: 0, y: 0 };
    const to = { x: p.x + 24 + castDistance(this.s.power), y: p.y };
    this.target = to;
    if (this.fly <= 0) return { x: to.x, y: to.y + (this.s.phase === 'wait' ? Math.sin(time / 420) * 1.5 : 0) };
    const k = 1 - this.fly / FLIGHT_MS;
    return { x: this.player.x + (to.x - this.player.x) * k, y: this.player.y - 18 + (to.y - (this.player.y - 18)) * k - Math.sin(k * Math.PI) * 34 };
  }

  private feed(i: FishInput): FishEvent {
    const r = stepFish(this.s, i, this.rng);
    this.s = r.state;
    return r.event;
  }

  /** Кадр. Повертає події (сцена на `charge` повертає героя до води, на `cast` грає «thrust»). */
  update(dtMs: number, f: FishFrame): FishEvent[] {
    this.fx.update(dtMs);
    this.msgLeft = Math.max(0, this.msgLeft - dtMs);
    this.fly = Math.max(0, this.fly - dtMs);
    const out: FishEvent[] = [];
    if (!this.spot) return out;
    const dt = Math.min(dtMs, 100);
    const edge = f.down && !this.prevDown;
    if (this.s.phase === 'choice') {
      if (f.left && !this.prevL) this.sel = 0;
      if (f.right && !this.prevR) this.sel = 1;
      let pick: number | null = edge ? this.sel : null;
      if (f.tap) this.btn?.forEach((t, i) => { if (t.visible && Phaser.Geom.Rectangle.Inflate(t.getBounds(), 6, 6).contains(f.tap?.x ?? -1, f.tap?.y ?? -1)) pick = i; });
      if (pick !== null) { const e = this.feed({ kind: 'choose', keep: pick === 1 }); out.push(e); this.react(e); }
    } else {
      // Поза рибалкою дія рахується лише біля берега; щойно рибалка почалась — тримання ведеться де завгодно (герой стоїть).
      const e = this.feed({ kind: 'tick', dtMs: dt, down: f.down && (f.near || this.busy) });
      if (e !== 'none') { out.push(e); this.react(e); }
    }
    this.prevDown = f.down; this.prevL = f.left; this.prevR = f.right;
    this.draw(f);
    return out;
  }

  private say(k: Key): void { this.msg = k; this.msgLeft = MSG_MS; }

  private react(e: FishEvent): void {
    const t = this.target; const px = this.player.x; const py = this.player.y;
    switch (e) {
      case 'charge': playUi('press'); break;
      case 'cast': playUi('press'); this.fly = FLIGHT_MS; this.fx.push(FLIGHT_MS, () => undefined, () => { this.fx.burst(t.x, t.y, 6, 0x9ad0ff, { r: 12, rise: 3, dur: 420, size: 2 }); }); break;
      case 'bite': playUi('press'); this.fx.burst(t.x, t.y, 8, 0xdff3ff, { r: 16, rise: 8, dur: 480, size: 2 }); break;
      case 'slipped': playUi('back'); this.say('fish.lost'); this.fx.burst(t.x, t.y, 5, 0x9ad0ff, { r: 10, dur: 400, size: 2 }); break;
      case 'hook': playUi('press'); break;
      case 'away': playUi('back'); this.say('fish.away'); this.fx.burst(t.x, t.y, 7, 0x9ad0ff, { r: 14, dur: 450, size: 2 }); break;
      case 'caught': playUi('confirm'); this.sel = 0; this.fx.burst(px, py - 50, 12, 0xffe58a, { r: 24, rise: 10, dur: 700, size: 2 }); this.fx.burst(t.x, t.y, 8, 0xdff3ff, { r: 18, rise: 10, dur: 500, size: 2 }); break;
      case 'kept': playUi('confirm'); this.say('fish.kept'); this.fx.burst(px, py - 40, 8, 0xffe58a, { r: 16, rise: 8, dur: 500, size: 2 }); break;
      case 'released': {
        playUi('press'); this.say('fish.freed');
        const col = SPECIES_COLOR[SPECIES[this.s.species]?.id ?? 'perch'] ?? 0x8fb04a;
        const g = this.scene.add.graphics().setDepth(TOP);
        this.fx.push(520, (k) => { g.clear(); drawFish(g, px + (t.x - px) * k, py - 50 + (t.y - (py - 50)) * k - Math.sin(k * Math.PI) * 26, col, 0.8, k * 6); }, () => { g.destroy(); this.fx.burst(t.x, t.y, 10, 0xdff3ff, { r: 18, rise: 10, dur: 520, size: 2 }); });
        break;
      }
      default: break;
    }
  }

  private draw(f: FishFrame): void {
    const meter = this.meter; const hint = this.hint; const fishG = this.fishG; const bob = this.bobber; const name = this.name; const btn = this.btn;
    if (!meter || !hint || !fishG || !bob || !name || !btn) return;
    const s = this.s; const cx = this.player.x; const top = meterTop(this.scene, this.player);
    meter.clear(); fishG.clear(); name.setVisible(false); btn[0].setVisible(false); btn[1].setVisible(false);
    const at = this.bobberAt(f.time);
    // Поплавок + волосінь від руки героя.
    const lineOn = s.phase === 'wait' || s.phase === 'bite' || s.phase === 'reel' || this.fly > 0;
    bob.setVisible(lineOn).clear();
    if (lineOn) {
      const dip = s.phase === 'bite' ? 4 + Math.sin(f.time / 40) * 2 : s.phase === 'reel' ? 3 : 0;
      const bx = at.x; const by = at.y + dip;
      bob.setDepth(by + 4);
      bob.lineStyle(1, 0xe8e4d8, 0.9).lineBetween(this.player.x + 8, this.player.y - 22, bx, by - 4);
      bob.fillStyle(0xf4f1e8, 1).fillCircle(bx, by - 2, 3).fillStyle(0xd94a3a, 1).fillCircle(bx, by - 4, 3);
      if (s.phase === 'wait' && this.fly <= 0) bob.lineStyle(1, 0xdff3ff, 0.6).strokeEllipse(bx, by + 1, 10 + Math.sin(f.time / 300) * 2, 4);
      if (s.phase === 'bite') bob.lineStyle(1, 0xffffff, 0.9).strokeEllipse(bx, by + 1, 14 + ((f.time / 60) % 6), 6);
    }
    let msg = '';
    if (s.phase === 'idle') msg = this.msgLeft > 0 && this.msg ? this.text(this.msg) : f.near ? `${this.text('fish.start')}${catches(s) > 0 ? `  ·  ${this.text('fish.tally')} ${catches(s)}` : ''}` : '';
    else if (s.phase === 'charge') { drawFill(meter, cx, top, s.power); msg = this.text('fish.charge'); }
    else if (s.phase === 'wait') msg = this.text('fish.wait');
    else if (s.phase === 'bite') {
      msg = this.text('fish.bite');
      const k = 1 - s.t / BITE_MS;   // вікно «клює» видно як смужку, що спадає
      meter.fillStyle(0x1b1f23, 1).fillRect(cx - 38, top - 2, 76, 8).fillStyle(0xffd24a, 1).fillRect(cx - 36, top, 72 * Math.max(0, k), 4);
      fishG.fillStyle(0xffd24a, 1).fillRect(at.x - 1, at.y - 28, 3, 9).fillRect(at.x - 1, at.y - 16, 3, 3);   // «!» над поплавком
    } else if (s.phase === 'reel') { drawReel(meter, cx, top, s); msg = this.text('fish.reel'); const fp = fishPos(cx, top, fishAt(s)); drawFish(fishG, fp.x, fp.y, SPECIES_COLOR[SPECIES[s.species]?.id ?? 'perch'] ?? 0x8fb04a, 0.6, 0); }
    else if (s.phase === 'choice') {
      const id = SPECIES[s.species]?.id ?? 'perch';
      const hy = Math.max(this.player.y - 62, this.scene.cameras.main.worldView.y + 80);
      drawFish(fishG, cx, hy, SPECIES_COLOR[id] ?? 0x8fb04a, 1.3, Math.sin(f.time / 200) * 3);
      name.setText(`${this.text('fish.caught')} ${this.text(NAME_KEY[id] ?? 'fish.sp.perch')}`).setPosition(cx, hy - 12).setVisible(true);
      btn[0].setPosition(cx - 4, top + 2).setVisible(true).setBackgroundColor(this.sel === 0 ? '#3b7a45' : '#1b1f23dd');
      btn[1].setPosition(cx + 4, top + 2).setVisible(true).setBackgroundColor(this.sel === 1 ? '#3b7a45' : '#1b1f23dd');
    }
    if (hint.text !== msg) hint.setText(msg);
    hint.setVisible(msg !== '').setPosition(cx, s.phase === 'idle' ? top + 14 : top + (s.phase === 'reel' ? 26 : 14));
  }
}

const METER_W = 96;
const fishPos = (cx: number, top: number, pos: number): Pt => ({ x: cx - METER_W / 2 + METER_W * pos, y: top + 4 });
function drawFill(g: Phaser.GameObjects.Graphics, cx: number, top: number, power: number): void {
  const x0 = cx - 36;
  g.fillStyle(0x1b1f23, 1).fillRect(x0 - 2, top - 2, 76, 12).fillStyle(0x4a5058, 1).fillRect(x0, top, 72, 8).fillStyle(0x6fe07a, 1).fillRect(x0, top, 72 * power, 8);
}
/** Шкала підсікання: горизонтальна доріжка, зелена зона (її веде гравець), рибка, під нею — прогрес. */
function drawReel(g: Phaser.GameObjects.Graphics, cx: number, top: number, s: FishState): void {
  const x0 = cx - METER_W / 2;
  g.fillStyle(0x1b1f23, 1).fillRect(x0 - 2, top - 2, METER_W + 4, 22);
  g.fillStyle(0x4a5058, 1).fillRect(x0, top, METER_W, 8);
  g.fillStyle(0x6fe07a, 1).fillRect(x0 + METER_W * (s.zone - ZONE / 2), top, METER_W * ZONE, 8);
  g.fillStyle(0x4a5058, 1).fillRect(x0, top + 11, METER_W, 5).fillStyle(0xffd24a, 1).fillRect(x0, top + 11, METER_W * s.progress, 5);
}
/** Рибка боком (пікселі, без ассету): тіло, хвіст, око. `wob` — коливання хвоста. */
function drawFish(g: Phaser.GameObjects.Graphics, x: number, y: number, color: number, scale: number, wob: number): void {
  g.fillStyle(0x1b1f23, 1).fillEllipse(x, y, 16 * scale + 2, 8 * scale + 2).fillTriangle(x + 8 * scale, y, x + 14 * scale, y - 5 * scale + wob, x + 14 * scale, y + 5 * scale + wob);
  g.fillStyle(color, 1).fillEllipse(x, y, 16 * scale, 8 * scale).fillTriangle(x + 8 * scale, y, x + 13 * scale, y - 4 * scale + wob, x + 13 * scale, y + 4 * scale + wob);
  g.fillStyle(0xf4f1e8, 1).fillRect(x - 5 * scale, y - 1, 2, 2);
}
