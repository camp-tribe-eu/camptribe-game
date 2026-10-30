// GAME-195 · розвилка рибки (OD-023): «відпустив» і «взяв» — два різні вечори, обидва доходять до кінця сцени dlg.ch1-fire.
// Закон 1: оракул має негативні контролі (мутований контент → червоне). Рибку на вогнищі веде чистий автомат fish-grill.
import { describe, expect, it } from 'vitest';
import { dispatch, nextCommandId, type Command } from '../core/commands';
import type { CoreDefs } from '../core/defs';
import { initialState, type GameState } from '../core/state';
import uk from '../../content/locales/uk.json';
import en from '../../content/locales/en.json';
import flagsJson from '../../content/flags.json';
import { COOK_MS, GRILL_IDLE, HEAT_UP_MS, LIFT_MAX_MS, MAX_MS, charred, startGrill, stepGrill, type GrillInput, type GrillState } from './fish-grill';
import { FISH_FACTS, FISH_KEEP_SCENE, FISH_RELEASE_SCENE, fishChoiceMove, fishEvening } from './fish-fork';
import { FIREPLACE_SCENE, startFireplace } from './fireplace';
import { GAME_DEFS } from './slice-defs';
import { CONTENT, compileStory, type RawContent } from './story';

const UK = uk as Record<string, string>;
const EN = en as Record<string, string>;
const FIRE_QUEST = 'CH1-D2-FIRE-001';

function fresh(defs: CoreDefs): GameState {
  const r = dispatch(initialState(5_000), { type: 'CreateCharacter', commandId: 'c0', profileId: 'profile.family-teen', transportId: 'transport.car', animalId: 'animal.cat' }, defs);
  if (!r.ok) throw new Error(`CreateCharacter: ${r.code}`);
  return { ...r.state, quests: { ...r.state.quests, [FIRE_QUEST]: { status: 'active', done: [] } } };
}

type Fish = 'none' | 'kept' | 'released' | 'both';
interface Setup { fish: Fish; charred: boolean; fire: boolean; pick: 0 | 1 }

/** Вечір: вибір на озері (одна чи дві сцени-однорядники) → вечірня сцена. Повертає вузли вечора, стан і прапорці. */
function play(defs: CoreDefs, o: Setup): { path: string[]; state: GameState } {
  let s = fresh(defs);
  const send = (cmd: Command) => { const r = dispatch(s, cmd, defs); if (!r.ok) throw new Error(`${cmd.type}: ${r.code}`); s = r.state; };
  const lake = (keep: boolean) => {
    const m = fishChoiceMove(keep, s.flags);
    if (m) { send({ ...m, commandId: nextCommandId(s) } as Command); while (s.dialogue) send({ type: 'Continue', commandId: nextCommandId(s) }); }
  };
  if (o.fish === 'kept') lake(true);
  if (o.fish === 'released') lake(false);
  if (o.fish === 'both') { lake(false); lake(true); }
  send(startFireplace(nextCommandId(s), { fireAllowed: o.fire, dinnerDone: o.fire, photoTaken: false, fishCharred: o.charred }));
  const path: string[] = [];
  for (let guard = 0; s.dialogue; guard++) {
    if (guard > 60) throw new Error('сцена не закінчується');
    path.push(s.dialogue.node);
    const node = defs.story?.dialogues[FIREPLACE_SCENE]?.nodes[s.dialogue.node];
    send(node?.choices ? { type: 'Choose', commandId: nextCommandId(s), choice: o.pick } : { type: 'Continue', commandId: nextCommandId(s) });
  }
  return { path, state: s };
}

const common = (pick: 0 | 1) => ['l1', 'l2', 'l3', 'l4', 'l5', 'l6-plain', 'l7', ...(pick === 0 ? ['l8', 'l9', 'l10', 'l11', 'l12-plain'] : ['b1', 'b2', 'b3'])];
/** Оракул картки, незалежний від графа. */
function expected(o: Setup): string[] {
  const open = o.fire ? ['open', 'fire'] : ['open', 'lantern', 'lantern-george'];
  const kept = o.fish === 'kept' || o.fish === 'both';
  const mid = kept ? [o.fire ? 'fk1' : 'fkl', ...(o.fire && o.charred ? ['fk1c'] : []), 'fk2', 'fk3'] : o.fish === 'released' ? ['fr1', 'fr2', 'fr3', 'fr4', 'fr5'] : [];
  // fk1 і fk1c — альтернативи, а не підряд: з підгорілою рибою замість fk1 іде fk1c після fk1 (fk1 → fk1c → fk2).
  return [...open, ...mid, ...common(o.pick)];
}

