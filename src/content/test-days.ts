// GAME-256 · спільний тестовий помічник «день N, година M» — ЛЕГІТИМНО: справжніми командами Sleep крізь ядро й звичайним перемотуванням годинника.
// Лічильник сну (`slept`) тут НІКОЛИ не ставиться руками: інакше тест перевіряв би власну підміну, а не ворота дня сюжету.
import { EVENING, GAME_START_MINUTE, minuteOfDay, nextAt } from '../core/clock';
import { dispatch, nextCommandId, type Command } from '../core/commands';
import { canSleep } from '../core/rest';
import type { CoreDefs } from '../core/defs';
import { step, type SimState } from '../core/sim';
import type { GameState } from '../core/state';
import { storyDay } from '../core/story';
import type { Move } from './moves';
import { GAME_DEFS } from './slice-defs';

/** Сон як хід (чисте ядро без годинника: абстрактний). У тестах із годинником — sleepThrough. */
export const SLEEP: Move = { type: 'Sleep' };

/** Перемотати годинник до найближчої `hh:mm` (якщо вже цієї хвилини — лишити). */
export function toClock(sim: SimState, hh: number, mm = 0, defs: CoreDefs = GAME_DEFS): SimState {
  const tod = hh * 60 + mm;
  if (minuteOfDay(sim.clock.minutes) === tod) return sim;
  return step(sim, { kind: 'advance', minutes: nextAt(sim.clock.minutes, tod) - sim.clock.minutes }, { defs });
}

/** Лягти спати: до вечора (18:00), якщо ще вдень, далі — справжня команда Sleep (ядро саме перевіряє ліжко/намет). Прокидання — 07:00 наступної доби. */
export function sleepThrough(sim: SimState, defs: CoreDefs = GAME_DEFS, id?: string): SimState {
  const evening = minuteOfDay(sim.clock.minutes) >= EVENING || minuteOfDay(sim.clock.minutes) < 7 * 60 ? sim : toClock(sim, 18, 0, defs);
  // Без намету й ліжка (ніч в авто) лягти можна лише після «пора спати» 22:00 — ядро (canSleep) саме каже, коли.
  const ready = canSleep(evening.game, evening.clock.minutes) ? evening : toClock(evening, 22, 0, defs);
  const next = step(ready, { kind: 'command', command: { type: 'Sleep', commandId: id ?? `sd-${ready.clock.minutes}-${ready.game.seq}` } as Command }, { defs });
  if (storyDay(next.game.slept) <= storyDay(sim.game.slept)) throw new Error('sleepThrough: ядро не прийняло Sleep (герой не біля ліжка чи намету?)');
  return next;
}

/** День сюжету `day` (з 1), година `hh:mm`: сплячи стільки ночей, скільки треба, і далі перемотуючи годинник. */
export function toDayMinute(sim: SimState, day: number, hh = 7, mm = 0, defs: CoreDefs = GAME_DEFS): SimState {
  let s = sim;
  while (storyDay(s.game.slept) < day) s = sleepThrough(s, defs);
  return toClock(s, hh, mm, defs);
}

/** Той самий «сон» без годинника — для тестів на чистому стані ядра (бот, перебір): справжня команда Sleep через dispatch (без `now` сон абстрактний). */
export function sleepState(g: GameState, defs: CoreDefs = GAME_DEFS): GameState {
  const r = dispatch(g, { type: 'Sleep', commandId: nextCommandId(g) } as Command, defs);
  if (!r.ok) throw new Error(`sleepState: ${r.code}`);
  return r.state;
}
/** Спати, поки день сюжету не стане `day` (чисте ядро, без годинника). */
export function sleepStateTo(g: GameState, day: number, defs: CoreDefs = GAME_DEFS): GameState {
  let s = g;
  while (storyDay(s.slept) < day) s = sleepState(s, defs);
  return s;
}
export { GAME_START_MINUTE };

/** Крок чекає вечора цього ж дня (gate.fromMinute) — просто дочекатися тієї години звичайним перемотуванням. */
export function awaitGate(sim: SimState, questId: string, defs: CoreDefs = GAME_DEFS): SimState {
  const gate = defs.story?.quests[questId]?.gate;
  if (gate?.fromMinute === undefined || storyDay(sim.game.slept) !== gate.day || minuteOfDay(sim.clock.minutes) >= gate.fromMinute) return sim;
  return toClock(sim, Math.floor(gate.fromMinute / 60), gate.fromMinute % 60, defs);
}

/**
 * Крок симуляції командою `m` у «людському» порядку: Sleep — справжній сон (sleepThrough), а перед будь-якою іншою командою, якщо активний
 * основний крок чекає вечора ЦЬОГО Ж дня (gate.fromMinute), гравець просто чекає до тієї години (звичайне перемотування, нічого не підставляємо).
 */
export function simSend(sim: SimState, m: Move, id: string, defs: CoreDefs = GAME_DEFS): SimState {
  if (m.type === 'Sleep') return sleepThrough(sim, defs, id);
  let s = sim;
  for (const [qid, q] of Object.entries(s.game.quests)) {
    const gate = defs.story?.quests[qid]?.gate;
    if (q.status === 'active' && gate?.fromMinute !== undefined && storyDay(s.game.slept) === gate.day && minuteOfDay(s.clock.minutes) < gate.fromMinute) s = toClock(s, Math.floor(gate.fromMinute / 60), gate.fromMinute % 60, defs);
  }
  return step(s, { kind: 'command', command: { ...m, commandId: id } as Command }, { defs });
}

/**
 * Дії очікування, яких меню не пропонує як ходи, але гравець робить сам (GAME-256): «лягти спати» (коли активний крок чекає наступного дня) і «дочекатися вечора»
 * (крок чекає години цього дня). Для перебору через симуляцію: повертає наступні стани.
 */
export function waitMoves(sim: SimState, defs: CoreDefs = GAME_DEFS): SimState[] {
  const out: SimState[] = [];
  const g = sim.game;
  if (g.player && Object.entries(g.quests).some(([id, q]) => q.status === 'active' && defs.story?.quests[id]?.gate && storyDay(g.slept) < (defs.story.quests[id]?.gate?.day ?? 0))) out.push(sleepThrough(sim, defs));
  for (const [id, q] of Object.entries(g.quests)) if (q.status === 'active') { const t = awaitGate(sim, id, defs); if (t !== sim) out.push(t); }
  return out;
}
