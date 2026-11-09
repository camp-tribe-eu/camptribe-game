/// <reference types="node" />
// GAME-291 · CH2-SCHENGEN: пам'ятник трьом країнам, пляшка з другою половинкою медальйона, мікрокарта, з'єднання половинок (лише явною дією й лише з обома), мітка Джорджа на мапі.
// Закон 1: кожен сторож нижче показано червоним мутацією (текст червоного — в описі PR):
//  1) сцена завершувана за КОЖНОЇ погоди × комбінація профіль/транспорт/тварина × усі вибори сцени — на справжніх командах ядра й справжньому режисері;
//  2) МУТАЦІЯ «з'єднання дозволено з однією половинкою» (Safeguards.joinAll=false) → тест «з однією не вийде» червоніє;
//  3) МУТАЦІЯ «нагороду видано вдруге» (Safeguards.grantId=false, другий прохід квесту) → тест «рівно один примірник» червоніє;
//  4) нічого не блокується: гравець, що поїхав із набережної до сцени (☰), однаково завершує квест; без свідомого вибору половинки не з'єднуються самі.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { enumerateCombos } from '../../scripts/validator/combos.mjs';
import { dispatch, type Command, type Safeguards } from '../core/commands';
import { advance, minuteOfDay } from '../core/clock';
import { JOIN_MEDALLION, JOIN_RECIPES, MEDALLION, MEDALLION_HALF1, MEDALLION_HALF2, joined } from '../core/join';
import { fromSave, serialize } from '../core/save';
import { step, todayWeather, type SimState } from '../core/sim';
import { CHAPTER2_START } from '../core/story';
import { WEATHERS, dayOf, weatherOf, type Weather } from '../core/weather';
import { ch1End } from './ch1-end.fixture';
import { ACTIVITIES, WATERFALL_QUEST } from './ch2-activity';
import { ch2CarDecisions, ch2CarTrips } from './ch2-live';
import { PLAN_QUEST, TRAIL_BRANCHES } from './ch2-plan';
import { GEORGE_TRAIL_FLAG, JOIN_FLAG, SCHENGEN, SCHENGEN_GRANT, SCHENGEN_QUEST, SCHENGEN_RAIN_FLAG, SCHENGEN_SCENE, joinMove, schengenDue, schengenFinishMoves } from './ch2-schengen';
import { storyMoves } from './director';
import type { Move } from './moves';
import { GAME_DEFS } from './slice-defs';
import { CONTENT, STORY } from './story';
import { SECONDS, moveSeconds } from './time-model';
import itemsJson from '../../content/items.json';
import ukC from '../../content/locales/uk.json';
import enC from '../../content/locales/en.json';

const CTX = { defs: GAME_DEFS };
const MULLERTHAL = 'loc.camp.mullerthal';
let n = 0;
const cmdOf = (m: object): Command => ({ ...m, commandId: `s291-${n++}` } as Command);
const run = (s: SimState, m: object): SimState => {
  const c = cmdOf(m);
  const r = step(s, { kind: 'command', command: c }, CTX);
  const p = r.game.processed[c.commandId];
  if (p?.ok !== true) throw new Error(`${JSON.stringify(m)} → ${p?.ok === false ? p.code : 'без відповіді'}`);
  return r;
};
function settle(s: SimState): SimState {   // подія в дорозі відкриває діалог — закрити, як гравець
  for (let i = 0; s.game.dialogue !== null && i < 40; i++) {
    const before = s.game.dialogue;
    s = step(s, { kind: 'command', command: cmdOf({ type: 'Continue' }) }, CTX);
    if (s.game.dialogue === before) s = step(s, { kind: 'command', command: cmdOf({ type: 'Choose', choice: 0 }) }, CTX);
  }
  return s;
}
/** Режисер, як main.ts direct(): усе, що шле сюжет, ЦІЛИМ пакетом, поки він не замовкне. */
function direct(s: SimState): { sim: SimState; sent: Move[] } {
  const sent: Move[] = [];
  for (let i = 0; i < 12; i++) {
    const batch = storyMoves(s, GAME_DEFS);
    if (batch.length === 0) return { sim: s, sent };
    for (const m of batch) { sent.push(m); s = run(s, m); }
  }
  throw new Error(`режисер не замовкає: ${JSON.stringify(sent)}`);
}

