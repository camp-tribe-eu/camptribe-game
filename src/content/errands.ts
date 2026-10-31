// GAME-202 (OD-024 §3) · доручення членам родини. Родина не ходить гуськом: герой у розмові доручає Вікторії чи Метью справу
// хвилі (речі під навіс, вечеря), і це — ФАКТ ЯДРА: вибір у діалозі ставить прапорець `f.errand-<справа>-<виконавець>`
// (content/dialogue/*.json, реєстр content/flags.json). Тут — чисте читання цих прапорців у план для сцени: хто куди йде
// (об'єкт `task.<справа>` на мапі табору) і яку команду ядру послати, коли виконавець дійшов і попрацював (CompleteTask від
// помічника — та сама команда, що й дотик героя, лише actor: 'helper'; leaderOnly-справи ядро помічнику не віддасть).
// Жодного Phaser, годинника чи випадковості; сейв про доручення знає рівно стільки, скільки прапорців.
import type { Move } from './moves';

/** Члени родини, яким можна щось доручити (слідувачі сцени, GAME-112). Герой (Джордж) — не виконавець: він роздає. */
export const FAMILY = ['victoria', 'matthew'] as const;
export type Member = (typeof FAMILY)[number];

export const ERRAND_PREFIX = 'f.errand-';
export const TASK_SPOT = 'task.';

export interface Errand {
  readonly member: Member;
  /** id справи хвилі (без `task.`). */
  readonly task: string;
  /** Об'єкт мапи, до якого йде виконавець. */
  readonly spot: string;
  readonly flag: string;
}

/** Прапорець доручення → доручення; null — не доручення або виконавець невідомий (такий прапорець нікого нікуди не веде). */
export function parseErrand(flag: string): Errand | null {
  if (!flag.startsWith(ERRAND_PREFIX)) return null;
  const body = flag.slice(ERRAND_PREFIX.length);
  const member = FAMILY.find((m) => body.endsWith(`-${m}`));
  if (!member) return null;
  const task = body.slice(0, body.length - member.length - 1);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(task)) return null;
  return { member, task, spot: `${TASK_SPOT}${task}`, flag };
}

export const errandFlag = (task: string, member: Member): string => `${ERRAND_PREFIX}${task}-${member}`;

/**
 * План доручень для сцени: лише ті, чия справа зараз жива на мапі (`isLive` — як для позначок цілей: справа відкрита, строк не минув,
 * гравець у таборі). Справу зроблено чи вона спізнилась — доручення зникає само, виконавець вертається до родини. На одну справу — один
 * виконавець (перший за порядком FAMILY); у члена родини — одне доручення за раз.
 */
export function plannedErrands(flags: readonly string[], isLive: (spot: string) => boolean): Errand[] {
  const out: Errand[] = [];
  for (const f of [...flags].sort()) {
    const e = parseErrand(f);
    if (!e || !isLive(e.spot)) continue;
    if (out.some((o) => o.task === e.task || o.member === e.member)) continue;
    out.push(e);
  }
  return out;
}

/** Команда ядру, коли виконавець попрацював: закрити справу хвилі від помічника. */
export const errandMove = (e: Errand): Move => ({ type: 'CompleteTask', taskId: e.task, actor: 'helper' });
