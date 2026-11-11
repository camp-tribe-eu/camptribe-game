// GAME-310 · міні-гра «Заїхати й не зачепити»: провести авто вузькою доріжкою між деревами, стовпчиками й
// чужими наметами до своєї ділянки. Чиста логіка кроків (ні Phaser, ні таймерів, ні кадрів) — те саме, що
// `crate-push.ts` робить для ящика.
//
// Правила, і кожне з них — рішення, а не випадковість (DAY-DESIGN §5: без рефлексів, один палець, м'який провал):
//   * авто займає ОДНУ клітинку 32 px (як на мапі табору) і дивиться в один із чотирьох боків;
//   * крок — «вперед», «назад», «кермо ліворуч», «кермо праворуч». Жодного часу: гра чекає на гравця;
//   * **назад можна завжди** — звідси й береться «без глухих кутів»: будь-який стан відкатний;
//   * вивернути кермо можна лише там, де є куди: хоч одна бічна клітинка вільна. У щілині між деревом і
//     стовпчиком кермо не вивернеш — доведеться відкотитись до ширшого місця. Це і є головоломка;
//   * тверде (дерево, стовпчик, край) просто не пускає: крок відхилено, нічого не сталося;
//   * м'яке (чужий намет, відтяжка, велосипед сусіда) — ЗАЧІП: авто спиняється, лічильник зачепів +1,
//     сусід виходить, коротка розмова й трохи сорому. Далі пускає завжди: зачіп нічого не блокує;
//   * «відкотити хід» (undo) повертає клітинку й напрямок, але НЕ стирає зачіп: сусід уже вийшов. Інакше
//     відкат скасовував би наслідки, і зачіп нічого не вартував би.
//
// Три результати (DAY-DESIGN §5а): `good` / `ok` / `rough`. `rough` пускає далі так само, як `good` —
// різниця лише в тоні вечора (прапорець `f.drive-in`, docs/ARRIVAL-CONTRACT.md §4).

export type Facing = 'up' | 'down' | 'left' | 'right';
export interface Cell { readonly c: number; readonly r: number }

const STEP: Readonly<Record<Facing, Cell>> = { up: { c: 0, r: -1 }, down: { c: 0, r: 1 }, left: { c: -1, r: 0 }, right: { c: 1, r: 0 } };
const LEFT_OF: Readonly<Record<Facing, Facing>> = { up: 'left', left: 'down', down: 'right', right: 'up' };
const RIGHT_OF: Readonly<Record<Facing, Facing>> = { up: 'right', right: 'down', down: 'left', left: 'up' };
export const FACINGS: readonly Facing[] = ['up', 'right', 'down', 'left'];

export type DriveStep = 'forward' | 'back' | 'left' | 'right';
export const DRIVE_STEPS: readonly DriveStep[] = ['forward', 'back', 'left', 'right'];

/** Що лежить у клітинці смуги. */
export type LaneCell = 'free' | 'hard' | 'soft';

export interface Lane {
  readonly id: string;
  readonly cols: number;
  readonly rows: number;
  /** cells[r * cols + c]. */
  readonly cells: readonly LaneCell[];
  readonly start: Cell;
  readonly startFacing: Facing;
  /** Клітинка самої ділянки: доїхав — заїзд завершено. */
  readonly goal: Cell;
}

/**
 * Смуги заїзду, по одній на ділянку. Легенда: `#` тверде (дерево, стовпчик, борт), `o` м'яке (чужий намет,
 * відтяжка, велосипед — зачіп), `.` вільно, `S` старт (авто в'їжджає з доріжки), `G` ділянка.
 * Кожна доводиться сторожем: проїжджається без жодного зачепу, і з БУДЬ-ЯКОГО досяжного стану ділянка
 * лишається досяжною (`solve`, `noDeadEnds` — мутація: замурувати прохід → червоне).
 */
const LANE_ART: Readonly<Record<string, { rows: readonly string[]; facing: Facing }>> = {
  // Біля води: доріжка повз чужі тенти, вниз до берега й уздовж очерету.
  'lane.water': {
    facing: 'right',
    rows: [
      '###########',
      '.S...o....#',
      '#.#######.#',
      '#....o...G#',
      '#.#######.#',
      '#.........#',
      '###########',
    ],
  },
  // Під буками: між стовбурами, з одним широким місцем, де тільки й можна вивернути кермо.
  'lane.beeches': {
    facing: 'right',
    rows: [
      '###########',
      '#.........#',
      '#.#######.#',
      '.S...o...G#',
      '#.#######o#',
      '#....o....#',
      '###########',
    ],
  },
  // Відкрита галявина: місця багато, зате впоперек стоять чужі намети — об'їжджати довго.
  'lane.meadow': {
    facing: 'right',
    rows: [
      '###########',
      '.S........#',
      '#oooooooo.#',
      '#.......#.#',
      '#.#####.#.#',
      '#G....#...#',
      '###########',
    ],
  },
  // Біля рецепції: найкоротший заїзд — і найтісніший: шлагбаум, стовпчики й велосипеди під вікном.
  'lane.reception': {
    facing: 'right',
    rows: [
      '#########',
      '.S......#',
      '#.#####.#',
      '#..o....#',
      '#.#####.#',
      '#..o..G.#',
      '#########',
    ],
  },
};

