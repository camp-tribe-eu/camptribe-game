// Бот-гравець (GAME-37, TD-012): тисячі проходжень ядра з фіксованим зерном. Кожен прогін — випадкова
// прогулянка справжніми командами; з місця, де бот зупинився, обмежений пошук доводить, що кінець
// розділу досяжний. Якщо ні — прогін звітує стан, з якого фінал недосяжний (тупик), а не «пройшов».
//
// Чим відрізняється від повного перебору (story.test): той доводить відсутність тупиків для нинішнього
// малого контенту; бот масштабується на контент, де повний перебір неможливий, і ходить «як людина» —
// з випадковими купівлями, продажами й відмовами.
import { dispatch, nextCommandId, type Command } from '../core/commands';
import type { CoreDefs } from '../core/defs';
import { stateHash } from '../core/hash';
import { nextInt, seedRng, type RngState } from '../core/rng';
import { initialState, type GameState } from '../core/state';
import { moves, type Move } from './moves';

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
  readonly verdict: Verdict;
  /** Для тупика — стан, з якого кінець недосяжний (квести, локація, інвентар). */
  readonly stuck?: Pick<GameState, 'quests' | 'player' | 'inventory' | 'flags' | 'dialogue'>;
}

const key = (s: GameState): string => stateHash({ ...s, processed: null, seq: null });

/** Пам'ять «з цього стану кінець досяжний?» між прогонами — тисячі прогонів лишаються дешевими. */
export type EndMemo = Map<string, boolean>;

function tryMove(s: GameState, m: Move, defs: CoreDefs): GameState | null {
  const r = dispatch(s, { ...m, commandId: nextCommandId(s) } as Command, defs);
  return r.ok ? r.state : null;
}

/** Обмежений пошук у ширину до campaignEnded. undefined — ліміт вичерпано (чесне «не знаю»). */
function endReachable(start: GameState, defs: CoreDefs, memo: EndMemo, cap: number): boolean | undefined {
  const k0 = key(start);
  const known = memo.get(k0);
  if (known !== undefined) return known;
  const seen = new Set([k0]);
  const queue = [start];
  for (let s = queue.shift(); s; s = queue.shift()) {
    if (s.campaignEnded || memo.get(key(s)) === true) { memo.set(k0, true); return true; }
    for (const m of moves(s, defs)) {
      const n = tryMove(s, m, defs);
      if (!n) continue;
      const k = key(n);
      if (!seen.has(k)) { seen.add(k); queue.push(n); }
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

export function runBot(defs: CoreDefs, variant: Variant, seed: number, memo: EndMemo, opts = { maxSteps: 80, cap: 20_000 }): BotRun {
  let rng = seedRng(seed);
  const created = dispatch(initialState(variant.money === 'some' ? 5_000 : 0), {
    type: 'CreateCharacter', commandId: 'b0', profileId: variant.profile, transportId: variant.transport,
    ...(variant.animal === 'animal.none' ? {} : { animalId: variant.animal }),
  }, defs);
  if (!created.ok) return { seed, variant, steps: 0, verdict: 'softlock', stuck: { quests: {}, player: null, inventory: {}, flags: [], dialogue: null } };
  let s = created.state;
  let steps = 0;
  for (; steps < opts.maxSteps && !s.campaignEnded; steps++) {
    const options = moves(s, defs)
      // Ставлення до бічної гілки: «skip» не бере переходів-виборів (лише шлях за замовчуванням).
      .filter((m) => !(variant.side === 'skip' && m.type === 'CompleteQuest' && m.to !== undefined && defs.story?.quests[m.questId]?.transitions.find((t) => t.to === m.to)?.choice))
      .map((m) => tryMove(s, m, defs)).filter((n): n is GameState => n !== null);
    if (options.length === 0) break;
    const p = pick(rng, options);
    rng = p.rng;
    s = p.value;
  }
  if (s.campaignEnded) return { seed, variant, steps, verdict: 'ended' };
  const reach = endReachable(s, defs, memo, opts.cap);
  if (reach === true) return { seed, variant, steps, verdict: 'end-reachable' };
  return {
    seed, variant, steps, verdict: reach === false ? 'softlock' : 'unknown',
    stuck: { quests: s.quests, player: s.player, inventory: s.inventory, flags: s.flags, dialogue: s.dialogue },
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
