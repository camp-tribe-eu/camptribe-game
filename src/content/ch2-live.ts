// GAME-296 · розділ 2 у живій мапі-першій грі: як родина виїжджає з Мюллерталя, що завершується саме, і яка мапа в локацій без власної.
//
// До цієї картки розділ 2 проходився ядром і повним перебором, але не руками: з Мюллерталя нікуди було їхати (vehicleMoves → null), а ☰ на мапі стиснуте й кнопок «Піти:» не має.
// Тут — чисті дані та предикати (без Phaser і без map-first.ts, щоб не було циклу): map-first.ts перевіряє кожен ланцюг ходів ядром (chain) і робить із них відповіді рамки «Куди їдемо?».
//
// Рішення про мапу (чесно, без «мовчки озеро»): стежки, водоспад, галявина орхідей і пам'ятник Шенген власних мап не мають. Раніше mapKeyFor кидав усе, що не дім/крамниця/дорога/Мюллерталь,
// на табір біля озера — гравець би побачив чужий табір під написом «Тихий водоспад». Тепер така локація показується на МАПІ МЮЛЛЕРТАЛЯ (найближча існуюча: звідти вони починаються) і в ній
// працює лише авто «назад у кемпінг». Звичайна поїздка — туди-й-назад в одній відповіді (ланцюг ходів): гравець повертається в кемпінг, а ядро записує обидва візити.
//
// Усе, що тут — UI-логіка поверх тих самих команд ядра: новий стан гри не з'являється, перебір (menu-here, GAME-48, бот) не росте.
import { exitsFor, isCh2Quest, questOpen, CHAPTER2_END } from '../core/story';
import type { GameState } from '../core/state';
import type { SimState } from '../core/sim';
import { DINNER_QUEST } from './ch2-dinner';
import { ACTIVITIES, EVENING_QUEST, MEADOW, WATERFALL, WATERFALL_QUEST, activityOfQuest, offeredActivities, type ActivityDef } from './ch2-activity';
import type { Weather } from '../core/weather';
import { PLAN_QUEST, PLAN_SPOT, TRAIL_BRANCHES } from './ch2-plan';
import { SCHENGEN, SCHENGEN_QUEST } from './ch2-schengen';
import { PACK_QUEST } from './ch2-pack';
import type { Move } from './moves';
import { STORY } from './story';

export const MULLERTHAL = 'loc.camp.mullerthal';
export const WALK_QUEST = 'CH2-D1-WALK-001';
export const ACTIVITY_QUEST = 'CH2-D2-ACTIVITY-001';
export { WATERFALL_QUEST };
export { SCHENGEN_QUEST, SCHENGEN };
/** Вказівник офіційної стежки: на дні 1 — вихід на прогулянку (поїздка), на дні 2 — табличка плану (сцена, ch2-plan.ts). */
export const WALK_SPOT = PLAN_SPOT;

/** Локації розділу 2 без власної мапи. Гравець у них показується на мапі Мюллерталя (mapKeyFor). */
export const EXCURSION_LOCATIONS: readonly string[] = ['loc.trail.official', 'loc.trail.forgotten', 'loc.trail.other', 'loc.waterfall', 'loc.meadow.orchid'];
export const isExcursion = (locationId: string | null | undefined): boolean => locationId !== null && locationId !== undefined && EXCURSION_LOCATIONS.includes(locationId);

const own = <T>(o: Readonly<Record<string, T>>, k: string): T | undefined => (Object.hasOwn(o, k) ? o[k] : undefined);
const active = (g: Pick<GameState, 'quests'>, q: string): boolean => own(g.quests, q)?.status === 'active';
const done = (g: Pick<GameState, 'quests'>, q: string, o: string): boolean => own(g.quests, q)?.done.includes(o) ?? false;
const visit = (locationId: string): Move => ({ type: 'Visit', locationId });
const home = (): Move => visit(MULLERTHAL);

/** Перший активний головний квест розділу 2 (ціль HUD і «Далі»). */
export const ch2Active = (g: Pick<GameState, 'quests'>): string | null =>
  Object.entries(g.quests).find(([id, q]) => q.status === 'active' && isCh2Quest(id) && STORY.quests[id] !== undefined && !STORY.quests[id]?.optional)?.[0] ?? null;

/** Прогулянка дня 1: офіційна стежка — туди й назад, квест прогулянки завершується сам (ch2FinishMove), коли ціль «пройти стежкою» зарахована візитом. */
export const ch2WalkTrip = (g: Pick<GameState, 'quests'>): Move[] | null => (active(g, WALK_QUEST) ? [visit('loc.trail.official'), home()] : null);

