// GAME-246 · каса в крамниці: узяте лягає в кошик, без оплати не вийти, оплата знімає суму, речі стають власністю.
import { expect, test, type Page } from '@playwright/test';
import { waitGameReady } from './ready';

interface Core { game: { moneyCents: number; inventory: Record<string, number>; flags: string[]; player: { locationId: string | null } | null } }
const core = (page: Page): Promise<Core> => page.evaluate(() => (window as unknown as { __game: { read: () => Core } }).__game.read());
const panel = (page: Page) => page.locator('[data-ui="story"]');
async function act(page: Page, kind: string, key?: string): Promise<void> {
  await panel(page).locator(key ? `[data-act="${kind}"][data-key="${key}"]` : `[data-act="${kind}"]`).first().click();
  await page.waitForTimeout(400);
}

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('кошик → не вийти → сплатити → гроші мінус сума → речі власні', async ({ page }) => {
  await page.goto('/');
  await waitGameReady(page);
  await page.locator('[data-touch="story"]').click();
  await act(page, 'create');
  for (const [k, key] of [['complete', 'q.prologue-home-001'], ['complete', 'q.st-001'], ['complete', 'q.st-002'], ['visit', 'loc.shop']] as const) await act(page, k, key);
  const before = (await core(page)).game.moneyCents;
  expect(before).toBe(5000);
  await act(page, 'pickup', 'item.tent');
  await act(page, 'pickup', 'item.sleeping-bag');
  let c = (await core(page)).game;
  expect(c.inventory['item.tent'] ?? 0, 'у кошику, не власність').toBe(0);
  expect(c.flags).toEqual(expect.arrayContaining(['f.basket-tent', 'f.basket-sleeping-bag']));
  expect(c.moneyCents).toBe(before);
  // вийти не можна: дороги з крамниці немає, квест не завершується; є лише «Спершу каса»
  await expect(panel(page).locator('[data-act="visit"][data-key="loc.home"]')).toHaveCount(0);
  await expect(panel(page).locator('[data-act="complete"][data-key="q.st-003"]')).toHaveCount(0);
  await expect(panel(page).locator('[data-act="checkout"]')).toHaveCount(1);
  await act(page, 'checkout', 'basket.all');
  c = (await core(page)).game;
  expect(c.moneyCents).toBe(before - 2499 - 999);
  expect(c.inventory['item.tent']).toBe(1);
  expect(c.inventory['item.sleeping-bag']).toBe(1);
  expect(c.flags.filter((f) => f.startsWith('f.basket-'))).toEqual([]);
  await expect(panel(page).locator('[data-act="complete"][data-key="q.st-003"]')).toHaveCount(1);
});
