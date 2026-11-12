// GAME-312 · скільки триває місія (рішення власника 12.11: пригода — 5–10 хвилин, EPISODE-DESIGN §9б). Сумлінна модель, а не секундомір бота:
//   * репліки — ті, що справді показує ядро на шляху живого гравця (прохід через dispatch), читання 3 слова/с + 1 с на дотик;
//   * рішення — 2 с на кожен вибір (подумати);
//   * ходьба — найкоротші шляхи по стінах мапи табору від просильника до зони роботи й назад, 4 тайли/с (швидкість героя);
//   * міні-гра — ТИПОВИЙ гравець у чистій функції гри (кадри до кінця: реакція із запізненням, ритм із ривками, пошук за блиском) + 8 с вступу й результату.
// Межа: кожна місія 5–10 хв. Мутація «прибрати другий вихід (пристрій)» опускає місію нижче 5 хв — тест червоніє (останній it).
import { describe, expect, it } from 'vitest';
import { dispatch, type Command } from '../core/commands';
import { FPS, NORMAL, type AnyMinigame, type FrameInput } from '../core/minigame';
import { initialState, type GameState } from '../core/state';
import uk from '../../content/locales/uk.json';
import type { Move } from '../content/moves';
import { GAME_DEFS } from '../content/slice-defs';
import { CONTENT } from '../content/story';
import { MISSIONS, type MissionDef } from '../content/missions';
import { minigameById } from '../content/minigames';
import { AIM, CRANK, TIE, TUNE, WEAVE, SIFT_COLS, SIFT_ROWS, siftNear, type HoldParams, type RhythmParams } from '../content/minigames/missions';
import { RESIDENTS, ZONES } from './world/ambient';
import { findPath, gridFromWalls, type Tile } from './world/follow';

const UK = uk as Record<string, string>;
const READ_WPS = 3;
const TAP_S = 1;
const THINK_S = 2;
const HERO_TILES_PER_S = 4;
const MG_SCREENS_S = 8;
export const MISSION_MIN_S = 5 * 60;
export const MISSION_MAX_S = 10 * 60;

interface TiledMap { width: number; height: number; layers: { name: string; data?: number[] }[] }
const RAW = import.meta.glob<string>('../../public/maps/camp-lake.tmj', { query: '?raw', import: 'default', eager: true });
const MAP = JSON.parse(Object.values(RAW)[0] ?? '') as TiledMap;
const GRID = gridFromWalls(MAP.width, MAP.height, 32, MAP.layers.find((l) => l.name === 'walls')?.data ?? []);
const legS = (a: Tile, b: Tile): number => { const p = findPath(GRID, a, b); if (!p) throw new Error(`шляху ${JSON.stringify(a)}→${JSON.stringify(b)} нема`); return (p.length - 1) / HERO_TILES_PER_S; };
const anchor = (zone: string): Tile => (ZONES.find((z) => z.id === zone) as { anchor: Tile }).anchor;
const giverAt = (npc: string): Tile => { const s = RESIDENTS.find((r) => r.id === npc)?.stops[0]; if (!s) throw new Error(npc); return { c: s.c, r: s.r }; };
const CAMP_START: Tile = { c: 18, r: 13 };

