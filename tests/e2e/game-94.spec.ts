// GAME-94 · після кожної завершеної подорожі гра тихо пропонує скопіювати код відновлення (збереження живе лише в браузері).
// Перевірки: 1) нагадування не діалог, кнопки ≥44 px, гра йде далі, копіювання справді кладе код у буфер і код відновлює
// той самий стан; 2) та сама подорож після перезавантаження — без повтору, інша подорож — знову; 3) без приїзду — нічого.
// Кожна перевірка має негативний контроль (мутація — у звіті картки).
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

interface Core { game: unknown; clock: { minutes: number }; journal: { type: string; commandId: string }[] }
interface Probe { playerX: number; playerY: number; clockMinutes: number }
const core = (page: Page): Promise<Core> => page.evaluate(() => (window as unknown as { __game: { read: () => Core } }).__game.read());
const probe = (page: Page): Promise<Probe> => page.evaluate(() => ({ ...(window as unknown as { __game: { probe: Probe } }).__game.probe }));
const panel = (page: Page) => page.locator('[data-ui="story"]');
const reminder = (page: Page) => page.locator('[data-ui="recovery-reminder"]');

async function load(page: Page, query = ''): Promise<void> {
  await page.goto(`/${query}`);
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { saveLoaded: boolean } } }).__game?.probe.saveLoaded === true, null, { timeout: 30_000 });
}
async function act(page: Page, kind: string, key = ''): Promise<void> {
  await panel(page).locator(`[data-act="${kind}"][data-key="${key}"]`).click({ timeout: 5_000 });
  await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії
}
async function closeStory(page: Page): Promise<void> {
  await panel(page).locator('[data-ui="story-close"]').click();
  await expect(panel(page)).toHaveCount(0);
}
/** Чистий контекст (з правом на буфер), персонаж-велосипедист, відкрита «Подорож»; перші два квести закрито, ще не їздили. */
async function start(browser: import('@playwright/test').Browser, viewport: { width: number; height: number }): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:' + (process.env.PW_PORT ?? '4173') });
  const page = await ctx.newPage();
  await load(page, '?seed=2');
  await page.locator('[data-touch="story"]').click();
  await panel(page).locator('[data-act="create"]', { hasText: 'Велосипед' }).first().click();
  await page.waitForTimeout(400);
  await act(page, 'complete', 'q.st-001');
  await act(page, 'complete', 'q.st-002');
  return { ctx, page };
}

