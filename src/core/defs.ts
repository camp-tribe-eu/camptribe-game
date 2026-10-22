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
