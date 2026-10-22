// Командна шина ядра (TD-004, CR-031…035). Команда — НАМІР гравця; ефект (ціна, нагорода)
// ядро бере лише з каталогу визначень (CoreDefs). Застосовує повністю або відмовляє з кодом,
// і решта стану лишається вихідною. Успіх повертає події-факти (DC-061).

import type { CoreDefs } from './defs';
import type { CommandRecord, GameState, RejectCode } from './state';
import { applyStory, type StoryCommand, type StoryDraft } from './story';

export type { StoryCommand } from './story';

export type Command =
  | StoryCommand
  | { readonly type: 'BuyItem'; readonly commandId: string; readonly itemId: string }
  | { readonly type: 'SellItem'; readonly commandId: string; readonly itemId: string }
  | { readonly type: 'Interact'; readonly commandId: string; readonly targetId: string };

/** Підтверджений факт (CR-031). Причина — commandId команди, що його спричинила. */
export type GameEvent =
  | { readonly type: 'ItemPurchased'; readonly commandId: string; readonly itemId: string; readonly priceCents: number }
  | { readonly type: 'ItemSold'; readonly commandId: string; readonly itemId: string; readonly priceCents: number }
  | {
      readonly type: 'RewardGranted';
      readonly commandId: string;
      readonly targetId: string;
      readonly grantId: string;
      readonly moneyCents: number;
      readonly items: readonly { readonly itemId: string; readonly qty: number }[];
    };

export type DispatchResult =
  | { readonly ok: true; readonly state: GameState; readonly repeated: boolean; readonly events: readonly GameEvent[] }
  | { readonly ok: false; readonly state: GameState; readonly code: RejectCode; readonly repeated: boolean; readonly events: readonly [] };

/** Запобіжники шини. Усі `true` у грі; вимикаються лише в тестах-мутаціях (GAME-12). */
export interface Safeguards {
  readonly commandId: boolean;
  readonly grantId: boolean;
  readonly rollback: boolean;
}

const SAFE: Safeguards = { commandId: true, grantId: true, rollback: true };

type Draft = StoryDraft;

const isCents = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;

// id контенту — `префікс.назва` (DATA_CONTRACTS §1). Регулярний вираз заодно відсікає ключі
// прототипу (`toString`, `constructor`, `__proto__`): з ними звичайний об'єкт «має» предмет,
// якого ніхто не купував (рецензія PR #13).
// Формат той самий, що у валідатора контенту (scripts/validator/checks.mjs): `префікс.слово[-.слово]*`.
export const CONTENT_ID = /^[a-z]+\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
// commandId генерує місток; та сама безпечна абетка, без ключів прототипу. Перший символ — літера:
// чисто числові ключі JS ставить у об'єкті першими, і обрізання `processed` викинуло б свіжий запис
// раніше старих — повтор застосувався б удруге (рецензія GAME-33).
const COMMAND_ID = /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/;
const RESERVED = new Set(['__proto__', 'constructor', 'prototype', 'toString', 'valueOf', 'hasOwnProperty']);

export const isContentId = (s: unknown): s is string => typeof s === 'string' && CONTENT_ID.test(s);
const isCommandId = (s: unknown): s is string => typeof s === 'string' && COMMAND_ID.test(s) && !RESERVED.has(s);
const own = <T>(o: Readonly<Record<string, T>>, k: string): T | undefined => (Object.hasOwn(o, k) ? o[k] : undefined);

/**
 * Наступний вільний commandId для `seq`: якщо в processed уже є `c<seq>` (сейв із розбіжністю),
 * пропускаємо вперед — інакше місток назавжди отримував би повтор (рецензія PR #13).
 */
export function nextCommandId(state: GameState): string {
  let n = state.seq;
  while (Object.hasOwn(state.processed, `c${n}`)) n++;
  return `c${n}`;
}

