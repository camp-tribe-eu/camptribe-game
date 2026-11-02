// GAME-209 · ящик, що штовхається, старий ящик (знахідка) і лавка, яку лагодять руками. Логіку веде чиста content/crate-push.ts (сторож softlock) і
// content/repair.ts; тут — малюнок кодом у палітрі гри (нового PNG нема: ящик ≈ 0,9 м = 25 px, OD-026), тверде тіло ящика, пил і тріски (FrameFx, покадрово).
// Стан показу: ядро й сейв ящика не знають — він стоїть на старті мапи, коли її завантажено.
import Phaser from 'phaser';
import { playUi } from '../../audio/ui-sounds';
import { sfx } from '../../audio/sfx';
import { calmMotion } from '../../platform/motion';
import { CRATE_PX, pushCrate, pushDirection, standTile, tileAtPx, type CrateWorld, type PushDir, type PushRefusal, type Tile } from '../../content/crate-push';
import { REPAIR_HITS, REPAIR_IDLE, stepRepair, type RepairState } from '../../content/repair';
import type { Key } from '../../i18n';
import { FX_PALETTE } from './fx-live';
import { FrameFx, HAND_FONT, TOP } from './hand-fx';

type Pt = { x: number; y: number };
export const OLD_CRATE_SPOT = 'trace.camp-crate';
const OUT = 0x1b1f23;
const SLIDE_MS = 160;
/** Герой штовхає, лише стоячи майже на лінії зсуву: бокова похибка до 18 px, відстань вздовж лінії до 1,4 клітинки. */
const LINE_TOL = 18;

export interface CrateProbe { active: boolean; x: number; y: number; c: number; r: number; pushes: number; refused: number; lastRefusal: PushRefusal | 'far' | null; oldOpen: boolean; repairHits: number; repairDone: boolean; dust: number }
export const CRATE_PROBE_IDLE: CrateProbe = { active: false, x: 0, y: 0, c: 0, r: 0, pushes: 0, refused: 0, lastRefusal: null, oldOpen: false, repairHits: 0, repairDone: false, dust: 0 };

/** Ящик: дошки, світло зліва згори, контур; ноги — на (0,0). `old` — старий, сірий, з літерою «Г»; `open` — кришка зсунута. */
export function drawCrate(g: Phaser.GameObjects.Graphics, kind: 'new' | 'old', open: boolean): void {
  const w = CRATE_PX; const h = 18; const x0 = -w / 2;
  const face = kind === 'new' ? 0xb98852 : 0x8f7a5a; const dark = kind === 'new' ? 0x6b4423 : 0x5a4a35; const top = kind === 'new' ? 0xd9a860 : 0xb19a74;
  g.clear();
  g.fillStyle(OUT, 0.35).fillEllipse(0, 1, w + 4, 8);
  g.fillStyle(face, 1).fillRect(x0, -h, w, h);
  g.fillStyle(dark, 1).fillRect(x0, -h + 5, w, 1).fillRect(x0, -h + 11, w, 1).fillRect(x0 + 3, -h, 2, h).fillRect(x0 + w - 5, -h, 2, h);   // дошки й бруски
  g.fillStyle(top, 1).fillRect(x0, -h, 2, h);   // світло зліва
  g.lineStyle(1, OUT, 1).strokeRect(x0, -h, w, h);
  if (open) {
    g.fillStyle(OUT, 1).fillRect(x0 + 1, -h - 4, w - 2, 5);   // темна порожнина
    g.fillStyle(top, 1).fillRect(x0 + 6, -h - 8, w - 4, 4).lineStyle(1, OUT, 1).strokeRect(x0 + 6, -h - 8, w - 4, 4);   // кришка зсунута вбік
    g.fillStyle(0xf4ecd2, 1).fillRect(x0 + 4, -h - 3, 9, 3);   // край мапи в ящику
  } else {
    g.fillStyle(top, 1).fillRect(x0 - 1, -h - 4, w + 2, 4).lineStyle(1, OUT, 1).strokeRect(x0 - 1, -h - 4, w + 2, 4);   // кришка: верхня смужка (передня грань паралельна екрану)
  }
  if (kind === 'old') g.lineStyle(2, 0xf4ecd2, 0.9).beginPath().moveTo(-4, -13).lineTo(-4, -5).moveTo(3, -13).lineTo(3, -5).moveTo(-4, -9).lineTo(3, -9).strokePath();   // «Г»-подібна літера H
}