/**
 * Рішення, які авто пропонує в Мюллерталі: квест із кількома виборами виходу й виконаними цілями (день 2: «Як провести день» — водоспад чи майстер-клас). Сцени плану й вставки — не тут.
 * Кожне рішення — ланцюг, що відповідь називає за ПЕРШИМ ходом (вибір виходу): «Піти до водоспаду» одразу їде туди й назад (і завершує крок водоспаду сам), «Майстер-клас» лишається в кемпінгу.
 * Так відповідь на запитання «Як проведемо день?» не лишає гравця біля авто з новою ціллю, яку авто не відкриє, доки він не відійде й не підійде знову.
 */
export function ch2CarDecisions(g: GameState, weather?: Weather, activities: readonly ActivityDef[] = ACTIVITIES): Move[][] {
  const p = g.player;
  if (!p) return [];
  const out: Move[][] = [];
  for (const [id, q] of Object.entries(g.quests)) {
    const def = STORY.quests[id];
    if (q.status !== 'active' || !isCh2Quest(id) || def === undefined || def.optional || id === PLAN_QUEST) continue;
    if (!def.objectives.every((o) => !o.required || q.done.includes(o.id))) continue;
    const exits = exitsFor(STORY, def, 'complete', p);
    if (exits.length < 2 || exits.some((t) => !t.choice)) continue;
    // GAME-290: рішення дня — за погодою: дощ лишає лише безпечний вихід (майстер-клас); погоду не передано — усі виходи (☰ і перебір).
    const offered = weather === undefined ? null : new Set(offeredActivities(weather, activities).map((a) => a.quest));
    for (const t of exits) {
      if (offered !== null && activityOfQuest(t.to, activities) !== undefined && !offered.has(t.to)) continue;
      out.push([{ type: 'CompleteQuest', questId: id, to: t.to }, ...(t.to === WATERFALL_QUEST ? [visit(WATERFALL)] : [])]);   // водоспад: поїздка кінчається НА водоспаді — сцену відкриває режисер
    }
  }
  return out;
}

/** Поїздки з Мюллерталя авто (кожна — ланцюг ходів, відповідь у рамці називається за першим ходом): водоспад і галявина орхідей, Шенген, додому. Порожній ланцюг відсіює ядро (chain). */
export function ch2CarTrips(g: Pick<GameState, 'quests'>): Move[][] {
  const out: Move[][] = [];
  if (active(g, WATERFALL_QUEST)) {
    if (!done(g, WATERFALL_QUEST, 'o1-waterfall')) out.push([visit(WATERFALL)]);   // GAME-290: лишаємось на водоспаді — там відкривається сцена
    if (!done(g, WATERFALL_QUEST, 'o2-orchid')) out.push([visit(MEADOW), home()]);
  }
  if (active(g, SCHENGEN_QUEST)) out.push([visit(SCHENGEN)]);   // GAME-291: поїздка кінчається НА набережній Шенгену (власна мапа) — сцену відкриває режисер
  if (active(g, CHAPTER2_END)) out.push([visit('loc.home')]);   // кінець розділу: додому назавжди, назад не повертаємось
  return out;
}

/** Квести, які веде інший модуль: вечеря (сцена), план і вставки стежок (сцени), водоспад/майстер-клас/вечір дня 2 (GAME-290, ch2-activity.ts), Шенген (GAME-291, ch2-schengen.ts), збір і прощання (GAME-292, ch2-pack.ts). Решту, що закривається самими візитами, завершує сюжет. */
const OTHER_OWNER = new Set<string>([DINNER_QUEST, PLAN_QUEST, ...TRAIL_BRANCHES.map((b) => b.quest), ...ACTIVITIES.map((a) => a.quest), EVENING_QUEST, SCHENGEN_QUEST, PACK_QUEST]);

/**
 * Крок розділу 2, який нічого від гравця не чекає, завершується сам (той самий CompleteQuest, що й у ☰): квест без вибору виходу (або кінець розділу), усі обов'язкові цілі зроблені
 * (візит, розмова), ворота дня відчинені, розмови немає. У мапі-першій грі такого кроку не було чим закрити — без цього розділ стояв би після першої ж поїздки.
 * `ok` — чи приймає ядро цей хід (режисер шле лише те, що ядро прийме).
 */
export function ch2FinishMove(sim: SimState, ok: (m: Move) => boolean): Move | null {
  const g = sim.game;
  const p = g.player;
  if (!p || g.dialogue !== null || g.campaignEnded) return null;
  for (const [id, q] of Object.entries(g.quests)) {
    const def = STORY.quests[id];
    if (q.status !== 'active' || !isCh2Quest(id) || def === undefined || def.optional || OTHER_OWNER.has(id)) continue;
    if (!questOpen(STORY, g, id, sim.clock.minutes) || !def.objectives.every((o) => !o.required || q.done.includes(o.id))) continue;
    const exits = exitsFor(STORY, def, 'complete', p);
    if (!(exits.length === 1 && exits.every((t) => !t.choice)) && !(exits.length === 0 && def.end)) continue;
    const m: Move = { type: 'CompleteQuest', questId: id };
    if (ok(m)) return m;
  }
  return null;
}
