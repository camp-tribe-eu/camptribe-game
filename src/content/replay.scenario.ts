// Сценарій для еталонного реплею (GAME-34): справжній Пролог на справжньому каталозі гри (GAME_DEFS),
// велосипедист з побічною гілкою Еліз, з кадрами між діями — годинник і RNG теж у хеші. GAME-141: день 1 закінчується на
// ST-005 (межа дня, не кінець розділу), далі день 2 — ранок, порада Елізи, велозона (тепер на дні 2), вечеря; GAME-144: день 3 — речі,
// прощання з Елізою, дорога додому — до кінця розділу (CH1-D3-HOME-001).
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
  // GAME-245: речі вдома (велосипед — 12 од.): ліхтар знімаємо з авто (розклад «за порадою»), беремо ліхтар, подушку й телефони (повторне «взяти» і старий «покласти» — відмови в журналі),
  // «Завантажити» — потрібне й ліхтар в авто, подушка й телефони не влізли; «лишити» повертає їх додому, сумка порожня.
  c({ type: 'UnpackItem', itemId: 'item.lantern' }), c({ type: 'TakeItem', itemId: 'item.lantern' }), c({ type: 'TakeItem', itemId: 'item.lantern' }),
  c({ type: 'TakeItem', itemId: 'item.big-cushion' }), c({ type: 'PackItem', itemId: 'item.big-cushion' }), c({ type: 'TakeItem', itemId: 'item.phones' }),
  c({ type: 'LoadCar' }), c({ type: 'LeaveItem', itemId: 'item.big-cushion' }), c({ type: 'LeaveItem', itemId: 'item.phones' }), c({ type: 'LoadCar' }), c({ type: 'AutoPack' }),
  c({ type: 'CompleteQuest', questId: 'CH1-HOME-001' }),
  c({ type: 'Visit', locationId: 'loc.road' }), ...frames(12, 1000),                     // дорога: хвилини й знахідки
  { kind: 'pause' }, ...frames(3, 1000), { kind: 'advance', minutes: 30 }, { kind: 'resume' }, // пауза меню, перемотування (рецензія GAME-34)
  c({ type: 'CompleteQuest', questId: 'ST-004' }),                                     // GAME-141: велозона більше не з ST-004 — вона на дні 2
  c({ type: 'Visit', locationId: 'loc.camp.lake' }),
  c({ type: 'Talk', npcId: 'npc.elise' }), c({ type: 'Choose', choice: 0 }), c({ type: 'Continue' }), c({ type: 'Continue' }), c({ type: 'Choose', choice: 0 }), c({ type: 'Continue' }),
  ...frames(4),
  c({ type: 'Interact', targetId: 'obj.campfire' }),
  c({ type: 'Talk', npcId: 'npc.elise' }), c({ type: 'Choose', choice: 3 }), c({ type: 'Choose', choice: 5 }), c({ type: 'Continue' }), // друга розмова: «нагадай» (вона вже знайома)
  c({ type: 'Pickup', itemId: 'item.firewood' }),
  c({ type: 'CompleteQuest', questId: 'ST-005' }), ...frames(8),                        // намет стоїть (dayEnd), розділ триває
  // GAME-256: день 2 чекає сну. Вільний час до вечора (перемотування), «Спати» у наметі → 07:00 дня 2 — це й закриває день 1.
  { kind: 'advance', minutes: 400 }, c({ type: 'Sleep' }),
  // День 2 (GAME-141): ранок → порада Елізи (прийнято) → велозона (погодились) → «дякую за велозону» → вечеря просто → кінець розділу.
  c({ type: 'CompleteQuest', questId: 'CH1-D2-001' }),                                  // ціль «ранок» виконано входом (гравець біля озера)
  c({ type: 'Talk', npcId: 'npc.elise' }), c({ type: 'Choose', choice: 10 }), c({ type: 'Choose', choice: 0 }), c({ type: 'Choose', choice: 0 }), c({ type: 'Continue' }), c({ type: 'Continue' }),
  c({ type: 'CompleteQuest', questId: 'CH1-D2-ELISE-001', to: 'q.elise-bike-area' }), ...frames(4),
  c({ type: 'Talk', npcId: 'npc.elise' }), c({ type: 'Choose', choice: 11 }), c({ type: 'Choose', choice: 0 }), c({ type: 'Continue' }), c({ type: 'Continue' }),
  c({ type: 'CompleteQuest', questId: 'q.elise-bike-area' }),
  c({ type: 'Talk', npcId: 'npc.elise' }), c({ type: 'Choose', choice: 12 }), c({ type: 'Continue' }), c({ type: 'Continue' }),
  { kind: 'advance', minutes: 700 },                                                    // GAME-256: вечеря — не раніше 18:00 дня 2
  c({ type: 'Talk', npcId: 'npc.elise' }), c({ type: 'Choose', choice: 13 }), c({ type: 'Choose', choice: 1 }), c({ type: 'Continue' }), c({ type: 'Continue' }),
  c({ type: 'CompleteQuest', questId: 'CH1-D2-CAMP-001' }),
  c({ type: 'CompleteQuest', questId: 'CH1-D2-FIRE-001' }), ...frames(8),               // вечір біля вогнища (гачок GAME-142)
  c({ type: 'Sleep' }),                                                                  // GAME-256: сон закриває день 2 → день 3
  // День 3 (GAME-144): ранок → речі (спорядження сухе — нейтральна сцена) → прощання з Елізою (питання про тишу) → дорога → дім = кінець розділу.
  c({ type: 'CompleteQuest', questId: 'CH1-D3-001' }),
  c({ type: 'CompleteQuest', questId: 'CH1-D3-GEAR-001' }),
  c({ type: 'Talk', npcId: 'npc.elise' }), c({ type: 'Choose', choice: 14 }), c({ type: 'Continue' }), c({ type: 'Choose', choice: 1 }), c({ type: 'Continue' }), c({ type: 'Continue' }),
  c({ type: 'CompleteQuest', questId: 'CH1-D3-ELISE-001' }),
  c({ type: 'Visit', locationId: 'loc.road' }), ...frames(6, 1000),
  c({ type: 'CompleteQuest', questId: 'CH1-D3-RETURN-001' }),
  c({ type: 'Choose', choice: 1 }), c({ type: 'Continue' }),                             // дорогою додому випала скринька з яблуками (кидок кадрів): махнути рукою й далі
  c({ type: 'Visit', locationId: 'loc.home' }), ...frames(4, 1000),
  c({ type: 'CompleteQuest', questId: 'CH1-D3-HOME-001' }), ...frames(8),              // знову вдома: межа дня 3 і кінець розділу
];
