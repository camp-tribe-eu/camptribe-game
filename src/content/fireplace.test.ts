// GAME-142 · «Вогнище кінця дня 2» (R1-02) на справжньому контенті, через ядро (dispatch / sim.step).
// Спосіб перевірки картки:
//  1) обидві гілки A і B досяжні; без фото — варіанти реплік 6 і 12 без фото;
//  2) вогнище не дозволене або вечеря не завершена — той самий вечір під навісом із ліхтарем.
// Повний перебір: вогнище × вечеря × фото × A/B = 16 проходжень, кожне — точна послідовність вузлів від старту до кінця.
// Закон 1: оракул має негативні контролі — мутований контент («фото без факту», «умову вогнища прибрано») мусить червоніти.
import { describe, expect, it } from 'vitest';
import { dispatch, nextCommandId, type Command } from '../core/commands';
import type { CoreDefs } from '../core/defs';
import { newSim, step } from '../core/sim';
import { initialState, type GameState } from '../core/state';
import flags from '../../content/flags.json';
import en from '../../content/locales/en.json';
import uk from '../../content/locales/uk.json';
import { FIREPLACE_FACTS, FIREPLACE_SCENE, fireplaceFacts, startFireplace, type FireplaceSetup } from './fireplace';
import { GAME_DEFS } from './slice-defs';
import { CONTENT, compileStory, type RawContent } from './story';

const RAW = CONTENT.dialogues.find((d) => d.id === FIREPLACE_SCENE) as RawContent['dialogues'][number];
const UK = uk as Record<string, string>;
const EN = en as Record<string, string>;

/** Створити персонажа (родина, авто, кішка) — сцені більше нічого не треба. */
function fresh(defs: CoreDefs): GameState {
  const r = dispatch(initialState(5_000), { type: 'CreateCharacter', commandId: 'c0', profileId: 'profile.family-teen', transportId: 'transport.car', animalId: 'animal.cat' }, defs);
  if (!r.ok) throw new Error(`CreateCharacter: ${r.code}`);
  return r.state;
}

const FIRE_QUEST = 'CH1-D2-FIRE-001';
/** Стан на своєму етапі (GAME-141): CH1-D2-FIRE-001 активний — єдине місце, де сцену вогнища дозволено починати. */
const atFireQuest = (s: GameState): GameState => ({ ...s, quests: { ...s.quests, [FIRE_QUEST]: { status: 'active', done: [] } } });

/** Провести сцену ядром: «Далі», доки є next; на вузлі з вибором — A (0) чи B (1). Повертає вузли по черзі. */
function play(defs: CoreDefs, setup: FireplaceSetup, pick: 0 | 1): string[] {
  let s = atFireQuest(fresh(defs));
  const send = (cmd: Command) => {
    const r = dispatch(s, cmd, defs);
    if (!r.ok) throw new Error(`${cmd.type}: ${r.code}`);
    s = r.state;
  };
  send(startFireplace(nextCommandId(s), setup));
  const path: string[] = [];
  for (let guard = 0; s.dialogue; guard++) {
    if (guard > 50) throw new Error('сцена не закінчується');
    expect(s.dialogue.id).toBe(FIREPLACE_SCENE);
    path.push(s.dialogue.node);
    const node = defs.story?.dialogues[FIREPLACE_SCENE]?.nodes[s.dialogue.node];
    send(node?.choices ? { type: 'Choose', commandId: nextCommandId(s), choice: pick } : { type: 'Continue', commandId: nextCommandId(s) });
  }
  return path;
}

/** Оракул картки — незалежно від графа: яку послідовність вузлів мусить показати гра за цих фактів і вибору. */
function expected(setup: FireplaceSetup, pick: 0 | 1): string[] {
  const opening = setup.fireAllowed && setup.dinnerDone ? ['fire'] : ['lantern', 'lantern-george'];
  const six = setup.photoTaken ? 'l6-photo' : 'l6-plain';
  const head = ['open', ...opening, 'l1', 'l2', 'l3', 'l4', 'l5', six, 'l7'];
  return pick === 0
    ? [...head, 'l8', 'l9', 'l10', 'l11', setup.photoTaken ? 'l12-photo' : 'l12-plain']
    : [...head, 'b1', 'b2', 'b3'];
}

