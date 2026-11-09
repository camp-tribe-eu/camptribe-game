// GAME-288 · CH2-D1-SUMMARY: вечеря дня 1 розділу 2 (інші страви, ніж у розділі 1) і розмова з Інгрід про «Клуб мандрівників».
//
// Той самий механізм, що й вечір розділу 1 (GAME-142, src/content/fireplace.ts): сцена-діалог із власним `scene` (не NPC), яку відкриває ХІД СЮЖЕТУ StartScene
// за дотику до об'єкта мапи, а ядро лишається сторожем законності (сцена — лише на етапі `atQuest`, одна розмова за раз). Тут об'єкт — стіл біля ділянки 1
// на мапі Мюллерталя (obj.dinner, якір у scripts/maps/build_mullerthal.py; сцена показує його, як кадри GAME-287).
//
// Сцена КОСМЕТИЧНА для стану: жодного прапорця, жодної нагороди й жодної зміни квестів (`facts: []`) — вибір страви збігається в ту саму розмову, тож простір станів
// перебору (story-offer GAME-48, menu-here, bot) не росте. Єдиний слід — запис StartScene у журналі: за ним стіл гасне й сцена не повторюється. Сон не залежить
// від вечері: хто лягає спати без неї, нічого не втрачає (підсумок дня й сейв — як завжди).
import type { SimState } from '../core/sim';
import { EVENING, isNight, minuteOfDay } from '../core/clock';
import { questOpen, questSlept, storyDay } from '../core/story';
import { STORY } from './story';
import type { Move } from './moves';

export const DINNER_SCENE = 'dlg.ch2-dinner';
/** Об'єкт мапи Мюллерталя — стіл вечері. */
export const DINNER_SPOT = 'obj.dinner';
/** Квест, на етапі якого сцена законна (ним же її обмежує ядро: scene.atQuest у ch2-dinner.json). */
export const DINNER_QUEST = 'CH2-D1-SUMMARY-001';
export const DINNER_MAP_LOCATION = 'loc.camp.mullerthal';

/** Сцену вже грали (запис StartScene у журналі) — удруге вона не відкривається. */
export const dinnerPlayed = (sim: Pick<SimState, 'journal'>): boolean => sim.journal.some((e) => e.type === 'StartScene' && e.ref === DINNER_SCENE);

/** День 1 розділу 2 ще триває (родина не спала від старту розділу). */
const dayOne = (g: SimState['game']): boolean => storyDay(questSlept(DINNER_QUEST, g)) === 1;

/** Вечеря готова відкритись: етап дня 1 активний, вечір дня 1 (з 18:00 — як і сон), гравець у Мюллерталі, розмови немає, розділ не закінчено, сцени ще не було. */
export function dinnerDue(sim: SimState): boolean {
  const g = sim.game;
  return g.quests[DINNER_QUEST]?.status === 'active' && questOpen(STORY, g, DINNER_QUEST, sim.clock.minutes) && dayOne(g) && minuteOfDay(sim.clock.minutes) >= EVENING &&
    !g.campaignEnded && g.dialogue === null && g.player?.locationId === DINNER_MAP_LOCATION && !dinnerPlayed(sim);
}

/**
 * Вечеря зіграна (або вечір минув без неї: «пора спати» 22:00, чи вже ніч, чи день 1 скінчився сном), день-квест ще відкритий і всі обов'язкові цілі в ньому зроблені → сюжет сам завершує його
 * (ходом CompleteQuest — той самий, що в меню): у мапі-першій грі кроку розділу 2 немає об'єкта-завершення, а без нього «день 2» не відкрився б. Вечеря необов'язкова: хто її пропустив,
 * нічого не втрачає й не застрягає. Режисер шле лише те, що ядро прийме: цілі зроблені, розмови нема.
 */
export function dinnerFinishMove(sim: SimState): Move | null {
  const g = sim.game;
  const q = g.quests[DINNER_QUEST];
  const def = STORY.quests[DINNER_QUEST];
  if (q?.status !== 'active' || def === undefined || g.dialogue !== null || g.campaignEnded || !(dinnerPlayed(sim) || isNight(sim.clock.minutes) || !dayOne(g))) return null;
  return def.objectives.every((o) => !o.required || q.done.includes(o.id)) ? { type: 'CompleteQuest', questId: DINNER_QUEST } : null;
}

/** Команда сцени: без фактів — стан не чіпає. */
export const dinnerMove = (): Move => ({ type: 'StartScene', sceneId: DINNER_SCENE, facts: [] });
