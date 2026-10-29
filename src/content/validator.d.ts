// Типи для валідатора контенту (scripts/validator/*.mjs), який тест сюжету кличе напряму:
// «валідатор каже: досяжно» і «ядро справді доходить» звіряються на тому самому контенті.
declare module '*/validator/combos.mjs' {
  export interface Combo { profile: string | null; transport: string | null; animal: string }
  export function enumerateCombos(content: unknown): Combo[];
  export function project(content: unknown, k: Combo, keep?: Set<string>): unknown;
  export function matches(when: unknown, k: Combo): boolean;
}
declare module '*/validator/codes.mjs' {
  /** Вісім напрямів навичок (GAME-72) — мусить збігатися з SKILL_IDS ядра. */
  export const SKILL_IDS: string[];
  /** Поля картки спорядження (GAME-73), крім kind. */
  export const GEAR_FIELDS: string[];
  /** Сімейства прапорців ядра (GAME-115): f.pack-*, f.seen-* — префікс і породжувач із контенту. */
  export const FLAG_FAMILIES: Record<'packing.items' | 'dialogues.trigger', { prefix: string; gen: (content: unknown) => string[] }>;
  /** Межі хвилі напруги (GAME-170) — мусять збігатися з defs.ts ядра. */
  export const WAVE_MAX_LIMIT: number;
  /** Слотів на сторінці Атласу (GAME-182) — мусить збігатися з STICKER_SLOTS ядра. */
  export const STICKER_SLOTS: number;
  export const WAVE_MIN_TASKS: number;
  export const GEAR_CHECK_VARIANTS: readonly string[];
  export const WAVE_MAX_TASKS: number;
  /** Стартові гроші гри в центах (GAME-113) — мусять збігатися з мостом (START_MONEY_CENTS). */
  export const ECON_FLOOR_CENTS: number;
  /** Слова позики в id/типах контенту (GAME-113). */
  export const LOAN_RE: RegExp;
}
declare module '*/validator/load.mjs' {
  export function loadContent(dir: string, opts?: { allowMissing?: boolean }): { status: string; content: Record<string, unknown> | null; issues: { code: string; where: string; msg: string }[] };
}
declare module '*/validator/checks.mjs' {
  export function buildIndex(content: unknown): { reachable: Set<string> };
  /** remembered — факти пам'яті, які може знати NPC цієї розмови (GAME-48); без нього — жодних. */
  export function satisfiable(cond: unknown, known: Set<string>, remembered?: Set<string>): boolean;
  export function contradictions(cond: unknown): Set<string>;
  export const CHECKS: { id: string; run: (ctx: { content: unknown; today?: string }) => { code: string; where: string; msg: string }[] }[];
  export function validate(content: unknown, opts: { today: string }): { code: string; where: string; msg: string }[];
}
