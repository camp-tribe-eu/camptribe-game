// GAME-138 (рецензія PR #62): сейв, записаний ДО переносу ключа loc.road з ST-003 на CH1-HOME-001, не мусить зачинити дорогу.
import { describe, expect, it } from 'vitest';
import { dispatch, nextCommandId, type Command } from '../core/commands';
import { initialState, type GameState } from '../core/state';
import { newSim, type SimState } from '../core/sim';
import { fromSave, serialize } from '../core/save';
import { stateHash } from '../core/hash';
import { endReachable } from './bot';
import { GAME_DEFS } from './slice-defs';
import { LIFE } from './life';
import { STORY } from './story';

const play = (cmds: Record<string, unknown>[]): GameState => cmds.reduce<GameState>((s, c) => {
  const r = dispatch(s, { ...c, commandId: nextCommandId(s) } as unknown as Command, GAME_DEFS);
  if (!r.ok) throw new Error(`${String(c.type)} → ${r.code}`);
  return r.state;
}, initialState(5_000));

const TO_ST003 = [
  { type: 'CreateCharacter', profileId: 'profile.family-teen', transportId: 'transport.car' },
  { type: 'Visit', locationId: 'loc.home' }, { type: 'CompleteQuest', questId: 'PROLOGUE-HOME-001' }, { type: 'CompleteQuest', questId: 'ST-001' },
  { type: 'Visit', locationId: 'loc.home' }, { type: 'CompleteQuest', questId: 'ST-002' },
  { type: 'Visit', locationId: 'loc.shop' }, { type: 'Pickup', itemId: 'item.tent' }, { type: 'Pickup', itemId: 'item.sleeping-bag' },
  { type: 'CompleteQuest', questId: 'ST-003' },
];
const AT_ST004 = play([...TO_ST003, { type: 'Visit', locationId: 'loc.home' }, { type: 'CompleteQuest', questId: 'CH1-HOME-001' }]);
const ON_ROAD = play([...TO_ST003, { type: 'Visit', locationId: 'loc.home' }, { type: 'CompleteQuest', questId: 'CH1-HOME-001' }, { type: 'Visit', locationId: 'loc.road' }]);

/** Сейв «з main до PR»: квесту CH1-HOME-001 (і PROLOGUE-HOME-001) у ньому немає зовсім. */
const oldSave = (g: GameState): string => {
  const quests = Object.fromEntries(Object.entries(g.quests).filter(([q]) => q !== 'CH1-HOME-001' && q !== 'PROLOGUE-HOME-001'));
  const sim: SimState = { ...newSim(1, 5_000), game: { ...g, quests } };
  return serialize(sim, 'old-rev');
};
const load = (json: string): SimState => {
  const r = fromSave(json, { story: STORY, life: LIFE });
  if (!r.ok) throw new Error(`${r.code}: ${r.detail}`);
  return r.sim;
};
const roadOpen = (g: GameState): boolean => dispatch(g, { type: 'Visit', locationId: 'loc.road', commandId: nextCommandId(g) } as unknown as Command, GAME_DEFS).ok;

describe('старий сейв (до CH1-HOME-001) після завантаження', () => {
  it('(a) ST-004 активний, CH1-HOME-001 немає: дорога відкрита, кінець розділу досяжний', () => {
    const json = oldSave(AT_ST004);
    expect(AT_ST004.quests['ST-004']?.status).toBe('active');
    expect(Object.hasOwn(JSON.parse(json).sim.game.quests, 'CH1-HOME-001')).toBe(false);   // сейв справді «старий»
    const g = load(json).game;
    expect(g.quests['CH1-HOME-001']?.status).toBe('completed');
    expect(roadOpen(g)).toBe(true);
    expect(endReachable(g, GAME_DEFS, new Map(), 20_000)).toBe(true);
  });
  it('(b) гравець стоїть на loc.road: так само, і ремонт ідемпотентний', () => {
    const json = oldSave(ON_ROAD);
    expect(ON_ROAD.player?.locationId).toBe('loc.road');
    const sim = load(json);
    expect(sim.game.quests['CH1-HOME-001']?.status).toBe('completed');
    expect(roadOpen(sim.game)).toBe(true);
    expect(endReachable(sim.game, GAME_DEFS, new Map(), 20_000)).toBe(true);
    expect(stateHash(load(serialize(sim, 'x')))).toBe(stateHash(sim));
  });
  it('(c) свіжий сейв і сейв посеред CH1-HOME-001 — без змін', () => {
    const fresh = serialize(newSim(1, 5_000), 'r');
    expect(stateHash(load(fresh))).toBe(stateHash(newSim(1, 5_000)));
    const mid = play(TO_ST003);
    expect(mid.quests['CH1-HOME-001']?.status).toBe('active');
    const midSim: SimState = { ...newSim(1, 5_000), game: mid };
    expect(stateHash(load(serialize(midSim, 'r')))).toBe(stateHash(midSim));
    expect(roadOpen(mid)).toBe(false);   // дорога в нових сейвах і далі зачинена до CH1-HOME-001
  });
});
