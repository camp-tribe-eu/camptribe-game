// Журнал, з якого записано вічну фікстуру tests/saves/v2.json (GAME-29): персонаж, квести,
// нагорода, прапорець і відкритий діалог — щоб фікстура несла всі поля v2, а не лише нулі.
import type { Input } from './sim';

const cmd = (commandId: string, c: object): Input => ({ kind: 'command', command: { commandId, ...c } as never });

export const V2_STORY: readonly Input[] = [
  cmd('v2a', { type: 'CreateCharacter', profileId: 'profile.a', transportId: 'transport.bike' }),
  cmd('v2b', { type: 'Visit', locationId: 'loc.home' }),
  cmd('v2c', { type: 'CompleteQuest', questId: 'q.start', to: 'q.side' }),
  cmd('v2d', { type: 'Visit', locationId: 'loc.shop' }),
  cmd('v2e', { type: 'CompleteQuest', questId: 'q.side' }),
  cmd('v2f', { type: 'Pickup', itemId: 'item.gold' }),
  cmd('v2g', { type: 'Talk', npcId: 'npc.ann' }),
  cmd('v2h', { type: 'Choose', choice: 0 }),                 // велосипедист: прапорець f.biker, діалог відкритий
];

/**
 * Журнал вічної фікстури tests/saves/v3.json (GAME-71): той самий V2_STORY на LIFE_DEFS (сюжет + календар), далі
 * місяць гри (25 червня — виплата велосипедисту) і заброньована відпустка — щоб фікстура несла `life` не лише нулями.
 */
export const V3_LIFE: readonly Input[] = [
  { kind: 'advance', minutes: 30 * 1440 },
  cmd('v3a', { type: 'BookLeave', from: 40, days: 3 }),
];