const FISHES: Fish[] = ['none', 'kept', 'released', 'both'];
const COMBOS: Setup[] = FISHES.flatMap((fish) => [false, true].flatMap((charred) => [false, true].flatMap((fire) => ([0, 1] as const).map((pick) => ({ fish, charred, fire, pick })))));
const label = (o: Setup) => `${o.fish} · підгоріла ${o.charred} · вогнище ${o.fire} · вибір ${o.pick}`;
function mismatches(defs: CoreDefs): string[] {
  return COMBOS.flatMap((o) => {
    let got: string[];
    try { got = play(defs, o).path; } catch (e) { return [`${label(o)}: ${String(e)}`]; }
    const want = expected(o);
    return JSON.stringify(got) === JSON.stringify(want) ? [] : [`${label(o)}: ${got.join('→')} ≠ ${want.join('→')}`];
  });
}
function mutated(patch: (nodes: Record<string, unknown>[]) => void): CoreDefs {
  const c = structuredClone(CONTENT);
  const d = c.dialogues.find((x) => x.id === FIREPLACE_SCENE) as RawContent['dialogues'][number];
  patch(d.nodes as unknown as Record<string, unknown>[]);
  return { ...GAME_DEFS, story: compileStory(c) };
}
const nodeOf = (nodes: Record<string, unknown>[], id: string) => nodes.find((n) => n.id === id) as Record<string, unknown>;

describe('GAME-195 · розвилка рибки: два вечори, обидва доходять до кінця', () => {
  it.each(COMBOS.map((o) => [label(o), o] as const))('%s — рівно ті вузли, яких вимагає картка', (_, o) => {
    const { path, state } = play(GAME_DEFS, o);
    expect(path).toEqual(expected(o));
    expect(state.dialogue).toBeNull();                        // нормальний кінець вечора
    expect(path.at(-1)).toBe(o.pick === 0 ? 'l12-plain' : 'b3');
  });

  it('вибір пишеться фактом ядра й лишається в журналі (Memory + StartScene); «взяв» сильніший за «відпустив»', () => {
    const k = play(GAME_DEFS, { fish: 'kept', charred: false, fire: true, pick: 0 }).state;
    const r = play(GAME_DEFS, { fish: 'released', charred: false, fire: true, pick: 0 }).state;
    expect(fishEvening(k.flags)).toBe('kept');
    expect(fishEvening(r.flags)).toBe('released');
    expect(fishEvening(play(GAME_DEFS, { fish: 'both', charred: false, fire: true, pick: 0 }).state.flags)).toBe('kept');
    expect(fishEvening([])).toBe('none');
    expect(fishChoiceMove(true, k.flags)).toBeNull();          // удруге те саме — без нової сцени
    expect(fishChoiceMove(false, k.flags)).toBeNull();         // слабший вибір після сильнішого — теж
    expect(fishChoiceMove(true, r.flags)?.type).toBe('StartScene');
  });

  it('«відпустив»: Нора з гостинцем → довіра +1 (прапорець, без грошей); «взяв» довіри не дає', () => {
    const r = play(GAME_DEFS, { fish: 'released', charred: false, fire: true, pick: 0 }).state;
    const k = play(GAME_DEFS, { fish: 'kept', charred: false, fire: true, pick: 0 }).state;
    const n = play(GAME_DEFS, { fish: 'none', charred: false, fire: true, pick: 0 }).state;
    expect(r.flags).toContain(FISH_FACTS.trustNora);
    expect(k.flags).not.toContain(FISH_FACTS.trustNora);
    expect(n.flags).not.toContain(FISH_FACTS.trustNora);
    expect(r.moneyCents).toBe(k.moneyCents);
  });

  it('обидві гілки мають репліки uk і en, а кожен вузол сцени показано хоч раз', () => {
    const raw = CONTENT.dialogues.find((d) => d.id === FIREPLACE_SCENE) as RawContent['dialogues'][number];
    const seen = new Set(COMBOS.flatMap((o) => play(GAME_DEFS, o).path));
    expect([...seen].sort()).toEqual(raw.nodes.map((n) => n.id).filter((id) => !id.endsWith('-photo')).sort());   // фото-вузли — fireplace.test
    for (const k of ['fk1', 'fk1c', 'fkl', 'fk2', 'fk3', 'fr1', 'fr2', 'fr3', 'fr3.c1', 'fr3.c2', 'fr4', 'fr5']) { expect(UK[`${FIREPLACE_SCENE}.${k}`], k).toBeTruthy(); expect(EN[`${FIREPLACE_SCENE}.${k}`], k).toBeTruthy(); }
    for (const sc of [FISH_KEEP_SCENE, FISH_RELEASE_SCENE]) { expect(UK[`${sc}.n`]).toBeTruthy(); expect(EN[`${sc}.n`]).toBeTruthy(); }
    for (const f of Object.values(FISH_FACTS)) expect((flagsJson as { id: string; type: string }[]).find((r) => r.id === f)?.type, f).toBe('bool');
  });

  it('канон: у рибних репліках немає Мії й крові', () => {
    const keys = Object.keys(UK).filter((k) => /^dlg\.(fish-|ch1-fire\.f[kr])/.test(k));
    for (const k of keys) expect(UK[k], k).not.toMatch(/Мі[яюї]|кров|кишк|патрош/i);
  });

  it('позитивний контроль: справжній контент — нуль розбіжностей', () => { expect(mismatches(GAME_DEFS)).toEqual([]); });

  it('негативний контроль: з гілки «взяв» прибрано перехід до кінця вечора (fk3 без next) → червоне', () => {
    const defs = mutated((nodes) => { delete nodeOf(nodes, 'fk3').next; });
    expect(mismatches(defs).length).toBeGreaterThan(0);
  });
  it('негативний контроль: з гілки «відпустив» прибрано перехід до кінця (fr5 без next) → червоне', () => {
    const defs = mutated((nodes) => { delete nodeOf(nodes, 'fr5').next; });
    expect(mismatches(defs).length).toBeGreaterThan(0);
  });
  it('негативний контроль: розвилку fish-released прибрано з відкриття → червоне', () => {
    const defs = mutated((nodes) => { nodeOf(nodes, 'fire').branches = (nodeOf(nodes, 'fire').branches as unknown[]).slice(0, 1); });
    expect(mismatches(defs).length).toBeGreaterThan(0);
  });
});

