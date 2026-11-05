// GAME-248 · «Люди живуть»: мешканці табору — у повний зріст (не обрізані по пояс), а на простої кожен робить власну звичку (не дихання 1 px).
// Обрізка дозволена лише коли сидить на лавці (SIT_DY, як герой). Час: ?atMinute=N від 8:00 (180 → 11:00, 660 → 19:00). Знімки — G248_SHOTS.
import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { waitGameReady } from './ready';

const SHOTS = process.env.G248_SHOTS;
interface N { id: string; state: string; phase: string; pose: string; cropRows: number; sitting: boolean }
const nb = (page: Page): Promise<N[]> => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __game: { probe: { neighbours: unknown } } }).__game.probe.neighbours)) as N[]);

async function open(page: Page, atMinute: number, map = 'camp'): Promise<void> {
  await page.addInitScript(() => { try { localStorage.setItem('camplife.settings.v1', JSON.stringify({ textScale: 100, language: 'uk', hintSeen: true })); } catch { /* сховища немає */ } });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto(`/?seed=2&map=${map}&noAutosave=1&atMinute=${atMinute}`);
  await waitGameReady(page);
  await page.waitForTimeout(500);
}

test('о 19:00 усі біля наметів у повний зріст, і за 8 с кожен показує власну звичку', async ({ page }) => {
  test.setTimeout(60_000);
  await open(page, 660);
  const seen = new Map<string, Set<string>>();
  const t0 = Date.now();
  while (Date.now() - t0 < 8_000) {
    const ns = await nb(page);
    expect(ns.length, 'сусідів нема — тест нічого не доводить').toBe(6);
    for (const n of ns) {
      expect(n.cropRows, `${n.id}: обрізаний по пояс (${n.state}/${n.phase})`).toBe(64);
      if (n.pose !== '' && n.pose !== 'rest') (seen.get(n.id) ?? seen.set(n.id, new Set()).get(n.id))?.add(n.pose);
    }
    await page.waitForTimeout(120);
  }
  if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/camp-after.png` }); }
  for (const n of await nb(page)) expect(seen.get(n.id)?.size ?? 0, `${n.id}: жодної звички за 8 с`).toBeGreaterThanOrEqual(1);
});

test('вдень ніхто не обрізаний, окрім сидячого на лавці', async ({ page }) => {
  test.setTimeout(60_000);
  await open(page, 180);
  for (const n of await nb(page)) {
    const bench = n.state === 'sit' && n.phase === 'out';
    expect(n.cropRows === 64 || bench, `${n.id}: ${n.state}/${n.phase} crop ${n.cropRows}`).toBe(true);
  }
});