const base = ch1End();
/** Світ із потрібною погодою В МОМЕНТ дії: зерно, для якого weatherOf(зерно, день годинника sim) = w. */
const withWeather = (s: SimState, w: Weather): SimState => { for (let k = 1; k < 5000; k++) if (weatherOf(k, dayOf(s.clock)) === w) return { ...s, worldSeed: k }; throw new Error(`немає зерна з ${w}`); };

type Combo = { profile: string | null; transport: string | null; animal: string };
const COMBOS = enumerateCombos(CONTENT) as Combo[];
const comboName = (c: Combo): string => `${c.profile}/${c.transport}/${c.animal}`;
const at = (s: SimState, hh: number): SimState => ({ ...s, clock: advance(s.clock, (hh * 60 - minuteOfDay(s.clock.minutes) + 1440) % 1440) });

/**
 * Ранок дня 3 розділу 2 (квест Шенгену активний, гравець у кемпінгу), погода w, комбінація combo. Шлях ядром: прибуття → прогулянка → вечір → сон → план → гілка → «Як провести день» (водоспад)
 * → сцена водоспаду (режисер) → вечір дня 2 (22:00, завершується сам) → сон → ранок дня 3.
 */
function schengenDay(w: Weather, combo?: Combo): SimState {
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
  expect(s.game.quests[PLAN_QUEST]?.status, 'квест плану відкрито').toBe('active');
  go({ type: 'CompleteQuest', questId: PLAN_QUEST, to: TRAIL_BRANCHES[0]?.quest });
  go({ type: 'CompleteQuest', questId: TRAIL_BRANCHES[0]?.quest });
  // день 2: водоспад (сухо) — сцена водоспаду читається Continue/Choose першим варіантом, режисер завершує крок
  s = withWeather(s, 'sunny');
  const trips = ch2CarDecisions(s.game, 'sunny');
  const fall = trips.find((t) => (t[0] as { to?: string }).to === WATERFALL_QUEST) as Move[];
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
  expect(s.game.quests[SCHENGEN_QUEST]?.status, 'ранок дня 3: Шенген активний').toBe('active');
  s = withWeather(s, w);
  expect(todayWeather(s)).toBe(w);
  expect(s.game.player?.locationId).toBe(MULLERTHAL);
  return s;
}

type Dlg = Record<string, { choices?: unknown[] }>;
const NODES_OF = (id: string): Dlg => (GAME_DEFS.story?.dialogues[id]?.nodes ?? {}) as Dlg;
interface Played { readonly sim: SimState; readonly nodes: string[]; readonly seconds: number }
function readScene(from: SimState, pick: (node: string) => number): Played {
  let s = from;
  const nodes: string[] = [];
  let seconds = 0;
  for (let i = 0; s.game.dialogue !== null; i++) {
    if (i > 40) throw new Error('розмова не закривається');
    expect(s.game.dialogue.id).toBe(SCHENGEN_SCENE);
    const id = s.game.dialogue.node;
    nodes.push(id);
    const m = NODES_OF(SCHENGEN_SCENE)[id]?.choices ? { type: 'Choose', choice: pick(id) } : { type: 'Continue' };
    seconds += moveSeconds(m as never) + SECONDS.line;
    s = run(s, m);
  }
  return { sim: s, nodes, seconds };
}
interface Trip { readonly sim: SimState; readonly nodes: string[]; readonly sent: Move[]; readonly seconds: number }
/** Поїздка авто → режисер сам відкриває сцену → гравець читає з вибором (хвиля, з'єднання, мітка) → режисер завершує квест, веде назад і з'єднує. */
function playTrip(from: SimState, w: number, j: number, t: number): Trip {
  const trips = ch2CarTrips(from.game);
  expect(trips.length, 'авто пропонує поїздку до Шенгену').toBe(1);
  let s = from;
  let seconds = SECONDS.walkOnMap;   // дійти до авто
  for (const m of trips[0] as Move[]) { s = run(s, m); seconds += moveSeconds(m as never); }
  s = settle(s);
  expect(s.game.player?.locationId, 'поїздка кінчається НА набережній (власна мапа)').toBe(SCHENGEN);
  expect(from.game.dialogue, 'сцени ще не було').toBeNull();
  const d1 = direct(s);
  expect(d1.sent[0]).toMatchObject({ type: 'StartScene', sceneId: SCHENGEN_SCENE });
  const sc = readScene(d1.sim, (id) => (id === 'wave' ? w : id === 'join' ? j : t));
  seconds += sc.seconds;
  const d2 = direct(sc.sim);
  seconds += d2.sent.reduce((a, m) => a + moveSeconds(m as never), 0);
  return { sim: d2.sim, nodes: sc.nodes, sent: [...d1.sent.slice(1), ...d2.sent], seconds };
}
const isPack = (m: Move): boolean => m.type === 'CompleteQuest' && (m as { questId: string }).questId === 'CH2-D3-PACK-001';
const played = (s: SimState): boolean => s.journal.some((e) => e.type === 'StartScene' && e.ref === SCHENGEN_SCENE);
const has = (s: SimState, id: string): number => s.game.inventory[id] ?? 0;