const bools = [false, true] as const;
const COMBOS = bools.flatMap((fireAllowed) => bools.flatMap((dinnerDone) => bools.flatMap((photoTaken) =>
  ([0, 1] as const).map((pick) => ({ setup: { fireAllowed, dinnerDone, photoTaken }, pick })))));
const label = (c: (typeof COMBOS)[number]) => `вогнище ${c.setup.fireAllowed ? 'так' : 'ні'} · вечеря ${c.setup.dinnerDone ? 'так' : 'ні'} · фото ${c.setup.photoTaken ? 'так' : 'ні'} · ${c.pick === 0 ? 'A' : 'B'}`;

/** Усі розбіжності гри з оракулом на 16 комбінаціях (порожньо — збіг). */
function mismatches(defs: CoreDefs): string[] {
  return COMBOS.flatMap((c) => {
    let got: string[];
    try { got = play(defs, c.setup, c.pick); } catch (e) { return [`${label(c)}: ${String(e)}`]; }
    const want = expected(c.setup, c.pick);
    return JSON.stringify(got) === JSON.stringify(want) ? [] : [`${label(c)}: ${got.join('→')} ≠ ${want.join('→')}`];
  });
}

/** Контент зі зміненою сценою — для негативних контролів (закон 1). */
function mutated(patch: (nodes: Record<string, unknown>[]) => void): CoreDefs {
  const c = structuredClone(CONTENT);
  const d = c.dialogues.find((x) => x.id === FIREPLACE_SCENE) as RawContent['dialogues'][number];
  patch(d.nodes as unknown as Record<string, unknown>[]);
  return { ...GAME_DEFS, story: compileStory(c) };
}
const nodeOf = (nodes: Record<string, unknown>[], id: string) => nodes.find((n) => n.id === id) as Record<string, unknown>;

describe('GAME-142 · вогнище кінця дня 2: 16 проходжень через ядро', () => {
  it.each(COMBOS.map((c) => [label(c), c] as const))('%s — рівно ті вузли, яких вимагає картка', (_, c) => {
    expect(play(GAME_DEFS, c.setup, c.pick)).toEqual(expected(c.setup, c.pick));
  });

  it('п.1: обидві гілки досяжні, і без фото жодна репліка не згадує зроблене фото', () => {
    const seen = new Set(COMBOS.flatMap((c) => play(GAME_DEFS, c.setup, c.pick)));
    for (const id of ['l8', 'l12-photo', 'l12-plain', 'b1', 'b3', 'l6-photo', 'l6-plain', 'fire', 'lantern']) expect(seen.has(id), id).toBe(true);
    // Кожен вузол сцени показано хоч в одній комбінації — мертвих реплік немає.
    expect([...seen].sort()).toEqual(RAW.nodes.map((n) => n.id).sort());
    for (const c of COMBOS.filter((x) => !x.setup.photoTaken)) {
      const lines = play(GAME_DEFS, c.setup, c.pick).map((id) => UK[`${FIREPLACE_SCENE}.${id}`] ?? '');
      expect(lines.filter((t) => /зробив фото|це фото/.test(t)), label(c)).toEqual([]);
    }
  });

  it('п.2: без вогнища чи без вечері — ліхтар під навісом, і жодного вогнища', () => {
    for (const c of COMBOS) {
      const path = play(GAME_DEFS, c.setup, c.pick);
      const fire = c.setup.fireAllowed && c.setup.dinnerDone;
      expect(path.includes('fire'), label(c)).toBe(fire);
      expect(path.includes('lantern'), label(c)).toBe(!fire);
    }
  });

  it('негативний контроль п.1: репліку з фото показано без факту фото → оракул червоніє', () => {
    const defs = mutated((nodes) => { nodeOf(nodes, 'l5').next = 'l6-photo'; nodeOf(nodes, 'l11').next = 'l12-photo'; });
    expect(mismatches(defs).length).toBeGreaterThan(0);
    expect(mismatches(defs).filter((m) => m.includes('фото ні'))).toHaveLength(8);
  });

  it('негативний контроль п.2: умову вогнища прибрано (вогнище завжди) → оракул червоніє', () => {
    const defs = mutated((nodes) => { nodeOf(nodes, 'open').next = 'fire'; });
    expect(mismatches(defs).filter((m) => m.includes('вогнище ні') || m.includes('вечеря ні'))).toHaveLength(12);
  });

  it('негативний контроль п.2: лишилась одна умова з двох (лише «вогнище дозволене») → оракул червоніє', () => {
    const defs = mutated((nodes) => { nodeOf(nodes, 'open').branches = [{ when: { flag: 'f.fire-allowed' }, next: 'fire' }]; });
    expect(mismatches(defs).filter((m) => m.includes('вогнище так · вечеря ні'))).toHaveLength(4);
  });

  it('позитивний контроль: справжній контент — нуль розбіжностей', () => {
    expect(mismatches(GAME_DEFS)).toEqual([]);
  });
});

