// GAME-225 · «Живий табір»: речі табору відгукуються на героя — лавка, сосна, ягідний кущ, калюжі, колонка, смітник, дошка, дошки пірса.
// Правило «три відгуки» (research/game-feel.md): рух предмета + частинки + звук матеріалу. Тут лише ЧИСТА математика й таблиці (без Phaser, без таймерів,
// без випадковості: «випадкове» — хеш від (дерево, день)); малює й грає camp-alive-rig.ts. Усе рахується від кадру гри (сторож no-realtime).
// Стан тут — лише показ: ні ядро, ні сейв його не знають (жодного прапорця → нічого в SIDE, content/side.ts); день і погоду сцена бере з годинника й зерна світу.
import type { Key } from '../../i18n';
import { hash01 } from './fx-live';
import type { Dir } from './character';

export type Pt = { readonly x: number; readonly y: number };

/** Тривалість одного «кадру» анімації предмета (≈ 15 к/с): тремтіння крони — 4 такі кадри, куща — 3. */
export const FRAME_MS = 66;

// ---------- Мапа табору (піксельні координати мапи camp-lake; сторож camp-alive.test.ts звіряє їх із .tmj) ----------

/** Лавки: точка сидіння (ноги героя), напрямок погляду. Точки не в центрі клітинки (≥ SIT_R + 4 px), щоб маршрут, що йде центрами клітинок, не саджав сам. */
export interface Seat { readonly x: number; readonly y: number; readonly face: Dir }
export const SEATS: readonly Seat[] = [
  { x: 506, y: 552, face: 'up' },     // лавка під столом ділянки P2
  { x: 838, y: 264, face: 'right' },  // лавка на березі, обличчям до озера
  { x: 100, y: 198, face: 'up' },     // лавка біля вогнища, обличчям до нього
];

export type ReactionKind = 'pine' | 'bush' | 'tap' | 'bin' | 'board';
/** Річ, на яку діють (E/●): `at` — точка взаємодії, `range` — радіус, `crown` — тайли крони (лівий верхній тайл, ширина, висота), що трусяться. */
export interface Reaction { readonly id: string; readonly kind: ReactionKind; readonly at: Pt; readonly range: number; readonly crown?: { readonly c: number; readonly r: number; readonly w: number; readonly h: number } }
const pine = (id: string, c: number, r: number): Reaction => ({ id, kind: 'pine', at: { x: (c + 1) * 32, y: (r + 5) * 32 - 4 }, range: 44, crown: { c, r, w: 2, h: 4 } });
const bush = (id: string, c: number, r: number): Reaction => ({ id, kind: 'bush', at: { x: (c + 1.5) * 32, y: (r + 1.5) * 32 }, range: 80, crown: { c, r, w: 3, h: 2 } });
export const REACTIONS: readonly Reaction[] = [
  pine('pine.camp', 8, 7), pine('pine.forest.1', 32, 11), pine('pine.forest.2', 34, 11), pine('pine.forest.3', 36, 11), pine('pine.forest.4', 38, 11),
  bush('bush.camp.1', 0, 9), bush('bush.camp.2', 3, 9),
  { id: 'tap.camp', kind: 'tap', at: { x: 656, y: 222 }, range: 44 },
  { id: 'bins.camp', kind: 'bin', at: { x: 575, y: 214 }, range: 52 },
  { id: 'board.camp', kind: 'board', at: { x: 464, y: 188 }, range: 48 },
];
export const SPOUT: Pt = { x: 662, y: 211 };
/** Три баки біля рецепції: x-діапазон кришки (px мапи), верх кришки, колір кришки й світла грань (знято з намальованих баків). */
export const BINS = [
  { x: 549, w: 17, color: 0xf1d11f, light: 0xf0eaa2 },
  { x: 567, w: 17, color: 0x3c9bd8, light: 0x83c6ff },
  { x: 586, w: 16, color: 0x4ab525, light: 0xbaffbf },
] as const;
export const BIN_LID_Y = 204;
/** Калюжі на стежках (точки на ґрунті, не біля цілей Мії); з'являються в дощові дні. */
export const PUDDLES: readonly Pt[] = [{ x: 150, y: 244 }, { x: 340, y: 238 }, { x: 420, y: 250 }, { x: 290, y: 430 }, { x: 610, y: 350 }, { x: 600, y: 470 }];
/** Дошки пірса: прямокутники (x, y, w, h) — настил (стовпці 28–33, рядок 7) і майданчик на кінці (34–36, рядки 6–8). */
export const PIER_RECTS: readonly { readonly x: number; readonly y: number; readonly w: number; readonly h: number }[] = [{ x: 896, y: 224, w: 192, h: 32 }, { x: 1088, y: 192, w: 96, h: 96 }];
export const onPier = (x: number, y: number): boolean => PIER_RECTS.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);

