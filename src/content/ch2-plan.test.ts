/// <reference types="node" />
// GAME-289 · CH2-D2-PLAN: ранок дня 2, план дня, табличка «стежка закрита після зсуву», вибір «забута стежка з Інгрід / інший шлях самим». Обидві гілки сходяться в тихому водоспаді.
// Закон 1: кожен сторож нижче показано червоним мутацією (результати — в описі PR):
//  1) граф: від КОЖНОЇ відповіді сцени плану є шлях до CH2-D2-WATERFALL-001; мутації «обидві відповіді на одну гілку», «гілка без виходу», «гілка в обхід водоспаду» червоніють (і в справжньому валідаторі);
//  2) розмови без глухих кутів (оракул по JSON + справжній валідатор), довжина реплік, пара uk/en;
//  3) обидві гілки ДО КІНЦЯ на справжніх командах ядра й справжньому режисері: усі комбінації профіль × транспорт × тварина з enumerateCombos × погода × обидві гілки × усі вибори вставки;
//  4) softlock 0: повний перебір ходів (moves(), те саме, що бот) від ранку дня 2 і від кожної гілки — з кожного досяжного стану є вихід у кінець дня 2 (CH2-D2-EVENING-001);
//  5) розділ 1 цього не бачить; табличка не відкривається до дня 2; хто обрав гілку в ☰ і не читав табличку — нічого не втрачає.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../scripts/validator/load.mjs';
import { validate } from '../../scripts/validator/checks.mjs';
import { enumerateCombos } from '../../scripts/validator/combos.mjs';
import { dispatch, type Command } from '../core/commands';
import { advance } from '../core/clock';
import { fromSave, serialize } from '../core/save';
import { step, type SimState } from '../core/sim';
import { stateHash } from '../core/hash';
import type { GameState } from '../core/state';
import { CHAPTER2_START, questOpen } from '../core/story';
import { WEATHERS, dayOf, weatherOf, type Weather } from '../core/weather';
import { ch1End, onRoadHome } from './ch1-end.fixture';
import { FORK_FLAG, PLAN_FLAG, PLAN_QUEST, PLAN_SCENE, PLAN_SPOT, TRAIL_BRANCHES, planDue, planFinishMove, planPlayed, trailDue, trailFinishMove, trailPlayed, type TrailBranch } from './ch2-plan';
import { liveSpot, spotMove, storyMoves } from './director';
import { exploreView, moves, type Move } from './moves';
import { GAME_DEFS } from './slice-defs';
import { CONTENT, STORY } from './story';
import { SECONDS, moveSeconds } from './time-model';
import ukC from '../../content/locales/uk.json';
import enC from '../../content/locales/en.json';
import questsJson from '../../content/quests.json';

const CTX = { defs: GAME_DEFS };
const WATERFALL = 'CH2-D2-WATERFALL-001';
const ACTIVITY = 'CH2-D2-ACTIVITY-001';
const EVENING = 'CH2-D2-EVENING-001';
const FORGOTTEN = TRAIL_BRANCHES[0] as TrailBranch;
const OTHER = TRAIL_BRANCHES[1] as TrailBranch;
const SCENES = [PLAN_SCENE, FORGOTTEN.scene, OTHER.scene];
let n = 0;
const cmdOf = (m: object): Command => ({ ...m, commandId: `a289-${n++}` } as Command);
const run = (s: SimState, m: object): SimState => {
  const c = cmdOf(m);
  const r = step(s, { kind: 'command', command: c }, CTX);
  const p = r.game.processed[c.commandId];
  if (p?.ok !== true) throw new Error(`${JSON.stringify(m)} → ${p?.ok === false ? p.code : 'без відповіді'}`);
  return r;
};
const refused = (s: SimState, m: object): string | null => {
  const c = cmdOf(m);
  const p = step(s, { kind: 'command', command: c }, CTX).game.processed[c.commandId];
  return p?.ok === false ? String(p.code) : null;
};
function settle(s: SimState): SimState {   // подія в дорозі відкриває діалог — закрити, як гравець
  for (let i = 0; s.game.dialogue !== null && i < 40; i++) {
    const before = s.game.dialogue;
    s = step(s, { kind: 'command', command: cmdOf({ type: 'Continue' }) }, CTX);
    if (s.game.dialogue === before) s = step(s, { kind: 'command', command: cmdOf({ type: 'Choose', choice: 0 }) }, CTX);
  }
  return s;
}
/** Режисер: усе, що сюжет шле сам (storyMoves), по одному, поки він не замовкне — як main.ts direct(). */
function direct(s: SimState): { sim: SimState; sent: Move[] } {
  const sent: Move[] = [];
  for (let i = 0; i < 12; i++) {
    const mv = storyMoves(s, GAME_DEFS)[0];
    if (!mv) return { sim: s, sent };
    sent.push(mv);
    s = run(s, mv);
  }
  throw new Error(`режисер не замовкає: ${JSON.stringify(sent)}`);
}

const base = ch1End();
const evening = ((19 * 60 - ((base.clock.minutes + 480) % 1440) + 1440) % 1440);
const clockEv = advance(base.clock, evening);
const seedFor = (w: Weather): number => { for (let s = 1; s < 5000; s++) if (weatherOf(s, dayOf(clockEv)) === w) return s; throw new Error(`немає зерна з ${w}`); };

type Combo = { profile: string | null; transport: string | null; animal: string };
const COMBOS = enumerateCombos(CONTENT) as Combo[];
const comboName = (c: Combo): string => `${c.profile}/${c.transport}/${c.animal}`;

