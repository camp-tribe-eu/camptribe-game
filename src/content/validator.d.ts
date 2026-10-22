// Типи для валідатора контенту (scripts/validator/*.mjs), який тест сюжету кличе напряму:
// «валідатор каже: досяжно» і «ядро справді доходить» звіряються на тому самому контенті.
declare module '*/validator/combos.mjs' {
  export interface Combo { profile: string | null; transport: string | null; animal: string }
  export function enumerateCombos(content: unknown): Combo[];
  export function project(content: unknown, k: Combo, keep?: Set<string>): unknown;
}
declare module '*/validator/checks.mjs' {
  export function buildIndex(content: unknown): { reachable: Set<string> };
}
