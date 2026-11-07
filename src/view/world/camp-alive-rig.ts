// GAME-225 · «Живий табір»: малює й грає відгуки речей табору (математика й таблиці — camp-alive.ts). Нової графіки нема: крони й кущі — ті самі тайли набору
// (тремтить їхня копія з того ж тайлсету, оригінал на кадри гасне), решта — Graphics у палітрі гри. Усе покадрово, звук лише через src/audio.
import Phaser from 'phaser';
import { playCamp, campSounds } from '../../audio/camp-sounds';
import { calmMotion } from '../../platform/motion';
import type { Key } from '../../i18n';
import { SmashRig, SMASH_PROBE_IDLE, type SmashProbe } from './smash-rig';
import { SMASH_HINT, SMASH_PROPS, isFindKind, isSmashKind, pickSmash, planFinds, breaksAway, type Entity, type SmashProp } from './smash';
import { FX_PALETTE } from './fx-live';
import { HAND_FONT, TOP } from './hand-fx';
import {
  BINS, BIN_LID_Y, BIN_MS, LEAF_MS, PUDDLES, PUDDLE_R, REACTIONS, SEATS, SEAT_IDLE, SHAKE_MS, SIT_DY, SIT_ROWS, SPOUT, SWAY_MS, TAP_DROPS, TAP_MS, TREMBLE_MS,
  HINT_KEY, bendAt, bushShift, crownShift, dropAt, leafAt, leafPlan, lidHeight, markUsed, onPier, pickReaction, planDrops, ringAt, stepItems, stepPier, stepPuddles, stepSeat, trembleShift, usedToday,
  type Item, type Leaf, type Pt, type Reaction, type SeatEvent, type SeatState, type UseLog,
} from './camp-alive';

const OUT = 0x1b1f23;
const BOARD_SHOW_MS = 4200;

export interface CampProbe {
  sitting: boolean; seat: number; sits: number; stands: number;
  shakes: number; trembles: number; lastDrop: number; items: number; cones: number; berries: number;
  usedToday: string[]; leaves: number; crownShift: number; bushShift: number;
  puddles: number; splashes: number; rings: number;
  taps: number; bend: number; drops: number; binHops: number; lid: number; board: boolean; boardShown: number;
  pierSteps: number; hint: string; sounds: string[];
  /** GAME-228: розбивання (ящик, бочка, горщик, гілка). */
  smash: SmashProbe; plank: number; shard: number; twig: number;
}
export const CAMP_PROBE_IDLE: CampProbe = {
  sitting: false, seat: -1, sits: 0, stands: 0, shakes: 0, trembles: 0, lastDrop: 0, items: 0, cones: 0, berries: 0, usedToday: [], leaves: 0, crownShift: 0, bushShift: 0,
  puddles: 0, splashes: 0, rings: 0, taps: 0, bend: 0, drops: 0, binHops: 0, lid: 0, board: false, boardShown: 0, pierSteps: 0, hint: '', sounds: [], smash: SMASH_PROBE_IDLE, plank: 0, shard: 0, twig: 0,
};

interface Anim { readonly r: Reaction; age: number; readonly mode: 'shake' | 'tremble' | 'sway' | 'tap' | 'bin' }
interface Crown { readonly tiles: Phaser.Tilemaps.Tile[]; readonly layer: Phaser.Tilemaps.TilemapLayer | null; img: Phaser.GameObjects.Image | null; baseX: number; baseY: number }


