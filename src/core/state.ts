// Стан проходження (DATA_CONTRACTS DC-040…052). Лише дані: жодних класів, щоб стан
// серіалізувався в сейв без втрат і порівнювався побайтно.

export interface CommandRecord {
  readonly ok: boolean;
  readonly code?: RejectCode;
  /** Відбиток вмісту команди: той самий commandId з іншим вмістом → COMMAND_ID_REUSED. */
  readonly fp: string;
}

/** Персонаж (DC-042): вибір на старті й місце в світі — локація, не пікселі. */
export interface PlayerState {
  readonly profileId: string;
  readonly transportId: string;
  /** `animal.none` — без тварини (як у валідаторі). */
  readonly animalId: string;
  readonly locationId: string | null;
}

export type QuestStatus = 'active' | 'completed' | 'declined';

/** Стан квесту (DC-050): статус і виконані цілі `visit`/`talk`. Цілі `collect` рахуються з інвентаря. */
export interface QuestProgress {
  readonly status: QuestStatus;
  readonly done: readonly string[];
}

export interface GameState {
  readonly schemaVersion: 2;
  /** Баланс у центах EUR (CR-040). */
  readonly moneyCents: number;
  /** id предмета → кількість, лише додатні. */
  readonly inventory: Readonly<Record<string, number>>;
  /** Видані `grantId` (TD-004): нагорода — рівно раз. */
  readonly grants: readonly string[];
  /** Оброблені `commandId` і їхній результат: повтор повертає той самий результат. */
  readonly processed: Readonly<Record<string, CommandRecord>>;
  /**
   * Лічильник нових (не повторних) команд. Місток будує з нього наступний `commandId`, тож
   * після завантаження сейву id не повторюється (рецензія TL PR #13: лічильник сцени скидався в 0).
   */
  readonly seq: number;
  /** null — персонажа ще не створено (GAME-29). */
  readonly player: PlayerState | null;
  /** id квесту → стан. Квести, яких тут немає, ще не відкривались. */
  readonly quests: Readonly<Record<string, QuestProgress>>;
  /** Завершено етап із `end: true` (кінець розділу). */
  readonly campaignEnded: boolean;
}

export const REJECT_CODES = [
  'INVALID_COMMAND',
  'INVALID_AMOUNT',
  'INSUFFICIENT_FUNDS',
  'ITEM_NOT_OWNED',
  'GRANT_ALREADY_GIVEN',
  'COMMAND_ID_REUSED',
  'UNKNOWN_ITEM',
  'UNKNOWN_TARGET',
  'NOT_FOR_SALE',
  // GAME-29 · квести й світ
  'NO_CHARACTER',
  'CHARACTER_EXISTS',
  'INVALID_CHOICE',
  'LOCKED',
  'NOT_HERE',
  'ITEM_ALREADY_HELD',
  'QUEST_NOT_ACTIVE',
  'QUEST_OBJECTIVES_OPEN',
  'QUEST_REQUIRES_UNMET',
  'QUEST_NOT_OPTIONAL',
  'QUEST_NO_EXIT',
] as const;

export type RejectCode = (typeof REJECT_CODES)[number];

export function initialState(moneyCents = 0): GameState {
  return { schemaVersion: 2, moneyCents, inventory: {}, grants: [], processed: {}, seq: 0, player: null, quests: {}, campaignEnded: false };
}
