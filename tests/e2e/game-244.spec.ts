// GAME-244 (ч.1) · рюкзак: перегляд (речі, «куплено в крамниці», ціна) і продаж на рецепції табору. Стан — фікстура дня 1 (seedDay1), 390×844 і 932×430.
// Знімки в research/game-244/ — лише з SHOTS=1 (не на критичному шляху). Негативний контроль: далеко від приймальні кнопки «Продати» немає.
import { expect, test, type Page } from '@playwright/test';
import { core, probe, route, walk } from './chapter-driver';
import { stateHash } from '../../src/core/hash';
import { seedDay1 } from './day1-fixture';

/** Фікстура дня 1 + уживаний трекінговий намет у рюкзаку (у сюжетному наборі нема що викупити: намет і спальник історії не мають ціни викупу). Контрольну суму перераховує ядро. */
const WITH_TREK = (save: string): string => {
  const s = JSON.parse(save) as { sim: { game: { inventory: Record<string, number> } }; checksum: string };
  s.sim.game.inventory['item.tent-trek'] = 1;
  s.checksum = stateHash(s.sim as never);
  return JSON.stringify(s);
};

const SHOTS = process.env.SHOTS === '1';
const SIZES = [{ name: 'portrait', width: 390, height: 844 }, { name: 'landscape', width: 932, height: 430 }] as const;
const money = async (page: Page): Promise<number> => ((await core(page)).game as unknown as { moneyCents: number }).moneyCents;

for (const size of SIZES) {
  test(`рюкзак: перегляд, продаж біля приймальні — ${size.name} ${size.width}×${size.height}`, async ({ browser }) => {
    test.setTimeout(240_000);
    const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => { try { localStorage.setItem('camplife.settings.v1', JSON.stringify({ textScale: 100, language: 'uk', hintSeen: true })); } catch { /* сховища немає */ } });
    await seedDay1(page, '?seed=7&mapFirst=1', WITH_TREK);

    // 1. Перегляд: кнопка в шапці відкриває рюкзак; намет/спальник — «куплено в крамниці» з ціною викупу; світ закрито — це перевіряє game-268.
    const inv = (await core(page)).game.inventory;
    const gearIds = Object.keys(inv).filter((id) => /tent|sleeping-bag/.test(id));
    expect(gearIds.length, 'у фікстурі дня 1 є намет чи спальник').toBeGreaterThan(0);
    await page.locator('[data-ui="backpack-open"]').click();
    const panel = page.locator('[data-ui="backpack-panel"]');
    await expect(panel).toBeVisible();
    const gear = panel.locator('[data-ui="backpack-group"][data-group="gear"] [data-ui="backpack-item"]');
    await expect(gear.first()).toBeVisible();
    const bought = panel.locator('[data-ui="backpack-item"][data-origin="bought"]');
    await expect(bought.first(), 'куплене в крамниці підписано «куплено в крамниці»').toBeVisible();
    await expect(bought.first().locator('[data-ui="backpack-origin"]')).toContainText('куплено в крамниці');
    await expect(panel.locator('[data-ui="backpack-item"][data-id="item.tent-trek"] [data-ui="backpack-price"]'), 'ціна викупу уживаного — з ядра').toHaveAttribute('data-cents', '11000');
    await expect(panel.locator('[data-ui="backpack-sell"]'), 'не біля приймальні — кнопки «Продати» немає').toHaveCount(0);
    expect((await panel.boundingBox())?.width, 'панель вміщується в екран').toBeLessThanOrEqual(size.width);
    if (SHOTS) await page.screenshot({ path: `research/game-244/backpack-${size.name}-away.png` });

    // Escape закриває.
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);

    // 2. Підійти до приймальні (obj.sell у таборі) і продати: гроші ростуть на ціну викупу, річ зникає.
    const at = await probe(page);
    await walk(page, route('camp-lake', [at.playerX, at.playerY], 'obj.sell'));
    await expect.poll(async () => (await probe(page)).nearObject, { timeout: 8_000, message: 'біля приймальні' }).toBe('obj.sell');
    await page.locator('[data-ui="backpack-open"]').click();
    await expect(panel).toBeVisible();
    const sell = panel.locator('[data-ui="backpack-sell"]');
    await expect(sell, 'продається лише те, що ядро викуповує (трекінговий намет)').toHaveCount(1);
    await expect(sell, 'біля приймальні є «Продати»').toBeVisible();
    const id = (await sell.getAttribute('data-id')) as string;
    const row = panel.locator(`[data-ui="backpack-item"][data-id="${id}"]`);
    const price = Number(await row.locator('[data-ui="backpack-price"]').getAttribute('data-cents'));
    const qty = (await core(page)).game.inventory[id] ?? 0;
    const before = await money(page);
    if (SHOTS) await page.screenshot({ path: `research/game-244/backpack-${size.name}-reception.png` });
    await sell.click();
    await expect.poll(() => money(page), { message: 'гроші виросли на ціну викупу' }).toBe(before + price);
    expect((await core(page)).game.inventory[id] ?? 0, 'на один примірник менше').toBe(qty - 1);
    if (qty === 1) await expect(row, 'продана річ зникла з рюкзака').toHaveCount(0);
    expect(errors).toEqual([]);
    await ctx.close();
  });
}
