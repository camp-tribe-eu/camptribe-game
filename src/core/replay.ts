// Реплей журналу (GAME-34): сторож детермінізму ядра. Сейв + журнал входів → хеш стану після КОЖНОГО
// входу. Розбіжність називає перший вхід, де хеш розійшовся, — а не лише «кінець не той».
import { stateHash } from './hash';
import { step, type Input, type SimState, type StepCtx } from './sim';

export interface ReplayFile {
  /** Текст сейву (формат save.ts) — стартовий стан; заодно перевіряє, що формат читається. */
  readonly save: string;
  readonly log: readonly Input[];
  /** stateHash після кожного входу, у тому самому порядку. */
  readonly hashes: readonly string[];
}

export type ReplayResult =
  | { readonly ok: true; readonly final: string; readonly steps: number }
  | { readonly ok: false; readonly index: number; readonly input: Input; readonly expected: string; readonly actual: string };

export function record(start: SimState, log: readonly Input[], ctx: StepCtx): string[] {
  const out: string[] = [];
  let s = start;
  for (const input of log) { s = step(s, input, ctx); out.push(stateHash(s)); }
  return out;
}

export function replay(start: SimState, file: Pick<ReplayFile, 'log' | 'hashes'>, ctx: StepCtx): ReplayResult {
  if (file.log.length !== file.hashes.length || file.log.length === 0) {
    // Порожній чи неузгоджений журнал — не «усе гаразд» (закон 4).
    return { ok: false, index: -1, input: { kind: 'pause' }, expected: `${file.hashes.length} hashes`, actual: `${file.log.length} inputs` };
  }
  let s = start;
  for (let i = 0; i < file.log.length; i++) {
    const input = file.log[i] as Input;
    s = step(s, input, ctx);
    const actual = stateHash(s);
    if (actual !== file.hashes[i]) return { ok: false, index: i, input, expected: file.hashes[i] as string, actual };
  }
  return { ok: true, final: stateHash(s), steps: file.log.length };
}

/** Назва входу для звіту розробника (не текст гри — тому англійською): «command CompleteQuest ST-004 (c12)». */
export function describeInput(input: Input): string {
  if (input.kind !== 'command') return input.kind === 'frame' ? `frame ${input.realMs} ms` : input.kind;
  const c = input.command as unknown as Record<string, unknown>;
  const target = c.questId ?? c.locationId ?? c.npcId ?? c.itemId ?? c.targetId ?? c.profileId ?? (c.choice !== undefined ? `choice ${String(c.choice)}` : '');
  return `command ${String(c.type)} ${String(target)} (${String(c.commandId)})`.replace(/\s+\(/, ' (');
}
