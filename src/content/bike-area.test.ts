// GAME-87 · «Нова велозона»: ціль «Поговори з Елізою» закриває лише відповідь «Ходімо, гляну», а не будь-яка розмова.
// GAME-141: велозона тепер — сцена дня 2 (CH1-D2-BIKEZONE-001): вибір велосипедиста після поради Елізи (CH1-D2-ELISE-001),
// а не з ST-004. Повний перебір розмови на справжньому контенті: кожен шлях до кінця — і завершення квесту з грошима лише там,
// де гравець погодився глянути стоянку. Негативні контролі — у кінці (ядро без byDialogue і ефект «на відмові»).
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
const HELPED = 'm.bikezone-helped';

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

const talk: Move = { type: 'Talk', npcId: 'npc.elise' };
const choose = (choice: number): Move => ({ type: 'Choose', choice });
const next: Move = { type: 'Continue' };

/**
 * Велосипедист: день 1 до ST-005 (знайомство через «А куди можна поставити велосипед?», намет біля сосон), день 2 — ранок,
 * порада Елізи (просто «Зрозуміло, дякую!»), вибір «Глянути нову велозону». Квест велозони щойно став активним, розмови немає.
 */
const TO_BIKEZONE: readonly Move[] = [
  { type: 'CreateCharacter', profileId: 'profile.solo-explorer', transportId: 'transport.bike' } as Move,
  { type: 'CompleteQuest', questId: 'PROLOGUE-HOME-001' }, { type: 'CompleteQuest', questId: 'ST-001' }, { type: 'CompleteQuest', questId: 'ST-002' },
  { type: 'Visit', locationId: 'loc.shop' }, { type: 'Pickup', itemId: 'item.tent' }, { type: 'Pickup', itemId: 'item.sleeping-bag' },
  { type: 'CompleteQuest', questId: 'ST-003' }, { type: 'Visit', locationId: 'loc.home' }, { type: 'CompleteQuest', questId: 'CH1-HOME-001' },
  { type: 'Visit', locationId: 'loc.road' }, { type: 'CompleteQuest', questId: 'ST-004' }, { type: 'Visit', locationId: 'loc.camp.lake' },
  talk, choose(0), next, next, choose(0), next,                                  // hello.c1 (велосипед) → bike → intro → spot.c1 → bye
  { type: 'Pickup', itemId: 'item.firewood' }, { type: 'CompleteQuest', questId: 'ST-005' },
  { type: 'CompleteQuest', questId: 'CH1-D2-001' },
  talk, choose(10), choose(1),                                                   // hello.c11 «Доброго ранку!» → morning.c2 → morning-tip (end)
  next,
  { type: 'CompleteQuest', questId: 'CH1-D2-ELISE-001', to: QUEST },
];
const atBikezone = (defs = GAME_DEFS): GameState => play(TO_BIKEZONE, initialState(5_000), defs);
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
    const width = Math.max(1, (defs.story?.dialogues[s.dialogue.id]?.nodes[s.dialogue.node]?.choices ?? []).length);
    for (const [label, m] of [['next', next], ...Array.from({ length: width }, (_, c) => [`c${c + 1}`, choose(c)])] as [string, Move][]) {
      const r = send(s, m, defs);
      if (r.ok) walk(r.state, [...path, label]);
    }
  };
  walk(from, []);
  return leaves;
}

/** Шлях пройшов «Ходімо, гляну», якщо Еліза запам'ятала допомогу (bikezone.c1 — єдине місце, де це ставиться). */
const viaHelp = (l: Leaf): boolean => (l.end.npcMemory['npc.elise'] ?? []).includes(HELPED);

