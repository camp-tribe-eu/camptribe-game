// Прогресія мандрівника (GAME-181, brain/Сценарій/scenario.md §2): XP звань і очки мандрівника (ОМ). Лише дані й чисті функції: той самий журнал команд —
// той самий результат, RNG тут не споживається. Нагорода видається рівно раз за ключ (`keys`): повтор тієї самої дії дає 0 — як grantId у грошей (TD-004).
// Гроші (€) — окремо (state.moneyCents); за справжні гроші тут не купується нічого, ОМ витрачаються лише на косметику (крамниця — пізніше, поле `cosmetics`).
import type { CoreDefs, StoryDefs } from './defs';
import type { GameState } from './state';

/** XP: крок головного квесту — `quest.xp` контенту (10–20), побічка — 15 (теж із контенту, валідатор: QUEST_XP_RANGE); решта — тут. */
export const XP_DAY = 10;
export const XP_CHAPTER = 30;
export const XP_SECRET = 5;
/** ОМ: побічка +10, чистий табір +10, відкриття (нова подія в дорозі) +5. */
export const OM_SIDE = 10;
export const OM_CLEAN = 10;
export const OM_DISCOVERY = 5;

/**
 * Десять звань (scenario §2.2): поріг XP кожного. Перші три піднято/збережено так, щоб ДРУГЕ звання приходило в перші ~10 хвилин гри
 * (виміряно: tests/e2e/game-181.spec.ts, числа — у PR). Назви й «родинні» рядки — content/locales (`title.N`, `title.N.family`).
 */
export const TITLE_XP: readonly number[] = [0, 60, 150, 300, 500, 750, 1050, 1400, 1800, 2300];
export const TITLE_COUNT = TITLE_XP.length;

export interface ProgressState {
  /** XP мандрівника, ціле ≥ 0. Лише росте. */
  readonly xp: number;
  /** ОМ — баланс, ціле ≥ 0 (витрачатимуться на косметику). */
  readonly om: number;
  /** Ключі вже виданих нагород (`quest:ST-001`, `day:ST-005`, `i:obj.litter`…), відсортовані, без повторів. */
  readonly keys: readonly string[];
  /** Куплена косметика (id) — модель даних під крамницю; поки завжди порожня. */
  readonly cosmetics: readonly string[];
}

export const EMPTY_PROGRESS: ProgressState = { xp: 0, om: 0, keys: [], cosmetics: [] };

export interface Award { readonly key: string; readonly xp: number; readonly om: number }

/** Індекс звання (0…9) за XP: найбільший, чий поріг досягнуто. */
export function titleOf(xp: number): number {
  let t = 0;
  for (let i = 1; i < TITLE_COUNT; i++) if (xp >= (TITLE_XP[i] as number)) t = i;
  return t;
}

/** Де гравець на шкалі звань: `into/span` — просування до наступного (span 0 — найвище звання). */
export function titleStep(xp: number): { index: number; into: number; span: number } {
  const index = titleOf(xp);
  const from = TITLE_XP[index] as number;
  const next = index + 1 < TITLE_COUNT ? (TITLE_XP[index + 1] as number) : null;
  return { index, into: next === null ? 0 : xp - from, span: next === null ? 0 : next - from };
}

/** Нагороди за квест: крок/побічка (xp квесту; побічка ще й ОМ), межа дня (+10), кінець розділу (+30). Квест без `xp` у контенті не дає крок-XP (валідатор це не пропустить). */
export function questAwards(id: string, q: { readonly optional: boolean; readonly end: boolean; readonly dayEnd?: true; readonly xp?: number }): Award[] {
  const out: Award[] = [];
  if (q.xp !== undefined && q.xp > 0) out.push({ key: `quest:${id}`, xp: q.xp, om: q.optional ? OM_SIDE : 0 });
  if (q.dayEnd === true || q.end) out.push({ key: `day:${id}`, xp: XP_DAY, om: 0 });
  if (q.end) out.push({ key: `chapter:${id}`, xp: XP_CHAPTER, om: 0 });
  return out;
}

/**
 * Що дає прийнята команда (або запис журналу: тип і ref ті самі). Квест — questAwards; взаємодія — за позначкою в каталозі (`award`: секрет → XP, чистий табір → ОМ);
 * нова подія в дорозі — відкриття (ОМ). Решта команд не дають нічого.
 */
export function awardsFor(type: string, ref: string | null, defs: CoreDefs): Award[] {
  if (ref === null) return [];
  if (type === 'CompleteQuest') {
    const q = Object.hasOwn(defs.story?.quests ?? {}, ref) ? defs.story?.quests[ref] : undefined;
    return q ? questAwards(ref, q) : [];
  }
  if (type === 'Interact') {
    const d = Object.hasOwn(defs.interactions, ref) ? defs.interactions[ref] : undefined;
    if (d?.award === 'secret') return [{ key: `i:${ref}`, xp: XP_SECRET, om: 0 }];
    if (d?.award === 'clean') return [{ key: `i:${ref}`, xp: 0, om: OM_CLEAN }];
    return [];
  }
  if (type === 'RoadEvent') return [{ key: `ev:${ref}`, xp: 0, om: OM_DISCOVERY }];
  return [];
}

/** Видати нагороди. `dedupe: false` — лише мутація в тестах (GAME-12 / закон 1): без неї повтор давав би XP знову. Нічого не змінилось — повертає той самий `p`. */
export function award(p: ProgressState | undefined, list: readonly Award[], dedupe = true): ProgressState | undefined {
  let cur = p ?? EMPTY_PROGRESS;
  let changed = false;
  for (const a of list) {
    if (dedupe && cur.keys.includes(a.key)) continue;
    cur = { ...cur, xp: cur.xp + a.xp, om: cur.om + a.om, keys: [...cur.keys, a.key].sort() };
    changed = true;
  }
  return changed ? cur : p;
}

export const progressOf = (g: Pick<GameState, 'progress'>): ProgressState => g.progress ?? EMPTY_PROGRESS;

/**
 * Старий сейв (до GAME-181) не має `progress`: що гравець уже завершив, те йому й зараховується — із завершених квестів (xp, межі днів, кінець розділу), без повторів.
 * Секрети, чисті табори й відкриття зі старого сейву не відновити (їх там не видно) — вони зарахуються, якщо трапляться знову. Детерміновано й ідемпотентно.
 */
export function backfillProgress(game: GameState, st: StoryDefs): GameState {
  if (game.progress !== undefined || game.player === null) return game;
  const list = Object.entries(game.quests).filter(([, p]) => p.status === 'completed').sort(([a], [b]) => (a < b ? -1 : 1))
    .flatMap(([id]) => (Object.hasOwn(st.quests, id) ? questAwards(id, st.quests[id] as NonNullable<StoryDefs['quests'][string]>) : []));
  const p = award(undefined, list);
  return p ? { ...game, progress: p } : game;
}
