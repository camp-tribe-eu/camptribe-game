// GAME-332 · міні-гра «Багажник» (DAY-DESIGN §5, жанр «пакування», правила наші). Перед дорогою взяті вдома речі (ті самі id і значки, що в контейнерах GAME-304 / content/packing.json)
// треба розкласти по сітці багажника. Усе не влізе — гравець сам обирає, що лишити вдома (лишене стає прапорцем `f.left-<річ>`, його читає ніч табору: лишив ліхтар — вночі темно).
//
// ВЛАСНИЙ ПОВОРОТ ПРАВИЛ (камера правової рамки §5б): ДВЕРІ БАГАЖНИКА. Кладеш речі «з дверей» (праворуч): річ стає на місце, лише коли шлях від неї до дверей у її рядах вільний.
// Тож глибоке кладуть першим, а те, що має бути біля дверей (переноска Мії), — останнім. Малюнок, назви й форми — наші речі (намет, вода, ліхтар), без чужих фігур і кольорів.
//
// Обмеження (кожне має свою перевірку й мутацію в trunk.test.ts):
//  * важке (намет, вода) — на нижньому ряду, і порівну ліворуч/праворуч (шкала рівноваги);
//  * тендітне (ліхтарі, телефони) — не під важким;
//  * холодне (вечеря, їжа Мії) — впритул до термосумки (нерухома, у кутку);
//  * переноска Мії (лише з кішкою) — у стовпці дверей, щоб дістати першою.
// «Чайник — останнім» із картки: чайника серед речей контенту немає, тож правило закладено загальним `last` у ITEM_SPECS без речі (лишаємо порожнім, щоб не вигадувати нову річ).
//
// Результат: good — усе потрібне на місці й жодного порушення; fine — потрібне на місці, до 3 дрібних порушень; scrappy — інакше або вийшов час («Їдемо як є»: тоді нічого не міняємо,
// гра пакує як раніше). scrappy НІКОЛИ не блокує. Допомога (RELAXED): підсвічено підходяще місце для обраної речі, рівновага терпить більше.
import { defineMinigame, FPS, type Difficulty, type FrameInput, type Outcome } from '../../core/minigame';

export type Cell = readonly [r: number, c: number];
export interface Dim { readonly w: number; readonly h: number }
export interface Placed { readonly r: number; readonly c: number; readonly rot: number }

interface Spec { readonly cells: readonly Cell[]; readonly heavy?: true; readonly fragile?: true; readonly cold?: true; readonly carrier?: true }
const BAR: readonly Cell[] = [[0, 0], [0, 1]];
const ONE: readonly Cell[] = [[0, 0]];
/** Форми речей. Каталог contenту пакує в «одиниці» (units); тут — клітинки: 2×2 намет, 2×1 спальник/вода/одяг/переноска, 1×1 дрібниці, куточок для подушки. */
export const ITEM_SPECS: Readonly<Record<string, Spec>> = {
  'item.tent': { cells: [[0, 0], [0, 1], [1, 0], [1, 1]], heavy: true },
  'item.sleeping-bag': { cells: BAR },
  'item.water': { cells: BAR, heavy: true },
  'item.clothes': { cells: BAR },
  'item.mia-carrier': { cells: BAR, carrier: true },
  'item.big-cushion': { cells: [[0, 0], [1, 0], [1, 1]] },
  'item.simple-dinner': { cells: ONE, cold: true },
  'item.mia-bowl-food': { cells: ONE, cold: true },
  'item.lantern': { cells: ONE, fragile: true },
  'item.lantern-2': { cells: ONE, fragile: true },
  'item.lantern-3': { cells: ONE, fragile: true },
  'item.phones': { cells: ONE, fragile: true },
};
const specOf = (id: string): Spec => (Object.hasOwn(ITEM_SPECS, id) ? (ITEM_SPECS[id] as Spec) : { cells: ONE });

/** Сітка за транспортом: авто 6×3, велосипед 5×3. Нижній лівий кут — термосумка (нерухома). Двері — праворуч. */
export const gridFor = (transportId: string): Dim => (transportId === 'transport.bike' ? { w: 5, h: 3 } : { w: 6, h: 3 });
export const coolOf = (d: Dim): Cell => [d.h - 1, 0];

/** Форма після n поворотів на 90° (зсунута в нуль). */
export function shapeOf(id: string, rot: number): Cell[] {
  let cells: Cell[] = specOf(id).cells.map(([r, c]) => [r, c] as Cell);
  for (let i = 0; i < ((rot % 4) + 4) % 4; i++) cells = cells.map(([r, c]) => [c, -r] as Cell);
  const r0 = Math.min(...cells.map((x) => x[0]));
  const c0 = Math.min(...cells.map((x) => x[1]));
  return cells.map(([r, c]) => [r - r0, c - c0] as Cell).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}
