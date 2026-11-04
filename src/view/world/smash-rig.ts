// GAME-228 · «Розбивання»: малює й грає ящик, бочку, горщик і гілку табору (математика й таблиці — smash.ts; знахідки летять магнітом camp-alive.ts).
// Нової графіки нема: ящик — той самий drawCrate(), решта — кілька пікселів Graphics у палітрі гри. Усе покадрово (без таймерів і tween), звук лише через src/audio.
import Phaser from 'phaser';
import type { Key } from '../../i18n';
import { drawCrate } from './crate';
import { FX_PALETTE } from './fx-live';
import { HAND_FONT, TOP } from './hand-fx';
import { FRAME_MS, type Item, type Pt } from './camp-alive';
import {
  BRANCH_SHAKE_MS, DEBRIS_MS, FIND_KEY, SMASH_PROPS, SMOKE_MS, TOAST_MAX, branchShift, breaksAway, debrisAt, debrisPlan, findScale, freezeMs, pushToast, smokeAt, stepToasts, toastAlpha,
  type Debris, type FindKind, type SmashProp, type ToastEntry,
} from './smash';

const OUT = 0x1b1f23;
const SOUND_OF = { crate: 'crack', barrel: 'hollow', pot: 'clay', branch: 'snap' } as const;

interface Burst { readonly p: SmashProp; readonly debris: readonly Debris[]; age: number }
interface Smoke { readonly x: number; readonly y: number; age: number }
export interface SmashProbe { smashes: number; shakes: number; lastDebris: number; lastFreeze: number; debris: number; smoke: number; hold: number; broken: string[]; toasts: { kind: FindKind; count: number }[]; toastText: string[]; toastAlpha: number; findSizes: number[]; props: number; sounds: string[] }
export const SMASH_PROBE_IDLE: SmashProbe = { smashes: 0, shakes: 0, lastDebris: 0, lastFreeze: 0, debris: 0, smoke: 0, hold: 0, broken: [], toasts: [], toastText: [], toastAlpha: 0, findSizes: [], props: 0, sounds: [] };

/** Дерев'яна бочка: клепки й два обручі, світло зліва; ноги — на (0,0). */
function drawBarrel(g: Phaser.GameObjects.Graphics): void {
  g.clear();
  g.fillStyle(OUT, 0.35).fillEllipse(0, 1, 24, 7);
  g.fillStyle(OUT, 1).fillRect(-10, -22, 20, 23);
  g.fillStyle(0x8f5f33, 1).fillRect(-9, -21, 18, 21);
  g.fillStyle(0xb98852, 1).fillRect(-9, -21, 4, 21);
  g.fillStyle(0x5a3a1e, 1).fillRect(-9, -16, 18, 2).fillRect(-9, -6, 18, 2).fillRect(1, -21, 1, 21);
  g.fillStyle(0xd9a860, 1).fillRect(-9, -22, 18, 2);
}
/** Глиняний горщик: пузате черево, вінце, світла грань; ноги — на (0,0). */
function drawPot(g: Phaser.GameObjects.Graphics): void {
  g.clear();
  g.fillStyle(OUT, 0.35).fillEllipse(0, 1, 18, 6);
  g.fillStyle(OUT, 1).fillRect(-8, -16, 16, 17).fillRect(-6, -19, 12, 4);
  g.fillStyle(0xb5532e, 1).fillRect(-7, -13, 14, 13).fillRect(-5, -18, 10, 3);
  g.fillStyle(0xd98a55, 1).fillRect(-7, -13, 3, 12).fillRect(-5, -18, 10, 1);
  g.fillStyle(0x7e3a1f, 1).fillRect(-7, -8, 14, 1);
}
/** Суха гілка: стовбурець із двома відростками, без листя; ноги — на (0,0). */
function drawBranch(g: Phaser.GameObjects.Graphics): void {
  g.clear();
  g.fillStyle(OUT, 0.35).fillEllipse(0, 1, 20, 5);
  g.fillStyle(0x4a3a28, 1).fillRect(-2, -20, 4, 21).fillRect(-8, -17, 6, 2).fillRect(-10, -20, 2, 4).fillRect(2, -12, 7, 2).fillRect(8, -16, 2, 5);
  g.fillStyle(0x8f7a5a, 1).fillRect(-2, -20, 1, 20).fillRect(-8, -17, 5, 1).fillRect(3, -12, 5, 1);
}

