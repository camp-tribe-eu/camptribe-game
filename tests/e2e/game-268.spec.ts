// GAME-268 · світ під повним екраном не малюється. Лічильник кадрів — window.__game.frames() (лише читання; кадри, які Phaser справді намалював).
// ☰, пауза ‖ і Атлас закривають поле повністю → за 2 с ≈ 0 кадрів; після закриття кадри йдуть; рамка розмови (внизу, напівпрозора) світ НЕ зупиняє.
// Мутація (Закон 1, показано в PR): worldCovered() завжди false («малювати завжди») → усі «≈ 0» червоніють.
// G268_PERF=1 — вимір головного потоку (CDP: CPU ×6, Performance.getMetrics TaskDuration) з відкритим ☰; у звичайному прогоні вимкнено.
import { expect, test, type Page } from '@playwright/test';
import { arriveInCamp } from './camp-arrival';
import { goAndDo, talk } from './chapter-driver';

const frames = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as { __game: { frames: () => number } }).__game.frames());
/** Кадрів, намальованих за `ms` мс. */
async function framesIn(page: Page, ms: number): Promise<number> {
  const a = await frames(page);
  await page.waitForTimeout(ms);
  return (await frames(page)) - a;
}
const MOVING_MIN = 5;   // за 1 с живий світ дає не менше (SwiftShader у CI — десятки кадрів/с; поріг далеко від 0)

async function covered(page: Page, label: string): Promise<void> {
  await page.waitForTimeout(500);   // осідання: останній кадр при закритті малюється один раз
  const n = await framesIn(page, 2_000);
  expect(n, `${label}: за 2 с намальовано ${n} кадрів — світ під повним екраном мусить стояти`).toBeLessThanOrEqual(1);
}
async function moving(page: Page, label: string): Promise<void> {
  await expect.poll(() => framesIn(page, 1_000), { message: `${label}: світ мусить малюватись знову`, timeout: 15_000 }).toBeGreaterThanOrEqual(MOVING_MIN);
}

for (const [name, viewport] of [['390×844', { width: 390, height: 844 }], ['932×430', { width: 932, height: 430 }]] as const) {
  test.describe(`GAME-268 ${name}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });
    test.setTimeout(240_000);

    test('☰, пауза, Атлас — кадрів ≈ 0; після закриття йдуть; рамка розмови світ не зупиняє', async ({ page }) => {
      const errors = await arriveInCamp(page);
      await moving(page, 'старт');

      await page.locator('[data-touch="story"]').tap();
      await expect(page.locator('[data-ui="story-close"]')).toBeVisible();
      await covered(page, '☰');
      if (process.env.G268_PERF === '1') await perf(page, name);
      // Атлас — з ☰, лишається під повним екраном без проміжного кадру світу.
      await page.locator('[data-ui="atlas-open"]').tap();
      await expect(page.locator('[data-ui="atlas-map"]')).toBeVisible();
      await covered(page, 'Атлас');
      await page.keyboard.press('Escape');   // Атлас → ☰
      await expect(page.locator('[data-ui="story-close"]')).toBeVisible();
      await page.locator('[data-ui="story-close"]').tap();
      await moving(page, 'після ☰ і Атласу');

      await page.locator('.ui-pause-btn').tap();
      await expect(page.locator('[data-ui="resume"]')).toBeVisible();
      await covered(page, 'пауза ‖');
      await page.locator('[data-ui="resume"]').tap();
      await moving(page, 'після паузи');

      // Рамка розмови: напівпрозора, внизу — світ під нею живе (сцена на паузі, але кадри йдуть).
      await goAndDo(page, true);
      await expect(talk(page)).toBeVisible({ timeout: 8_000 });
      await moving(page, 'рамка розмови');
      expect(errors).toEqual([]);
    });
  });
}

/** G268_PERF: частка головного потоку за 3 с з відкритим ☰ при CPU ×6. */
async function perf(page: Page, label: string): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await cdp.send('Performance.enable');
  const task = async (): Promise<number> => ((await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'TaskDuration')?.value ?? 0);
  await page.waitForTimeout(500);
  const t0 = await task(); const f0 = await frames(page); const w0 = Date.now();
  await page.waitForTimeout(3_000);
  const t1 = await task(); const f1 = await frames(page); const w1 = Date.now();
  console.log(`G268_PERF ${label} ☰ відкрито, CPU×6: головний потік ${(((t1 - t0) * 1000) / (w1 - w0) * 100).toFixed(1)} %, кадрів Phaser за 3 с: ${f1 - f0}`);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
}
