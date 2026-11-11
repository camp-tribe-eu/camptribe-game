// GAME-292 · спільні помічники тестів дня 3 розділу 2 (шлях ядром від кінця розділу 1 до ранку дня 3, Шенген, збір). Копія тих кроків, що в ch2-schengen.test.ts (GAME-291): тестові файли
// не імпортують один одного (інакше імпорт реєструє чужі тести), тож спільне лежить тут. Нічого, окрім справжніх команд ядра й справжнього режисера (director.ts): жодних підроблених станів.
import { expect } from 'vitest';
import { enumerateCombos } from '../../scripts/validator/combos.mjs';
import type { Command } from '../core/commands';
import { advance, minuteOfDay } from '../core/clock';
import { step, todayWeather, type SimState } from '../core/sim';
import { CHAPTER2_START } from '../core/story';
import { dayOf, weatherOf, type Weather } from '../core/weather';
import { ch1End } from './ch1-end.fixture';
import { ACTIVITIES, WATERFALL_QUEST } from './ch2-activity';
import { ch2CarDecisions, ch2CarTrips } from './ch2-live';
import { PACK_SCENE } from './ch2-pack';
import { PLAN_QUEST, TRAIL_BRANCHES } from './ch2-plan';
import { SCHENGEN_QUEST, SCHENGEN_SCENE } from './ch2-schengen';
import { storyMoves } from './director';
import type { Move } from './moves';
import { GAME_DEFS } from './slice-defs';
import { CONTENT } from './story';
import { SECONDS, moveSeconds } from './time-model';

export const CTX = { defs: GAME_DEFS };
export const MULLERTHAL = 'loc.camp.mullerthal';
let n = 0;
export const resetIds = (from: number): void => { n = from; };
const cmdOf = (m: object): Command => ({ ...m, commandId: `s292-${n++}` } as Command);
export const run = (s: SimState, m: object): SimState => {
  const c = cmdOf(m);
  const r = step(s, { kind: 'command', command: c }, CTX);
  const p = r.game.processed[c.commandId];
  if (p?.ok !== true) throw new Error(`${JSON.stringify(m)} → ${p?.ok === false ? p.code : 'no reply'}`);
  return r;
};
/** Подія в дорозі відкриває діалог — закрити, як гравець. */
export function settle(s: SimState): SimState {
  for (let i = 0; s.game.dialogue !== null && i < 40; i++) {
    const before = s.game.dialogue;
    s = step(s, { kind: 'command', command: cmdOf({ type: 'Continue' }) }, CTX);
    if (s.game.dialogue === before) s = step(s, { kind: 'command', command: cmdOf({ type: 'Choose', choice: 0 }) }, CTX);
  }
  return s;
}
/** Режисер, як main.ts direct(): усе, що шле сюжет, ЦІЛИМ пакетом, поки він не замовкне. `stopAt` — сцена, перед якою зупинитись (її хід не виконується). */
export function direct(s: SimState, stopAt?: string): { sim: SimState; sent: Move[] } {
  const sent: Move[] = [];
  for (let i = 0; i < 12; i++) {
    const batch = storyMoves(s, GAME_DEFS);
    if (batch.length === 0) return { sim: s, sent };
    for (const m of batch) {
      if (stopAt !== undefined && m.type === 'StartScene' && (m as { sceneId: string }).sceneId === stopAt) return { sim: s, sent };
      sent.push(m);
      s = run(s, m);
    }
  }
  throw new Error(`director never goes quiet: ${JSON.stringify(sent)}`);
}

export const base = ch1End();
/** Світ із потрібною погодою В МОМЕНТ дії: зерно, для якого weatherOf(зерно, день годинника sim) = w. */
export const withWeather = (s: SimState, w: Weather): SimState => { for (let k = 1; k < 5000; k++) if (weatherOf(k, dayOf(s.clock)) === w) return { ...s, worldSeed: k }; throw new Error(`no seed with ${w}`); };

export type Combo = { profile: string | null; transport: string | null; animal: string };
export const COMBOS = enumerateCombos(CONTENT) as Combo[];
export const comboName = (c: Combo): string => `${c.profile}/${c.transport}/${c.animal}`;
export const at = (s: SimState, hh: number): SimState => ({ ...s, clock: advance(s.clock, (hh * 60 - minuteOfDay(s.clock.minutes) + 1440) % 1440) });

type Dlg = Record<string, { choices?: unknown[] }>;
export const NODES_OF = (id: string): Dlg => (GAME_DEFS.story?.dialogues[id]?.nodes ?? {}) as Dlg;

