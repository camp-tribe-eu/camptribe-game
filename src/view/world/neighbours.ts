// GAME-226 · «Живі сусіди»: мешканці табору роблять справи, махають, сплять у своїх наметах. ЛИШЕ відображення: ні ядро, ні сейв цього не знають (жодного прапорця → нічого
// в SIDE, content/side.ts). Тут чиста математика: де сусід о цей ігровий час (шлях додому ввечері, ранкове повернення), у якому він стані й що над головою.
// Усе рахується від годинника гри й ЛІЧИЛЬНИКА КАДРІВ (без твінів, таймерів, Date і випадковості — сторож no-realtime); малює й грає neighbours-rig.ts.
// Позиція за розкладом (placeAt) лишається «логічною»: game-211 і картки звіряють саме її; тут додається лише те, що бачить гравець (дорога додому, зсув на лавку, обхід героя).
import { centerOf, findPath, tileOf, type Grid, type Pt, type Tile } from './follow';
import { TILES_PER_MIN, placeAt, type Placed, type Resident, type Timeline } from './ambient';
import { SEATS } from './camp-alive';
import type { Dir } from './character';

/** Ігрова хвилина доби 0 о 8:00 → зсув годинника (як timeOfDay у daylight.ts). Тут лише для обчислення «ночі» від сирої хвилини годинника. */
const CLOCK_OFFSET = 8 * 60;
const DAY = 1440;
/** Вечір: з 18:00 сусіди йдуть до наметів і сидять біля них; з 20:00 сплять; о 7:00 уже на своїх місцях за розкладом. */
export const GO_HOME_AT = 18 * 60;
export const SLEEP_AT = 20 * 60;
export const BACK_OUT_AT = 7 * 60;
/** Дощ: додому швидше у стільки разів (парасольки в наборі шарів нема — пропущено, див. PR). */
export const RAIN_SPEED = 1.6;

/** Намет-дім кожного: прохідна клітинка поряд із наметом (не ціль взаємодії; шлях до неї перевіряє neighbours.test). */
export const HOMES: Readonly<Record<string, Tile>> = {
  'npc.amina': { c: 3, r: 2 },
  'npc.nora': { c: 4, r: 3 },
  'npc.sarah': { c: 8, r: 3 },
  'npc.luc': { c: 3, r: 16 },
  'npc.claire': { c: 5, r: 16 },
  'npc.ingrid': { c: 9, r: 17 },
};

export type NState = 'walk' | 'hurry' | 'around' | 'wave' | 'look' | 'read' | 'work' | 'sit' | 'sleep' | 'stand';
export type Activity = 'look' | 'read' | 'work' | 'sit' | 'stand';
export type Emote = 'heart' | 'bang' | 'ask' | 'dots' | 'zzz';
export type RoutePhase = 'out' | 'going' | 'home' | 'leaving';

// ---------- Дорога додому ----------

export interface HomePlan { readonly go: readonly Tile[]; readonly leave: readonly Tile[]; readonly goMin: number; readonly leaveMin: number }

const mod = (a: number, n: number): number => ((a % n) + n) % n;
/** Хвилини від 18:00 поточної (чи останньої) доби: 0 о 18:00 → 780 о 7:00 → 1440 наступного 18:00. */
export const sinceEvening = (clockMinutes: number): number => mod(clockMinutes + CLOCK_OFFSET - GO_HOME_AT, DAY);
/** Номер «ночі» (змінюється о 18:00): ключ плану дороги. */
export const nightOf = (clockMinutes: number): number => Math.floor((clockMinutes + CLOCK_OFFSET - GO_HOME_AT) / DAY);
const OUT_AT = BACK_OUT_AT + DAY - GO_HOME_AT;   // 780: з цієї хвилини від 18:00 мешканець знову «за розкладом»

/** План на ніч, що починається о `eveningAbs` (сира хвилина годинника 18:00): звідки йде (де стояв за розкладом) → до намету, і назад до місця о 7:00. null — шляху нема (мапа зламана). */
export function planHome(grid: Grid, tl: Timeline, home: Tile, eveningAbs: number, raining: boolean): HomePlan | null {
  const from = placeAt(grid, tl, eveningAbs);
  const to = placeAt(grid, tl, eveningAbs + OUT_AT);
  const go = findPath(grid, tileOf(grid, from), home);
  const leave = findPath(grid, home, tileOf(grid, to));
  if (!go || !leave) return null;
  return { go, leave, goMin: (go.length - 1) / (TILES_PER_MIN * (raining ? RAIN_SPEED : 1)), leaveMin: (leave.length - 1) / TILES_PER_MIN };
}

