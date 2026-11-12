// GAME-308 · каркас міні-ігор: життєвий цикл, три результати, м'який провал, допомога після двох «сяк-так» поспіль. Чиста логіка: жодного годинника, Phaser чи Math.random.
// Час — лише КАДРИ (один крок stepRun = один кадр гри), тому паузу, допомогу й межу часу можна пройти в тесті без очікування (закон 1: перевірка, що вміє червоніти).
//
// Договір, який не можна обійти (DAY-DESIGN §5, §5a):
//  * кожна міні-гра оголошує ВСІ три результати (good / fine / scrappy) і наслідок кожного — checkMinigame це доводить;
//  * `scrappy` ЗАВЖДИ пускає далі: результат записується, закрити можна, блоку й game-over немає (pause → giveUp теж веде в scrappy, а не в глухий кут);
//  * після рівно двох `scrappy` поспіль (на тій самій грі) наступний захід легший: більше часу, ширша смуга, підказка — без докору;
//  * результат лягає в стан гри (GameState.minigames) і в сейв: сценарій читає його потім (вогке ліжко, худіша вечеря).
//
// Як додати міні-гру: реалізуй MinigameDef (defineMinigame), додай у MINIGAMES (content/minigames/index.ts). Решту (цикл, допомога, запис у стан, сейв) дає каркас.

export const OUTCOMES = ['good', 'fine', 'scrappy'] as const;
export type Outcome = (typeof OUTCOMES)[number];
export const isOutcome = (o: unknown): o is Outcome => typeof o === 'string' && (OUTCOMES as readonly string[]).includes(o);

/** Кадрів на секунду ігрового часу міні-гри. Міні-гра триває 30–90 с гри (DAY-DESIGN §5). */
export const FPS = 60;
export const MIN_PLAY_FRAMES = 30 * FPS;
export const MAX_PLAY_FRAMES = 90 * FPS;
/**
 * GAME-309 · «подорож» — окремий вид міні-гри з довшою межею: дорога має відчуватись мандрівкою, а не
 * спринтом (рішення власника: 2–3 хв живої гри). Звичайні міні-ігри лишаються в 30–90 с; подорож — 90–180 с.
 */
export type MinigameKind = 'game' | 'journey';
export const MIN_JOURNEY_FRAMES = 90 * FPS;
export const MAX_JOURNEY_FRAMES = 180 * FPS;
/** Дозволені межі кадрів за видом гри. */
export const limitBounds = (kind: MinigameKind | undefined): { readonly min: number; readonly max: number } =>
  kind === 'journey' ? { min: MIN_JOURNEY_FRAMES, max: MAX_JOURNEY_FRAMES } : { min: MIN_PLAY_FRAMES, max: MAX_PLAY_FRAMES };
/** Скільки `scrappy` поспіль — і з'являється допомога. */
export const HELP_AFTER = 2;
/** Стеля лічильників у сейві: стан і сейв не ростуть без меж. */
export const COUNT_CAP = 9999;

/** Послаблення, яке міні-гра ЧИТАЄ: більше часу (×timeScale до межі кадрів), ширша смуга (×bandScale), показати підказку. */
export interface Difficulty {
  readonly timeScale: number;
  readonly bandScale: number;
  readonly hint: boolean;
}
export const NORMAL: Difficulty = { timeScale: 1, bandScale: 1, hint: false };
export const RELAXED: Difficulty = { timeScale: 1.5, bandScale: 1.5, hint: true };

/** Вхід одного кадру: лише дотик і перетягування (один палець), координати 0..1 по полю міні-гри. Жодних клавіш і двох пальців. */
export interface Point { readonly x: number; readonly y: number }
export interface FrameInput {
  readonly taps: readonly Point[];
  readonly drag: Point | null;
}
export const NO_INPUT: FrameInput = { taps: [], drag: null };

/** Що буде в світі після результату: тег наслідку для сценарію (`bedding.damp`) і ключ тексту результату (i18n). */
export interface OutcomeDecl {
  readonly consequence: string;
  readonly resultKey: string;
}

