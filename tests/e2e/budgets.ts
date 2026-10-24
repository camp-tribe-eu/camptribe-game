// GAME-38 · пороги e2e — лише з budgets.json у корені (єдине джерело; там же why — ціна хибного спрацювання).
// Нема ключа чи не ціле > 0 — тест падає з причиною, а не бере тихий дефолт (закон 4). Повну схему стереже
// scripts/budget/check-bundle.mjs (FAIL BUDGETS у `npm run check`).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

type Key = 'firstFrameMaxMs' | 'fpsMedianMin' | 'fpsSamples';

export function budget(key: Key): number {
  const raw = JSON.parse(readFileSync(fileURLToPath(new URL('../../budgets.json', import.meta.url)), 'utf8')) as Record<string, { value?: unknown } | undefined>;
  const v = raw[key]?.value;
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v <= 0) throw new Error(`budgets.json: «${key}.value» має бути цілим > 0, є ${JSON.stringify(v)}`);
  return v;
}