const CELL_OF: Readonly<Record<string, LaneCell>> = { '#': 'hard', o: 'soft', '.': 'free', S: 'free', G: 'free' };

/** Смуга з малюнка. Відкрито лише заради тестів мутацій (закон 1): зламану смугу має ловити сторож. */
export function parseLane(id: string, art: { rows: readonly string[]; facing: Facing }): Lane {
  const rows = art.rows;
  const cols = (rows[0] as string).length;
  const cells: LaneCell[] = [];
  let start: Cell | null = null;
  let goal: Cell | null = null;
  rows.forEach((line, r) => {
    if (line.length !== cols) throw new Error(`${id}: row ${r} has ${line.length} cells, expected ${cols}`);
    [...line].forEach((ch, c) => {
      const cell = CELL_OF[ch];
      if (cell === undefined) throw new Error(`${id}: unknown cell "${ch}" at ${c},${r}`);
      cells.push(cell);
      if (ch === 'S') start = { c, r };
      if (ch === 'G') goal = { c, r };
    });
  });
  if (start === null || goal === null) throw new Error(`${id}: lane needs both S and G`);
  return { id, cols, rows: rows.length, cells, start, startFacing: art.facing, goal };
}

export const LANES: Readonly<Record<string, Lane>> = Object.fromEntries(Object.entries(LANE_ART).map(([id, art]) => [id, parseLane(id, art)]));
export const laneOf = (id: string): Lane => {
  const lane = LANES[id];
  if (lane === undefined) throw new Error(`unknown lane ${id}`);
  return lane;
};

const inside = (l: Lane, t: Cell): boolean => t.c >= 0 && t.r >= 0 && t.c < l.cols && t.r < l.rows;
export const cellAt = (l: Lane, t: Cell): LaneCell => (inside(l, t) ? (l.cells[t.r * l.cols + t.c] as LaneCell) : 'hard');
const add = (t: Cell, d: Cell): Cell => ({ c: t.c + d.c, r: t.r + d.r });
const sameCell = (a: Cell, b: Cell): boolean => a.c === b.c && a.r === b.r;

export interface DriveState {
  readonly at: Cell;
  readonly facing: Facing;
  /** Скільки разів зачепили чуже. Відкат ходу його не стирає. */
  readonly scrapes: number;
  /** Скільки кроків зроблено (відхилені не рахуються). */
  readonly steps: number;
  /** Авто на ділянці. */
  readonly done: boolean;
}

export const driveStart = (lane: Lane): DriveState => ({ at: lane.start, facing: lane.startFacing, scrapes: 0, steps: 0, done: sameCell(lane.start, lane.goal) });

/** Чим скінчився крок: проїхали / зачепили чуже / тверде не пустило (нічого не сталось). */
export type StepOutcome = 'moved' | 'scrape' | 'blocked';
export interface StepResult { readonly state: DriveState; readonly outcome: StepOutcome }

/** Чи є куди виверути кермо: хоч одна бічна клітинка вільна (не тверда й не чужа). */
export function canTurn(lane: Lane, st: Pick<DriveState, 'at' | 'facing'>): boolean {
  return [LEFT_OF[st.facing], RIGHT_OF[st.facing]].some((d) => cellAt(lane, add(st.at, STEP[d])) === 'free');
}

/** Один крок. Відмова (`blocked`) лишає стан незмінним; зачіп (`scrape`) лишає авто на місці й додає зачіп. */
export function driveStep(lane: Lane, st: DriveState, step: DriveStep): StepResult {
  if (step === 'left' || step === 'right') {
    if (!canTurn(lane, st)) return { state: st, outcome: 'blocked' };
    const facing = step === 'left' ? LEFT_OF[st.facing] : RIGHT_OF[st.facing];
    return { state: { ...st, facing, steps: st.steps + 1 }, outcome: 'moved' };
  }
  const dir = step === 'forward' ? STEP[st.facing] : { c: -STEP[st.facing].c, r: -STEP[st.facing].r };
  const to = add(st.at, dir);
  const cell = cellAt(lane, to);
  if (cell === 'hard') return { state: st, outcome: 'blocked' };
  if (cell === 'soft') return { state: { ...st, scrapes: st.scrapes + 1, steps: st.steps + 1 }, outcome: 'scrape' };
  return { state: { at: to, facing: st.facing, scrapes: st.scrapes, steps: st.steps + 1, done: st.done || sameCell(to, lane.goal) }, outcome: 'moved' };
}

/** Історія для відкату: стан після кожного прийнятого кроку. */
export interface DriveLog { readonly state: DriveState; readonly past: readonly DriveState[] }
export const driveLog = (lane: Lane): DriveLog => ({ state: driveStart(lane), past: [] });

