// Наклейки Атласу (GAME-182): збирає content/stickers.json у форму ядра (умови видачі) і в перелік слотів для екрана.
// Валідатор (перевірка stickers) доводить: у кожної наклейки є умова з відомими прапорцями й квестами, текст uk/en, не більше 12.
import type { CondDef } from '../core/defs';
import type { StickerDefs } from '../core/stickers';
import stickers from '../../content/stickers.json';

export interface RawSticker { id: string; nameKey: string; textKey: string; kind: string; icon: string; cond: CondDef }

/** Для екрана: ключі текстів, вид і піктограма — у порядку слотів. Ядру цього знати не треба. */
export const STICKER_META: readonly { readonly id: string; readonly nameKey: string; readonly textKey: string; readonly kind: string; readonly icon: string }[] =
  (stickers as RawSticker[]).map((s) => ({ id: s.id, nameKey: s.nameKey, textKey: s.textKey, kind: s.kind, icon: s.icon }));

export const compileStickers = (raw: readonly RawSticker[]): StickerDefs => Object.fromEntries(raw.map((s) => [s.id, { cond: s.cond }]));
export const STICKER_DEFS: StickerDefs = compileStickers(stickers as RawSticker[]);
