// GAME-337 · зроблені справи табору переживають розмову із сусідом: дошка відкривається ДОШКОЮ (а не застарілою рутиною), результат на місці й у сейві.
// Мутації, що червонять файл: focus={req} замість focus={fresh} → після розмови відкривається рутина, а не дошка.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { waitGameReady } from './ready';
import { STATIONS } from '../../src/content/camp-stations';
import { walkInPage } from './walk.helpers';

const SAVE = (JSON.parse(readFileSync(new URL('./fixtures/sample-camp.json', import.meta.url), 'utf8')) as { save: string }).save;
interface Core { game: { campBoard?: { results?: Record<string, string> } } }
const core = (page: Page): Promise<Core> => page.evaluate(() => (window as unknown as { __game: { read: () => Core } }).__game.read());
const tapIt = async (page: Page, sel: string): Promise<void> => { await page.locator(sel).tap(); await page.waitForTimeout(120); };

async function openCamp(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?seed=7&sampleDay=1');
  await waitGameReady(page);
  await page.evaluate((json) => new Promise<void>((resolve, reject) => {
    const req = indexedDB.open('camplife-sample', 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => { const tx = req.result.transaction('saves', 'readwrite'); tx.objectStore('saves').put(json, 'main'); tx.oncomplete = () => { req.result.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
  }), SAVE);
  await page.goto('/?seed=7&sampleDay=1');
  await waitGameReady(page);
  await expect(page.locator('[data-ui="sd-board"]')).toBeVisible({ timeout: 10_000 });
  return errors;
}

for (const o of [{ name: 'portrait', viewport: { width: 390, height: 844 } }, { name: 'landscape', viewport: { width: 932, height: 430 } }] as const) {
  test.describe(`GAME-337 — ${o.name}`, () => {
    test.use({ viewport: o.viewport, hasTouch: true, isMobile: false });
    test.setTimeout(240_000);

    test('справа → розмова із сусідом → дошка відкривається дошкою, результат на місці й у сейві', async ({ page }) => {
      const errors = await openCamp(page);
      await tapIt(page, '[data-ui="sd-board"]');
      await tapIt(page, '[data-ui="camp-routine"][data-id="firewood"]');
      await tapIt(page, '[data-ui="wood-place-choice"][data-place="near"]');
      for (const i of await page.locator('[data-ui="wood-log"]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.i ?? ''))) await tapIt(page, `[data-ui="wood-under"][data-i="${i}"]`);
      await expect(page.locator('[data-ui="wood-done"]')).toBeEnabled({ timeout: 40_000 });
      await tapIt(page, '[data-ui="wood-done"]');
      await expect(page.locator('[data-ui="camp-routine"][data-id="firewood"]')).toHaveAttribute('data-done', 'yes');
      await expect.poll(async () => (await core(page)).game.campBoard?.results?.firewood, { message: 'результат справи дійшов до сейву' }).toBeTruthy();
      await tapIt(page, '[data-ui="sd-board-close"]');
      // Запит із мапи («Ягоди», не доведені): після розмови він не має відкривати цю рутину замість дошки.
      await walkInPage(page, { label: 'до місця «Ягоди»', to: STATIONS.berries.at, act: { id: STATIONS.berries.spot, key: 'Space' } });
      await expect(page.locator('[data-ui="camp-work"][data-kind="berries"]')).toBeVisible({ timeout: 5_000 });
      await tapIt(page, '[data-ui="sd-board-close"]');

      await walkInPage(page, { label: 'до Клер', toId: 'npc.claire', act: { id: 'npc.claire', key: 'Space' } });
      await expect(page.locator('[data-ui="story"] [data-ui="dialogue"]'), 'розмова з Клер почалась').toBeVisible({ timeout: 8_000 });
      for (let i = 0; i < 14 && await page.locator('[data-ui="story"] [data-ui="dialogue"]').isVisible(); i++) { await page.locator('[data-ui="story"] [data-act]').last().click(); await page.waitForTimeout(380); }
      await expect(page.locator('[data-ui="story"] [data-ui="dialogue"]')).toBeHidden({ timeout: 5_000 });

      await tapIt(page, '[data-ui="sd-board"]');
      await expect(page.locator('[data-ui="camp-board"]'), 'відкрилась дошка, а не застаріла рутина').toBeVisible();
      await expect(page.locator('[data-ui="camp-work"]')).toHaveCount(0);
      await expect(page.locator('[data-ui="camp-routine"][data-id="firewood"]'), 'зроблена справа лишилась зробленою').toHaveAttribute('data-done', 'yes');
      expect((await core(page)).game.campBoard?.results?.firewood, 'результат у сейві').toBeTruthy();
      expect(errors).toEqual([]);
    });
  });
}