export class CampAlive {
  private seatState: SeatState = SEAT_IDLE;
  private log: UseLog = {};
  /** GAME-244 ч.2: чи ядро вже віддало все з джерела сьогодні (ліміт «раз на день» живе в ядрі; власний `log` лише згладжує показ у межах сцени). Ставить сцена. */
  coreUsed: ((id: string, day: number) => boolean) | null = null;
  private foragedQueue: { kind: 'cone' | 'berry'; src: string }[] = [];
  private used(id: string, day: number): boolean { return usedToday(this.log, id, day) || (this.coreUsed?.(id, day) ?? false); }
  /** Підняті шишки й ягоди з джерелом — сцена віддає їх ядру (Forage) і спорожнює чергу. */
  takeForaged(): { kind: 'cone' | 'berry'; src: string }[] { const q = this.foragedQueue; this.foragedQueue = []; return q; }
  private items: Item[] = [];
  private leaves: { l: Leaf; age: number }[] = [];
  private anims: Anim[] = [];
  private nextId = 1;
  private puddleIn: number[] = [];
  private rings: { x: number; y: number; age: number }[] = [];
  private pierAcc = 0;
  private boardLeft = 0;
  private day = -1;
  private rain = false;
  private active = false;
  private crowns = new Map<string, Crown>();
  private fxG: Phaser.GameObjects.Graphics | null = null;
  private groundG: Phaser.GameObjects.Graphics | null = null;
  private berryG = new Map<string, Phaser.GameObjects.Graphics>();
  private owned: { destroy(): void }[] = [];
  private hint: Phaser.GameObjects.Text | null = null;
  private board: Phaser.GameObjects.Text | null = null;
  private readonly calm = calmMotion();
  private readonly smash: SmashRig;
  readonly probe: CampProbe = { ...CAMP_PROBE_IDLE };

  constructor(private readonly scene: Phaser.Scene, private readonly text: (key: Key) => string) {
    this.smash = new SmashRig(scene, text, (n) => this.sound(n));
  }

  get sitting(): boolean { return this.seatState.seat !== null; }
  get seatPoint(): { x: number; y: number; face: 'up' | 'left' | 'down' | 'right' } | null { const s = this.seatState.seat; return s === null ? null : SEATS[s] ?? null; }
  /** Сидячий герой: на скільки px опущений і скільки рядків кадру видно; інакше — повний кадр. */
  get sitLook(): { dy: number; rows: number } | null { return this.sitting ? { dy: SIT_DY, rows: SIT_ROWS } : null; }
  /** Нахил колонки (0..1) цього кадру: сцена присідає героєві. */
  get bend(): number { const a = this.anims.find((x) => x.mode === 'tap'); return a ? bendAt(a.age) : 0; }
  get collected(): { cones: number; berries: number } { return { cones: this.probe.cones, berries: this.probe.berries }; }
  /** GAME-228: після удару по ящику, бочці, горщику чи гілці герой завмирає на 5–7 кадрів. */
  get holdsHero(): boolean { return this.smash.holdsHero; }

  private sound(n: Parameters<typeof playCamp>[0]): void { playCamp(n); this.probe.sounds = campSounds.played.slice(-8); }

  /** Табір побудовано: лавки, дошка, ягоди на кущах; `layers` — шари крон (смуги `above`), звідки беруться тайли крон для тремтіння. */
  begin(layers: readonly Phaser.Tilemaps.TilemapLayer[]): void {
    this.reset();
    this.active = true;
    const s = this.scene;
    this.groundG = s.add.graphics().setDepth(-245);
    this.fxG = s.add.graphics().setDepth(99_000);
    this.hint = s.add.text(0, 0, '', HAND_FONT).setOrigin(0.5, 1).setDepth(TOP + 1).setVisible(false);
    this.board = s.add.text(0, 0, '', { ...HAND_FONT, wordWrap: { width: 170 } }).setOrigin(0.5, 1).setDepth(TOP + 1).setVisible(false);
    this.owned.push(this.groundG, this.fxG, this.hint, this.board, ...this.smash.begin());
    for (const seat of SEATS) { const g = s.add.graphics().setPosition(seat.x, seat.y).setDepth(seat.y + 0.5); drawBench(g); this.owned.push(g); }
    const bd = REACTIONS.find((r) => r.kind === 'board');
    if (bd) { const g = s.add.graphics().setPosition(bd.at.x, bd.at.y).setDepth(bd.at.y); drawBoard(g); this.owned.push(g); }
    this.ensureFrames();
    for (const r of REACTIONS) {
      if (!r.crown) continue;
      const tiles: Phaser.Tilemaps.Tile[] = []; let found: Phaser.Tilemaps.TilemapLayer | null = null;
      for (let y = r.crown.r; y < r.crown.r + r.crown.h; y++) for (let x = r.crown.c; x < r.crown.c + r.crown.w; x++) {
        for (const l of layers) { const t = l.getTileAt(x, y, true); if (t && t.index > 0) { tiles.push(t); found = l; break; } }
      }
      this.crowns.set(r.id, { tiles, layer: found, img: null, baseX: r.crown.c * 32, baseY: r.crown.r * 32 });
      if (r.kind === 'bush') { const g = s.add.graphics().setDepth(found ? found.depth + 1 : 400); this.berryG.set(r.id, g); this.owned.push(g); }
    }
    this.day = -1;
  }

