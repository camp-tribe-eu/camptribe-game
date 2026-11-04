// GAME-228 · «Розбивання»: ящик, бочка, глиняний горщик і суха гілка в таборі. Тут лише ЧИСТА математика й таблиці (без Phaser, таймерів і випадковості:
// «випадкове» — хеш від (річ, день)); малює й грає smash-rig.ts, знахідки летять до героя тим самим магнітом, що шишки (camp-alive.ts: stepItems).
// Правила research/game-feel.md «Розбити чи розібрати»: удар → стоп героя 5–7 кадрів, спрайт зникає, 4–7 уламків, дим 4 кадри, звук матеріалу;
// знахідка підскакує на 16–24 px, раз відскакує на 4 px, летить до героя й за 3 кадри зменшується до 0 на торсі; плашка «+1 Предмет» ≈3 с.
// Тварини (Мія, будь-який улюбленець) — НІКОЛИ не ціль: pickSmash бере лише речі. Стан — лише показ: прапорців нема → нічого в SIDE (content/side.ts).
import type { Key } from '../../i18n';
import { EAT_FRAMES, EAT_MS, FALL_MS, FRAME_MS, POP_MAGNET_R, REST_MIN_MS, idSeed, type Item, type Pt } from './camp-alive';
import { hash01 } from './fx-live';

export type SmashKind = 'crate' | 'barrel' | 'pot' | 'branch';
export type FindKind = 'plank' | 'shard' | 'twig';
export interface SmashProp { readonly id: string; readonly kind: SmashKind; readonly at: Pt; readonly range: number }

/**
 * Речі табору. Не на проходах і не на цілях: за стежкою (crate-push не бачить їх — вони не тверді, герой проходить), поза 48 px від будь-якої цілі мапи
 * (інакше ціль перехоплює дію, як у лавки й дошки). Положення звіряє smash.test.ts із camp-lake.tmj.
 */
export const SMASH_PROPS: readonly SmashProp[] = [
  { id: 'crate.reception', kind: 'crate', at: { x: 680, y: 340 }, range: 30 },     // за колонкою, поза зонами колонки й бачків (GAME-225)
  { id: 'pot.reception', kind: 'pot', at: { x: 400, y: 250 }, range: 28 },        // глиняний горщик біля рецепції
  { id: 'barrel.wood', kind: 'barrel', at: { x: 770, y: 590 }, range: 30 },       // бочка біля дров
  { id: 'branch.wood', kind: 'branch', at: { x: 620, y: 556 }, range: 30 },       // суха гілка біля дров
];
export const FIND_OF: Readonly<Record<SmashKind, FindKind>> = { crate: 'plank', barrel: 'plank', pot: 'shard', branch: 'twig' };
export const FIND_KEY: Readonly<Record<FindKind, Key>> = { plank: 'life.find.plank', shard: 'life.find.shard', twig: 'life.find.twig' };
export const SMASH_HINT: Readonly<Record<SmashKind, Key>> = { crate: 'life.hint.smash', barrel: 'life.hint.smash', pot: 'life.hint.smash', branch: 'life.hint.branch' };
export const isSmashKind = (k: string): k is SmashKind => k === 'crate' || k === 'barrel' || k === 'pot' || k === 'branch';
/** Розбивається: ящик, бочка, горщик. Гілка лишається (її трусять). */
export const breaksAway = (k: SmashKind): boolean => k !== 'branch';
export const FIND_KINDS: readonly string[] = ['plank', 'shard', 'twig'];
export const isFindKind = (k: string): k is FindKind => FIND_KINDS.includes(k);

// ---------- Вибір цілі: тварини ніколи не цілі ----------

export interface Entity { readonly id: string; readonly kind: 'prop' | 'animal'; readonly at: Pt; readonly range: number }
/** Найближча РІЧ у радіусі дії. Тварина (кішка Мія, улюбленець) — не ціль, навіть якщо стоїть упритул і ближче за річ: її просто немає серед кандидатів. */
export function pickSmash(hero: Pt, props: readonly SmashProp[], others: readonly Entity[] = []): SmashProp | null {
  const all: Entity[] = [...props.map((p) => ({ id: p.id, kind: 'prop' as const, at: p.at, range: p.range })), ...others];
  let best: Entity | null = null; let bd = Infinity;
  for (const e of all) {
    if (e.kind !== 'prop') continue;
    const d = Math.hypot(hero.x - e.at.x, hero.y - e.at.y);
    if (d <= e.range && d < bd) { best = e; bd = d; }
  }
  return best ? props.find((p) => p.id === best?.id) ?? null : null;
}

