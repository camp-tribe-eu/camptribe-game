// Стан Мії для екрана (GAME-111): рівно два ТЕКСТОВІ стани, жодних чисел і шкал (рішення власника 24.10).
//  * `settled` — «місце облаштоване»: жодна справа про Мію зараз не чекає;
//  * `pause`   — «потрібна пауза»: у живій хвилі відкрита справа про Мію (переноска, вода, авто, пошук).
// Стан виводиться з ядра, нічого не пише й нічого не карає: «потрібна пауза» — підказка, не поразка (строк справи спізнюється
// м'яко, див. src/core/wave.ts). Без кішки — null, і панелі Мії немає. Сторож DOM — tests/e2e/game-111.spec.ts.
import type { CoreDefs } from '../core/defs';
import type { GameState } from '../core/state';

export type MiaState = 'settled' | 'pause';
export const MIA_ANIMAL = 'animal.cat';

export function miaState(game: Pick<GameState, 'player' | 'wave'>, defs: Pick<CoreDefs, 'waves'>): MiaState | null {
  if (game.player?.animalId !== MIA_ANIMAL) return null;
  const a = game.wave?.active;
  const w = a && Object.hasOwn(defs.waves?.waves ?? {}, a.waveId) ? defs.waves?.waves[a.waveId] : undefined;
  const needsPause = w?.tasks.some((t) => t.animal !== undefined && a?.tasks[t.id]?.outcome === 'open') ?? false;
  return needsPause ? 'pause' : 'settled';
}
