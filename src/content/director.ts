// GAME-170 зріз 2 · режисер: ходи СЮЖЕТУ, які гра шле сама (гравець їх не обирає), і що робить об'єкт на мапі.
//
//  * Хвиля напруги стартує сама, щойно гравець на її етапі (W4: вечеря — CH1-D2-CAMP-001 активний). Ядро лишається сторожем
//    законності (applyWave: етап активний, живої немає, цієї ще не було, у варіанта гравця є справи); режисер лише повторює
//    ті самі умови, щоб не слати команду, яку ядро відкине (кожна відмова — рядок у processed).
//  * Вогнище кінця дня 2 (GAME-142) відкриває дотик до вогнища на мапі на етапі CH1-D2-FIRE-001, коли хвиля вже закінчилась:
//    факти сцени — лише з наслідків хвилі (дрова встигли → вогнище дозволене; вечеря встигла → вечеря завершена). Спізнились —
//    той самий вечір під навісом із ліхтарем (гілка lantern). Фото намету — GAME-140, доки його немає: false.
//  * Кінець розділу від цього не залежить: CompleteQuest CH1-D2-FIRE-001 лишається ходом меню завжди (day2.test, тут — director.test).
//  * Зріз 3 (W1–W3): хвиля стартує лише коли гравець У ЛОКАЦІЇ свого етапу (CH1-HOME-001 стає активним ще в крамниці — W1 чекає
//    повернення додому; ST-005 — приїзду в табір). Мапа в грі одна — табір біля озера (scene.ts, MAP_LOCATION), тож справи хвиль
//    інших локацій (дім, зупинка в дорозі) закриваються кнопками екрана подорожі (menuTasks → story-offer), а справи табору — цілями
//    task.* на мапі. Екран подорожі зупиняє годинник (Shell: story(open) → pause), тож строки W1/W2 ідуть лише поки гравець на мапі.
import type { CoreDefs } from '../core/defs';
import { todayWeather, type SimState } from '../core/sim';
import type { GameState } from '../core/state';
import { matches, questOpen } from '../core/story';
import { STORY } from './story';
import { taskOutcome, tasksFor } from '../core/wave';
import { FIREPLACE_SCENE, fireplaceFacts } from './fireplace';
import { isMapFirstSpot, liveMapSpot } from './map-first';
import { isTraceSpot, liveTraceSpot } from './traces';
import { isPhotoSpot, livePhotoSpot } from './photos';
import { DINNER_SPOT, dinnerDue, dinnerFinishMove, dinnerMove } from './ch2-dinner';
import { ch2FinishMove } from './ch2-live';
import { activityDue, activityFinishMoves, activityMove, eveningDue, eveningFinishMove, eveningMove } from './ch2-activity';
import { joinMove, schengenDue, schengenFinishMoves, schengenMove } from './ch2-schengen';
import { dispatch, nextCommandId, type Command } from '../core/commands';
import { isPlanSpot, planFinishMove, planSpotLive, planSpotMove, trailFinishMove } from './ch2-plan';
import { REPAIR_FLAG, REPAIR_SPOT } from './repair';
import type { Move } from './moves';
import { isRequestSpot, liveRequestSpot } from './requests';
import { WAVE_CH1_EVENING } from './waves';

export const FIRE_STAGE = 'CH1-D2-FIRE-001';
/** Локація єдиної мапи гри (public/maps/camp-lake.tmj, властивість locationId). Хвилі інших локацій граються з екрана подорожі. */
export const MAP_LOCATION = 'loc.camp.lake';
/** Префікс об'єкта мапи, дотик до якого закриває справу хвилі: task.<id справи>. */
export const TASK_SPOT = 'task.';

const own = <T>(o: Readonly<Record<string, T>>, k: string): T | undefined => (Object.hasOwn(o, k) ? o[k] : undefined);

/**
 * Збереження на CH1-D2-CAMP-001 без `wave` (гравець вийшов до старту хвилі): після завантаження (src/main.ts, перший direct())
 * хвиля стартує одразу, а строки рахуються від годинника ЗАВАНТАЖЕННЯ. Рішення (GAME-170): прийнятно — пауза між сесіями строк
 * не з'їдає, штрафу немає, а `past` не дає хвилі повторитись. Це зафіксовано в director.test («завантаження на CAMP-001»).
 */
