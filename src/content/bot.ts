// Бот-гравець (GAME-37, TD-012): тисячі проходжень ядра з фіксованим зерном. Кожен прогін — випадкова
// прогулянка справжніми командами; з місця, де бот зупинився, обмежений пошук доводить, що кінець
// розділу досяжний. Якщо ні — прогін звітує стан, з якого фінал недосяжний (тупик), а не «пройшов».
//
// Чим відрізняється від повного перебору (story.test): той доводить відсутність тупиків для нинішнього
// малого контенту; бот масштабується на контент, де повний перебір неможливий, і ходить «як людина» —
// з випадковими купівлями, продажами й відмовами.
import { dispatch, nextCommandId, type Command } from '../core/commands';
import type { CoreDefs } from '../core/defs';
import { nextInt, seedRng, type RngState } from '../core/rng';
import { initialState, type GameState } from '../core/state';
import { isLuckMove, moves, progressKey, type Move } from './moves';

export interface Variant {
  readonly profile: string;
  readonly transport: string;
  readonly animal: string;
  /** Як бот ставиться до необов'язкової гілки: бере вибір-перехід чи тримається основного шляху. */
  readonly side: 'take' | 'skip';
  /** Стартові гроші: без грошей купівлі неможливі — інша частина простору станів. */
  readonly money: 'none' | 'some';
}

export type Verdict = 'ended' | 'end-reachable' | 'softlock' | 'unknown';

export interface BotRun {
  readonly seed: number;
  readonly variant: Variant;
  readonly steps: number;
  /**
   * Покупки ДО першої нагороди — доказ, що вісь «гроші» змінює поведінку: без стартових грошей їх 0
   * (нагороди квестів теж дають гроші, тож «покупок взагалі» для цього замало).
   */
  readonly purchases: number;
  readonly verdict: Verdict;
  /** Для тупика — стан, з якого кінець недосяжний (квести, локація, інвентар). */
  readonly stuck?: Pick<GameState, 'quests' | 'player' | 'inventory' | 'flags' | 'dialogue'>;
  /** Стан, на якому бот зупинився (GAME-103: з нього міряють найбільший сейв, який дає бот). */
  readonly final: GameState;
}

// Повний канонічний JSON, а не 32-бітний stateHash (рецензія GAME-37): зіткнення при рості контенту
// (~25 % на 50 тис. станів) сховало б справжній тупик за чужим «true» у пам'яті — зелене, що не червоніє.
// Без навичок (GAME-72): див. progressKey.
const key = progressKey;

/** Пам'ять «з цього стану кінець досяжний?» між прогонами — тисячі прогонів лишаються дешевими. */
export type EndMemo = Map<string, boolean>;

function tryMove(s: GameState, m: Move, defs: CoreDefs): GameState | null {
  const r = dispatch(s, { ...m, commandId: nextCommandId(s) } as Command, defs);
  return r.ok ? r.state : null;
}

/** Скільки квестів уже позаду (завершено чи відхилено) — порядок пошуку: далі по сюжету — раніше. */
const progressOf = (s: GameState): number => Object.values(s.quests).filter((q) => q.status !== 'active').length;

/**
 * Обмежений пошук до campaignEnded. undefined — ліміт вичерпано (чесне «не знаю»).
 * GAME-141: порядок — «спершу далі по сюжету» (кошики за кількістю пройдених квестів, у кошику — FIFO), а не чиста ширина:
 * з днем 2 кінець розділу на ~40 ходів глибше, і пошук у ширину перебирав майже весь простір, перш ніж дійти до кінця. Порядок
 * не змінює відповіді: «так» — лише коли знайдено справжній стан кінця, «ні» — лише коли досяжний простір вичерпано повністю.
 */
export function endReachable(start: GameState, defs: CoreDefs, memo: EndMemo, cap: number): boolean | undefined {
  const k0 = key(start);
  const known = memo.get(k0);
  if (known !== undefined) return known;
  const seen = new Set([k0]);
  const buckets: GameState[][] = [];
  const push = (s: GameState): void => { const p = progressOf(s); (buckets[p] ??= []).push(s); };
  const pop = (): GameState | undefined => {
    for (let p = buckets.length - 1; p >= 0; p--) { const b = buckets[p]; if (b?.length) return b.shift(); }
    return undefined;
  };
  push(start);
  for (let s = pop(); s; s = pop()) {
    if (s.campaignEnded || memo.get(key(s)) === true) { memo.set(k0, true); return true; }
    for (const m of moves(s, defs)) {
      if (isLuckMove(m)) continue; // кінець — без удачі (SIM-EV-003); у випадкову прогулянку подія входить
      const n = tryMove(s, m, defs);
      if (!n) continue;
      const k = key(n);
      if (!seen.has(k)) { seen.add(k); push(n); }
    }
    if (seen.size > cap) return undefined;
  }

  // Увесь досяжний простір пройдено — кінця немає ніде: усі ці стани — тупики.
  for (const k of seen) memo.set(k, false);
  return false;
}

const pick = <T>(rng: RngState, xs: readonly T[]): { value: T; rng: RngState } => {
  const r = nextInt(rng, xs.length);
  return { value: xs[r.value] as T, rng: r.state };
};

/** Параметри прогону. `trace` (GAME-106) — кожен зроблений хід бота по порядку: з нього модель часу рахує хвилини гравця. */
export interface BotOpts {
  readonly maxSteps: number;
  readonly cap: number;
  readonly trace?: (move: Move, before: GameState, after: GameState) => void;
}