// ---------- Стоп героя й лічильники ----------

export const FREEZE_MIN = 5;
export const FREEZE_MAX = 7;
/** Скільки кадрів герой завмирає після удару: 5–7, від (річ, день). */
export const freezeFrames = (id: string, day: number): number => FREEZE_MIN + Math.floor(hash01(3, idSeed(id) ^ (day * 31)) * (FREEZE_MAX - FREEZE_MIN + 1));
export const freezeMs = (id: string, day: number): number => freezeFrames(id, day) * FRAME_MS;

/** Уламків: 4–7. */
export const debrisCount = (id: string, day: number): number => 4 + Math.floor(hash01(1, idSeed(id) ^ (day * 977)) * 4);
/** Гілочок із гілки: 1–2. */
export const twigCount = (id: string, day: number): number => 1 + Math.floor(hash01(2, idSeed(id) ^ (day * 977)) * 2);
/** Крихт кори з гілки: 3–6. */
export const crumbCount = (id: string, day: number): number => 3 + Math.floor(hash01(4, idSeed(id) ^ (day * 977)) * 4);
/** Знахідок: ящик, бочка й горщик — одна; гілка — 1–2 гілочки. */
export const findCount = (p: SmashProp, day: number): number => (p.kind === 'branch' ? twigCount(p.id, day) : 1);

// ---------- Уламки, дим ----------

export interface Debris { readonly x0: number; readonly y0: number; readonly vx: number; readonly vy: number; readonly w: number; readonly h: number; readonly color: number; readonly spin: number }
/** Життя уламка й крихти: 30 кадрів (≈2 с), гаснуть наприкінці. */
export const DEBRIS_FRAMES = 30;
export const DEBRIS_MS = DEBRIS_FRAMES * FRAME_MS;
const COLORS: Readonly<Record<SmashKind, readonly number[]>> = {
  crate: [0xb98852, 0x6b4423, 0xd9a860], barrel: [0x8f5f33, 0x5a3a1e, 0xb98852], pot: [0xb5532e, 0x7e3a1f, 0xd98a55], branch: [0x6b4423, 0x8f7a5a, 0x4a3a28],
};
/** Тріски 2×4 px (дерево) чи скалки глини 3×3 px, розліт по колу зі стелею угору; кількість — debrisCount, крихти гілки — crumbCount. */
export function debrisPlan(p: SmashProp, day: number): Debris[] {
  const n = p.kind === 'branch' ? crumbCount(p.id, day) : debrisCount(p.id, day);
  const seed = idSeed(p.id) ^ (day * 104729);
  const cols = COLORS[p.kind];
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + hash01(i, seed) * 0.9;
    const v = 14 + hash01(i + 20, seed) * 14;
    const clay = p.kind === 'pot';
    return { x0: p.at.x + (hash01(i + 40, seed) - 0.5) * 8, y0: p.at.y - 8, vx: Math.cos(a) * v, vy: -8 - hash01(i + 60, seed) * 10, w: clay ? 3 : p.kind === 'branch' ? 2 : 2, h: clay ? 3 : p.kind === 'branch' ? 2 : 4, color: cols[i % cols.length] ?? 0x6b4423, spin: Math.sin(a) };
  });
}
/** Уламок за віком: летить вбік, падає під вагою (g), лягає на землю (не нижче ноги речі +2) і гасне в останній третині життя. */
export function debrisAt(d: Debris, groundY: number, ageMs: number): { x: number; y: number; alpha: number } {
  const t = Math.max(0, Math.min(ageMs, DEBRIS_MS)) / 1000;
  const fly = Math.min(t, 0.45);
  const y = Math.min(groundY + 2, d.y0 + d.vy * fly + 170 * fly * fly);
  const k = Math.min(1, Math.max(0, ageMs / DEBRIS_MS));
  return { x: d.x0 + d.vx * fly, y, alpha: k < 0.66 ? 1 : k >= 1 ? 0 : 1 - (k - 0.66) / 0.34 };
}

/** Дим: 4 кадри, клубок росте 3 → 9 px і гасне; далі — немає. */
export const SMOKE_FRAMES = 4;
export const SMOKE_MS = SMOKE_FRAMES * FRAME_MS;
export const SMOKE_R = [3, 5, 7, 9] as const;
export function smokeAt(ageMs: number): { r: number; alpha: number; rise: number } | null {
  const f = Math.floor(ageMs / FRAME_MS); const r = SMOKE_R[f];
  return ageMs < 0 || r === undefined ? null : { r, alpha: 0.75 - f * 0.18, rise: f * 2 };
}

