// GAME-291 · CH2-SCHENGEN: поїздка до пам'ятника трьом країнам (власна мапа, набережна Мозеля), пляшка з другою половинкою медальйона, мікрокарта, з'єднання половинок і мітка Джорджа на мапі.
//
// Той самий механізм, що водоспад (ch2-activity.ts): сцена-діалог із власним `scene`, яку відкриває ХІД СЮЖЕТУ StartScene, а ядро лишається сторожем законності (сцена — лише на етапі `atQuest`).
// Поїздка кінчається НА набережній (Шенген має власну мапу): режисер відкриває сцену, щойно гравець на місці; після сцени сам завершує квест (CompleteQuest: нагорода rw.ch2-schengen — рівно раз
// за grantId — дає обидві половинки й мікрокарту) і веде родину назад у кемпінг.
//
// З'єднання половинок — ЛИШЕ явна дія: вибір гравця в сцені ставить прапорець f.ch2-medallion-join, а режисер після нього шле команду ядра JoinItems (рецепт recipe.medallion, src/core/join.ts).
// Ядро з'єднує тільки за обох половинок; у нього, а не в діалозі, живе сторож «з однією не вийде». Прапорці f.ch2-medallion-join і f.ch2-george-trail (мітка Джорджа) косметичні для квестів:
// жоден квест їх не читає, тож простір станів перебору (story-offer GAME-48, menu-here, бот) не росте: розділ 2 у розділі 1 недосяжний, вибори сцени сходяться в ті самі вузли.
import type { SimState } from '../core/sim';
import { questOpen } from '../core/story';
import { JOIN_MEDALLION, MEDALLION, MEDALLION_HALF1, MEDALLION_HALF2 } from '../core/join';
import type { Weather } from '../core/weather';
import { STORY } from './story';
import type { Move } from './moves';

export const SCHENGEN = 'loc.schengen';
export const MULLERTHAL = 'loc.camp.mullerthal';
export const SCHENGEN_QUEST = 'CH2-SCHENGEN-001';
export const SCHENGEN_SCENE = 'dlg.ch2-schengen';
/** Дощ у день Шенгену: сцена починається під дахом павільйону. Косметика — жоден квест його не читає. */
export const SCHENGEN_RAIN_FLAG = 'f.ch2-schengen-rain';
/** Гравець свідомо обрав скласти половинки (вибір у сцені). Після нього режисер шле JoinItems. */
export const JOIN_FLAG = 'f.ch2-medallion-join';
/** Джордж дорисував забуту стежку на своїй мапі (мітка на карті). */
export const GEORGE_TRAIL_FLAG = 'f.ch2-george-trail';
export const SCHENGEN_GRANT = 'rw.ch2-schengen';

const played = (sim: Pick<SimState, 'journal'>): boolean => sim.journal.some((e) => e.type === 'StartScene' && e.ref === SCHENGEN_SCENE);
export const schengenPlayed = played;

/** Сцена Шенгену готова: квест активний, ворота (день 3) відчинені, гравець на набережній, розмови немає, розділ не закінчено, сцени ще не було. */
export function schengenDue(sim: SimState): boolean {
  const g = sim.game;
  return g.quests[SCHENGEN_QUEST]?.status === 'active' && questOpen(STORY, g, SCHENGEN_QUEST, sim.clock.minutes) && !g.campaignEnded && g.dialogue === null &&
    g.player?.locationId === SCHENGEN && !played(sim);
}
/** Команда сцени: єдиний факт — чи дощ (вступ під павільйоном). */
export const schengenMove = (weather: Weather): Move => ({ type: 'StartScene', sceneId: SCHENGEN_SCENE, facts: weather === 'rain' ? [SCHENGEN_RAIN_FLAG] : [] });

/**
 * Сцену зіграно, розмову закрито, квест ще активний → сюжет сам завершує його (нагорода — ядром, один раз) і веде родину назад у кемпінг. Сцена ще попереду й гравець на місці — чекаємо її
 * (відкриє schengenDue). Гравець поза набережною без сцени (поїхав ☰) — квест не чекає сцени, нічого не блокується. Перший хід перевіряє режисер ядром (accepts), другий законний за побудовою.
 */
export function schengenFinishMoves(sim: SimState): Move[] {
  const g = sim.game;
  const q = g.quests[SCHENGEN_QUEST];
  const def = STORY.quests[SCHENGEN_QUEST];
  if (q?.status !== 'active' || def === undefined || g.dialogue !== null || g.campaignEnded || g.player === null) return [];
  if (!questOpen(STORY, g, SCHENGEN_QUEST, sim.clock.minutes) || !def.objectives.every((o) => !o.required || q.done.includes(o.id))) return [];
  if (!played(sim) && g.player.locationId === SCHENGEN) return [];
  return [{ type: 'CompleteQuest', questId: SCHENGEN_QUEST }, { type: 'Visit', locationId: MULLERTHAL }];
}

/** Гравець обрав з'єднати, обидві половинки в рюкзаку, медальйона ще немає, розмови немає → режисер шле JoinItems (ядро ще раз перевіряє КОЖНУ половинку). */
export function joinMove(sim: SimState): Move | null {
  const g = sim.game;
  if (g.dialogue !== null || !g.flags.includes(JOIN_FLAG) || (g.inventory[MEDALLION] ?? 0) > 0) return null;
  if ((g.inventory[MEDALLION_HALF1] ?? 0) < 1 || (g.inventory[MEDALLION_HALF2] ?? 0) < 1) return null;
  return { type: 'JoinItems', recipeId: JOIN_MEDALLION };
}