const sizeOf = (cells: readonly Cell[]): Dim => ({ h: Math.max(...cells.map((x) => x[0])) + 1, w: Math.max(...cells.map((x) => x[1])) + 1 });

export interface TrunkLoad {
  readonly transport: string;
  readonly cat: boolean;
  /** Речі для розкладання (взяті вдома), у порядку контенту; `needed` — з групи «потрібне». */
  readonly items: readonly { readonly id: string; readonly needed: boolean }[];
}
/** Типове завантаження: авто, кішка, увесь список контенту (тести й каркас без гри). */
const FALLBACK: TrunkLoad = {
  transport: 'transport.car', cat: true,
  items: ['item.tent', 'item.documents', 'item.wallet', 'item.sleeping-bag', 'item.water', 'item.simple-dinner', 'item.mia-carrier', 'item.mia-bowl-food', 'item.lantern', 'item.snacks', 'item.phones', 'item.first-aid', 'item.clothes', 'item.big-cushion']
    .map((id) => ({ id, needed: !['item.lantern', 'item.snacks', 'item.phones', 'item.first-aid', 'item.clothes', 'item.big-cushion'].includes(id) })),
};
let LOAD: TrunkLoad = FALLBACK;
/** Головний цикл гри називає, що саме пакуємо (як setDriveWallet для дороги). */
export const setTrunkLoad = (l: TrunkLoad): void => { LOAD = l; };

export type Note = 'none' | 'ok' | 'out' | 'busy' | 'door' | 'pick';
export interface TrunkState {
  readonly load: TrunkLoad;
  readonly dim: Dim;
  readonly placed: Readonly<Record<string, Placed>>;
  /** Обрана річ у лотку (індекс) або -1. */
  readonly sel: number;
  /** Поворот ще не покладених речей. */
  readonly rots: Readonly<Record<string, number>>;
  readonly finished: boolean;
  readonly note: Note;
}

export const startTrunk = (load: TrunkLoad = LOAD): TrunkState => ({ load, dim: gridFor(load.transport), placed: {}, sel: load.items.length > 0 ? 0 : -1, rots: {}, finished: false, note: 'none' });

const absCells = (id: string, p: Placed): Cell[] => shapeOf(id, p.rot).map(([r, c]) => [r + p.r, c + p.c] as Cell);
const key = (r: number, c: number): string => `${r},${c}`;
/** Клітинка → id речі (термосумка — 'cool'). */
function occupancy(s: Pick<TrunkState, 'placed' | 'dim'>, skip?: string): Map<string, string> {
  const m = new Map<string, string>([[key(...coolOf(s.dim)), 'cool']]);
  for (const [id, p] of Object.entries(s.placed)) if (id !== skip) for (const [r, c] of absCells(id, p)) m.set(key(r, c), id);
  return m;
}

/** Чи можна поставити річ так: у межах, на вільне і з вільним шляхом до дверей (праворуч) у кожному ряду речі. */
export function canPlace(s: Pick<TrunkState, 'placed' | 'dim'>, id: string, p: Placed): Note {
  const cells = absCells(id, p);
  if (cells.some(([r, c]) => r < 0 || c < 0 || r >= s.dim.h || c >= s.dim.w)) return 'out';
  const occ = occupancy(s, id);
  if (cells.some(([r, c]) => occ.has(key(r, c)))) return 'busy';
  const own = new Set(cells.map(([r, c]) => key(r, c)));
  for (const [r, c] of cells) for (let x = c + 1; x < s.dim.w; x++) if (!own.has(key(r, x)) && occ.has(key(r, x))) return 'door';
  return 'ok';
}

export interface Verdict {
  readonly missing: readonly string[];
  readonly carrierAway: boolean;
  readonly heavyUp: readonly string[];
  readonly crushed: readonly string[];
  readonly warm: readonly string[];
  readonly tilt: boolean;
  /** Перекіс важкого: (праворуч − ліворуч) / усе важке, −1..1. */
  readonly balance: number;
  readonly major: number;
  readonly minor: number;
}
/** Скільки клітинок різниці ліво/право ще «порівну». Допомога терпить більше (×bandScale). */
export const TILT_OK = 2;

