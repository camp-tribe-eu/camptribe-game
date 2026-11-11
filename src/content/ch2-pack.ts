// GAME-292 · CH2-D3-PACK: збір (мокрий чи сухий намет за погодою дня), прощання з Інгрід і дорога додому.
//
// Той самий механізм, що Шенген (ch2-schengen.ts) і водоспад (ch2-activity.ts): сцена-діалог із власним `scene`, яку відкриває ХІД СЮЖЕТУ StartScene, а ядро лишається сторожем законності
// (сцена — лише на етапі `atQuest`). Сцена відкривається сама, щойно родина в кемпінгу на етапі збору (одразу після Шенгену, де квест завершився й режисер повернув у кемпінг); після сцени сюжет
// сам завершує крок збору (CompleteQuest), і активним стає квест-кінець розділу CH2-D3-HOME-001: авто пропонує «додому», візит у дім його завершує (ch2-live.ts), і саме з ЦЬОГО завершення
// виводиться chapter2Complete (src/core/story.ts) — окремого прапорця завершення немає й не буде.
//
// Сцена КОСМЕТИЧНА для стану: жодної нагороди й жодної зміни квестів у діалозі. Факти сцени (`facts`) — лише два: дощовий ранок (мокрий намет) і «половинки досі не з'єднані» (гравець поїхав із
// Шенгену до сцени з'єднання: тут з'єднання досяжне пізніше — вибір ставить f.ch2-medallion-join, JoinItems шле режисер, як у Шенгені). Вибори сцени збігаються у ті самі вузли, тож простір станів
// перебору (story-offer GAME-48, menu-here, бот) не росте: розділ 2 у розділі 1 недосяжний.
import type { SimState } from '../core/sim';
import { questOpen } from '../core/story';
import { MEDALLION, MEDALLION_HALF1, MEDALLION_HALF2 } from '../core/join';
import type { Weather } from '../core/weather';
import { MULLERTHAL } from './ch2-schengen';
import { STORY } from './story';
import type { Move } from './moves';

export const PACK_QUEST = 'CH2-D3-PACK-001';
export const PACK_SCENE = 'dlg.ch2-pack';
/** Дощовий ранок збору: намет мокрий. Косметика — жоден квест його не читає. */
export const PACK_WET_FLAG = 'f.ch2-pack-wet';
/** Обидві половинки в рюкзаку, цілого медальйона ще нема: сцена пропонує з'єднати. Косметика — жоден квест його не читає. */
export const PACK_LATE_JOIN_FLAG = 'f.ch2-pack-late-join';

export const packPlayed = (sim: Pick<SimState, 'journal'>): boolean => sim.journal.some((e) => e.type === 'StartScene' && e.ref === PACK_SCENE);

const objectivesDone = (sim: SimState): boolean => {
  const q = sim.game.quests[PACK_QUEST];
  const def = STORY.quests[PACK_QUEST];
  return q !== undefined && def !== undefined && def.objectives.every((o) => !o.required || q.done.includes(o.id));
};

/** Сцена збору готова: крок активний, ворота відчинені, гравець у кемпінгу, розмови немає, розділ не закінчено, сцени ще не було. */
export function packDue(sim: SimState): boolean {
  const g = sim.game;
  return g.quests[PACK_QUEST]?.status === 'active' && questOpen(STORY, g, PACK_QUEST, sim.clock.minutes) && !g.campaignEnded && g.dialogue === null &&
    g.player?.locationId === MULLERTHAL && !packPlayed(sim);
}

/** Половинки не з'єднані: обидві в рюкзаку, цілого нема. */
export const halvesUnjoined = (g: SimState['game']): boolean =>
  (g.inventory[MEDALLION] ?? 0) === 0 && (g.inventory[MEDALLION_HALF1] ?? 0) >= 1 && (g.inventory[MEDALLION_HALF2] ?? 0) >= 1;

/** Команда сцени: факти лише з наслідків (погода дня, нез'єднані половинки) — не вигадуємо факту, якого не було. */
export const packMove = (weather: Weather, g: SimState['game']): Move => ({
  type: 'StartScene', sceneId: PACK_SCENE,
  facts: [...(weather === 'rain' ? [PACK_WET_FLAG] : []), ...(halvesUnjoined(g) ? [PACK_LATE_JOIN_FLAG] : [])],
});

/**
 * Сцену зіграно, розмову закрито, крок збору ще активний → сюжет сам завершує його (CompleteQuest): далі активний квест-кінець, і авто везе додому. Сцена ще попереду й гравець у кемпінгу —
 * чекаємо її (відкриє packDue). Гравець не в кемпінгу без сцени (поїхав ☰) — крок не чекає сцени, нічого не блокується. Режисер шле лише те, що ядро прийме (accepts на боці director.ts).
 */
export function packFinishMove(sim: SimState): Move | null {
  const g = sim.game;
  if (g.quests[PACK_QUEST]?.status !== 'active' || g.dialogue !== null || g.campaignEnded || g.player === null) return null;
  if (!questOpen(STORY, g, PACK_QUEST, sim.clock.minutes) || !objectivesDone(sim)) return null;
  if (!packPlayed(sim) && g.player.locationId === MULLERTHAL) return null;
  return { type: 'CompleteQuest', questId: PACK_QUEST };
}
