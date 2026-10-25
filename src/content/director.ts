// GAME-170 зріз 2 · режисер: ходи СЮЖЕТУ, які гра шле сама (гравець їх не обирає), і що робить об'єкт на мапі.
//
//  * Хвиля напруги стартує сама, щойно гравець на її етапі (W4: вечеря — CH1-D2-CAMP-001 активний). Ядро лишається сторожем
//    законності (applyWave: етап активний, живої немає, цієї ще не було, у варіанта гравця є справи); режисер лише повторює
//    ті самі умови, щоб не слати команду, яку ядро відкине (кожна відмова — рядок у processed).
//  * Вогнище кінця дня 2 (GAME-142) відкриває дотик до вогнища на мапі на етапі CH1-D2-FIRE-001, коли хвиля вже закінчилась:
//    факти сцени — лише з наслідків хвилі (дрова встигли → вогнище дозволене; вечеря встигла → вечеря завершена). Спізнились —
//    той самий вечір під навісом із ліхтарем (гілка lantern). Фото намету — GAME-140, доки його немає: false.
//  * Кінець розділу від цього не залежить: CompleteQuest CH1-D2-FIRE-001 лишається ходом меню завжди (day2.test, тут — director.test).
import type { CoreDefs } from '../core/defs';
import type { SimState } from '../core/sim';
import type { GameState } from '../core/state';
import { matches } from '../core/story';
import { taskOutcome, tasksFor } from '../core/wave';
import { FIREPLACE_SCENE, fireplaceFacts } from './fireplace';
import type { Move } from './moves';
import { WAVE_CH1_EVENING } from './waves';

export const FIRE_STAGE = 'CH1-D2-FIRE-001';
/** Префікс об'єкта мапи, дотик до якого закриває справу хвилі: task.<id справи>. */
export const TASK_SPOT = 'task.';

const own = <T>(o: Readonly<Record<string, T>>, k: string): T | undefined => (Object.hasOwn(o, k) ? o[k] : undefined);

/** Хвиля, яку сюжет мусить відкрити зараз (та сама перевірка, що в applyWave/StartWave), або null. */
export function pendingWave(game: GameState, defs: CoreDefs): string | null {
  const p = game.player;
  if (!p || game.campaignEnded || game.wave?.active) return null;
  for (const [id, w] of Object.entries(defs.waves?.waves ?? {})) {
    if (own(game.quests, w.stage)?.status !== 'active') continue;
    if (own(game.wave?.past ?? {}, id)) continue;
    if (!matches(w.when, p) || tasksFor(w, p).length === 0) continue;
    return id;
  }
  return null;
}

/** Автоматичні ходи сюжету для цього стану — у порядку надсилання. Порожньо — сюжету нічого робити. */
export function storyMoves(sim: SimState, defs: CoreDefs): Move[] {
  const waveId = pendingWave(sim.game, defs);
  return waveId ? [{ type: 'StartWave', waveId }] : [];
}

/** Сцену біля вогнища вже грали (запис StartScene у журналі) — удруге вона не відкривається. */
export const fireplacePlayed = (sim: SimState): boolean => sim.journal.some((e) => e.type === 'StartScene' && e.ref === FIREPLACE_SCENE);

/** Вечір дня 2 готовий відкритись: етап вогнища активний, розмови немає, хвиля закінчилась, сцени ще не було. */
export function fireplaceDue(sim: SimState): boolean {
  const g = sim.game;
  return own(g.quests, FIRE_STAGE)?.status === 'active' && !g.campaignEnded && g.dialogue === null && !g.wave?.active && !fireplacePlayed(sim);
}

/** Команда сцени з фактами ЛИШЕ з наслідків хвилі W4 (не вигадувати факт, якого не було). */
export function fireplaceMove(game: GameState): Move {
  const facts = fireplaceFacts({
    fireAllowed: taskOutcome(game, WAVE_CH1_EVENING, 'firewood') === 'done',
    dinnerDone: taskOutcome(game, WAVE_CH1_EVENING, 'dinner') === 'done',
    photoTaken: false,
  });
  return { type: 'StartScene', sceneId: FIREPLACE_SCENE, facts };
}

/** Що робить дотик до об'єкта мапи (тригера) зараз. null — об'єкт зараз нічого не робить. */
export function spotMove(sim: SimState, name: string): Move | null {
  if (name.startsWith(TASK_SPOT)) return liveSpot(sim, name) ? { type: 'CompleteTask', taskId: name.slice(TASK_SPOT.length) } : null;
  if (name === 'obj.campfire' && fireplaceDue(sim)) return fireplaceMove(sim.game);
  return { type: 'Interact', targetId: name };
}

/** Чи об'єкт мапи зараз «живий» (видимий і діє): ціль справи — лише поки справа відкрита; пакети — доки не прибрані. */
export function liveSpot(sim: SimState, name: string): boolean {
  if (name.startsWith(TASK_SPOT)) {
    const t = sim.game.wave?.active?.tasks[name.slice(TASK_SPOT.length)];
    return t !== undefined && t.outcome === 'open' && sim.clock.minutes <= t.dueAt;
  }
  if (name === 'obj.litter') return !sim.game.flags.includes('f.litter-cleaned-ch1');
  return true;
}