/** Ранок дня 3 розділу 2 (квест Шенгену активний, гравець у кемпінгу), погода w, комбінація combo. Шлях ядром: прибуття → прогулянка → вечір → сон → план → водоспад → вечір дня 2 → сон. */
export function schengenDay(w: Weather, combo?: Combo): SimState {
  const b = combo && base.game.player ? { ...base, game: { ...base.game, player: { ...base.game.player, profileId: combo.profile ?? base.game.player.profileId, transportId: combo.transport ?? base.game.player.transportId, animalId: combo.animal } } } : base;
  let s: SimState = { ...b, worldSeed: 1 };
  const go = (m: object): void => { s = run(s, m); };
  go({ type: 'Sleep' });
  go({ type: 'StartChapter2' });
  go({ type: 'Visit', locationId: 'loc.road' }); s = settle(s);
  go({ type: 'Visit', locationId: MULLERTHAL }); s = settle(s);
  go({ type: 'Talk', npcId: 'npc.host-mullerthal' });
  go({ type: 'Choose', choice: 0 }); go({ type: 'Choose', choice: 1 }); go({ type: 'Continue' });
  go({ type: 'CompleteQuest', questId: CHAPTER2_START });
  go({ type: 'Visit', locationId: 'loc.trail.official' }); s = settle(s);
  go({ type: 'CompleteQuest', questId: 'CH2-D1-WALK-001' });
  go({ type: 'Visit', locationId: MULLERTHAL }); s = settle(s);
  s = at(s, 19);
  go({ type: 'Sleep' });
  s = direct(s).sim;
  expect(s.game.quests[PLAN_QUEST]?.status, 'plan quest is open').toBe('active');
  go({ type: 'CompleteQuest', questId: PLAN_QUEST, to: TRAIL_BRANCHES[0]?.quest });
  go({ type: 'CompleteQuest', questId: TRAIL_BRANCHES[0]?.quest });
  s = withWeather(s, 'sunny');
  const fall = ch2CarDecisions(s.game, 'sunny').find((t) => (t[0] as { to?: string }).to === WATERFALL_QUEST) as Move[];
  for (const m of fall) s = run(s, m);
  s = settle(s);
  s = direct(s).sim;
  for (let i = 0; s.game.dialogue !== null && i < 40; i++) s = run(s, { type: NODES_OF(s.game.dialogue.id)[s.game.dialogue.node]?.choices ? 'Choose' : 'Continue', ...(NODES_OF(s.game.dialogue.id)[s.game.dialogue.node]?.choices ? { choice: 0 } : {}) });
  s = direct(s).sim;
  expect(ACTIVITIES.length).toBe(2);
  s = at(s, 22);
  s = direct(s).sim;   // «пора спати»: вечір без вечері завершується сам
  go({ type: 'Sleep' });
  s = direct(s).sim;
  expect(s.game.quests[SCHENGEN_QUEST]?.status, 'morning of day 3: Schengen is active').toBe('active');
  s = at(s, 8);   // команда Sleep годинник не рухає (сон у живій грі — кадри): ранок дня 3 — 08:00, тож день не перекидається посеред поїздки і погода дня стала
  s = withWeather(s, w);
  expect(todayWeather(s)).toBe(w);
  expect(s.game.player?.locationId).toBe(MULLERTHAL);
  return s;
}

export interface Played { readonly sim: SimState; readonly nodes: string[]; readonly seconds: number }
/** Читає відкриту сцену `sceneId` до кінця: Continue чи Choose за `pick` (вузол → індекс відповіді). Рахує вузли й секунди за моделлю часу. */
export function readScene(from: SimState, sceneId: string, pick: (node: string) => number = () => 0): Played {
  let s = from;
  const nodes: string[] = [];
  let seconds = 0;
  for (let i = 0; s.game.dialogue !== null; i++) {
    if (i > 40) throw new Error('dialogue does not close');
    expect(s.game.dialogue.id).toBe(sceneId);
    const id = s.game.dialogue.node;
    nodes.push(id);
    const m = NODES_OF(sceneId)[id]?.choices ? { type: 'Choose', choice: pick(id) } : { type: 'Continue' };
    seconds += moveSeconds(m as never) + SECONDS.line;
    s = run(s, m);
  }
  return { sim: s, nodes, seconds };
}

export interface Trip { readonly sim: SimState; readonly nodes: string[]; readonly sent: Move[]; readonly seconds: number }
/** Поїздка до Шенгену авто → режисер сам відкриває сцену → гравець читає (picks: хвиля, з'єднання, мітка) → режисер завершує квест, веде назад і з'єднує; зупиняється ПЕРЕД сценою збору. */
export function playSchengen(from: SimState, w: number, j: number, t: number): Trip {
  const trips = ch2CarTrips(from.game);
  expect(trips.length, 'the car offers the Schengen trip').toBe(1);
  let s = from;
  let seconds = SECONDS.walkOnMap;   // дійти до авто
  for (const m of trips[0] as Move[]) { s = run(s, m); seconds += moveSeconds(m as never); }
  s = settle(s);
  const d1 = direct(s);
  const sc = readScene(d1.sim, SCHENGEN_SCENE, (id) => (id === 'wave' ? w : id === 'join' ? j : t));
  const d2 = direct(sc.sim, PACK_SCENE);
  seconds += sc.seconds + d2.sent.reduce((a, m) => a + moveSeconds(m as never), 0);
  return { sim: d2.sim, nodes: sc.nodes, sent: [...d1.sent, ...d2.sent], seconds };
}
