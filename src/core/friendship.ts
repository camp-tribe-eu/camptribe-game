// GAME-230 · дружба й подарунки з мешканцями табору. Чисті функції без Phaser: ядро (commands.ts) лише викликає їх, вигляд лише читає.
// Стан — `GameState.friend` (необов'язкове поле: сейви до GAME-230 його не мають, і відсутність ≡ «ніхто нічого нікому не дарував»):
//   pts   — очки дружби за NPC (ціле ≥ 0, ніколи не зменшуються: гра не карає);
//   gift  — день останнього подарунка NPC (ціла ≥ 0): не більше одного на день, щоб не фармити;
//   seen  — NPC, чию сцену серця вже зіграно (сцена не повторюється).
// Очки дають: здане прохання сусіда (REQUEST_POINTS) і ПОДОБАЄТЬСЯ-подарунок (LIKED_POINTS). Нейтральний чи небажаний подарунок
// не дає очок, але й НІКОЛИ не віднімає (закон гри «не карає»).
export const MAX_HEARTS = 5;
/** Очки, з яких набрано серце n (n = 1…5): HEART_AT[n − 1]. Межі стереже friendship.test (±1). */
export const HEART_AT: readonly number[] = [2, 5, 9, 14, 20];
export const REQUEST_POINTS = 3;
export const LIKED_POINTS = 2;
/** Стеля очок: більше п'ятого серця не лічимо (сейв не росте). */
export const POINTS_CAP = 99;

export type GiftReaction = 'liked' | 'neutral' | 'disliked';

export interface FriendState {
  readonly pts: Readonly<Record<string, number>>;
  readonly gift: Readonly<Record<string, number>>;
  readonly seen: readonly string[];
  /** GAME-244 ч.2: книга збору дарів за ОДИН день (джерело → скільки дало); новий день — нова книга. Немає — нічого сьогодні не зібрано. */
  readonly forage?: { readonly day: number; readonly n: Readonly<Record<string, number>> };
  /** GAME-276: обміни за ОДИН день (id пропозицій, відсортовані, без повторів); новий день — новий список. Немає — сьогодні нічого не обміняно. */
  readonly trade?: { readonly day: number; readonly done: readonly string[] };
}
export const NO_FRIEND: FriendState = { pts: {}, gift: {}, seen: [] };

/** Вподобання мешканця (content/npcs.json → gifts) і сцена серця (heart). */
export interface GiftPrefs { readonly likes: readonly string[]; readonly dislikes: readonly string[] }
/** GAME-276: обмін «річ за річ» із сусідом (content/npcs.json → trades). Грошей не створює: цінність «віддаю» ≥ цінності «отримую» (tradeIsFair). */
export interface TradeLine { readonly itemId: string; readonly qty: number }
export interface TradeDef { readonly id: string; readonly npcId: string; readonly give: readonly TradeLine[]; readonly get: readonly TradeLine[] }
export interface HeartEventDef { readonly scene: string; readonly at: number }
/** Каталог дружби для ядра (content/npcs.json): хто що любить, що можна дарувати/збирати, яка в кого сцена серця. */
export interface FriendDefs {
  readonly prefs: Readonly<Record<string, GiftPrefs>>;
  /** Предмети, які можна подарувати (дари природи й дрова). */
  readonly giftable: readonly string[];
  /** Дари природи: герой збирає їх у таборі (шишка, ягода) — команда Forage кладе їх в інвентар. */
  readonly forage: readonly string[];
  readonly heart: Readonly<Record<string, HeartEventDef>>;
  /** GAME-276: пропозиції обміну сусідів (немає — обмінів немає). */
  readonly trades?: readonly TradeDef[];
  /** Прапорець «здано» прохання → просильник (очки дружби за здане прохання). */
  readonly requestGivers: Readonly<Record<string, string>>;
}

const own = <T>(o: Readonly<Record<string, T>>, k: string): T | undefined => (Object.hasOwn(o, k) ? o[k] : undefined);

/** Скільки сердець за очками: 0…5. */
export function heartsOf(pts: number): number {
  let n = 0;
  for (const at of HEART_AT) if (pts >= at) n++;
  return n;
}
export const friendOf = (f: FriendState | undefined): FriendState => f ?? NO_FRIEND;
export const ptsOf = (f: FriendState | undefined, npc: string): number => own(friendOf(f).pts, npc) ?? 0;
export const heartsFor = (f: FriendState | undefined, npc: string): number => heartsOf(ptsOf(f, npc));

export function reactionOf(prefs: GiftPrefs | undefined, itemId: string): GiftReaction {
  if (!prefs) return 'neutral';
  if (prefs.likes.includes(itemId)) return 'liked';
  if (prefs.dislikes.includes(itemId)) return 'disliked';
  return 'neutral';
}
/** Очки за подарунок: лише «подобається» дає; решта — 0, ніколи не мінус. */
export const giftPoints = (r: GiftReaction): number => (r === 'liked' ? LIKED_POINTS : 0);

export function addPoints(f: FriendState | undefined, npc: string, n: number): FriendState {
  const cur = friendOf(f);
  return { ...cur, pts: { ...cur.pts, [npc]: Math.min(POINTS_CAP, ptsOf(cur, npc) + Math.max(0, n)) } };
}

/** Чи можна сьогодні дарувати цьому NPC: не більше одного подарунка на день. */
export const canGiftToday = (f: FriendState | undefined, npc: string, today: number): boolean => own(friendOf(f).gift, npc) !== today;

/** Подарунок прийнято: очки (за реакцією) і день подарунка. */
export function giveGift(f: FriendState | undefined, npc: string, reaction: GiftReaction, today: number): FriendState {
  const withPts = addPoints(f, npc, giftPoints(reaction));
  return { ...withPts, gift: { ...withPts.gift, [npc]: today } };
}

/** Сцена серця готова: серць достатньо, і вона ще не грана. */
export function heartEventDue(f: FriendState | undefined, defs: FriendDefs | undefined, npc: string): boolean {
  const ev = defs ? own(defs.heart, npc) : undefined;
  return !!ev && heartsFor(f, npc) >= ev.at && !friendOf(f).seen.includes(npc);
}
export function markHeartSeen(f: FriendState | undefined, npc: string): FriendState {
  const cur = friendOf(f);
  return cur.seen.includes(npc) ? cur : { ...cur, seen: [...cur.seen, npc].sort() };
}

/** GAME-276: цінність набору речей за ціною перепродажу (`sell`: річ → центи, без ціни — 0). */
export const tradeValue = (lines: readonly TradeLine[], sell: (itemId: string) => number): number => lines.reduce((n, l) => n + sell(l.itemId) * l.qty, 0);
/** Обмін не створює грошей: те, що отримуєш, не дорожче за те, що віддаєш (за ціною перепродажу). */
export const tradeIsFair = (t: TradeDef, sell: (itemId: string) => number): boolean => tradeValue(t.get, sell) <= tradeValue(t.give, sell);
/** Чи вже зроблено цей обмін сьогодні: раз на день на пропозицію. */
export const tradeDoneToday = (f: FriendState | undefined, offerId: string, day: number): boolean => {
  const t = friendOf(f).trade;
  return t !== undefined && t.day === day && t.done.includes(offerId);
};
/** Обмін зроблено: книга веде лише один день (старі дні відпадають самі — сейв не росте). */
export function traded(f: FriendState | undefined, offerId: string, day: number): FriendState {
  const cur = friendOf(f);
  const same = cur.trade !== undefined && cur.trade.day === day ? cur.trade.done : [];
  return { ...cur, trade: { day, done: [...new Set([...same, offerId])].sort() } };
}