/** Ранок дня 2 розділу 2 (квест плану активний, ворота дня відчинені) для комбінації й погоди: прибуття, прогулянка, вечір, сон, день-квест вечора закрито сюжетом. */
function morning2(w: Weather, combo?: Combo): SimState {
  const b = combo && base.game.player ? { ...base, game: { ...base.game, player: { ...base.game.player, profileId: combo.profile ?? base.game.player.profileId, transportId: combo.transport ?? base.game.player.transportId, animalId: combo.animal } } } : base;
  let s: SimState = { ...b, worldSeed: seedFor(w) };
  const go = (m: object): void => { s = run(s, m); };
  go({ type: 'StartChapter2' });
  go({ type: 'Visit', locationId: 'loc.road' }); s = settle(s);
  go({ type: 'Visit', locationId: 'loc.camp.mullerthal' }); s = settle(s);
  go({ type: 'Talk', npcId: 'npc.host-mullerthal' });
  go({ type: 'Choose', choice: 0 }); go({ type: 'Choose', choice: 1 }); go({ type: 'Continue' });
  go({ type: 'CompleteQuest', questId: CHAPTER2_START });
  go({ type: 'Visit', locationId: 'loc.trail.official' }); s = settle(s);
  go({ type: 'CompleteQuest', questId: 'CH2-D1-WALK-001' });
  go({ type: 'Visit', locationId: 'loc.camp.mullerthal' }); s = settle(s);
  s = { ...s, clock: advance(s.clock, Math.max(0, clockEv.minutes - s.clock.minutes)) };
  go({ type: 'Sleep' });
  s = direct(s).sim;   // сюжет завершує день-квест вечора (GAME-288)
  expect(s.game.quests[PLAN_QUEST]?.status, 'квест плану відкрито').toBe('active');
  return s;
}

type Dlg = Record<string, { choices?: unknown[]; next?: string; end?: true }>;
const NODES = (id: string): Dlg => (GAME_DEFS.story?.dialogues[id]?.nodes ?? {}) as Dlg;
interface Played { readonly sim: SimState; readonly nodes: string[]; readonly seconds: number }
/** Гравець читає сцену до кінця: у вузлах з вибором бере `pick(вузол)`. Секунди — модель часу гравця. */
function readScene(from: SimState, scene: string, pick: (node: string) => number): Played {
  let s = from;
  const nodes: string[] = [];
  let seconds = 0;
  for (let i = 0; s.game.dialogue !== null; i++) {
    if (i > 30) throw new Error('розмова не закривається');
    expect(s.game.dialogue.id).toBe(scene);
    const id = s.game.dialogue.node;
    nodes.push(id);
    const m = NODES(scene)[id]?.choices ? { type: 'Choose', choice: pick(id) } : { type: 'Continue' };
    seconds += moveSeconds(m as never) + SECONDS.line;
    s = run(s, m);
  }
  return { sim: s, nodes, seconds };
}
/** Табличка: дотик до вказівника (режисер) → сцена → гравець обирає гілку `branch` (0 — забута з Інгрід, 1 — інший шлях). */
function sign(from: SimState, branch: 0 | 1): Played {
  const mv = spotMove(from, PLAN_SPOT);
  expect(mv, 'табличка жива — дотик дає StartScene').toEqual({ type: 'StartScene', sceneId: PLAN_SCENE, facts: [PLAN_FLAG] });
  const s = run(from, mv as object);
  const r = readScene(s, PLAN_SCENE, () => branch);
  return { ...r, seconds: r.seconds + SECONDS.walkOnMap };
}

interface Full { readonly sim: SimState; readonly planNodes: string[]; readonly trailNodes: string[]; readonly seconds: number; readonly sent: Move[][] }
/** Уся гілка до кінця: табличка → вибір → (сюжет) план → гілка → дотик до вказівника своєї стежки → вставка → (сюжет) гілка завершена → ACTIVITY. `insertPick` — вибір у вставці. */
function fullBranch(morning: SimState, branch: 0 | 1, insertPick: number): Full {
  const b = (branch === 0 ? FORGOTTEN : OTHER);
  const sent: Move[][] = [];
  const p = sign(morning, branch);
  expect(p.sim.game.flags, 'табличку прочитано').toContain(PLAN_FLAG);
  expect(p.sim.game.flags.includes(FORK_FLAG), 'вибір «з Інгрід» — прапорець, «самим» — без нього').toBe(branch === 0);
  expect(p.sim.game.quests[PLAN_QUEST]?.status, 'квест плану ще чекає сюжету').toBe('active');
  expect(TRAIL_BRANCHES.every((x) => p.sim.game.quests[x.quest] === undefined), 'жодна гілка ще не стартувала').toBe(true);
  const d1 = direct(p.sim);
  sent.push(d1.sent);
  expect(d1.sent, 'сюжет завершує план переходом у обрану гілку').toEqual([{ type: 'CompleteQuest', questId: PLAN_QUEST, to: b.quest }]);
  expect(d1.sim.game.quests[PLAN_QUEST]?.status).toBe('completed');
  expect(d1.sim.game.quests[(branch === 0 ? OTHER : FORGOTTEN).quest], 'друга гілка не стартувала').toBeUndefined();
  expect(d1.sim.game.quests[b.quest]?.status, 'обрана гілка активна').toBe('active');
  expect(storyMoves(d1.sim, GAME_DEFS), 'сюжет мовчить, поки вставки не було').toEqual([]);
  expect(spotMove(d1.sim, PLAN_SPOT), 'табличка погасла').toBeNull();
  expect(spotMove(d1.sim, (branch === 0 ? OTHER : FORGOTTEN).spot), 'чужий вказівник німий').toBeNull();
  expect(liveSpot(d1.sim, b.spot), 'вказівник обраної стежки живий').toBe(true);
  const before = d1.sim;
  const startIns = spotMove(d1.sim, b.spot);
  expect(startIns, 'дотик до вказівника обраної стежки відкриває вставку').toEqual({ type: 'StartScene', sceneId: b.scene, facts: [] });
  const s = run(d1.sim, startIns as object);
  sent.push([startIns as Move]);
  const ins = readScene(s, b.scene, () => insertPick);
  expect(trailPlayed(ins.sim, b)).toBe(true);
  expect(ins.nodes.slice(0, 2), 'табличку прочитано — вставка згадує її').toEqual(['open', 'open-sign']);
  const d2 = direct(ins.sim);
  sent.push(d2.sent);
  expect(d2.sent, 'після вставки сюжет завершує гілку').toEqual([{ type: 'CompleteQuest', questId: b.quest }]);
  expect(d2.sim.game.quests[b.quest]?.status).toBe('completed');
  expect(d2.sim.game.quests[ACTIVITY]?.status, 'обидві гілки сходяться в ACTIVITY').toBe('active');
  expect(spotMove(d2.sim, b.spot), 'вставка не повторюється').toBeNull();
  expect(liveSpot(d2.sim, b.spot)).toBe(false);
  expect(before.game.flags).toContain(PLAN_FLAG);
  return { sim: d2.sim, planNodes: p.nodes, trailNodes: ins.nodes, seconds: p.seconds + SECONDS.walkOnMap + ins.seconds, sent };
}

