// Мінімальний сюжет для тестів ядра (GAME-29): кожна гілка семантики — тут один раз.
import { dispatch, type Command } from './commands';
import type { CoreDefs } from './defs';
import { initialState, type GameState } from './state';

export const STORY_DEFS: CoreDefs = {
  items: {},
  interactions: {},
  story: {
    start: 'q.start',
    profiles: { 'profile.a': { transports: ['transport.car', 'transport.bike'] }, 'profile.b': { transports: ['transport.car'] }, 'profile.any': {} },
    transports: ['transport.car', 'transport.bike'],
    animals: { 'animal.dog': { transports: ['transport.car'] } },
    locations: {
      'loc.home': { items: ['item.wood'] },
      'loc.shop': { unlockedBy: 'q.start', items: ['item.gold'] },
      'loc.dogpark': { when: { animals: ['animal.dog'] }, items: [] },
    },
    npcs: { 'npc.ann': { locationId: 'loc.shop', unlockedBy: 'q.start' }, 'npc.bob': { locationId: 'loc.home', unlockedBy: 'q.start' } },
    quests: {
      'q.start': {
        optional: false, end: false, locationId: 'loc.home',
        objectives: [{ id: 'look-around', kind: 'visit', target: 'loc.home', required: true }],
        transitions: [
          { on: 'complete', to: 'q.mid', choice: false },
          { on: 'complete', to: 'q.side', choice: true },  // умова лише на квесті-цілі (when переходу — у q.mid → q.bonus)
        ],
      },
      'q.mid': {
        optional: false, end: false,
        objectives: [
          { id: 'meet-ann', kind: 'talk', target: 'npc.ann', required: true },
          { id: 'wood', kind: 'collect', target: 'item.wood', required: true },
          { id: 'dog-walk', kind: 'visit', target: 'loc.dogpark', required: true, when: { animals: ['animal.dog'] } },
        ],
        transitions: [
          { on: 'complete', to: 'q.end', choice: false },
          { on: 'complete', to: 'q.gate', choice: true },
          { on: 'complete', to: 'q.bonus', choice: true, when: { animals: ['animal.dog'] } }, // умова лише на переході
        ],
      },
      'q.side': {
        optional: true, end: false, when: { transports: ['transport.bike'] },
        objectives: [{ id: 'ride', kind: 'visit', target: 'loc.shop', required: true }],
        transitions: [{ on: 'complete', to: 'q.mid', choice: false }, { on: 'decline', to: 'q.mid', choice: false }],
        reward: { grantId: 'rw.side', moneyCents: 500, items: [{ itemId: 'item.map', qty: 1 }] },
      },
      'q.gate': {
        optional: false, end: true, requires: { quests: ['q.mid'], items: ['item.gold'] },
        objectives: [], transitions: [],
      },
      'q.end': {
        optional: false, end: true, objectives: [], transitions: [],
        reward: { grantId: 'rw.end', moneyCents: 1_000, items: [] },
      },
      'q.bonus': { optional: false, end: true, objectives: [], transitions: [] },
      'q.stuck': { optional: false, end: false, objectives: [], transitions: [] },
      'q.secret': { optional: false, end: false, requires: { quests: ['q.mid'], items: [] }, objectives: [], transitions: [] },
    },
    dialogues: {
      'dlg.ann': {
        npcId: 'npc.ann', start: 'hi',
        nodes: {
          hi: { choices: [
            { next: 'bike', when: { transport: 'transport.bike' }, effects: [{ setFlag: 'f.biker' }, { remember: 'm.biker' }] },
            { next: 'gossip', when: { all: [{ flag: 'f.met' }, { notFlag: 'f.biker' }] }, effects: [] },
            { next: 'bye', effects: [{ setFlag: 'f.met' }, { completeObjective: { quest: 'q.mid', objective: 'meet-ann' } }] },
            { next: 'bye', when: { quest: 'q.mid', status: 'completed' }, effects: [{ startQuest: 'q.secret' }] },
            { next: 'bye', when: { any: [{ flag: 'f.never' }, { flag: 'f.met' }] }, effects: [{ startQuest: 'q.gate' }] },
            // GAME-48: пам'ять Енн — «а, це ти на велосипеді!» лише тому, хто їй це сказав.
            { next: 'gossip', when: { remembers: 'm.biker' }, effects: [] },
            { next: 'bye', when: { notRemembers: 'm.biker' }, effects: [] },
          ] },
          bike: { next: 'bye' },
          gossip: { next: 'bye' },
          bye: { end: true },
        },
      },
      // У Боба немає цілі talk — ціль q.mid закриває лише ефект репліки (completeObjective).
      'dlg.bob': {
        npcId: 'npc.bob', start: 'hi',
        nodes: { hi: { choices: [{ next: 'bye', effects: [{ completeObjective: { quest: 'q.mid', objective: 'meet-ann' } }] }] }, bye: { end: true } },
      },
    },
  },
};

/** Команда без commandId (розподільно по варіантах — звичайний Omit злипає об'єднання). */
export type Step = Command extends infer C ? (C extends Command ? Omit<C, 'commandId'> : never) : never;

