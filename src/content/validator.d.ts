// Типи для валідатора контенту (scripts/validator/*.mjs), який тест сюжету кличе напряму:
// «валідатор каже: досяжно» і «ядро справді доходить» звіряються на тому самому контенті.
declare module '*/validator/combos.mjs' {
  export interface Combo { profile: string | null; transport: string | null; animal: string }
  export function enumerateCombos(content: unknown): Combo[];
  export function project(content: unknown, k: Combo, keep?: Set<string>): unknown;
  export function matches(when: unknown, k: Combo): boolean;
}
declare module '*/validator/checks.mjs' {
  export function buildIndex(content: unknown): { reachable: Set<string> };
  /** remembered — факти пам'яті, які може знати NPC цієї розмови (GAME-48); без нього — жодних. */
  export function satisfiable(cond: unknown, known: Set<string>, remembered?: Set<string>): boolean;
  export function contradictions(cond: unknown): Set<string>;
}
