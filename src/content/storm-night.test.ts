// GAME-312 · ніч із бурею: кожна місія щось у ній змінює. Розірви зв'язок — і тест червоніє (закон 1).
import { describe, expect, it } from 'vitest';
import { dispatch, nextCommandId, type Command } from '../core/commands';
import type { CoreDefs } from '../core/defs';
import { initialState, type GameState } from '../core/state';
import flagsJson from '../../content/flags.json';
import { GAME_DEFS } from './slice-defs';
import { CONTENT } from './story';
import { MISSIONS, type MissionDef } from './missions';
import { STORM_FACTS, STORM_SCENE, startStormNight, stormFacts } from './storm-night';

const RAW = CONTENT.dialogues.find((d) => d.id === STORM_SCENE) as unknown as {
  scene: { facts: string[] };
  nodes: { id: string; branches?: { when: { flag?: string } }[] }[];
};

function fresh(defs: CoreDefs = GAME_DEFS): GameState {
  const r = dispatch(initialState(5_000), { type: 'CreateCharacter', commandId: 'c0', profileId: 'profile.family-teen', transportId: 'transport.car', animalId: 'animal.cat' }, defs);
  if (!r.ok) throw new Error(`CreateCharacter: ${r.code}`);
  return r.state;
}

/** Провести ніч ядром: «Далі», доки є next; на вузлі з вибором — перший варіант. Повертає пройдені вузли. */
function playNight(flags: readonly string[]): string[] {
  let s = fresh();
  const send = (cmd: Command): void => {
    const r = dispatch(s, cmd, GAME_DEFS);
    if (!r.ok) throw new Error(`${cmd.type}: ${r.code}`);
    s = r.state;
  };
  send(startStormNight(nextCommandId(s), flags));
  const path: string[] = [];
  for (let guard = 0; s.dialogue; guard++) {
    if (guard > 60) throw new Error('ніч не закінчується');
    path.push(s.dialogue.node);
    const node = GAME_DEFS.story?.dialogues[STORM_SCENE]?.nodes[s.dialogue.node];
    send(node?.choices ? { type: 'Choose', commandId: nextCommandId(s), choice: 0 } : { type: 'Continue', commandId: nextCommandId(s) });
  }
  return path;
}

describe('GAME-312 · ніч із бурею бачить, що зроблено вдень', () => {
  it('день без місій — ніч без жодного полегшення', () => {
    expect(stormFacts([])).toEqual([]);
    const path = playNight([]);
    expect(path).toContain('dark');
    expect(path).toContain('fire-wet');
    expect(path).toContain('supper-plain');
    expect(path).toContain('light-none');
    expect(path[path.length - 1]).toBe('close-end');
  });

  it('кожна здана місія міняє свій шматок ночі', () => {
    expect(stormFacts(['f.mis-aerial-done'])).toEqual([STORM_FACTS.warned]);
    expect(stormFacts(['f.mis-ring-done'])).toEqual([STORM_FACTS.fishSupper]);
    expect(stormFacts(['f.mis-lantern-done'])).toEqual([STORM_FACTS.dryWood]);
    expect(playNight(['f.mis-aerial-done'])).toContain('warned');
    expect(playNight(['f.mis-ring-done'])).toContain('supper-fish');
    expect(playNight(['f.mis-lantern-done'])).toContain('fire-dry');
  });

  it('ціна вибору всередині місії теж доживає до ночі', () => {
    expect(stormFacts(['f.mis-aerial-done', 'f.mis-aerial-quick'])).toEqual([STORM_FACTS.warned, STORM_FACTS.radioWeak]);
    expect(playNight(['f.mis-aerial-done', 'f.mis-aerial-quick'])).toContain('close-radio');
    expect(playNight(['f.mis-ring-done', 'f.mis-ring-slow'])).toContain('close-late');
    expect(playNight(['f.mis-lantern-done', 'f.mis-lantern-taught'])).toContain('light-boy');
  });

  it('усі три місії — ніч, до якої готувались', () => {
    const all = MISSIONS.map((m) => m.doneFlag);
    expect(stormFacts(all)).toEqual([STORM_FACTS.warned, STORM_FACTS.fishSupper, STORM_FACTS.dryWood]);
    const path = playNight(all);
    for (const n of ['warned', 'ready', 'fire-dry', 'supper-fish', 'close-end']) expect(path, n).toContain(n);
    expect(path).not.toContain('dark');
  });

  it('факти сцени, реєстр і модуль — один і той самий перелік', () => {
    expect(RAW.scene.facts).toEqual(Object.values(STORM_FACTS));
    const reg = new Set((flagsJson as { id: string }[]).map((f) => f.id));
    for (const f of Object.values(STORM_FACTS)) expect(reg.has(f), f).toBe(true);
    const read = new Set(RAW.nodes.flatMap((n) => (n.branches ?? []).map((b) => b.when.flag)));
    for (const f of Object.values(STORM_FACTS)) expect(read.has(f), `${f}: жодна гілка ночі його не читає`).toBe(true);
  });

  it('негативний контроль: розірвати ланку «місія → ніч» — тест червоніє', () => {
    const cut = MISSIONS.map((m) => ({ ...m, night: m.night.filter((l) => l.fact !== STORM_FACTS.dryWood) })) as MissionDef[];
    expect(stormFacts(['f.mis-lantern-done'], cut)).toEqual([]);
    expect(stormFacts(['f.mis-lantern-done'])).not.toEqual([]);
  });

  it('негативний контроль: прибрати гілку, що читає факт, — тест червоніє', () => {
    const nodes = RAW.nodes.map((n) => ({ ...n, branches: (n.branches ?? []).filter((b) => b.when.flag !== STORM_FACTS.warned) }));
    const read = new Set(nodes.flatMap((n) => n.branches.map((b) => b.when.flag)));
    expect(read.has(STORM_FACTS.warned)).toBe(false);
  });
});
