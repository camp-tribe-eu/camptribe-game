// GAME-209 · лагодимо лавку руками: молоток б'є по дошці HITS разів (кожен удар — пил і тріски), після останнього ядро видає малу нагороду РАЗ
// (взаємодія `repair.bench`, XP «секрет», прапорець f.bench-repaired). Необов'язково й без покарань: не полагодив — лавка просто стоїть хитка.
// Чисті функції без Phaser; сцена (view/world/repair.ts) лише малює й шле команду.
export const REPAIR_SPOT = 'repair.bench';
export const REPAIR_FLAG = 'f.bench-repaired';
export const REPAIR_HITS = 3;

export interface RepairState { readonly hits: number; readonly done: boolean }
export const REPAIR_IDLE: RepairState = { hits: 0, done: false };
export type RepairEvent = 'hit' | 'done' | 'none';

/** Один удар молотка: `near` — герой у зоні дії дошки. Поза зоною удар не рахується. */
export function stepRepair(s: RepairState, near: boolean): { state: RepairState; event: RepairEvent } {
  if (s.done || !near) return { state: s, event: 'none' };
  const hits = s.hits + 1;
  return hits >= REPAIR_HITS ? { state: { hits: REPAIR_HITS, done: true }, event: 'done' } : { state: { hits, done: false }, event: 'hit' };
}

/** Взаємодія ядра: нагорода 0 центів, разова за grantId; XP — за позначкою `secret` (core/progress.ts). */
export const REPAIR_INTERACTION = { grantId: 'rw.bench-repaired', moneyCents: 0, flags: [REPAIR_FLAG], award: 'secret' } as const;
