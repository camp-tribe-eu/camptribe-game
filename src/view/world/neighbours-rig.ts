// GAME-226 · «Живі сусіди»: малює й веде сусідів табору за станами з neighbours.ts. Нової графіки нема: той самий лист ходьби LPC; книга, рука привітання й значки —
// кілька пікселів Graphics у палітрі гри. Усе покадрово (лічильник кадрів, жодних твінів і таймерів), звуку тут нема.
import Phaser from 'phaser';
import { idlePose } from './idle-poses';
import { facingToward } from '../npc-talk';
import { FRAME, frameIndex, type Dir } from './character';
import { SEATS, SIT_DY, SIT_ROWS } from './camp-alive';
import { walkableAt, type Timeline } from './ambient';
import type { Grid, Pt } from './follow';
import {
  EMOTES, EMOTE_COLORS, EMOTE_DY, HOMES, MIND0, activityFor, emoteScale, flipping, lookDir, nightOf, pagesTurned, planHome, routeAt, seatNear, sinceEvening, stepMind, stopIndexAt, waveFrame, workFrame,
  emoteShiftX, heldBy, type Emote, type HomePlan, type Mind, type NState, type Route, type RoutePhase,
} from './neighbours';

const INK = 0x1b1f23;
const SKIN = 0xf1c27d;
const COVER = 0x8a4b2d;
const PAGE = 0xf4f1e8;
/** Обхід героя: на скільки px зсувається сусід убік. */
const SIDE_STEP = 28;
/** Скільки кадрів ПІСЛЯ розмови сусід ще стоїть, не крутячи головою (поки розмова триває — тримає setTalking, без ліміту кадрів). */
export const HOLD_FRAMES = 90;
/** GAME-231: килимок під тим, хто сидить чи спить біля намету на голій траві (без нього «провалюється»). Кольори — з палітри гри. */
const MAT_EDGE = 0x5a3a22;
const MAT_FILL = 0xc9a66b;
const MAT_STRIPE = 0xa98550;

export interface NeighbourProbe {
  id: string; state: NState; phase: RoutePhase; x: number; y: number; emote: Emote | null; emoteAge: number; waveDay: number; waves: number; pages: number; off: Pt; sitting: boolean; /** GAME-248: назва пози простою ('' — іде/зайнятий, 'rest' — стоїть між звичками) і висота видимої частини спрайта (64 = повний зріст; менше — лише на лавці). */ pose: string; cropRows: number;
  /** GAME-231: кадрів у цьому стані (для e2e: «стоїть > 90 кадрів поспіль» — без залежності від fps). */
  f: number;
}
const mod = (a: number, n: number): number => ((a % n) + n) % n;

export class Neighbours {
  private minds: Mind[] = [];
  private holds: number[] = [];
  /** GAME-231: з ким зараз триває розмова (id мешканця) — тримає його стоячим УСЮ розмову, а не лише HOLD_FRAMES. */
  private talking: string | null = null;
  private fire: Pt | null = null;
  private mats: Phaser.GameObjects.Graphics[] = [];
  private plans = new Map<string, HomePlan | null>();
  private bodies: Phaser.GameObjects.Graphics[] = [];
  private top: Phaser.GameObjects.Graphics | null = null;
  private cropped: boolean[] = [];
  private sat: boolean[] = [];
  private standMs: number[] = [];
  private poseName: string[] = [];
  private dt = 1000 / 60;
  private waves: number[] = [];
  /** День останнього привітання — живе довше за мапу: табір→крамниця→табір не махає вдруге того ж дня. */
  private waveDays = new Map<string, number>();
  private ids: readonly string[] = [];
  readonly probe: NeighbourProbe[] = [];

  constructor(private readonly scene: Phaser.Scene, private readonly depthTop: number) {}