// ---------- Лавка ----------

/** Герой стає на точку лавки, коли ноги ближче ніж SIT_R; після «сів» перші SIT_MIN_MS рух не підіймає (затиснута стрілка на вході не збиває посадку). */
export const SIT_R = 8;
export const SIT_MIN_MS = 250;
/** Підійшов іншим разом, лише відійшовши від лавки далі за SIT_LEAVE (інакше підйом зразу садив би знову). */
export const SIT_LEAVE = 14;
/** Сидячий герой опущений на 4 px, ноги (нижні рядки кадру) сховані: показано SIT_ROWS із 64. */
export const SIT_DY = 4;
export const SIT_ROWS = 48;

export interface SeatState { readonly seat: number | null; readonly ms: number; readonly blocked: number | null }
export const SEAT_IDLE: SeatState = { seat: null, ms: 0, blocked: null };
export type SeatEvent = 'sit' | 'stand' | null;

/** Кадр лавки. `moving` — гравець тисне напрямок; `busy` — герой зайнятий (дія, вода, міні-гра): не сідає. */
export function stepSeat(s: SeatState, seats: readonly Seat[], hero: Pt, moving: boolean, busy: boolean, dtMs: number): { state: SeatState; event: SeatEvent } {
  if (s.seat !== null) {
    const ms = s.ms + Math.max(0, dtMs);
    if (moving && ms >= SIT_MIN_MS) return { state: { seat: null, ms: 0, blocked: s.seat }, event: 'stand' };
    return { state: { ...s, ms }, event: null };
  }
  if (s.blocked !== null) {
    const b = seats[s.blocked];
    const state = !b || Math.hypot(hero.x - b.x, hero.y - b.y) >= SIT_LEAVE ? { ...s, blocked: null } : s;
    return { state, event: null };
  }
  if (busy) return { state: s, event: null };
  const i = seats.findIndex((p) => Math.hypot(hero.x - p.x, hero.y - p.y) <= SIT_R);
  return i >= 0 ? { state: { seat: i, ms: 0, blocked: null }, event: 'sit' } : { state: s, event: null };
}

// ---------- Раз на день ----------

/** Журнал «що вже діяло цього дня»: id речі → день останньої дії. Нова доба скидає все саме (порівняння днів, жодних таймерів). */
export type UseLog = Readonly<Record<string, number>>;
export const usedToday = (log: UseLog, id: string, day: number): boolean => log[id] === day;
export const markUsed = (log: UseLog, id: string, day: number): UseLog => ({ ...log, [id]: day });

// ---------- Падіння шишок і ягід ----------

