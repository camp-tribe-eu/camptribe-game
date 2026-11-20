// GAME-337 · зроблені справи табору переживають розмову із сусідом: дошка відкривається ДОШКОЮ (а не застарілою рутиною), результат на місці й у сейві.
// Мутації, що червонять файл (1):  focus={req} замість focus={fresh} → після розмови відкривається рутина, а не дошка.
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

const panel = (page: Page) => page.locator('[data-ui="story"]');
const box = (page: Page) => panel(page).locator('[data-ui="dialogue"]');
async function talk(page: Page, id: string): Promise<void> {
  await walkInPage(page, { label: `до ${id}`, toId: id, act: { id, key: 'Space' } });
  await expect(box(page)).toBeVisible({ timeout: 8_000 });
}
async function close(page: Page): Promise<void> {
  for (let i = 0; i < 14 && await box(page).isVisible(); i++) { await panel(page).locator('[data-act]').last().click(); await page.waitForTimeout(380); }
  await expect(box(page)).toBeHidden({ timeout: 5_000 });
}
async function pick(page: Page, text: string): Promise<void> {
  const btn = panel(page).locator('[data-act="choose"]', { hasText: text });
  for (let i = 0; i < 8 && !(await btn.first().isVisible().catch(() => false)); i++) { await panel(page).locator('[data-act="continue"]').click({ timeout: 5_000 }); await page.waitForTimeout(400); }
  await expect(btn.first(), `вибору «${text}» немає`).toBeVisible({ timeout: 5_000 });
  await btn.first().click();
  await page.waitForTimeout(420);
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

    test('крок місії «Іду до колонки з ситом»: позначка на зоні, місце «Вода» мовчить, міні-гра стартує в зоні', async ({ page }) => {
      const errors = await openCamp(page);
      await talk(page, 'npc.amina');
      for (const t of ['У тебе щось сталося?', 'Пройдімо його втретє', 'Що ти робила біля води?', 'Ти щось чула, коли вона впала?', 'У чому ти була взута?', 'Я йду шукати', 'Кам’яна плита під колонкою', 'Підняти плиту', 'Зрозумів, іду', 'Іду до колонки з ситом']) await pick(page, t);
      await close(page);
      const icons = await page.evaluate(() => (window as unknown as { __game: { probe: { markerIcons: Record<string, string> } } }).__game.probe.markerIcons);
      expect(icons['trip.sanitary'], 'у зоні походу є позначка цілі').toBe('compass');
      await walkInPage(page, { label: 'до колонки (місце «Вода»)', to: STATIONS.water.at, until: [{ within: 3 }] });
      await page.keyboard.press('Space');
      await page.waitForTimeout(500);
      await expect(page.locator('[data-ui="camp-work"]'), 'місце «Вода» не краде крок місії').toHaveCount(0);
      const walking = walkInPage(page, { label: 'у зону походу', to: { x: 23.5 * 32, y: 5.5 * 32 }, until: [{ within: 3 }], maxMs: 20_000 }).catch(() => undefined);   // міні-гра зупиняє героя на краю зони
      await expect(page.locator('[data-ui="minigame"]'), 'міні-гра місії стартувала в зоні').toBeVisible({ timeout: 15_000 });
      await walking;
      expect(errors).toEqual([]);
    });
  });
}