  /** Нова мапа: пам'ять і малюнки з нуля. Малюнки створюються під потрібну кількість сусідів. */
  begin(ids: readonly string[]): void {
    this.destroy();
    this.ids = ids;
    this.minds = ids.map((id) => ({ ...MIND0, waveDay: this.waveDays.get(id) ?? -1 }));
    this.holds = ids.map(() => 0);
    this.cropped = ids.map(() => false);
    this.sat = ids.map(() => false);
    this.standMs = ids.map(() => 0);
    this.poseName = ids.map(() => '');
    this.waves = ids.map(() => 0);
    this.plans.clear();
    this.bodies = ids.map(() => this.scene.add.graphics());
    this.mats = ids.map(() => this.scene.add.graphics());
    this.talking = null;
    this.fire = null;
    this.top = this.scene.add.graphics().setDepth(this.depthTop);
    this.probe.length = 0;
    ids.forEach((id) => this.probe.push({ id, state: 'stand', phase: 'out', x: 0, y: 0, emote: null, emoteAge: 0, waveDay: -1, waves: 0, pages: 0, off: { x: 0, y: 0 }, sitting: false, pose: '', cropRows: FRAME, f: 0 }));
  }

  destroy(): void {
    for (const g of this.bodies) g.destroy();
    this.bodies = [];
    for (const g of this.mats) g.destroy();
    this.mats = [];
    this.top?.destroy();
    this.top = null;
  }

  /** Розмова: сусід стоїть і не крутить головою кілька кадрів. */
  hold(i: number): void { this.holds[i] = HOLD_FRAMES; }
  /** Розмова з мешканцем `id` відкрита (сигнал — діалог ядра `game.dialogue !== null`, його дає сцена) чи закрита (null). Поки відкрита — сусід стоїть. */
  setTalking(id: string | null): void {
    if (id === null && this.talking !== null) { const i = this.ids.indexOf(this.talking); if (i >= 0) this.holds[i] = HOLD_FRAMES; }   // розмова скінчилась — ще мить стоїть, а не «падає» в сон посеред кадру
    this.talking = id;
  }
  /** GAME-230: реакція на подарунок — значок над головою мешканця `id` (♥ чи «…»), той самий життєвий цикл, що в решти значків (EMOTE_FRAMES кадрів). false — такого мешканця тут нема. */
  react(id: string, e: Emote): boolean {
    const i = this.ids.indexOf(id);
    const m = this.minds[i];
    if (!m) return false;
    this.minds[i] = { ...m, emote: e, emoteAge: 0 };
    return true;
  }
  /** Вогнище табору (для зсуву значків над головою); null — нема. */
  setFire(p: Pt | null): void { this.fire = p; }
  state(i: number): NState { return this.minds[i]?.state ?? 'stand'; }
  /** Сусід спить чи сидить біля намету — «мугикання» вечора йому не пасує. */
  quiet(i: number): boolean { const s = this.minds[i]?.state; return s === 'sleep' || (s === 'sit' && this.probe[i]?.phase === 'home'); }