// ───────────────────────── 1. Граф: гілка без виходу до водоспаду ─────────────────────────
interface RawQuest { id: string; transitions: { on: string; to: string }[] }
interface RawNode { id: string; choices?: { next: string; effects?: { setFlag?: string }[] }[]; next?: string; end?: true; branches?: { next: string }[] }
interface RawDlg { id: string; start: string; nodes: RawNode[] }
const rawDlg = (name: string): RawDlg => JSON.parse(readFileSync(new URL(`../../content/dialogue/${name}.json`, import.meta.url), 'utf8')) as RawDlg;
const PLAN_DLG = rawDlg('ch2-plan');

/** Квести, досяжні переходами від `from` (включно). */
function reach(quests: readonly RawQuest[], from: string): Set<string> {
  const by = new Map(quests.map((q) => [q.id, q]));
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length) {
    const id = stack.pop() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const t of by.get(id)?.transitions ?? []) stack.push(t.to);
  }
  return seen;
}
/**
 * Оракул без ядра й валідатора: у вузлі вибору сцени плану перша відповідь ставить прапорець вибору (забута стежка), друга — ні (інший шлях); обидві гілки — квести, з яких переходами
 * досяжний тихий водоспад; квест плану веде в обидві. Порожньо — кожен вибір має вихід до водоспаду. Слова — що саме зламано.
 */
function waterfallProblems(quests: readonly RawQuest[], dlg: RawDlg): string[] {
  const out: string[] = [];
  const fork = dlg.nodes.filter((x) => x.choices?.some((c) => c.effects?.some((e) => e.setFlag === FORK_FLAG)));
  if (fork.length !== 1) out.push(`вузлів вибору гілки має бути 1, а їх ${fork.length}`);
  for (const node of fork) {
    const sets = (node.choices ?? []).map((c) => (c.effects ?? []).some((e) => e.setFlag === FORK_FLAG));
    if (sets.length !== 2) out.push(`${node.id}: відповідей має бути 2, а їх ${sets.length}`);
    else if (!(sets[0] && !sets[1])) out.push(`${node.id}: перша відповідь має ставити ${FORK_FLAG}, друга — ні (інакше одна з гілок недосяжна)`);
  }
  for (const [i, b] of TRAIL_BRANCHES.entries()) {
    if (!reach(quests, b.quest).has(WATERFALL)) out.push(`гілка ${i === 0 ? 'забута стежка' : 'інший шлях'}: з квесту ${b.quest} немає виходу до ${WATERFALL}`);
  }
  const plan = quests.find((q) => q.id === PLAN_QUEST);
  for (const b of TRAIL_BRANCHES) if (!plan?.transitions.some((t) => t.to === b.quest)) out.push(`квест плану не веде в ${b.quest}`);
  return out;
}

