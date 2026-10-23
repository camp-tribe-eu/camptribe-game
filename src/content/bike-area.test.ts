// GAME-87 · «Нова велозона»: ціль «Поговори з Елізою» закриває лише відповідь про велосипед, а не будь-яка розмова.
// Повний перебір розмови на справжньому контенті: кожен шлях до кінця — і завершення квесту з грошима лише там,
// де була гілка велосипеда. Негативні контролі — у кінці (ядро без byDialogue і ефект «на загальному вузлі»).
import { describe, expect, it } from 'vitest';
import { dispatch, type Command } from '../core/commands';
import type { StoryDefs } from '../core/defs';
import { initialState, type GameState } from '../core/state';
import type { Move } from './moves';
import { GAME_DEFS } from './slice-defs';
import { STORY } from './story';

const QUEST = 'q.elise-bike-area';
const OBJ = 'talk-elise';
const BIKE_REWARD = 500;

let n = 0;
const send = (s: GameState, m: Move, defs = GAME_DEFS) => dispatch(s, { ...m, commandId: `ba${n++}` } as Command, defs);
function play(moves: readonly Move[], from: GameState, defs = GAME_DEFS): GameState {
  let s = from;
  for (const m of moves) {
    const r = send(s, m, defs);
    if (!r.ok) throw new Error(`${m.type} ${JSON.stringify(m)} → ${r.code}`);
    s = r.state;
  }
  return s;
}

/** Велосипедист: Пролог до виїзду на дорогу, ST-004 → бічний квест, у озера, перша розмова з Елізою щойно почалась. */
const TO_ELISE: readonly Move[] = [
  { type: 'CreateCharacter', profileId: 'profile.solo-explorer', transportId: 'transport.bike' } as Move,
  { type: 'CompleteQuest', questId: 'ST-001' }, { type: 'CompleteQuest', questId: 'ST-002' },
  { type: 'Visit', locationId: 'loc.shop' }, { type: 'Pickup', itemId: 'item.tent' }, { type: 'Pickup', itemId: 'item.sleeping-bag' },
  { type: 'CompleteQuest', questId: 'ST-003' }, { type: 'Visit', locationId: 'loc.road' }, { type: 'CompleteQuest', questId: 'ST-004', to: QUEST },
  { type: 'Visit', locationId: 'loc.camp.lake' },
];
const atLake = (defs = GAME_DEFS): GameState => play(TO_ELISE, initialState(5_000), defs);
const talk: Move = { type: 'Talk', npcId: 'npc.elise' };
/** Значення, яке мусить існувати (без `!`: лінтер його забороняє). */
function must<T>(v: T | undefined, what: string): T {
  if (v === undefined) throw new Error(`немає: ${what}`);
  return v;
}
const done = (s: GameState): readonly string[] => s.quests[QUEST]?.done ?? [];

interface Leaf { readonly path: readonly string[]; readonly end: GameState }
/** Усі шляхи розмови від поточного стану до її кінця: кожна відповідь і «далі», що їх приймає ядро (повний перебір). */
function allPaths(from: GameState, defs = GAME_DEFS): Leaf[] {
  const leaves: Leaf[] = [];
  const walk = (s: GameState, path: readonly string[]): void => {
    if (path.length > 12) throw new Error(`діалог не закінчується: ${path.join(' ')}`);
    if (!s.dialogue) { leaves.push({ path, end: s }); return; }
    for (const [label, m] of [['next', { type: 'Continue' }], ...[0, 1, 2, 3, 4, 5].map((c) => [`c${c + 1}`, { type: 'Choose', choice: c }])] as [string, Move][]) {
      const r = send(s, m, defs);
      if (r.ok) walk(r.state, [...path, label]);
    }
  };
  walk(from, []);
  return leaves;
}

/** Шлях пройшов гілкою велосипеда, якщо Еліза запам'ятала, що гравець приїхав на ньому (c1 — єдине місце, де це ставиться). */
const viaBike = (l: Leaf): boolean => (l.end.npcMemory['npc.elise'] ?? []).includes('m.came-by-bike');