/** Тремтіння гілки: 4 кадри по x у px (до ±2), далі 0. */
export const BRANCH_SHAKE = [2, -2, 2, -1] as const;
export const BRANCH_SHAKE_MS = BRANCH_SHAKE.length * FRAME_MS;
export const branchShift = (ageMs: number): number => BRANCH_SHAKE[Math.floor(Math.max(0, ageMs) / FRAME_MS)] ?? 0;

// ---------- Знахідки: підскок, відскок, магніт (stepItems), зменшення ----------

export const POP_MIN = 16;
export const POP_MAX = 24;
/** Радіус магніта знахідки: ≈ одна клітинка (32 px), ближче, ніж у шишки. */
export const FIND_MAGNET_R = POP_MAGNET_R;
/** Знахідки: стартують у речі, підскакують на 16–24 px, лягають до героя ближче на 14–24 px (куди він стоїть — туди й летить). */
export function planFinds(p: SmashProp, day: number, hero: Pt, firstId: number, calm = false): Item[] {
  const n = findCount(p, day);
  const seed = idSeed(p.id) ^ (day * 7919);
  const dx = hero.x - p.at.x; const dy = hero.y - p.at.y; const d = Math.hypot(dx, dy) || 1;
  const kind = FIND_OF[p.kind];
  return Array.from({ length: n }, (_, i) => {
    const reach = Math.min(d, 14 + hash01(i + 5, seed) * 10);
    const x1 = p.at.x + (dx / d) * reach + (hash01(i + 9, seed) - 0.5) * 12;
    const y1 = p.at.y + (dy / d) * reach + 2 + hash01(i + 13, seed) * 4;
    const pop = POP_MIN + hash01(i + 17, seed) * (POP_MAX - POP_MIN);
    const x0 = p.at.x; const y0 = p.at.y - 6;
    return { id: firstId + i, kind, x0, y0, x1, y1, age: calm ? FALL_MS + 160 : 0, x: calm ? x1 : x0, y: calm ? y1 : y0, magnet: -1, pop, eat: -1 };
  });
}
/** Зменшення на торсі: 3 кадри — 2/3, 1/3, 0 (на третьому кадрі розмір 0). */
export const SHRINK_FRAMES = EAT_FRAMES;
export const SHRINK_MS = EAT_MS;
export const SHRINK_SCALE = [2 / 3, 1 / 3, 0] as const;
export const findScale = (eatMs: number): number => (eatMs < 0 ? 1 : SHRINK_SCALE[Math.floor(eatMs / FRAME_MS)] ?? 0);
/** Знахідка лежить достатньо, щоб «почути» героя. */
export const FIND_REST_MS = REST_MIN_MS;

// ---------- Плашка «+1 Предмет» ----------

/** Що показує плашка в куті: знахідки розбивання й (GAME-229) шишки та ягоди — над героєм цифр немає. */
export type ToastKind = FindKind | 'cone' | 'berry';
export const TOAST_KEY: Readonly<Record<ToastKind, Key>> = { ...FIND_KEY, cone: 'life.cone', berry: 'life.berry' };
export interface ToastEntry { readonly kind: ToastKind; readonly count: number; readonly age: number }
export const TOAST_MS = 3000;
export const TOAST_FADE_MS = 500;
export const TOAST_MAX = 3;
/** Додати знахідку: той самий вид — лічильник росте й плашка тримається знову; новий вид кладеться НАД попереднім (кінець списку — верх). */
export function pushToast(list: readonly ToastEntry[], kind: ToastKind): ToastEntry[] {
  const i = list.findIndex((t) => t.kind === kind);
  const next = i >= 0 ? list.map((t, j) => (j === i ? { kind, count: t.count + 1, age: 0 } : t)) : [...list, { kind, count: 1, age: 0 }];
  return next.slice(-TOAST_MAX);
}
export const stepToasts = (list: readonly ToastEntry[], dtMs: number): ToastEntry[] => list.map((t) => ({ ...t, age: t.age + Math.max(0, dtMs) })).filter((t) => t.age < TOAST_MS);
export const toastAlpha = (ageMs: number): number => (ageMs < TOAST_MS - TOAST_FADE_MS ? 1 : Math.max(0, (TOAST_MS - ageMs) / TOAST_FADE_MS));
