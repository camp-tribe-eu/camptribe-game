// Атлас: заповнення сторінок і нагорода за повну сторінку (GAME-200). Сторінка — перелік наклейок (id з content/stickers.json); «повна» — КОЖНА наклейка отримана.
// Нагорода видається рівно раз за ключ `atlas:<сторінка>` (як усі нагороди прогресії, GAME-181) і лише коли сторінка справді заповнена — це стереже мутація в atlas-fill.test.ts.
// Чисті функції: той самий набір наклейок — той самий результат; RNG тут не споживається.
import type { Award } from './progress';

export interface AtlasPageRule { readonly id: string; readonly stickers: readonly string[]; readonly xp: number; readonly om: number }

export interface PageFill { readonly have: number; readonly total: number; readonly pct: number }

/** Скільки наклейок сторінки отримано й який це відсоток (ціле, округлено вниз: 100 лише коли справді все). */
export function pageFill(have: readonly string[], stickers: readonly string[]): PageFill {
  const n = stickers.filter((id) => have.includes(id)).length;
  return { have: n, total: stickers.length, pct: stickers.length === 0 ? 0 : Math.floor((n * 100) / stickers.length) };
}

/** Сторінка повна: непорожня й кожна її наклейка отримана. */
export const pageComplete = (have: readonly string[], stickers: readonly string[]): boolean => stickers.length > 0 && stickers.every((id) => have.includes(id));

/** Нагороди за повні сторінки. `complete` — параметр лише для мутації в тесті (закон 1: сторож мусить уміти почервоніти). */
export function atlasAwards(have: readonly string[] | undefined, pages: readonly AtlasPageRule[] | undefined, complete: (have: readonly string[], stickers: readonly string[]) => boolean = pageComplete): Award[] {
  const h = have ?? [];
  return (pages ?? []).filter((p) => complete(h, p.stickers)).map((p) => ({ key: `atlas:${p.id}`, xp: p.xp, om: p.om }));
}