export type ItemKind = 'cone' | 'berry' | 'plank' | 'shard' | 'twig';
export interface Item {
  readonly id: number; readonly kind: ItemKind;
  /** Звідки впало, куди лягло. */
  readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number;
  readonly age: number;
  /** Поточна позиція (кадр її виводить із віку; у магніті — з погоні). */
  readonly x: number; readonly y: number;
  /** мс, відколи предмет летить до героя; −1 — ще лежить. */
  readonly magnet: number;
  /** GAME-228: знахідка з розбитої речі — підскакує на `pop` px (замість падіння з крони) і на торсі героя зменшується за EAT_FRAMES кадри (`eat` — мс зменшення; −1 — ще ні). Шишки й ягоди цих полів не мають. */
  readonly pop?: number; readonly eat?: number;
}
export const FALL_MS = 520;
const BOUNCE_MS = 160;
/** Не раніше цього віку предмет «чує» героя; радіус магніта й радіус підбору. */
export const REST_MIN_MS = 620;
export const MAGNET_R = 64;
export const COLLECT_R = 9;
/** GAME-228: зменшення знахідки на торсі героя — 3 кадри, радіус її магніта (≈ клітинка). */
export const EAT_FRAMES = 3;
export const EAT_MS = EAT_FRAMES * FRAME_MS;
export const POP_MAGNET_R = 40;

export const idSeed = (id: string): number => { let h = 7; for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0; return h >>> 0; };

/** Скільки впало: шишок 1–3, ягід 2–4; залежить від дерева й дня, не від випадку. */
export function dropCount(kind: ReactionKind, id: string, day: number): number {
  const h = hash01(day, idSeed(id));
  return kind === 'pine' ? 1 + Math.floor(h * 3) : 2 + Math.floor(h * 3);
}

/**
 * План падіння: предмети стартують із `from` (крона чи кущ) і лягають навколо `land` (низ стовбура чи бік куща до героя). Пріоритет — те, що впало СПРАВДІ:
 * `items.length` ≥ 1 завжди (негативний контроль «потрусили — нічого не впало»). `firstId` — номер першого предмета (унікальність між трусами).
 */
export function planDrops(kind: ReactionKind, id: string, day: number, from: Pt, land: Pt, firstId: number, calm = false): Item[] {
  const n = dropCount(kind, id, day);
  const seed = idSeed(id) ^ (day * 7919);
  const out: Item[] = [];
  for (let i = 0; i < n; i++) {
    const x1 = land.x + (hash01(i, seed) - 0.5) * 36;
    const y1 = land.y + 4 + hash01(i + 40, seed) * 14;
    out.push({ id: firstId + i, kind: kind === 'pine' ? 'cone' : 'berry', x0: from.x + (hash01(i + 80, seed) - 0.5) * 16, y0: from.y, x1, y1, age: calm ? FALL_MS + BOUNCE_MS : 0, x: x1, y: y1, magnet: -1 });
  }
  return out.map((it) => (calm ? it : { ...it, x: it.x0, y: it.y0 }));
}

/** Позиція предмета за віком: падіння по параболі (k²), раз підскочив на 4 px і ліг. */
export function itemAt(it: Item): Pt {
  if (it.age < FALL_MS) {
    const k = it.age / FALL_MS;
    // Знахідка розбитої речі: підскок угору на pop px і падіння (парабола 4k(1−k)), а не падіння з крони.
    if (it.pop !== undefined) return { x: it.x0 + (it.x1 - it.x0) * k, y: it.y0 + (it.y1 - it.y0) * k - it.pop * 4 * k * (1 - k) };
    return { x: it.x0 + (it.x1 - it.x0) * k, y: it.y0 + (it.y1 - it.y0) * k * k };
  }
  const b = it.age - FALL_MS;
  return { x: it.x1, y: it.y1 - (b < BOUNCE_MS ? 4 * Math.sin((Math.PI * b) / BOUNCE_MS) : 0) };
}