describe('GAME-195 · рибка на вогнищі руками: чистий автомат', () => {
  const run = (s: GrillState, inputs: GrillInput[]): GrillState => inputs.reduce((a, i) => stepGrill(a, i).state, s);
  const ticks = (ms: number, n = 50): GrillInput[] => Array.from({ length: Math.ceil(ms / n) }, () => ({ kind: 'tick', dtMs: n }) as const);

  it('без вводу гравця дія не стається: ні нанизування, ні кінець', () => {
    expect(run(startGrill(), ticks(MAX_MS * 2)).phase).toBe('skewer');
    expect(run(GRILL_IDLE, ticks(5000)).phase).toBe('idle');
  });
  it('нанизав і не чіпав — рибка згоріла «трішки», але готова і гра не зависла (без покарання)', () => {
    const s = run(startGrill(), [{ kind: 'act' }, { kind: 'hold', down: false }, ...ticks(COOK_MS + 200)]);
    expect(s.phase).toBe('done');
    expect(charred(s)).toBe(true);
  });
  it('піднімав вчасно — готова без підгорання', () => {
    let s = run(startGrill(), [{ kind: 'act' }, { kind: 'hold', down: false }]);
    for (let g = 0; s.phase !== 'done' && g < 200; g++) {
      const hot = s.heat > 0.6;
      s = run(s, [{ kind: 'hold', down: hot }, ...ticks(100, 50)]);
    }
    expect(s.phase).toBe('done');
    expect(charred(s)).toBe(false);
  });
  it('утримання без кінця: рука втомлюється й рибка опускається (без softlock); межа часу завершує будь-що', () => {
    let s = run(startGrill(), [{ kind: 'act' }, { kind: 'hold', down: false }, { kind: 'hold', down: true }, ...ticks(LIFT_MAX_MS + 100)]);
    expect(s.holding).toBe(false);
    s = run(startGrill(), [{ kind: 'act' }, { kind: 'hold', down: false }]);
    for (let g = 0; s.phase !== 'done' && g < 2000; g++) s = run(s, [{ kind: 'hold', down: g % 40 < 30 }, ...ticks(50, 50)]);
    expect(s.phase).toBe('done');
    expect(HEAT_UP_MS).toBeGreaterThan(0);
  });
});
