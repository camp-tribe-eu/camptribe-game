// GAME-289 · CH2-D2-PLAN: ранок дня 2 розділу 2 — план дня, табличка «стежка закрита після зсуву» і вибір: забута стежка з Інгрід чи інший шлях самим.
//
// Той самий механізм, що вечеря дня 1 (GAME-288, src/content/ch2-dinner.ts): сцена-діалог із власним `scene`, яку відкриває ХІД СЮЖЕТУ StartScene, а ядро лишається сторожем
// законності (сцена — лише на етапі `atQuest`). Об'єкти мапи — вказівники стежок на мапі Мюллерталя (exit.trail.*): офіційний — табличка, забутий і «інший» — вставки своїх гілок (у мапі-першій грі з Мюллерталя нікуди не поїхати: стежки — вузли без мап, тож вставки йдуть на мапі кемпінгу).
//
// Вибір — справжня розвилка, а не косметика, і несе її ОДИН прапорець: відповідь «піти з Інгрід» ставить f.trail-forgotten, відповідь «самим» нічого не ставить (сцена може лише ставити
// прапорці, startQuest їй заборонено). Коли розмову закрито, сюжет сам завершує квест плану переходом у гілку за цим прапорцем — той самий перехід, що пропонує ☰ (choiceKey у quests.json).
// Окрім нього сцена ставить f.trail-official-closed (зарезервований ще в CH2-PLAN): табличку прочитано. Обидва прапорці ставить лише сцена, якої немає серед ходів перебору й бота, тож простір
// станів не росте. Обидві гілки сходяться в CH2-D2-ACTIVITY-001 → тихий водоспад (CH2-D2-WATERFALL-001); у кожній — власна сцена-вставка, коли родина доходить до своєї стежки (ціль
// квесту — візит у Мюллерталь, зарахований при старті гілки: на стежку не поїхати, тож гілку завершує сюжет після вставки). Вставки КОСМЕТИЧНІ для стану (`facts: []`, без ефектів): єдиний слід — запис StartScene у журналі. Хто не читав табличку й обрав шлях у ☰, нічого не втрачає.
import type { SimState } from '../core/sim';
import { questOpen } from '../core/story';
import { STORY } from './story';
import type { Move } from './moves';

export const PLAN_SCENE = 'dlg.ch2-plan';
/** Вказівник офіційної стежки на мапі Мюллерталя: на дні 2 це табличка «Закрито після зсуву». */
export const PLAN_SPOT = 'exit.trail.official';
export const PLAN_QUEST = 'CH2-D2-PLAN-001';
export const PLAN_FLAG = 'f.trail-official-closed';
/** Єдиний прапорець вибору: родина йде забутою стежкою з Інгрід. Немає — інший шлях самим. */
export const FORK_FLAG = 'f.trail-forgotten';
export const PLAN_MAP_LOCATION = 'loc.camp.mullerthal';

export interface TrailBranch { readonly quest: string; readonly spot: string; readonly scene: string }
/** Дві гілки дня 2: квест, вказівник своєї стежки на мапі Мюллерталя (там відкривається вставка) і сцена-вставка. */
export const TRAIL_BRANCHES: readonly TrailBranch[] = [
  { quest: 'CH2-D2-TRAIL-FORGOTTEN-001', spot: 'exit.trail.forgotten', scene: 'dlg.ch2-trail-forgotten' },
  { quest: 'CH2-D2-TRAIL-OTHER-001', spot: 'exit.trail.other', scene: 'dlg.ch2-trail-other' },
];
/** Усі три вказівники стежок, які веде цей модуль (табличка плану й дві вставки): режисер, а не крок зрізу 1 (map-first.ts) — там вони мертві. */
export const isPlanSpot = (name: string): boolean => name === PLAN_SPOT || TRAIL_BRANCHES.some((b) => b.spot === name);

const played = (sim: Pick<SimState, 'journal'>, scene: string): boolean => sim.journal.some((e) => e.type === 'StartScene' && e.ref === scene);
/** Сцену плану вже грали (запис StartScene у журналі) — удруге вона не відкривається. */
export const planPlayed = (sim: Pick<SimState, 'journal'>): boolean => played(sim, PLAN_SCENE);
/** Сцену-вставку гілки вже грали. */
export const trailPlayed = (sim: Pick<SimState, 'journal'>, b: TrailBranch): boolean => played(sim, b.scene);