/** Відбиток команди: той самий commandId з іншим вмістом — помилка UI, а не повтор. */
function fingerprint(cmd: Command): string {
  const s = JSON.stringify(cmd);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

function apply(cmd: Command, d: Draft, defs: CoreDefs, guard: Safeguards): RejectCode | null {
  switch (cmd.type) {
    case 'BuyItem': {
      if (!isContentId(cmd.itemId)) return 'INVALID_COMMAND';
      const def = own(defs.items, cmd.itemId);
      if (!def) return 'UNKNOWN_ITEM';
      if (def.buyCents === undefined) return 'NOT_FOR_SALE';
      if (!isCents(def.buyCents)) return 'INVALID_AMOUNT';
      d.moneyCents -= def.buyCents;
      d.inventory[cmd.itemId] = (own(d.inventory, cmd.itemId) ?? 0) + 1;
      if (d.moneyCents < 0) return 'INSUFFICIENT_FUNDS';
      d.events.push({ type: 'ItemPurchased', commandId: cmd.commandId, itemId: cmd.itemId, priceCents: def.buyCents });
      return null;
    }
    case 'SellItem': {
      if (!isContentId(cmd.itemId)) return 'INVALID_COMMAND';
      const def = own(defs.items, cmd.itemId);
      if (!def) return 'UNKNOWN_ITEM';
      if (def.sellCents === undefined) return 'NOT_FOR_SALE';
      if (!isCents(def.sellCents)) return 'INVALID_AMOUNT';
      const have = own(d.inventory, cmd.itemId) ?? 0;
      if (have < 1) return 'ITEM_NOT_OWNED';
      d.inventory[cmd.itemId] = have - 1;
      // Інвентар тримає лише додатні кількості: нуль прибираємо перебудовою, без delete.
      if (have === 1) d.inventory = Object.fromEntries(Object.entries(d.inventory).filter(([, q]) => q > 0));
      d.moneyCents += def.sellCents;
      if (!isCents(d.moneyCents)) return 'INVALID_AMOUNT';
      d.events.push({ type: 'ItemSold', commandId: cmd.commandId, itemId: cmd.itemId, priceCents: def.sellCents });
      return null;
    }
    case 'Interact': {
      if (!isContentId(cmd.targetId)) return 'INVALID_COMMAND';
      const def = own(defs.interactions, cmd.targetId);
      if (!def) return 'UNKNOWN_TARGET';
      if (!isContentId(def.grantId)) return 'INVALID_COMMAND';
      if (!isCents(def.moneyCents)) return 'INVALID_AMOUNT';
      if (guard.grantId && d.grants.includes(def.grantId)) return 'GRANT_ALREADY_GIVEN';
      d.moneyCents += def.moneyCents;
      if (!isCents(d.moneyCents)) return 'INVALID_AMOUNT'; // переповнення суми, не лише входу
      for (const { itemId, qty } of def.items ?? []) {
        if (!isContentId(itemId)) return 'INVALID_COMMAND';
        if (!Number.isSafeInteger(qty) || qty < 1) return 'INVALID_AMOUNT';
        const next = (own(d.inventory, itemId) ?? 0) + qty;
        if (!Number.isSafeInteger(next)) return 'INVALID_AMOUNT';
        d.inventory[itemId] = next;
      }
      d.grants.push(def.grantId);
      d.grants.sort();
      d.events.push({
        type: 'RewardGranted', commandId: cmd.commandId, targetId: cmd.targetId,
        grantId: def.grantId, moneyCents: def.moneyCents, items: (def.items ?? []).map((i) => ({ ...i })),
      });
      return null;
    }
    case 'CreateCharacter':
    case 'Visit':
    case 'Talk':
    case 'Pickup':
    case 'CompleteQuest':
    case 'DeclineQuest':
      return applyStory(cmd, d, defs.story, isContentId);
    default:
      return 'INVALID_COMMAND';
  }
}

/**
 * Застосувати команду. Чиста функція: вхідний стан не змінюється ніколи.
 * Відмова повертає новий об'єкт, у якому від вихідного відрізняються лише `processed` і `seq`
 * (запис про відмову — щоб повтор того самого commandId повернув ту саму відмову, DC §4).
 *
 * `processed` тримає останні PROCESSED_LIMIT записів (GAME-33): інакше сейв і код відновлення ростуть
 * без меж. Ціна: повтор команди, старшої за 256 нових, уже не впізнається — UI таких не надсилає,
 * id видає місток із `seq` і не повторює.
 */
export const PROCESSED_LIMIT = 256;

/** Додати запис і відкинути найстаріші (порядок вставки ключів зберігається й у JSON сейву). */
function remember(processed: Readonly<Record<string, CommandRecord>>, id: string, rec: CommandRecord): Record<string, CommandRecord> {
  const entries = [...Object.entries(processed), [id, rec] as const];
  return Object.fromEntries(entries.slice(Math.max(0, entries.length - PROCESSED_LIMIT)));
}

export function dispatch(state: GameState, cmd: Command, defs: CoreDefs, guard: Safeguards = SAFE): DispatchResult {
  if (!cmd || typeof cmd !== 'object' || !isCommandId(cmd.commandId)) {
    return { ok: false, state, code: 'INVALID_COMMAND', repeated: false, events: [] };
  }
  const fp = fingerprint(cmd);
  const seen = own(state.processed, cmd.commandId);
  if (guard.commandId && seen) {
    if (seen.fp !== fp) return { ok: false, state, code: 'COMMAND_ID_REUSED', repeated: true, events: [] };
    return seen.ok
      ? { ok: true, state, repeated: true, events: [] }
      : { ok: false, state, code: seen.code ?? 'INVALID_COMMAND', repeated: true, events: [] };
  }

  const draft: Draft = {
    moneyCents: state.moneyCents, inventory: { ...state.inventory }, grants: [...state.grants], events: [],
    player: state.player, quests: state.quests, campaignEnded: state.campaignEnded,
  };
  const code = apply(cmd, draft, defs, guard);
  const record: CommandRecord = code ? { ok: false, code, fp } : { ok: true, fp };
  const processed = remember(state.processed, cmd.commandId, record);
  const seq = state.seq + 1;
  const { events, ...changes } = draft;

  if (code) {
    // Без rollback (лише мутація в тестах) часткові зміни чернетки протікли б у стан.
    const rejected: GameState = guard.rollback ? { ...state, processed, seq } : { ...state, ...changes, processed, seq };
    return { ok: false, state: rejected, code, repeated: false, events: [] };
  }
  return { ok: true, state: { ...state, ...changes, processed, seq }, repeated: false, events };
}
