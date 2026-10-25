// GAME-37 · кампанія бота: N прогонів з фіксованим зерном (TD-012). Спільна для bot.test.ts і save-size.test.ts
// (GAME-103: найбільший сейв, який дає бот) — один бот, без дублювання. Поза грою: тягне перелік комбінацій із
// валідатора, у збірку не потрапляє.
import type { CoreDefs } from '../core/defs';
import { nextInt, seedRng } from '../core/rng';
import { enumerateCombos } from '../../scripts/validator/combos.mjs';
import { runBot, variantsFor, type BotRun, type EndMemo, type Variant } from './bot';
import { CONTENT } from './story';

/** Зерно кампанії бота (GAME-37). */
export const BOT_SEED = 20261023;
/** Скільки прогонів у головній кампанії бота (bot.test.ts). */
export const BOT_N = 2000;

/** n прогонів: варіант кожного — з RNG зерна, зерно прогону — seed + i. Перші k прогонів — завжди ті самі (префікс). */
export function campaign(defs: CoreDefs, n: number, seed: number, opts?: { maxSteps: number; cap: number }): BotRun[] {
  const variants = variantsFor(enumerateCombos(CONTENT));
  const memo: EndMemo = new Map();
  let rng = seedRng(seed);
  const runs: BotRun[] = [];
  for (let i = 0; i < n; i++) {
    const r = nextInt(rng, variants.length);
    rng = r.state;
    runs.push(runBot(defs, variants[r.value] as Variant, seed + i, memo, opts));
  }
  return runs;
}
