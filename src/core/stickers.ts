// Наклейки Атласу (GAME-182, brain/Сценарій/scenario.md §2): сторінка «Перша спроба» має 12 слотів. Наклейка не видається вручну — її умова
// (та сама мова умов, що в діалогах: прапорець, статус квесту, all/any) описана в content/stickers.json, а ядро після кожної прийнятої команди
// дописує те, що стало правдою. Лише дані й чисті функції: той самий журнал команд — той самий набір; RNG тут не споживається.
// Наклейка не витрачається і не зникає: повтор нічого не дає (як grantId у грошей, TD-004).
import type { CondDef } from './defs';
import type { GameState } from './state';

export interface StickerDef { readonly cond: CondDef }
/** id наклейки → умова. Порядок ключів — порядок слотів на сторінці. */
export type StickerDefs = Readonly<Record<string, StickerDef>>;

/** Скільки слотів на сторінці Атласу (сценарій §2.1: «повна сторінка (12)»). Валідатор: STICKER_TOO_MANY. */
export const STICKER_SLOTS = 12;

type View = Pick<GameState, 'flags' | 'quests'>;

/** Умова наклейки: лише прапорець, статус квесту й all/any. Решта видів умов діалогу (транспорт, пам'ять NPC) тут не існують — вони хибні. */
export function stickerHolds(c: CondDef, g: View): boolean {
  if ('flag' in c) return g.flags.includes(c.flag);
  if ('notFlag' in c) return !g.flags.includes(c.notFlag);
  if ('quest' in c) return Object.hasOwn(g.quests, c.quest) && g.quests[c.quest]?.status === c.status;
  if ('all' in c) return c.all.every((x) => stickerHolds(x, g));
  if ('any' in c) return c.any.some((x) => stickerHolds(x, g));
  return false;
}

export const stickersOf = (g: Pick<GameState, 'stickers'>): readonly string[] => g.stickers ?? [];

/**
 * Дописати наклейки, чиї умови стали правдою. Нічого нового — повертає той самий `have` (тож стан не перебудовується).
 * Лише з персонажем: без нього гри ще немає, а старт-квест не активний.
 */
export function grantStickers(have: readonly string[] | undefined, defs: StickerDefs | undefined, g: View & Pick<GameState, 'player'>): readonly string[] | undefined {
  if (!defs || g.player === null) return have;
  const cur = have ?? [];
  const add = Object.keys(defs).filter((id) => !cur.includes(id) && stickerHolds((defs[id] as StickerDef).cond, g));
  return add.length === 0 ? have : [...cur, ...add].sort();
}

/** Старий сейв (до GAME-182) не має `stickers`: що вже правдиве, те йому й належить. Детерміновано й ідемпотентно. */
export function backfillStickers(game: GameState, defs: StickerDefs | undefined): GameState {
  const s = grantStickers(game.stickers, defs, game);
  return s === game.stickers || s === undefined ? game : { ...game, stickers: s };
}