describe('GAME-87/141 · «Нова велозона» (день 2) закривається лише відповіддю «Ходімо, гляну»', () => {
  const start = play([talk], atBikezone());

  it('квест — на дні 2: стає активним лише після поради Елізи, у день 1 його немає', () => {
    const s = atBikezone();
    expect(s.quests['ST-005']?.status).toBe('completed');
    expect(s.quests['CH1-D2-ELISE-001']?.status).toBe('completed');
    expect(s.quests[QUEST]).toEqual({ status: 'active', done: [] });
    expect(STORY.quests['ST-004']?.transitions.some((t) => t.to === QUEST)).toBe(false);
  });

  it('перебір непорожній і має обидва види шляхів (інакше «лише там» нічого не доводить)', () => {
    const leaves = allPaths(start);
    expect(leaves.filter(viaHelp).length).toBeGreaterThan(0);
    expect(leaves.filter((l) => !viaHelp(l)).length).toBeGreaterThan(0);
  });

  it('ціль виконана ⇔ шлях ішов через «Ходімо, гляну» (кожен шлях до кінця)', () => {
    for (const l of allPaths(start)) {
      expect(done(l.end).includes(OBJ), l.path.join(' ')).toBe(viaHelp(l));
    }
  });

  it('«Завершити» і +5,00 EUR — лише після згоди; без неї відмова QUEST_OBJECTIVES_OPEN і гроші не змінились', () => {
    for (const l of allPaths(start)) {
      const r = send(l.end, { type: 'CompleteQuest', questId: QUEST });
      const label = l.path.join(' ');
      if (viaHelp(l)) {
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

  it('«Не сьогодні» — ціль відкрита, Еліза нічого не запам’ятала; відмова веде далі в день 2 (CH1-D2-CAMP-001)', () => {
    const no = allPaths(start).filter((l) => l.path.join(' ').startsWith('c12 c2'));   // hello.c12 → bikezone.c2
    expect(no.length).toBeGreaterThan(0);
    for (const l of no) {
      expect(done(l.end)).not.toContain(OBJ);
      expect(l.end.npcMemory['npc.elise'] ?? []).not.toContain(HELPED);
      const dr = send(l.end, { type: 'DeclineQuest', questId: QUEST, to: 'CH1-D2-CAMP-001' });
      expect(dr.ok ? dr.state.quests['CH1-D2-CAMP-001']?.status : dr.code, l.path.join(' ')).toBe('active');
    }
  });

  it('з кожного досяжного стану розмови, поки квест активний і ціль відкрита, згода досяжна', () => {
    let checked = 0;
    const visit = (s: GameState, depth: number): void => {
      const open = s.quests[QUEST]?.status === 'active' && !done(s).includes(OBJ);
      if (open) {
        checked++;
        expect(allPaths(s).some(viaHelp), `розмова ${depth}: ${JSON.stringify(s.dialogue)}`).toBe(true);
      }
      if (depth >= 3 || !open) return;
      for (const l of allPaths(s)) {
        if (viaHelp(l)) continue;
        visit(play([talk], l.end), depth + 1);
      }
    };
    visit(start, 1);
    expect(checked).toBeGreaterThan(3);
  });

  it('велосипедист, що в день 1 не казав про велосипед (hello.c2), у день 2 доходить до велозони через hello.c6', () => {
    const quiet = TO_BIKEZONE.map((m, i) => (i === 14 ? choose(1) : m));          // hello.c2 замість c1
    const plain = play(quiet.slice(0, 15), initialState(5_000));
    expect(plain.npcMemory['npc.elise'] ?? []).not.toContain('m.came-by-bike');
    // hello.c2 → intro → spot: далі «далі» один раз менше, ніж у гілці велосипеда.
    const s = play([next, choose(0), next, ...TO_BIKEZONE.slice(19)], plain);
    expect(s.quests[QUEST]?.status).toBe('active');
    expect(allPaths(play([talk], s)).some(viaHelp)).toBe(true);
  });

  describe('негативні контролі: сторож уміє червоніти', () => {
    it('ядро без byDialogue (звичайний talk) — будь-яка розмова знову закриває квест (тест червоніє)', () => {
      const plain: StoryDefs = {
        ...STORY,
        quests: { ...STORY.quests, [QUEST]: { ...must(STORY.quests[QUEST], QUEST), objectives: must(STORY.quests[QUEST], QUEST).objectives.map((o) => ({ ...o, byDialogue: false })) } },
      };
      const defs = { ...GAME_DEFS, story: plain } as typeof GAME_DEFS;
      const leaves = allPaths(play([talk], atBikezone(defs), defs), defs);
      const leaked = leaves.filter((l) => !viaHelp(l) && done(l.end).includes(OBJ));
      expect(leaked.length).toBeGreaterThan(0);
    });

    it('ефект completeObjective на «Не сьогодні» (bikezone.c2) — перебір бачить шлях без згоди з виконаною ціллю', () => {
      const dlg = must(STORY.dialogues['dlg.elise-greeting'], 'dlg.elise-greeting');
      const bz = must(dlg.nodes['bikezone'], 'bikezone');
      const choices = must(bz.choices, 'bikezone.choices').map((c, i) => (i === 1 ? { ...c, effects: [...c.effects, { completeObjective: { quest: QUEST, objective: OBJ } }] } : c));
      const story: StoryDefs = { ...STORY, dialogues: { ...STORY.dialogues, 'dlg.elise-greeting': { ...dlg, nodes: { ...dlg.nodes, bikezone: { ...bz, choices } } } } };
      const defs = { ...GAME_DEFS, story } as typeof GAME_DEFS;
      const leaves = allPaths(play([talk], atBikezone(defs), defs), defs);
      expect(leaves.some((l) => !viaHelp(l) && done(l.end).includes(OBJ))).toBe(true);
    });
  });
});