  /** Кадри-вирізки тайлсету: крона сосни 2×4 тайли (960,0), крона куща 3×2 (768,384). */
  private ensureFrames(): void {
    const tex = this.scene.textures.get('lpc-terrain');
    if (!tex.has('life-pine')) tex.add('life-pine', 0, 960, 0, 64, 128);
    if (!tex.has('life-bush')) tex.add('life-bush', 0, 768, 384, 96, 64);
  }

  reset(): void {
    this.active = false;
    for (const c of this.crowns.values()) { for (const t of c.tiles) t.alpha = 1; c.img?.destroy(); }
    this.crowns.clear();
    for (const o of this.owned) o.destroy();
    this.owned = []; this.berryG.clear();
    this.fxG = null; this.groundG = null; this.hint = null; this.board = null;
    this.smash.reset();
    this.seatState = SEAT_IDLE; this.log = {}; this.foragedQueue = []; this.items = []; this.leaves = []; this.anims = []; this.puddleIn = []; this.rings = []; this.pierAcc = 0; this.boardLeft = 0;
    Object.assign(this.probe, CAMP_PROBE_IDLE, { sounds: [], usedToday: [] });
  }

  /** Лавка: кадр. Повертає подію; на «сів» герой стає на точку лавки (сцена ставить тіло), на «встав» — іде далі. */
  stepSeat(dtMs: number, hero: Pt, moving: boolean, busy: boolean): SeatEvent {
    if (!this.active) return null;
    const r = stepSeat(this.seatState, SEATS, hero, moving, busy, dtMs);
    this.seatState = r.state;
    const p = this.probe;
    if (r.event === 'sit') { p.sits++; this.sound('sit'); }
    if (r.event === 'stand') { p.stands++; }
    p.sitting = this.sitting; p.seat = this.seatState.seat ?? -1;
    return r.event;
  }

  /** Річ, на яку діє герой зараз (E/●), або null. */
  pick(hero: Pt, animals: readonly Pt[] = []): Reaction | SmashProp | null {
    if (!this.active || this.sitting || this.smash.holdsHero) return null;
    const a = pickReaction(hero); const b = this.pickBreakable(hero, animals);
    if (!a || !b) return a ?? b;
    return Math.hypot(hero.x - b.at.x, hero.y - b.at.y) < Math.hypot(hero.x - a.at.x, hero.y - a.at.y) ? b : a;
  }

  /** GAME-228: розбивна річ поруч (розбиті сьогодні не беруться). Тварини передаються як `animals`, але ніколи не цілі (pickSmash). */
  private pickBreakable(hero: Pt, animals: readonly Pt[]): SmashProp | null {
    const standing = SMASH_PROPS.filter((p) => !(breaksAway(p.kind) && this.used(p.id, this.day)));
    const others: Entity[] = animals.map((at, i) => ({ id: `animal.${i}`, kind: 'animal', at, range: 40 }));
    return pickSmash(hero, standing, others);
  }