/** Табличка готова: квест плану активний, день 2 (ворота), гравець у Мюллерталі, розмови немає, розділ не закінчено, сцени ще не було. */
export function planDue(sim: SimState): boolean {
  const g = sim.game;
  return g.quests[PLAN_QUEST]?.status === 'active' && questOpen(STORY, g, PLAN_QUEST, sim.clock.minutes) && !g.campaignEnded && g.dialogue === null &&
    g.player?.locationId === PLAN_MAP_LOCATION && !planPlayed(sim);
}

/** Команда сцени: єдиний факт на старті — табличку прочитано (f.trail-official-closed); вибір гілки ставить сама відповідь (f.trail-forgotten). */
export const planMove = (): Move => ({ type: 'StartScene', sceneId: PLAN_SCENE, facts: [PLAN_FLAG] });

/** Гілка, яку гравець ОБРАВ у сцені: прапорець вибору є — забута стежка з Інгрід, немає — інший шлях. */
export const chosenBranch = (flags: readonly string[]): TrailBranch => (flags.includes(FORK_FLAG) ? TRAIL_BRANCHES[0] : TRAIL_BRANCHES[1]) as TrailBranch;

/**
 * Сцену плану зіграно й розмову закрито, а квест плану ще відкритий → сюжет сам завершує його переходом у обрану гілку (ту саму команду шле ☰). Квест плану вимагає лише візиту в
 * Мюллерталь (зарахований, коли він став активним), тож ядро це приймає завжди; режисер шле лише те, що ядро прийме.
 */
export function planFinishMove(sim: SimState): Move | null {
  const g = sim.game;
  if (g.quests[PLAN_QUEST]?.status !== 'active' || !planPlayed(sim) || g.dialogue !== null || g.campaignEnded) return null;
  return { type: 'CompleteQuest', questId: PLAN_QUEST, to: chosenBranch(g.flags).quest };
}

/** Вказівник обраної стежки готовий: квест гілки активний, гравець у Мюллерталі, розмови немає, розділ не закінчено, вставки ще не було. */
export function trailDue(sim: SimState, b: TrailBranch): boolean {
  const g = sim.game;
  return g.quests[b.quest]?.status === 'active' && questOpen(STORY, g, b.quest, sim.clock.minutes) && !g.campaignEnded && g.dialogue === null &&
    g.player?.locationId === PLAN_MAP_LOCATION && !trailPlayed(sim, b);
}
/** Дотик до вказівника стежки: вставка своєї гілки (чужа стежка німа). */
export const trailMove = (b: TrailBranch): Move => ({ type: 'StartScene', sceneId: b.scene, facts: [] });

/** Що робить вказівник `name` зараз: табличка плану, вставка обраної стежки — або нічого (null). */
export function planSpotMove(sim: SimState, name: string): Move | null {
  if (name === PLAN_SPOT) return planDue(sim) ? planMove() : null;
  const b = TRAIL_BRANCHES.find((x) => x.spot === name);
  return b !== undefined && trailDue(sim, b) ? trailMove(b) : null;
}
export const planSpotLive = (sim: SimState, name: string): boolean => planSpotMove(sim, name) !== null;

/**
 * Вставку зіграно, квест гілки відкритий і всі обов'язкові цілі зроблені → сюжет сам завершує його:
 * єдиний вихід — CH2-D2-ACTIVITY-001 (далі водоспад). Без цього після сцени гравець мусив би шукати в ☰ кнопку «Завершити» там, де на мапі кроку нема.
 */
export function trailFinishMove(sim: SimState): Move | null {
  const g = sim.game;
  if (g.dialogue !== null || g.campaignEnded) return null;
  for (const b of TRAIL_BRANCHES) {
    const q = g.quests[b.quest];
    const def = STORY.quests[b.quest];
    if (q?.status !== 'active' || def === undefined || !trailPlayed(sim, b)) continue;
    if (def.objectives.every((o) => !o.required || q.done.includes(o.id))) return { type: 'CompleteQuest', questId: b.quest };
  }
  return null;
}
