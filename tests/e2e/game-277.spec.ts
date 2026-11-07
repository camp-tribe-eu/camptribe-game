// GAME-277 · хвости наклейки нагороди (GAME-247): нагорода, дана перед сном (годинник перестрибує > STICKER_MIN), показується ПІСЛЯ пробудження на мапі,
// а не губиться; і вона — над героєм (OD-029), не на ньому. Обидві орієнтації. Усе за кадрами й станом — таймерів реального часу немає.
// Мутації (див. PR): stickerAt повертає s.at → «після сну» червоніє; зазор stickerPlace < 0 → «над героєм» червоніє.
import { expect, test } from '@playwright/test';
import { core, probe, skipToEvening } from './chapter-driver';
import { seedDay1 } from './day1-fixture';
import { mkdirSync } from 'node:fs';

test.use({ hasTouch: true, isMobile: true });
const VIEWS = [{ side: 'portrait', w: 390, h: 844 }, { side: 'landscape', w: 932, h: 430 }] as const;
const SHOTS = process.env.G247_SHOTS === '1' ? 'research/game-277' : null;

for (const v of VIEWS) {
  test(`нагорода перед сном з'являється після пробудження — над героєм — ${v.side}`, async ({ browser }) => {
    test.setTimeout(180_000);
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await seedDay1(page, '?mapFirst=1&seed=1');
    await skipToEvening(page);   // ☰ відкрито: черга банерів закрита, наклейка не встигне показатись до сну
    const sticker = page.locator('[data-ui="reward-sticker"]');
    await page.evaluate(() => (window as unknown as { __game: { rewardSum: (r: unknown) => void } }).__game.rewardSum({ cents: 300, xp: 8, om: 0, skills: {} }));
    await expect(sticker, 'під ☰ наклейки нема').toHaveCount(0);
    const clock = async (): Promise<number> => ((await core(page)) as unknown as { clock: { minutes: number } }).clock.minutes;
    const before = await clock();
    await page.locator('[data-ui="story"] [data-act="sleep"]').click({ timeout: 5_000 });
    await expect.poll(clock, { timeout: 15_000, message: 'сон перестрибнув годинник (> STICKER_MIN хвилин)' }).toBeGreaterThan(before + 60);
    await expect(sticker, 'поки відкрито ☰ чи підсумок — наклейки нема').toHaveCount(0);
    const summary = page.locator('[data-ui="summary"]');
    const close = page.locator('[data-ui="story-close"]');
    await expect.poll(async () => { if (await summary.isVisible()) { await page.locator('[data-ui="summary-continue"]').click(); return false; } if (await close.isVisible()) { await close.click(); return false; } return true; }, { timeout: 15_000, message: 'повернулись на мапу' }).toBe(true);
    await expect(sticker, 'після пробудження наклейка з\'явилась (не загубилась на стрибку годинника)').toBeVisible({ timeout: 10_000 });
    const parts = await sticker.locator('.ui-reward-part').allInnerTexts();
    expect(parts.map((p) => p.trim()).slice(0, 2), 'суми ті, що були до сну').toEqual(['+3 €', '+8 XP']);
    const box = await sticker.boundingBox();
    const hero = (await probe(page)).heroRect;
    if (!box) throw new Error('наклейка без рамки');
    expect(hero.w).toBeGreaterThan(0);
    expect(box.y + box.height, 'над героєм (OD-029)').toBeLessThanOrEqual(hero.y);
    expect(box.x, 'у межах екрана').toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(v.w);
    if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/after-sleep-${v.side}.png` }); }
    expect(errors).toEqual([]);
    await ctx.close();
  });
}