for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test.describe(`${viewport.width}×${viewport.height} дотик`, () => {
    test('без приїзду нагадування немає (негативний контроль), після приїзду — є; не діалог, гру не зупиняє', async ({ browser }) => {
      const { ctx, page } = await start(browser, viewport);
      await closeStory(page);
      await page.waitForTimeout(500);
      await expect(reminder(page)).toHaveCount(0);                      // їздити ще не їздили
      await page.reload();
      await page.waitForFunction(() => (window as unknown as { __game?: { probe: { saveLoaded: boolean } } }).__game?.probe.saveLoaded === true);
      await page.waitForTimeout(500);
      await expect(reminder(page)).toHaveCount(0);
      const stage0 = await page.locator('#stage').boundingBox();         // поле гри без нагадування — база

      await page.locator('[data-touch="story"]').click();
      await act(page, 'visit', 'loc.shop');                              // дорога: приїзд
      await closeStory(page);
      const r = reminder(page);
      await expect(r).toBeVisible();
      // Поверх поля, а не в потоці: поле гри не стискається, коли рядок є (рецензія PR #44).
      expect(await page.locator('#stage').boundingBox(), 'поле гри з нагадуванням').toEqual(stage0);
      await expect(r).toHaveAttribute('role', 'status');
      await expect(page.locator('[role="dialog"]')).toHaveCount(0);      // не модальне
      await expect(r).toContainText('Нічого не горить');
      for (const id of ['recovery-copy', 'recovery-close']) {
        const box = await r.locator(`[data-ui="${id}"]`).boundingBox();
        expect(box && box.width >= 44 && box.height >= 44, `${id}: ${JSON.stringify(box)}`).toBe(true);
      }
      // Не блокує гру: годинник іде, персонаж рухається, а нагадування лишається на екрані.
      const p0 = await probe(page);
      await page.locator('#stage').focus();
      await page.keyboard.down('ArrowLeft');
      // Кадри в CI повільні: чекаємо опитуванням, а не фіксованою паузою.
      await expect.poll(async () => { const p = await probe(page); return Math.abs(p.playerX - p0.playerX) + Math.abs(p.playerY - p0.playerY); }, { timeout: 8_000 }).toBeGreaterThan(4);
      await page.keyboard.up('ArrowLeft');
      await expect.poll(async () => (await core(page)).clock.minutes, { timeout: 8_000 }).toBeGreaterThan(p0.clockMinutes);
      await expect(r).toBeVisible();
      await r.locator('[data-ui="recovery-close"]').click();
      await expect(r).toHaveCount(0);
      expect(await page.locator('#stage').boundingBox(), 'поле гри після закриття').toEqual(stage0);
      await ctx.close();
    });

    test('«Скопіювати код» кладе в буфер код відновлення, який імпорт повертає в той самий стан', async ({ browser }) => {
      const { ctx, page } = await start(browser, viewport);
      await act(page, 'visit', 'loc.shop');
      await closeStory(page);
      await page.locator('[data-ui="recovery-copy"]').click();
      await expect(reminder(page).locator('[data-ui="recovery-text"]')).toContainText('Код скопійовано');
      const code = await page.evaluate(() => navigator.clipboard.readText());
      expect(code).toMatch(/^CL1\./);
      const copied = await core(page);
      // Далі гра змінюється: підбираємо намет і їдемо ще — стан іде від копії.
      await page.locator('[data-touch="story"]').click();
      await act(page, 'pickup', 'item.tent');
      await closeStory(page);
      expect(JSON.stringify((await core(page)).game)).not.toBe(JSON.stringify(copied.game));
      await page.locator('[data-touch="pause"]').click();
      await page.locator('[data-ui="code-in"]').fill(code);
      await page.locator('[data-ui="code-apply"]').click();
      await expect(page.locator('[data-ui="status"]')).toHaveText("Гру відновлено");
      const back = await core(page);
      expect(back.game).toEqual(copied.game);
      expect(back.journal).toEqual(copied.journal);
      await ctx.close();
    });

    test('та сама подорож після перезавантаження — без повтору; інша подорож — знову', async ({ browser }) => {
      const { ctx, page } = await start(browser, viewport);
      await act(page, 'visit', 'loc.shop');
      await closeStory(page);
      await expect(reminder(page)).toBeVisible();
      const trip1 = (await core(page)).journal.filter((e) => e.type === 'Visit').at(-1)?.commandId;
      await page.reload();                                               // не закривали: усе одно не повторюємо
      await page.waitForFunction(() => (window as unknown as { __game?: { probe: { saveLoaded: boolean } } }).__game?.probe.saveLoaded === true);
      await page.waitForTimeout(600);
      expect((await core(page)).journal.filter((e) => e.type === 'Visit').at(-1)?.commandId).toBe(trip1);   // той самий стан відновлено
      await expect(reminder(page)).toHaveCount(0);

      await page.locator('[data-touch="story"]').click();                // друга подорож: назад додому
      const homeBtn = panel(page).locator('[data-act="visit"]').first();
      await homeBtn.click();
      await page.waitForTimeout(400);
      await closeStory(page);
      const trip2 = (await core(page)).journal.filter((e) => e.type === 'Visit').at(-1)?.commandId;
      expect(trip2).not.toBe(trip1);
      await expect(reminder(page)).toBeVisible();
      await ctx.close();
    });

    test('нова гра тим самим маршрутом — нагадування знову є (commandId — лічильник, рецензія PR #44)', async ({ browser }) => {
      const { ctx, page } = await start(browser, viewport);
      await act(page, 'visit', 'loc.shop');
      await closeStory(page);
      await expect(reminder(page)).toBeVisible();
      const trip1 = (await core(page)).journal.filter((e) => e.type === 'Visit').at(-1)?.commandId;
      await page.locator('[data-touch="pause"]').click();
      await page.locator('[data-ui="new-game"]').click();
      await page.locator('[data-ui="confirm-new-yes"]').click();
      await panel(page).locator('[data-act="create"]', { hasText: 'Велосипед' }).first().click();
      await page.waitForTimeout(400);
      await act(page, 'complete', 'q.st-001');
      await act(page, 'complete', 'q.st-002');
      await act(page, 'visit', 'loc.shop');
      await closeStory(page);
      expect((await core(page)).journal.filter((e) => e.type === 'Visit').at(-1)?.commandId, 'той самий id приїзду — інакше тест нічого не доводить').toBe(trip1);
      await expect(reminder(page)).toBeVisible();
      await ctx.close();
    });
  });
}
