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

/** Умова `when` контенту (TD-006): збіг із вибором гравця. Порожнього списку валідатор не пропускає. */
export interface WhenDef {
  readonly profiles?: readonly string[];
  readonly transports?: readonly string[];
  readonly animals?: readonly string[];
}

export interface ObjectiveDef {
  readonly id: string;
  readonly kind: 'visit' | 'talk' | 'collect';
  readonly target: string;
  readonly required: boolean;
  readonly when?: WhenDef;
}

export interface TransitionDef {
  readonly on: 'complete' | 'decline';
  readonly to: string;
  /** Є — це вибір гравця, а не шлях за замовчуванням. */
  readonly choice: boolean;
  readonly when?: WhenDef;
}

export interface RewardDef {
  readonly grantId: string;
  readonly moneyCents: number;
  readonly items: readonly { readonly itemId: string; readonly qty: number }[];
}

export interface QuestDef {
  readonly optional: boolean;
  readonly end: boolean;
  readonly locationId?: string;
  readonly when?: WhenDef;
  readonly requires?: { readonly quests: readonly string[]; readonly items: readonly string[] };
  readonly objectives: readonly ObjectiveDef[];
  readonly transitions: readonly TransitionDef[];
  readonly reward?: RewardDef;
}

/** Сюжет розділу (GAME-29): збирається з перевіреного content/ (src/content/story.ts). */
export interface StoryDefs {
  readonly start: string;
  readonly profiles: Readonly<Record<string, { readonly transports?: readonly string[] }>>;
  readonly transports: readonly string[];
  readonly animals: Readonly<Record<string, { readonly transports?: readonly string[] }>>;
  readonly locations: Readonly<Record<string, { readonly unlockedBy?: string; readonly when?: WhenDef; readonly items: readonly string[] }>>;
  readonly npcs: Readonly<Record<string, { readonly locationId: string; readonly unlockedBy?: string; readonly when?: WhenDef }>>;
  readonly quests: Readonly<Record<string, QuestDef>>;
}

export interface CoreDefs {
  readonly items: Readonly<Record<string, ItemDef>>;
  readonly interactions: Readonly<Record<string, InteractionDef>>;
  /** Немає — команди сюжету відмовляють (UNKNOWN_TARGET), решта працює. */
  readonly story?: StoryDefs;
}

export const EMPTY_DEFS: CoreDefs = { items: {}, interactions: {} };

export const DEFS_CODES = ['DEFS_BAD_AMOUNT', 'DEFS_RESALE_ABOVE_PRICE', 'DEFS_BAD_ID', 'DEFS_BAD_REF'] as const;
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
  if (defs.story) out.push(...checkStory(defs.story));
  return out;
}

/**
 * Сюжет: посилання цілі (повну перевірку досяжності робить валідатор контенту; тут — лише те, без
 * чого ядро не може працювати й мовчки дало б інший результат, ніж валідатор).
 */
function checkStory(st: StoryDefs): { code: DefsCode; where: string }[] {
  const out: { code: DefsCode; where: string }[] = [];
  const has = (o: object, k: string | undefined): boolean => k === undefined || Object.hasOwn(o, k);
  if (!Object.hasOwn(st.quests, st.start)) out.push({ code: 'DEFS_BAD_REF', where: 'story.start' });
  for (const [id, q] of Object.entries(st.quests)) {
    if (!has(st.locations, q.locationId)) out.push({ code: 'DEFS_BAD_REF', where: `${id}.locationId` });
    for (const t of q.transitions) if (!has(st.quests, t.to)) out.push({ code: 'DEFS_BAD_REF', where: `${id}→${t.to}` });
    for (const r of q.requires?.quests ?? []) if (!has(st.quests, r)) out.push({ code: 'DEFS_BAD_REF', where: `${id}.requires` });
    for (const o of q.objectives) {
      const pool = o.kind === 'visit' ? st.locations : o.kind === 'talk' ? st.npcs : null;
      if (pool && !has(pool, o.target)) out.push({ code: 'DEFS_BAD_REF', where: `${id}.${o.id}` });
    }
    if (q.reward && (!isCents(q.reward.moneyCents) || q.reward.items.some((i) => !Number.isSafeInteger(i.qty) || i.qty < 1))) out.push({ code: 'DEFS_BAD_AMOUNT', where: `${id}.reward` });
  }
  for (const [id, n] of Object.entries(st.npcs)) if (!has(st.locations, n.locationId)) out.push({ code: 'DEFS_BAD_REF', where: `${id}.locationId` });
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