// ───── прохід ядром: які репліки бачить гравець ─────
let n = 0;
const send = (s: GameState, m: Move): GameState => { const r = dispatch(s, { ...m, commandId: `mt${n++}` } as Command, GAME_DEFS); if (!r.ok) throw new Error(`${m.type} → ${r.code}`); return r.state; };
const TO_CAMP: readonly Move[] = [
  { type: 'CreateCharacter', profileId: 'profile.solo-explorer', transportId: 'transport.bike' } as Move,
  { type: 'CompleteQuest', questId: 'PROLOGUE-HOME-001' }, { type: 'CompleteQuest', questId: 'ST-001' }, { type: 'CompleteQuest', questId: 'ST-002' },
  { type: 'Visit', locationId: 'loc.shop' }, { type: 'Pickup', itemId: 'item.tent' }, { type: 'Pickup', itemId: 'item.sleeping-bag' }, { type: 'Checkout' },
  { type: 'CompleteQuest', questId: 'ST-003' }, { type: 'Visit', locationId: 'loc.home' }, { type: 'CompleteQuest', questId: 'CH1-HOME-001' },
  { type: 'Visit', locationId: 'loc.road' }, { type: 'CompleteQuest', questId: 'ST-004' }, { type: 'Visit', locationId: 'loc.camp.lake' },
];
const rawNodes = (id: string): { id: string; textKey: string; choices?: { textKey: string }[] }[] => (CONTENT.dialogues.find((d) => d.id === id)?.nodes ?? []) as never;
interface Talk { lines: number; words: number; choices: number }
/** Розмова з просильником за списком виборів (вузли без вибору — «Далі»), до кінця розмови. */
function talk(s0: GameState, npcId: string, picks: readonly string[], acc: Talk): GameState {
  let s = send({ ...s0, dialogue: null }, { type: 'Talk', npcId } as Move);
  const queue = [...picks];
  for (let guard = 0; s.dialogue && guard < 80; guard++) {
    const d = s.dialogue;
    const node = rawNodes(d.id).find((x) => x.id === d.node);
    if (!node) throw new Error(d.node);
    acc.lines++; acc.words += (UK[node.textKey] ?? '').split(/\s+/).filter(Boolean).length;
    if (!node.choices) { s = send(s, { type: 'Continue' } as Move); continue; }
    const want = queue.shift();
    const idx = want === undefined ? -1 : node.choices.findIndex((c) => c.textKey.endsWith(want));
    if (idx < 0) throw new Error(`${d.node}: немає вибору ${String(want)}`);
    acc.choices++; acc.words += (UK[node.choices[idx]?.textKey ?? ''] ?? '').split(/\s+/).length;
    s = send(s, { type: 'Choose', choice: idx } as Move);
  }
  return s;
}
const played = (s: GameState, id: string): GameState => send({ ...s, dialogue: null }, { type: 'FinishMinigame', minigameId: id, outcome: 'fine' } as Move);

/** Сценарій живого гравця: розмови й походи по черзі. Люк — після двох його дрібних прохань (їх час не рахуємо: він не місійний). */
const SCRIPT: Record<string, { pre: readonly string[]; talks: readonly (readonly string[])[] }> = {
  'mis.ring': { pre: [], talks: [['hello.c4', 'r-offer.c1', 'r-hub.c1', 'r-hub.c2', 'r-hub.c4', 'r-where.c2', 'r-hub.c3', 'r-hub.c4', 'r-where.c4', 'r-slab.c2', 'r-slab.c1', 'r-sieve2.c1', 'r-go.c1'], ['r-story2.c1', 'r-thanks.c1', 'r-payoff2.c1'], ['r-trap2.c1', 'r-set.c1']] },
  'mis.aerial': { pre: ['f.req-luc-chain-taken', 'f.req-luc-chain-t1', 'f.req-luc-chain-done', 'f.req-luc-radio-taken', 'f.req-luc-radio-t1', 'f.req-luc-radio-done'], talks: [['hello.c4', 'a-offer.c1', 'a-hub.c1', 'a-hub.c5', 'a-hub.c2', 'a-hub.c3', 'a-hub.c6', 'a-fix.c2', 'a-tip2.c2', 'a-go.c1'], ['a-listen.c1', 'a-note2.c1', 'a-story2.c1', 'a-payoff.c1'], ['a-sun2.c2', 'a-set.c1']] },
  'mis.lantern': { pre: [], talks: [['hello.c4', 'l-offer.c1', 'l-hub.c1', 'l-hub.c2', 'l-hub.c3', 'l-hub.c4', 'l-hub.c5', 'l-choice.c2', 'l-go.c1'], ['l-story2.c1', 'l-mode.c2', 'l-done.c1', 'l-payoff-end.c1'], ['l-wood2.c1', 'l-setup.c1']] },
};

