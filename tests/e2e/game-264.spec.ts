// GAME-264 · кінець розділу 1 вдома не глухий кут: «Кінець дня 3» → підсумок розділу САМ → «Лягти спати» → тизер розділу 2 — ☰ жодного разу.
// Стан кінця — справжній: розділ грається ногами до campaignEnded (chapter-driver), далі ні кроку з ☰. Обидві орієнтації. Знімки — лише з GAME_SHOTS=1.
import { expect, test } from '@playwright/test';
import { core, installMenuObserver, loaded, menuSeen, playUntil, probe } from './chapter-driver';
import { arriveInCamp } from './camp-arrival';

const VIEWS = [{ name: 'портрет 390×844', side: 'portrait', w: 390, h: 844 }, { name: 'ландшафт 932×430', side: 'landscape', w: 932, h: 430 }] as const;
const SHOTS = 'research/game-264';

for (const v of VIEWS) {
  test(`після «Кінець дня 3»: підсумок розділу сам → сон → тизер розділу 2, без ☰ — ${v.name}`, async ({ browser }) => {
    test.setTimeout(900_000);
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await installMenuObserver(page);
    await arriveInCamp(page, '');
    const log: string[] = [];
    // Ногами до кінця розділу, але БЕЗ автоматичного «Продовжити»: зупиняємось, щойно розділ завершено.
    await playUntil(page, v.side === 'landscape', log, (c) => c.game.campaignEnded, () => menuSeen(page), 200);
    expect((await core(page)).game.player?.locationId, 'розділ закінчився вдома').toBe('loc.home');
    // 1) Підсумок розділу з'являється САМ (до цього гравець нічого не тиснув і ☰ не відкривав).
    await expect(page.locator('[data-ui="summary"]'), 'підсумок розділу мусить відкритись сам').toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-ui="summary"]')).toHaveAttribute('data-day', '3');
    if (process.env.GAME_SHOTS === '1') await page.screenshot({ path: `${SHOTS}/after-${v.side}-1-summary.png` });
    // 2) Кнопка підсумку — «Лягти спати» (а не «Продовжити» в нікуди).
    const go = page.locator('[data-ui="summary-continue"]');
    await expect(go).toHaveText(/Лягти спати|Go to sleep/);
    await go.click();
    // 3) Сон → тизер розділу 2 (картка серії із «Далі в наступній серії»).
    await expect(page.locator('[data-ui="episode"]'), 'після сну — тизер розділу 2').toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-ui="episode-line"][data-kind="next"]')).toContainText(/Далі в наступній серії|Next episode/);
    expect((await core(page)).game.campaignEnded).toBe(true);
    if (process.env.GAME_SHOTS === '1') await page.screenshot({ path: `${SHOTS}/after-${v.side}-2-teaser.png` });
    await page.locator('[data-ui="episode-skip"]').click();
    await expect(page.locator('[data-ui="episode"]')).toHaveCount(0);
    expect(await menuSeen(page), '☰ жодного разу не відкривалась').toEqual([]);
    expect(errors).toEqual([]);
    void probe; void loaded;
    await ctx.close();
  });
}
