// GAME-29 / GAME-12 · властивість: нагорода за grantId — рівно раз, навіть коли квест проходять
// удруге через цикл. Випадкові послідовності дій гравця (fast-check, фіксоване зерно).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { dispatch, nextCommandId, type Command, type Safeguards } from './commands';
import type { CoreDefs, StoryDefs } from './defs';
import { BIKER, STORY_DEFS, type Step } from './story.fixture';
import { initialState, type GameState } from './state';

// Фікстура з циклом: q.side → (complete) → q.start знову; q.start теж платить. Без запобіжника
// grantId кожне коло давало б гроші ще раз.
const base = STORY_DEFS.story as StoryDefs;
const CYCLE: CoreDefs = {
  ...STORY_DEFS,
  story: {
    ...base,
    quests: {
      ...base.quests,
      'q.start': { ...(base.quests['q.start'] as StoryDefs['quests'][string]), reward: { grantId: 'rw.start', moneyCents: 100, items: [] } },
      'q.side': { ...(base.quests['q.side'] as StoryDefs['quests'][string]), transitions: [{ on: 'complete', to: 'q.start', choice: false }, { on: 'decline', to: 'q.mid', choice: false }] },
    },
  },
};
const REWARD: Record<string, number> = { 'rw.start': 100, 'rw.side': 500, 'rw.end': 1_000 };

// Абетка з конкретних ходів, а не з довільних полів: інакше випадкова послідовність майже ніколи не
// проходить коло двічі, і властивість зелена й без запобіжника (перевірено мутацією).
const step: fc.Arbitrary<Step> = fc.constantFrom<Step>(
  { type: 'Visit', locationId: 'loc.home' },
  { type: 'Visit', locationId: 'loc.shop' },
  { type: 'Talk', npcId: 'npc.ann' },
  { type: 'Pickup', itemId: 'item.wood' },
  { type: 'CompleteQuest', questId: 'q.start', to: 'q.side' },
  { type: 'CompleteQuest', questId: 'q.start' },
  { type: 'CompleteQuest', questId: 'q.side' },
  { type: 'DeclineQuest', questId: 'q.side' },
  { type: 'CompleteQuest', questId: 'q.mid' },
  { type: 'CompleteQuest', questId: 'q.end' },
  { type: 'Choose', choice: 2 },
  { type: 'Continue' },
);

function playAll(steps: readonly Step[], guard?: Safeguards): GameState {
  let s = dispatch(initialState(0), { ...BIKER, commandId: 'p0' }, CYCLE).state;
  for (const c of steps) s = dispatch(s, { ...c, commandId: nextCommandId(s) } as Command, CYCLE, guard).state;
  return s;
}

describe('властивість: нагорода рівно раз (GAME-29, fast-check)', () => {
  it('у циклі q.start ⇄ q.side кожен grantId видано не більше разу, і гроші = сума різних нагород', () => {
    fc.assert(fc.property(fc.array(step, { minLength: 20, maxLength: 150 }), (steps) => {
      const s = playAll(steps);
      expect(new Set(s.grants).size).toBe(s.grants.length);
      expect(s.moneyCents).toBe(s.grants.reduce((m, g) => m + (REWARD[g] ?? 0), 0));
    }), { seed: 20261022, numRuns: 1000 });
  });

  it('позитивний контроль: цикл справді проходиться двічі — повторний вхід у q.start трапляється', () => {
    const loop: Step[] = [
      { type: 'Visit', locationId: 'loc.home' }, { type: 'CompleteQuest', questId: 'q.start', to: 'q.side' },
      { type: 'Visit', locationId: 'loc.shop' }, { type: 'CompleteQuest', questId: 'q.side' },
      { type: 'Visit', locationId: 'loc.home' }, { type: 'CompleteQuest', questId: 'q.start', to: 'q.side' },
      { type: 'Visit', locationId: 'loc.shop' }, { type: 'CompleteQuest', questId: 'q.side' },
    ];
    const s = playAll(loop);
    expect(s.quests['q.start']?.status).toBe('active');           // третій вхід
    expect(s.moneyCents).toBe(600);                               // 100 + 500, не 1200
  });

  it('мутація: без запобіжника grantId цикл платить удруге — властивість червоніє', () => {
    const loose: Safeguards = { commandId: true, grantId: false, rollback: true };
    const loop: Step[] = [
      { type: 'Visit', locationId: 'loc.home' }, { type: 'CompleteQuest', questId: 'q.start', to: 'q.side' },
      { type: 'Visit', locationId: 'loc.shop' }, { type: 'CompleteQuest', questId: 'q.side' },
      { type: 'Visit', locationId: 'loc.home' }, { type: 'CompleteQuest', questId: 'q.start', to: 'q.side' },
    ];
    const s = playAll(loop, loose);
    expect(new Set(s.grants).size).toBeLessThan(s.grants.length);
  });
});