/** Хвиля, яку сюжет мусить відкрити зараз (та сама перевірка, що в applyWave/StartWave), або null. */
export function pendingWave(game: GameState, defs: CoreDefs, now?: number): string | null {
  const p = game.player;
  if (!p || game.campaignEnded || game.wave?.active) return null;
  for (const [id, w] of Object.entries(defs.waves?.waves ?? {})) {
    if (own(game.quests, w.stage)?.status !== 'active') continue;
    if (defs.story && !questOpen(defs.story, game, w.stage, now)) continue;   // GAME-256: хвиля етапу, що чекає день чи вечір, не стартує (строки — від правильного дня)
    const where = own(defs.story?.quests ?? {}, w.stage)?.locationId;
    if (where !== undefined && where !== p.locationId) continue;
    if (own(game.wave?.past ?? {}, id)) continue;
    if (!matches(w.when, p) || tasksFor(w, p).length === 0) continue;
    return id;
  }
  return null;
}

/** Автоматичні ходи сюжету для цього стану — у порядку надсилання. Порожньо — сюжету нічого робити. */
export function storyMoves(sim: SimState, defs: CoreDefs): Move[] {
  const waveId = pendingWave(sim.game, defs, sim.clock.minutes);
  // GAME-288: після вечері розділу 2 день-квест завершується сам. GAME-289: після вибору стежки квест плану переходить у обрану гілку, а після вставки гілка завершується.
  // GAME-296: решта кроків розділу 2, що закриваються самими візитами (приїзд, прогулянка, водоспад, Шенген, додому), — теж самі; шле лише те, що ядро прийме.
  const accepts = (m: Move): boolean => dispatch(sim.game, { ...m, commandId: nextCommandId(sim.game) } as Command, defs, undefined, undefined, undefined, sim.clock.minutes).ok;
  const auto = [dinnerFinishMove(sim), planFinishMove(sim), trailFinishMove(sim), eveningFinishMove(sim), ch2FinishMove(sim, accepts)].filter((m): m is Move => m !== null);
  // GAME-290: водоспад і майстер-клас дня 2 відкриваються самі, щойно гравець на місці (сцена за погодою дня); після сцени квест завершується ланцюгом (галявина → завершення → назад). Шле лише те, що ядро прийме.
  const weather = todayWeather(sim);
  const act = activityDue(sim, weather);
  const scene: Move[] = act !== null && accepts(activityMove(act, weather)) ? [activityMove(act, weather)] : [];
  const fin = activityFinishMoves(sim, weather);
  const finish: Move[] = fin.length > 0 && accepts(fin[0] as Move) ? fin : [];
  // GAME-291: Шенген — сцена на набережній, потім завершення квесту (нагорода — половинки й мікрокарта) і дорога назад; з'єднання половинок — лише після свідомого вибору гравця в сцені.
  const sTale: Move[] = schengenDue(sim) && accepts(schengenMove(weather)) ? [schengenMove(weather)] : [];
  const sFin = schengenFinishMoves(sim);
  const schengenFinish: Move[] = sFin.length > 0 && accepts(sFin[0] as Move) ? sFin : [];
  const jm = joinMove(sim);
  const join: Move[] = jm !== null && accepts(jm) ? [jm] : [];
  return [...(waveId ? [{ type: 'StartWave', waveId } as Move] : []), ...scene, ...finish, ...sTale, ...schengenFinish, ...join, ...auto];
}

/** Локація етапу живої хвилі (звідки й де її справи): квест етапу без локації — null. */
export function waveLocation(game: GameState, defs: CoreDefs): string | null {
  const a = game.wave?.active;
  const w = a ? own(defs.waves?.waves ?? {}, a.waveId) : undefined;
  return (w && own(defs.story?.quests ?? {}, w.stage)?.locationId) ?? null;
}

/**
 * Справи живої хвилі, які закриває екран подорожі (зріз 3): лише коли етап хвилі НЕ в локації мапи — там справи є цілями task.*
 * (одна справа не має двох дверей). Відкриті й у строку, гравець на місці етапу, розмови немає.
 */
