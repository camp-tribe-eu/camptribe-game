// Стан проходження (DATA_CONTRACTS DC-040…052). Лише дані: жодних класів, щоб стан
// серіалізувався в сейв без втрат і порівнювався побайтно.
import type { GearState } from './gear';
import type { LifeState } from './life';
import { zeroSkills } from './skills';

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
  readonly schemaVersion: 3;
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
  /** Сюжетні прапорці (DC-051), відсортовано. Ставлять лише ефекти діалогів. */
  readonly flags: readonly string[];
  /**
   * Пам'ять NPC (GAME-48): id NPC → факти, які він пам'ятає про гравця (`m.came-by-bike`), відсортовано,
   * без повторів. Змінює її лише ефект `remember` відповіді в розмові з цим NPC — і більше нічого.
   */
  readonly npcMemory: Readonly<Record<string, readonly string[]>>;
  /**
   * Навички (GAME-72): усі вісім id (`skill.planning`…) → досвід, ціле ≥ 0; ранг — rankOf(досвід).
   * До персонажа — нулі; CreateCharacter ставить старт професії; далі росте лише з практики.
   */
  readonly skills: Readonly<Record<string, number>>;
  /** Практика (GAME-72): ключ дії (`visit:loc.shop`) → скільки разів вона вже вчила (1…PRACTICE_SATURATION). */
  readonly practice: Readonly<Record<string, number>>;
  /**
   * Стан спорядження (GAME-73): id предмета спорядження в руках → стан 0…100 і «мокре». Лише відхилення від нового
   * сухого: немає запису — 100 і сухе (SIM-GEAR-001). Змінюють дорога в дощ (sim.step), DryGear і продаж.
   */
  readonly gear: Readonly<Record<string, GearState>>;
  /**
   * Календар життя (GAME-71): скільки днів виплати вже враховано (`paydays`) і заброньовані відпустки (`leave`, за днем
   * початку). Зарплату нараховує симуляція (sim.step → payroll), відпустки — команди BookLeave / CancelLeave.
   */
  readonly life: LifeState;
  /** Відкритий діалог і вузол; null — розмови немає. */
  readonly dialogue: { readonly id: string; readonly node: string } | null;
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
  // GAME-81 · крамниці
  'NOT_SOLD_HERE',
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
  'IN_DIALOGUE',
  'NO_DIALOGUE',
  'CONDITION_FAILED',
  // GAME-31 · дороги
  'NO_ROUTE',
  // GAME-72 · навички й ремонт
  'TOOL_MISSING',
  'PART_MISSING',
  'SKILL_TOO_LOW',
  'ALREADY_REPAIRED',
  // GAME-73 · спорядження
  'ITEM_QUEST_LOCKED',
  'NOT_WET',
  // GAME-71 · календар життя
  'VACATION_EXHAUSTED',
  'SCHOOL_TERM',
  'LEAVE_OVERLAP',
  'LEAVE_DATE',
  'LEAVE_NOT_FOUND',
  'LEAVE_STARTED',
] as const;

export type RejectCode = (typeof REJECT_CODES)[number];

export function initialState(moneyCents = 0): GameState {
  return { schemaVersion: 3, moneyCents, inventory: {}, grants: [], processed: {}, seq: 0, player: null, quests: {}, campaignEnded: false, flags: [], npcMemory: {}, skills: zeroSkills(), practice: {}, gear: {}, life: { paydays: 0, leave: [] }, dialogue: null };
}
