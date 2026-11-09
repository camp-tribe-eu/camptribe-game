// GAME-291 · з'єднання предметів за рецептом «кілька → один» (розділ 2: дві половинки медальйона → медальйон).
// Лише явна дія гравця (команда JoinItems): ніщо не з'єднується саме. Рецепт — чиста дані; ядро перевіряє, що є КОЖНА частина.
// `all: false` — лише для мутації в тесті (закон 1: сторож «потрібні обидві половинки» мусить уміти почервоніти).
export interface JoinRecipe {
  readonly id: string;
  readonly from: readonly string[];
  readonly to: string;
}

export const MEDALLION_HALF1 = 'item.medallion.half1';
export const MEDALLION_HALF2 = 'item.medallion.half2';
export const MEDALLION = 'item.medallion';
export const JOIN_MEDALLION = 'recipe.medallion';

export const JOIN_RECIPES: readonly JoinRecipe[] = [{ id: JOIN_MEDALLION, from: [MEDALLION_HALF1, MEDALLION_HALF2], to: MEDALLION }];

export const joinRecipe = (id: string): JoinRecipe | undefined => JOIN_RECIPES.find((r) => r.id === id);

/** Інвентар після з'єднання або null, якщо з'єднати не можна: потрібна КОЖНА частина (all=false — мутація: досить однієї). */
export function joined(inv: Readonly<Record<string, number>>, r: JoinRecipe, all = true): Record<string, number> | null {
  const has = (id: string): boolean => (Object.hasOwn(inv, id) ? (inv[id] ?? 0) : 0) >= 1;
  if (all ? !r.from.every(has) : !r.from.some(has)) return null;
  const taken = new Set(r.from.filter(has));
  const out: Record<string, number> = {};
  for (const [id, qty] of Object.entries(inv)) {
    const left = taken.has(id) ? qty - 1 : qty;
    if (left > 0) out[id] = left;
  }
  out[r.to] = (Object.hasOwn(out, r.to) ? (out[r.to] ?? 0) : 0) + 1;
  return out;
}
