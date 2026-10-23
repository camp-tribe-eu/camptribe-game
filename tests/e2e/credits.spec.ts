// GAME-21 · титри в грі (OD-013: «позначимо їх в титрах»). Звіряємо з assets/credits.json, а не з
// числом у тесті: файл графіки, що з'явиться без титрів, червонить і сторож ліцензій, і цей тест.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

interface Credits { licences: Record<string, { url: string }>; files: { file: string; authors: string[]; licence: string; sources: string[]; modified: string }[] }
const credits = JSON.parse(readFileSync('assets/credits.json', 'utf8')) as Credits;

async function openCredits(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { ready: boolean } } }).__game?.probe.ready === true, null, { timeout: 30_000 });
  await page.locator('[data-touch="pause"]').click();
  await page.locator('[data-ui="credits"] summary').click();
}

test.describe('титри', () => {
  test('кожен файл графіки — з авторами, ліцензією-посиланням і джерелами', async ({ page }) => {
    expect(credits.files.length).toBeGreaterThan(0);                       // порожній реєстр — не «усе гаразд»
    await openCredits(page);
    const items = page.locator('[data-ui="credits"] li');
    await expect(items).toHaveCount(credits.files.length);
    for (const f of credits.files) {
      const li = page.locator(`[data-ui="credits"] li[data-credit="${f.file}"]`);
      for (const a of f.authors) await expect(li).toContainText(a);
      await expect(li.locator(`a[data-licence="${f.licence}"]`)).toHaveAttribute('href', credits.licences[f.licence]?.url ?? 'MISSING');
      await expect(li.locator('a[href^="http"]:not([data-licence])')).toHaveCount(f.sources.length);
    }
    await expect(page.locator('[data-licence-missing]')).toHaveCount(0);
  });

  test.describe('телефон 390×844', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    test('титри не вилазять за край екрана', async ({ page }) => {
      await openCredits(page);
      const overflow = await page.locator('[data-ui="pause"]').evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      await expect(page.locator('[data-ui="credits"] li').first()).toBeVisible();
    });
  });
});