/** Усі обмеження за станом. Чиста; кожен пункт — окрема перевірка (мутація кожного — у trunk.test.ts). */
export function verdictOf(s: TrunkState, d: Difficulty = { timeScale: 1, bandScale: 1, hint: false }): Verdict {
  const { placed, dim, load } = s;
  const missing = load.items.filter((i) => i.needed && !(i.id in placed)).map((i) => i.id);
  const occ = occupancy(s);
  const at = (r: number, c: number): string | undefined => occ.get(key(r, c));
  const ids = Object.keys(placed);
  const carrierAway = load.cat && ids.some((id) => specOf(id).carrier === true && !absCells(id, placed[id] as Placed).some(([, c]) => c === dim.w - 1));
  const heavyUp = ids.filter((id) => specOf(id).heavy === true && Math.max(...absCells(id, placed[id] as Placed).map((x) => x[0])) !== dim.h - 1);
  const crushed = ids.filter((id) => specOf(id).fragile === true && absCells(id, placed[id] as Placed).some(([r, c]) => { const above = at(r - 1, c); return above !== undefined && above !== 'cool' && specOf(above).heavy === true; }));
  const [cr, cc] = coolOf(dim);
  const warm = ids.filter((id) => specOf(id).cold === true && !absCells(id, placed[id] as Placed).some(([r, c]) => Math.abs(r - cr) + Math.abs(c - cc) === 1));
  let left = 0; let right = 0;
  for (const id of ids) if (specOf(id).heavy === true) for (const [, c] of absCells(id, placed[id] as Placed)) { if (c * 2 < dim.w - 1) left++; else if (c * 2 > dim.w - 1) right++; }
  const tilt = Math.abs(right - left) > Math.floor(TILT_OK * d.bandScale);
  const major = missing.length + (carrierAway ? 1 : 0);
  const minor = heavyUp.length + crushed.length + warm.length + (tilt ? 1 : 0);
  return { missing, carrierAway, heavyUp, crushed, warm, tilt, balance: left + right === 0 ? 0 : (right - left) / (left + right), major, minor };
}

/** Дрібних порушень, з яких ще «нормально». */
export const FINE_MINOR = 3;
export function trunkOutcome(s: TrunkState, d?: Difficulty): Outcome {
  if (!s.finished) return 'scrappy';
  const v = verdictOf(s, d);
  return v.major === 0 && v.minor === 0 ? 'good' : v.major === 0 && v.minor <= FINE_MINOR ? 'fine' : 'scrappy';
}

/** Що лишаємо вдома: непотрібне, що не лягло в багажник. Лише коли гру закінчено «Готово»; вихід часом чи «Їдемо як є» нічого не лишає. Потрібне не лишається ніколи. */
export function leftOf(s: TrunkState): string[] {
  return s.finished ? s.load.items.filter((i) => !i.needed && !(i.id in s.placed)).map((i) => i.id) : [];
}

// ───────────── вхід: канонічні точки поля (поверхня шле саме їх; розкладка екрана вільна) ─────────────
export const PROTO = { gridY: 0.6, trayY: 0.7, btnY: 0.9 } as const;
export const cellPoint = (d: Dim, r: number, c: number): { x: number; y: number } => ({ x: (c + 0.5) / d.w, y: ((r + 0.5) / d.h) * PROTO.gridY });
export const trayPoint = (n: number, i: number): { x: number; y: number } => ({ x: (i + 0.5) / n, y: PROTO.trayY });
export const ROTATE_POINT = { x: 0.25, y: PROTO.btnY } as const;
export const DONE_POINT = { x: 0.75, y: PROTO.btnY } as const;
const clampIdx = (v: number, n: number): number => Math.min(n - 1, Math.max(0, Math.floor(v * n)));

function lift(s: TrunkState, id: string): TrunkState {
  const p = s.placed[id];
  if (!p) return s;
  const rest = Object.fromEntries(Object.entries(s.placed).filter(([k]) => k !== id));
  return { ...s, placed: rest, rots: { ...s.rots, [id]: p.rot }, sel: s.load.items.findIndex((i) => i.id === id), note: 'pick' };
}
const nextFree = (s: TrunkState, from: number): number => {
  const n = s.load.items.length;
  for (let k = 1; k <= n; k++) { const i = (from + k) % n; if (!((s.load.items[i] as { id: string }).id in s.placed)) return i; }
  return -1;
};

export function tapTrunk(s: TrunkState, x: number, y: number): TrunkState {
  const n = s.load.items.length;
  if (y < PROTO.gridY) {
    const c = clampIdx(x, s.dim.w); const r = clampIdx(y / PROTO.gridY, s.dim.h);
    const holder = occupancy(s).get(key(r, c));
    const cur = s.sel >= 0 ? (s.load.items[s.sel] as { id: string } | undefined) : undefined;
    if (cur === undefined || cur.id in s.placed) return holder !== undefined && holder !== 'cool' ? lift(s, holder) : { ...s, note: 'none' };
    const rot = s.rots[cur.id] ?? 0;
    const size = sizeOf(shapeOf(cur.id, rot));
    // Дотик у праву чи нижню клітинку не «вилітає»: річ зсувається так, щоб вмоститись у межі.
    const p: Placed = { r: Math.min(r, s.dim.h - size.h), c: Math.min(c, s.dim.w - size.w), rot };
    const note = canPlace(s, cur.id, p);
    if (note !== 'ok') return { ...s, note };
    const placed = { ...s.placed, [cur.id]: p };
    const next = { ...s, placed, note: 'ok' as const };
    return { ...next, sel: nextFree(next, s.sel) };
  }
  if (y < PROTO.btnY - 0.1) {
    if (n === 0) return s;
    const i = clampIdx(x, n);
    const id = (s.load.items[i] as { id: string }).id;
    if (id in s.placed) return lift(s, id);
    return { ...s, sel: s.sel === i ? -1 : i, note: 'none' };
  }
  if (x < 0.5) {
    const cur = s.sel >= 0 ? (s.load.items[s.sel] as { id: string } | undefined) : undefined;
    return cur && !(cur.id in s.placed) ? { ...s, rots: { ...s.rots, [cur.id]: ((s.rots[cur.id] ?? 0) + 1) % 4 }, note: 'none' } : s;
  }
  return { ...s, finished: true };
}