  /** Дія (E/●) над річчю `r`: тремтіння/гойдання, частинки, звук; шишки й ягоди — раз на день. Повертає, що сталося. */
  act(r: Reaction | SmashProp, hero: Pt, day: number): 'shake' | 'tremble' | 'sway' | 'tap' | 'bin' | 'board' | 'smash' {
    const p = this.probe;
    if (isSmashKind(r.kind)) return this.actSmash(r as SmashProp, hero, day);
    r = r as Reaction;
    if (r.kind === 'pine' || r.kind === 'bush') {
      const pine = r.kind === 'pine';
      if (this.used(r.id, day)) {
        this.anims.push({ r, age: 0, mode: 'tremble' }); p.trembles++;   // той самий день: лише ледь здригнулось, нічого не впало
        this.sound('leaf');
        return 'tremble';
      }
      this.log = markUsed(this.log, r.id, day);
      p.usedToday = Object.keys(this.log).filter((k) => this.log[k] === day);
      this.anims.push({ r, age: 0, mode: pine ? 'shake' : 'sway' });
      const from = pine ? { x: r.at.x, y: r.at.y - 118 } : { x: r.at.x, y: r.at.y - 8 };
      const d = Math.hypot(hero.x - r.at.x, hero.y - r.at.y) || 1;
      const land = pine ? { x: r.at.x, y: r.at.y } : { x: r.at.x + ((hero.x - r.at.x) / d) * 34, y: r.at.y + ((hero.y - r.at.y) / d) * 34 };
      const drops = planDrops(r.kind, r.id, day, from, land, this.nextId, this.calm);
      this.nextId += drops.length;
      this.items.push(...drops);
      p.shakes++; p.lastDrop = drops.length; p.items = this.items.length;
      if (!this.calm) this.leaves.push(...leafPlan(r.id, day, from).map((l) => ({ l, age: 0 })));
      this.sound(pine ? 'thud' : 'leaf');
      return pine ? 'shake' : 'sway';
    }
    if (r.kind === 'tap') { this.anims = this.anims.filter((a) => a.mode !== 'tap'); this.anims.push({ r, age: 0, mode: 'tap' }); p.taps++; this.sound('water'); return 'tap'; }
    if (r.kind === 'bin') { this.anims = this.anims.filter((a) => a.mode !== 'bin'); this.anims.push({ r, age: 0, mode: 'bin' }); p.binHops++; this.sound('clank'); return 'bin'; }
    this.boardLeft = BOARD_SHOW_MS; p.boardShown++; this.sound('paper');
    return 'board';
  }

  /** Удар по речі табору: раз на день (ящик, бочка, горщик — зникають до наступної доби; гілка лишається й повторно лише здригається). */
  private actSmash(r: SmashProp, hero: Pt, day: number): 'smash' | 'tremble' {
    if (this.used(r.id, day)) { this.smash.tremble(r); this.probe.trembles++; return 'tremble'; }
    this.log = markUsed(this.log, r.id, day);
    this.smash.hit(r, day, this.calm);
    const finds = planFinds(r, day, hero, this.nextId, this.calm);
    this.nextId += finds.length;
    this.items.push(...finds);
    this.probe.items = this.items.length; this.probe.lastDrop = finds.length;
    this.probe.usedToday = Object.keys(this.log).filter((k) => this.log[k] === day);
    this.probe.smash = this.smash.probe;
    return 'smash';
  }