export class CampProps {
  private readonly fx: FrameFx;
  private world: CrateWorld | null = null;
  private tile = 32;
  private crate: Tile = { c: 0, r: 0 };
  private crateG: Phaser.GameObjects.Graphics | null = null;
  private oldG: Phaser.GameObjects.Graphics | null = null;
  private oldAt: Pt | null = null;
  private oldOpen = false;
  private repairAt: Pt | null = null;
  private repair: RepairState = REPAIR_IDLE;
  private hint: Phaser.GameObjects.Text | null = null;
  private hintLeft = 0;
  private dust = 0;
  /** Тверде тіло ящика: сцена додає collider героя з ним. */
  body: Phaser.GameObjects.Rectangle | null = null;
  readonly probeData: CrateProbe = { ...CRATE_PROBE_IDLE };

  constructor(private readonly scene: Phaser.Scene, private readonly text: (key: Key) => string) { this.fx = new FrameFx(scene); }

  get active(): boolean { return this.world !== null; }
  get crateTile(): Tile { return this.crate; }
  crateAt(): Pt { return this.centerOf(this.crate); }
  private centerOf(t: Tile): Pt { return { x: (t.c + 0.5) * this.tile, y: (t.r + 0.5) * this.tile }; }

  /** Нова мапа табору: ящик на старті, старий ящик на позначці, лавка на місці ремонту. Мапа без `crate.start` — ящика нема. */
  begin(world: CrateWorld, tile: number, start: Pt | null, old: Pt | null, repairSpot: Pt | null, oldOpen: boolean, repaired: boolean): void {
    this.reset();
    this.tile = tile;
    this.repairAt = repairSpot;
    this.repair = repaired ? { hits: REPAIR_HITS, done: true } : REPAIR_IDLE;
    this.probeData.repairDone = repaired;
    if (old) {
      this.oldAt = old; this.oldOpen = oldOpen;
      this.oldG = this.scene.add.graphics().setPosition(old.x, old.y + 10).setDepth(old.y + 10);
      drawCrate(this.oldG, 'old', oldOpen);
    }
    this.probeData.oldOpen = oldOpen;
    if (start) {
      this.world = world;
      this.crate = tileAtPx(start, tile);
      const c = this.centerOf(this.crate);
      this.crateG = this.scene.add.graphics().setPosition(c.x, c.y + 14).setDepth(c.y + 14);
      drawCrate(this.crateG, 'new', false);
      this.body = this.scene.add.rectangle(c.x, c.y, 28, 28, 0x000000, 0);
      this.scene.physics.add.existing(this.body, true);
      this.hint = this.scene.add.text(0, 0, '', HAND_FONT).setOrigin(0.5, 1).setDepth(TOP + 1).setVisible(false);
      this.sync();
    }
  }

  reset(): void {
    this.fx.clear();
    this.crateG?.destroy(); this.crateG = null;
    this.oldG?.destroy(); this.oldG = null;
    this.body?.destroy(); this.body = null;
    this.hint?.destroy(); this.hint = null;
    this.world = null; this.oldAt = null; this.repairAt = null; this.oldOpen = false;
    this.repair = REPAIR_IDLE;
    Object.assign(this.probeData, CRATE_PROBE_IDLE);
  }

  private sync(): void {
    const c = this.centerOf(this.crate);
    this.probeData.active = this.world !== null;
    Object.assign(this.probeData, { x: c.x, y: c.y, c: this.crate.c, r: this.crate.r });
  }

  /** Пил і тріски на удар/зсув: покадрово, у палітрі пилу LPC (FX_PALETTE). */
  private puff(x: number, y: number, n: number, shavings: boolean): void {
    if (calmMotion()) return;
    this.fx.burst(x, y, n, FX_PALETTE.dust, { r: 12, rise: 3, size: 3, dur: 420 });
    this.fx.burst(x, y, Math.max(2, n - 2), FX_PALETTE.dustLight, { r: 8, rise: 5, size: 2, dur: 320 });
    if (shavings) this.fx.burst(x, y - 4, 4, 0xd9a860, { r: 14, rise: 7, size: 2, dur: 380 });
    this.dust += n;
    this.probeData.dust = this.dust;
  }

  /** Ящик лежить десь поруч із героєм у зоні дії (для вибору дії сценою). */
  crateNear(from: Pt, range: number): boolean {
    return this.world !== null && Math.hypot(this.crateAt().x - from.x, this.crateAt().y - from.y) <= range;
  }

