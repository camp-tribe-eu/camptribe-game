// GAME-33 · сейви: IndexedDB, автозбереження, код відновлення, запасний слот.
import { expect, test, type Page } from '@playwright/test';

interface Probe { ready: boolean; saveLoaded: boolean; playerX: number; nearObject: string | null; commandsSent: number }
interface Snap { game: { grants: string[]; moneyCents: number; seq: number } }
const probe = (page: Page): Promise<Probe> => page.evaluate(() => ({ ...(window as unknown as { __game: { probe: Probe } }).__game.probe }));
const snap = (page: Page): Promise<Snap> => page.evaluate(() => (window as unknown as { __game: { read: () => Snap } }).__game.read());

async function open(page: Page): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => {
    const p = (window as unknown as { __game?: { probe: Probe } }).__game?.probe;
    return p?.ready === true && p.saveLoaded === true;
  }, null, { timeout: 30_000 });
  expect(errors).toEqual([]);
}

async function hold(page: Page, key: string, until: (p: Probe) => boolean): Promise<void> {
  await page.keyboard.down(key);
  const t0 = Date.now();
  while (!until(await probe(page)) && Date.now() - t0 < 4000) await page.waitForTimeout(16);
  await page.keyboard.up(key);
}

/** Дійти до вогнища й взаємодіяти: у стані з'являється нагорода. */
async function warmUp(page: Page): Promise<void> {
  await hold(page, 'ArrowLeft', (p) => p.playerX <= 60);
  await hold(page, 'ArrowUp', (p) => p.nearObject !== null);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await snap(page)).game.grants).toContain('rw.campfire-warmth');
}

test.describe('сейви (десктоп)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('нова гра без сейву стартує чистою (інакше «відновлено» нічого не доводить)', async ({ page }) => {
    await open(page);
    expect((await snap(page)).game.grants).toEqual([]);
  });

  test('пауза зберігає; після перезавантаження нагорода на місці', async ({ page }) => {
    await open(page);
    await warmUp(page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.reload();
    await page.waitForFunction(() => (window as unknown as { __game?: { probe: Probe } }).__game?.probe.saveLoaded === true);
    expect((await snap(page)).game.grants).toContain('rw.campfire-warmth');
  });

  test('зіпсований основний слот — гра бере попередній, а не падає й не стартує з нуля', async ({ page }) => {
    await open(page);
    await warmUp(page);
    await page.keyboard.press('Escape');
    await page.locator('[data-ui="save"]').click();           // main = з нагородою, prev = автозбереження паузи
    await expect(page.locator('[data-ui="status"]')).toHaveText(/Збережено|Saved/);
    await page.evaluate(() => new Promise<void>((resolve) => {
      const req = indexedDB.open('camplife', 1);
      req.onsuccess = () => {
        const tx = req.result.transaction('saves', 'readwrite');
        tx.objectStore('saves').put('{"format":"camplife-save", зіпсовано', 'main');
        tx.oncomplete = () => { req.result.close(); resolve(); };
      };
    }));
    await page.reload();
    await page.waitForFunction(() => (window as unknown as { __game?: { probe: Probe } }).__game?.probe.saveLoaded === true);
    expect((await snap(page)).game.grants).toContain('rw.campfire-warmth');
  });
});

test.describe('код відновлення (телефон 390×844)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('код → чистий браузер → імпорт → той самий стан', async ({ page, browser }) => {
    await open(page);
    await warmUp(page);
    const before = await snap(page);
    await page.locator('[data-touch="pause"]').tap();
    await page.locator('[data-ui="code-export"]').tap();
    await expect(page.locator('[data-ui="code-out"]')).toHaveValue(/^CL1\./);
    const code = await page.locator('[data-ui="code-out"]').inputValue();
    expect(code).toMatch(/^CL1\.[A-Za-z0-9_-]+$/);

    const fresh = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const p2 = await fresh.newPage();
    await open(p2);
    expect((await snap(p2)).game.grants).toEqual([]);                    // справді чистий браузер
    await p2.locator('[data-touch="pause"]').tap();
    await p2.locator('[data-ui="code-in"]').fill(code);
    await p2.locator('[data-ui="code-apply"]').tap();
    await expect(p2.locator('[data-ui="status"]')).toHaveText(/Гру відновлено|Game restored/);
    const after = await snap(p2);
    expect(after.game).toEqual(expect.objectContaining({ grants: before.game.grants, moneyCents: before.game.moneyCents, seq: before.game.seq }));
    await fresh.close();
  });

  test('зіпсований код — відмова з поясненням, стан не змінено', async ({ page }) => {
    await open(page);
    const before = await snap(page);
    await page.locator('[data-touch="pause"]').tap();
    await page.locator('[data-ui="code-in"]').fill('CL1.зламано');
    await page.locator('[data-ui="code-apply"]').tap();
    await expect(page.locator('[data-ui="status"]')).toHaveText(/не підходить|does not fit/);
    expect((await snap(page)).game).toEqual(before.game);      // гра та сама (годинник на паузі змінюється законно)
  });
});
