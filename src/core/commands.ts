// Командна шина ядра (TD-004, CR-031…035). Команда — НАМІР гравця; ефект (ціна, нагорода)
// ядро бере лише з каталогу визначень (CoreDefs). Застосовує повністю або відмовляє з кодом,
// і решта стану лишається вихідною. Успіх повертає події-факти (DC-061).

import { canBuyAt, type CoreDefs } from './defs';
import type { CommandRecord, GameState, RejectCode } from './state';
import { practise, rankOf, type SkillId } from './skills';
import { gearOf, pruneGear, sellPriceOf } from './gear';
import { bookLeave, cancelLeave } from './life';
import type { Weather } from './weather';
import { applyStory, questNeedsItem, type StoryCommand, type StoryDraft } from './story';

export type { StoryCommand } from './story';

export type Command =
  | StoryCommand
  | { readonly type: 'BuyItem'; readonly commandId: string; readonly itemId: string }
  | { readonly type: 'SellItem'; readonly commandId: string; readonly itemId: string }
  | { readonly type: 'Interact'; readonly commandId: string; readonly targetId: string }
  /** Полагодити ціль (GAME-72): вимоги — з каталогу `repairs`, ніколи з команди. */
  | { readonly type: 'Repair'; readonly commandId: string; readonly targetId: string }
  /** Висушити мокре спорядження (GAME-73, SIM-GEAR-005): знімає «мокре», стану не повертає. */
  | { readonly type: 'DryGear'; readonly commandId: string; readonly itemId: string }
  /**
   * Відпустка-подорож (GAME-71, SIM-LIFE-003/004): дні гри [from, from + days). `schoolOverride: true` — явне рішення
   * гравця везти школяра поза канікулами (без нього довга подорож у шкільні дні — SCHOOL_TERM).
   */
  | { readonly type: 'BookLeave'; readonly commandId: string; readonly from: number; readonly days: number; readonly schoolOverride?: boolean }
  /** Скасувати ще не розпочату відпустку, що починається в день `from` (GAME-71): дні відпустки повертаються. */
  | { readonly type: 'CancelLeave'; readonly commandId: string; readonly from: number };

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

