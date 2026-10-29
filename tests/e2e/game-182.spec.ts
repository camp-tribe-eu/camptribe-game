// GAME-182 · вступ і Атлас: Нова гра → дощовий вечір, лист дідуся Генрі, ПЕРШИЙ ВИБІР гравця ≤ 15 с без ☰; наклейка «Дім» лягає на сторінку «Перша спроба» зі звуком «дзинь»;
// Атлас із ☰ (12 слотів, печатка в центрі, мапа з «ми тут»); «Пропустити» працює; обидві орієнтації. Старі e2e обирають героя в ☰ — тож вступ у збірці e2e вмикає лише ?intro=1.
// Негативні контролі (закон 1): без ?intro=1 вступу немає (перевірка «вступ видно» на цьому червоніє); завантажений сейв вступу не показує.
import { expect, test, type Page } from '@playwright/test';

interface Core { game: { player: { locationId: string } | null; stickers?: string[]; quests: Record<string, { status: string }> } }
const core = (page: Page): Promise<Core> => page.evaluate(() => (window as unknown as { __game: { read: () => Core } }).__game.read());
const sounds = (page: Page): Promise<string[]> => page.evaluate(() => (window as unknown as { __game: { sounds: () => string[] } }).__game.sounds());
const loaded = (page: Page): Promise<unknown> => page.waitForFunction(() => (window as unknown as { __game?: { probe: { saveLoaded: boolean } } }).__game?.probe.saveLoaded === true, null, { timeout: 30_000 });

const VIEWS = [{ side: 'portrait', w: 390, h: 844 }, { side: 'landscape', w: 844, h: 390 }] as const;
const FIRST_CHOICE_BUDGET_MS = 15_000;
const next = async (page: Page): Promise<void> => { await page.locator('[data-ui="intro-next"]').click(); await page.waitForTimeout(280); };   // 280 мс: пауза між кроками вступу (250)