describe('GAME-291 · сцена Шенгену завершувана за КОЖНОЇ погоди', () => {
  it('вибірка названа: комбінацій 5 (enumerateCombos), погод 3, виборів сцени 2×2×2 = 8', () => {
    expect(COMBOS.length).toBe(5);
    expect(WEATHERS.length).toBe(3);
    process.stdout.write(`GAME-291 combos: ${COMBOS.map(comboName).join('; ')}\n`);
  });

  let runs = 0;
  const paths = new Set<string>();
  for (const combo of COMBOS) {
    it(`${comboName(combo)}: усі погоди × усі вибори сцени → сцена зіграна, квест завершено, медальйон цілий, мікрокарта в рюкзаку, мітка Джорджа`, () => {
      for (const w of WEATHERS) {
        const day = schengenDay(w, combo);
        expect(storyMoves(day, GAME_DEFS), 'до поїздки сюжет мовчить').toEqual([]);
        for (let pick = 0; pick < 8; pick++) {
          const r = playTrip(day, pick & 1, (pick >> 1) & 1, (pick >> 2) & 1);
          runs++;
          const g = r.sim.game;
          expect(played(r.sim), 'запис StartScene в журналі').toBe(true);
          expect(g.quests[SCHENGEN_QUEST]?.status, `${w}: квест завершено`).toBe('completed');
          expect(g.quests['CH2-D3-PACK-001']?.status, 'далі — збір (його візитом у кемпінг завершує режисер GAME-296; сцени збору — GAME-292)').toBeDefined();
          expect(g.grants, 'нагорода видана раз').toContain(SCHENGEN_GRANT);
          expect(g.grants.filter((x) => x === SCHENGEN_GRANT).length).toBe(1);
          expect([has(r.sim, MEDALLION), has(r.sim, MEDALLION_HALF1), has(r.sim, MEDALLION_HALF2)], 'половинки з’єднано в один медальйон').toEqual([1, 0, 0]);
          expect(has(r.sim, 'item.microcard'), 'мікрокарта').toBe(1);
          expect(g.flags.includes(GEORGE_TRAIL_FLAG), 'мітка Джорджа на мапі').toBe(true);
          expect(g.flags.includes(JOIN_FLAG), 'з’єднання — свідомий вибір гравця').toBe(true);
          expect(g.flags.includes(SCHENGEN_RAIN_FLAG), 'прапорець дощу — лише в дощ').toBe(w === 'rain');
          expect(g.player?.locationId, 'після сцени родина в кемпінгу').toBe(MULLERTHAL);
          expect(storyMoves(r.sim, GAME_DEFS), 'сюжет мовчить після завершення').toEqual([]);
          expect(r.sent.filter((m) => !isPack(m)).map((m) => m.type), 'ходи режисера: завершення, дорога назад, з’єднання (крок збору, що завершується візитом, — окремо)').toEqual(['CompleteQuest', 'Visit', 'JoinItems']);
          paths.add(r.nodes.join('>'));
          if (w === 'rain') expect(r.nodes, 'дощ: вступ під павільйоном').toContain('open-rain');
          else expect(r.nodes).not.toContain('open-rain');
        }
      }
    });
  }
  it('підсумок вибірки: 5 комбінацій × 3 погоди × 8 виборів = 120 проходжень; шляхів сцени 16 (8 виборів × сухо/дощ)', () => {
    expect(runs).toBe(COMBOS.length * WEATHERS.length * 8);
    expect(paths.size).toBe(16);
    process.stdout.write(`GAME-291 playthroughs: ${runs}; scene paths: ${paths.size}\n`);
  });
});

