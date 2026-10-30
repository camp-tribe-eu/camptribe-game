// GAME-195 · розвилка рибки (OD-023): вибір на озері «Відпустити / Взяти на вечерю» пишеться фактом ядра й формує вечір дня 2.
// Факт ставить сцена-однорядник через StartScene (звичайний механізм сюжету; журнал: Memory + StartScene), а вечірня сцена
// dlg.ch1-fire сама обирає гілку (branches) за цими фактами. «Взяв» сильніший за «відпустив» (прапорці не знімаються): хоч раз узяв — вечеря з рибою.
import type { Move } from './moves';

export const FISH_KEEP_SCENE = 'dlg.fish-keep';
export const FISH_RELEASE_SCENE = 'dlg.fish-release';
export const FISH_FACTS = { kept: 'f.fish-kept', released: 'f.fish-released', charred: 'f.fish-charred', trustNora: 'f.trust-nora-fish' } as const;

export type FishEvening = 'kept' | 'released' | 'none';
export const fishEvening = (flags: readonly string[]): FishEvening => (flags.includes(FISH_FACTS.kept) ? 'kept' : flags.includes(FISH_FACTS.released) ? 'released' : 'none');

/** Хід запису вибору; null — нічого нового (той самий чи слабший вибір уже записано). */
export function fishChoiceMove(keep: boolean, flags: readonly string[]): Move | null {
  const now = fishEvening(flags);
  if (keep ? now === 'kept' : now !== 'none') return null;
  return keep ? { type: 'StartScene', sceneId: FISH_KEEP_SCENE, facts: [FISH_FACTS.kept] } : { type: 'StartScene', sceneId: FISH_RELEASE_SCENE, facts: [FISH_FACTS.released] };
}
