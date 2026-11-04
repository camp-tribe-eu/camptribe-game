// GAME-213 · камера в телефоні героя: у таборі біля кінця причалу натиснути дію → прапорець фото + +0 ¢ (раз) → у ☰ Атласі розділ «Фото» 1/3.
// Дві орієнтації. Повторна дія нічого не додає. Негативний контроль (закон 1): ?breakSpot=obj.pier-end — німий кадр, фото не з'являється, цей самий прохід червоніє.
import { expect, test, type Page } from '@playwright/test';
import { core, probe, route, walk } from './chapter-driver';
import { arriveInCamp } from './camp-arrival';

const SPOT = 'obj.pier-end';
const FLAG = 'f.photo-pier';
const VIEWS = [{ side: 'portrait', w: 390, h: 844 }, { side: 'landscape', w: 844, h: 390 }] as const;
const at = async (page: Page): Promise<[number, number]> => { const p = await probe(page); return [p.playerX, p.playerY]; };

async function shoot(page: Page): Promise<void> {
  await walk(page, route('camp-lake', await at(page), SPOT));
  await expect.poll(async () => (await probe(page)).nearObject, { timeout: 5_000 }).toBe(SPOT);
  await page.keyboard.press('Space');
}

for (const v of VIEWS) {
  test(`${v.side}: фото камерою телефона → прапорець раз → в Атласі «Фото» 1/3`, async ({ page }) => {
    await page.setViewportSize({ width: v.w, height: v.h });
    await arriveInCamp(page);
    expect((await core(page)).game.flags).not.toContain(FLAG);
    await shoot(page);
    await expect.poll(async () => (await core(page)).game.flags.includes(FLAG), { timeout: 6_000, message: 'прапорець фото' }).toBe(true);
    await page.keyboard.press('Space');   // другий кадр того ж місця — нічого нового
    await page.waitForTimeout(300);
    expect((await core(page)).game.flags.filter((f) => f.startsWith('f.photo-'))).toEqual([FLAG]);
    await page.locator('[data-touch="story"]').click();
    await page.locator('[data-ui="atlas-open"]').click();
    const roll = page.locator('[data-ui="photos"]');
    await expect(roll).toBeVisible();
    await expect(roll).toHaveAttribute('data-taken', '1');
    await expect(roll).toHaveAttribute('data-total', '3');
    await expect(roll.locator('[data-ui="photo"][data-id="photo.pier"]')).toHaveAttribute('data-taken', 'yes');
    await expect(roll.locator('[data-ui="photo"][data-taken="no"]')).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'без горизонтальної прокрутки').toBe(true);
  });
}

test('негативний контроль: ?breakSpot — німий кадр не дає фото, в Атласі 0/3', async ({ page }) => {
  await arriveInCamp(page, `&breakSpot=${SPOT}`);
  await shoot(page).catch(() => undefined);
  await page.waitForTimeout(1_200);
  expect((await core(page)).game.flags).not.toContain(FLAG);
  await page.locator('[data-touch="story"]').click();
  await page.locator('[data-ui="atlas-open"]').click();
  await expect(page.locator('[data-ui="photos"]')).toHaveAttribute('data-taken', '0');
});