describe('GAME-289 · гілка без виходу до водоспаду (оракул по JSON; мутації червоніють)', () => {
  const quests = questsJson as unknown as RawQuest[];
  it('оракул: у справжньому контенті порушень нема; перша відповідь ставить f.trail-forgotten, друга — ні; обидві гілки сходяться у водоспаді', () => {
    expect(waterfallProblems(quests, PLAN_DLG)).toEqual([]);
    const forkNode = PLAN_DLG.nodes.find((x) => x.id === 'fork') as RawNode;
    expect(forkNode.choices?.map((c) => c.effects?.map((e) => e.setFlag))).toEqual([[FORK_FLAG], []]);
    for (const b of TRAIL_BRANCHES) expect(reach(quests, b.quest).has(WATERFALL), b.quest).toBe(true);
  });
  it('МУТАЦІЯ «гілка без виходу»: у квесту стежки прибрано переходи → оракул називає гілку', () => {
    for (const [i, b] of TRAIL_BRANCHES.entries()) {
      const bad = waterfallProblems(quests.map((q) => (q.id === b.quest ? { ...q, transitions: [] } : q)), PLAN_DLG);
      expect(bad, b.quest).toEqual([`гілка ${i === 0 ? 'забута стежка' : 'інший шлях'}: з квесту ${b.quest} немає виходу до ${WATERFALL}`]);
    }
  });
  it('МУТАЦІЯ «гілка в обхід водоспаду»: перехід гілки веде одразу у вечір → оракул червоніє', () => {
    const bad = waterfallProblems(quests.map((q) => (q.id === OTHER.quest ? { ...q, transitions: [{ on: 'complete', to: EVENING }] } : q)), PLAN_DLG);
    expect(bad).toEqual([`гілка інший шлях: з квесту ${OTHER.quest} немає виходу до ${WATERFALL}`]);
  });
  it('МУТАЦІЯ «обидві відповіді на одну гілку» і «жодна не ставить прапорця» → оракул: одна з гілок недосяжна', () => {
    const both = structuredClone(PLAN_DLG);
    const fork = (d: RawDlg): { effects: { setFlag?: string }[] }[] => (d.nodes.find((x) => x.id === 'fork') as unknown as { choices: { effects: { setFlag?: string }[] }[] }).choices;
    fork(both)[1]?.effects.push({ setFlag: FORK_FLAG });
    expect(waterfallProblems(quests, both)).toEqual([`fork: перша відповідь має ставити ${FORK_FLAG}, друга — ні (інакше одна з гілок недосяжна)`]);
    const none = structuredClone(PLAN_DLG);
    fork(none)[0]?.effects.splice(0);
    expect(waterfallProblems(quests, none).join('\n')).toContain('вузлів вибору гілки має бути 1, а їх 0');
  });
  it('МУТАЦІЯ «квест плану не веде в гілку» → оракул червоніє', () => {
    const bad = waterfallProblems(quests.map((q) => (q.id === PLAN_QUEST ? { ...q, transitions: q.transitions.filter((t) => t.to !== FORGOTTEN.quest) } : q)), PLAN_DLG);
    expect(bad).toEqual([`квест плану не веде в ${FORGOTTEN.quest}`]);
  });

  const loaded = loadContent('content');
  const TODAY = '2026-11-09';
  const issues = (c: unknown): { code: string; where: string }[] => validate(c, { today: TODAY }) as { code: string; where: string }[];
  it('справжній валідатор: чистий контент; МУТАЦІЯ «гілка без переходів» → валідатор червоніє на цій гілці', () => {
    expect(loaded.status).toBe('OK');
    expect(issues(loaded.content).filter((i) => /ch2|CH2-D2/.test(i.where))).toEqual([]);
    for (const b of TRAIL_BRANCHES) {
      const broken = structuredClone(loaded.content) as { quests: { id: string; transitions: unknown[] }[] };
      const q = broken.quests.find((x) => x.id === b.quest);
      if (!q) throw new Error(`нема ${b.quest}`);
      q.transitions = [];
      const red = issues(broken).filter((i) => i.where.includes(b.quest) || i.where.includes(WATERFALL) || i.where.includes(ACTIVITY));
      expect(red.length, `валідатор мовчить про гілку ${b.quest} без виходу`).toBeGreaterThan(0);
      process.stdout.write(`GAME-289 validator on ${b.quest} without exit: ${[...new Set(red.map((i) => i.code))].join(', ')}\n`);
    }
  });
});