const dirOf = (dx: number, dy: number): Dir => (Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down'));
function along(grid: Grid, path: readonly Tile[], u: number): Placed {
  const last = path.length - 1;
  if (last <= 0) return { ...centerOf(grid, path[0] as Tile), moving: false, dir: 'down' };
  const k = Math.min(Math.max(u, 0), 1) * last;
  const i = Math.min(Math.floor(k), last - 1);
  const a = centerOf(grid, path[i] as Tile);
  const b = centerOf(grid, path[i + 1] as Tile);
  const f = k - i;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, moving: true, dir: dirOf(b.x - a.x, b.y - a.y) };
}

export interface Route extends Placed { readonly phase: RoutePhase }

/** Де сусід о `clockMinutes`: за розкладом удень, дорогою додому, біля намету, дорогою назад. Чиста функція (план — з planHome для цієї ночі). */
export function routeAt(grid: Grid, tl: Timeline, home: Tile, plan: HomePlan | null, clockMinutes: number): Route {
  const u = sinceEvening(clockMinutes);
  if (!plan || u >= OUT_AT) return { ...placeAt(grid, tl, clockMinutes), phase: 'out' };
  if (u < plan.goMin) return { ...along(grid, plan.go, u / plan.goMin), phase: 'going' };
  const leaveAt = OUT_AT - plan.leaveMin;
  if (u < leaveAt) return { ...centerOf(grid, home), moving: false, dir: 'down', phase: 'home' };
  return { ...along(grid, plan.leave, (u - leaveAt) / plan.leaveMin), phase: 'leaving' };
}

// ---------- Що робить, коли стоїть ----------

/** Індекс стоянки розкладу, на якій стоїть мешканець (центр клітинки), або -1. */
export function stopIndexAt(res: Resident, grid: Grid, p: Pt): number {
  return res.stops.findIndex((s) => { const c = centerOf(grid, s); return Math.hypot(c.x - p.x, c.y - p.y) < 1.5; });
}
/** Лавка, до якої стоянка ближча за SEAT_REACH, або -1. */
export const SEAT_REACH = 52;
export function seatNear(p: Pt): number {
  let best = -1; let bd = SEAT_REACH;
  SEATS.forEach((s, i) => { const d = Math.hypot(s.x - p.x, s.y - p.y); if (d <= bd) { bd = d; best = i; } });
  return best;
}
const BUSY: readonly Activity[] = ['look', 'read', 'work'];
/** Заняття на стоянці: біля лавки — сидить; інакше по колу «оглядається / читає / працює» (за номером мешканця й стоянки — без випадковості). */
export function activityFor(resIndex: number, stopIdx: number, seat: number): Activity {
  if (seat >= 0) return 'sit';
  if (stopIdx < 0) return 'stand';
  return BUSY[(resIndex + stopIdx) % BUSY.length] as Activity;
}

// ---------- Стан ----------

export const WAVE_R = 96;
export const BLOCK_R = 24;
export const BLOCK_FRAMES = 120;
export const WAVE_FRAMES = 60;
export const CHAT_R = 64;

export interface StateIn {
  /** Хвилина доби 0–1439 (для таблиць; рух уже врахований у phase). */
  readonly tod: number;
  readonly phase: RoutePhase;
  readonly moving: boolean;
  /** Відстань до героя, px. */
  readonly dist: number;
  readonly raining: boolean;
  readonly activity: Activity;
  /** Сьогодні вже махав. */
  readonly waved: boolean;
  /** Герой надто довго стоїть на шляху. */
  readonly blocked: boolean;
}

/** Стан сусіда за вхідними. Порядок = пріоритет: дорога → вечір/ніч удома → затор → привітання → заняття. */
export function neighbourState(i: StateIn): NState {
  if (i.phase === 'going') return i.raining ? 'hurry' : 'walk';
  if (i.phase === 'leaving') return 'walk';
  if (i.phase === 'home') return i.tod >= GO_HOME_AT && i.tod < SLEEP_AT ? 'sit' : 'sleep';
  if (i.blocked) return 'around';
  if (i.moving) return 'walk';
  if (i.dist <= WAVE_R && !i.waved) return 'wave';
  return i.activity;
}

