// GAME-230 · дружба й подарунки: каталог для ядра з content/npcs.json (gifts, heart) і чисті правила для вигляду.
// Ядро (src/core/friendship.ts) знає очки, пороги й ліміт «раз на день»; тут — хто що любить, що можна дарувати й коли грати сцену серця.
// Нічого з цього не читає сюжет: стан `friend` — поза ключем перебору (PROGRESS_IGNORED), прапорців і нагород побічного немає (side.ts не чіпаємо).
import npcsRaw from '../../content/npcs.json';
import requestsRaw from '../../content/requests.json';
import { heartEventDue, reactionOf, canGiftToday, type FriendDefs, type GiftPrefs, type GiftReaction, type HeartEventDef } from '../core/friendship';
import type { GameState } from '../core/state';
import { requestFlag } from './requests';
import { DAY_MINUTES } from '../core/weather';
import { FORAGE_CAP } from '../core/commands';

interface RawNpc { id: string; gifts?: { likes: string[]; dislikes: string[] }; heart?: HeartEventDef }
interface RawRequest { id: string; giver?: string; weather?: string }

/** Дари природи, які герой збирає в таборі (шишка, ягода): команда Forage кладе їх в інвентар. */
export const FORAGE_ITEMS = { cone: 'item.pine-cone', berry: 'item.berries' } as const;
/** GAME-235: чи додасть Forage ще одну штуку (ядро відхиляє на ліміті INVALID_AMOUNT) — вигляд не показує «+1», коли нічого не додалось. */
export function canForage(inventory: Readonly<Record<string, number>>, itemId: string): boolean {
  return (inventory[itemId] ?? 0) < FORAGE_CAP;
}

/** Що можна подарувати: дари природи й дрова (єдина річ табору, яку герой тримає в руках). */
export const GIFTABLE: readonly string[] = [FORAGE_ITEMS.cone, FORAGE_ITEMS.berry, 'item.firewood'];

export function buildFriendDefs(npcs: readonly RawNpc[], requests: readonly RawRequest[]): FriendDefs {
  const prefs: Record<string, GiftPrefs> = {};
  const heart: Record<string, HeartEventDef> = {};
  for (const n of npcs) {
    if (n.gifts) prefs[n.id] = { likes: n.gifts.likes, dislikes: n.gifts.dislikes };
    if (n.heart) heart[n.id] = n.heart;
  }
  // Очки за здане прохання отримує просильник (прохання за погодою просильника не мають).
  const requestGivers = Object.fromEntries(requests.flatMap((r) => (r.giver !== undefined ? [[requestFlag(r.id, 'done'), r.giver] as const] : [])));
  return { prefs, giftable: GIFTABLE, forage: [FORAGE_ITEMS.cone, FORAGE_ITEMS.berry], heart, requestGivers };
}
export const FRIEND_DEFS: FriendDefs = buildFriendDefs(npcsRaw as RawNpc[], requestsRaw as RawRequest[]);

/** Сцена серця грається в таборі пополудні: з 15:00 до 18:00 (до 18:00 сусіди ще не розійшлися по наметах). Хвилини доби — за годинником гри (0 о 8:00). */
export const HEART_FROM_TOD = 15 * 60;
export const HEART_TO_TOD = 18 * 60;
const CLOCK_OFFSET = 8 * 60;
export const todOf = (clockMinutes: number): number => (((clockMinutes + CLOCK_OFFSET) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
export const inHeartWindow = (clockMinutes: number): boolean => { const t = todOf(clockMinutes); return t >= HEART_FROM_TOD && t < HEART_TO_TOD; };

/** Мешканці, яким можна дарувати. */
export const canReceiveGifts = (npcId: string, defs: FriendDefs = FRIEND_DEFS): boolean => Object.hasOwn(defs.prefs, npcId);

/** Які подарунки герой може вручити цьому мешканцю зараз: те, що в руках; нічого, якщо сьогодні вже дарував. */
export function giftOptions(g: GameState, npcId: string, day: number, defs: FriendDefs = FRIEND_DEFS): string[] {
  if (!canReceiveGifts(npcId, defs) || !canGiftToday(g.friend, npcId, day)) return [];
  return defs.giftable.filter((it) => (g.inventory[it] ?? 0) > 0);
}
export const reactionFor = (npcId: string, itemId: string, defs: FriendDefs = FRIEND_DEFS): GiftReaction => reactionOf(defs.prefs[npcId], itemId);

/**
 * Хто з мешканців готовий до сцени серця: серць достатньо, сцена ще не грана, герой у таборі, розмови нема, година підходить.
 * Повертає id першого (за порядком у каталозі); null — нікого.
 */
export function heartDue(g: GameState, clockMinutes: number, defs: FriendDefs = FRIEND_DEFS): string | null {
  if (g.dialogue !== null || g.player?.locationId !== 'loc.camp.lake' || !inHeartWindow(clockMinutes)) return null;
  return Object.keys(defs.heart).find((npc) => heartEventDue(g.friend, defs, npc)) ?? null;
}