// ───────────────────────── 2. Розмови: без глухих кутів, довжина, пара uk/en ─────────────────────────
describe('GAME-289 · три сцени: без глухих кутів, репліки ≤ 110, пара uk/en', () => {
  /** Незалежний від валідатора оракул: порушення словами. Порожньо — розмова чесна. */
  function problems(d: RawDlg): string[] {
    const out: string[] = [];
    const by = new Map(d.nodes.map((x) => [x.id, x]));
    for (const x of d.nodes) {
      for (const c of x.choices ?? []) if (!by.has(c.next)) out.push(`${x.id}: вибір веде на неіснуючий вузол «${c.next}»`);
      if (x.next !== undefined && !by.has(x.next)) out.push(`${x.id}: next веде на неіснуючий вузол «${x.next}»`);
    }
    const exits = (x: RawNode): string[] => [...(x.next !== undefined ? [x.next] : []), ...(x.choices ?? []).map((c) => c.next)];
    for (const x of d.nodes) {
      const seen = new Set<string>([x.id]);
      const q = [x];
      let ends = x.end === true;
      for (let i = 0; i < q.length && !ends; i++) for (const t of exits(q[i] as RawNode)) {
        const y = by.get(t);
        if (!y || seen.has(t)) continue;
        seen.add(t); q.push(y);
        if (y.end === true) ends = true;
      }
      if (!ends) out.push(`${x.id}: шляху до end немає`);
    }
    return out;
  }
  const RAW = { 'ch2-plan': rawDlg('ch2-plan'), 'ch2-trail-forgotten': rawDlg('ch2-trail-forgotten'), 'ch2-trail-other': rawDlg('ch2-trail-other') };
  it('оракул: порушень нема; вузлів 8 + 7 + 7, у кожній сцені рівно один вибір', () => {
    for (const [name, d] of Object.entries(RAW)) {
      expect(problems(d), name).toEqual([]);
      expect(d.nodes.length, name).toBe(name === 'ch2-plan' ? 8 : 7);
      expect(d.nodes.filter((x) => x.choices).length, name).toBe(1);
    }
  });
  it('МУТАЦІЯ «зламано choices[].next» і «вузол без виходу» → оракул червоніє (текст порушення)', () => {
    const d = structuredClone(RAW['ch2-plan']);
    const first = ((d.nodes.find((x) => x.id === 'fork') as RawNode).choices as { next: string }[])[0];
    if (first) first.next = 'a-nowhere';
    expect(problems(d)[0]).toBe('fork: вибір веде на неіснуючий вузол «a-nowhere»');
    const e = structuredClone(RAW['ch2-trail-forgotten']);
    delete (e.nodes.find((x) => x.id === 's1') as RawNode).next;
    expect(problems(e)).toContain('s1: шляху до end немає');
  });
  const loaded = loadContent('content');
  it('справжній валідатор: чисто; МУТАЦІЯ choices[].next → DIALOGUE_REF_MISSING; без виходу → DIALOGUE_DEAD_END; довга репліка → DIALOGUE_LINE_TOO_LONG', () => {
    const codes = (c: unknown): string[] => (validate(c, { today: '2026-11-09' }) as { code: string; where: string }[]).filter((i) => SCENES.some((s) => i.where.startsWith(s))).map((i) => i.code);
    expect(codes(loaded.content)).toEqual([]);
    type C = { dialogues: { id: string; nodes: { id: string; choices?: { next: string }[]; next?: string }[] }[]; locales: Record<string, Record<string, string>> };
    const refMissing = structuredClone(loaded.content) as C;
    const pick = refMissing.dialogues.find((d) => d.id === PLAN_SCENE)?.nodes.find((x) => x.id === 'fork')?.choices?.[1];
    if (!pick) throw new Error('нема fork.choices[1]');
    pick.next = 'b-nowhere';
    expect(codes(refMissing)).toContain('DIALOGUE_REF_MISSING');
    const dead = structuredClone(loaded.content) as C;
    delete dead.dialogues.find((d) => d.id === OTHER.scene)?.nodes.find((x) => x.id === 'r2')?.next;
    expect(codes(dead)).toContain('DIALOGUE_DEAD_END');
    const long = structuredClone(loaded.content) as C;
    for (const l of Object.values(long.locales)) l['dlg.ch2-plan.agenda'] = 'Вікторія: «Довга-довга репліка, яка не поміститься у дві рядки рамки на телефоні, бо автор забув про межу в сто десять знаків».';
    expect(codes(long)).toContain('DIALOGUE_LINE_TOO_LONG');
  });
  it('тексти: кожен ключ сцен — у uk і en, немає ключа без пари, жодна репліка не довша за 110 знаків; ключові слова сцен на місці', () => {
    const keys = (l: Record<string, string>): string[] => Object.keys(l).filter((k) => SCENES.some((s) => k.startsWith(`${s}.`))).sort();
    expect(keys(ukC)).toEqual(keys(enC));
    for (const [name, d] of Object.entries(RAW)) for (const x of d.nodes) for (const k of [`dlg.${name}.${x.id}`, ...(x.choices ?? []).map((_, i) => `dlg.${name}.${x.id}.c${i + 1}`)]) {
      for (const [lang, l] of [['uk', ukC], ['en', enC]] as const) {
        const t = (l as Record<string, string>)[k];
        expect(t, `${lang}/${k}`).toBeTruthy();
        expect(Array.from(t as string).length, `${lang}/${k}`).toBeLessThanOrEqual(110);
      }
    }
    expect((ukC as Record<string, string>)['dlg.ch2-plan.sign']).toContain('Закрито після зсуву');
    expect((enC as Record<string, string>)['dlg.ch2-plan.sign']).toContain('Closed after the landslide');
    expect((ukC as Record<string, string>)['dlg.ch2-trail-forgotten.club']).toContain('Клубу мандрівників');
  });
});

// ───────────────────────── 3. Обидві гілки до кінця ─────────────────────────
describe('GAME-289 · обидві гілки до кінця: комбінація профіль × транспорт × тварина × погода × гілка × усі вибори вставки', () => {
  it('вибірка названа: комбінацій з enumerateCombos — 5 (як у валідаторі: 2 профілі; тварина лише в авто, сімейний профіль без велосипеда), погод 3', () => {
    process.stdout.write(`GAME-289 combos: ${COMBOS.length} (${COMBOS.map(comboName).join('; ')})\n`);
    expect(COMBOS.length).toBe(5);
    expect(WEATHERS.length).toBe(3);
  });
  let playthroughs = 0;
  const secs: number[] = [];
  const planPaths = new Set<string>();
  const trailPaths = new Set<string>();
  for (const combo of COMBOS) {
    it(`${comboName(combo)}: усі погоди × обидві гілки × обидва варіанти вставки — до ACTIVITY; сцена плану лишає в стані лише прапорці й квести гілки`, () => {
      for (const w of WEATHERS) {
        const m = morning2(w, combo);
        expect(planDue(m)).toBe(true);
        expect(liveSpot(m, PLAN_SPOT), 'табличка жива').toBe(true);
        expect(storyMoves(m, GAME_DEFS), 'до дотику сюжет нічого не шле').toEqual([]);
        for (const branch of [0, 1] as const) for (const pick of [0, 1]) {
          const r = fullBranch(m, branch, pick);
          playthroughs++;
          secs.push(r.seconds);
          planPaths.add(r.planNodes.join('>'));
          trailPaths.add(`${branch}:${r.trailNodes.join('>')}`);
          // стан: від ранку змінилось лише це (прапорець таблички, квести плану/гілки/ACTIVITY, журнал, час, позиція, сліди команд)
          const diff = Object.keys(r.sim.game).filter((k) => !['processed', 'seq', 'dialogue', 'quests', 'flags', 'player', 'progress', 'grants', 'inventory', 'skills', 'practice', 'stickers', 'friend', 'moneyCents', 'wave', 'gear'].includes(k) && JSON.stringify((r.sim.game as unknown as Record<string, unknown>)[k]) !== JSON.stringify((m.game as unknown as Record<string, unknown>)[k]));
          expect(diff, 'сцени не чіпають решту стану').toEqual([]);
          expect(r.sim.game.flags.filter((f) => !m.game.flags.includes(f)).sort(), 'нові прапорці: табличка й (лише для «з Інгрід») вибір').toEqual((branch === 0 ? [FORK_FLAG, PLAN_FLAG] : [PLAN_FLAG]).sort());
          expect(r.sim.game.inventory, 'речей сцени не дають').toEqual(m.game.inventory);
          expect(r.sim.game.moneyCents, 'грошей сцени не дають').toBe(m.game.moneyCents);
          expect(planFinishMove(r.sim)).toBeNull();
          expect(trailFinishMove(r.sim)).toBeNull();
        }
      }
    });
  }
  it('підсумок вибірки: проходжень усього — 5 × 3 × 2 × 2 = 60; шляхів сцени плану 2 (a1 / b1), вставок — 4 різних; час гравця за моделлю — число', () => {
    expect(playthroughs).toBe(COMBOS.length * 3 * 2 * 2);
    expect(planPaths.size, 'сцена плану: обидві гілки мають різні вузли a1/b1').toBe(2);
    expect([...planPaths].sort()).toEqual(['open>agenda>sign>fork>go>a1>close', 'open>agenda>sign>fork>go>b1>close']);
    expect(trailPaths.size).toBe(4);
    const lo = Math.min(...secs);
    const hi = Math.max(...secs);
    process.stdout.write(`GAME-289 model seconds (sign + choice + walk + insert): min ${lo}, max ${hi}; ${playthroughs} playthroughs\n`);
    expect(lo).toBeGreaterThan(20);
    expect(hi).toBeLessThan(120);
  });
});

