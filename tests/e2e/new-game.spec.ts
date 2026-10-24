// GAME-82 · «Нова гра» в меню паузи: підтвердження, скасування, збереження нової гри через перезавантаження.
import { expect, test, type Page } from '@playwright/test';

interface Core { game: { moneyCents: number; player: { transportId: string } | null }; clock: { paused: boolean }; journal: { type: string }[] }
const core = (page: Page): Promise<Core> => page.evaluate(() => (window as unknown as { __game: { read: () => Core } }).__game.read());
const story = (page: Page) => page.locator('[data-ui="story"]');
const pause = (page: Page) => page.locator('[data-ui="pause"]');
const confirm = (page: Page) => page.locator('[data-ui="confirm-new"]');

async function load(page: Page, url = '/'): Promise<void> {
  await page.goto(url);
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { saveLoaded: boolean } } }).__game?.probe.saveLoaded === true, null, { timeout: 30_000 });
}

/** Гра з персонажем і непорожнім журналом — інакше «нова гра стерла» нічого не доводить. */
async function playSome(page: Page): Promise<Core> {
  await load(page);
  await page.locator('[data-touch="story"]').click();
  await story(page).locator('[data-act="create"]', { hasText: /Велосипед|Bike/ }).first().click();
  await page.waitForTimeout(400);   // GAME-80: панель відкидає другу дію раніше ніж за 350 мс
  await story(page).locator('[data-act="complete"][data-key="q.st-001"]').click();
  await page.locator('[data-ui="story-close"]').click();
  const c = await core(page);
  expect(c.game.player).not.toBeNull();
  expect(c.journal.length).toBeGreaterThan(1);
  return c;
}

async function askNewGame(page: Page): Promise<void> {
  await page.locator('[data-touch="pause"]').click();
  await expect(pause(page)).toBeVisible();
  await pause(page).locator('[data-ui="new-game"]').click();
  await expect(confirm(page)).toBeVisible();
}

test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

test('скасування нічого не змінює: журнал, гроші й гравець ті самі', async ({ page }) => {
  await playSome(page);
  await askNewGame(page);
  await page.keyboard.press('Escape');                          // Escape у підтвердженні = «Ні», пауза лишається
  await expect(confirm(page)).toHaveCount(0);
  await expect(pause(page)).toBeVisible();
  const before = await core(page);
  await pause(page).locator('[data-ui="new-game"]').click();
  await expect(confirm(page).locator('[data-ui="confirm-new-no"]')).toBeFocused();
  await confirm(page).locator('[data-ui="confirm-new-no"]').click();
  await expect(pause(page)).toBeVisible();
  const after = await core(page);
  expect(after.journal).toEqual(before.journal);
  expect(after.game).toEqual(before.game);
  await page.reload();
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { saveLoaded: boolean } } }).__game?.probe.saveLoaded === true);
  expect((await core(page)).journal).toEqual(before.journal);   // і в сховищі стара гра
});

test('підтвердження: текст про стирання; після «Так» — вибір персонажа, порожній журнал, стартові гроші; reload відкриває НОВУ гру', async ({ page }) => {
  const old = await playSome(page);
  await askNewGame(page);
  await expect(confirm(page).locator('[data-ui="confirm-new-text"]')).toContainText('стерто');
  await confirm(page).locator('[data-ui="confirm-new-yes"]').click();
  await expect(story(page).locator('[data-ui="create"]')).toBeVisible();
  const fresh = await core(page);
  expect(fresh.game.player).toBeNull();
  expect(fresh.journal).toEqual([]);
  expect(fresh.game.moneyCents).toBe(5000);
  expect(fresh.clock.paused).toBe(true);
  expect(old.journal.length).toBeGreaterThan(0);
  // Автозбереження тримає нову гру: після перезавантаження — не стара.
  await page.reload();
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { saveLoaded: boolean } } }).__game?.probe.saveLoaded === true);
  const again = await core(page);
  expect(again.game.player).toBeNull();
  expect(again.journal).toEqual([]);
  expect(again.game.moneyCents).toBe(5000);
  // Другий профіль без чищення IndexedDB: можна обрати персонажа знову.
  await page.locator('[data-touch="story"]').click();
  await expect(story(page).locator('[data-ui="create"]')).toBeVisible();
});

test('англійською і українською: кнопки «New game» і «Reset settings»', async ({ page }) => {
  await load(page);
  await page.locator('[data-touch="pause"]').click();
  await pause(page).locator('[data-ui="lang-en"]').click();
  await expect(pause(page).locator('[data-ui="new-game"]')).toHaveText('New game');
  await expect(pause(page).locator('[data-ui="reset"]')).toHaveText('Reset settings');
  await pause(page).locator('[data-ui="lang-uk"]').click();
  await expect(pause(page).locator('[data-ui="reset"]')).toHaveText('Скинути налаштування');
});