describe('GAME-87 · «Нова велозона» закривається лише гілкою про велосипед', () => {
  const start = play([talk], atLake());

  it('перебір непорожній і має обидва види шляхів (інакше «лише там» нічого не доводить)', () => {
    const leaves = allPaths(start);
    expect(leaves.filter(viaBike).length).toBeGreaterThan(0);
    expect(leaves.filter((l) => !viaBike(l)).length).toBeGreaterThan(0);
  });

  it('ціль виконана ⇔ шлях ішов через «А куди можна поставити велосипед?» (кожен шлях до кінця)', () => {
    for (const l of allPaths(start)) {
      expect(done(l.end).includes(OBJ), l.path.join(' ')).toBe(viaBike(l));
    }
  });

  it('«Завершити» і +5,00 EUR — лише через гілку велосипеда; без неї відмова QUEST_OBJECTIVES_OPEN і гроші не змінились', () => {
    for (const l of allPaths(start)) {
      const r = send(l.end, { type: 'CompleteQuest', questId: QUEST });
      const label = l.path.join(' ');
      if (viaBike(l)) {
        expect(r.ok, label).toBe(true);
        expect(r.ok && r.state.moneyCents - l.end.moneyCents, label).toBe(BIKE_REWARD);
      } else {
        expect(r, label).toMatchObject({ ok: false, code: 'QUEST_OBJECTIVES_OPEN' });
        expect(l.end.moneyCents, label).toBe(start.moneyCents);
      }
    }
  });

  it('сама розмова (Talk без відповіді) ціль не зараховує', () => {
    expect(done(start)).not.toContain(OBJ);
    expect(send(start, { type: 'CompleteQuest', questId: QUEST })).toMatchObject({ ok: false, code: 'QUEST_OBJECTIVES_OPEN' });
  });

  it('після шляху без велосипеда ціль лишається відкритою й у повторній розмові; відмова з квесту — як і раніше', () => {
    const spot = allPaths(start).find((l) => !viaBike(l) && l.end.flags.includes('f.elise-met'));
    expect(spot, 'є шлях «знайомство без велосипеда»').toBeDefined();
    const again = play([talk], must(spot, 'шлях без велосипеда').end);
    expect(done(again)).not.toContain(OBJ);
    const leaves = allPaths(again);
    expect(leaves.length).toBeGreaterThan(0);
    for (const l of leaves) {
      expect(done(l.end), l.path.join(' ')).not.toContain(OBJ);
      const dr = send(l.end, { type: 'DeclineQuest', questId: QUEST, to: 'ST-005' });
      expect(dr.ok ? 'ok' : dr.code, l.path.join(' ')).toBe('ok');   // вихід лишається: відмова
    }
  });

  describe('негативні контролі: сторож уміє червоніти', () => {
    it('ядро без byDialogue (звичайний talk) — «Дякую! Де краще поставити намет?» знову закриває квест (тест червоніє)', () => {
      const plain: StoryDefs = {
        ...STORY,
        quests: { ...STORY.quests, [QUEST]: { ...must(STORY.quests[QUEST], QUEST), objectives: must(STORY.quests[QUEST], QUEST).objectives.map((o) => ({ ...o, byDialogue: false })) } },
      };
      const defs = { ...GAME_DEFS, story: plain } as typeof GAME_DEFS;
      const leaves = allPaths(play([talk], atLake(defs), defs), defs);
      const leaked = leaves.filter((l) => !viaBike(l) && done(l.end).includes(OBJ));
      expect(leaked.length).toBeGreaterThan(0);
    });

    it('ефект completeObjective на загальному вузлі (hello.c2) — перебір бачить шлях без велосипеда з виконаною ціллю', () => {
      const dlg = must(STORY.dialogues['dlg.elise-greeting'], 'dlg.elise-greeting');
      const hello = must(dlg.nodes['hello'], 'hello');
      const choices = must(hello.choices, 'hello.choices').map((c, i) => (i === 1 ? { ...c, effects: [...c.effects, { completeObjective: { quest: QUEST, objective: OBJ } }] } : c));
      const story: StoryDefs = { ...STORY, dialogues: { ...STORY.dialogues, 'dlg.elise-greeting': { ...dlg, nodes: { ...dlg.nodes, hello: { ...hello, choices } } } } };
      const defs = { ...GAME_DEFS, story } as typeof GAME_DEFS;
      const leaves = allPaths(play([talk], atLake(defs), defs), defs);
      expect(leaves.some((l) => !viaBike(l) && done(l.end).includes(OBJ))).toBe(true);
    });
  });
});