// ───────────────────────── 4. Softlock 0: перебір ходів від ранку дня 2 ─────────────────────────
describe('GAME-289 · softlock 0: повний перебір ходів (moves() — ті самі, що в бота) від ранку дня 2 і від кожної гілки', () => {
  const ALLOWED = new Set(['Visit', 'Sleep', 'Talk', 'Choose', 'Continue', 'CompleteQuest', 'DeclineQuest']);
  const key = (g: GameState): string => stateHash(exploreView(g, STORY));
  interface Explored { readonly states: number; readonly softlock: string[]; readonly waterfall: boolean; readonly evening: boolean }
  /** Перебір усіх досяжних станів; кінець — день 2 завершено (EVENING активний); softlock — стан, з якого кінця не досягти. */
  function explore(start: GameState): Explored {
    const idx = new Map<string, number>([[key(start), 0]]);
    const states: GameState[] = [start];
    const back: number[][] = [[]];   // ребра навпаки
    const goal = new Set<number>();
    let waterfall = false;
    for (let i = 0; i < states.length; i++) {
      const s = states[i] as GameState;
      if (s.quests[WATERFALL]?.status === 'active') waterfall = true;
      if (s.quests[EVENING]?.status === 'active') { goal.add(i); continue; }   // кінець дня 2: далі не розгортаємо
      for (const m of moves(s, GAME_DEFS)) {
        if (!ALLOWED.has(m.type)) continue;
        const r = dispatch(s, { ...m, commandId: `x289-${n++}` } as Command, GAME_DEFS);
        if (!r.ok) continue;
        const k = key(r.state);
        let j = idx.get(k);
        if (j === undefined) { j = states.length; idx.set(k, j); states.push(r.state); back.push([]); }
        (back[j] as number[]).push(i);
      }
      if (states.length > 50_000) throw new Error('простір станів вибухнув');
    }
    const ok = new Set<number>(goal);
    const stack = [...goal];
    for (let i = stack.pop(); i !== undefined; i = stack.pop()) for (const p of back[i] as number[]) if (!ok.has(p)) { ok.add(p); stack.push(p); }
    const softlock = states.flatMap((s, i) => (ok.has(i) ? [] : [JSON.stringify(Object.entries(s.quests).filter(([, q]) => q.status === 'active').map(([id]) => id))]));
    return { states: states.length, softlock, waterfall, evening: goal.size > 0 };
  }
  const total = { states: 0, runs: 0 };
  for (const combo of COMBOS) {
    it(`${comboName(combo)}: від ранку дня 2 (обидві гілки в ☰ і сцені) і від кожної гілки окремо: водоспад досяжний, softlock 0`, () => {
      const m = morning2('sunny', combo);
      const fromMorning = explore(m.game);
      expect(fromMorning.softlock, 'softlock від ранку').toEqual([]);
      expect(fromMorning.waterfall && fromMorning.evening).toBe(true);
      total.states += fromMorning.states; total.runs++;
      for (const b of TRAIL_BRANCHES) {
        const picked = run(m, { type: 'CompleteQuest', questId: PLAN_QUEST, to: b.quest });
        const e = explore(picked.game);
        expect(e.softlock, `softlock у гілці ${b.quest}`).toEqual([]);
        expect(e.waterfall, `гілка ${b.quest} доходить до ${WATERFALL}`).toBe(true);
        total.states += e.states; total.runs++;
        // і гілка, обрана в сцені (а не в ☰): та сама точка
        const viaScene = fullBranch(m, b === FORGOTTEN ? 0 : 1, 0).sim.game;
        const e2 = explore(viaScene);
        expect(e2.softlock).toEqual([]);
        expect(e2.waterfall).toBe(true);
        total.states += e2.states; total.runs++;
      }
    }, 120_000);
  }
  it('число: скільки станів і перебірів пройдено (у описі PR)', () => {
    process.stdout.write(`GAME-289 exhaustive: ${total.runs} explorations, ${total.states} states, softlock 0\n`);
    expect(total.runs).toBe(COMBOS.length * 5);
  });
  it('МУТАЦІЯ «гілка без виходу»: гілка без переходів — перебір знаходить softlock і недосяжний водоспад (сторож уміє червоніти)', () => {
    const m = morning2('sunny');
    const st = GAME_DEFS.story as unknown as { quests: Record<string, { transitions: unknown[] }> };
    const real = st.quests[FORGOTTEN.quest] as { transitions: unknown[] };
    const saved = real.transitions;
    try {
      real.transitions = [];
      const picked = run(m, { type: 'CompleteQuest', questId: PLAN_QUEST, to: FORGOTTEN.quest });
      const e = explore(picked.game);
      expect(e.softlock.length, 'стан із гілкою без виходу — softlock').toBeGreaterThan(0);
      expect(e.waterfall).toBe(false);
      process.stdout.write(`GAME-289 mutation exhaustive: softlock states ${e.softlock.length}, e.g. ${e.softlock[0]}\n`);
    } finally { real.transitions = saved; }
  });
});