// ───── типовий гравець у міні-грі (кадри до кінця) ─────
/** Зерна, на яких міряємо: середнє, а не щасливий випадок одного зерна. */
const SEEDS = [11, 20261112, 7, 4242, 31337];
function runFrames(def: AnyMinigame, input: (t: number, view: unknown) => FrameInput, seed: number): number {
  let s = def.init(NORMAL, seed);
  for (let t = 0; t < def.limitFrames; t++) {
    s = def.step(s, input(t, def.view(s, NORMAL)), NORMAL);
    if (def.done(s)) return t + 1;
  }
  return def.limitFrames;
}
const mean = (f: (seed: number) => number): number => SEEDS.reduce((a, sd) => a + f(sd), 0) / SEEDS.length;
/** Пошук: після кожної пригорщі — секунда подумати; спершу «через клітинку», щойно блиснуло — сусіди блиску. */
function siftPlayer(def: AnyMinigame): number { return mean((seed) => siftOnce(def, seed)); }
function siftOnce(def: AnyMinigame, seed: number): number {
  const opened: number[] = []; let glints: number[] = [];
  const order = Array.from({ length: SIFT_COLS * SIFT_ROWS }, (_, i) => i).filter((i) => (i % SIFT_COLS + Math.floor(i / SIFT_COLS)) % 2 === 0);
  let free = 0;
  return runFrames(def, (t, v) => {
    const { cells, sifting } = v as { cells: string[]; sifting: boolean };
    glints = cells.flatMap((c, i) => (c === 'glint' ? [i] : []));
    if (sifting) { free = t; return { taps: [], drag: null }; }
    if (t - free < FPS) return { taps: [], drag: null };   // секунда подумати, куди далі
    free = t + 10_000;
    const near = glints.flatMap((g) => Array.from({ length: cells.length }, (_, i) => i).filter((i) => siftNear(i, g) && !opened.includes(i)));
    const next = near[0] ?? order.find((i) => !opened.includes(i)) ?? 0;
    opened.push(next);
    return { taps: [{ x: (next % SIFT_COLS + 0.5) / SIFT_COLS, y: (Math.floor(next / SIFT_COLS) + 0.5) / SIFT_ROWS }], drag: null };
  }, seed);
}
/** Шкала: спершу шукає (0,2 шкали/с), далі тримає ціль із запізненням реакції 0,4 с і промахом ±0,03. */
function holdPlayer(def: AnyMinigame, p: HoldParams): number { return mean((seed) => holdOnce(def, p, seed)); }
function holdOnce(def: AnyMinigame, p: HoldParams, seed: number): number {
  let dial = 0.05; let found = false; const lag = Math.round(0.4 * FPS);
  const history: number[] = [];
  return runFrames(def, (t, v) => {
    const sig = (v as { signal: number }).signal;
    const base = 0.3 + (((seed * 7919) % 400 + 400) % 400) / 1000;
    history.push(Math.max(0, Math.min(1, base + p.sway * Math.sin(t / (p.periodS * FPS)))));
    if (!found) { dial = Math.min(1, dial + 0.2 / FPS); if (sig > 0.5) found = true; }
    else dial = (history[Math.max(0, t - lag)] as number) + 0.03 * Math.sin(t / 37);
    return { taps: [], drag: { x: dial, y: 0.5 } };
  }, seed);
}
/** Ритм: проміжки чергуються ±, кожен п'ятий — ривок. */
function rhythmPlayer(def: AnyMinigame, p: RhythmParams): number {
  const gaps = [p.beat - 4, p.beat + 5, p.beat - 2, p.beat + 3, p.beat + p.tol + 6];
  let next = 30; let k = 0;
  return runFrames(def, (t) => { if (t !== next) return { taps: [], drag: null }; next = t + (gaps[k++ % gaps.length] as number); return { taps: [{ x: 0.5, y: 0.5 }], drag: null }; }, 1);
}
const MG_TIME: Record<string, () => number> = {
  'mg.ring-sift': () => siftPlayer(minigameById('mg.ring-sift') as AnyMinigame),
  'mg.aerial-tune': () => holdPlayer(minigameById('mg.aerial-tune') as AnyMinigame, TUNE),
  'mg.panel-aim': () => holdPlayer(minigameById('mg.panel-aim') as AnyMinigame, AIM),
  'mg.tarp-tie': () => holdPlayer(minigameById('mg.tarp-tie') as AnyMinigame, TIE),
  'mg.lantern-crank': () => rhythmPlayer(minigameById('mg.lantern-crank') as AnyMinigame, CRANK),
  'mg.trap-weave': () => rhythmPlayer(minigameById('mg.trap-weave') as AnyMinigame, WEAVE),
};