  /**
   * Штовхнути ящик (дія героя). Герой стоїть біля ящика на лінії зсуву. Повертає, що сталося: 'moved' — ящик на клітинку далі; відмова — ящик стоїть
   * (стіна, об'єкт, або сторож: після зсуву щось було б відрізано); 'far' — герой не на лінії.
   */
  push(player: Pt, guardOverride?: Parameters<typeof pushCrate>[4]): { result: 'moved' | PushRefusal | 'far'; dir: PushDir | null } {
    const w = this.world;
    if (!w) return { result: 'far', dir: null };
    const c = this.crateAt();
    const dir = pushDirection(player, c);
    const off = dir === 'left' || dir === 'right' ? Math.abs(c.y - player.y) : Math.abs(c.x - player.x);
    const along = dir === 'left' || dir === 'right' ? Math.abs(c.x - player.x) : Math.abs(c.y - player.y);
    if (!dir || off > LINE_TOL || along > this.tile * 1.4) { this.probeData.lastRefusal = 'far'; return { result: 'far', dir }; }
    const r = pushCrate(w, this.crate, standTile(this.crate, dir), dir, guardOverride);
    if (!r.ok) {
      this.probeData.refused++; this.probeData.lastRefusal = r.reason;
      playUi('back');
      this.puff(c.x, c.y + 10, 2, false);
      this.hintLeft = 1800; this.setHint('crate.stuck');
      return { result: r.reason, dir };
    }
    const from = c;
    this.crate = r.crate;
    const to = this.centerOf(r.crate);
    this.probeData.pushes++; this.probeData.lastRefusal = null;
    if (this.body) { this.body.setPosition(to.x, to.y); (this.body.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject(); }
    const g = this.crateG;
    if (g) this.fx.push(SLIDE_MS, (k) => { const e = k * (2 - k); g.setPosition(from.x + (to.x - from.x) * e, from.y + 14 + (to.y - from.y) * e).setDepth(from.y + 14 + (to.y - from.y) * e); }, () => { g.setPosition(to.x, to.y + 14).setDepth(to.y + 14); });
    this.puff(from.x, from.y + 12, 5, false);
    sfx('branch'); playUi('press');
    this.sync();
    return { result: 'moved', dir };
  }

  private setHint(key: Key): void { const h = this.hint; if (h && h.text !== this.text(key)) h.setText(this.text(key)); }

  /** Старий ящик відкрито: кришка зсунута, пил; знахідку дає ядро (trace.camp-crate). */
  open(): void {
    if (!this.oldAt || !this.oldG) return;
    this.oldOpen = true; this.probeData.oldOpen = true;
    drawCrate(this.oldG, 'old', true);
    this.puff(this.oldAt.x, this.oldAt.y + 6, 8, true);
    sfx('chop'); playUi('confirm');
  }
  oldPoint(): Pt | null { return this.oldAt; }

  repairNear(from: Pt, range: number): boolean { return this.repairAt !== null && !this.repair.done && Math.hypot(this.repairAt.x - from.x, this.repairAt.y - from.y) <= range; }
  /** Удар молотка: пил і тріски на кожен. 'done' — третій удар, час віддати ядру команду. */
  hit(near: boolean): 'hit' | 'done' | 'none' {
    const r = stepRepair(this.repair, near);
    this.repair = r.state;
    const at = this.repairAt;
    if (r.event === 'none' || !at) return 'none';
    this.probeData.repairHits = r.state.hits; this.probeData.repairDone = r.state.done;
    this.puff(at.x, at.y + 6, r.event === 'done' ? 9 : 5, true);
    sfx('peg'); playUi(r.event === 'done' ? 'confirm' : 'press');
    if (!calmMotion()) this.scene.cameras.main.shake(70, 0.002);
    return r.event;
  }
  get repairHits(): number { return this.repair.hits; }
  get repairDone(): boolean { return this.repair.done; }

  update(dtMs: number, player: Pt, range: number, repairLive: boolean): void {
    this.fx.update(dtMs);
    this.hintLeft = Math.max(0, this.hintLeft - dtMs);
    const h = this.hint;
    if (!h) return;
    let key: Key | null = null; let at: Pt | null = null;
    if (this.hintLeft > 0) { key = 'crate.stuck'; at = this.crateAt(); }
    else if (this.crateNear(player, range * 0.85)) { key = 'crate.push'; at = this.crateAt(); }
    else if (repairLive && this.repairNear(player, range)) { key = this.repair.hits > 0 ? 'repair.hit' : 'repair.go'; at = this.repairAt; }
    else if (this.oldAt && !this.oldOpen && Math.hypot(this.oldAt.x - player.x, this.oldAt.y - player.y) <= range) { key = 'crate.open'; at = this.oldAt; }
    if (!key || !at) { h.setVisible(false); return; }
    const msg = key === 'repair.hit' ? `${this.text(key)} ${this.repair.hits}/${REPAIR_HITS}` : this.text(key);
    if (h.text !== msg) h.setText(msg);
    h.setPosition(at.x, at.y - 30).setVisible(true);
  }
}