// ───────────────────────── 5. Межі: розділ 1, ворота дня, ☰ без таблички ─────────────────────────
describe('GAME-289 · розділ 1 цього не бачить; табличка лише на дні 2; хто обрав гілку в ☰ — нічого не втрачає', () => {
  it('у розділі 1 (кінець, дорога додому) табличка мертва, три сцени — відмова ядра, moves() не пропонує StartScene, режисер мовчить', () => {
    for (const sim of [base, onRoadHome()]) {
      expect(planDue(sim)).toBe(false);
      for (const spot of [PLAN_SPOT, ...TRAIL_BRANCHES.map((b) => b.spot)]) { expect(liveSpot(sim, spot), spot).toBe(false); expect(spotMove(sim, spot), spot).toBeNull(); }
      expect(storyMoves(sim, GAME_DEFS)).toEqual([]);
      for (const sc of SCENES) expect(refused(sim, { type: 'StartScene', sceneId: sc, facts: [] }), sc).toBe('QUEST_NOT_ACTIVE');
      expect(refused(sim, { type: 'StartScene', sceneId: PLAN_SCENE, facts: [PLAN_FLAG] })).toBe('QUEST_NOT_ACTIVE');
      expect(moves(sim.game, GAME_DEFS).some((m) => m.type === 'StartScene')).toBe(false);
    }
  });
  it('день 1 (навіть уночі, коли квест плану вже активний): ворота дня 2 зачинені — табличка мертва, сцена QUEST_NOT_YET; вранці — жива', () => {
    let s: SimState = { ...base, worldSeed: seedFor('sunny') };
    const go = (m: object): void => { s = run(s, m); };
    go({ type: 'StartChapter2' }); go({ type: 'Visit', locationId: 'loc.road' }); s = settle(s); go({ type: 'Visit', locationId: 'loc.camp.mullerthal' }); s = settle(s);
    go({ type: 'Talk', npcId: 'npc.host-mullerthal' }); go({ type: 'Choose', choice: 0 }); go({ type: 'Choose', choice: 1 }); go({ type: 'Continue' });
    go({ type: 'CompleteQuest', questId: CHAPTER2_START }); go({ type: 'Visit', locationId: 'loc.trail.official' }); s = settle(s);
    go({ type: 'CompleteQuest', questId: 'CH2-D1-WALK-001' }); go({ type: 'Visit', locationId: 'loc.camp.mullerthal' }); s = settle(s);
    s = { ...s, clock: advance(s.clock, Math.max(0, clockEv.minutes - s.clock.minutes) + 60 * 3 + 30) };   // 22:30 дня 1
    s = direct(s).sim;   // ніч — кінець вечора, сюжет закриває день-квест вечора, квест плану стає активним
    expect(s.game.quests[PLAN_QUEST]?.status).toBe('active');
    expect(questOpen(STORY, s.game, PLAN_QUEST, s.clock.minutes), 'ворота дня 2 зачинені').toBe(false);
    expect(planDue(s)).toBe(false);
    expect(liveSpot(s, PLAN_SPOT)).toBe(false);
    expect(refused(s, { type: 'StartScene', sceneId: PLAN_SCENE, facts: [PLAN_FLAG] })).toBe('QUEST_NOT_YET');
    s = run(s, { type: 'Sleep' });
    expect(planDue(s), 'після сну — ранок дня 2').toBe(true);
  });
  it('вказівники німі не на своєму етапі: до вибору, чужа стежка, після вставки; сцена плану не повторюється; табличка гасне після сцени', () => {
    const m = morning2('rain');
    for (const b of TRAIL_BRANCHES) { expect(spotMove(m, b.spot), `до вибору ${b.spot} німий`).toBeNull(); expect(liveSpot(m, b.spot)).toBe(false); expect(trailDue(m, b)).toBe(false); }
    const f = fullBranch(m, 0, 0);
    expect(planPlayed(f.sim)).toBe(true);
    expect(liveSpot(f.sim, PLAN_SPOT), 'табличка погасла').toBe(false);
    expect(spotMove(f.sim, PLAN_SPOT)).toBeNull();
    expect(refused(f.sim, { type: 'StartScene', sceneId: PLAN_SCENE, facts: [PLAN_FLAG] }), 'квест плану завершено').toBe('QUEST_NOT_ACTIVE');
    // «інший шлях» не відкриває вставку забутої стежки: чужа сцена — відмова ядра, чужий вказівник німий
    const other = run(m, { type: 'CompleteQuest', questId: PLAN_QUEST, to: OTHER.quest });
    expect(spotMove(other, FORGOTTEN.spot)).toBeNull();
    expect(refused(other, { type: 'StartScene', sceneId: FORGOTTEN.scene, facts: [] })).toBe('QUEST_NOT_ACTIVE');
    // і не поза Мюллерталем: вказівник — об'єкт мапи кемпінгу
    const away = settle(run(other, { type: 'Visit', locationId: 'loc.road' }));
    expect(liveSpot(away, OTHER.spot), 'на дорозі вказівника нема').toBe(false);
  });
  it('☰ без таблички: обрав гілку кнопкою — табличка гасне, вставка на вказівнику грається (без згадки таблички), прапорців нема, нічого не втрачено', () => {
    for (const b of TRAIL_BRANCHES) {
      const m = morning2('sunny');
      const s = run(m, { type: 'CompleteQuest', questId: PLAN_QUEST, to: b.quest });
      expect(s.game.flags).not.toContain(PLAN_FLAG);
      expect(s.game.flags).not.toContain(FORK_FLAG);
      expect(planDue(s), 'план закрито — табличка німа').toBe(false);
      expect(direct(s).sent, 'сюжет нічого не шле: вставка — за дотиком').toEqual([]);
      const r = readScene(run(s, spotMove(s, b.spot) as object), b.scene, () => 0);
      expect(r.nodes.slice(0, 2), 'таблички не читали — вставка її не згадує').toEqual(b === FORGOTTEN ? ['open', 'club'] : ['open', 'hint']);
      const e = direct(r.sim);
      expect(e.sent).toEqual([{ type: 'CompleteQuest', questId: b.quest }]);
      expect(e.sim.game.quests[ACTIVITY]?.status).toBe('active');
    }
  });
  it('гравець зберігся посеред сцени-вставки → завантаження живе, сцена дограється до кінця', () => {
    const m = morning2('sunny');
    let s = run(m, { type: 'CompleteQuest', questId: PLAN_QUEST, to: FORGOTTEN.quest });
    s = run(s, spotMove(s, FORGOTTEN.spot) as object);
    s = run(s, { type: 'Continue' });
    const l = fromSave(serialize(s), { story: STORY });
    if (!l.ok) throw new Error(`${l.code} ${l.detail}`);
    expect(l.sim.game.dialogue).toEqual(s.game.dialogue);
    const r = readScene(l.sim, FORGOTTEN.scene, () => 1);
    expect(r.sim.game.dialogue).toBeNull();
    expect(direct(r.sim).sim.game.quests[ACTIVITY]?.status).toBe('active');
  });
});

