// UI (відгук власника) · рядки багаторядкових підписів кнопок екрана подорожі не налазять один на один і не обрізаються.
// Детектор: крок між верхами сусідніх рядків (Range.getClientRects тексту) не менший за 1,2 кегля, line-height не менший за 1.2 кегля,
// scrollHeight <= clientHeight. Негативний контроль: line-height 0.6 → детектор червоний.
import { expect, test, type Page } from '@playwright/test';

const panel = (page: Page) => page.locator('[data-ui="story"]');
async function load(page: Page, query = ''): Promise<void> {
  await page.goto(`/${query}`);
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { saveLoaded: boolean } } }).__game?.probe.saveLoaded === true, null, { timeout: 30_000 });
}
async function act(page: Page, kind: string, key = ''): Promise<void> {
  await panel(page).locator(`[data-act="${kind}"][data-key="${key}"]`).click({ timeout: 5_000 });
  await page.waitForTimeout(400);
}
async function toShop(page: Page): Promise<void> {
  await panel(page).locator('[data-act="create"]', { hasText: 'Велосипед' }).first().click();
  await page.waitForTimeout(400);
  for (const [k, key] of [['complete', 'q.prologue-home-001'], ['complete', 'q.st-001'], ['complete', 'q.st-002'], ['visit', 'loc.shop']] as const) await act(page, k, key);
}

/** Для кожної кнопки [data-act]: скільки рядків, мінімальний крок між рядками, кегль, line-height, скрол і висота. */
const measure = (page: Page) => page.evaluate(() => {
  const out: { name: string; lines: number; pitch: number; fs: number; lh: number; clipped: boolean }[] = [];
  for (const b of document.querySelectorAll<HTMLElement>('[data-ui="story"] [data-act]')) {
    const cs = getComputedStyle(b);
    const fs = parseFloat(cs.fontSize);
    const lh = cs.lineHeight === 'normal' ? NaN : parseFloat(cs.lineHeight);
    const tops: number[] = [];
    const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const r = document.createRange(); r.selectNodeContents(n);
      for (const q of Array.from(r.getClientRects())) if (q.width > 0 && !tops.some((t) => Math.abs(t - q.top) < 1)) tops.push(q.top);
    }
    tops.sort((a, c) => a - c);
    let pitch = Infinity;
    for (let i = 1; i < tops.length; i++) pitch = Math.min(pitch, (tops[i] ?? 0) - (tops[i - 1] ?? 0));
    out.push({ name: (b.textContent ?? '').slice(0, 40), lines: tops.length, pitch, fs, lh, clipped: b.scrollHeight > b.clientHeight + 1 });
  }
  return out;
});
type M = Awaited<ReturnType<typeof measure>>[number];
const bad = (ms: M[]): string[] => ms.filter((m) => m.lines > 1 && (m.pitch < 1.2 * m.fs || !(m.lh >= 1.2 * m.fs) || m.clipped)).map((m) => `${m.name} lines=${m.lines} pitch=${m.pitch} fs=${m.fs} lh=${m.lh} clipped=${m.clipped}`);

for (const vp of [{ width: 1280, height: 800 }, { width: 1920, height: 1080 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test.describe(`рядки кнопок · ${vp.width}×${vp.height}`, () => {
    test.use({ viewport: vp });
    for (const zoom of [1, 2]) {
      test(`текст ${zoom * 100} %: рядки не налазять і не обрізаються (є багаторядкові «бракує»)`, async ({ page }) => {
        await load(page, '?seed=2');
        await page.locator('[data-touch="story"]').click();
        await expect(panel(page)).toBeVisible();
        await toShop(page);
        if (zoom === 2) await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
        const ms = await measure(page);
        expect(ms.filter((m) => m.lines > 1).length, "є багаторядкові кнопки — інакше тест нічого не доводить").toBeGreaterThan(0);
        expect(await page.locator('[data-act="buy-locked"]').count()).toBeGreaterThan(0);
        expect(bad(ms)).toEqual([]);
        const hs = await page.locator('[data-ui="story"] [data-act]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
        expect(Math.min(...hs)).toBeGreaterThanOrEqual(44);
        if (zoom === 1) {
          // Негативний контроль: стиснутий line-height має зробити детектор червоним.
          await page.addStyleTag({ content: '[data-ui="story"] [data-act] { line-height: 0.6 !important; }' });
          expect(bad(await measure(page)).length, 'детектор мусить червоніти на line-height 0.6').toBeGreaterThan(0);
        }
      });
    }
  });
}