  /** Кадр сусіда `i`: рахує, де він і що робить, ставить спрайт і малює дрібниці. Повертає ЛОГІЧНУ точку (за розкладом/дорогою) для проби й дзвінка. */
  drive(i: number, s: Phaser.GameObjects.Sprite, grid: Grid, tl: Timeline, minutes: number, hero: Pt | null, raining: boolean, barking: boolean, facing: Dir, dtMs = 1000 / 60): Route {
    this.dt = dtMs;
    const res = tl.resident;
    const home = HOMES[res.id];
    const night = nightOf(minutes);
    const key = `${i}:${night}:${raining}`;
    let plan = this.plans.get(key);
    if (plan === undefined && home) {
      plan = planHome(grid, tl, home, minutes - sinceEvening(minutes), raining);
      if (this.plans.size > 48) this.plans.clear();
      this.plans.set(key, plan);
    }
    const route = routeAt(grid, tl, home ?? { c: 0, r: 0 }, home ? plan ?? null : null, minutes);
    const prev = this.minds[i] ?? MIND0;
    const dist = hero ? Math.hypot(hero.x - route.x, hero.y - route.y) : Infinity;
    const stopIdx = route.phase === 'out' && !route.moving ? stopIndexAt(res, grid, route) : -1;
    const seat = stopIdx >= 0 ? seatNear(route) : -1;
    const seatPt = seat >= 0 ? SEATS[seat] : undefined;
    const bench = seatPt ? { x: seatPt.x - route.x, y: seatPt.y - route.y } : null;
    const side = hero && dist < 60 ? this.sideStep(grid, route, hero) : null;
    const left = this.holds[i] ?? 0;
    const hold = heldBy(left, this.talking, res.id);
    if (left > 0) this.holds[i] = left - 1;
    const tod = mod(minutes + 480, 1440);
    const m = stepMind(prev, { tod, day: Math.floor((minutes + 480) / 1440), phase: route.phase, moving: route.moving, dist, raining, activity: activityFor(i, stopIdx, seat), side, bench, hold });
    this.minds[i] = m;
    const id = this.ids[i];
    if (id !== undefined && m.waveDay >= 0) this.waveDays.set(id, m.waveDay);
    if (m.state === 'wave' && prev.state !== 'wave') this.waves[i] = (this.waves[i] ?? 0) + 1;
    this.show(i, s, route, m, hero, facing, seatPt?.face ?? null);
    this.emoteOf(i, s, m, barking);
    const p = this.probe[i];
    if (p) Object.assign(p, { state: m.state, phase: route.phase, x: s.x, y: s.y, emote: m.emote, emoteAge: m.emoteAge, waveDay: m.waveDay, waves: this.waves[i] ?? 0, pages: pagesTurned(m.f), off: { x: Math.round(m.off.x), y: Math.round(m.off.y) }, sitting: this.sat[i] === true, pose: this.poseName[i] ?? '', cropRows: this.cropped[i] ? SIT_ROWS : FRAME, f: m.f });
    return route;
  }

  /** Куди зсунутись від героя: напрямок «від нього» й обидва боки поперек — перший, де прохідно. */
  private sideStep(grid: Grid, at: Pt, hero: Pt): Pt | null {
    const d = Math.hypot(at.x - hero.x, at.y - hero.y) || 1;
    const ax = (at.x - hero.x) / d; const ay = (at.y - hero.y) / d;
    for (const [dx, dy] of [[ax, ay], [-ay, ax], [ay, -ax]] as const) {
      const p = { x: at.x + dx * SIDE_STEP, y: at.y + dy * SIDE_STEP };
      if (walkableAt(grid, p) && walkableAt(grid, { x: at.x + dx * SIDE_STEP * 0.5, y: at.y + dy * SIDE_STEP * 0.5 })) return { x: dx * SIDE_STEP, y: dy * SIDE_STEP };
    }
    return null;
  }

