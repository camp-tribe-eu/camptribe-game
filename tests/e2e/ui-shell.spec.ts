// GAME-25 · оболонка UI: пауза, налаштування.
import { expect, test, type Page } from '@playwright/test';

interface Probe { ready: boolean; clockMinutes: number; playerX: number; playerY: number }
const probe = (page: Page): Promise<Probe> => page.evaluate(() => ({ ...(window as unknown as { __game: { probe: Probe } }).__game.probe }));
const coreMinutes = (page: Page): Promise<number> =>
  page.evaluate(() => ((window as unknown as { __game: { read: () => { clock: { minutes: number } } } }).__game.read()).clock.minutes);

async function open(page: Page): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: Probe } }).__game?.probe.ready === true, null, { timeout: 30_000 });
  expect(errors).toEqual([]);
}

test.use({ viewport: { width: 1280, height: 800 } });

test('ігровий годинник іде, поки гра не на паузі (інакше тест паузи нічого не доводить)', async ({ page }) => {
  await open(page);
  const m0 = await coreMinutes(page);
  await page.waitForTimeout(2500);
  expect(await coreMinutes(page)).toBeGreaterThanOrEqual(m0 + 2);
});

test('Escape відкриває паузу; ігровий годинник ядра на паузі не просувається; Escape — продовжити', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-ui="pause"]')).toBeVisible();
  const m0 = await coreMinutes(page);
  const p0 = await probe(page);
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(2500);
  await page.keyboard.up('ArrowDown');
  expect(await coreMinutes(page)).toBe(m0);
  expect((await probe(page)).playerY).toBe(p0.playerY);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-ui="pause"]')).toBeHidden();
  await page.waitForTimeout(2500);
  expect(await coreMinutes(page)).toBeGreaterThanOrEqual(m0 + 2);
});

test('налаштування переживають перезавантаження сторінки', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Escape');
  await page.locator('[data-ui="text-150"]').click();
  await page.locator('[data-ui="lang-en"]').click();
  await expect(page.locator('[data-ui="pause"] h2')).toHaveText('Paused');
  await page.reload();
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: Probe } }).__game?.probe.ready === true);
  expect(await page.evaluate(() => document.documentElement.style.fontSize)).toBe('150%');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-ui="pause"] h2')).toHaveText('Paused');
  await expect(page.locator('[data-ui="text-150"]')).toHaveAttribute('aria-pressed', 'true');
});

test.describe('дотик: пауза без клавіатури (телефон)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('кнопка ‖ ставить паузу, «Продовжити» знімає', async ({ page }) => {
    await open(page);
    await page.locator('[data-touch="pause"]').tap();
    await expect(page.locator('[data-ui="pause"]')).toBeVisible();
    const m0 = await coreMinutes(page);
    await page.waitForTimeout(2000);
    expect(await coreMinutes(page)).toBe(m0);
    await page.locator('[data-ui="resume"]').tap();
    await expect(page.locator('[data-ui="pause"]')).toBeHidden();
  });
});
