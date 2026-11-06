// GAME-269 · «Відпочити до вечора»: після намету день 1 мертвий до 18:00 — дія в ☰ перемотує до 17:30 родинною сценою (≤ 2 реальних хвилин).
// Стан читаємо з ядра. Негативний контроль: поки крок приїзду (ST-005) відкритий, дії в ☰ НЕМАЄ (мутація «пропонувати завжди» червонить цей рядок).
import { expect, test } from '@playwright/test';
import { answerOne, core, installMenuObserver, menuSeen, playUntil, talk, type Core } from './chapter-driver';
import { arriveInCamp } from './camp-arrival';

const VIEWS = [{ w: 390, h: 844, name: 'портрет' }, { w: 932, h: 430, name: 'ландшафт' }] as const;
const tod = (c: Core): number => (c.clock.minutes + 480) % 1440;
for (const v of VIEWS) {
  test(`табір, ${v.name}: після налаштування — «Відпочити до вечора» → 17:30 за ≤ 2 хв, до того дії немає`, async ({ browser }) => {
    test.setTimeout(480_000);
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await installMenuObserver(page);
    const errors = await arriveInCamp(page);
    const panel = page.locator('.ui-story');
    await page.locator('[data-touch="story"]').tap();
    await expect(panel).toBeVisible();
    expect(await panel.locator('[data-act="rest"]').count(), 'крок приїзду відкритий — відпочивати не можна').toBe(0);
    await page.locator('[data-touch="story"]').tap().catch(() => undefined);

    await playUntil(page, true, [], (c) => c.game.quests['ST-005']?.status === 'completed' && !c.game.dialogue, () => menuSeen(page));
    const t0 = Date.now();
    const before = await core(page);
    expect(tod(before), 'мертве вікно: ще до 17:30').toBeLessThan(17 * 60 + 30);
    await page.locator('[data-touch="story"]').tap();
    await panel.locator('[data-act="rest"]').tap({ timeout: 5_000 });
    await expect.poll(async () => (await core(page)).game.dialogue !== null, { timeout: 5_000, message: 'родинна сцена відкрилась' }).toBe(true);
    for (let i = 0; i < 10 && await talk(page).count(); i++) await answerOne(page);
    const after = await core(page);
    expect(tod(after), 'час перемотано до 17:30').toBeGreaterThanOrEqual(17 * 60 + 30);
    expect(tod(after)).toBeLessThan(18 * 60);
    expect(Date.now() - t0, 'від налаштованого табору до вечора — ≤ 2 реальних хвилин').toBeLessThan(120_000);
    await page.locator('[data-touch="story"]').tap().catch(() => undefined);
    expect(await panel.locator('[data-act="rest"]').count(), 'вдруге в тому ж вікні — немає (17:30)').toBe(0);
    expect(errors).toEqual([]);
    await ctx.close();
  });
}
