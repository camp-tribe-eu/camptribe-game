// GAME-229 · порядок екранів наприкінці дня. Один раз і в одному місці, щоб його можна було довести тестом:
//   картка розділу («серія») → екран «Що відкрилось» (нові ранги навичок) → підсумок дня.
// Підсумок завжди ПІСЛЯ рангів: гравець спершу святкує, потім читає, що було за день. Екран рангів без підсумку (день не скінчився) не відкривається:
// ранги чекають кінця дня, щоб не перебивати гру. Вимкнено в налаштуваннях — рангів не показуємо зовсім (навичка росте так само, лише без екрана).
export type Overlay = 'episode' | 'levelup' | 'summary';

/** Новий ранг навички; `order` — місце напряму в SKILL_IDS (ставить main: UI не імпортує значень ядра). */
export interface SkillUp { readonly skill: string; readonly rank: number; readonly order: number }
/** Одна картка на навичку: найвищий досягнутий ранг і всі здобуті ранги (для рядків «що відкрилось»). */
export interface SkillCard { readonly skill: string; readonly rank: number; readonly ranks: readonly number[] }

/** Згорнути чергу рангів: одна картка на навичку, у порядку SKILL_IDS, ранги по зростанню без повторів. */
export function collapseUps(ups: readonly SkillUp[]): SkillCard[] {
  const by = new Map<string, { order: number; ranks: Set<number> }>();
  for (const u of ups) { const e = by.get(u.skill) ?? { order: u.order, ranks: new Set<number>() }; e.ranks.add(u.rank); by.set(u.skill, e); }
  return [...by.entries()].sort((a, b) => a[1].order - b[1].order).map(([skill, e]) => { const ranks = [...e.ranks].sort((x, y) => x - y); return { skill, rank: ranks[ranks.length - 1] as number, ranks }; });
}

export function topOverlay(f: { readonly episode: boolean; readonly ups: number; readonly summary: boolean }): Overlay | null {
  if (f.episode) return 'episode';
  if (f.summary) return f.ups > 0 ? 'levelup' : 'summary';
  return null;
}

/** Нові ранги, що йдуть у чергу екрана: порожньо, коли екран вимкнено в налаштуваннях. */
export const queueUps = (enabled: boolean, ups: readonly SkillUp[]): readonly SkillUp[] => (enabled ? ups : []);