describe('GAME-291 · МУТАЦІЯ «з’єднання дозволено з однією половинкою»', () => {
  const owning = (inv: Record<string, number>): SimState => { const s = schengenDay('sunny'); return { ...s, game: { ...s.game, inventory: { ...s.game.inventory, ...inv } } }; };
  const SAFE: Safeguards = { commandId: true, grantId: true, rollback: true };
  const LOOSE: Safeguards = { ...SAFE, joinAll: false };
  const join = (s: SimState, guard: Safeguards): ReturnType<typeof dispatch> => dispatch(s.game, { type: 'JoinItems', commandId: 'j-mut', recipeId: JOIN_MEDALLION }, GAME_DEFS, guard, 0);
  /** Сторож: з однією половинкою (або жодною) з’єднання відхилено, інвентар не змінився, медальйона немає. */
  function assertNeedsBoth(guard: Safeguards): void {
    for (const inv of [{ [MEDALLION_HALF2]: 1 }, { [MEDALLION_HALF1]: 1 }]) {
      const s = owning(inv);
      const r = join(s, guard);
      expect(r.ok, `з однією половинкою (${Object.keys(inv).join()}) з’єднання мусить бути відхилене`).toBe(false);
      expect(r.state.inventory[MEDALLION], 'медальйона без обох половинок немає').toBeUndefined();
      expect(r.state.inventory).toEqual(s.game.inventory);
    }
  }
  it('справжнє ядро: з однією половинкою — ITEM_NOT_OWNED, інвентар цілий; з обома — медальйон, половинок не лишається; вдруге — GRANT_ALREADY_GIVEN', () => {
    assertNeedsBoth(SAFE);
    const none = join(owning({}), SAFE);
    expect(none.ok === false && none.code).toBe('ITEM_NOT_OWNED');
    const one = join(owning({ [MEDALLION_HALF2]: 1 }), SAFE);
    expect(one.ok === false && one.code).toBe('ITEM_NOT_OWNED');
    const s = owning({ [MEDALLION_HALF1]: 1, [MEDALLION_HALF2]: 1 });
    const both = join(s, SAFE);
    expect(both.ok).toBe(true);
    expect([both.state.inventory[MEDALLION], both.state.inventory[MEDALLION_HALF1], both.state.inventory[MEDALLION_HALF2]]).toEqual([1, undefined, undefined]);
    const again = dispatch(both.state, { type: 'JoinItems', commandId: 'j-mut-2', recipeId: JOIN_MEDALLION }, GAME_DEFS, SAFE, 0);
    expect(again.ok === false && again.code).toBe('GRANT_ALREADY_GIVEN');
    expect(dispatch(s.game, { type: 'JoinItems', commandId: 'j-x', recipeId: 'recipe.ghost' }, GAME_DEFS, SAFE, 0).ok, 'невідомий рецепт').toBe(false);
  });
  it('мутація: з вимкненим запобіжником з однією половинкою виходить медальйон → сторож «потрібні обидві» червоніє', () => {
    expect(() => assertNeedsBoth(LOOSE)).toThrow(/з однією половинкою .* з’єднання мусить бути відхилене/);
    // чиста функція рецепта теж: all=false пропускає неповний набір
    const r = JOIN_RECIPES[0] as (typeof JOIN_RECIPES)[number];
    expect(joined({ [MEDALLION_HALF2]: 1 }, r)).toBeNull();
    expect(joined({ [MEDALLION_HALF2]: 1 }, r, false)).not.toBeNull();
  });
  it('рецепт посилається лише на наявні предмети контенту (content/items.json)', () => {
    const ids = new Set(itemsJson.map((i) => i.id));
    for (const r of JOIN_RECIPES) for (const id of [...r.from, r.to]) expect(ids.has(id), `${r.id}: ${id}`).toBe(true);
  });
  it('нічого не з’єднується саме: до свідомого вибору сюжет JoinItems не шле, навіть із обома половинками в рюкзаку', () => {
    const s = owning({ [MEDALLION_HALF1]: 1, [MEDALLION_HALF2]: 1 });
    expect(s.game.flags.includes(JOIN_FLAG)).toBe(false);
    expect(joinMove(s)).toBeNull();
    expect(storyMoves(s, GAME_DEFS).some((m) => m.type === 'JoinItems')).toBe(false);
    const chosen = { ...s, game: { ...s.game, flags: [...s.game.flags, JOIN_FLAG].sort() } };
    expect(joinMove(chosen)).toEqual({ type: 'JoinItems', recipeId: JOIN_MEDALLION });
    const oneHalf = { ...chosen, game: { ...chosen.game, inventory: { ...chosen.game.inventory, [MEDALLION_HALF1]: 0 } } };
    expect(joinMove(oneHalf), 'вибір є, а половинки однієї нема — режисер не шле').toBeNull();
  });
});

