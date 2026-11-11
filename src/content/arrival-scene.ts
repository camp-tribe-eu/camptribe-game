// GAME-310 · стартери двох сцен приїзду — рівно той самий механізм, що `fireplace.ts` (GAME-142): сцену відкриває
// команда ядра StartScene, яку шле СЮЖЕТ, а не гравець, і разом із нею ядро ставить ФАКТИ — те, що правда зараз.
// Жодного вигаданого факту: час приїзду береться з прапорців (його поставила дорога), результат заїзду — з
// підсумку міні-гри. Самі сцени — content/dialogue/camp-arrival.json і camp-scrape.json.
//
// Підключення до режисера (director.ts) — наступний PR: там зараз працюють інші картки, і сцена приїзду має стати
// в чергу після них. Тут усе, що для цього потрібно: id сцен, факти й команда.
import type { Command } from '../core/commands';
import { ARRIVAL_TIMES, arrivalFlag, arrivalOf, type ArrivalTime } from './arrival-pitch';
import { DRIVE_OUTCOMES, driveFlag, driveOutcome, type DriveOutcome, type DriveState } from './drive-in';

/** Зустріч із господинею, характер ділянок і вибір. */
export const ARRIVAL_SCENE = 'dlg.camp-arrival';
/** Сусід після заїзду: чисто, зачепили чи довго маневрували. */
export const SCRAPE_SCENE = 'dlg.camp-scrape';

/** Факти сцени приїзду — рівно `scene.facts` у camp-arrival.json (звіряє arrival-scene.test.ts). */
export const arrivalFacts = (flags: readonly string[]): string[] => [arrivalFlag(arrivalOf(flags))];
/** Усі факти, які сцена приїзду оголошує (у порядку ARRIVAL_TIMES). */
export const ARRIVAL_SCENE_FACTS: readonly string[] = ARRIVAL_TIMES.map(arrivalFlag);

/** Факти сцени сусіда — рівно `scene.facts` у camp-scrape.json. */
export const scrapeFacts = (st: Pick<DriveState, 'scrapes'>): string[] => [driveFlag(driveOutcome({ at: { c: 0, r: 0 }, facing: 'up', steps: 0, done: true, scrapes: st.scrapes }))];
export const SCRAPE_SCENE_FACTS: readonly string[] = DRIVE_OUTCOMES.map(driveFlag);

/** Команда, що відкриває зустріч із господинею: факт — той час приїзду, який справді записала дорога. */
export const startArrival = (commandId: string, flags: readonly string[]): Command =>
  ({ type: 'StartScene', commandId, sceneId: ARRIVAL_SCENE, facts: arrivalFacts(flags) });

/** Команда, що відкриває розмову з сусідом після заїзду. */
export const startScrape = (commandId: string, st: Pick<DriveState, 'scrapes'>): Command =>
  ({ type: 'StartScene', commandId, sceneId: SCRAPE_SCENE, facts: scrapeFacts(st) });

/** Який це результат заїзду (для журналу й репліки): той самий, що в прапорці. */
export const outcomeOfScrapes = (scrapes: number): DriveOutcome => driveOutcome({ at: { c: 0, r: 0 }, facing: 'up', steps: 0, done: true, scrapes });

/** Час приїзду, який побачить сцена (для підказок UI). */
export const sceneArrival = (flags: readonly string[]): ArrivalTime => arrivalOf(flags);