export interface MissionTime { readonly read: number; readonly think: number; readonly walk: number; readonly play: number; readonly total: number }
export function missionTime(m: MissionDef, trips: readonly MissionDef['trips'][number][] = m.trips): MissionTime {
  const sc = SCRIPT[m.id] as (typeof SCRIPT)[string];
  const acc: Talk = { lines: 0, words: 0, choices: 0 };
  let s = send(initialState(5_000), TO_CAMP[0] as Move);
  for (const mv of TO_CAMP.slice(1)) s = send(s, mv);
  s = { ...s, flags: [...s.flags, ...sc.pre] };
  sc.talks.forEach((picks, i) => {
    if (i > trips.length) return;
    s = talk(s, m.giver, picks, acc);
    const trip = m.trips[i];
    if (trip && i < trips.length) s = played(s, trip.minigame);
  });
  const giver = giverAt(m.giver);
  const walk = legS(CAMP_START, giver) + trips.reduce((a, t) => a + 2 * legS(giver, anchor(t.zone)), 0);
  const play = trips.reduce((a, t) => a + (MG_TIME[t.minigame] as () => number)() / FPS + MG_SCREENS_S, 0);
  const read = acc.words / READ_WPS + acc.lines * TAP_S;
  const think = acc.choices * THINK_S;
  return { read, think, walk, play, total: read + think + walk + play };
}

describe('GAME-312 · місія — 5–10 хвилин гри (рішення власника 12.11)', () => {
  const fmt = (x: number): string => `${Math.floor(x / 60)}:${String(Math.round(x % 60)).padStart(2, '0')}`;
  for (const m of MISSIONS) {
    it(`${m.id}: від пропозиції до віддачі — не менше 5 і не більше 10 хвилин`, () => {
      const t = missionTime(m);
      console.log(`GAME-312 TIME ${m.id}: усього ${fmt(t.total)} (читання ${fmt(t.read)}, рішення ${fmt(t.think)}, ходьба ${fmt(t.walk)}, міні-ігри ${fmt(t.play)})`);
      expect(t.total).toBeGreaterThanOrEqual(MISSION_MIN_S);
      expect(t.total).toBeLessThanOrEqual(MISSION_MAX_S);
    });
  }
  it('кожна міні-гра місії: типовий гравець — у межах каркаса (30–90 с) і доходить до кінця', () => {
    for (const [id, f] of Object.entries(MG_TIME)) {
      const s = f() / FPS;
      expect(s, id).toBeGreaterThanOrEqual(10);
      expect(s, id).toBeLessThan((minigameById(id) as AnyMinigame).limitFrames / FPS);
    }
  });
  it('негативний контроль: без другого виходу (пристрою табору) місія коротша за 5 хвилин — межа червоніє', () => {
    for (const m of MISSIONS) expect(missionTime(m, [m.trips[0]]).total, m.id).toBeLessThan(MISSION_MIN_S);
  });
});
