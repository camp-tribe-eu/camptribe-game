// GAME-38 · перший кадр < 1,5 с (рішення власника). Міряємо від початку навігації (performance.now) до першого кадру Phaser, який
// main.ts пише в probe.firstFrameMs. Проєкт «perf» (playwright.config.ts): вимір абсолютного часу не ділить процесор із сусідами.
// Негативний контроль: ?bootDelayMs=2000 (лише збірка e2e) гальмує старт — тест мусить почервоніти.
// Відтворення червоного: GAME38_BOOT_DELAY_MS=2000 npx playwright test game-38 --no-deps
import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const BUDGET_MS = 1500;
const lag = Number(process.env.GAME38_BOOT_DELAY_MS ?? 0);
const query = `/?seed=2${lag ? `&bootDelayMs=${lag}` : ''}`;
type Hook = { __game?: { probe: { firstFrameMs: number } } };

for (const vp of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`перший кадр < ${BUDGET_MS} мс на ${vp.width}×${vp.height}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto(query);
    await page.waitForFunction(() => ((window as unknown as Hook).__game?.probe.firstFrameMs ?? 0) > 0, null, { timeout: 30_000 });
    const ms = await page.evaluate(() => (window as unknown as Required<Hook>).__game.probe.firstFrameMs);
    console.log(`GAME-38 перший кадр ${vp.width}x${vp.height}: ${ms.toFixed(0)} мс (бюджет ${BUDGET_MS})`);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThan(BUDGET_MS);
  });
}
