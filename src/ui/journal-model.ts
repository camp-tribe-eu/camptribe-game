// GAME-253: модель сторінки-щоденника — чисті функції без DOM. Записи журналу ядра → групи по днях, найновіше зверху.
export interface JournalEntryIn { readonly type: string; readonly key: string | null; readonly at: number }
export interface JournalDay { readonly day: number; readonly entries: readonly JournalEntryIn[] }

/** Хвилин у добі (та сама добова межа, що в core/weather.dayOf). */
export const DAY_MINUTES = 1440;
/** Скільки найновіших записів видно, поки не натиснуто «Показати ще». */
export const JOURNAL_VISIBLE = 8;

/** Значок на кожен тип запису (JOURNAL_TYPES ядра; повноту звіряє journal-model.test.ts). */
export const JOURNAL_ICONS: Readonly<Record<string, string>> = {
  CreateCharacter: '🧭', Visit: '📍', Pickup: '🎒', BuyItem: '🛒', SellItem: '💶', Interact: '💬', CompleteQuest: '✅', DeclineQuest: '⏳',
  RoadEvent: '🛣️', StartScene: '🔥', PackItem: '📦', UnpackItem: '📤', AutoPack: '🧳', Memory: '⭐', CompleteTask: '🔧', Sleep: '🌙',
};
/** Значок навички за id (8 навичок сценарію). */
export const SKILL_ICONS: Readonly<Record<string, string>> = {
  'skill.planning': '🗺️', 'skill.camping': '⛺', 'skill.mechanics': '🔧', 'skill.electrics': '🔌', 'skill.cooking': '🍳', 'skill.finance': '💶', 'skill.endurance': '🥾', 'skill.communication': '🤝',
};

export function dayNumber(at: number): number { return Math.floor(Math.max(0, at) / DAY_MINUTES) + 1; }

/** Групи по днях: дні від нового до старого, записи в дні — теж від нового до старого. `limit` — скільки найновіших записів лишити (усі, якщо не задано). */
export function groupByDay(entries: readonly JournalEntryIn[], limit = Infinity): JournalDay[] {
  const newest = entries.map((e, i) => ({ e, i })).sort((a, b) => b.e.at - a.e.at || b.i - a.i).slice(0, limit);
  const days: { day: number; entries: JournalEntryIn[] }[] = [];
  for (const { e } of newest) {
    const day = dayNumber(e.at);
    const last = days[days.length - 1];
    if (last && last.day === day) last.entries.push(e);
    else days.push({ day, entries: [e] });
  }
  return days;
}
