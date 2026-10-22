// Командна шина ядра (TD-004, CR-031…033). UI не змінює стан — він надсилає команду; ядро
// або застосовує її повністю, або відмовляє з кодом і повертає вихідний стан без змін.

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
const isId = (s: string): boolean => typeof s === 'string' && s.length > 0;

function apply(cmd: Command, d: Draft, guard: Safeguards): RejectCode | null {
  switch (cmd.type) {
    case 'BuyItem':
      if (!isId(cmd.itemId)) return 'INVALID_COMMAND';
      if (!isCents(cmd.priceCents)) return 'INVALID_AMOUNT';
      d.moneyCents -= cmd.priceCents;
      d.inventory[cmd.itemId] = (d.inventory[cmd.itemId] ?? 0) + 1;
      if (d.moneyCents < 0) return 'INSUFFICIENT_FUNDS';
      return null;
    case 'SellItem': {
      if (!isId(cmd.itemId)) return 'INVALID_COMMAND';
      if (!isCents(cmd.priceCents)) return 'INVALID_AMOUNT';
      const have = d.inventory[cmd.itemId] ?? 0;
      if (have < 1) return 'ITEM_NOT_OWNED';
      d.inventory[cmd.itemId] = have - 1;
      // Інвентар тримає лише додатні кількості: нуль прибираємо перебудовою, без delete.
      if (have === 1) d.inventory = Object.fromEntries(Object.entries(d.inventory).filter(([, q]) => q > 0));
      d.moneyCents += cmd.priceCents;
      return null;
    }
    case 'GrantReward': {
      if (!isId(cmd.grantId)) return 'INVALID_COMMAND';
      if (!isCents(cmd.moneyCents)) return 'INVALID_AMOUNT';
      if (guard.grantId && d.grants.includes(cmd.grantId)) return 'GRANT_ALREADY_GIVEN';
      d.moneyCents += cmd.moneyCents;
      for (const { itemId, qty } of cmd.items ?? []) {
        if (!isId(itemId)) return 'INVALID_COMMAND';
        if (!Number.isSafeInteger(qty) || qty < 1) return 'INVALID_AMOUNT';
        d.inventory[itemId] = (d.inventory[itemId] ?? 0) + qty;
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
 * Відмова повертає ТОЙ САМИЙ об'єкт стану — атомарність перевіряється побайтно.
 */
export function dispatch(state: GameState, cmd: Command, guard: Safeguards = SAFE): DispatchResult {
  if (!cmd || typeof cmd !== 'object' || !isId(cmd.commandId)) {
    return { ok: false, state, code: 'INVALID_COMMAND', repeated: false };
  }
  const seen = state.processed[cmd.commandId];
  if (guard.commandId && seen) {
    return seen.ok
      ? { ok: true, state, repeated: true }
      : { ok: false, state, code: seen.code ?? 'INVALID_COMMAND', repeated: true };
  }

  // Робимо зміни на чернетці; без rollback (мутація) — просто на копії, яку повертаємо й при відмові.
  const draft: Draft = { moneyCents: state.moneyCents, inventory: { ...state.inventory }, grants: [...state.grants] };
  const code = apply(cmd, draft, guard);
  const record: CommandRecord = code ? { ok: false, code } : { ok: true };
  const processed = { ...state.processed, [cmd.commandId]: record };

  if (code) {
    // Відмова теж запам'ятовується за commandId (повтор поверне ту саму відмову), але решта стану — вихідна.
    const rejected: GameState = guard.rollback
      ? { ...state, processed }
      : { ...state, ...draft, processed };
    return { ok: false, state: rejected, code, repeated: false };
  }
  return { ok: true, state: { ...state, ...draft, processed }, repeated: false };
}