/** Кадр предметів: падають, лежать, а герой поруч — летять до нього, пришвидшуючись, і підбираються. Повертає підібрані (за видом). */
export function stepItems(items: readonly Item[], hero: Pt, dtMs: number): { items: Item[]; collected: ItemKind[] } {
  const dt = Math.max(0, dtMs);
  const keep: Item[] = []; const collected: ItemKind[] = [];
  const target = { x: hero.x, y: hero.y - 10 };
  for (const it of items) {
    const age = it.age + dt;
    if (it.eat !== undefined && it.eat >= 0) {   // GAME-228: уже на торсі — зменшується до 0 за EAT_FRAMES кадри, тримається на герої
      const eat = it.eat + dt;
      if (eat >= EAT_MS) { collected.push(it.kind); continue; }
      keep.push({ ...it, age, x: target.x, y: target.y, eat });
      continue;
    }
    let { x, y } = itemAt({ ...it, age });
    let magnet = it.magnet;
    if (magnet < 0 && age >= REST_MIN_MS && Math.hypot(target.x - x, target.y - y) <= (it.pop !== undefined ? POP_MAGNET_R : MAGNET_R)) magnet = 0;
    if (magnet >= 0) {
      const sx = magnet === 0 && it.magnet < 0 ? x : it.x; const sy = magnet === 0 && it.magnet < 0 ? y : it.y;
      magnet += dt;
      const dx = target.x - sx; const dy = target.y - sy; const d = Math.hypot(dx, dy);
      const step = ((80 + 520 * (magnet / 1000)) * dt) / 1000;
      if (d <= COLLECT_R || step >= d) {
        if (it.eat !== undefined) { keep.push({ ...it, age, x: target.x, y: target.y, magnet, eat: 0 }); continue; }   // знахідка: спершу зменшення на торсі, потім «поп»
        collected.push(it.kind); continue;
      }
      x = sx + (dx / d) * step; y = sy + (dy / d) * step;
    }
    keep.push({ ...it, age, x, y, magnet });
  }
  return { items: keep, collected };
}

// ---------- Листя, тремтіння, кільця, краплі ----------

/** Тремтіння крони сосни: 4 кадри, зсув по x у px (±2 і назад); далі 0. */
export const PINE_SHAKE = [2, -2, 2, -1] as const;
/** Гойдання куща: 3 кадри. */
export const BUSH_SWAY = [1, -2, 1] as const;
const frameOf = (ageMs: number): number => Math.floor(Math.max(0, ageMs) / FRAME_MS);
export const crownShift = (ageMs: number): number => PINE_SHAKE[frameOf(ageMs)] ?? 0;
export const bushShift = (ageMs: number): number => BUSH_SWAY[frameOf(ageMs)] ?? 0;
export const SHAKE_MS = PINE_SHAKE.length * FRAME_MS;
export const SWAY_MS = BUSH_SWAY.length * FRAME_MS;
/** Повторна спроба того ж дня: лише ледь помітне здригання (1 кадр, 1 px) — без покарань, без падіння. */
export const TREMBLE_MS = FRAME_MS;
export const trembleShift = (ageMs: number): number => (frameOf(ageMs) === 0 ? 1 : 0);

export interface Leaf { readonly x0: number; readonly y0: number; readonly vx: number; readonly phase: number; readonly color: 0 | 1 }
export const LEAF_MS = 900;
/** 3–6 листочків із крони (вісь x — навколо `from`), стала схема від (дерево, день). */
export function leafPlan(id: string, day: number, from: Pt): Leaf[] {
  const seed = idSeed(id) ^ (day * 104729);
  const n = 3 + Math.floor(hash01(1, seed) * 4);
  return Array.from({ length: n }, (_, i) => ({ x0: from.x + (hash01(i + 5, seed) - 0.5) * 36, y0: from.y + (hash01(i + 9, seed) - 0.5) * 14, vx: (hash01(i + 13, seed) - 0.5) * 26, phase: hash01(i + 17, seed) * 6, color: (i % 2) as 0 | 1 }));
}
/** Листок за віком: падає з покачуванням і гасне. */
export function leafAt(l: Leaf, ageMs: number): { x: number; y: number; alpha: number } {
  const k = Math.min(1, Math.max(0, ageMs / LEAF_MS));
  return { x: l.x0 + l.vx * k + Math.sin(l.phase + k * 7) * 4, y: l.y0 + 46 * k * (0.4 + 0.6 * k), alpha: 1 - k * k };
}

