// GAME-108 · спільне для тестів-сценаріїв: на дорозі тепер десять подій, і кидок симуляції може відкрити не ту, на яку
// сценарій розраховував. «Вийти з події» — останній вибір вузла (у кожної події він безумовний: це стереже
// road-events.test.ts) або «далі».
import type { StoryDefs } from '../core/defs';
import type { GameState } from '../core/state';
import type { Move } from './moves';

/** Наступний хід, що веде відкриту розмову до кінця; null — розмови немає. */
export function leaveMove(g: Pick<GameState, 'dialogue'>, st: Pick<StoryDefs, 'dialogues'>): Move | null {
  const d = g.dialogue;
  if (!d) return null;
  const choices = st.dialogues[d.id]?.nodes[d.node]?.choices;
  return choices ? { type: 'Choose', choice: choices.length - 1 } : { type: 'Continue' };
}
