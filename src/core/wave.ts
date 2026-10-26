// Хвилі напруги (GAME-170, рішення власника 24–25.10). Чиста логіка над станом гри, у стилі story.ts.
//
// Хвиля — 2–4 одночасні справи, кожна зі своєю межею в ІГРОВИХ хвилинах. Годинник — у симуляції (sim.ts), тож
// «зараз» (`now`) приходить сюди параметром: пауза зупиняє годинник — і всі строки разом із ним. Справа, яку закрили
// до строку, — `done`; строк минув — `late` (м'якший наслідок, ніколи не поразка: SIM-EV-003, правило власника
// «гра не карає»). Хвиля закінчується, коли кожна справа вирішена; наслідки лишаються в `past`, і та сама хвиля вдруге
// не стартує (WAVE_SEEN) — унікальна для свого етапу. Кінець розділу від хвиль не залежить: хвиля завжди закінчується
// сама, щойно годинник мине найдовший строк (settleWave), і нічого не блокує.
import type { WaveDef, WaveDefs, WaveTaskDef } from './defs';
import { matches } from './story';
import type { GameState, PlayerState, RejectCode } from './state';

export type TaskOutcome = 'done' | 'late';

export interface WaveTaskState {
  /** Ігрова хвилина, після якої справа спізнилась (строк включно: на хвилині dueAt ще можна встигнути). */
  readonly dueAt: number;
  readonly outcome: 'open' | TaskOutcome;
}

export interface ActiveWave {
  readonly waveId: string;
  readonly startedAt: number;
  readonly tasks: Readonly<Record<string, WaveTaskState>>;
}

export interface WaveState {
  readonly active: ActiveWave | null;
  /** id хвилі → id справи → наслідок. Пишеться в мить, коли хвиля закінчилась. */
  readonly past: Readonly<Record<string, Readonly<Record<string, TaskOutcome>>>>;
}

export const EMPTY_WAVES: WaveState = { active: null, past: {} };

/** Хто закриває справу: лідер (гравець) чи помічник (GAME-170: помічники — пізніше; `leaderOnly` вже діє). */
export type TaskActor = 'leader' | 'helper';

export type WaveCommand =
  /** Відкрити хвилю (шле СЮЖЕТ, не гравець — як StartScene). */
  | { readonly type: 'StartWave'; readonly commandId: string; readonly waveId: string }
  /** Закрити справу живої хвилі. `actor` — хто робить; немає — лідер. */
  | { readonly type: 'CompleteTask'; readonly commandId: string; readonly taskId: string; readonly actor?: TaskActor };

/** Чернетка, яку змінюють команди хвиль (підмножина StoryDraft). */
export interface WaveDraft {
  player: PlayerState | null;
  flags: string[];
  quests: GameState['quests'];
  wave?: WaveState;
}

const own = <T>(o: Readonly<Record<string, T>>, k: string): T | undefined => (Object.hasOwn(o, k) ? o[k] : undefined);

/** Справи хвилі, що існують для цього гравця (варіант за транспортом / профілем / твариною). */
export const tasksFor = (w: WaveDef, p: PlayerState): WaveTaskDef[] => w.tasks.filter((t) => matches(t.when, p));

function setFlags(d: WaveDraft, flags: readonly string[]): void {
  const next = flags.filter((f) => !d.flags.includes(f));
  if (next.length) d.flags = [...d.flags, ...next].sort();
}

/** Якщо всі справи вирішені — хвиля закінчується: наслідки в `past`, прапорці «усе встигли», живої хвилі немає. */
function finishIfResolved(d: WaveDraft, defs: WaveDefs | undefined): void {
  const a = d.wave?.active;
  if (!a || Object.values(a.tasks).some((t) => t.outcome === 'open')) return;
  const outcomes = Object.fromEntries(Object.entries(a.tasks).map(([id, t]) => [id, t.outcome as TaskOutcome]));
  if (Object.values(outcomes).every((o) => o === 'done')) setFlags(d, own(defs?.waves ?? {}, a.waveId)?.allDone?.effects ?? []);
  d.wave = { active: null, past: { ...(d.wave?.past ?? {}), [a.waveId]: outcomes } };
}

