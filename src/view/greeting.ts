// GAME-258 · привітання за порою доби й лише перше за день. Дані: у content/locales поруч із ключем репліки лежать необов'язкові варіанти
// `<ключ>.again` (коротка репліка, коли сьогодні вже говорили) і `<ключ>.morning|day|evening` (за годинником). Немає варіанта — звичайний ключ,
// тож жодна розмова не ламається. Чиста логіка (resolveGreeting, dayPartOf) + крихітний трекер «з ким сьогодні вже говорили» (лише вигляд, не сейв).
import { minuteOfDay } from '../core/clock';

export type DayPart = 'morning' | 'day' | 'evening';
/** Ранок 05:00–11:59, день 12:00–17:59, вечір 18:00–04:59 (ніч — теж «вечір»: «гарного ранку» о 02:00 було б дивно). */
export function dayPartOf(minutes: number): DayPart {
  const m = minuteOfDay(minutes);
  return m >= 300 && m < 720 ? 'morning' : m >= 720 && m < 1080 ? 'day' : 'evening';
}

/** Ключ репліки з урахуванням пори доби й «вже вітались сьогодні». `has` — чи є такий ключ у локалі. */
export function resolveGreeting(key: string, part: DayPart, first: boolean, has: (k: string) => boolean): string {
  if (!first && has(`${key}.again`)) return `${key}.again`;
  return has(`${key}.${part}`) ? `${key}.${part}` : key;
}

const greeted = new Map<string, number>();
let open: { npcId: string; day: number } | null = null;
/** Викликати з кожною збіркою пропозицій: поки розмова з NPC відкрита — пам'ятаємо; щойно закрилась — NPC «привітаний сьогодні». */
export function trackTalk(npcId: string | undefined, day: number): boolean {
  if (npcId !== undefined) { open = { npcId, day }; return greeted.get(npcId) !== day; }
  if (open) { greeted.set(open.npcId, open.day); open = null; }
  return true;
}
export const resetGreetings = (): void => { greeted.clear(); open = null; };
