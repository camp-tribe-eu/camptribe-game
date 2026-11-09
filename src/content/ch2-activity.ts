// GAME-290 · CH2-D2-ACTIVITY: день 2 розділу 2 після вибору стежки — тихий водоспад + галявина орхідей + ідеальне фото Вікторії (нагорода-предмет), безпечний варіант за погодою
// (майстер-клас у кемпінгу) і вечір дня 2 (вечеря, нічні звуки).
//
// Той самий механізм, що вечеря дня 1 (ch2-dinner.ts) і план дня 2 (ch2-plan.ts): сцена-діалог із власним `scene`, яку відкриває ХІД СЮЖЕТУ StartScene, а ядро лишається сторожем
// законності (сцена — лише на етапі `atQuest`). Різниця: водоспад і майстер-клас відкриваються самі, щойно гравець на місці (поїздка до водоспаду кінчається НА водоспаді, а не вдома);
// вечір — дотик до столу (obj.dinner, той самий якір, що вечері дня 1). Сцени КОСМЕТИЧНІ для стану: жодної нагороди й жодної зміни квестів у діалозі (`facts` — лише прапорець дощового
// дня в майстер-класі); нагорода — предмет item.photo.perfect — лежить на квесті (reward з grantId), тож її видає ядро один раз. Простір станів перебору (story-offer GAME-48, menu-here, бот)
// не росте: сцен серед їхніх ходів немає, вибір усередині сцен збігається в ту саму розмову.
//
// Погода (SIM-WX-006: sunny / cloudy / rain; «спеки» в моделі погоди немає — безпечний варіант діє для дощу, див. ACTIVITIES):
//   * сухий день — водоспад (скелі «плачуть» на світлі) і майстер-клас на вибір;
//   * дощ — лише майстер-клас: водоспад у дощ необов'язковий (рішення власника 08.11.2026), та сама мапа клубу, ті самі підказки, те саме ідеальне фото.
// Розділ не блокується за жодної погоди: ☰ (ядро) завжди лишає обидва виходи квесту, а водоспад, якого сцена не бачить (дощ), завершується сам без сцени.
import { isNight } from '../core/clock';
import type { SimState } from '../core/sim';
import { questOpen, questSlept, storyDay } from '../core/story';
import type { Weather } from '../core/weather';
import { STORY } from './story';
import type { Move } from './moves';

export const MULLERTHAL = 'loc.camp.mullerthal';
export const WATERFALL = 'loc.waterfall';
export const MEADOW = 'loc.meadow.orchid';
export const WATERFALL_QUEST = 'CH2-D2-WATERFALL-001';
export const WORKSHOP_QUEST = 'CH2-D2-WORKSHOP-001';
export const EVENING_QUEST = 'CH2-D2-EVENING-001';
export const PERFECT_ITEM = 'item.photo.perfect';
/** Прапорець дощового дня: його ставить старт майстер-класу (діалог читає його лише для вступу). Косметика — жоден квест його не читає. */
export const RAIN_FLAG = 'f.ch2-rain-day';

export interface ActivityDef {
  readonly id: 'waterfall' | 'workshop';
  /** Квест виходу з «Як провести день» (CH2-D2-ACTIVITY-001 → цей). */
  readonly quest: string;
  readonly scene: string;
  /** Локація, де сцена відкривається сама: водоспад — на водоспаді, майстер-клас — у кемпінгу. */
  readonly at: string;
  /** Погоди, в які авто пропонує цей вихід. Кожна погода мусить мати хоч один (сторож ch2-activity.test). */
  readonly weathers: readonly Weather[];
}
export const ACTIVITIES: readonly ActivityDef[] = [
  { id: 'waterfall', quest: WATERFALL_QUEST, scene: 'dlg.ch2-waterfall', at: WATERFALL, weathers: ['sunny', 'cloudy'] },
  { id: 'workshop', quest: WORKSHOP_QUEST, scene: 'dlg.ch2-workshop', at: MULLERTHAL, weathers: ['sunny', 'cloudy', 'rain'] },
];
export const EVENING_SCENE = 'dlg.ch2-evening';
export const EVENING_MAP_LOCATION = MULLERTHAL;

const played = (sim: Pick<SimState, 'journal'>, scene: string): boolean => sim.journal.some((e) => e.type === 'StartScene' && e.ref === scene);
export const activityPlayed = (sim: Pick<SimState, 'journal'>, a: ActivityDef): boolean => played(sim, a.scene);
export const activityOfQuest = (quest: string, as: readonly ActivityDef[] = ACTIVITIES): ActivityDef | undefined => as.find((a) => a.quest === quest);
/** Чи пропонує авто цей вихід за погоди дня. */
export const activityOffered = (a: ActivityDef, weather: Weather): boolean => a.weathers.includes(weather);
/** Виходи «Як провести день» за погоди дня (порядок — як у ACTIVITIES). */
export const offeredActivities = (weather: Weather, as: readonly ActivityDef[] = ACTIVITIES): ActivityDef[] => as.filter((a) => activityOffered(a, weather));

