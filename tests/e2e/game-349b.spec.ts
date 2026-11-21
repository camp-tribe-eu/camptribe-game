// GAME-349 · (a) банер нагороди «+N XP…» і пояснення про XP не лежать на сітці заїзду на ділянку (дев'яте приймання №5): поки картка заїзду відкрита, банера немає, а після неї він показується.
//   (b) ☰ на дорозі зразка після пропуску дороги: першою рекомендована «Завершити: У дорогу», без «Піти»/«Висушити»/«Зробити», і вона в першому вікні (дев'яте приймання №6).
// Мутація (перевірено): у Shell.tsx `driveIn: port.sample?.stage() === 'drivein'` → `driveIn: false` → тест (a) червоніє в усіх трьох розмірах («банер не лежить на заїзді»);
//   у story-focus.ts прибрати 'task' зі SAMPLE_ROAD_HIDDEN → тест (b) червоніє.
import { expect, test, type Page } from '@playwright/test';
import { skipSampleIntro, waitGameReady } from './ready';

test.use({ hasTouch: true });
const panel = (page: Page) => page.locator('[data-ui="story"]');

/** Пропуск дороги: «Пауза» → «Далі без цього» → «Так» → «Закрити»; ☰ відкривається сама. */
async function skipRoad(page: Page): Promise<void> {
  await page.goto('/?seed=7&sampleDay=1');
  await waitGameReady(page);
  await skipSampleIntro(page);
  const mg = page.locator('[data-ui="minigame"]');
  await expect(mg).toHaveAttribute('data-phase', 'open', { timeout: 15_000 });
  await page.locator('[data-ui="mg-start"]').tap();
  await expect(mg).toHaveAttribute('data-phase', 'play');
  await page.locator('[data-ui="mg-pause"]').tap();
  await page.locator('[data-ui="mg-move-on"]').tap();
  await page.locator('[data-ui="mg-sure-yes"]').tap();
  await expect(mg).toHaveAttribute('data-phase', 'result');
  await page.locator('[data-ui="mg-close"]').tap();
  await expect(panel(page), 'після дороги ☰ відкрилась сама').toBeVisible({ timeout: 8_000 });
}

const VIEWPORTS = [{ n: 'portrait', w: 390, h: 844 }, { n: 'landscape', w: 932, h: 430 }, { n: 'square', w: 600, h: 600 }];
for (const vp of VIEWPORTS) {
  test(`GAME-349b · меню на дорозі після пропуску: «Завершити» перша й у першому вікні, без «Піти/Висушити/Зробити» — ${vp.n}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await skipRoad(page);
    const btns = panel(page).locator('[data-ui="actions"] button');
    await expect(btns.first()).toHaveAttribute('data-act', 'complete');
    await expect(btns.first()).toHaveAttribute('data-rec', 'yes');
    const kinds = await btns.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.act ?? ''));
    expect(kinds.filter((k) => ['dry', 'task'].includes(k)), `зайві дії на дорозі: ${kinds.join(',')}`).toEqual([]);
    const visits = await panel(page).locator('[data-ui="actions"] [data-act="visit"]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.key ?? ''));
    expect(visits, 'нема «Піти: Дім/Крамниця» (табір з\u2019являється після «Завершити»)').toEqual([]);
    const b = await btns.first().boundingBox();
    expect(b, 'кнопка є').not.toBeNull();
    expect((b?.y ?? 0) + (b?.height ?? 0), 'кнопка «Завершити» в першому вікні').toBeLessThanOrEqual(vp.h);
  });

  test(`GAME-349b · банер нагороди не лежить на сітці заїзду — ${vp.n}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await skipRoad(page);
    await panel(page).locator('[data-act="complete"]').first().tap();
    await page.waitForTimeout(400);
    await panel(page).locator('[data-act="visit"][data-key="loc.camp.lake"]').tap();
    const drive = page.locator('[data-ui="drive-in"]');
    for (let i = 0; i < 40 && !(await drive.isVisible().catch(() => false)); i++) {
      const a = panel(page).locator('[data-ui="dialogue"] [data-act]');
      if (await a.count() > 0) await a.first().tap().catch(() => undefined);
      await page.waitForTimeout(300);
    }
    await expect(drive, 'дійшли до заїзду').toBeVisible({ timeout: 5_000 });
    // Кадри першої миті заїзду: жоден банер нагороди чи пояснення XP не показано поки картка відкрита.
    const seen = await page.evaluate(() => new Promise<string[]>((resolve) => {
      const hits: string[] = []; let n = 0;
      const tick = (): void => {
        for (const sel of ['[data-ui="reward-sticker"]', '[data-ui="xp-explain"]', '.ui-titleup']) { const e = document.querySelector(sel); if (e && e.getBoundingClientRect().height > 0) hits.push(sel); }
        if (++n < 120) requestAnimationFrame(tick); else resolve(hits);
      };
      requestAnimationFrame(tick);
    }));
    expect(seen, 'поки картка заїзду відкрита, банерів над сіткою немає').toEqual([]);
  });
}
