// Журнал, з якого записано вічну фікстуру tests/saves/v2.json (GAME-29): персонаж, квести,
// нагорода — щоб фікстура несла всі поля v2, а не лише нулі.
import type { Input } from './sim';

const cmd = (commandId: string, c: object): Input => ({ kind: 'command', command: { commandId, ...c } as never });

export const V2_STORY: readonly Input[] = [
  cmd('v2a', { type: 'CreateCharacter', profileId: 'profile.a', transportId: 'transport.bike' }),
  cmd('v2b', { type: 'Visit', locationId: 'loc.home' }),
  cmd('v2c', { type: 'CompleteQuest', questId: 'q.start', to: 'q.side' }),
  cmd('v2d', { type: 'Visit', locationId: 'loc.shop' }),
  cmd('v2e', { type: 'CompleteQuest', questId: 'q.side' }),
  cmd('v2f', { type: 'Pickup', itemId: 'item.gold' }),
];