/** Малює знахідку: дошка, черепок чи гілочка; s — розмір (1 → 1/3 → 0 на торсі). */
export function drawFind(g: Phaser.GameObjects.Graphics, kind: string, x: number, y: number, s: number): void {
  if (s <= 0) return;
  const rx = Math.round(x); const ry = Math.round(y);
  const w = (n: number): number => Math.max(1, Math.round(n * s));
  g.fillStyle(OUT, 0.3 * s).fillEllipse(x, y + 1, 7 * s, 2.5 * s);
  if (kind === 'plank') g.fillStyle(OUT, 1).fillRect(rx - w(4), ry - w(4), w(8), w(4)).fillStyle(0xb98852, 1).fillRect(rx - w(3), ry - w(3), w(6), w(2)).fillStyle(0xd9a860, 1).fillRect(rx - w(3), ry - w(3), w(6), 1);
  else if (kind === 'shard') g.fillStyle(OUT, 1).fillRect(rx - w(3), ry - w(5), w(6), w(5)).fillStyle(0xb5532e, 1).fillRect(rx - w(2), ry - w(4), w(4), w(3)).fillStyle(0xd98a55, 1).fillRect(rx - w(2), ry - w(4), w(2), 1);
  else g.fillStyle(0x4a3a28, 1).fillRect(rx - w(4), ry - w(3), w(8), w(2)).fillStyle(0x8f7a5a, 1).fillRect(rx - w(4), ry - w(3), w(5), 1).fillRect(rx + w(1), ry - w(5), w(2), w(2));
}

export class SmashRig {
  private gfx = new Map<string, Phaser.GameObjects.Graphics>();
  private bursts: Burst[] = [];
  private smokes: Smoke[] = [];
  private shakes = new Map<string, number>();
  private toasts: ToastEntry[] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  private holdLeft = 0;
  readonly probe: SmashProbe = { ...SMASH_PROBE_IDLE };
  constructor(private readonly scene: Phaser.Scene, private readonly text: (key: Key) => string, private readonly sound: (n: 'crack' | 'clay' | 'hollow' | 'snap') => void) {}

  /** Табір побудовано: картинки речей і заготовлені рядки плашки. Повертає створене (власник знищить). */
  begin(): { destroy(): void }[] {
    const out: { destroy(): void }[] = [];
    for (const p of SMASH_PROPS) {
      const g = this.scene.add.graphics().setPosition(p.at.x, p.at.y).setDepth(p.at.y);
      if (p.kind === 'crate') drawCrate(g, 'new', false); else if (p.kind === 'barrel') drawBarrel(g); else if (p.kind === 'pot') drawPot(g); else drawBranch(g);
      this.gfx.set(p.id, g); out.push(g);
    }
    for (let i = 0; i < TOAST_MAX; i++) { const t = this.scene.add.text(0, 0, '', HAND_FONT).setOrigin(0, 1).setDepth(TOP + 2).setVisible(false); this.labels.push(t); out.push(t); }
    this.probe.props = SMASH_PROPS.length;
    return out;
  }

  reset(): void {
    this.gfx.clear(); this.bursts = []; this.smokes = []; this.shakes.clear(); this.toasts = []; this.labels = []; this.holdLeft = 0;
    Object.assign(this.probe, SMASH_PROBE_IDLE, { broken: [], toasts: [], toastText: [], findSizes: [], sounds: [] });
  }

  get holdsHero(): boolean { return this.holdLeft > 0; }

  /** Які речі зараз стоять: розбиті сьогодні (id) — сховані до наступної доби; гілка стоїть завжди. */
  redraw(brokenIds: readonly string[]): void {
    for (const p of SMASH_PROPS) this.gfx.get(p.id)?.setVisible(!(breaksAway(p.kind) && brokenIds.includes(p.id)));
    this.probe.broken = [...brokenIds];
  }