  /** Кадр світу: падіння/магніт, калюжі, кроки по пірсу, тремтіння крон, малювання. */
  update(dtMs: number, f: { hero: Pt; moving: boolean; movedPx: number; day: number; rain: boolean; hintOn: boolean; toastAt?: Pt; animals?: readonly Pt[]; canForage?: (k: 'cone' | 'berry', src: string) => boolean }): void {
    const g = this.fxG; const gg = this.groundG;
    if (!this.active || !g || !gg) return;
    const p = this.probe;
    if (f.day !== this.day || f.rain !== this.rain) { this.day = f.day; this.rain = f.rain; this.redrawStatic(); }
    // Предмети: падіння, магніт, підбір («поп» і «+1» над героєм).
    const st = stepItems(this.items, f.hero, dtMs);
    this.items = st.items;
    st.collected.forEach((k, i) => {
      if (isFindKind(k)) { p[k]++; this.smash.toast(k); this.sound('pop'); return; }   // GAME-228: знахідка — плашка біля кута замість сплива над героєм
      if (k === 'cone') p.cones++; else p.berries++;
      const src = st.collectedSrc[i];
      if (src !== undefined) this.foragedQueue.push({ kind: k === 'cone' ? 'cone' : 'berry', src });
      if (f.canForage && !f.canForage(k === 'cone' ? 'cone' : 'berry', src ?? '')) return;   // GAME-235: інвентар повний (20) — нічого не додано, плашки «+1» немає
      this.smash.toast(k === 'cone' ? 'cone' : 'berry'); this.sound('pop');   // GAME-229: «+1 Шишка» — плашка в куті, як знахідки (GAME-228), а не цифра над героєм
    });
    p.items = this.items.length;
    // Калюжі: лише в дощові дні.
    if (this.rain) {
      const r = stepPuddles(this.puddleIn, PUDDLES, f.hero, f.moving);
      this.puddleIn = r.inside;
      for (const i of r.splashed) { const q = PUDDLES[i]; if (q) { if (!this.calm) this.rings.push({ x: q.x, y: q.y, age: 0 }); p.splashes++; this.sound('splash'); } }
    } else this.puddleIn = [];
    // Кроки по пірсу — дерев'яний звук.
    const pr = stepPier(this.pierAcc, onPier(f.hero.x, f.hero.y), f.moving ? f.movedPx : 0);
    this.pierAcc = pr.acc;
    if (pr.step) { p.pierSteps++; this.sound('plank'); }
    // Тремтіння, листя, кільця — з віку.
    for (const a of this.anims) a.age += dtMs;
    for (const l of this.leaves) l.age += dtMs;
    for (const r of this.rings) r.age += dtMs;
    this.leaves = this.leaves.filter((l) => l.age < LEAF_MS);
    this.rings = this.rings.filter((r) => ringAt(r.age) !== null);
    this.anims = this.anims.filter((a) => a.age < animLen(a.mode));
    this.boardLeft = Math.max(0, this.boardLeft - dtMs);
    this.drawCrowns();
    // Малювання кадру: предмети, листя, кільця, краплі колонки, кришки.
    g.clear();
    for (const it of this.items) {
      if (it.pop !== undefined) continue;   // знахідки малює SmashRig
      if (it.kind === 'cone') { g.fillStyle(OUT, 0.35).fillEllipse(it.x, it.y + 2, 7, 3); g.fillStyle(0x6b4423, 1).fillEllipse(it.x, it.y - 3, 5, 8); g.fillStyle(0xb98852, 1).fillRect(Math.round(it.x) - 1, Math.round(it.y) - 6, 2, 2).fillRect(Math.round(it.x), Math.round(it.y) - 2, 2, 2); }
      else { g.fillStyle(OUT, 0.3).fillEllipse(it.x, it.y + 1, 5, 2); g.fillStyle(0x7a2a6b, 1).fillCircle(it.x, it.y - 2, 2.2); g.fillStyle(0xd9a0f0, 1).fillRect(Math.round(it.x), Math.round(it.y) - 3, 1, 1); }
    }
    p.leaves = this.leaves.length;
    this.smash.update(dtMs, g, f.toastAt ?? { x: f.hero.x - 60, y: f.hero.y + 60 }, this.items);
    p.smash = this.smash.probe;
    for (const { l, age } of this.leaves) { const q = leafAt(l, age); g.fillStyle(l.color ? FX_PALETTE.grassDark : FX_PALETTE.grass, q.alpha).fillRect(Math.round(q.x), Math.round(q.y), 2, 2); }
    p.rings = this.rings.length;
    for (const r of this.rings) { const q = ringAt(r.age); if (q) g.lineStyle(1, FX_PALETTE.foam, q.alpha).strokeEllipse(r.x, r.y, q.r * 2, q.r * 0.8); }
    const tap = this.anims.find((a) => a.mode === 'tap');
    p.bend = tap ? bendAt(tap.age) : 0; p.drops = 0;
    if (tap) for (let i = 0; i < TAP_DROPS; i++) {
      const d = dropAt(i, tap.age); if (!d) continue;
      p.drops++;
      if (d.ground) g.lineStyle(1, FX_PALETTE.water, d.alpha).strokeEllipse(SPOUT.x, SPOUT.y + 12, 8, 3); else g.fillStyle(FX_PALETTE.water, 1).fillRect(SPOUT.x - 1, SPOUT.y + d.y, 2, 3);
    }
    const bin = this.anims.find((a) => a.mode === 'bin');
    p.lid = 0;
    if (bin) BINS.forEach((b, i) => {
      const h = lidHeight(bin.age, i * 40); p.lid = Math.max(p.lid, h);
      if (h <= 0) return;
      const y = BIN_LID_Y - Math.round(h);
      g.fillStyle(OUT, 1).fillRect(b.x - 1, y - 1, b.w + 2, 6).fillStyle(b.color, 1).fillRect(b.x, y, b.w, 4).fillStyle(b.light, 1).fillRect(b.x + 1, y, b.w - 4, 1);
    });
    const sk = this.anims.find((a) => a.mode === 'shake'); const bw = this.anims.find((a) => a.mode === 'sway');
    p.crownShift = sk ? crownShift(sk.age) : 0; p.bushShift = bw ? bushShift(bw.age) : 0;
    p.puddles = this.rain ? PUDDLES.length : 0;
    p.sitting = this.sitting;
    // Дошка й підказка: лише біля речі.
    const board = this.board; const hint = this.hint;
    const bd = REACTIONS.find((r) => r.kind === 'board');
    p.board = this.boardLeft > 0;
    if (board && bd) {
      if (this.boardLeft > 0 && Math.hypot(f.hero.x - bd.at.x, f.hero.y - bd.at.y) <= bd.range * 2) { const m = this.text('life.board'); if (board.text !== m) board.setText(m); board.setPosition(Math.round(bd.at.x), Math.round(bd.at.y - 34)).setVisible(true); } else board.setVisible(false);
    }
    const near = f.hintOn && !this.sitting ? this.pick(f.hero, f.animals) : null;
    const show = near && near.kind !== 'board' || (near?.kind === 'board' && this.boardLeft <= 0) ? near : null;
    const has = show && ((show.kind !== 'pine' && show.kind !== 'bush' && !isSmashKind(show.kind)) || !this.used(show.id, f.day));
    if (hint) {
      if (show && has) { const m = this.text(isSmashKind(show.kind) ? SMASH_HINT[show.kind] : HINT_KEY[show.kind]); if (hint.text !== m) hint.setText(m); hint.setPosition(Math.round(show.at.x), Math.round(show.at.y - (show.kind === 'pine' ? 14 : isSmashKind(show.kind) ? 28 : 32))).setVisible(true); p.hint = show.id; }
      else { hint.setVisible(false); p.hint = ''; }
    }
  }

