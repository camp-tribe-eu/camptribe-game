// Рецензія сейвів: сейв, чий кінець недосяжний на нинішньому контенті, — не «придатний», навіть
// якщо всі id на місці (змінився перехід, requires чи джерело предмета).
import { describe, expect, it } from 'vitest';
import { dispatch, nextCommandId, type Command } from '../core/commands';
import { initialState, type GameState } from '../core/state';
import { GAME_DEFS } from './slice-defs';
import { CONTENT, compileStory } from './story';
import { saveViable } from './viability';

const play = (cmds: Record<string, unknown>[]): GameState => cmds.reduce<GameState>((s, c) => {
  const r = dispatch(s, { ...c, commandId: nextCommandId(s) } as unknown as Command, GAME_DEFS);
  if (!r.ok) throw new Error(`${String(c.type)} → ${r.code}`);
  return r.state;
}, initialState(5_000));

const AT_ST004 = play([
  { type: 'CreateCharacter', profileId: 'profile.family-teen', transportId: 'transport.car' },
  { type: 'Visit', locationId: 'loc.home' }, { type: 'CompleteQuest', questId: 'PROLOGUE-HOME-001' }, { type: 'CompleteQuest', questId: 'ST-001' },
  { type: 'Visit', locationId: 'loc.home' }, { type: 'CompleteQuest', questId: 'ST-002' },
  { type: 'Visit', locationId: 'loc.shop' }, { type: 'Pickup', itemId: 'item.tent' }, { type: 'Pickup', itemId: 'item.sleeping-bag' },
  { type: 'CompleteQuest', questId: 'ST-003' }, { type: 'Visit', locationId: 'loc.home' }, { type: 'CompleteQuest', questId: 'CH1-HOME-001' },
]);

describe('придатність сейву на нинішньому контенті', () => {
  it('звичайний сейв посеред Прологу — придатний; ще без персонажа — теж', () => {
    expect(AT_ST004.quests['ST-004']?.status).toBe('active');
    expect(saveViable(AT_ST004, GAME_DEFS)).toBe(true);
    expect(saveViable(initialState(0), GAME_DEFS)).toBe(true);
  });

  it('усі id на місці, але перехід ST-004 → ST-005 прибрано: водію кінця не дістатись — НЕ придатний', () => {
    const broken = structuredClone(CONTENT);
    const st004 = broken.quests.find((q) => q.id === 'ST-004');
    if (st004) st004.transitions = st004.transitions.filter((t) => t.to !== 'ST-005');
    expect(saveViable(AT_ST004, { ...GAME_DEFS, story: compileStory(broken) })).toBe(false);
  });

  it('ліміт пошуку вичерпано — чесне «не знаю» (undefined), а не «так» чи «ні»', () => {
    expect(saveViable(AT_ST004, GAME_DEFS, 1)).toBeUndefined();
  });
});
