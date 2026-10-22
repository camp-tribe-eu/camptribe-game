// Визначення, яким вірить ядро (рецензія TL PR #13): ціни й нагороди — лише з каталогу (CR-041),
// ніколи з команди. Команда несе НАМІР (`Interact{targetId}`, `BuyItem{itemId}`), а не ЕФЕКТ.
// Каталог збирається з перевіреного content/ (валідатор) — ядро його не змінює.

export interface ItemDef {
  /** Ціна купівлі, центи; немає — предмет не продається. */
  readonly buyCents?: number;
  /** Ціна викупу вживаного, центи; немає — не викуповується. ≤ buyCents (SIM-INV-004). */
  readonly sellCents?: number;
}

export interface InteractionDef {
  /** Нагорода видається рівно раз за grantId (TD-004). */
  readonly grantId: string;
  readonly moneyCents: number;
  readonly items?: readonly { readonly itemId: string; readonly qty: number }[];
}

export interface CoreDefs {
  readonly items: Readonly<Record<string, ItemDef>>;
  readonly interactions: Readonly<Record<string, InteractionDef>>;
}

export const EMPTY_DEFS: CoreDefs = { items: {}, interactions: {} };

export const DEFS_CODES = ['DEFS_BAD_AMOUNT', 'DEFS_RESALE_ABOVE_PRICE', 'DEFS_BAD_ID'] as const;
export type DefsCode = (typeof DEFS_CODES)[number];

const isCents = (n: unknown): boolean => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
const ID = /^[a-z]+\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

/**
 * Каталог має бути цілим ДО гри: ціни — цілі центи ≥ 0, викуп ≤ купівлі (SIM-INV-004, інакше
 * купи-продай — нескінченні гроші), id — у форматі контенту. Повертає знахідки; порожньо — добре.
 */
export function checkDefs(defs: CoreDefs): { code: DefsCode; where: string }[] {
  const out: { code: DefsCode; where: string }[] = [];
  for (const [id, d] of Object.entries(defs.items)) {
    if (!ID.test(id)) out.push({ code: 'DEFS_BAD_ID', where: id });
    if ((d.buyCents !== undefined && !isCents(d.buyCents)) || (d.sellCents !== undefined && !isCents(d.sellCents))) out.push({ code: 'DEFS_BAD_AMOUNT', where: id });
    if (d.buyCents !== undefined && d.sellCents !== undefined && d.sellCents > d.buyCents) out.push({ code: 'DEFS_RESALE_ABOVE_PRICE', where: id });
  }
  for (const [id, d] of Object.entries(defs.interactions)) {
    if (!ID.test(id) || !ID.test(d.grantId) || (d.items ?? []).some((i) => !ID.test(i.itemId))) out.push({ code: 'DEFS_BAD_ID', where: id });
    if (!isCents(d.moneyCents) || (d.items ?? []).some((i) => !Number.isSafeInteger(i.qty) || i.qty < 1)) out.push({ code: 'DEFS_BAD_AMOUNT', where: id });
  }
  return out;
}

/** Глибоке заморожування: каталог не змінити під час гри ні з модуля, ні через подію (TL/рецензія PR #13). */
export function freezeDefs(defs: CoreDefs): CoreDefs {
  const deep = <T>(v: T): T => {
    if (v && typeof v === 'object' && !Object.isFrozen(v)) {
      for (const x of Object.values(v as object)) deep(x);
      Object.freeze(v);
    }
    return v;
  };
  return deep(structuredClone(defs));
}