const quest = (sim: SimState, id: string) => sim.game.quests[id];
const objectivesDone = (sim: SimState, id: string): boolean => {
  const q = quest(sim, id);
  const def = STORY.quests[id];
  return q !== undefined && def !== undefined && def.objectives.every((o) => !o.required || q.done.includes(o.id));
};

/** Сцена виходу готова: квест активний, ворота відчинені, гравець у місці сцени, розмови немає, розділ не закінчено, сцени ще не було і погода її пропонує. */
export function activityDue(sim: SimState, weather: Weather, as: readonly ActivityDef[] = ACTIVITIES): ActivityDef | null {
  const g = sim.game;
  if (g.dialogue !== null || g.campaignEnded || g.player === null) return null;
  return as.find((a) => g.quests[a.quest]?.status === 'active' && questOpen(STORY, g, a.quest, sim.clock.minutes) && g.player?.locationId === a.at && !activityPlayed(sim, a) && activityOffered(a, weather)) ?? null;
}
/** Команда сцени: у майстер-класі єдиний факт — чи дощ (вступ). */
export const activityMove = (a: ActivityDef, weather: Weather): Move => ({ type: 'StartScene', sceneId: a.scene, facts: a.id === 'workshop' && weather === 'rain' ? [RAIN_FLAG] : [] });

/**
 * Сцену зіграно (або вона цій погоді не належить: дощ + водоспад, обраний у ☰) і розмову закрито, а квест виходу ще активний → сюжет сам завершує його (ходом CompleteQuest — той самий, що в ☰;
 * нагороду видає ядро). Водоспад після сцени ще й відмічає галявину орхідей і везе назад у кемпінг; без сцени (дощ) квест чекає лише візиту на водоспад — як було до GAME-290, нічого не блокується.
 * Ходи ідуть ланцюгом (галявина → завершення → назад); перший перевіряє режисер ядром (accepts), решта законні за побудовою.
 */
export function activityFinishMoves(sim: SimState, weather: Weather, as: readonly ActivityDef[] = ACTIVITIES): Move[] {
  const g = sim.game;
  if (g.dialogue !== null || g.campaignEnded || g.player === null) return [];
  for (const a of as) {
    const q = quest(sim, a.quest);
    if (q?.status !== 'active' || !questOpen(STORY, g, a.quest, sim.clock.minutes) || !objectivesDone(sim, a.quest)) continue;
    if (!activityPlayed(sim, a) && activityOffered(a, weather) && g.player.locationId === a.at) continue;   // сцена ще попереду (її відкриє activityDue); гравець не на місці — квест не чекає сцени, нічого не блокується
    const out: Move[] = [];
    if (a.id === 'waterfall' && activityPlayed(sim, a) && !q.done.includes('o2-orchid')) out.push({ type: 'Visit', locationId: MEADOW });
    out.push({ type: 'CompleteQuest', questId: a.quest });
    if (a.at !== MULLERTHAL) out.push({ type: 'Visit', locationId: MULLERTHAL });
    return out;
  }
  return [];
}

/** День 2 розділу 2 (родина спала рівно один раз від старту розділу). */
const dayTwo = (g: SimState['game']): boolean => storyDay(questSlept(EVENING_QUEST, g)) === 2;
export const eveningPlayed = (sim: Pick<SimState, 'journal'>): boolean => played(sim, EVENING_SCENE);

/** Вечір дня 2 готовий: квест активний, ворота відчинені (день 2, з 18:00), гравець у Мюллерталі, розмови немає, розділ не закінчено, сцени ще не було. */
export function eveningDue(sim: SimState): boolean {
  const g = sim.game;
  return g.quests[EVENING_QUEST]?.status === 'active' && questOpen(STORY, g, EVENING_QUEST, sim.clock.minutes) && !g.campaignEnded && g.dialogue === null &&
    g.player?.locationId === EVENING_MAP_LOCATION && !eveningPlayed(sim);
}
export const eveningMove = (): Move => ({ type: 'StartScene', sceneId: EVENING_SCENE, facts: [] });

/**
 * Вечір зіграно (або минув без нього: «пора спати» 22:00 чи день 2 скінчився сном), день-квест ще відкритий і цілі зроблені → сюжет сам завершує його (CompleteQuest). Вечеря необов'язкова:
 * хто її пропустив, нічого не втрачає. Режисер шле лише те, що ядро прийме: ворота відчинені, розмови нема.
 */
export function eveningFinishMove(sim: SimState): Move | null {
  const g = sim.game;
  const q = quest(sim, EVENING_QUEST);
  if (q?.status !== 'active' || g.dialogue !== null || g.campaignEnded || !questOpen(STORY, g, EVENING_QUEST, sim.clock.minutes) || !objectivesDone(sim, EVENING_QUEST)) return null;
  return eveningPlayed(sim) || isNight(sim.clock.minutes) || !dayTwo(g) ? { type: 'CompleteQuest', questId: EVENING_QUEST } : null;
}
