// GAME-109 · пакування перед першою дорогою: «Ми точно все взяли?» — три групи, лічильник місця, «Укласти автоматично».
// Дотиком на 844×390 і 390×844, мишею на 1280×800: покласти, дістати, місце не вміщається, автоукладання, далі — на дорогу.
// Кожна ціль ≥ 44 px. Кожна дія — справжній клік (дотик), команда йде в ядро; числа звіряємо з ядром (window.__game).
import { expect, test, type Page } from '@playwright/test';

interface Core { game: { flags: string[]; player: { locationId: string | null } | null }; journal: { type: string }[] }
const core = (page: Page): Promise<Core> => page.evaluate(() => (window as unknown as { __game: { read: () => Core } }).__game.read());
const panel = (page: Page) => page.locator('[data-ui="story"]');
const packing = (page: Page) => page.locator('[data-ui="packing"]');

const MODES = [
  { name: 'дотик 844×390 (горизонтально)', viewport: { width: 844, height: 390 }, touch: true },
  { name: 'дотик 390×844 (вертикально)', viewport: { width: 390, height: 844 }, touch: true },
  { name: 'миша 1280×800', viewport: { width: 1280, height: 800 }, touch: false },
] as const;

for (const mode of MODES) {
  test(`пакування: ${mode.name} — покласти, дістати, місце, автоукладання, на дорогу`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: mode.viewport, ...(mode.touch ? { hasTouch: true, isMobile: true } : {}) });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/?seed=2');
    await page.waitForFunction(() => (window as unknown as { __game?: { probe: { saveLoaded: boolean } } }).__game?.probe.saveLoaded === true, null, { timeout: 30_000 });
    // Кнопку ☰ тапає лише дотик, мишею — клік: однаково «справжня» активація.
    // force — лише для кнопки з aria-disabled: Playwright не активує «недоступне», а гравець її натисне (і нічого не станеться).
    const press = async (loc: ReturnType<Page['locator']>, force = false): Promise<void> => {
      await loc.scrollIntoViewIfNeeded();
      if (mode.touch) await loc.tap({ force }); else await loc.click({ force });
      await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії
    };
    await press(page.locator('[data-touch="story"]'));
    await expect(panel(page)).toBeVisible();
    const act = (kind: string, key = '') => press(panel(page).locator(`[data-act="${kind}"][data-key="${key}"]`));
    const used = async (): Promise<number> => Number(await packing(page).locator('[data-ui="pack-space"]').getAttribute('data-used'));

    await press(panel(page).locator('[data-act="create"]', { hasText: 'Велосипед' }).first());
    await expect(packing(page)).toHaveCount(0);                        // ще вдома, до крамниці: пакувати рано
    await act('complete', 'q.prologue-home-001');
    await act('complete', 'q.st-001');
    await act('complete', 'q.st-002');
    await act('visit', 'loc.shop');
    await act('pickup', 'item.tent');
    await act('pickup', 'item.sleeping-bag');
    await expect(packing(page)).toHaveCount(0);                        // ST-003 ще не завершено
    await act('complete', 'q.st-003');

    // Екран пакування: заголовок, три групи, місце велосипеда 10 од., автоукладання вже виконане при старті (9 «потрібного» + ліхтар).
    await expect(packing(page)).toBeVisible();
    await expect(packing(page).locator('legend')).toHaveText('Ми точно все взяли?');
    expect(await packing(page).locator('[data-ui="pack-group"]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.group))).toEqual(['needed', 'useful', 'leave']);
    await expect(packing(page).locator('[data-ui="pack-space"]')).toHaveText('Місце: 10 / 10 од.');
    expect(await used()).toBe(10);
    // Усі цілі ≥ 44 px (кнопки речей і «Укласти автоматично»), рахуємо їх — порожній перелік нічого б не довів.
    const boxes = await packing(page).locator('button').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
    expect(boxes.length).toBe(9 + 1);                                   // 9 речей без кішки + автоукладання
    for (const [w, h] of boxes) { expect(w).toBeGreaterThanOrEqual(44); expect(h).toBeGreaterThanOrEqual(44); }

    // Дістати ліхтар: 10 → 9, прапорець у ядрі зник.
    await act('unpack', 'item.lantern');
    expect(await used()).toBe(9);
    await expect(packing(page).locator('[data-ui="pack-space"]')).toHaveText('Місце: 9 / 10 од.');
    expect((await core(page)).game.flags).not.toContain('f.pack-lantern');
    // Покласти перекуси (1 од.): 9 → 10.
    await act('pack', 'item.snacks');
    expect(await used()).toBe(10);
    expect((await core(page)).game.flags).toContain('f.pack-snacks');
    // Подушка (2 од.) не вміщається: кнопка недоступна, натискання нічого не змінює.
    const cushion = packing(page).locator('[data-act="pack-full"][data-key="item.big-cushion"]');
    await expect(cushion).toHaveAttribute('aria-disabled', 'true');
    await press(cushion, true);
    expect(await used()).toBe(10);
    expect((await core(page)).game.flags).not.toContain('f.pack-big-cushion');

    // Дістати намет: місце 6, з'являється підпис про альтанку (велосипед).
    await expect(packing(page).locator('[data-ui="pack-note"]')).toHaveCount(0);
    await act('unpack', 'item.tent');
    expect(await used()).toBe(6);
    await expect(packing(page).locator('[data-ui="pack-note"]')).toContainText('альтанка');
    // «Укласти автоматично»: намет, ліхтар на місці, перекусів нема, підпису нема.
    await press(packing(page).locator('[data-act="autopack"]'));
    expect(await used()).toBe(10);
    const flags = (await core(page)).game.flags;
    expect(flags).toEqual(expect.arrayContaining(['f.pack-tent', 'f.pack-lantern', 'f.pack-sleeping-bag', 'f.pack-water', 'f.pack-simple-dinner']));
    expect(flags).not.toContain('f.pack-snacks');
    await expect(packing(page).locator('[data-ui="pack-note"]')).toHaveCount(0);

    // Далі — на дорогу: пакування зникає, гравець на дорозі, журнал пам'ятає пакування (лише факти стану).
    await act('visit', 'loc.home');                                   // GAME-138: CH1-HOME-001 — пакування вдома, тоді дорога
    await act('complete', 'q.ch1-home-001');
    await act('visit', 'loc.road');
    await expect(packing(page)).toHaveCount(0);
    const c = await core(page);
    expect(c.game.player?.locationId).toBe('loc.road');
    const types = c.journal.map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(['UnpackItem', 'PackItem', 'AutoPack']));
    expect(await panel(page).textContent()).not.toContain('⟦');         // жодного ключа без тексту
    expect(errors).toEqual([]);
    await ctx.close();
  });
}