export interface MinigameDef<S = unknown, V = unknown> {
  /** `mg.назва` (формат id контенту). */
  readonly id: string;
  /** Ключі назви, вступу й підказки допомоги (i18n). */
  readonly titleKey: string;
  readonly introKey: string;
  readonly hintKey: string;
  /** Межа гри в кадрах при звичайній складності: 30–90 с (1800…5400 кадрів), для `journey` — 90–180 с (5400…10800). Допомога розтягує її ×timeScale. */
  readonly limitFrames: number;
  /** Вид гри: звичайна (за замовчуванням) чи подорож із довшою межею. */
  readonly kind?: MinigameKind;
  /** Усі три результати — обов'язково (перевіряє checkMinigame). */
  readonly outcomes: Readonly<Record<Outcome, OutcomeDecl>>;
  readonly init: (d: Difficulty, seed: number) => S;
  /** Один кадр. Чиста: той самий (стан, вхід, складність) — той самий наслідок. */
  readonly step: (s: S, input: FrameInput, d: Difficulty) => S;
  /** Гра закінчилась сама (до межі кадрів). */
  readonly done: (s: S) => boolean;
  /** Результат ЗА СТАНОМ — і при завершенні, і коли вичерпались кадри. «Далі без цього» дає scrappy без цього виклику. */
  readonly outcomeOf: (s: S) => Outcome;
  /** Дані для малювання поверхні гри (UI їх лише читає). */
  readonly view: (s: S, d: Difficulty) => V;
}
export type AnyMinigame = MinigameDef<unknown, unknown>;
/** Єдиний спосіб зареєструвати типізовану гру: типи стану й вигляду стираються лише тут. */
export const defineMinigame = <S, V>(def: MinigameDef<S, V>): AnyMinigame => def as unknown as AnyMinigame;

/** Запобіжники каркаса. Усі увімкнено в грі; вимикаються лише в мутаціях тестів (закон 1, як Safeguards шини). */
export interface MinigameGuards {
  /** false (мутація): `scrappy` блокує — результат не пишеться й гру не закрити. */
  readonly scrappyContinues?: boolean;
  /** false (мутація): лічильник рахує всі «сяк-так», а не підряд. */
  readonly consecutive?: boolean;
  /** Скільки поспіль потрібно для допомоги (мутація підставляє 1 або 3). */
  readonly helpAfter?: number;
}

/** Запис про міні-гру в стані й сейві. */
export interface MinigameRecord {
  /** Останній результат. */
  readonly last: Outcome;
  /** Тег наслідку останнього результату (його читає сценарій). */
  readonly consequence: string;
  /** Скільки разів зіграно (≤ COUNT_CAP). */
  readonly plays: number;
  /** Скільки `scrappy` поспіль на кінець останнього заходу (0, якщо останній не scrappy). */
  readonly scrappyStreak: number;
}
export type MinigameResults = Readonly<Record<string, MinigameRecord>>;

const own = <T>(o: Readonly<Record<string, T>>, k: string): T | undefined => (Object.hasOwn(o, k) ? o[k] : undefined);

/**
 * Записати результат. null — лише коли запобіжник `scrappyContinues` вимкнено й результат scrappy (мутація тесту: блок).
 * Лічильник «поспіль»: scrappy додає 1, good/fine скидає в 0.
 */
export function recordResult(results: MinigameResults | undefined, id: string, outcome: Outcome, consequence: string, guard: MinigameGuards = {}): MinigameResults | null {
  if (outcome === 'scrappy' && guard.scrappyContinues === false) return null;
  const prev = own(results ?? {}, id);
  const consecutive = guard.consecutive !== false;
  const streak = outcome === 'scrappy' ? Math.min((prev?.scrappyStreak ?? 0) + 1, COUNT_CAP) : consecutive ? 0 : (prev?.scrappyStreak ?? 0);
  return { ...results, [id]: { last: outcome, consequence, plays: Math.min((prev?.plays ?? 0) + 1, COUNT_CAP), scrappyStreak: streak } };
}