export function runBot(defs: CoreDefs, variant: Variant, seed: number, memo: EndMemo, opts: BotOpts = { maxSteps: 80, cap: 20_000 }): BotRun {
  let rng = seedRng(seed);
  const created = dispatch(initialState(variant.money === 'some' ? 10_000 : 0), {
    type: 'CreateCharacter', commandId: 'b0', profileId: variant.profile, transportId: variant.transport,
    ...(variant.animal === 'animal.none' ? {} : { animalId: variant.animal }),
  }, defs);
  if (!created.ok) return { seed, variant, steps: 0, purchases: 0, verdict: 'softlock', stuck: { quests: {}, player: null, inventory: {}, flags: [], dialogue: null }, final: initialState(0) };
  let s = created.state;
  let steps = 0;
  let purchases = 0;
  const isChoice = (m: Move): boolean => {
    if ((m.type !== 'CompleteQuest' && m.type !== 'DeclineQuest') || m.to === undefined) return false;
    const on = m.type === 'CompleteQuest' ? 'complete' : 'decline';   // рецензія: шукати перехід саме цього виду
    return !!defs.story?.quests[m.questId]?.transitions.find((t) => t.on === on && t.to === m.to)?.choice;
  };
  // Подія в дорозі — як у симуляції (sim.roadEvent): лише одразу після приїзду і щонайбільше одна на приїзд (GAME-108).
  // Без цього бот на дорозі з десятьма подіями «викликав» у середньому ~5 подій за прогін: і хвилини моделі часу, і кроки
  // прогону йшли на те, чого гравець ніколи не побачить.
  let arrived = false;
  for (; steps < opts.maxSteps && !s.campaignEnded; steps++) {
    const options = moves(s, defs)
      .filter((m) => !(isLuckMove(m) && !arrived))
      // Ставлення до бічної гілки: «skip» не бере переходів-виборів (лише шлях за замовчуванням).
      .filter((m) => !(variant.side === 'skip' && isChoice(m)))
      .map((m) => ({ m, n: tryMove(s, m, defs) })).filter((o): o is { m: Move; n: GameState } => o.n !== null);
    if (options.length === 0) break;
    // GAME-144: розділ — три дні (~45 сюжетних кроків), а чиста випадкова прогулянка серед ~30 ходів доходила до кінця лише за
    // 126+ ходів (за 80 — 0 із 2000). Гравець-людина, бачачи готовий крок сюжету, зазвичай його й робить: якщо є хід, що рухає
    // квести (ціль виконано, квест завершено чи відхилено), бот підкидає монету — орел: обирає серед таких ходів, решка: серед
    // усіх, як раніше. Бічна гілка, відмови, купівлі й розмови лишаються випадковими; «дійшов» — лише справжній стан кінця.
    const ahead = options.filter((o) => o.n.quests !== s.quests);
    let pool = options;
    if (ahead.length > 0) {
      const coin = nextInt(rng, 2);
      rng = coin.state;
      if (coin.value === 0) pool = ahead;
    }
    const p = pick(rng, pool);
    rng = p.rng;
    if (p.value.m.type === 'BuyItem' && s.grants.length === 0) purchases++;
    opts.trace?.(p.value.m, s, p.value.n);
    arrived = p.value.m.type === 'Visit' && p.value.n.player?.locationId !== s.player?.locationId;
    s = p.value.n;
  }
  if (s.campaignEnded) return { seed, variant, steps, purchases, verdict: 'ended', final: s };
  const reach = endReachable(s, defs, memo, opts.cap);
  if (reach === true) return { seed, variant, steps, purchases, verdict: 'end-reachable', final: s };
  return {
    seed, variant, steps, purchases, verdict: reach === false ? 'softlock' : 'unknown',
    stuck: { quests: s.quests, player: s.player, inventory: s.inventory, flags: s.flags, dialogue: s.dialogue },
    final: s,
  };
}

/** Варіанти: дозволені комбінації × ставлення до бічної гілки × гроші — у порядку, детермінованому зерном. */
export function variantsFor(combos: readonly { profile: string | null; transport: string | null; animal: string }[]): Variant[] {
  const out: Variant[] = [];
  for (const c of combos) for (const side of ['take', 'skip'] as const) for (const money of ['none', 'some'] as const) {
    out.push({ profile: c.profile ?? '', transport: c.transport ?? '', animal: c.animal, side, money });
  }
  return out;
}

export const AXES = ['profile', 'transport', 'animal', 'side', 'money'] as const;

/** Попарне покриття: кожна пара значень двох осей, що зустрічається серед ДОЗВОЛЕНИХ варіантів, є хоч в одному прогоні. */
export function uncoveredPairs(allowed: readonly Variant[], runs: readonly BotRun[]): string[] {
  const pairsOf = (v: Variant): string[] => {
    const out: string[] = [];
    for (let i = 0; i < AXES.length; i++) for (let j = i + 1; j < AXES.length; j++) {
      const a = AXES[i] as (typeof AXES)[number];
      const b = AXES[j] as (typeof AXES)[number];
      out.push(`${a}=${v[a]} × ${b}=${v[b]}`);
    }
    return out;
  };
  const need = new Set(allowed.flatMap(pairsOf));
  const have = new Set(runs.flatMap((r) => pairsOf(r.variant)));
  return [...need].filter((p) => !have.has(p)).sort();
}
