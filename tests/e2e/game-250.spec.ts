// GAME-250 · Атлас як зрозуміла мапа з однією кнопкою дії: вступ → Атлас («Ви тут», озеро з запискою, сірі силуети, одна кнопка) → кнопка веде далі;
// з меню — «Закрити» й Escape. Знімки «до/після» (ATLAS_SHOT=before|after) — research/atlas/. Закон 1: негативний контроль — без ?intro=1 Атласу вступу немає.
import { expect, test, type Page } from '@playwright/test';
import { introTo, walkIntro } from './intro-walk';
import { waitGameReady } from './ready';

const TAG = process.env.ATLAS_SHOT ?? 'after';
const VIEWS = [{ side: 'portrait', w: 390, h: 844 }, { side: 'landscape', w: 932, h: 430 }] as const;

async function toAtlasStep(page: Page): Promise<void> {
  await page.goto('/?intro=1&soloHero=1&seed=1');
  await waitGameReady(page);
  await introTo(page, 'atlas');
  await expect(page.locator('[data-kind="atlas"]')).toBeVisible();
  await page.waitForTimeout(1100);
}

for (const v of VIEWS) {
  test(`Атлас у вступі ${v.side}: ви тут, озеро з запискою, ≤5 силуетів, одна кнопка → далі`, async ({ page }) => {
    await page.setViewportSize({ width: v.w, height: v.h });
    await toAtlasStep(page);
    await page.screenshot({ path: `research/atlas/${TAG}-intro-${v.w}x${v.h}.png` });
    const atlas = page.locator('[data-ui="atlas-map-page"]');
    await expect(atlas.locator('[data-place="home"]')).toHaveAttribute('data-state', 'here');
    await expect(atlas.locator('[data-place="lake"]')).toHaveAttribute('data-state', 'first');
    await expect(atlas.locator('[data-ui="lake-note"]')).toBeVisible();
    const ahead = atlas.locator('[data-state="ahead"]');
    expect(await ahead.count()).toBeGreaterThanOrEqual(1);
    expect(await ahead.count()).toBeLessThanOrEqual(5);
    await expect(atlas.locator('[data-ui="atlas-sentence"]')).toBeVisible();
    await expect(atlas.locator('[data-ui="atlas-gains"]')).toBeVisible();
    const cta = page.locator('[data-ui="atlas-cta"]');
    await expect(cta).toHaveCount(1);
    await expect(cta).toBeVisible();
    await expect(cta).toHaveText('Спланувати першу поїздку');
    const box = await cta.boundingBox();
    expect(box && box.height >= 44 && box.y + box.height <= v.h).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await cta.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-ui="intro"]')).toHaveAttribute('data-kind', 'line');   // історія пішла далі: родинна розмова про план (GAME-249)
  });

  test(`Атлас із меню ${v.side}: «Закрити» і Escape`, async ({ page }) => {
    await page.setViewportSize({ width: v.w, height: v.h });
    await toAtlasStep(page);
    await page.locator('[data-ui="atlas-cta"]').click();
    await walkIntro(page);
    await expect(page.locator('[data-ui="intro"]')).toHaveCount(0);
    for (const how of ['button', 'escape'] as const) {
      if ((await page.locator('[data-ui="atlas-open"]').count()) === 0) await page.locator('.ui-story-btn').click();   // після закриття Атласу меню саме відкривається знову
      await page.locator('[data-ui="atlas-open"]').click();
      const panel = page.locator('[data-ui="atlas-panel"]');
      await expect(panel).toBeVisible();
      if (how === 'button') await page.screenshot({ path: `research/atlas/${TAG}-menu-${v.w}x${v.h}.png` });
      await expect(panel.locator('[data-place="lake"]')).toHaveAttribute('data-state', 'first');
      if (how === 'button') {
        await expect(panel.locator('[data-ui="atlas-cta"]')).toHaveText('Закрити');
        await panel.locator('[data-ui="atlas-cta"]').click();
      } else await page.keyboard.press('Escape');
      await expect(panel).toHaveCount(0);
    }
  });
}

test('негативний контроль: без ?intro=1 Атласу вступу немає', async ({ page }) => {
  await page.goto('/?seed=1');
  await waitGameReady(page);
  await expect(page.locator('[data-ui="atlas-map-page"]')).toHaveCount(0);
});