  private show(i: number, s: Phaser.GameObjects.Sprite, route: Route, m: Mind, hero: Pt | null, facing: Dir, seatFace: Dir | null): void {
    const look = s.texture.key.replace(/^res-/, '');
    const x = route.x + m.off.x;
    const y = route.y + m.off.y;
    const st = m.state;
    const sitting = st === 'sleep' || st === 'sit';
    const onSeat = st === 'sit' && seatFace !== null;
    let dir: Dir = facing;
    let dy = 0;
    let squash = 1;
    const walking = (st === 'walk' || st === 'hurry' || (st === 'around' && route.moving)) && route.moving;
    if (walking) dir = route.dir;
    else if (st === 'wave' || st === 'around') dir = hero ? facingToward({ x, y }, hero) : dir;
    else if (st === 'look') dir = lookDir(m.f);
    else if (st === 'sit') dir = route.phase === 'home' ? 'down' : seatFace ?? 'down';
    else if (st === 'sleep' || st === 'read' || st === 'work') dir = 'down';
    if (walking) {
      s.anims.timeScale = st === 'hurry' ? 1.5 : 1;
      s.anims.play(`walk-res-${look}-${dir}`, true);
      this.standMs[i] = 0;
      this.poseName[i] = '';
    } else {
      s.anims.stop();
      // GAME-248: стоїть (або «біля намету») — звичка людини з листа ходьби; без дихання на 1 px (читалось як посмикування).
      const calm = st === 'stand' || (st === 'sit' && !onSeat);
      this.standMs[i] = calm ? (this.standMs[i] ?? 0) + this.dt : 0;
      const pose = calm ? idlePose(look, this.standMs[i] ?? 0, i) : null;
      this.poseName[i] = pose ? pose.name : calm ? 'rest' : '';
      s.setFrame(frameIndex(pose?.dir ?? dir, pose && pose.sheet === 'walk' ? pose.col : 0));
    }
    if (st === 'work') { const w = workFrame(m.f); dy = w; squash = 1 - 0.05 * w; }
    // GAME-248: повний зріст скрізь; сидіння — лише на лавці (SIT_DY і підрізані ноги, як у героя), на голій землі й ночі не обрізаємо.
    this.sat[i] = sitting;
    if (onSeat) dy = SIT_DY;
    if (onSeat && !this.cropped[i]) { s.setCrop(0, 0, FRAME, SIT_ROWS); this.cropped[i] = true; }
    else if (!onSeat && this.cropped[i]) { s.setCrop(); this.cropped[i] = false; }
    s.setScale(1, squash).setPosition(x, y + dy).setDepth(y);
    // Книга в руках і рука привітання: кілька пікселів поверх спрайта.
    const mat = this.mats[i];
    if (mat) {
      mat.clear().setDepth(y - 1);
      if (sitting && route.phase === 'home' && !onSeat) {
        // Килимок під сидячим: спрайт (origin 0,9 висоти) обрізано на SIT_ROWS із 64, тож нижній край тіла — на y + SIT_DY − 0,1·FRAME + 0,9·… ≈ y − 5,6; килимок виглядає з-під нього на 2–6 px.
        const my = y - 3;
        mat.fillStyle(MAT_EDGE, 1).fillEllipse(x, my, 34, 13);
        mat.fillStyle(MAT_FILL, 1).fillEllipse(x, my, 30, 10);
        mat.fillStyle(MAT_STRIPE, 1).fillRect(x - 11, my + 2, 22, 1);
      }
    }
    const g = this.bodies[i];
    if (!g) return;
    g.clear().setDepth(y + 1);
    if (st === 'read') {
      const left = flipping(m.f);
      g.fillStyle(INK, 1).fillRect(x - 6, y - 24, 12, 8);
      g.fillStyle(COVER, 1).fillRect(x - 5, y - 23, 10, 6);
      g.fillStyle(PAGE, 1).fillRect(x - 4, y - 22, left ? 3 : 4, 4).fillRect(x + (left ? 1 : 0), y - 22, left ? 3 : 4, 4);
    } else if (st === 'wave') {
      const up = waveFrame(m.f) === 1;
      const hx = x + (dir === 'left' ? -11 : 11);
      const hy = y - (up ? 40 : 30);
      g.fillStyle(INK, 1).fillRect(hx - 3, hy - 3, 6, 6);
      g.fillStyle(SKIN, 1).fillRect(hx - 2, hy - 2, 4, 4);
    }
  }

  private emoteOf(i: number, s: Phaser.GameObjects.Sprite, m: Mind, barking: boolean): void {
    const g = this.top;
    if (!g) return;
    if (i === 0) g.clear();
    if (!m.emote || barking || !s.visible) return;
    const k = emoteScale(m.emoteAge);
    if (k <= 0) return;
    const cell = 2;
    const rows = EMOTES[m.emote];
    const ox = Math.round(s.x - 5 + emoteShiftX(s, this.fire));
    const oy = Math.round(s.y - EMOTE_DY + (1 - k) * 6);
    g.fillStyle(INK, k);
    rows.forEach((row, ry) => { for (let rx = 0; rx < row.length; rx++) if (row[rx] === '#') g.fillRect(ox + rx * cell - 1, oy + ry * cell - 1, cell + 2, cell + 2); });
    g.fillStyle(EMOTE_COLORS[m.emote], k);
    rows.forEach((row, ry) => { for (let rx = 0; rx < row.length; rx++) if (row[rx] === '#') g.fillRect(ox + rx * cell, oy + ry * cell, cell, cell); });
  }
}
