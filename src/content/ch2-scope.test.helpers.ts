// GAME-285 · розділ 2 лежить у тому ж quests.json, але бот і перебір розділу 1 його не бачать (старт — CH1, зв'язок розділів лише в meta.chapterLinks).
// Тести, що описують РОЗДІЛ 1 (межі дня, XP, множини квестів і локацій), відсіюють розділ 2 цими помічниками, а не послаблюють перевірки.
export const isCh1Quest = (id: string): boolean => !id.startsWith('CH2-');

interface QuestLike { readonly locationId?: string; readonly objectives: readonly { readonly target: string }[] }
/** Локації лише розділу 2 (мапа Люксембургу): на них посилаються квести CH2-*, але жоден квест розділу 1; гравець розділу 1 до них не доходить. */
export function ch2Locations(st: { readonly quests: Readonly<Record<string, QuestLike>>; readonly locations: Readonly<Record<string, unknown>> }): ReadonlySet<string> {
  const refs = (own: boolean): Set<string> => {
    const out = new Set<string>();
    for (const [id, q] of Object.entries(st.quests)) {
      if (isCh1Quest(id) === own) continue;
      for (const loc of [q.locationId, ...q.objectives.map((o) => o.target)]) if (loc !== undefined && Object.hasOwn(st.locations, loc)) out.add(loc);
    }
    return out;
  };
  const one = refs(false);
  return new Set([...refs(true)].filter((l) => !one.has(l)));
}