// ───────────────────────── 6. Сейв і фікстура ─────────────────────────
describe('GAME-289 · сейв < 500 КБ і фікстура для e2e (tests/e2e/fixtures/ch2-plan.json)', () => {
  it('сейв після обох гілок: < 500 КБ (число — в описі PR), завантажується, круг стабільний', () => {
    for (const branch of [0, 1] as const) {
      const f = fullBranch(morning2('sunny'), branch, 0);
      const json = serialize(f.sim);
      const bytes = new TextEncoder().encode(json).length;
      process.stdout.write(`GAME-289 save bytes after branch ${branch}: ${bytes}\n`);
      expect(bytes).toBeLessThan(500 * 1024);
      const l = fromSave(json, { story: STORY });
      if (!l.ok) throw new Error(`${l.code} ${l.detail}`);
      expect(l.sim.game.quests[ACTIVITY]?.status).toBe('active');
      expect(serialize(l.sim)).toBe(json);
    }
  });
  const file = new URL('../../tests/e2e/fixtures/ch2-plan.json', import.meta.url);
  it('сейв = те, що ядро збирає зараз; G289_WRITE=1 переписує', () => {
    n = 950_000;   // ідентифікатори команд у сейві не залежать від порядку інших тестів
    const json = `${serialize(morning2('sunny'))}\n`;
    if (process.env.G289_WRITE === '1') { writeFileSync(file, json); return; }
    expect(existsSync(file), 'немає фікстури: G289_WRITE=1').toBe(true);
    expect(readFileSync(file, 'utf8'), 'фікстура розійшлась із ядром').toBe(json);
    const l = fromSave(json, { story: STORY });
    if (!l.ok) throw new Error(`${l.code} ${l.detail}`);
    expect(planDue(l.sim), 'у сейві табличка жива').toBe(true);
  });
});

describe('GAME-289 · вказівники стежок на мапі Мюллерталя', () => {
  interface Tmj { layers: { name: string; objects?: { name: string; type: string }[] }[] }
  const map = JSON.parse(readFileSync(new URL('../../public/maps/mullerthal.tmj', import.meta.url), 'utf8')) as Tmj;
  it('табличка (офіційна стежка) і вказівники двох гілок — по одному тригеру на мапі; назви збігаються з PLAN_SPOT і TRAIL_BRANCHES[].spot', () => {
    for (const name of [PLAN_SPOT, ...TRAIL_BRANCHES.map((b) => b.spot)]) {
      const objs = (map.layers.find((l) => l.name === 'objects')?.objects ?? []).filter((o) => o.name === name);
      expect(objs, name).toHaveLength(1);
      expect(objs[0]?.type, name).toBe('trigger');
    }
  });
});

describe('GAME-289 · сцени у даних', () => {
  it('кожна сцена — сцена свого квесту; сцена плану має єдиний факт на старті f.trail-official-closed (вибір ставить сама відповідь), вставки — без фактів', () => {
    expect(GAME_DEFS.story?.dialogues[PLAN_SCENE]?.scene).toEqual({ facts: [PLAN_FLAG], atQuest: PLAN_QUEST });
    expect(GAME_DEFS.story?.dialogues[FORGOTTEN.scene]?.scene).toEqual({ facts: [], atQuest: FORGOTTEN.quest });
    expect(GAME_DEFS.story?.dialogues[OTHER.scene]?.scene).toEqual({ facts: [], atQuest: OTHER.quest });
    expect(dispatch(ch1End().game, cmdOf({ type: 'StartScene', sceneId: FORGOTTEN.scene, facts: [PLAN_FLAG] }), GAME_DEFS).ok, 'стартер не вигадає факт').toBe(false);
  });
});
