// GAME-229 · порядок екранів наприкінці дня. Один раз і в одному місці, щоб його можна було довести тестом:
//   картка розділу («серія») → екран «Що відкрилось» (нові ранги навичок) → підсумок дня.
// Підсумок завжди ПІСЛЯ рангів: гравець спершу святкує, потім читає, що було за день. Екран рангів без підсумку (день не скінчився) не відкривається:
// ранги чекають кінця дня, щоб не перебивати гру. Вимкнено в налаштуваннях — рангів не показуємо зовсім (навичка росте так само, лише без екрана).
export type Overlay = 'episode' | 'levelup' | 'summary';

export interface SkillUp { readonly skill: string; readonly rank: number }

export function topOverlay(f: { readonly episode: boolean; readonly ups: number; readonly summary: boolean }): Overlay | null {
  if (f.episode) return 'episode';
  if (f.summary) return f.ups > 0 ? 'levelup' : 'summary';
  return null;
}

/** Нові ранги, що йдуть у чергу екрана: порожньо, коли екран вимкнено в налаштуваннях. */
export const queueUps = (enabled: boolean, ups: readonly SkillUp[]): readonly SkillUp[] => (enabled ? ups : []);