let n = 0;
/** Прогнати команди; кожна мусить пройти — інакше тест падає з назвою кроку. */
export function play(cmds: readonly Step[], from: GameState = initialState(0), defs: CoreDefs = STORY_DEFS): GameState {
  let s = from;
  for (const c of cmds) {
    const r = dispatch(s, { ...c, commandId: `t${n++}` } as Command, defs);
    if (!r.ok) throw new Error(`${c.type} ${JSON.stringify(c)} → ${r.code}`);
    s = r.state;
  }
  return s;
}

export const BIKER = { type: 'CreateCharacter', profileId: 'profile.a', transportId: 'transport.bike' } as const;
export const DRIVER = { type: 'CreateCharacter', profileId: 'profile.b', transportId: 'transport.car' } as const;

/**
 * Той самий сюжет із дорогами (GAME-31): дім ↔ крамниця напряму лише автом (10 хв, 3 €); велосипедом —
 * через собачий парк (замкнений для гравця без собаки, але проїхати крізь нього можна): 15 + 15 хв, 0 €.
 */
const way = (minutes: number, cents: number) => ({ minutes, cents });
export const ROAD_DEFS: CoreDefs = {
  ...STORY_DEFS,
  story: {
    ...(STORY_DEFS.story as NonNullable<CoreDefs['story']>),
    roads: [
      { from: 'loc.home', to: 'loc.shop', ways: { 'transport.car': way(10, 300) } },
      { from: 'loc.shop', to: 'loc.home', ways: { 'transport.car': way(10, 300) } },
      { from: 'loc.home', to: 'loc.dogpark', ways: { 'transport.bike': way(15, 0), 'transport.car': way(5, 100) } },
      { from: 'loc.dogpark', to: 'loc.shop', ways: { 'transport.bike': way(15, 0), 'transport.car': way(5, 100) } },
    ],
  },
};

/** Дороги + подія в дорозі (GAME-31): у крамниці з шансом 50 % — «дощ», одна відповідь, кінець. */
export const EVENT_DEFS: CoreDefs = {
  ...ROAD_DEFS,
  story: {
    ...(ROAD_DEFS.story as NonNullable<CoreDefs['story']>),
    dialogues: {
      ...(ROAD_DEFS.story as NonNullable<CoreDefs['story']>).dialogues,
      'dlg.ev-rain': {
        trigger: { at: ['loc.shop'], chance: 50 }, start: 'rain',
        nodes: { rain: { choices: [{ next: 'bye', effects: [{ setFlag: 'f.wet' }] }] }, bye: { end: true } },
      },
    },
  },
};

/**
 * Навички й ремонт (GAME-72): той самий сюжет, де дороги мають небезпеку, у крамниці продають ключ, камеру,
 * мультиметр і пічку, а профіль `profile.mech` — механік і електрик на рангах 5 (старт професії).
 * Колесо велосипеда: механіка ≥ 2, ключ (лишається) і камера (витрачається). Лампа: електрика ≥ 1, мультиметр.
 */
const risky = (minutes: number, cents: number, risk: number) => ({ minutes, cents, risk });
const ROAD_STORY = ROAD_DEFS.story as NonNullable<CoreDefs['story']>;
export const SKILL_DEFS: CoreDefs = {
  items: {
    'item.wrench': { buyCents: 1_000 },
    'item.tube': { buyCents: 300 },
    'item.multimeter': { buyCents: 2_000 },
    'item.stove': { buyCents: 300, sellCents: 100 },
  },
  interactions: {},
  repairs: {
    'obj.bike-wheel': { skill: 'skill.mechanics', minRank: 2, tool: 'item.wrench', part: 'item.tube', flag: 'f.wheel-fixed' },
    'obj.lamp': { skill: 'skill.electrics', minRank: 1, tool: 'item.multimeter', flag: 'f.lamp-fixed' },
  },
  story: {
    ...ROAD_STORY,
    profiles: {
      ...ROAD_STORY.profiles,
      'profile.mech': { startSkills: { 'skill.mechanics': 5, 'skill.electrics': 5 } },
      'profile.novice': { startSkills: { 'skill.mechanics': 1 } },
    },
    // Автом напряму — небезпечна дорога (3); велосипедом через парк — 1, потім 2.
    roads: [
      { from: 'loc.home', to: 'loc.shop', ways: { 'transport.car': risky(10, 0, 3) } },
      { from: 'loc.shop', to: 'loc.home', ways: { 'transport.car': risky(10, 0, 3) } },
      { from: 'loc.home', to: 'loc.dogpark', ways: { 'transport.bike': risky(15, 0, 1), 'transport.car': risky(6, 0, 0) } },
      { from: 'loc.dogpark', to: 'loc.shop', ways: { 'transport.bike': risky(15, 0, 2), 'transport.car': risky(6, 0, 0) } },
      { from: 'loc.shop', to: 'loc.dogpark', ways: { 'transport.bike': risky(15, 0, 2) } },
      { from: 'loc.dogpark', to: 'loc.home', ways: { 'transport.bike': risky(15, 0, 1) } },
    ],
  },
};

export const MECHANIC = { type: 'CreateCharacter', profileId: 'profile.mech', transportId: 'transport.car' } as const;
export const NOVICE = { type: 'CreateCharacter', profileId: 'profile.novice', transportId: 'transport.car' } as const;
