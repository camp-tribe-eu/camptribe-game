// Каталог ядра: кожен код checkDefs має зламаний приклад, і цілий каталог — порожньо (закон 1).
import { describe, expect, it } from 'vitest';
import { checkDefs, DEFS_CODES, type CoreDefs, type DefsCode, type StoryDefs } from './defs';
import { STORY_DEFS } from './story.fixture';

const story = STORY_DEFS.story as StoryDefs;
const withStory = (patch: (s: StoryDefs) => StoryDefs): CoreDefs => ({ items: {}, interactions: {}, story: patch(story) });
const quest = (id: string, change: object) => (s: StoryDefs): StoryDefs => ({ ...s, quests: { ...s.quests, [id]: { ...(s.quests[id] as StoryDefs['quests'][string]), ...change } } });

const cases: [DefsCode, string, CoreDefs][] = [
  ['DEFS_BAD_AMOUNT', 'дробова ціна', { items: { 'item.x': { buyCents: 1.5 } }, interactions: {} }],
  ['DEFS_RESALE_ABOVE_PRICE', 'викуп дорожчий за купівлю', { items: { 'item.x': { buyCents: 10, sellCents: 20 } }, interactions: {} }],
  ['DEFS_BAD_ID', 'ключ прототипу як id', { items: { constructor: {} }, interactions: {} }],
  ['DEFS_BAD_REF', 'старт без квесту', withStory((s) => ({ ...s, start: 'q.ghost' }))],
  ['DEFS_BAD_REF', 'перехід у нікуди', withStory(quest('q.end', { transitions: [{ on: 'complete', to: 'q.ghost', choice: false }] }))],
  ['DEFS_BAD_REF', 'ціль visit без локації', withStory(quest('q.start', { objectives: [{ id: 'o', kind: 'visit', target: 'loc.ghost', required: true }] }))],
  ['DEFS_BAD_REF', 'ціль talk без NPC', withStory(quest('q.start', { objectives: [{ id: 'o', kind: 'talk', target: 'npc.ghost', required: true }] }))],
  ['DEFS_BAD_REF', 'requires на неіснуючий квест', withStory(quest('q.gate', { requires: { quests: ['q.ghost'], items: [] } }))],
  ['DEFS_BAD_REF', 'локація квесту не існує', withStory(quest('q.start', { locationId: 'loc.ghost' }))],
  ['DEFS_BAD_REF', 'NPC у неіснуючій локації', withStory((s) => ({ ...s, npcs: { ...s.npcs, 'npc.x': { locationId: 'loc.ghost' } } }))],
  ['DEFS_BAD_AMOUNT', 'від’ємна нагорода квесту', withStory(quest('q.end', { reward: { grantId: 'rw.end', moneyCents: -1, items: [] } }))],
  ['DEFS_BAD_AMOUNT', 'нульова кількість у нагороді квесту', withStory(quest('q.end', { reward: { grantId: 'rw.end', moneyCents: 0, items: [{ itemId: 'item.x', qty: 0 }] } }))],
];

describe('checkDefs: каталог цілий до гри', () => {
  it('кожен код має приклад', () => {
    expect([...new Set(cases.map(([c]) => c))].sort()).toEqual([...DEFS_CODES].sort());
  });
  it('позитивний контроль: фікстура сюжету ціла', () => {
    expect(checkDefs(STORY_DEFS)).toEqual([]);
  });
  for (const [code, what, defs] of cases) {
    it(`${code}: ${what}`, () => {
      expect(checkDefs(defs).map((f) => f.code)).toEqual([code]);
    });
  }
});