function apply(cmd: Command, d: Draft, defs: CoreDefs, guard: Safeguards, today: number | undefined, weather: Weather | undefined): RejectCode | null {
  switch (cmd.type) {
    case 'BuyItem': {
      if (!isContentId(cmd.itemId)) return 'INVALID_COMMAND';
      const def = own(defs.items, cmd.itemId);
      if (!def) return 'UNKNOWN_ITEM';
      if (def.buyCents === undefined) return 'NOT_FOR_SALE';
      if (!isCents(def.buyCents)) return 'INVALID_AMOUNT';
      // Купівля — лише там, де предмет продається (GAME-81); меню питає це саме ядро, тож розбіжності немає.
      if (!canBuyAt(defs, cmd.itemId, d.player?.locationId)) return 'NOT_SOLD_HERE';
      // Спорядження — один примірник моделі в руках (SIM-GEAR-001): стан ведеться на id предмета.
      if (def.gear && (own(d.inventory, cmd.itemId) ?? 0) >= 1) return 'ITEM_ALREADY_HELD';
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
      // Останній примірник, потрібний активному квесту, не продається (SIM-INV-004): інакше квест не завершити.
      if (have === 1 && defs.story && d.player && questNeedsItem(defs.story, d, d.player, cmd.itemId)) return 'ITEM_QUEST_LOCKED';
      // Уживане спорядження — за станом (SIM-GEAR-004): ⌊викуп × стан / 100⌋ ≤ викуп ≤ ціни купівлі.
      const price = sellPriceOf(def, d.gear, cmd.itemId) as number;
      d.inventory[cmd.itemId] = have - 1;
      // Інвентар тримає лише додатні кількості: нуль прибираємо перебудовою, без delete.
      if (have === 1) d.inventory = Object.fromEntries(Object.entries(d.inventory).filter(([, q]) => q > 0));
      d.moneyCents += price;
      if (!isCents(d.moneyCents)) return 'INVALID_AMOUNT';
      d.events.push({ type: 'ItemSold', commandId: cmd.commandId, itemId: cmd.itemId, priceCents: price });
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
    case 'Repair': {
      if (!isContentId(cmd.targetId)) return 'INVALID_COMMAND';
      const def = own(defs.repairs ?? {}, cmd.targetId);
      if (!def) return 'UNKNOWN_TARGET';
      if (!d.player) return 'NO_CHARACTER';
      if (d.flags.includes(def.flag)) return 'ALREADY_REPAIRED';
      // Порядок навмисний (SIM-SKL-003): спершу фізика — інструмент і запчастина, — потім навичка.
      // Навіть ранг 5 без інструмента — TOOL_MISSING: навичка не замінює ключа.
      if ((own(d.inventory, def.tool) ?? 0) < 1) return 'TOOL_MISSING';
      if (def.part !== undefined && (own(d.inventory, def.part) ?? 0) < 1) return 'PART_MISSING';
      if (rankOf(own(d.skills, def.skill) ?? 0) < def.minRank) return 'SKILL_TOO_LOW';
      if (def.part !== undefined) {
        const left = (own(d.inventory, def.part) as number) - 1;
        d.inventory = left > 0 ? { ...d.inventory, [def.part]: left } : Object.fromEntries(Object.entries(d.inventory).filter(([k]) => k !== def.part));
      }
      d.flags = [...d.flags, def.flag].sort();
      return null;
    }
    case 'DryGear': {
      if (!isContentId(cmd.itemId)) return 'INVALID_COMMAND';
      const def = own(defs.items, cmd.itemId);
      if (!def) return 'UNKNOWN_ITEM';
      if ((own(d.inventory, cmd.itemId) ?? 0) < 1) return 'ITEM_NOT_OWNED';
      const g = gearOf(d.gear, cmd.itemId);
      if (!def.gear || !g.wet) return 'NOT_WET';
      // GAME-88: у дощ просто неба сушити марно — висушене б одразу намокло. Погоду знає лише симуляція; без неї (перебір, бот) дощу немає.
      if (weather === 'rain' && !own(defs.story?.locations ?? {}, d.player?.locationId ?? '')?.sheltered) return 'CANNOT_DRY_HERE';
      d.gear = { ...d.gear, [cmd.itemId]: { condition: g.condition, wet: false } };
      return null;
    }
    case 'BookLeave': {
      if (today === undefined) return 'INVALID_COMMAND';   // без годинника «сьогодні» невідоме — не бронюємо проти дня 0
      const r = bookLeave(d, { from: cmd.from, days: cmd.days, ...(cmd.schoolOverride !== undefined ? { schoolOverride: cmd.schoolOverride } : {}) }, defs.life, today);
      if ('code' in r) return r.code;
      d.life = r.life;
      return null;
    }
    case 'CancelLeave': {
      if (today === undefined) return 'INVALID_COMMAND';
      if (typeof cmd.from !== 'number' || !Number.isSafeInteger(cmd.from)) return 'INVALID_AMOUNT';
      const r = cancelLeave(d, cmd.from, defs.life, today);
      if ('code' in r) return r.code;
      d.life = r.life;
      return null;
    }
    case 'CreateCharacter':
    case 'Visit':
    case 'Talk':
    case 'Pickup':
    case 'CompleteQuest':
    case 'DeclineQuest':
    case 'Choose':
    case 'Continue':
    case 'RoadEvent':
      return applyStory(cmd, d, defs.story, isContentId, guard.grantId);
    default:
      return 'INVALID_COMMAND';
  }
}

/**
 * Яку практику дає прийнята команда (SIM-SKL-006): ключ дії й навички, яких вона вчить. Ключ — тип і ціль:
 * повтор того самого (знову в ту саму крамницю) вчить дедалі менше, нове місце — вчить знову.
 * Харчування поки не вчить жодна дія: команди «готувати» в ядрі ще немає. null — команда не вчить.
 */
export function practiceOf(cmd: Command, before: GameState, after: Pick<Draft, 'player'>, defs: CoreDefs): { key: string; skills: readonly SkillId[] } | null {
  switch (cmd.type) {
    case 'Visit':
      // Лише справжній переїзд: «прийти туди, де стоїш» нічого не вчить.
      return before.player && after.player && before.player.locationId !== after.player.locationId
        ? { key: `visit:${cmd.locationId}`, skills: ['skill.planning', 'skill.endurance'] } : null;
    case 'Talk':
      return { key: `talk:${cmd.npcId}`, skills: ['skill.communication'] };
    case 'Pickup':
      return { key: `pickup:${cmd.itemId}`, skills: ['skill.camping'] };
    case 'BuyItem':
    case 'SellItem':
      return { key: `trade:${cmd.itemId}`, skills: ['skill.finance'] };
    case 'Repair': {
      const def = own(defs.repairs ?? {}, cmd.targetId);
      return def ? { key: `repair:${cmd.targetId}`, skills: [def.skill] } : null;
    }
    default:
      return null;
  }
}

/** Записати практику прийнятої команди в чернетку. Без персонажа вчитись нікому — нічого. */
function practiseAfter(cmd: Command, before: GameState, d: Draft, defs: CoreDefs): void {
  if (!d.player) return;
  const p = practiceOf(cmd, before, d, defs);
  const next = p && practise(d.skills, d.practice, p.key, p.skills);
  if (next) { d.skills = next.skills; d.practice = next.practice; }
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

/**
 * `today` — день гри (⌊хвилини / 1440⌋), який знає лише симуляція: його читають тільки BookLeave/CancelLeave (GAME-71).
 * `weather` (GAME-88) — погода дня, теж лише від симуляції: у дощ DryGear просто неба — CANNOT_DRY_HERE. Без неї дощу немає.
 * Повний перебір і бот кличуть dispatch без годинника — команд календаря в їхніх ходах немає (moves.ts). Без `today`
 * BookLeave/CancelLeave — INVALID_COMMAND (рецензія GAME-71): мовчазний «день 0» дозволив би бронювати в минулому.
 */
export function dispatch(state: GameState, cmd: Command, defs: CoreDefs, guard: Safeguards = SAFE, today?: number, weather?: Weather): DispatchResult {
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
    player: state.player, quests: state.quests, campaignEnded: state.campaignEnded, flags: [...state.flags], npcMemory: state.npcMemory,
    skills: state.skills, practice: state.practice, gear: state.gear, life: state.life, dialogue: state.dialogue,
  };
  const code = apply(cmd, draft, defs, guard, today, weather);
  // Стан спорядження — лише для того, що в руках (продали останній — запис зникає), і лише відхилення від нового.
  if (!code) draft.gear = pruneGear(draft.gear, draft.inventory);
  if (!code) practiseAfter(cmd, state, draft, defs);
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