/** Складність наступного заходу: після HELP_AFTER `scrappy` поспіль — послаблена, інакше звичайна. */
export function difficultyFor(record: MinigameRecord | undefined, guard: MinigameGuards = {}): Difficulty {
  return (record?.scrappyStreak ?? 0) >= (guard.helpAfter ?? HELP_AFTER) ? RELAXED : NORMAL;
}
export const helpActive = (record: MinigameRecord | undefined, guard: MinigameGuards = {}): boolean => difficultyFor(record, guard) !== NORMAL;

/** Читання для сценарію: останній результат і тег наслідку; null — міні-гру ще не грали. */
export const resultOf = (results: MinigameResults | undefined, id: string): MinigameRecord | null => own(results ?? {}, id) ?? null;

/** Знахідки по міні-грі: порожньо — добре. Це сторож реєстру (закон 1: мутація — прибрати програшний результат — його червонить). */
export interface Finding { readonly code: 'ID' | 'OUTCOMES' | 'LIMIT' | 'TEXT' | 'CONSEQUENCE'; readonly detail: string }
const ID = /^mg\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
export function checkMinigame(def: AnyMinigame): Finding[] {
  const out: Finding[] = [];
  if (!ID.test(def.id)) out.push({ code: 'ID', detail: def.id });
  for (const o of OUTCOMES) {
    const decl = own(def.outcomes ?? {}, o);
    if (!decl) { out.push({ code: 'OUTCOMES', detail: `${def.id}: outcome ${o} is not declared` }); continue; }
    if (typeof decl.consequence !== 'string' || decl.consequence === '') out.push({ code: 'CONSEQUENCE', detail: `${def.id}.${o}: empty consequence` });
    if (typeof decl.resultKey !== 'string' || decl.resultKey === '') out.push({ code: 'TEXT', detail: `${def.id}.${o}: empty result key` });
  }
  for (const k of Object.keys(def.outcomes ?? {})) if (!isOutcome(k)) out.push({ code: 'OUTCOMES', detail: `${def.id}: unknown outcome ${k}` });
  // Наслідки різні: «сяк-так» мусить відрізнятись від «добре» — інакше він нічого не записує в світ.
  const seen = new Set<string>();
  for (const o of OUTCOMES) {
    const c = own(def.outcomes ?? {}, o)?.consequence;
    if (c === undefined) continue;
    if (seen.has(c)) out.push({ code: 'CONSEQUENCE', detail: `${def.id}: consequence ${c} is used twice` });
    seen.add(c);
  }
  const b = limitBounds(def.kind);
  if (def.kind !== undefined && def.kind !== 'game' && def.kind !== 'journey') out.push({ code: 'LIMIT', detail: `${def.id}: unknown kind ${String(def.kind)}` });
  if (!Number.isInteger(def.limitFrames) || def.limitFrames < b.min || def.limitFrames > b.max) out.push({ code: 'LIMIT', detail: `${def.id}: ${def.limitFrames} frames outside ${b.min}..${b.max} (${def.kind ?? 'game'})` });
  for (const k of ['titleKey', 'introKey', 'hintKey'] as const) if (typeof def[k] !== 'string' || def[k] === '') out.push({ code: 'TEXT', detail: `${def.id}.${k}` });
  return out;
}

// ───────────────────────── Життєвий цикл: open → play → result → close ─────────────────────────

export type Phase = 'open' | 'play' | 'result' | 'closed';
export interface MinigameRun<S = unknown> {
  readonly id: string;
  readonly phase: Phase;
  readonly paused: boolean;
  /** Кадрів зіграно (лише в phase=play і не на паузі). */
  readonly frame: number;
  /** Межа кадрів із урахуванням допомоги. */
  readonly limit: number;
  readonly difficulty: Difficulty;
  readonly helped: boolean;
  readonly state: S;
  /** Є лише з phase=result. */
  readonly outcome: Outcome | null;
  /** Гравець обрав «далі без цього» (пауза → giveUp): результат — scrappy. */
  readonly skipped: boolean;
}