for (const v of VIEWS) {
  test(`вступ ${v.side}: перший вибір ≤ 15 с без ☰ → «Дім» в Атласі → Атлас із ☰`, async ({ page }) => {
    await page.setViewportSize({ width: v.w, height: v.h });
    await page.goto('/?intro=1&seed=1');
    await loaded(page);
    const t0 = Date.now();
    const intro = page.locator('[data-ui="intro"]');
    await expect(intro).toBeVisible();
    // ☰ під вступом не видно й не потрібна: перший вибір — у самому вступі.
    await expect(page.locator('.ui-story-btn')).toHaveCount(0);
    await expect(page.locator('[data-ui="line"]')).toContainText('Метью');
    await page.screenshot({ path: `research/visual-audit/intro-${v.side}-rain.png` });
    await next(page);
    await next(page);
    await expect(page.locator('[data-ui="letter"]')).toBeVisible();
    await expect(page.locator('[data-ui="letter-quote"]')).toHaveText('Найкращі подорожі починаються не з ідеального плану, а з рішення поїхати разом.');
    await page.screenshot({ path: `research/visual-audit/intro-${v.side}-letter.png` });
    await next(page);
    const pick = page.locator('[data-act="create"]');
    await expect(pick.first()).toBeVisible();
    const toChoice = Date.now() - t0;
    console.log(`[GAME-182] ${v.side}: від появи вступу до першого вибору ${toChoice} мс (бюджет ${FIRST_CHOICE_BUDGET_MS})`);
    expect(toChoice).toBeLessThan(FIRST_CHOICE_BUDGET_MS);
    expect(await pick.count()).toBeGreaterThanOrEqual(2);   // вибір героя лишився: родина й соло
    await expect(page.locator('[data-ui="story"]')).toHaveCount(0);
    await page.screenshot({ path: `research/visual-audit/intro-${v.side}-pick.png` });
    expect((await core(page)).game.player).toBeNull();
    await pick.first().click();
    await expect.poll(async () => (await core(page)).game.player !== null).toBe(true);
    // Родинні репліки, далі сторінка Атласу з «Дім».
    for (let i = 0; i < 12 && (await page.locator('[data-kind="final"]').count()) === 0; i++) await next(page);
    await expect(page.locator('[data-kind="final"]')).toBeVisible();
    const home = page.locator('[data-ui="sticker"][data-id="sticker.home"]');
    await expect(home).toHaveAttribute('data-owned', 'yes');
    await expect(home).toHaveAttribute('data-fly', 'yes');
    expect(await sounds(page)).toContain('ui-confirmation');   // «дзинь» — єдиний UI-звук підтвердження
    await expect(page.locator('[data-ui="atlas-count"]')).toHaveAttribute('data-count', '1');
    await page.waitForTimeout(1100);   // анімація польоту завершилась — кадр без розмиття
    await page.screenshot({ path: `research/visual-audit/intro-${v.side}-final.png` });
    await next(page);   // «До мапи»
    await expect(intro).toHaveCount(0);
    expect((await core(page)).game.stickers).toEqual(['sticker.home']);
    // Атлас із ☰.
    await page.locator('.ui-story-btn').click();
    await page.locator('[data-ui="atlas-open"]').click();
    const panel = page.locator('[data-ui="atlas-panel"]');
    await expect(panel).toBeVisible();
    expect(await panel.locator('[data-ui="sticker"]').count()).toBe(12);
    expect(await panel.locator('[data-ui="sticker"][data-owned="yes"]').count()).toBe(1);
    await expect(panel.locator('[data-ui="sticker"][data-id="sticker.home"]')).toHaveAttribute('data-owned', 'yes');
    await expect(panel.locator('[data-ui="stamp"]')).toBeVisible();
    await expect(panel.locator('[data-ui="atlas-here"]')).toHaveText('ми тут');
    await expect(panel.locator('[data-ui="atlas-pin"]')).toBeVisible();
    // Печатка — у центрі сітки; силуети — не відрізнити «порожній слот» від «наклейка є» лише кольором: є ще підпис і атрибут.
    const g = await panel.locator('[data-ui="atlas-grid"]').boundingBox();
    const s = await panel.locator('[data-ui="stamp"]').boundingBox();
    expect(g && s && Math.abs(s.x + s.width / 2 - (g.x + g.width / 2)) < 4 && Math.abs(s.y + s.height / 2 - (g.y + g.height / 2)) < 4).toBe(true);
    // Усе вміщається в екран: без горизонтальної прокрутки, кнопка закриття досяжна дотиком.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(panel.locator('[data-ui="atlas-close"]')).toBeVisible();
    await page.screenshot({ path: `research/visual-audit/atlas-${v.side}-page.png` });
    await panel.locator('[data-ui="atlas-close"]').click();
    await expect(page.locator('[data-ui="story"]')).toBeVisible();
    // Перезавантаження після вступу: сейв прочитано — вступу немає, наклейка лишилась.
    await page.reload();
    await loaded(page);
    await expect(page.locator('[data-ui="intro"]')).toHaveCount(0);
    expect((await core(page)).game.stickers).toEqual(['sticker.home']);
  });
}

test('«Пропустити»: до вибору — на вибір героя (він лишається), після — одразу на мапу; Escape теж пропускає', async ({ page }) => {
  await page.goto('/?intro=1&seed=1');
  await loaded(page);
  await expect(page.locator('[data-ui="intro"]')).toBeVisible();
  await page.locator('[data-ui="intro-skip"]').click();
  await expect(page.locator('[data-kind="pick"]')).toBeVisible();
  await expect(page.locator('[data-ui="intro-skip"]')).toHaveCount(0);   // на виборі пропустити нічого: герой потрібен
  await page.locator('[data-act="create"]').first().click();
  await expect(page.locator('[data-ui="intro-skip"]')).toBeVisible();
  await page.waitForTimeout(300);   // пауза між кроками вступу — 250 мс від попереднього дотику
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-ui="intro"]')).toHaveCount(0);
  const c = await core(page);
  expect(c.game.player).not.toBeNull();
  expect(c.game.stickers).toEqual(['sticker.home']);   // наклейка належить ядру, а не анімації: пропуск її не губить
  await expect(page.locator('.ui-story-btn')).toBeVisible();
});

test('негативний контроль: без ?intro=1 вступу немає, а ☰ веде до вибору героя, як раніше', async ({ page }) => {
  await page.goto('/?seed=1');
  await loaded(page);
  await expect(page.locator('[data-ui="intro"]')).toHaveCount(0);
  await expect(page.locator('.ui-story-btn')).toBeVisible();
});
