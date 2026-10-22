// GAME-29 · ядро проходить справжній контент так, як його бачить валідатор.
// Для кожної комбінації профіль × транспорт × тварина — повний перебір дій гравця в ядрі:
//  1) квести, які ядро може відкрити, = квести, які валідатор вважає досяжними (ні більше, ні менше);
//  2) з КОЖНОГО досяжного стану кінець розділу ще досяжний — у ядрі немає тупиків;
//  3) кінець досяжний узагалі.
// Розбіжність семантики (when, unlockedBy, requires, вибір переходу) червонить пункт 1 або 2.
import { describe, expect, it } from 'vitest';
import { dispatch, nextCommandId, type Command } from '../core/commands';

import { stateHash } from '../core/hash';
import { initialState, type GameState } from '../core/state';
import { buildIndex } from '../../scripts/validator/checks.mjs';
import { enumerateCombos, project } from '../../scripts/validator/combos.mjs';
import { CONTENT, STORY, compileStory } from './story';
import { checkDefs, type CoreDefs } from '../core/defs';

const DEFS: CoreDefs = { items: {}, interactions: {}, story: STORY };
const NO_ANIMAL = 'animal.none';

/** Усе, що гравець може спробувати; ядро саме відмовить у недоречному. */
function moves(s: GameState): Omit<Command, 'commandId'>[] {
  const out: Record<string, unknown>[] = [];
  for (const id of Object.keys(STORY.locations)) out.push({ type: 'Visit', locationId: id });
  for (const id of Object.keys(STORY.npcs)) out.push({ type: 'Talk', npcId: id });
  for (const l of Object.values(STORY.locations)) for (const id of l.items) out.push({ type: 'Pickup', itemId: id });
  for (const [qid, p] of Object.entries(s.quests)) {
    if (p.status !== 'active') continue;
    for (const type of ['CompleteQuest', 'DeclineQuest']) {
      out.push({ type, questId: qid });
      for (const t of STORY.quests[qid]?.transitions ?? []) out.push({ type, questId: qid, to: t.to });
    }
  }
  return out as Omit<Command, 'commandId'>[];
}

const key = (s: GameState): string => stateHash({ ...s, processed: null, seq: null });

function explore(first: GameState) {
  const seen = new Map<string, GameState>([[key(first), first]]);
  const edges = new Map<string, Set<string>>();
  const queue = [first];
  for (let s = queue.shift(); s; s = queue.shift()) {
    const k = key(s);
    edges.set(k, new Set());
    for (const m of moves(s)) {
      const r = dispatch(s, { ...m, commandId: nextCommandId(s) } as Command, DEFS);
      if (!r.ok) continue;
      const nk = key(r.state);
      edges.get(k)?.add(nk);
      if (!seen.has(nk)) { seen.set(nk, r.state); queue.push(r.state); }
    }
    if (seen.size > 200_000) throw new Error('простір станів вибухнув — тест не доводить нічого');
  }
  return { seen, edges };
}

describe('сюжет: ядро ≡ валідатор на справжньому контенті (GAME-29)', () => {
  const combos = enumerateCombos(CONTENT);

  it('комбінацій більше нуля (інакше перевірка нижче порожня й зелена)', () => {
    expect(combos.length).toBeGreaterThan(1);
  });

  for (const k of combos) {
    const label = `${k.profile} · ${k.transport} · ${k.animal}`;
    it(label, () => {
      const created = dispatch(initialState(0), {
        type: 'CreateCharacter', commandId: 'e0', profileId: k.profile ?? '', transportId: k.transport ?? '',
        ...(k.animal === NO_ANIMAL ? {} : { animalId: k.animal }),
      }, DEFS);
      expect(created.ok, label).toBe(true);
      const { seen, edges } = explore(created.state);

      // 1) множини квестів збігаються
      const opened = new Set<string>();
      for (const s of seen.values()) for (const q of Object.keys(s.quests)) opened.add(q);
      const expected = buildIndex(project(CONTENT, k)).reachable;
      expect([...opened].sort()).toEqual([...expected].sort());

      // 2–3) кінець досяжний із кожного стану
      const ended = [...seen].filter(([, s]) => s.campaignEnded).map(([h]) => h);
      expect(ended.length).toBeGreaterThan(0);
      const back = new Map<string, string[]>();
      for (const [from, tos] of edges) for (const to of tos) back.set(to, [...(back.get(to) ?? []), from]);
      const canEnd = new Set(ended);
      const stack = [...ended];
      for (let h = stack.pop(); h !== undefined; h = stack.pop()) {
        for (const p of back.get(h) ?? []) if (!canEnd.has(p)) { canEnd.add(p); stack.push(p); }
      }
      const stuck = [...seen.keys()].filter((h) => !canEnd.has(h));
      expect(stuck.length, stuck.length ? `тупик: ${JSON.stringify(seen.get(stuck[0] ?? '')?.quests)}` : '').toBe(0);
    });
  }
});

describe('збірка сюжету з content/ (src/content/story.ts)', () => {
  it('choiceKey → вибір; money → центи; item → itemId', () => {
    const st004 = STORY.quests['ST-004'];
    expect(st004?.transitions.map((t) => [t.to, t.choice])).toEqual([['ST-005', false], ['q.elise-bike-area', true]]);
    expect(STORY.quests['ST-005']?.reward?.moneyCents).toBe(1_000);
    const c = structuredClone(CONTENT);
    const q = c.quests[0];
    if (q) q.reward = { grantId: 'rw.x', money: 7, items: [{ item: 'item.tent', qty: 2 }] };
    expect(compileStory(c).quests[q?.id ?? '']?.reward).toEqual({ grantId: 'rw.x', moneyCents: 7, items: [{ itemId: 'item.tent', qty: 2 }] });
  });

  it('те, чого ядро ще не вміє, не проходить мовчки: deliver і продаж у NPC — помилка збірки', () => {
    const a = structuredClone(CONTENT);
    const o = a.quests[0]?.objectives[0];
    if (o) o.kind = 'deliver';
    expect(() => compileStory(a)).toThrow(/deliver/);
    const b = structuredClone(CONTENT);
    const n = b.npcs[0];
    if (n) n.sells = ['item.tent'];
    expect(() => compileStory(b)).toThrow(/sells/);
  });

  it('каталог сюжету цілий для ядра (checkDefs)', () => {
    expect(checkDefs(DEFS)).toEqual([]);
  });
});
