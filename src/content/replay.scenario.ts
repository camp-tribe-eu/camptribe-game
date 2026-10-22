// Сценарій для еталонного реплею (GAME-34): справжній Пролог на справжньому каталозі гри (GAME_DEFS),
// велосипедист з побічною гілкою Еліз, з кадрами між діями — годинник і RNG теж у хеші.
import type { Command } from '../core/commands';
import type { Input } from '../core/sim';

let n = 0;
const c = (cmd: Record<string, unknown>): Input => ({ kind: 'command', command: { ...cmd, commandId: `r${n++}` } as unknown as Command });
const frames = (k: number, ms = 250): Input[] => Array.from({ length: k }, () => ({ kind: 'frame', realMs: ms }) as Input);

export const SEED = 20261023;
export const START_MONEY = 5_000;

export const PROLOGUE_BIKE: readonly Input[] = [
  ...frames(8),
  c({ type: 'CreateCharacter', profileId: 'profile.solo-explorer', transportId: 'transport.bike' }),
  c({ type: 'Visit', locationId: 'loc.home' }), c({ type: 'CompleteQuest', questId: 'ST-001' }), ...frames(4),
  c({ type: 'Visit', locationId: 'loc.home' }), c({ type: 'CompleteQuest', questId: 'ST-002' }),
  c({ type: 'Visit', locationId: 'loc.shop' }), ...frames(6),
  c({ type: 'Pickup', itemId: 'item.tent' }), c({ type: 'Pickup', itemId: 'item.sleeping-bag' }),
  c({ type: 'BuyItem', itemId: 'item.firewood' }),                                       // купівля: гроші в хеші
  c({ type: 'Pickup', itemId: 'item.tent' }),                                            // відмова (уже в руках) теж у журналі
  c({ type: 'CompleteQuest', questId: 'ST-003' }), ...frames(4),
  c({ type: 'Visit', locationId: 'loc.road' }), ...frames(12, 1000),                     // дорога: хвилини й знахідки
  { kind: 'pause' }, ...frames(3, 1000), { kind: 'advance', minutes: 30 }, { kind: 'resume' }, // пауза меню, перемотування (рецензія GAME-34)
  c({ type: 'CompleteQuest', questId: 'ST-004', to: 'q.elise-bike-area' }),
  c({ type: 'Visit', locationId: 'loc.camp.lake' }),
  c({ type: 'Talk', npcId: 'npc.elise' }), c({ type: 'Choose', choice: 0 }), c({ type: 'Continue' }), c({ type: 'Choose', choice: 0 }), c({ type: 'Continue' }),
  c({ type: 'CompleteQuest', questId: 'q.elise-bike-area' }), ...frames(4),
  c({ type: 'Interact', targetId: 'obj.campfire' }),
  c({ type: 'Talk', npcId: 'npc.elise' }), c({ type: 'Choose', choice: 1 }), c({ type: 'Choose', choice: 0 }), c({ type: 'Continue' }),
  c({ type: 'Visit', locationId: 'loc.camp.lake' }), c({ type: 'Pickup', itemId: 'item.firewood' }),
  c({ type: 'CompleteQuest', questId: 'ST-005' }), ...frames(8),
];