/** Кришка смітника: підскок до 7 px і назад за BIN_MS (парабола). Кришки стрибають із невеликою різницею фази — «брязк-брязк». */
export const BIN_MS = 330;
export const BIN_HOP = 7;
export const lidHeight = (ageMs: number, phase = 0): number => { const k = (ageMs - phase) / BIN_MS; return k <= 0 || k >= 1 ? 0 : BIN_HOP * 4 * k * (1 - k); };

/** Колонка: герой нахиляється (0..1 — частка нахилу), краплі падають зі змивця. */
export const TAP_MS = 640;
export const bendAt = (ageMs: number): number => { const k = ageMs / TAP_MS; return k <= 0 || k >= 1 ? 0 : Math.min(1, Math.sin(Math.PI * k) * 1.6); };
/** Крапля i за віком: падає зі змивця вниз на 12 px, потім — коло на землі. */
export function dropAt(i: number, ageMs: number): { y: number; ground: boolean; alpha: number } | null {
  const a = ageMs - 120 - i * 90;
  if (a < 0 || a > 420) return null;
  return a < 160 ? { y: (a / 160) * 12, ground: false, alpha: 1 } : { y: 12, ground: true, alpha: 1 - (a - 160) / 260 };
}
export const TAP_DROPS = 4;

/** Кільце на калюжі: 3 кадри розширення (радіус, прозорість); далі нема. */
export const RING_FRAME_MS = 100;
export const RING_R = [4, 8, 12] as const;
export const ringAt = (ageMs: number): { r: number; alpha: number } | null => { const f = Math.floor(ageMs / RING_FRAME_MS); const r = RING_R[f]; return ageMs < 0 || r === undefined ? null : { r, alpha: 0.85 - f * 0.25 }; };
export const PUDDLE_R = 13;
export const PUDDLE_LEAVE = 20;

/** Калюжі: хлюп, коли герой РУХАЄТЬСЯ й ступив у калюжу (ближче PUDDLE_R); повторно — лише вийшовши (далі PUDDLE_LEAVE). */
export function stepPuddles(inside: readonly number[], puddles: readonly Pt[], hero: Pt, moving: boolean): { inside: number[]; splashed: number[] } {
  const now = inside.filter((i) => { const p = puddles[i]; return p !== undefined && Math.hypot(hero.x - p.x, hero.y - p.y) < PUDDLE_LEAVE; });
  const splashed: number[] = [];
  if (moving) puddles.forEach((p, i) => { if (!now.includes(i) && Math.hypot(hero.x - p.x, hero.y - p.y) < PUDDLE_R) { now.push(i); splashed.push(i); } });
  return { inside: now, splashed };
}

/** Кроки по дошках пірса: звук — кожні PIER_STEP_PX пройденого по настилу; зійшов — лічильник скинуто. */
export const PIER_STEP_PX = 26;
export function stepPier(acc: number, on: boolean, movedPx: number): { acc: number; step: boolean } {
  if (!on || !(movedPx > 0)) return { acc: on ? acc : 0, step: false };
  const a = acc + movedPx;
  return a >= PIER_STEP_PX ? { acc: a - PIER_STEP_PX, step: true } : { acc: a, step: false };
}

// ---------- Вибір речі, на яку діють ----------

/** Найближча річ у радіусі дії; `usedTree` — щоб підказка не кликала на дерево, що вже дало своє сьогодні. */
export function pickReaction(hero: Pt, list: readonly Reaction[] = REACTIONS): Reaction | null {
  let best: Reaction | null = null; let bd = Infinity;
  for (const r of list) { const d = Math.hypot(hero.x - r.at.x, hero.y - r.at.y); if (d <= r.range && d < bd) { best = r; bd = d; } }
  return best;
}

/** Підказка біля речі (ключ i18n) — лише коли річ щось дасть; використане дерево мовчить. */
export const HINT_KEY: Readonly<Record<ReactionKind, Key>> = { pine: 'life.hint.shake', bush: 'life.hint.pick', tap: 'life.hint.tap', bin: 'life.hint.bin', board: 'life.hint.board' };
