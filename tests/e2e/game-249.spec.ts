// GAME-249 · вступ як сцена: ніч (3 місця, лист) → Атлас → родинний план → «Ніч» → «Субота, 08:00» + будильник → метушня → світ удома о 08:xx.
// Знімки кожного кроку (390×844 і 932×430) — research/intro-story/. Закон 1: контроль — пропуск ніколи не веде повз ранок (мутація skipTarget → червоне).
import { expect, test, type Page } from '@playwright/test';
import { core } from './chapter-driver';
import { introTo, skipIntroToMorning, stepIntro, walkIntro } from './intro-walk';
import { waitGameReady } from './ready';

const VIEWS = [{ w: 390, h: 844 }, { w: 932, h: 430 }] as const;
const kindOf = (page: Page): Promise<string | null> => page.locator('[data-ui="intro"]').getAttribute('data-kind');
const todOf = async (page: Page): Promise<number> => (((await core(page)) as unknown as { clock: { minutes: number } }).clock.minutes + 480) % 1440;

for (const v of VIEWS) {
  test(`повний вступ ${v.w}×${v.h}: 3 місця → лист → герой → Атлас → план → ніч → ранок → метушня → світ о 08:xx`, async ({ page }) => {
    await page.setViewportSize({ width: v.w, height: v.h });
    await page.goto('/?intro=1&seed=1');
    await waitGameReady(page);
    const shot = (n: string): Promise<Buffer> => page.screenshot({ path: `research/intro-story/${n}-${v.w}x${v.h}.png` });
    await introTo(page, 'search');
    await expect(page.locator('[data-ui="intro-spot"]')).toHaveCount(3);
    await page.locator('[data-spot="drawer"]').click();
    await expect(page.locator('[data-ui="line"]')).toContainText('пральки');
    await page.waitForTimeout(280);
    await page.locator('[data-spot="box"]').click();
    await expect(page.locator('[data-ui="line"]')).toContainText('кабелів');
    await shot('1-search');
    await page.waitForTimeout(280);
    await page.locator('[data-spot="shelf"]').click();
    await expect(page.locator('[data-ui="letter"]')).toBeVisible();
    await shot('2-letter');
    await introTo(page, 'atlas');
    await page.waitForTimeout(1100);
    await shot('3-atlas');
    await stepIntro(page);
    await expect(page.locator('[data-ui="line"]')).toContainText('сімейний скарб');
    await shot('4-plan');
    await introTo(page, 'night');
    await expect(page.locator('[data-ui="intro-caption"]')).toHaveText('Ніч');
    await shot('5-night');
    await stepIntro(page);
    await expect(page.locator('[data-ui="intro"]')).toHaveAttribute('data-phase', 'morning');
    await expect(page.locator('[data-ui="intro-caption"]')).toHaveText('Субота, 08:00');
    await page.waitForTimeout(400);
    await shot('6-morning');
    await stepIntro(page);
    await expect(page.locator('[data-ui="line"]')).toHaveText('Хто бачив документи?!');
    await shot('7-chaos');
    await introTo(page, 'goal');
    await expect(page.locator('[data-ui="intro-goal-text"]')).toHaveText('Зібрати речі в дорогу');
    await shot('8-goal');
    await walkIntro(page);
    await expect(page.locator('[data-ui="intro"]')).toHaveCount(0);
    const t = await todOf(page);
    expect(t >= 8 * 60 && t < 9 * 60, `годинник після вступу ${t}`).toBe(true);
  });

  test(`пропуск ${v.w}×${v.h}: «Пропустити вступ» → вибір героя → ранок удома, а не машина`, async ({ page }) => {
    await page.setViewportSize({ width: v.w, height: v.h });
    await page.goto('/?intro=1&seed=1');
    await waitGameReady(page);
    await expect(page.locator('[data-ui="intro-skip"]')).toHaveText('Пропустити вступ');
    await skipIntroToMorning(page);
    await expect(page.locator('[data-ui="intro-caption"]')).toHaveText('Субота, 08:00');
    expect(await kindOf(page)).toBe('morning');
    await page.locator('[data-ui="intro-skip"]').click();
    await expect(page.locator('[data-ui="intro"]')).toHaveCount(0);
    const t = await todOf(page);
    expect(t >= 8 * 60 && t < 9 * 60, `годинник після пропуску ${t}`).toBe(true);
    expect(await page.evaluate(() => (window as unknown as { __game?: unknown }).__game !== undefined)).toBe(true);
  });
}
