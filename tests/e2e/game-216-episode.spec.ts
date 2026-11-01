// GAME-216 (решта картки) · (1) картка-«серія» кінця розділу: три рядки підсумку, слід дідуся, кліфхенгер «Далі в наступній серії…»; перший дотик показує все,
// другий закриває; під нею гра жива (нічого не блокує). У збірці e2e ?episode=1 показує її одразу (самий тригер — stage 'ended' — доводить src/ui/Shell та
// game-183.spec при проходженні розділу). (2) заставка першого приїзду в табір: камера відпливає від героя (≤ 10 с) і вертається; клавіша виходить одразу;
// ?noReveal=1 — негативний контроль (камера стоїть на героєві). Обидві орієнтації.
import { expect, test } from '@playwright/test';
import { probe } from './chapter-driver';
import { arriveInCamp } from './camp-arrival';
import { waitGameReady } from './ready';

const SHOTS = process.env.GAME216_SHOTS ?? 'test-results/game-216';
const VIEWS = [{ side: 'landscape', w: 844, h: 390 }, { side: 'portrait', w: 390, h: 844 }] as const;

for (const v of VIEWS) {
  test(`${v.side}: картка-«серія» — рядки, слід дідуся, кліфхенгер; дотик показує все, другий закриває`, async ({ page }) => {
    await page.setViewportSize({ width: v.w, height: v.h });
    await page.goto('/?seed=1&episode=1');
    await waitGameReady(page);
    const card = page.locator('[data-ui="episode"]');
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('data-state', 'typing');
    await expect(page.locator('[data-ui="episode-line"][data-kind="recap"]')).toHaveCount(3);
    await expect(page.locator('[data-ui="episode-line"][data-kind="trace"]')).toContainText('H+E');
    await expect(page.locator('[data-ui="episode-line"][data-kind="next"]')).toContainText(/Далі в наступній серії|Next episode/);
    await page.waitForTimeout(2_500);
    await page.screenshot({ path: `${SHOTS}/fin-episode-card-${v.side}.png` });
    await page.mouse.click(v.w / 2, v.h / 2);
    await expect(card).toHaveAttribute('data-state', 'all');
    await page.mouse.click(v.w / 2, v.h / 2);
    await expect(card).toHaveCount(0);
  });
}

test('без ?episode=1 картки немає (негативний контроль); Escape закриває картку одразу', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/?seed=1');
  await waitGameReady(page);
  await expect(page.locator('[data-ui="episode"]')).toHaveCount(0);
  await page.goto('/?seed=1&episode=1');
  await waitGameReady(page);
  await expect(page.locator('[data-ui="episode"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-ui="episode"]')).toHaveAttribute('data-state', 'all');
  await page.locator('[data-ui="episode-skip"]').click();
  await expect(page.locator('[data-ui="episode"]')).toHaveCount(0);
});

for (const v of VIEWS) {
  test(`${v.side}: заставка першого приїзду в табір — камера відпливає й сама вертається ≤ 10 с`, async ({ browser }) => {
    test.setTimeout(300_000);
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errors = await arriveInCamp(page);
    const p0 = await probe(page);
    expect(p0.reveal, 'заставка йде одразу після приїзду').toBe(true);
    await page.waitForTimeout(2_600);
    const p1 = await probe(page);
    expect(Math.hypot(p1.cameraScrollX - p0.cameraScrollX, p1.cameraScrollY - p0.cameraScrollY), 'камера пішла від героя').toBeGreaterThan(32);
    await page.screenshot({ path: `${SHOTS}/fin-camp-cutscene-${v.side}.png` });
    await expect.poll(async () => (await probe(page)).reveal, { timeout: 12_000, message: 'заставка мусить скінчитись сама' }).toBe(false);
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

test('клавіша виходить із заставки одразу; ?noReveal=1 — заставки немає', async ({ browser }) => {
  test.setTimeout(300_000);
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await arriveInCamp(page);
  expect((await probe(page)).reveal).toBe(true);
  await page.keyboard.press('ArrowDown');
  await expect.poll(async () => (await probe(page)).reveal, { timeout: 2_000 }).toBe(false);
  await page.goto('/?seed=7&mapFirst=1&noReveal=1');
  await waitGameReady(page);
  await page.waitForTimeout(500);
  expect((await probe(page)).reveal).toBe(false);
  await ctx.close();
});