/** Відкрити: складність — за записом (допомога після двох scrappy поспіль). Гра ще не йде: гравець бачить вступ. */
export function openRun(def: AnyMinigame, results: MinigameResults | undefined, seed: number, guard: MinigameGuards = {}): MinigameRun {
  const difficulty = difficultyFor(resultOf(results, def.id) ?? undefined, guard);
  return { id: def.id, phase: 'open', paused: false, frame: 0, limit: Math.round(def.limitFrames * difficulty.timeScale), difficulty, helped: difficulty !== NORMAL, state: def.init(difficulty, seed), outcome: null, skipped: false };
}

/** Почати гру (тап «Почати»). */
export const startRun = (run: MinigameRun): MinigameRun => (run.phase === 'open' ? { ...run, phase: 'play' } : run);

/** Пауза доступна завжди, поки гра не закрита: у вступі, під час гри й на результаті. */
export const setPaused = (run: MinigameRun, paused: boolean): MinigameRun => (run.phase === 'closed' || run.paused === paused ? run : { ...run, paused });

function finish(def: AnyMinigame, run: MinigameRun, state: unknown): MinigameRun {
  const o = def.outcomeOf(state);
  return { ...run, state, phase: 'result', paused: false, outcome: isOutcome(o) ? o : 'scrappy' };
}

/** Один кадр. Поза грою й на паузі кадр нічого не міняє. Гра завершується сама або коли вичерпано межу кадрів. */
export function stepRun(def: AnyMinigame, run: MinigameRun, input: FrameInput): MinigameRun {
  if (run.phase !== 'play' || run.paused) return run;
  const state = def.step(run.state, input, run.difficulty);
  const frame = run.frame + 1;
  const next = { ...run, frame };
  return def.done(state) || frame >= run.limit ? finish(def, next, state) : { ...next, state };
}

/** «Далі без цього» (з паузи чи вступу): гру завершено як scrappy, ніхто не застряг. */
export function giveUp(run: MinigameRun): MinigameRun {
  if (run.phase !== 'open' && run.phase !== 'play') return run;
  return { ...run, phase: 'result', paused: false, skipped: true, outcome: 'scrappy' };
}

/** Закрити результат. `scrappy` закривається так само, як і добрий (запобіжник scrappyContinues=false — мутація тесту). */
export function closeRun(run: MinigameRun, guard: MinigameGuards = {}): MinigameRun {
  if (run.phase !== 'result') return run;
  if (run.outcome === 'scrappy' && guard.scrappyContinues === false) return run;
  return { ...run, phase: 'closed' };
}

/** Чи гравець може рухатись далі: результат уже є й закрити його можна. */
export const canContinue = (run: MinigameRun, guard: MinigameGuards = {}): boolean => run.phase === 'closed' || (run.phase === 'result' && closeRun(run, guard).phase === 'closed');

/** Що ядро знає про зареєстровані міні-ігри (CoreDefs.minigames): id → наслідок кожного результату. Команда FinishMinigame бере наслідок ЗВІДСИ, ніколи з команди. */
export type MinigameDefs = Readonly<Record<string, Readonly<Record<Outcome, string>>>>;
export const minigameDefsOf = (list: readonly AnyMinigame[]): MinigameDefs =>
  Object.fromEntries(list.map((d) => [d.id, { good: d.outcomes.good?.consequence ?? '', fine: d.outcomes.fine?.consequence ?? '', scrappy: d.outcomes.scrappy?.consequence ?? '' }]));

/** Що записати у стан за закінченим заходом: результат і тег наслідку за оголошенням гри. null — результату ще немає. */
export function resultOfRun(def: AnyMinigame, run: MinigameRun): { readonly outcome: Outcome; readonly consequence: string } | null {
  if (run.outcome === null) return null;
  const decl = own(def.outcomes, run.outcome);
  return decl ? { outcome: run.outcome, consequence: decl.consequence } : null;
}