  /** Удар: стоп героя, спрайт зникає (ящик, бочка, горщик) або гілка тремтить; уламки, дим, звук матеріалу. Повертає кадри стопу. */
  hit(p: SmashProp, day: number, calm: boolean): number {
    const pr = this.probe;
    const fm = freezeMs(p.id, day);
    this.holdLeft = fm;
    pr.lastFreeze = Math.round(fm / FRAME_MS); pr.smashes++;
    const debris = debrisPlan(p, day);
    pr.lastDebris = debris.length;
    if (breaksAway(p.kind)) { this.gfx.get(p.id)?.setVisible(false); this.smokes.push({ x: p.at.x, y: p.at.y - 8, age: 0 }); } else { this.shakes.set(p.id, 0); pr.shakes++; }
    if (!calm || breaksAway(p.kind)) this.bursts.push({ p, debris, age: 0 });
    const s = SOUND_OF[p.kind]; this.sound(s);
    return pr.lastFreeze;
  }

  /** Повторний удар по гілці того ж дня: ледь здригається, нічого не падає. */
  tremble(p: SmashProp): void { this.shakes.set(p.id, BRANCH_SHAKE_MS - FRAME_MS); this.sound('snap'); }

  toast(kind: FindKind): void { this.toasts = pushToast(this.toasts, kind); }

  /** Кадр: стоп, тремтіння гілки, уламки й дим (малюються в `g`), плашка біля нижнього лівого кута (`anchor` — світові координати кута кадру над елементами керування). */
  update(dtMs: number, g: Phaser.GameObjects.Graphics, anchor: Pt, items: readonly Item[]): void {
    const pr = this.probe;
    this.holdLeft = Math.max(0, this.holdLeft - dtMs);
    pr.hold = this.holdLeft;
    for (const [id, age] of [...this.shakes]) {
      const a = age + dtMs;
      const p = SMASH_PROPS.find((x) => x.id === id);
      if (a >= BRANCH_SHAKE_MS) { this.shakes.delete(id); p && this.gfx.get(id)?.setX(p.at.x); } else { this.shakes.set(id, a); p && this.gfx.get(id)?.setX(p.at.x + branchShift(a)); }
    }
    for (const b of this.bursts) b.age += dtMs;
    for (const s of this.smokes) s.age += dtMs;
    this.bursts = this.bursts.filter((b) => b.age < DEBRIS_MS);
    this.smokes = this.smokes.filter((s) => s.age < SMOKE_MS);
    pr.debris = 0; pr.smoke = this.smokes.length;
    for (const b of this.bursts) for (const d of b.debris) {
      const q = debrisAt(d, b.p.at.y, b.age); if (q.alpha <= 0) continue;
      pr.debris++;
      g.fillStyle(OUT, q.alpha * 0.8).fillRect(Math.round(q.x) - 1, Math.round(q.y) - 1, d.w + 2, d.h + 2).fillStyle(d.color, q.alpha).fillRect(Math.round(q.x), Math.round(q.y), d.w, d.h);
    }
    for (const s of this.smokes) { const q = smokeAt(s.age); if (q) g.fillStyle(FX_PALETTE.smoke, q.alpha).fillCircle(s.x, s.y - q.rise, q.r).fillStyle(FX_PALETTE.foam, q.alpha * 0.5).fillCircle(s.x - 2, s.y - q.rise - 1, q.r * 0.5); }
    pr.findSizes = [];
    for (const it of items) { if (it.pop === undefined) continue; const sc = findScale(it.eat ?? -1); pr.findSizes.push(sc); drawFind(g, it.kind, it.x, it.y, sc); }
    this.toasts = stepToasts(this.toasts, dtMs);
    pr.toasts = this.toasts.map((t) => ({ kind: t.kind, count: t.count }));
    pr.toastText = [];
    this.labels.forEach((l, i) => {
      const t = this.toasts[i];
      if (!t) { l.setVisible(false); return; }
      const m = this.text(FIND_KEY[t.kind]).replace(/^\+1/, `+${t.count}`);
      if (l.text !== m) l.setText(m);
      l.setPosition(Math.round(anchor.x), Math.round(anchor.y - i * 15)).setAlpha(toastAlpha(t.age)).setVisible(true);
      pr.toastText.push(m); pr.toastAlpha = toastAlpha(t.age);
    });
    if (!this.toasts.length) pr.toastAlpha = 0;
  }
}
