// GAME-215 · «Сліди Генрі»: позначка олівцем на мапі дому → підійти ногами (кільце наближення) → прапорець сліду, «+5» → у ☰ → Атлас → сторінка
// «Шлях Генрі»: слід знайдено, з датою (1978), лічильник 1/N, листівки ще нема; решта слідів — лише позначки без назви. Обидві орієнтації телефона.
// Негативний контроль (закон 1): ?breakSpot=trace.home-bench — об'єкт німий, прапорець не з'являється, в Атласі слід не знайдено; цей самий прохід червоніє.
// Знімки для картки: позначка на мапі й сторінка Атласу — SHOTS_DIR (тека знімків) або research/visual-audit.
import { expect, test, type Page } from '@playwright/test';
import { core, loaded, probe, route, routeXY, walk } from './chapter-driver';

const SHOTS_DIR = process.env.SHOTS_DIR ?? 'research/visual-audit';
const TRACE = 'trace.home-bench';
const FLAG = 'f.trace-home-bench';
const VIEWS = [{ side: 'portrait', w: 390, h: 844 }, { side: 'landscape', w: 844, h: 390 }] as const;
const panel = (page: Page) => page.locator('.ui-story');

/** Нова гра (велосипед, seed 7) кнопками ☰, далі перезавантаження з ?mapFirst=1 — справжня гра на мапі дому (як game-202-home). */
async function newGameAtHome(page: Page, extra = ''): Promise<void> {
  await page.goto('/?seed=7');
  await loaded(page);
  await page.locator('[data-touch="story"]').click();
  await panel(page).locator('[data-act="create"]', { hasText: /Велосипед|Bike/ }).first().click();
  await page.waitForTimeout(400);
  await page.goto(`/?seed=7&mapFirst=1${extra}`);
  await loaded(page);
  await page.locator('[data-ui="recovery-close"]').click({ timeout: 800 }).catch(() => undefined);
  expect((await core(page)).game.player?.locationId).toBe('loc.home');
}

const at = async (page: Page): Promise<[number, number]> => { const p = await probe(page); return [p.playerX, p.playerY]; };

for (const v of VIEWS) {
  test(`${v.side}: позначка олівцем → слід знайдено ногами → в Атласі «Шлях Генрі» 1/N із датою`, async ({ page }) => {
    await page.setViewportSize({ width: v.w, height: v.h });
    await newGameAtHome(page);
    const c0 = await core(page);
    expect(c0.game.flags).not.toContain(FLAG);
    // Підійти на дві клітинки до лавки (позначка ще жива й видна) — знімок позначки.
    await walk(page, routeXY('home', await at(page), { x: 3 * 32 + 16, y: 11 * 32 + 16 }));
    await page.waitForTimeout(350);
    expect((await core(page)).game.flags, 'за дві клітинки слід ще не знайдено').not.toContain(FLAG);
    await page.screenshot({ path: `${SHOTS_DIR}/henry-trace-marker-${v.side}.png` });
    // Останні кроки: кільце наближення спрацьовує саме (≤ 0,8 с), ядро ставить прапорець і видає XP.
    const xp0 = (await page.evaluate(() => (window as unknown as { __game: { read: () => { game: { progress?: { xp: number } } } } }).__game.read())).game.progress?.xp ?? 0;
    await walk(page, route('home', await at(page), TRACE));
    await expect.poll(async () => (await core(page)).game.flags.includes(FLAG), { timeout: 6_000, message: 'прапорець сліду після наближення' }).toBe(true);
    const xp1 = (await page.evaluate(() => (window as unknown as { __game: { read: () => { game: { progress?: { xp: number } } } } }).__game.read())).game.progress?.xp ?? 0;
    expect(xp1 - xp0, 'нагорода сліду: +5 XP').toBe(5);
    // Атлас із ☰: сторінка «Шлях Генрі».
    await page.locator('[data-touch="story"]').click();
    await page.locator('[data-ui="atlas-open"]').click();
    const henry = page.locator('[data-ui="henry"]');
    await expect(henry).toBeVisible();
    const total = Number(await henry.getAttribute('data-total'));
    expect(total).toBeGreaterThanOrEqual(9);
    await expect(henry).toHaveAttribute('data-found', '1');
    const found = henry.locator(`[data-ui="trace"][data-id="${TRACE}"]`);
    await expect(found).toHaveAttribute('data-found', 'yes');
    await expect(found).toContainText('Лавка в саду');
    await expect(found).toContainText('1978');   // дата каже: старий слід
    expect(await henry.locator('[data-ui="trace"][data-found="no"]').count()).toBe(total - 1);
    await expect(henry.locator('[data-ui="trace"][data-found="no"]').first()).toContainText('Ще не знайдено');
    await expect(henry.locator('[data-ui="henry-count"]')).toHaveText(`Слідів знайдено: 1/${total}`);
    await expect(page.locator('[data-ui="henry-postcard"]')).toHaveCount(0);
    await expect(page.locator('[data-ui="sticker"][data-id="sticker.henry-postcard"]')).toHaveAttribute('data-owned', 'no');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'без горизонтальної прокрутки').toBe(true);
    await henry.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS_DIR}/henry-atlas-${v.side}.png` });
    await page.locator('[data-ui="atlas-close"]').click();
    // Перезавантаження: слід у сейві.
    await page.reload();
    await loaded(page);
    expect((await core(page)).game.flags).toContain(FLAG);
  });
}

test('негативний контроль: ?breakSpot — німа позначка не ставить прапорець, в Атласі слід не знайдено', async ({ page }) => {
  await newGameAtHome(page, `&breakSpot=${TRACE}`);
  await walk(page, route('home', await at(page), TRACE));
  await page.waitForTimeout(1_500);   // кільце встигло б спрацювати (≤ 0,8 с)
  expect((await core(page)).game.flags).not.toContain(FLAG);
  await page.locator('[data-touch="story"]').click();
  await page.locator('[data-ui="atlas-open"]').click();
  await expect(page.locator(`[data-ui="trace"][data-id="${TRACE}"]`)).toHaveAttribute('data-found', 'no');
  await expect(page.locator('[data-ui="henry"]')).toHaveAttribute('data-found', '0');
});