/** Підказка допомоги: перше місце для обраної речі, де вона лягає без жодного нового порушення; null — таких немає. */
export function suggestFor(s: TrunkState, d: Difficulty): { r: number; c: number } | null {
  const cur = s.sel >= 0 ? (s.load.items[s.sel] as { id: string } | undefined) : undefined;
  if (!cur || cur.id in s.placed) return null;
  const rot = s.rots[cur.id] ?? 0;
  const base = verdictOf(s, d);
  const size = sizeOf(shapeOf(cur.id, rot));
  for (let r = s.dim.h - size.h; r >= 0; r--) for (let c = 0; c <= s.dim.w - size.w; c++) {
    const p: Placed = { r, c, rot };
    if (canPlace(s, cur.id, p) !== 'ok') continue;
    const v = verdictOf({ ...s, placed: { ...s.placed, [cur.id]: p } }, d);
    if (v.minor <= base.minor && v.carrierAway === base.carrierAway) return { r, c };
  }
  return null;
}

export interface TrunkView {
  readonly w: number;
  readonly h: number;
  readonly cool: Cell;
  readonly items: readonly { readonly id: string; readonly needed: boolean; readonly placed: boolean; readonly bad: boolean; readonly rot: number; readonly cells: readonly Cell[]; readonly at: Placed | null }[];
  readonly sel: number;
  readonly note: Note;
  readonly balance: number;
  readonly tilt: boolean;
  readonly flags: readonly ('heavy' | 'fragile' | 'cold' | 'carrier')[];
  readonly missing: number;
  readonly hintCell: { readonly r: number; readonly c: number } | null;
  readonly cat: boolean;
  readonly bike: boolean;
}

export const TRUNK_GAME = defineMinigame<TrunkState, TrunkView>({
  id: 'mg.trunk',
  titleKey: 'mg.trunk.title',
  introKey: 'mg.trunk.intro',
  hintKey: 'mg.trunk.hint',
  limitFrames: 75 * FPS,
  outcomes: {
    good: { consequence: 'trunk.tidy', resultKey: 'mg.trunk.result.good' },
    fine: { consequence: 'trunk.cramped', resultKey: 'mg.trunk.result.fine' },
    scrappy: { consequence: 'trunk.asis', resultKey: 'mg.trunk.result.scrappy' },
  },
  init: () => startTrunk(),
  step: (s: TrunkState, input: FrameInput): TrunkState => {
    const tap = input.taps[0];
    return tap && !s.finished ? tapTrunk(s, tap.x, tap.y) : s;
  },
  done: (s) => s.finished,
  outcomeOf: (s) => trunkOutcome(s),
  view: (s: TrunkState, d: Difficulty): TrunkView => {
    const v = verdictOf(s, d);
    const bad = new Set<string>([...v.heavyUp, ...v.crushed, ...v.warm, ...(v.carrierAway ? s.load.items.filter((i) => specOf(i.id).carrier === true).map((i) => i.id) : [])]);
    const flags = (['heavy', 'fragile', 'cold', 'carrier'] as const).filter((k) => (k === 'carrier' ? v.carrierAway : k === 'heavy' ? v.heavyUp.length > 0 : k === 'fragile' ? v.crushed.length > 0 : v.warm.length > 0));
    return {
      w: s.dim.w, h: s.dim.h, cool: coolOf(s.dim),
      items: s.load.items.map((i) => {
        const p = s.placed[i.id] ?? null;
        const rot = p ? p.rot : s.rots[i.id] ?? 0;
        return { id: i.id, needed: i.needed, placed: p !== null, bad: bad.has(i.id), rot, cells: shapeOf(i.id, rot), at: p };
      }),
      sel: s.sel, note: s.note, balance: v.balance, tilt: v.tilt, flags, missing: v.missing.length,
      hintCell: d.hint ? suggestFor(s, d) : null, cat: s.load.cat, bike: s.load.transport === 'transport.bike',
    };
  },
});