// ---------- Покадрова пам'ять ----------

export const EMOTE_IN = 6;
export const EMOTE_HOLD = 90;
export const EMOTE_FRAMES = EMOTE_IN + EMOTE_HOLD;
/** Масштаб значка (0..1) на кадрі `age`: за EMOTE_IN кадрів виростає, далі тримається; поза EMOTE_FRAMES — 0 (не видно). */
export const emoteScale = (age: number): number => (age < 0 || age >= EMOTE_FRAMES ? 0 : age < EMOTE_IN ? (age + 1) / EMOTE_IN : 1);

export interface Mind {
  readonly state: NState;
  /** Кадрів у цьому стані. */
  readonly f: number;
  /** Доба, коли востаннє махав (-1 — ніколи). */
  readonly waveDay: number;
  readonly emote: Emote | null;
  readonly emoteAge: number;
  readonly blockF: number;
  /** Видимий зсув спрайта від логічної точки (лавка, обхід), px. */
  readonly off: Pt;
}
export const MIND0: Mind = { state: 'stand', f: 0, waveDay: -1, emote: null, emoteAge: 0, blockF: 0, off: { x: 0, y: 0 } };

export interface Frame {
  readonly tod: number;
  readonly day: number;
  readonly phase: RoutePhase;
  readonly moving: boolean;
  readonly dist: number;
  readonly raining: boolean;
  readonly activity: Activity;
  /** Куди зсунутись, щоб обійти героя (px від логічної точки; null — нікуди); куди — на лавку. */
  readonly side: Pt | null;
  readonly bench: Pt | null;
  /** Триває розмова: стоїмо, не крутимо головою. */
  readonly hold: boolean;
}
/** Швидкість зсуву, px за кадр (≈ 60 px/с — неквапливо). */
export const OFF_SPEED = 1;

const emoteOnEnter = (s: NState, f: Frame): Emote | null =>
  s === 'wave' ? 'heart' : s === 'around' ? 'ask' : s === 'hurry' ? 'bang' : s === 'sleep' ? 'zzz' : (s === 'read' || s === 'work') && f.dist <= CHAT_R ? 'dots' : null;
/** Під час сну «Z» повторюється раз на ZZZ_EVERY кадрів. */
export const ZZZ_EVERY = 240;

/** Один кадр сусіда: стан, лічильники, значок над головою, зсув. Чиста функція (Mind, Frame) → Mind. */
export function stepMind(m: Mind, f: Frame): Mind {
  const blockNear = f.dist < BLOCK_R && f.phase === 'out';
  const blockF = blockNear ? m.blockF + 1 : Math.max(0, m.blockF - 2);
  const blocked = blockF >= BLOCK_FRAMES || (m.state === 'around' && blockF > 0);
  let state: NState;
  if (f.hold) state = 'stand';
  else if (m.state === 'wave' && m.f < WAVE_FRAMES - 1 && f.phase === 'out' && !f.moving && !blocked) state = 'wave';
  else state = neighbourState({ tod: f.tod, phase: f.phase, moving: f.moving, dist: f.dist, raining: f.raining, activity: f.activity, waved: m.waveDay === f.day, blocked });
  const entered = state !== m.state;
  let emote = m.emote;
  let emoteAge = m.emoteAge + 1;
  if (emote && emoteAge >= EMOTE_FRAMES) emote = null;
  const fInState = entered ? 0 : m.f + 1;
  const want = entered ? emoteOnEnter(state, f) : state === 'sleep' && fInState % ZZZ_EVERY === 0 ? 'zzz' : null;
  if (want && (!emote || (entered && want !== 'dots'))) { emote = want; emoteAge = 0; }
  const target = state === 'around' && f.side ? f.side : state === 'sit' && f.phase === 'out' && f.bench ? f.bench : { x: 0, y: 0 };
  const dx = target.x - m.off.x; const dy = target.y - m.off.y;
  const d = Math.hypot(dx, dy);
  const off = d <= OFF_SPEED ? { x: target.x, y: target.y } : { x: m.off.x + (dx / d) * OFF_SPEED, y: m.off.y + (dy / d) * OFF_SPEED };
  return { state, f: fInState, waveDay: state === 'wave' && m.state !== 'wave' ? f.day : m.waveDay, emote, emoteAge, blockF, off };
}

