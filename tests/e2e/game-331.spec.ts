// GAME-331 · скарга власника: «не можу запустити нову гру — лише табір доступний». Шлях: зразковий день (?sampleDay=1) → ‖ → «Нова гра».
// Було: порт запускав ПОВНУ гру (екран «Хто вирушає») в адресі зразка — гравець застрявав у гібриді. Тепер: «Почати день знову» → той самий день спочатку.
// Мутація (перевірено): прибрати рядок `if (port.sample) { void port.sample.restart(); return; }` у Shell.startNew → обидві орієнтації червоніють (немає підказки старту / екран вибору).
import { expect, test } from '@playwright/test';
import { waitGameReady } from './ready';

for (const [name, viewport] of [['portrait', { width: 390, height: 844 }], ['landscape', { width: 932, height: 430 }]] as const) {
  test.describe(name, () => {
    test.use({ viewport, hasTouch: true });
    test(`зразок: «Нова гра» з паузи = день спочатку (${name})`, async ({ page }) => {
      await page.goto('/?sampleDay=1');
      await waitGameReady(page);
      await expect(page.locator('[data-ui="hint"]'), 'на старті сказано, що робити («Відкрий ☰»)').toBeVisible();
      // День рухається: ☰ → обрати родину → стан ядра змінився (хоч би годинник/місце) — інакше перезавантаження без newGame теж «пройшло б».
      await page.locator('[data-touch="story"]').tap();
      await page.locator('[data-ui="create"] button').first().tap();
      await page.locator('[data-ui="story-close"]').tap();
      const progressed = await page.locator('[data-ui="hud-place"]').textContent();
      expect(progressed, 'день пішов: місце вже обране').not.toContain('місце ще не обране');
      await page.locator('[data-touch="pause"]').tap();
      await expect(page.locator('[data-ui="code-apply"]'), 'у зразку немає «Відновити» (код повної гри не вантажиться в зразок)').toHaveCount(0);
      await expect(page.locator('[data-ui="new-game"]')).toHaveText('Почати день знову');
      await page.locator('[data-ui="new-game"]').tap();
      await expect(page.locator('[data-ui="confirm-new-text"]')).toContainText('Почати день знову?');
      await page.locator('[data-ui="confirm-new-yes"]').tap();
      await page.waitForURL(/sampleDay=1/);
      await waitGameReady(page);
      await expect(page.locator('[data-ui="create"]'), 'екрана вибору мандрівників (повна гра) немає').toHaveCount(0);
      await expect(page.locator('[data-ui="hint"]'), 'день знову на старті з підказкою').toBeVisible();
      await expect(page.locator('[data-ui="hud-place"]')).toContainText('місце ще не обране');
      // Повний сейв (база `camplife`) не писався: зразок живе у своїй `camplife-sample`.
      expect((await page.evaluate(() => indexedDB.databases())).map((d) => d.name)).not.toContain('camplife');
    });
    test(`звичайна гра: «Відновити» є (${name})`, async ({ page }) => {
      await page.goto('/');
      await waitGameReady(page);
      await page.locator('[data-touch="pause"]').tap();
      await expect(page.locator('[data-ui="code-apply"]')).toHaveCount(1);
    });
  });
}