export function menuTasks(sim: SimState, defs: CoreDefs): Move[] {
  const g = sim.game;
  const a = g.wave?.active;
  if (!a || !g.player || g.dialogue !== null) return [];
  const where = waveLocation(g, defs);
  if (where === null || where === MAP_LOCATION || where !== g.player.locationId) return [];   // табір — цілі task.* на мапі; дім і дорога — ті ж цілі на своїх мапах (map-first.ts), панель їх ховає, коли об'єкт живий
  return Object.entries(a.tasks).filter(([, t]) => t.outcome === 'open' && sim.clock.minutes <= t.dueAt).map(([taskId]) => ({ type: 'CompleteTask', taskId }));
}

/** Сцену біля вогнища вже грали (запис StartScene у журналі) — удруге вона не відкривається. */
export const fireplacePlayed = (sim: SimState): boolean => sim.journal.some((e) => e.type === 'StartScene' && e.ref === FIREPLACE_SCENE);

/** Вечір дня 2 готовий відкритись: етап вогнища активний, розмови немає, хвиля закінчилась, сцени ще не було. */
export function fireplaceDue(sim: SimState): boolean {
  const g = sim.game;
  return own(g.quests, FIRE_STAGE)?.status === 'active' && questOpen(STORY, g, FIRE_STAGE, sim.clock.minutes) &&   // GAME-256: вечір — з 18:00 дня 2
     !g.campaignEnded && g.dialogue === null && !g.wave?.active && !fireplacePlayed(sim);
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
  if (name === DINNER_SPOT) return dinnerDue(sim) ? dinnerMove() : eveningDue(sim) ? eveningMove() : null;   // GAME-288: стіл вечері розділу 2 — сцена, поки її не було; інакше німий
  if (isPlanSpot(name)) return planSpotMove(sim, name);   // GAME-289 (GAME-296: поїздку з вказівника веде main.ts через resolveSpot, коли сцени немає): вказівники стежок у Мюллерталі — табличка плану й вставки гілок (сцени), інакше німі
  return { type: 'Interact', targetId: name };
}

/** Чи об'єкт мапи зараз «живий» (видимий і діє): ціль справи — лише поки справа відкрита; пакети — доки не прибрані. */
export function liveSpot(sim: SimState, name: string, defs?: CoreDefs): boolean {
  if (isPlanSpot(name)) return planSpotLive(sim, name) || (defs !== undefined && liveMapSpot(sim, defs, name));   // GAME-289: вказівники стежок веде цей модуль; GAME-296: офіційний на дні 1 — ще й вихід на прогулянку (map-first.ts)
  // GAME-175: об'єкти дня 1 удома веде map-first.ts (потрібен каталог — звідки ядру відомі речі пакування й сюжет); без каталогу вони мертві.
  if (isMapFirstSpot(name)) return defs !== undefined && liveMapSpot(sim, defs, name);
  if (name.startsWith(TASK_SPOT)) {
    const t = sim.game.wave?.active?.tasks[name.slice(TASK_SPOT.length)];
    return t !== undefined && t.outcome === 'open' && sim.clock.minutes <= t.dueAt && sim.game.player?.locationId === MAP_LOCATION;
  }
  if (isRequestSpot(name)) return liveRequestSpot(sim.game, name, undefined, todayWeather(sim));   // GAME-180: ціль прохання — лише поки прохання взято й ціль не зроблена
  if (isTraceSpot(name)) return liveTraceSpot(sim.game, name);   // GAME-215: слід дідуся — поки не знайдено
  if (isPhotoSpot(name)) return livePhotoSpot(sim.game, name, todayWeather(sim));   // GAME-213: кадр, поки фото не зроблено
  if (name === DINNER_SPOT) return dinnerDue(sim) || eveningDue(sim);   // GAME-288; GAME-290: той самий стіл — вечеря дня 2
  if (name === REPAIR_SPOT) return sim.game.player?.locationId === MAP_LOCATION && sim.game.dialogue === null && !sim.game.flags.includes(REPAIR_FLAG);   // GAME-209: лавка, поки не полагоджена
  if (name === 'obj.litter') return !sim.game.flags.includes('f.litter-cleaned-ch1');
  return true;
}