describe('GAME-142 · команда StartScene і точка старту для GAME-141', () => {
  it('факти помічника — рівно scene.facts сцени, і кожен зареєстровано bool у content/flags.json', () => {
    expect(Object.values(FIREPLACE_FACTS).sort()).toEqual([...(RAW.scene?.facts ?? [])].sort());
    for (const f of Object.values(FIREPLACE_FACTS)) expect(flags.find((r) => r.id === f)?.type, f).toBe('bool');
    expect(fireplaceFacts({ fireAllowed: true, dinnerDone: false, photoTaken: true })).toEqual(['f.fire-allowed', 'f.fire-photo-tent']);
  });

  it('ядро не приймає вигаданого факту, чужого діалогу чи старту посеред розмови', () => {
    const s = atFireQuest(fresh(GAME_DEFS));
    const bad = dispatch(s, { type: 'StartScene', commandId: 'x1', sceneId: FIREPLACE_SCENE, facts: ['f.road-apple'] }, GAME_DEFS);
    expect(bad.ok ? 'ok' : bad.code).toBe('INVALID_CHOICE');
    expect(bad.state.flags).not.toContain('f.road-apple');
    const npc = dispatch(s, { type: 'StartScene', commandId: 'x2', sceneId: 'dlg.elise-greeting' }, GAME_DEFS);
    expect(npc.ok ? 'ok' : npc.code).toBe('UNKNOWN_TARGET');
    const open = dispatch(s, startFireplace('x3', { fireAllowed: false, dinnerDone: false, photoTaken: false }), GAME_DEFS);
    expect(open.ok).toBe(true);
    const twice = dispatch(open.state, startFireplace('x4', { fireAllowed: true, dinnerDone: true, photoTaken: false }), GAME_DEFS);
    expect(twice.ok ? 'ok' : twice.code).toBe('IN_DIALOGUE');
  });

  it('через симуляцію (sim.step), як стартуватиме гачок кінця дня: сцена відкривається й закривається', () => {
    let sim = newSim(20261024, 5_000);
    const ctx = { defs: GAME_DEFS };
    sim = step(sim, { kind: 'command', command: { type: 'CreateCharacter', commandId: nextCommandId(sim.game), profileId: 'profile.family-teen', transportId: 'transport.car', animalId: 'animal.cat' } }, ctx);
    sim = { ...sim, game: atFireQuest(sim.game) };
    sim = step(sim, { kind: 'command', command: startFireplace(nextCommandId(sim.game), { fireAllowed: true, dinnerDone: true, photoTaken: false }) }, ctx);
    expect(sim.game.dialogue).toEqual({ id: FIREPLACE_SCENE, node: 'open' });
    for (let i = 0; i < 50 && sim.game.dialogue; i++) {
      const node = GAME_DEFS.story?.dialogues[FIREPLACE_SCENE]?.nodes[sim.game.dialogue.node];
      sim = step(sim, { kind: 'command', command: node?.choices ? { type: 'Choose', commandId: nextCommandId(sim.game), choice: 1 } : { type: 'Continue', commandId: nextCommandId(sim.game) } }, ctx);
    }
    expect(sim.game.dialogue).toBeNull();
    expect(sim.game.flags).toEqual(expect.arrayContaining(['f.fire-allowed', 'f.fire-dinner-done']));
    expect(sim.game.flags).not.toContain('f.fire-photo-tent');
  });

  it('GAME-141: StartScene вогнища законний лише на CH1-D2-FIRE-001 — до нього й після кінця розділу відмова, без змін стану', () => {
    const start = (s: GameState) => dispatch(s, startFireplace('z1', { fireAllowed: true, dinnerDone: true, photoTaken: false }), GAME_DEFS);
    const before = fresh(GAME_DEFS);
    const early = start(before);
    expect(early.ok ? 'ok' : early.code).toBe('QUEST_NOT_ACTIVE');
    expect(early.state.dialogue).toBeNull();
    expect(early.state.flags).toEqual(before.flags);
    const camp = start({ ...before, quests: { ...before.quests, 'CH1-D2-CAMP-001': { status: 'active', done: [] } } });
    expect(camp.ok ? 'ok' : camp.code).toBe('QUEST_NOT_ACTIVE');
    const finished = start({ ...before, campaignEnded: true, quests: { ...before.quests, [FIRE_QUEST]: { status: 'completed', done: ['evening'] } } });
    expect(finished.ok ? 'ok' : finished.code).toBe('QUEST_NOT_ACTIVE');
    const endedOnly = start({ ...atFireQuest(before), campaignEnded: true });
    expect(endedOnly.ok ? 'ok' : endedOnly.code).toBe('QUEST_NOT_ACTIVE');
    expect(start(atFireQuest(before)).ok).toBe(true);
  });

  it('GAME-141: прийнятий StartScene — у журналі (тип StartScene, ref — сцена); відмова — ні', () => {
    const ctx = { defs: GAME_DEFS };
    let sim = newSim(20261025, 5_000);
    sim = step(sim, { kind: 'command', command: { type: 'CreateCharacter', commandId: nextCommandId(sim.game), profileId: 'profile.family-teen', transportId: 'transport.car', animalId: 'animal.cat' } }, ctx);
    const n = sim.journal.length;
    sim = step(sim, { kind: 'command', command: startFireplace(nextCommandId(sim.game), { fireAllowed: true, dinnerDone: true, photoTaken: false }) }, ctx);
    expect(sim.journal).toHaveLength(n);
    expect(sim.game.dialogue).toBeNull();
    sim = { ...sim, game: atFireQuest(sim.game) };
    sim = step(sim, { kind: 'command', command: startFireplace(nextCommandId(sim.game), { fireAllowed: true, dinnerDone: true, photoTaken: false }) }, ctx);
    expect(sim.journal.slice(n).map((e) => [e.type, e.ref])).toEqual([['StartScene', FIREPLACE_SCENE]]);
  });

  it('GAME-141: мутація «сцена законна всюди» (atQuest прибрано) → тести законності червоніють', () => {
    const c = structuredClone(CONTENT);
    delete ((c.dialogues.find((x) => x.id === FIREPLACE_SCENE) as RawContent['dialogues'][number]).scene as { atQuest?: string }).atQuest;
    const defs: CoreDefs = { ...GAME_DEFS, story: compileStory(c) };
    const r = dispatch(fresh(defs), startFireplace('m1', { fireAllowed: true, dinnerDone: true, photoTaken: false }), defs);
    expect(r.ok).toBe(true); // у справжньому контенті тут була б відмова QUEST_NOT_ACTIVE — отже оракул «до етапу» вміє червоніти
    expect(RAW.scene?.atQuest).toBe(FIRE_QUEST);
  });

  it('тексти: кожна репліка є в uk і en, не довша за 140 знаків', () => {
    const keys = [RAW.scene?.titleKey, ...RAW.nodes.flatMap((n) => [n.id, ...((n as { choices?: unknown[] }).choices ?? []).map((_, i) => `${n.id}.c${i + 1}`)].map((k) => `${FIREPLACE_SCENE}.${k}`))].filter((k): k is string => !!k);
    for (const k of keys) {
      for (const dict of [UK, EN]) {
        expect(dict[k], k).toBeTruthy();
        expect((dict[k] ?? '').length, k).toBeLessThanOrEqual(140);
      }
    }
  });
});