  /** Тайли крон: тремтіння — копія з тайлсету зсувається, оригінал на ці кадри гасне (alpha 0); копія береться з прозорістю смуги (крона над героєм напівпрозора). */
  private drawCrowns(): void {
    for (const r of REACTIONS) {
      const c = this.crowns.get(r.id);
      if (!c) continue;
      const a = this.anims.find((x) => x.r.id === r.id && (x.mode === 'shake' || x.mode === 'sway' || x.mode === 'tremble'));
      if (!a) { if (c.img) { c.img.destroy(); c.img = null; for (const t of c.tiles) t.alpha = 1; } continue; }
      const dx = this.calm ? 0 : a.mode === 'shake' ? crownShift(a.age) : a.mode === 'sway' ? bushShift(a.age) : trembleShift(a.age);
      if (!c.img) {
        c.img = this.scene.add.image(c.baseX, c.baseY, 'lpc-terrain', r.kind === 'pine' ? 'life-pine' : 'life-bush').setOrigin(0, 0);
        for (const t of c.tiles) t.alpha = 0;
      }
      c.img.setPosition(c.baseX + dx, c.baseY).setDepth((c.layer?.depth ?? 400) + 0.1).setAlpha(c.layer?.alpha ?? 1);
    }
  }

  /** Те, що міняється раз на добу чи погоду: калюжі на стежках (дощ), ягоди на кущах (до першого трусу цього дня). */
  private redrawStatic(): void {
    const gg = this.groundG;
    if (!gg) return;
    gg.clear();
    if (this.rain) for (const q of PUDDLES) { gg.fillStyle(FX_PALETTE.water, 0.5).fillEllipse(q.x, q.y, PUDDLE_R * 2, 8); gg.fillStyle(FX_PALETTE.foam, 0.45).fillEllipse(q.x - 3, q.y - 1, 8, 2); }
    this.smash.redraw(SMASH_PROPS.filter((q) => this.used(q.id, this.day)).map((q) => q.id));
    for (const [id, bg] of this.berryG) {
      bg.clear();
      const r = REACTIONS.find((x) => x.id === id);
      if (!r || this.used(id, this.day)) continue;
      for (let i = 0; i < 7; i++) { const x = Math.round(r.at.x + ((i * 37) % 61) - 30); const y = Math.round(r.at.y - 30 + ((i * 23) % 31)); bg.fillStyle(0x7a2a6b, 1).fillCircle(x, y, 2).fillStyle(0xd9a0f0, 1).fillRect(x, y - 1, 1, 1); }
    }
  }

