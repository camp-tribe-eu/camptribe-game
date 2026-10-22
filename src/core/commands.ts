// Командна шина ядра (TD-004, CR-031…033). UI не змінює стан — він надсилає команду; ядро
// або застосовує її повністю, або відмовляє з кодом, і решта стану лишається вихідною.

import type { CommandRecord, GameState, RejectCode } from './state';

export type Command =
  | { readonly type: 'BuyItem'; readonly commandId: string; readonly itemId: string; readonly priceCents: number }
  | { readonly type: 'SellItem'; readonly commandId: string; readonly itemId: string; readonly priceCents: number }
  | {
      readonly type: 'GrantReward';
      readonly commandId: string;
      readonly grantId: string;
      readonly moneyCents: number;
      readonly items?: readonly { readonly itemId: string; readonly qty: number }[];
    };

export type DispatchResult =
  | { readonly ok: true; readonly state: GameState; readonly repeated: boolean }
  | { readonly ok: false; readonly state: GameState; readonly code: RejectCode; readonly repeated: boolean };

/** Запобіжники шини. Усі `true` у грі; вимикаються лише в тестах-мутаціях (GAME-12). */
export interface Safeguards {
  readonly commandId: boolean;
  readonly grantId: boolean;
  readonly rollback: boolean;
}

const SAFE: Safeguards = { commandId: true, grantId: true, rollback: true };

type Draft = { moneyCents: number; inventory: Record<string, number>; grants: string[] };

const isCents = (n: number): boolean => Number.isSafeInteger(n) && n >= 0;

// id контенту — `префікс.назва` (DATA_CONTRACTS §1). Регулярний вираз заодно відсікає ключі
// прототипу (`toString`, `constructor`, `__proto__`): з ними звичайний об'єкт «має» предмет,
// якого ніхто не купував (рецензія PR #13).
const CONTENT_ID = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/;
// commandId генерує UI; та сама безпечна абетка, без ключів прототипу.
const COMMAND_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;
const RESERVED = new Set(['__proto__', 'constructor', 'prototype', 'toString', 'valueOf', 'hasOwnProperty']);

const isContentId = (s: unknown): s is string => typeof s === 'string' && CONTENT_ID.test(s);
const isCommandId = (s: unknown): s is string => typeof s === 'string' && COMMAND_ID.test(s) && !RESERVED.has(s);
const own = (o: Readonly<Record<string, number>>, k: string): number => (Object.hasOwn(o, k) ? (o[k] ?? 0) : 0);

/** Відбиток команди: той самий commandId з іншим вмістом — помилка UI, а не повтор. */
function fingerprint(cmd: Command): string {
  const s = JSON.stringify(cmd);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

function apply(cmd: Command, d: Draft, guard: Safeguards): RejectCode | null {
  switch (cmd.type) {
    case 'BuyItem': {
      if (!isContentId(cmd.itemId)) return 'INVALID_COMMAND';
      if (!isCents(cmd.priceCents)) return 'INVALID_AMOUNT';
      d.moneyCents -= cmd.priceCents;
      d.inventory[cmd.itemId] = own(d.inventory, cmd.itemId) + 1;
      if (d.moneyCents < 0) return 'INSUFFICIENT_FUNDS';
      return null;
    }
    case 'SellItem': {
      if (!isContentId(cmd.itemId)) return 'INVALID_COMMAND';
      if (!isCents(cmd.priceCents)) return 'INVALID_AMOUNT';
      const have = own(d.inventory, cmd.itemId);
      if (have < 1) return 'ITEM_NOT_OWNED';
      d.inventory[cmd.itemId] = have - 1;
      // Інвентар тримає лише додатні кількості: нуль прибираємо перебудовою, без delete.
      if (have === 1) d.inventory = Object.fromEntries(Object.entries(d.inventory).filter(([, q]) => q > 0));
      d.moneyCents += cmd.priceCents;
      return isCents(d.moneyCents) ? null : 'INVALID_AMOUNT';
    }
    case 'GrantReward': {
      if (!isContentId(cmd.grantId)) return 'INVALID_COMMAND';
      if (!isCents(cmd.moneyCents)) return 'INVALID_AMOUNT';
      if (guard.grantId && d.grants.includes(cmd.grantId)) return 'GRANT_ALREADY_GIVEN';
      d.moneyCents += cmd.moneyCents;
      if (!isCents(d.moneyCents)) return 'INVALID_AMOUNT'; // переповнення суми, не лише входу
      for (const { itemId, qty } of cmd.items ?? []) {
        if (!isContentId(itemId)) return 'INVALID_COMMAND';
        if (!Number.isSafeInteger(qty) || qty < 1) return 'INVALID_AMOUNT';
        d.inventory[itemId] = own(d.inventory, itemId) + qty;
        if (!Number.isSafeInteger(d.inventory[itemId])) return 'INVALID_AMOUNT';
      }
      d.grants.push(cmd.grantId);
      d.grants.sort();
      return null;
    }
    default:
      return 'INVALID_COMMAND';
  }
}

/**
 * Застосувати команду. Чиста функція: вхідний стан не змінюється ніколи.
 * Відмова повертає новий об'єкт, у якому від вихідного відрізняється лише `processed`
 * (запис про відмову — щоб повтор того самого commandId повернув ту саму відмову, DC §4).
 *
 * `processed` росте з кожною командою. Політику обрізання вирішує картка сейвів (GAME-33, OQ-SAVE-001).
 */
export function dispatch(state: GameState, cmd: Command, guard: Safeguards = SAFE): DispatchResult {
  if (!cmd || typeof cmd !== 'object' || !isCommandId(cmd.commandId)) {
    return { ok: false, state, code: 'INVALID_COMMAND', repeated: false };
  }
  const fp = fingerprint(cmd);
  const seen = Object.hasOwn(state.processed, cmd.commandId) ? state.processed[cmd.commandId] : undefined;
  if (guard.commandId && seen) {
    if (seen.fp !== fp) return { ok: false, state, code: 'COMMAND_ID_REUSED', repeated: true };
    return seen.ok
      ? { ok: true, state, repeated: true }
      : { ok: false, state, code: seen.code ?? 'INVALID_COMMAND', repeated: true };
  }

  const draft: Draft = { moneyCents: state.moneyCents, inventory: { ...state.inventory }, grants: [...state.grants] };
  const code = apply(cmd, draft, guard);
  const record: CommandRecord = code ? { ok: false, code, fp } : { ok: true, fp };
  const processed = { ...state.processed, [cmd.commandId]: record };

  if (code) {
    // Без rollback (лише мутація в тестах) часткові зміни чернетки протікли б у стан.
    const rejected: GameState = guard.rollback ? { ...state, processed } : { ...state, ...draft, processed };
    return { ok: false, state: rejected, code, repeated: false };
  }
  return { ok: true, state: { ...state, ...draft, processed }, repeated: false };
}