describe('GAME-291 · МУТАЦІЯ «нагорода видана вдруге» (grantId)', () => {
  /** Другий прохід квесту Шенгену: квест знову активний (як цикл у графі чи відкат), CompleteQuest вдруге. Перевіряє: половинок і мікрокарти рівно по одній, нагорода раз. */
  function secondPass(guardGrant: boolean): SimState['game'] {
    const first = playTrip(schengenDay('sunny'), 0, 0, 0).sim;
    // нічого не з'єднано-споживано: повертаємо половинки, щоб рахувати саме видачу, а не споживання
    const g0 = { ...first.game, quests: { ...first.game.quests, [SCHENGEN_QUEST]: { status: 'active' as const, done: ['o1-schengen'] } } };
    const guard: Safeguards = { commandId: true, grantId: guardGrant, rollback: true };
    const r = dispatch(g0, { type: 'CompleteQuest', commandId: 'second-pass', questId: SCHENGEN_QUEST }, GAME_DEFS, guard, 0, undefined, first.clock.minutes);
    expect(r.ok, 'другий прохід приймається ядром (квест завершений знову)').toBe(true);
    return r.state;
  }
  function assertGrantedOnce(g: SimState['game']): void {
    expect(g.grants.filter((x) => x === SCHENGEN_GRANT).length, 'grantId у списку нагород — раз').toBe(1);
    expect(g.inventory['item.microcard'], 'мікрокарта — рівно один примірник після другого проходу').toBe(1);
    expect(g.inventory[MEDALLION_HALF2] ?? 0, 'друга половинка не повертається після з’єднання').toBe(0);
    expect(g.inventory[MEDALLION_HALF1] ?? 0, 'перша половинка не повертається після з’єднання').toBe(0);
  }
  it('справжнє ядро: другий прохід нічого не додає (grantId раз)', () => { assertGrantedOnce(secondPass(true)); });
  it('мутація: з вимкненим запобіжником другий прохід видає мікрокарту й половинки знову → сторож червоніє', () => {
    expect(() => assertGrantedOnce(secondPass(false))).toThrow(/grantId у списку нагород/);
  });
  it('перебір: той самий квест, пройдений двічі у складі всіх 5 комбінацій, не дає другої нагороди (рахунок за журналом подій)', () => {
    for (const combo of COMBOS) {
      const first = playTrip(schengenDay('sunny', combo), 1, 1, 1).sim;
      expect(first.game.grants.filter((x) => x === SCHENGEN_GRANT).length, comboName(combo)).toBe(1);
      expect(has(first, MEDALLION)).toBe(1);
      expect(has(first, 'item.microcard')).toBe(1);
    }
  });
});

describe('GAME-291 · розділ ніколи не блокується', () => {
  it('гравець поїхав із набережної до сцени (візит назад у кемпінг): квест завершується сам, нагорода видана, медальйон НЕ з’єднано (вибору не було), нічого не зависло', () => {
    let s = schengenDay('sunny');
    s = run(s, { type: 'Visit', locationId: SCHENGEN });
    s = settle(s);
    expect(schengenDue(s), 'на набережній сцена готова').toBe(true);
    s = run(s, { type: 'Visit', locationId: MULLERTHAL });   // поїхав, не дочекавшись сцени (☰)
    expect(schengenDue(s)).toBe(false);
    const d = direct(s);
    expect(d.sent.slice(0, 2).map((m) => m.type), 'без сцени: завершення + назад').toEqual(['CompleteQuest', 'Visit']);
    expect(d.sent.slice(2).every((m) => m.type === 'CompleteQuest' && (m as { questId: string }).questId === 'CH2-D3-PACK-001'), 'решта — лише крок збору, що завершується візитом').toBe(true);
    expect(d.sim.game.quests[SCHENGEN_QUEST]?.status).toBe('completed');
    expect(has(d.sim, MEDALLION_HALF1) + has(d.sim, MEDALLION_HALF2), 'обидві половинки видано, але не з’єднано саме').toBe(2);
    expect(has(d.sim, MEDALLION)).toBe(0);
    expect(played(d.sim)).toBe(false);
  });
  it('на набережній режисер чекає сцену й нічого не завершує, поки вона попереду', () => {
    let s = schengenDay('rain');
    s = settle(run(s, { type: 'Visit', locationId: SCHENGEN }));
    expect(schengenFinishMoves(s)).toEqual([]);
    expect(storyMoves(s, GAME_DEFS).map((m) => m.type)).toEqual(['StartScene']);
  });
  it('ворота дня 3: до ранку Шенген не відкрито, сцена не відкривається до свого етапу; розділ 1 цього не бачить', () => {
    expect(storyMoves(base, GAME_DEFS)).toEqual([]);
    expect(schengenDue(base)).toBe(false);
    expect(ch2CarTrips(base.game)).toEqual([]);
  });
  it('у дощ Шенген той самий: сцена з вступом під павільйоном, локація sheltered (мокре спорядження не мокне ще раз)', () => {
    expect((CONTENT.locations as { id: string; sheltered?: boolean }[]).find((l) => l.id === SCHENGEN)?.sheltered).toBe(true);
  });
});