  /** Після дії дня ягоди на кущі зникають — перемалювати (сцена викликає після act). */
  refresh(): void { this.redrawStatic(); }
}

const animLen = (m: Anim['mode']): number => (m === 'shake' ? SHAKE_MS : m === 'sway' ? SWAY_MS : m === 'tremble' ? TREMBLE_MS : m === 'tap' ? TAP_MS : BIN_MS + 80);

/** Лавка: дошка сидіння, дві ніжки, світло зліва згори, контур; точка (0,0) — ноги сидячого героя. */
function drawBench(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(OUT, 0.35).fillEllipse(0, 6, 34, 8);
  g.fillStyle(OUT, 1).fillRect(-14, -7, 28, 9).fillRect(-12, 2, 4, 6).fillRect(8, 2, 4, 6);
  g.fillStyle(0x6b4423, 1).fillRect(-13, -2, 26, 3).fillRect(-11, 2, 2, 5).fillRect(9, 2, 2, 5);
  g.fillStyle(0xb98852, 1).fillRect(-13, -6, 26, 4);
  g.fillStyle(0xd9a860, 1).fillRect(-13, -6, 26, 1);
}

/** Дошка оголошень: стовпчик, дошка з папірцями; точка (0,0) — основа. */
function drawBoard(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(OUT, 0.35).fillEllipse(0, 1, 22, 6);
  g.fillStyle(0x6b4423, 1).fillRect(-8, -14, 3, 15).fillRect(5, -14, 3, 15);
  g.fillStyle(OUT, 1).fillRect(-12, -34, 24, 20);
  g.fillStyle(0xb98852, 1).fillRect(-11, -33, 22, 18);
  g.fillStyle(0xf4ecd2, 1).fillRect(-9, -31, 8, 7).fillRect(0, -31, 9, 5).fillRect(-8, -22, 10, 5);
  g.fillStyle(0x3b3a44, 1).fillRect(-8, -29, 6, 1).fillRect(1, -29, 7, 1).fillRect(-7, -20, 8, 1);
}
