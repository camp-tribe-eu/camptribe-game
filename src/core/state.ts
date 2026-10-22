// Стан проходження (DATA_CONTRACTS DC-040…052). Лише дані: жодних класів, щоб стан
// серіалізувався в сейв без втрат і порівнювався побайтно.

export interface CommandRecord {
  readonly ok: boolean;
  readonly code?: RejectCode;
  /** Відбиток вмісту команди: той самий commandId з іншим вмістом → COMMAND_ID_REUSED. */
  readonly fp: string;
}

export interface GameState {
  readonly schemaVersion: 1;
  /** Баланс у центах EUR (CR-040). */
  readonly moneyCents: number;
  /** id предмета → кількість, лише додатні. */
  readonly inventory: Readonly<Record<string, number>>;
  /** Видані `grantId` (TD-004): нагорода — рівно раз. */
  readonly grants: readonly string[];
  /** Оброблені `commandId` і їхній результат: повтор повертає той самий результат. */
  readonly processed: Readonly<Record<string, CommandRecord>>;
}

export const REJECT_CODES = [
  'INVALID_COMMAND',
  'INVALID_AMOUNT',
  'INSUFFICIENT_FUNDS',
  'ITEM_NOT_OWNED',
  'GRANT_ALREADY_GIVEN',
  'COMMAND_ID_REUSED',
] as const;

export type RejectCode = (typeof REJECT_CODES)[number];

export function initialState(moneyCents = 0): GameState {
  return { schemaVersion: 1, moneyCents, inventory: {}, grants: [], processed: {} };
}
