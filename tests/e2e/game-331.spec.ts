import { readFileSync } from 'node:fs';
// GAME-331 · скарга власника: «не можу запустити нову гру — лише табір доступний». Шлях: зразковий день (?sampleDay=1) → ‖ → «Нова гра».
// Було: порт запускав ПОВНУ гру (екран «Хто вирушає») в адресі зразка — гравець застрявав у гібриді. Тепер: «Почати день знову» → той самий день спочатку.
// Мутація (перевірено): прибрати рядок `if (port.sample) { void port.sample.restart(); return; }` у Shell.startNew → обидві орієнтації червоніють (екран вибору замість дороги).
// GAME-342: свіжий день одразу на дорозі (без ☰ і підказки); прогрес — збережений табір із fixtures/sample-camp.json, «Почати день знову» повертає його на дорогу.
const SAVE = (JSON.parse(readFileSync(new URL('./fixtures/sample-camp.json', import.meta.url), 'utf8')) as { save: string }).save;
const where = (page: import('@playwright/test').Page): Promise<string> => page.evaluate(() => (window as unknown as { __game: { read: () => { game: { player: { locationId: string } } } } }).__game.read().game.player.locationId);
import { expect, test } from '@playwright/test';
import { waitGameReady } from './ready';

for (const [name, viewport] of [['portrait', { width: 390, height: 844 }], ['landscape', { width: 932, height: 430 }]] as const) {
  test.describe(name, () => {
    test.use({ viewport, hasTouch: true });
    test(`зразок: «Нова гра» з паузи = день спочатку (${name})`, async ({ page }) => {
      await page.goto('/?seed=7&sampleDay=1');
      await waitGameReady(page);
      expect(await where(page), 'GAME-342: свіжий день одразу на дорозі').toBe('loc.road');
      await page.evaluate((json) => new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('camplife-sample', 1);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => { const tx = req.result.transaction('saves', 'readwrite'); tx.objectStore('saves').put(json, 'main'); tx.oncomplete = () => { req.result.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
      }), SAVE);
      await page.reload();
      await waitGameReady(page);
      expect(await where(page), 'день пішов: збережений табір, а не дорога').toBe('loc.camp.lake');
      await page.locator('[data-touch="pause"]').tap();
      await expect(page.locator('[data-ui="code-apply"]'), 'у зразку немає «Відновити» (код повної гри не вантажиться в зразок)').toHaveCount(0);
      await expect(page.locator('[data-ui="new-game"]')).toHaveText('Почати день знову');
      await page.locator('[data-ui="new-game"]').tap();
      await expect(page.locator('[data-ui="confirm-new-text"]')).toContainText('Почати день знову?');
      await page.evaluate(() => { (window as unknown as { __old: boolean }).__old = true; });
      await page.locator('[data-ui="confirm-new-yes"]').tap();
      await page.waitForFunction(() => (window as unknown as { __old?: boolean }).__old === undefined, null, { timeout: 15_000 });   // сторінка справді перезавантажилась (URL той самий)
      await waitGameReady(page);
      await expect(page.locator('[data-ui="create"]'), 'екрана вибору мандрівників (повна гра) немає').toHaveCount(0);
      expect(await where(page), 'день знову з дороги: збережений табір стерто').toBe('loc.road');
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