describe('GAME-291 · час гравця за моделлю (time-model.ts)', () => {
  it('поїздка + сцена + завершення + з’єднання: секунди за моделлю — число в описі PR', () => {
    const out: number[] = [];
    for (const w of WEATHERS) { const day = schengenDay(w); for (let p = 0; p < 8; p++) out.push(playTrip(day, p & 1, (p >> 1) & 1, (p >> 2) & 1).seconds); }
    const lo = Math.min(...out);
    const hi = Math.max(...out);
    process.stdout.write(`GAME-291 schengen model seconds: min ${lo}, max ${hi}\n`);
    expect(lo).toBeGreaterThan(60);
    expect(hi).toBeLessThan(600);
  });
});

describe('GAME-291 · тексти: пара uk/en, довжина, зміст', () => {
  const RAW = JSON.parse(readFileSync(new URL('../../content/dialogue/ch2-schengen.json', import.meta.url), 'utf8')) as { nodes: { id: string; choices?: unknown[] }[] };
  it('кожен ключ сцени — у uk і en, репліка ≤ 110 знаків; предмети мають назви', () => {
    for (const x of RAW.nodes) {
      for (const k of [`dlg.ch2-schengen.${x.id}`, ...(x.choices ?? []).map((_, i) => `dlg.ch2-schengen.${x.id}.c${i + 1}`)]) for (const [lang, l] of [['uk', ukC], ['en', enC]] as const) {
        const t = (l as Record<string, string>)[k];
        expect(t, `${lang}/${k}`).toBeTruthy();
        expect(Array.from(t as string).length, `${lang}/${k}`).toBeLessThanOrEqual(110);
      }
    }
    for (const id of [MEDALLION, MEDALLION_HALF1, MEDALLION_HALF2, 'item.microcard']) for (const l of [ukC, enC]) expect((l as Record<string, string>)[id], id).toBeTruthy();
  });
});

describe('GAME-291 · сейв ранку дня 3 для e2e і розмір', () => {
  for (const w of ['sunny', 'rain'] as const) {
    const file = new URL(`../../tests/e2e/fixtures/ch2-schengen-${w}.json`, import.meta.url);
    it(`сейв «ранок дня 3, Шенген, ${w}» = те, що ядро збирає зараз (G291_WRITE=1 переписує); сейв < 500 КБ`, () => {
      n = 980_000;   // ідентифікатори команд у сейві не залежать від порядку інших тестів
      const sim = schengenDay(w);
      const json = `${serialize(sim)}\n`;
      expect(new TextEncoder().encode(json).length, 'сейв < 500 КБ').toBeLessThan(500 * 1024);
      if (process.env.G291_WRITE === '1') { writeFileSync(file, json); return; }
      expect(existsSync(file), 'немає фікстури: G291_WRITE=1').toBe(true);
      expect(readFileSync(file, 'utf8'), 'фікстура розійшлась із ядром').toBe(json);
      const l = fromSave(json, { story: STORY });
      if (!l.ok) throw new Error(`${l.code} ${l.detail}`);
      expect(todayWeather(l.sim)).toBe(w);
      expect(l.sim.game.quests[SCHENGEN_QUEST]?.status).toBe('active');
    });
  }
});