export function applyWave(cmd: WaveCommand, d: WaveDraft, defs: WaveDefs | undefined, now: number | undefined, isId: (s: unknown) => boolean): RejectCode | null {
  if (!defs) return 'UNKNOWN_TARGET';
  const p = d.player;
  if (!p) return 'NO_CHARACTER';
  // Без годинника строків не поставити й не звірити (як BookLeave без «сьогодні»): мовчазна «хвилина 0» збрехала б.
  if (now === undefined || !Number.isSafeInteger(now) || now < 0) return 'INVALID_COMMAND';
  const state = d.wave ?? EMPTY_WAVES;
  if (cmd.type === 'StartWave') {
    if (!isId(cmd.waveId)) return 'INVALID_COMMAND';
    const w = own(defs.waves, cmd.waveId);
    if (!w) return 'UNKNOWN_TARGET';
    if (!matches(w.when, p)) return 'CONDITION_FAILED';
    // Хвиля живе лише на своєму етапі: сюжет шле StartWave, але ядро не вірить, що етап уже/ще активний.
    if (own(d.quests, w.stage)?.status !== 'active') return 'WAVE_STAGE_INACTIVE';
    if (state.active) return 'WAVE_ACTIVE';
    if (own(state.past, cmd.waveId)) return 'WAVE_SEEN';
    const tasks = tasksFor(w, p);
    if (tasks.length === 0) return 'CONDITION_FAILED'; // валідатор (WAVE_VARIANT_INCOMPLETE) цього не мав пропустити
    d.wave = { ...state, active: { waveId: cmd.waveId, startedAt: now, tasks: Object.fromEntries(tasks.map((t) => [t.id, { dueAt: now + t.limitMin, outcome: 'open' as const }])) } };
    return null;
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cmd.taskId)) return 'INVALID_COMMAND';
  if (cmd.actor !== undefined && cmd.actor !== 'leader' && cmd.actor !== 'helper') return 'INVALID_COMMAND';
  const a = state.active;
  if (!a) return 'TASK_NOT_OPEN';
  const w = own(defs.waves, a.waveId);
  const def = w?.tasks.find((t) => t.id === cmd.taskId);
  if (!w || !def) return 'UNKNOWN_TARGET';
  const t = own(a.tasks, cmd.taskId);
  if (!t || t.outcome !== 'open' || now > t.dueAt) return 'TASK_NOT_OPEN'; // строк минув — справу вже вирішить settleWave як late
  if (def.leaderOnly === true && (cmd.actor ?? 'leader') !== 'leader') return 'TASK_LEADER_ONLY';
  d.wave = { ...state, active: { ...a, tasks: { ...a.tasks, [cmd.taskId]: { ...t, outcome: 'done' } } } };
  setFlags(d, def.done.effects);
  finishIfResolved(d, defs);
  return null;
}

/**
 * Годинник минув строк — справа спізнилась: наслідок `late`, його прапорці; коли вирішено все — хвиля закінчується.
 * Чиста функція над станом гри: симуляція кличе її після кожного кроку, що рухав годинник. Нічого не змінилось —
 * повертає той самий об'єкт (сейв і відбиток стану без хвиль не змінюються).
 */
export function settleWave(game: GameState, now: number, defs: WaveDefs | undefined): GameState {
  const a = game.wave?.active;
  if (!a || !game.player) return game;
  const w = own(defs?.waves ?? {}, a.waveId);
  // GAME-144: етап хвилі минув (квест уже не активний — гравець завершив етап чи поїхав) — усе ще відкрите спізнилось так само:
  // хвиля живе лише на своєму етапі, і сцена наступного етапу не чекає, поки годинник домине чужі строки.
  const stageOver = w !== undefined && own(game.quests, w.stage)?.status !== 'active';
  const expired = Object.entries(a.tasks).filter(([, t]) => t.outcome === 'open' && (stageOver || now > t.dueAt)).map(([id]) => id);
  if (expired.length === 0) return game;
  const d: WaveDraft = { player: game.player, flags: [...game.flags], quests: game.quests, wave: { ...game.wave, active: { ...a, tasks: { ...a.tasks, ...Object.fromEntries(expired.map((id) => [id, { ...(a.tasks[id] as WaveTaskState), outcome: 'late' as const }])) } }, past: game.wave?.past ?? {} } };
  setFlags(d, expired.flatMap((id) => w?.tasks.find((t) => t.id === id)?.late.effects ?? []));
  finishIfResolved(d, defs);
  return { ...game, flags: d.flags, ...(d.wave ? { wave: d.wave } : {}) };
}

/** Жива хвиля для екрана: кожна справа з хвилинами, що лишились (0 — строк саме зараз; від'ємних не буває). */
export function waveView(game: Pick<GameState, 'wave'>, now: number): { waveId: string; tasks: { id: string; remainingMin: number; outcome: WaveTaskState['outcome'] }[] } | null {
  const a = game.wave?.active;
  if (!a) return null;
  return { waveId: a.waveId, tasks: Object.entries(a.tasks).map(([id, t]) => ({ id, remainingMin: Math.max(0, t.dueAt - now), outcome: t.outcome })) };
}

/** Наслідок справи хвилі, що вже закінчилась (для стартерів сцен: «дрова спізнились» → вечір із ліхтарем). */
export function taskOutcome(game: Pick<GameState, 'wave'>, waveId: string, taskId: string): TaskOutcome | undefined {
  return own(own(game.wave?.past ?? {}, waveId) ?? {}, taskId);
}
