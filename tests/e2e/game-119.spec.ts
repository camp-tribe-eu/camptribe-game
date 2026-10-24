// GAME-119 · назва гри CampTribe (рішення власника 24.10.2026) там, де її бачить гравець: вкладка браузера (<title>)
// і підпис збірки в меню паузи. Очікуване береться з тієї самої константи GAME_NAME, що й гра: змінити її — тест бачить
// нову назву (мутація у звіті картки). Що константа = 'CampTribe', тримає src/guards/brand.test.ts.
import { GAME_NAME } from '../../src/config/brand';
import { expect, test } from '@playwright/test';

test('назва гри — у вкладці браузера й у підписі збірки', async ({ page }) => {
  await page.goto('/?seed=2');
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { saveLoaded: boolean } } }).__game?.probe.saveLoaded === true, null, { timeout: 30_000 });
  expect(await page.title()).toBe(GAME_NAME);
  await page.locator('[data-touch="pause"]').click();
  await expect(page.locator('[data-ui="pause"] [data-ui="build"]')).toHaveText(new RegExp(`^${GAME_NAME} v\\S+ · `));
  console.log(`GAME-119 бачить: title=«${await page.title()}», підпис=«${await page.locator('[data-ui="build"]').textContent()}»`);
});

test('спайк Phaser (spike.html) — теж з новою назвою, без %GAME_NAME%', async ({ page }) => {
  await page.goto('/spike.html');
  expect(await page.title()).toBe(`${GAME_NAME} · спайк Phaser 4 (GAME-14)`);
});
