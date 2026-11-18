// GAME-312 · ніч із бурею: кожна місія щось у ній змінює. Розірви зв'язок — і тест червоніє (закон 1).
import { describe, expect, it } from 'vitest';
import { dispatch, nextCommandId, type Command } from '../core/commands';
import type { CoreDefs } from '../core/defs';
import { initialState, type GameState } from '../core/state';
import flagsJson from '../../content/flags.json';
import ukLoc from '../../content/locales/uk.json';
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
function playNight(flags: readonly string[], fireLit = true): string[] {
  let s = fresh();
  const send = (cmd: Command): void => {
    const r = dispatch(s, cmd, GAME_DEFS);
    if (!r.ok) throw new Error(`${cmd.type}: ${r.code}`);
    s = r.state;
  };
  send(startStormNight(nextCommandId(s), flags, undefined, fireLit));
  const path: string[] = [];
  for (let guard = 0; s.dialogue; guard++) {
    if (guard > 60) throw new Error('ніч не закінчується');
    path.push(s.dialogue.node);
    const node = GAME_DEFS.story?.dialogues[STORM_SCENE]?.nodes[s.dialogue.node];
    if (node?.choices) {   // перший вибір, що ВІДКРИТИЙ (умовний, який не виконується, гравець не бачить)
      const open = node.choices.findIndex((_, i) => dispatch(s, { type: 'Choose', commandId: nextCommandId(s), choice: i }, GAME_DEFS).ok);
      send({ type: 'Choose', commandId: nextCommandId(s), choice: open });
    } else send({ type: 'Continue', commandId: nextCommandId(s) });
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

// GAME-323 · без вогню вдень ніч не каже «вогонь із першого сірника» й не кличе готувати гаряче.
// Мутації (перевірено): у stormFacts прибрати `if (!fireLit) …` → «додає факт cold» червоніє; з вузла fire прибрати гілку cold → «шлях без вогню» червоніє;
// зняти `when` з q2.c1 → «гаряче не пропонується» червоніє.
describe('GAME-323 · ніч без вогню', () => {
  const L = ukLoc as Record<string, string>;
  const say = (path: string[]): string => path.map((n) => L[`dlg.storm-night.${n}`] ?? '').join(' | ');
  it('факт «вогню не палили» додається лише коли вогню не було', () => {
    expect(stormFacts([], undefined, true)).toEqual([]);
    expect(stormFacts([], undefined, false)).toEqual([STORM_FACTS.cold]);
    expect(stormFacts(['f.mis-lantern-done'], undefined, false)).toEqual([STORM_FACTS.dryWood, STORM_FACTS.cold]);
  });
  it('шлях без вогню: ні «вогонь із першого сірника», ні «вогонь береться», ні «гаряче»', () => {
    for (const flags of [[], ['f.mis-lantern-done'], ['f.mis-ring-done'], ['f.mis-lantern-done', 'f.mis-ring-done']]) {
      const path = playNight(flags, false);
      expect(path, flags.join()).toContain('fire-cold');
      for (const bad of ['fire-dry', 'fire-wet']) expect(path, `${flags.join()}: ${bad}`).not.toContain(bad);
      expect(say(path)).not.toMatch(/першого сірника|гарячий|гаряче|шкварчить|на сковороді/);
    }
  });
  it('гаряче не пропонується: перший вибір q2 — «щось швидке й холодне»', () => {
    const q2 = (RAW.nodes as unknown as { id: string; choices?: { textKey: string; when?: { notFlag?: string } }[] }[]).find((n) => n.id === 'q2');
    expect(q2?.choices?.[0]?.when?.notFlag).toBe(STORM_FACTS.cold);
    expect(q2?.choices?.[1]?.when).toBeUndefined();   // безумовна пара лишається
  });
  it('з вогнем усе як було', () => {
    const path = playNight(['f.mis-lantern-done']);
    expect(path).toContain('fire-dry');
    expect(path).not.toContain('fire-cold');
  });
});
