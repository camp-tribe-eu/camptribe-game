// Командна шина ядра (TD-004, CR-031…035). Команда — НАМІР гравця; ефект (ціна, нагорода)
// ядро бере лише з каталогу визначень (CoreDefs). Застосовує повністю або відмовляє з кодом,
// і решта стану лишається вихідною. Успіх повертає події-факти (DC-061).

import { canBuyAt, type CoreDefs } from './defs';
import { shopClosedHere } from './rest';
import type { CommandRecord, GameState, RejectCode } from './state';
import { HAND_ACTIONS, isHandAction, practise, rankOf, SKILL_IDS, type SkillId } from './skills';
import { gearOf, pruneGear, sellPriceOf } from './gear';
import { bookLeave, cancelLeave } from './life';
import { autoPack, capacityOf, carriedOf, loadCarSet, packFlag, packingOpen, packItemsFor, takeFlag, usedUnits, withLoaded, withPacked } from './packing';
import type { Weather } from './weather';
import { applyStory, canRestNow, canSleepNow, REST_SCENE, questNeedsItem, questOpen, SLEEP_CAP, type StoryCommand, type StoryDraft } from './story';
import { basketFlag, basketOf, basketTotal, canPay } from './basket';
import { applyWave, type WaveCommand } from './wave';
import { award, awardsFor } from './progress';
import { atlasAwards } from './atlas-fill';
import { grantStickers } from './stickers';
import { addPoints, canGiftToday, giveGift, heartEventDue, markHeartSeen, reactionOf, REQUEST_POINTS } from './friendship';

export type { StoryCommand } from './story';
export type { WaveCommand } from './wave';

export type Command =
  | StoryCommand
  | WaveCommand
  | { readonly type: 'BuyItem'; readonly commandId: string; readonly itemId: string }
  | { readonly type: 'SellItem'; readonly commandId: string; readonly itemId: string }
  /** GAME-246: каса — оплатити весь кошик крамниці одним розрахунком (ціни — з каталогу `shelfCents`, ніколи з команди). */
  | { readonly type: 'Checkout'; readonly commandId: string }
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
  | { readonly type: 'CancelLeave'; readonly commandId: string; readonly from: number }
  /** Пакування (GAME-109): покласти / дістати річ, або укласти автоматично. Лише там і тоді, де його відкрито (packing.at/openAfter). */
  | { readonly type: 'PackItem'; readonly commandId: string; readonly itemId: string }
  | { readonly type: 'UnpackItem'; readonly commandId: string; readonly itemId: string }
  | { readonly type: 'AutoPack'; readonly commandId: string }
  /** GAME-245: узяти річ удома (в один бік), завантажити все взяте в авто, повернути зайву річ на її місце вдома. */
  | { readonly type: 'TakeItem'; readonly commandId: string; readonly itemId: string }
  | { readonly type: 'LoadCar'; readonly commandId: string }
  | { readonly type: 'LeaveItem'; readonly commandId: string; readonly itemId: string }
  /** Практика руками (GAME-229): дія на мапі (сокира, кілок, вудка…) вчить навичку з таблиці HAND_ACTIONS. Нічого, крім досвіду, не змінює. */
  | { readonly type: 'Practise'; readonly commandId: string; readonly action: string }
  /** Подарунок мешканцю табору (GAME-230): предмет з інвентаря, не більше одного на NPC за день; реакцію й очки дає каталог дружби (ніколи не мінус). */
  | { readonly type: 'GiveGift'; readonly commandId: string; readonly npcId: string; readonly itemId: string }
  /** Збір дару природи (GAME-230): шишка чи ягода, яку герой підняв у таборі, лягає в інвентар (лише предмети з `friendship.forage`). */
  | { readonly type: 'Forage'; readonly commandId: string; readonly itemId: string }
  /** Сцена серця (GAME-230): серць достатньо й сцена ще не грана — відкрити її й записати «зіграно» (удруге — CONDITION_FAILED). */
  | { readonly type: 'HeartEvent'; readonly commandId: string; readonly npcId: string }
  /** Лягти спати (GAME-242): біля ліжка вдома, біля намету в таборі чи будь-де після 22:00. Час перемотує симуляція (до 07:00). */
  | { readonly type: 'Sleep'; readonly commandId: string }
  /** Дочекатися відчинення крамниці (GAME-242): лише в зачиненій крамниці; симуляція перемотує час до 08:00. */
  | { readonly type: 'WaitForShop'; readonly commandId: string }
  /** Відпочити до вечора (GAME-269): у мертвому вікні дня в таборі; симуляція перемотує час до 17:30, ядро відкриває коротку родинну сцену. Без штрафів. */
  | { readonly type: 'RestUntilEvening'; readonly commandId: string };

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
  /** GAME-181: нагорода прогресії — раз за ключ. Немає поля — вмикнено; `false` лише в мутації тесту (повтор дав би XP знову). */
  readonly award?: boolean;
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

