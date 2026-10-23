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
  ['DEFS_BAD_REF', 'unlockedBy локації — неіснуючий квест', withStory((s) => ({ ...s, locations: { ...s.locations, 'loc.shop': { unlockedBy: 'q.typo', items: [] } } }))],
  ['DEFS_BAD_REF', 'unlockedBy NPC — неіснуючий квест', withStory((s) => ({ ...s, npcs: { ...s.npcs, 'npc.ann': { locationId: 'loc.shop', unlockedBy: 'q.typo' } } }))],
  ['DEFS_BAD_REF', 'діалог неіснуючого NPC', withStory((s) => ({ ...s, dialogues: { ...s.dialogues, 'dlg.x': { npcId: 'npc.ghost', start: 'a', nodes: { a: { end: true } } } } }))],
  ['DEFS_BAD_REF', 'другий діалог того самого NPC', withStory((s) => ({ ...s, dialogues: { ...s.dialogues, 'dlg.x': { npcId: 'npc.ann', start: 'a', nodes: { a: { end: true } } } } }))],
  ['DEFS_BAD_REF', 'старт діалогу без вузла', withStory((s) => ({ ...s, dialogues: { 'dlg.x': { npcId: 'npc.ann', start: 'ghost', nodes: { a: { end: true } } } } }))],
  ['DEFS_BAD_REF', 'next у неіснуючий вузол', withStory((s) => ({ ...s, dialogues: { 'dlg.x': { npcId: 'npc.ann', start: 'a', nodes: { a: { next: 'ghost' } } } } }))],
  ['DEFS_BAD_REF', 'startQuest неіснуючого квесту', withStory((s) => ({ ...s, dialogues: { 'dlg.x': { npcId: 'npc.ann', start: 'a', nodes: { a: { choices: [{ next: 'a', effects: [{ startQuest: 'q.ghost' }] }] } } } } }))],
  ['DEFS_STORY_ITEM_SELLABLE', 'викуп предмета, що лежить у локації (підняв — продав — підняв)', { items: { 'item.wood': { sellCents: 1 } }, interactions: {}, story }],
  ['DEFS_STORY_ITEM_SELLABLE', 'викуп предмета, якого вимагає ціль collect (ніде не лежить і не нагорода)', { items: { 'item.rare': { buyCents: 9, sellCents: 1 } }, interactions: {}, story: quest('q.start', { objectives: [{ id: 'o', kind: 'collect', target: 'item.rare', required: true }] })(story) }],
  ['DEFS_STORY_ITEM_SELLABLE', 'викуп предмета з requires.items', { items: { 'item.gold2': { buyCents: 9, sellCents: 1 } }, interactions: {}, story: quest('q.gate', { requires: { quests: [], items: ['item.gold2'] } })(story) }],
  ['DEFS_STORY_ITEM_SELLABLE', 'викуп нагороди квесту (продав — квест не завершити)', { items: { 'item.map': { buyCents: 5, sellCents: 1 } }, interactions: {}, story }],
  ['DEFS_STORY_ITEM_BUYABLE', 'ціна в предмета, що лежить у локації (сюжет дає його безкоштовно, купівля блокує «Узяти»)', { items: { 'item.wood': { buyCents: 100, soldAt: ['loc.shop'] } }, interactions: {}, story }],
  ['DEFS_BAD_REF', 'soldAt веде в неіснуючу локацію (предмет мовчки став би непродаваним)', { items: { 'item.x': { buyCents: 100, soldAt: ['loc.ghost'] } }, interactions: {}, story }],
  ['DEFS_BAD_AMOUNT', 'від’ємна нагорода квесту', withStory(quest('q.end', { reward: { grantId: 'rw.end', moneyCents: -1, items: [] } }))],
  ['DEFS_BAD_AMOUNT', 'нульова кількість у нагороді квесту', withStory(quest('q.end', { reward: { grantId: 'rw.end', moneyCents: 0, items: [{ itemId: 'item.x', qty: 0 }] } }))],
];

describe('checkDefs: каталог цілий до гри', () => {
  it('кожен код має приклад', () => {
    expect([...new Set(cases.map(([c]) => c))].sort()).toEqual([...DEFS_CODES].sort());
  });
  it('позитивний контроль: фікстура сюжету ціла; предмет, що ніде не лежить, продається в існуючій локації', () => {
    expect(checkDefs(STORY_DEFS)).toEqual([]);
    expect(checkDefs({ items: { 'item.other': { buyCents: 5, sellCents: 1, soldAt: ['loc.shop'] } }, interactions: {}, story })).toEqual([]);
  });
  for (const [code, what, defs] of cases) {
    it(`${code}: ${what}`, () => {
      expect(checkDefs(defs).map((f) => f.code)).toEqual([code]);
    });
  }
});