export function logStep(lane: Lane, log: DriveLog, step: DriveStep): { readonly log: DriveLog; readonly outcome: StepOutcome } {
  const r = driveStep(lane, log.state, step);
  if (r.outcome === 'blocked') return { log, outcome: r.outcome };
  return { log: { state: r.state, past: [...log.past, log.state] }, outcome: r.outcome };
}

/**
 * Відкотити хід: клітинка й напрямок — як були, зачепи лишаються (сусід уже вийшов). На першому стані
 * відкочувати нема чого — повертаємо той самий журнал.
 */
export function undo(log: DriveLog): DriveLog {
  const prev = log.past[log.past.length - 1];
  if (prev === undefined) return log;
  return { state: { ...prev, scrapes: log.state.scrapes }, past: log.past.slice(0, -1) };
}

export const canUndo = (log: DriveLog): boolean => log.past.length > 0;

/** Три результати заїзду. Жоден не блокує: `rough` пускає на ділянку так само, як `good`. */
export const DRIVE_OUTCOMES = ['good', 'ok', 'rough'] as const;
export type DriveOutcome = (typeof DRIVE_OUTCOMES)[number];
/** Скільки зачепів іще «нормально». Більше — довгий заїзд із вибаченнями, і це теж не кінець світу. */
export const SCRAPES_OK_MAX = 2;

export function driveOutcome(st: DriveState): DriveOutcome {
  if (st.scrapes === 0) return 'good';
  return st.scrapes <= SCRAPES_OK_MAX ? 'ok' : 'rough';
}

/** Enum-прапорець заїзду (`f.drive-in-<результат>`): його читають репліки сусіда й родини, не ніч. */
export const DRIVE_FLAG = 'f.drive-in';
export const driveFlag = (o: DriveOutcome): string => `${DRIVE_FLAG}-${o}`;

const stateKey = (at: Cell, f: Facing): string => `${at.c},${at.r},${f}`;

/**
 * Найкоротший заїзд БЕЗ жодного зачепу (ширина пошуку по станах «клітинка + напрямок»). null — смуга
 * непроїжджа: сторож червоніє. Повертає послідовність кроків — нею ж доводиться, що «еталон» справді існує.
 */
export function solve(lane: Lane, startAt?: DriveState): readonly DriveStep[] | null {
  const start = startAt ?? driveStart(lane);
  const from = new Map<string, { prev: string; step: DriveStep }>();
  const seen = new Set<string>([stateKey(start.at, start.facing)]);
  const queue: DriveState[] = [start];
  for (let head = 0; head < queue.length; head++) {
    const st = queue[head] as DriveState;
    if (sameCell(st.at, lane.goal)) {
      const path: DriveStep[] = [];
      for (let k = stateKey(st.at, st.facing); from.has(k); k = (from.get(k) as { prev: string }).prev) path.unshift((from.get(k) as { step: DriveStep }).step);
      return path;
    }
    for (const step of DRIVE_STEPS) {
      const r = driveStep(lane, st, step);
      if (r.outcome !== 'moved') continue;
      const k = stateKey(r.state.at, r.state.facing);
      if (seen.has(k)) continue;
      seen.add(k);
      from.set(k, { prev: stateKey(st.at, st.facing), step });
      queue.push(r.state);
    }
  }
  return null;
}

/** Усі стани, досяжні законними кроками (зачепи теж — вони стан не рухають, тож нових станів не дають). */
export function reachableStates(lane: Lane): readonly { at: Cell; facing: Facing }[] {
  const start = driveStart(lane);
  const seen = new Set<string>([stateKey(start.at, start.facing)]);
  const out: { at: Cell; facing: Facing }[] = [{ at: start.at, facing: start.facing }];
  for (let head = 0; head < out.length; head++) {
    const st = out[head] as { at: Cell; facing: Facing };
    for (const step of DRIVE_STEPS) {
      const r = driveStep(lane, { ...st, scrapes: 0, steps: 0, done: false }, step);
      if (r.outcome !== 'moved') continue;
      const k = stateKey(r.state.at, r.state.facing);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ at: r.state.at, facing: r.state.facing });
    }
  }
  return out;
}

/**
 * Жодного глухого кута: з КОЖНОГО досяжного стану ділянка лишається досяжною без зачепів. Саме це дає
 * «назад можна завжди»; порожній список — усе гаразд, інакше — стани, з яких гравець застряг би.
 */
export function deadEnds(lane: Lane): readonly { at: Cell; facing: Facing }[] {
  return reachableStates(lane).filter((st) => {
    const seen = new Set<string>([stateKey(st.at, st.facing)]);
    const queue: { at: Cell; facing: Facing }[] = [st];
    for (let head = 0; head < queue.length; head++) {
      const cur = queue[head] as { at: Cell; facing: Facing };
      if (sameCell(cur.at, lane.goal)) return false;
      for (const step of DRIVE_STEPS) {
        const r = driveStep(lane, { ...cur, scrapes: 0, steps: 0, done: false }, step);
        if (r.outcome !== 'moved') continue;
        const k = stateKey(r.state.at, r.state.facing);
        if (seen.has(k)) continue;
        seen.add(k);
        queue.push({ at: r.state.at, facing: r.state.facing });
      }
    }
    return true;
  });
}