function apply(cmd: Command, d: Draft, defs: CoreDefs, guard: Safeguards, today: number | undefined, weather: Weather | undefined, now: number | undefined): RejectCode | null {
  switch (cmd.type) {
    case 'StartWave':
    case 'CompleteTask': {
      // GAME-256: хвиля етапу, чий день чи вечір ще не настали, не стартує (строки хвилі — від ПРАВИЛЬНОГО дня).
      const stage = cmd.type === 'StartWave' ? own(defs.waves?.waves ?? {}, cmd.waveId)?.stage : undefined;
      // GAME-170: строки справ — в ігрових хвилинах, які знає лише симуляція (`now`); без годинника — INVALID_COMMAND.
      const bad = applyWave(cmd, d, defs.waves, now, isContentId);
      if (bad) return bad;   // спершу «не для цього гравця / етап неактивний» — ворота дня лише для хвилі, яка інакше стартувала б
      return stage !== undefined && defs.story && !questOpen(defs.story, d, stage, now) ? 'QUEST_NOT_YET' : null;
    }
    case 'BuyItem': {
      if (!isContentId(cmd.itemId)) return 'INVALID_COMMAND';
      const def = own(defs.items, cmd.itemId);
      if (!def) return 'UNKNOWN_ITEM';
      if (def.buyCents === undefined) return 'NOT_FOR_SALE';
      if (!isCents(def.buyCents)) return 'INVALID_AMOUNT';
      // Купівля — лише там, де предмет продається (GAME-81); меню питає це саме ядро, тож розбіжності немає.
      if (!canBuyAt(defs, cmd.itemId, d.player?.locationId)) return 'NOT_SOLD_HERE';
      // Години крамниці (GAME-242): без годинника (тести ядра) перевірки немає, як і для строків хвиль.
      if (now !== undefined && shopClosedHere(d, now)) return 'SHOP_CLOSED';
      // Спорядження — один примірник моделі в руках (SIM-GEAR-001): стан ведеться на id предмета.
      if (def.gear && (own(d.inventory, cmd.itemId) ?? 0) >= 1) return 'ITEM_ALREADY_HELD';
      d.moneyCents -= def.buyCents;
      d.inventory[cmd.itemId] = (own(d.inventory, cmd.itemId) ?? 0) + 1;
      if (d.moneyCents < 0) return 'INSUFFICIENT_FUNDS';
      d.events.push({ type: 'ItemPurchased', commandId: cmd.commandId, itemId: cmd.itemId, priceCents: def.buyCents });
      return null;
    }
    case 'Checkout': {
      if (!d.player) return 'NO_CHARACTER';
      const inBasket = basketOf(d.flags, defs);
      if (inBasket.length === 0) return 'BASKET_EMPTY';
      if (now !== undefined && shopClosedHere(d, now)) return 'SHOP_CLOSED';
      const total = basketTotal(d.flags, defs);
      if (!isCents(total)) return 'INVALID_AMOUNT';
      if (d.moneyCents < total) return 'INSUFFICIENT_FUNDS';
      for (const id of inBasket) {
        const price = (own(defs.items, id)?.shelfCents) as number;
        d.moneyCents -= price;
        d.inventory[id] = (own(d.inventory, id) ?? 0) + 1;
        d.events.push({ type: 'ItemPurchased', commandId: cmd.commandId, itemId: id, priceCents: price });
      }
      const gone = new Set(inBasket.map(basketFlag));
      d.flags = d.flags.filter((f) => !gone.has(f));
      return null;
    }
    case 'SellItem': {
      if (!isContentId(cmd.itemId)) return 'INVALID_COMMAND';
      const def = own(defs.items, cmd.itemId);
      if (!def) return 'UNKNOWN_ITEM';
      if (def.sellCents === undefined) return 'NOT_FOR_SALE';
      if (!isCents(def.sellCents)) return 'INVALID_AMOUNT';
      if (now !== undefined && shopClosedHere(d, now)) return 'SHOP_CLOSED';
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
    case 'Sleep':
      // Сон не міняє стан гри — час і запис у журнал робить симуляція (sim.step), бо годинник знає лише вона.
      // GAME-256: лічильник сну (день сюжету) росте тут; без годинника (перебір, бот) сон «абстрактний» — де завгодно, де є герой.
      if (!(now === undefined ? d.player !== null : canSleepNow(defs.story, d, now))) return 'CONDITION_FAILED';
      d.slept = Math.min((d.slept ?? 0) + 1, SLEEP_CAP);
      return null;
    case 'RestUntilEvening': {
      // Без годинника (перебір, бот) відпочинок недоступний: «до вечора» без часу не має змісту, мертвого вікна в них немає.
      if (now === undefined || !canRestNow(defs.story, d, now)) return 'CONDITION_FAILED';
      const sc = defs.story ? own(defs.story.dialogues, REST_SCENE) : undefined;
      if (defs.story && sc) d.dialogue = { id: REST_SCENE, node: sc.start };
      return null;
    }
    case 'WaitForShop':
      return now !== undefined && shopClosedHere(d, now) ? null : 'CONDITION_FAILED';
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
      // Прапорці взаємодії (GAME-170, зріз 2): нагорода разова за grantId, тож і прапорець ставиться разом із нею.
      const newFlags = (def.flags ?? []).filter((f) => !d.flags.includes(f));
      if (newFlags.length) d.flags = [...d.flags, ...newFlags].sort();
      d.events.push({
        type: 'RewardGranted', commandId: cmd.commandId, targetId: cmd.targetId,
        grantId: def.grantId, moneyCents: def.moneyCents, items: (def.items ?? []).map((i) => ({ ...i })),
      });
      return null;
    }
    case 'GiveGift': {
      if (!isContentId(cmd.npcId) || !isContentId(cmd.itemId)) return 'INVALID_COMMAND';
      if (today === undefined) return 'INVALID_COMMAND';   // без годинника «сьогодні» невідоме — ліміт «раз на день» не обчислити
      const fr = defs.friendship;
      if (!fr) return 'UNKNOWN_TARGET';
      if (!d.player) return 'NO_CHARACTER';
      const prefs = own(fr.prefs, cmd.npcId);
      const npc = defs.story ? own(defs.story.npcs, cmd.npcId) : undefined;
      if (!prefs || !npc) return 'UNKNOWN_TARGET';
      if (d.player.locationId !== npc.locationId) return 'NOT_HERE';
      if (!fr.giftable.includes(cmd.itemId)) return 'UNKNOWN_ITEM';
      const have = own(d.inventory, cmd.itemId) ?? 0;
      if (have < 1) return 'ITEM_NOT_OWNED';
      if (!canGiftToday(d.friend, cmd.npcId, today)) return 'GRANT_ALREADY_GIVEN';
      // Останній примірник, потрібний активному квесту, не дарується (як і не продається): інакше квест не завершити.
      if (have === 1 && defs.story && questNeedsItem(defs.story, d, d.player, cmd.itemId)) return 'ITEM_QUEST_LOCKED';
      d.inventory = have === 1 ? Object.fromEntries(Object.entries(d.inventory).filter(([k]) => k !== cmd.itemId)) : { ...d.inventory, [cmd.itemId]: have - 1 };
      d.friend = giveGift(d.friend, cmd.npcId, reactionOf(prefs, cmd.itemId), today);
      // Подарунок — гарний привід закінчити розмову: рамка зникає, світ іде далі, і гравець бачить реакцію (♥ чи «…») та позу вручення, а не рамку поверх мапи.
      if (d.dialogue !== null && defs.story && own(defs.story.dialogues, d.dialogue.id)?.npcId === cmd.npcId) d.dialogue = null;
      return null;
    }
    case 'Forage': {
      if (!isContentId(cmd.itemId)) return 'INVALID_COMMAND';
      const fr = defs.friendship;
      if (!fr || !fr.forage.includes(cmd.itemId)) return 'UNKNOWN_ITEM';
      if (!d.player) return 'NO_CHARACTER';
      const have = own(d.inventory, cmd.itemId) ?? 0;
      if (have >= FORAGE_CAP) return 'INVALID_AMOUNT';
      d.inventory[cmd.itemId] = have + 1;
      return null;
    }
    case 'HeartEvent': {
      if (!isContentId(cmd.npcId)) return 'INVALID_COMMAND';
      const fr = defs.friendship;
      if (!fr) return 'UNKNOWN_TARGET';
      if (!d.player) return 'NO_CHARACTER';
      const ev = own(fr.heart, cmd.npcId);
      const npc = defs.story ? own(defs.story.npcs, cmd.npcId) : undefined;
      if (!ev || !npc) return 'UNKNOWN_TARGET';
      if (d.player.locationId !== npc.locationId) return 'NOT_HERE';
      if (!heartEventDue(d.friend, fr, cmd.npcId)) return 'CONDITION_FAILED';
      const bad = applyStory({ type: 'StartScene', commandId: cmd.commandId, sceneId: ev.scene, facts: [] }, d, defs.story, isContentId, guard.grantId, now);
      if (bad) return bad;
      d.friend = markHeartSeen(d.friend, cmd.npcId);
      return null;
    }
    case 'Practise': {
      if (!isHandAction(cmd.action)) return 'INVALID_COMMAND';
      if (!d.player) return 'NO_CHARACTER';
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
    case 'PackItem':
    case 'UnpackItem': {
      if (!isContentId(cmd.itemId)) return 'INVALID_COMMAND';
      const pk = defs.packing;
      if (!pk) return 'UNKNOWN_TARGET';
      if (!d.player) return 'NO_CHARACTER';
      const item = packItemsFor(pk, d.player).find((i) => i.itemId === cmd.itemId);
      if (!item) return 'UNKNOWN_ITEM';
      if (!packingOpen(pk, d)) return 'PACK_CLOSED';
      const flag = packFlag(item.itemId);
      const packed = d.flags.includes(flag);
      if (cmd.type === 'UnpackItem') {
        if (!packed) return 'PACK_NOT_PACKED';
        d.flags = d.flags.filter((f) => f !== flag);
        return null;
      }
      if (packed || d.flags.includes(takeFlag(item.itemId))) return 'PACK_ALREADY';
      if (usedUnits(d.flags, pk, d.player) + item.units > capacityOf(pk, d.player.transportId)) return 'PACK_FULL';
      d.flags = [...d.flags, flag].sort();
      return null;
    }
    case 'TakeItem':
    case 'LeaveItem': {
      if (!isContentId(cmd.itemId)) return 'INVALID_COMMAND';
      const pk = defs.packing;
      if (!pk) return 'UNKNOWN_TARGET';
      if (!d.player) return 'NO_CHARACTER';
      const item = packItemsFor(pk, d.player).find((i) => i.itemId === cmd.itemId);
      if (!item) return 'UNKNOWN_ITEM';
      if (!packingOpen(pk, d)) return 'PACK_CLOSED';
      const tf = takeFlag(item.itemId);
      if (cmd.type === 'LeaveItem') {
        if (!d.flags.includes(tf)) return 'PACK_NOT_PACKED';
        d.flags = d.flags.filter((f) => f !== tf);
        return null;
      }
      if (d.flags.includes(tf) || d.flags.includes(packFlag(item.itemId))) return 'PACK_ALREADY';
      d.flags = [...d.flags, tf].sort();
      return null;
    }
    case 'LoadCar': {
      const pk = defs.packing;
      if (!pk) return 'UNKNOWN_TARGET';
      if (!d.player) return 'NO_CHARACTER';
      if (!packingOpen(pk, d)) return 'PACK_CLOSED';
      if (carriedOf(d.flags, pk, d.player).length === 0) return 'PACK_NOT_PACKED';
      d.flags = withLoaded(d.flags, pk, loadCarSet(pk, d.player, d.flags));
      return null;
    }
    case 'AutoPack': {
      const pk = defs.packing;
      if (!pk) return 'UNKNOWN_TARGET';
      if (!d.player) return 'NO_CHARACTER';
      if (!packingOpen(pk, d)) return 'PACK_CLOSED';
      d.flags = withPacked(d.flags, pk, autoPack(pk, d.player));
      return null;
    }
    case 'CreateCharacter': {
      const bad = applyStory(cmd, d, defs.story, isContentId, guard.grantId, now);
      // Старт: усе спаковано «як радить гра» (GAME-109) — екран пакування лише уточнює, а не починає з порожнього.
      if (!bad && defs.packing && d.player) d.flags = withPacked(d.flags, defs.packing, autoPack(defs.packing, d.player));
      return bad;
    }
    case 'Pickup': {
      // GAME-246: річ із ціною полиці лягає в кошик, а не в руки (власністю її робить каса).
      const shelf = own(defs.items, cmd.itemId)?.shelfCents;
      const here = d.player?.locationId;
      if (shelf !== undefined && defs.story && isContentId(cmd.itemId) && d.player && here != null && own(defs.story.locations, here)?.items.includes(cmd.itemId)) {
        if ((own(d.inventory, cmd.itemId) ?? 0) >= 1 || d.flags.includes(basketFlag(cmd.itemId))) return 'ITEM_ALREADY_HELD';
        // У кошик — лише те, за що є готівка разом із рештою кошика (та сама умова, що й у каси): інакше кошик без грошей — пастка,
        // з якої лише «вийти» (речі на полицю), і випадкова прогулянка з 0 € не доходила до кінця дня 1 (day-summary).
        if (d.moneyCents < basketTotal(d.flags, defs) + shelf) return 'INSUFFICIENT_FUNDS';
        d.flags = [...d.flags, basketFlag(cmd.itemId)].sort();
        return null;
      }
      const alt = own(defs.items, cmd.itemId)?.asItem;
      if (alt && defs.story && isContentId(cmd.itemId) && d.player && here != null && own(defs.story.locations, here)?.items.includes(cmd.itemId)) {
        if ((own(d.inventory, alt.itemId) ?? 0) >= 1 || d.flags.includes(basketFlag(alt.itemId))) return 'ITEM_ALREADY_HELD';
        // Дарунок — лише тому, кому нічим платити за звичайну річ (готівка + викуп наявного < ціни полиці): правило ядра, а не меню.
        const shelfAlt = own(defs.items, alt.itemId)?.shelfCents;
        if (shelfAlt !== undefined && canPay(d, defs, shelfAlt)) return 'CAN_PAY';
        d.inventory[alt.itemId] = 1;
        d.gear = { ...d.gear, [alt.itemId]: { condition: alt.condition, wet: false } };
        return null;
      }
      return applyStory(cmd, d, defs.story, isContentId, guard.grantId, now);
    }
    case 'Visit':
      // GAME-246: з непорожнім кошиком із крамниці не вийти — спершу каса (крадіжка = ми не маємо речей).
      // Крамниця зачинилась (GAME-242), а кошик неоплачений: не тупик — речі лишаються на полиці (кошик порожніє), вийти можна.
      if (basketOf(d.flags, defs).length > 0 && d.player && d.player.locationId !== cmd.locationId) {
        // Платити нічим (грошей менше за суму кошика) — теж не тупик: речі лишаються на полиці, а безкоштовний шлях (речі Анни) лишається.
        if ((now === undefined || !shopClosedHere(d, now)) && d.moneyCents >= basketTotal(d.flags, defs)) return 'UNPAID_BASKET';
        const left = new Set(basketOf(d.flags, defs).map(basketFlag));
        d.flags = d.flags.filter((f) => !left.has(f));
      }
      return applyStory(cmd, d, defs.story, isContentId, guard.grantId, now);
    case 'Talk':
    case 'CompleteQuest':
    case 'DeclineQuest':
    case 'Choose':
    case 'Continue':
    case 'RoadEvent':
    case 'StartScene':
      return applyStory(cmd, d, defs.story, isContentId, guard.grantId, now);
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
    case 'Checkout':
      return cmd.type === 'Checkout' ? { key: 'trade:checkout', skills: ['skill.finance'] } : { key: `trade:${cmd.itemId}`, skills: ['skill.finance'] };
    case 'Repair': {
      const def = own(defs.repairs ?? {}, cmd.targetId);
      return def ? { key: `repair:${cmd.targetId}`, skills: [def.skill] } : null;
    }
    case 'Practise':
      return isHandAction(cmd.action) ? { key: `hand:${cmd.action}`, skills: HAND_ACTIONS[cmd.action] as readonly SkillId[] } : null;
    default:
      return null;
  }
}

/** Ціль команди для прогресії: квест, об'єкт взаємодії чи подія в дорозі (ті самі поля, що пише журнал — sim.refOf). */
function progressRef(cmd: Command): string | null {
  return cmd.type === 'CompleteQuest' ? cmd.questId : cmd.type === 'Interact' ? cmd.targetId : cmd.type === 'RoadEvent' ? cmd.eventId : cmd.type === 'TakeItem' ? cmd.itemId : null;
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
/** Скільки одного дару природи можна носити (GAME-230): інвентар і сейв не ростуть без меж. */
export const FORAGE_CAP = 20;

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
 * `now` (GAME-170) — ігрова хвилина годинника, лише від симуляції: строки справ хвилі; без неї StartWave/CompleteTask — INVALID_COMMAND.
 */
export function dispatch(state: GameState, cmd: Command, defs: CoreDefs, guard: Safeguards = SAFE, today?: number, weather?: Weather, now?: number): DispatchResult {
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
    ...(state.wave !== undefined ? { wave: state.wave } : {}),
    ...(state.progress !== undefined ? { progress: state.progress } : {}),
    ...(state.stickers !== undefined ? { stickers: state.stickers } : {}),
    ...(state.friend !== undefined ? { friend: state.friend } : {}),
    ...(state.slept !== undefined ? { slept: state.slept } : {}),
  };
  const code = apply(cmd, draft, defs, guard, today, weather, now);
  // Стан спорядження — лише для того, що в руках (продали останній — запис зникає), і лише відхилення від нового.
  if (!code) draft.gear = pruneGear(draft.gear, draft.inventory);
  if (!code) practiseAfter(cmd, state, draft, defs);
  // GAME-181: XP й ОМ за прийняту команду — з каталогу (квест, взаємодія, подія в дорозі), раз за ключ.
  if (!code) {
    const p = award(draft.progress, awardsFor(cmd.type, progressRef(cmd), defs), guard.award !== false);
    if (p !== undefined) draft.progress = p;
    // GAME-182: наклейки Атласу, чиї умови щойно стали правдою (дані content/stickers.json).
    const st = grantStickers(draft.stickers, defs.stickers, draft);
    if (st !== undefined) draft.stickers = st;
    // GAME-200: повна сторінка Атласу — нагорода раз за ключ `atlas:<сторінка>` (лише за справді повну: atlas-fill.ts).
    const ap = award(draft.progress, atlasAwards(draft.stickers, defs.atlasPages), guard.award !== false);
    if (ap !== undefined) draft.progress = ap;
  }
  // GAME-180: прохання сусідів здано (з'явився прапорець «здано») — XP, ОМ і практика навичок за `rw.<прохання>`, раз за ключ (повторне здавання/перезавантаження — 0).
  if (!code) {
    for (const r of defs.story?.requestRewards ?? []) {
      if (!draft.flags.includes(r.flag) || state.flags.includes(r.flag)) continue;
      // GAME-230: здане прохання — очки дружби просильнику (прапорець «здано» з'являється раз, тож і очки раз).
      const giver = defs.friendship ? own(defs.friendship.requestGivers, r.flag) : undefined;
      if (giver !== undefined) draft.friend = addPoints(draft.friend, giver, REQUEST_POINTS);
      const before = draft.progress;
      const p = award(draft.progress, [{ key: r.key, xp: r.xp, om: r.om }], guard.award !== false);
      if (p !== undefined) draft.progress = p;
      if (p === before) continue;   // уже видано раніше — і практики вдруге нема
      const learned = practise(draft.skills, draft.practice, r.key, r.skills.filter((x): x is SkillId => (SKILL_IDS as readonly string[]).includes(x)));
      if (learned) { draft.skills = learned.skills; draft.practice = learned.practice; }
    }
  }
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
