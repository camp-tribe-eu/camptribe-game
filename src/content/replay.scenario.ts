// Сценарій для еталонного реплею (GAME-34): справжній Пролог на справжньому каталозі гри (GAME_DEFS),
// велосипедист з побічною гілкою Еліз, з кадрами між діями — годинник і RNG теж у хеші.
import type { Command } from '../core/commands';
import type { Input } from '../core/sim';

let n = 0;
const c = (cmd: Record<string, unknown>): Input => ({ kind: 'command', command: { ...cmd, commandId: `r${n++}` } as unknown as Command });
const frames = (k: number, ms = 250): Input[] => Array.from({ length: k }, () => ({ kind: 'frame', realMs: ms }) as Input);

export const SEED = 20261023;
// 10 000: найдешевше, що крамниця справді продає (синтетичний спальник, 8 900), — GAME-81: дрова й ліхтар більше не продаються.
export const START_MONEY = 10_000;

export const PROLOGUE_BIKE: readonly Input[] = [
  ...frames(8),
  c({ type: 'CreateCharacter', profileId: 'profile.solo-explorer', transportId: 'transport.bike' }),
  c({ type: 'CompleteQuest', questId: 'PROLOGUE-HOME-001' }),                           // GAME-138: вечір удома — перший етап дня 1
  c({ type: 'CompleteQuest', questId: 'ST-001' }), ...frames(4),                         // GAME-84 №1: «Піти: Дім» удома більше не потрібне — ціль виконано стартом
  c({ type: 'CompleteQuest', questId: 'ST-002' }),
  c({ type: 'Visit', locationId: 'loc.shop' }), ...frames(6),
  c({ type: 'Pickup', itemId: 'item.tent' }), c({ type: 'Pickup', itemId: 'item.sleeping-bag' }),
  c({ type: 'BuyItem', itemId: 'item.sleeping-bag-synthetic' }),                         // купівля в крамниці: гроші в хеші
  c({ type: 'Pickup', itemId: 'item.tent' }),                                            // відмова (уже в руках) теж у журналі
  c({ type: 'CompleteQuest', questId: 'ST-003' }), ...frames(4),
  c({ type: 'Visit', locationId: 'loc.home' }),                                         // GAME-138: CH1-HOME-001 — пакування вдома (без кадрів: кидок події на дорозі лишається «не сталась», як до GAME-138)
  // GAME-109: пакування (велосипед — 10 од.): міняємо ліхтар на перекуси, подушка не вміщається (відмова в журналі), «автоматично» повертає як було
  c({ type: 'UnpackItem', itemId: 'item.lantern' }), c({ type: 'PackItem', itemId: 'item.snacks' }), c({ type: 'PackItem', itemId: 'item.big-cushion' }), c({ type: 'AutoPack' }),
  c({ type: 'CompleteQuest', questId: 'CH1-HOME-001' }),
  c({ type: 'Visit', locationId: 'loc.road' }), ...frames(12, 1000),                     // дорога: хвилини й знахідки
  { kind: 'pause' }, ...frames(3, 1000), { kind: 'advance', minutes: 30 }, { kind: 'resume' }, // пауза меню, перемотування (рецензія GAME-34)
  c({ type: 'CompleteQuest', questId: 'ST-004', to: 'q.elise-bike-area' }),
  c({ type: 'Visit', locationId: 'loc.camp.lake' }),
  c({ type: 'Talk', npcId: 'npc.elise' }), c({ type: 'Choose', choice: 0 }), c({ type: 'Continue' }), c({ type: 'Continue' }), c({ type: 'Choose', choice: 0 }), c({ type: 'Continue' }),
  c({ type: 'CompleteQuest', questId: 'q.elise-bike-area' }), ...frames(4),
  c({ type: 'Interact', targetId: 'obj.campfire' }),
  c({ type: 'Talk', npcId: 'npc.elise' }), c({ type: 'Choose', choice: 3 }), c({ type: 'Choose', choice: 5 }), c({ type: 'Continue' }), // друга розмова: «нагадай» (вона вже знайома)
  c({ type: 'Pickup', itemId: 'item.firewood' }),
  c({ type: 'CompleteQuest', questId: 'ST-005' }), ...frames(8),
];