// ---------- Кадри заняття ----------

/** Оглядається: ліворуч, пауза, праворуч, довга пауза (кадрів у циклі — LOOK_CYCLE). */
const LOOK: readonly (readonly [Dir, number])[] = [['down', 40], ['left', 50], ['down', 30], ['right', 50], ['down', 70]];
export const LOOK_CYCLE = LOOK.reduce((s, [, n]) => s + n, 0);
export function lookDir(f: number): Dir {
  let k = mod(f, LOOK_CYCLE);
  for (const [d, n] of LOOK) { if (k < n) return d; k -= n; }
  return 'down';
}
/** Книга: сторінка гортається раз на 4–5 с (240 і 300 кадрів по черзі); кадри гортання — PAGE_FLIP. */
export const PAGE_EVERY = [240, 300] as const;
export const PAGE_FLIP = 8;
export function pagesTurned(f: number): number {
  const pair = PAGE_EVERY[0] + PAGE_EVERY[1];
  return Math.floor(f / pair) * 2 + (mod(f, pair) >= PAGE_EVERY[0] ? 1 : 0);
}
export function flipping(f: number): boolean {
  const pair = PAGE_EVERY[0] + PAGE_EVERY[1];
  const r = mod(f, pair);
  return (r >= PAGE_EVERY[0] && r < PAGE_EVERY[0] + PAGE_FLIP) || (f >= pair && r < PAGE_FLIP);
}
/** Робота: нахил у 3 кадри 0 → 1 → 2 → 1 (по WORK_STEP кадрів гри кожен). */
export const WORK_STEP = 14;
export const workFrame = (f: number): number => [0, 1, 2, 1][Math.floor(f / WORK_STEP) % 4] as number;
/** Привітання: 2 кадри руки ×3 (по WAVE_STEP кадрів гри); після WAVE_FRAMES — 0. */
export const WAVE_STEP = 10;
export const waveFrame = (f: number): number => (f < WAVE_FRAMES ? Math.floor(f / WAVE_STEP) % 2 : 0);
/** Сон: дихання 1 px — пів періоду нижче. */
export const BREATH_HALF = 50;
export const breath = (f: number): number => (Math.floor(f / BREATH_HALF) % 2);

// ---------- Піксельні значки ----------

/** Гліфи 5×7 (# — піксель); у грі 2×2 px на клітинку, як ♪ й ? у idle.ts. Без шрифтів і емодзі. */
export const EMOTES: Readonly<Record<Emote, readonly string[]>> = {
  heart: ['.#.#.', '#####', '#####', '#####', '.###.', '..#..', '.....'],
  bang: ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  ask: ['.###.', '#...#', '....#', '..##.', '..#..', '.....', '..#..'],
  dots: ['.....', '.....', '.....', '#.#.#', '.....', '.....', '.....'],
  zzz: ['#####', '...#.', '..#..', '.#...', '#####', '.....', '.....'],
};
export const EMOTE_COLORS: Readonly<Record<Emote, number>> = { heart: 0xe0446a, bang: 0xffd54a, ask: 0xf4f1e8, dots: 0xf4f1e8, zzz: 0xa9c7ff };

// ---------- Одним викликом (таблиці тестів) ----------

export interface Around { readonly dist: number; readonly raining: boolean; readonly waved: boolean; readonly blocked?: boolean }
/** Де сусід і в якому стані о `clockMinutes` без пам'яті кадрів (перший кадр): дорога + заняття на стоянці + привітання. Те саме, що рахує rig кадр за кадром. */
export function neighbourAt(grid: Grid, tl: Timeline, resIndex: number, plan: HomePlan | null, clockMinutes: number, o: Around): { route: Route; state: NState } {
  const home = HOMES[tl.resident.id] ?? { c: 0, r: 0 };
  const route = routeAt(grid, tl, home, HOMES[tl.resident.id] ? plan : null, clockMinutes);
  const stop = route.phase === 'out' && !route.moving ? stopIndexAt(tl.resident, grid, route) : -1;
  const seat = stop >= 0 ? seatNear(route) : -1;
  const state = neighbourState({ tod: mod(clockMinutes + CLOCK_OFFSET, DAY), phase: route.phase, moving: route.moving, dist: o.dist, raining: o.raining, activity: activityFor(resIndex, stop, seat), waved: o.waved, blocked: o.blocked === true });
  return { route, state };
}
