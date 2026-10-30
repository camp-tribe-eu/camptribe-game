// GAME-190 · дрова руками (OD-022): чиста детермінована логіка. Жодного годинника, Phaser чи випадковості: стан міняють ЛИШЕ вхід гравця (act) і крок кадру (tick).
// Шлях: 3 гілки на землі → підняти кожну (act біля неї) → колода → 3 удари по шкалі. Фаза `done` досяжна лише з 3-м влучним ударом (act у зеленому);
// tick сам нічого не завершує. Промах нічого не карає (шкала починається заново). Сцена (view/world/wood.ts) малює стан і, коли подія `done`, шле ядру ту саму
// команду, що й раніше (об'єкт take.item.firewood).

export const BRANCHES = 3;
export const STRIKES = 3;
/** Повний хід маркера туди-назад, мс. Повільно навмисно (як у наметі): телефон, жодного штрафу. */
export const PERIOD_MS = 2400;
export const BAND = { from: 0.32, to: 0.68 } as const;
/** Де лежать гілки відносно колоди (купи дров) на мапі табору: усі на вільній землі поруч (перевіряє wood-chop.test за справжньою мапою). */
export const BRANCH_AT: readonly { readonly dx: number; readonly dy: number }[] = [{ dx: -96, dy: -48 }, { dx: -40, dy: -80 }, { dx: -128, dy: 16 }];

export type WoodPhase = 'idle' | 'gather' | 'chop' | 'done';
export interface WoodState {
  readonly phase: WoodPhase;
  /** Які гілки вже підняті (за номером). */
  readonly got: readonly boolean[];
  /** Влучних ударів (0..STRIKES). */
  readonly strikes: number;
  /** Мс від початку поточного ходу маркера. */
  readonly t: number;
  readonly misses: number;
}
export type WoodEvent = 'none' | 'picked' | 'need' | 'chopStart' | 'hit' | 'miss' | 'done';
export type WoodInput = { readonly kind: 'tick'; readonly dtMs: number } | { readonly kind: 'act'; readonly branch: number | null; readonly atBlock: boolean };

export const WOOD_IDLE: WoodState = { phase: 'idle', got: [false, false, false], strikes: 0, t: 0, misses: 0 };
export const startWood = (): WoodState => ({ ...WOOD_IDLE, phase: 'gather' });
export const gotCount = (s: WoodState): number => s.got.filter(Boolean).length;

export function markerAt(t: number): number {
  const x = (((t % PERIOD_MS) + PERIOD_MS) % PERIOD_MS) / PERIOD_MS;
  return x < 0.5 ? x * 2 : 2 - x * 2;
}
export const inBand = (pos: number): boolean => pos >= BAND.from && pos <= BAND.to;

/** Куди зараз вести стрілку: перша непідібрана гілка, потім колода. */
export function woodTarget(s: WoodState): { readonly kind: 'branch'; readonly i: number } | { readonly kind: 'block' } | null {
  if (s.phase === 'gather') { const i = s.got.findIndex((g) => !g); return i >= 0 ? { kind: 'branch', i } : { kind: 'block' }; }
  return s.phase === 'chop' ? { kind: 'block' } : null;
}

export function stepWood(s: WoodState, i: WoodInput): { state: WoodState; event: WoodEvent } {
  if (i.kind === 'tick') {
    if (s.phase !== 'chop' || !(i.dtMs > 0)) return { state: s, event: 'none' };
    return { state: { ...s, t: s.t + i.dtMs }, event: 'none' };
  }
  if (s.phase === 'gather') {
    if (i.branch !== null && i.branch >= 0 && i.branch < BRANCHES && !s.got[i.branch]) return { state: { ...s, got: s.got.map((g, k) => g || k === i.branch) }, event: 'picked' };
    if (!i.atBlock) return { state: s, event: 'none' };
    return gotCount(s) >= BRANCHES ? { state: { ...s, phase: 'chop', t: 0 }, event: 'chopStart' } : { state: s, event: 'need' };
  }
  if (s.phase !== 'chop') return { state: s, event: 'none' };
  if (!inBand(markerAt(s.t))) return { state: { ...s, t: 0, misses: s.misses + 1 }, event: 'miss' };
  const strikes = s.strikes + 1;
  return strikes >= STRIKES ? { state: { ...s, phase: 'done', strikes, t: 0 }, event: 'done' } : { state: { ...s, strikes, t: 0 }, event: 'hit' };
}
