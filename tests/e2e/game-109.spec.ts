// GAME-109 (GAME-245: екран лише читає) · пакування перед першою дорогою: «Ми точно все взяли?» — три групи, лічильник місця, прогрес «Взято N/M», без тумблерів.
// Дотиком на 844×390 і 390×844, мишею на 1280×800: далі — на дорогу. Взяти/завантажити/лишити — у game-245-home-items.spec.ts.
// Кожна ціль ≥ 44 px. Кожна дія — справжній клік (дотик), команда йде в ядро; числа звіряємо з ядром (window.__game).
import { expect, test, type Page } from '@playwright/test';
import { waitGameReady } from './ready';

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
    await waitGameReady(page);
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
    await act('checkout', 'basket.all');                               // GAME-246: узяте лежить у кошику — власністю робить каса
    await expect(packing(page)).toHaveCount(0);                        // ST-003 ще не завершено
    await act('complete', 'q.st-003');

    // Екран пакування (GAME-245: лише читання): заголовок, три групи, місце велосипеда 12 од., прогрес «Взято N/M», жодних тумблерів і «Укласти автоматично».
    await expect(packing(page)).toBeVisible();
    await expect(packing(page).locator('legend')).toHaveText('Ми точно все взяли?');
    expect(await packing(page).locator('[data-ui="pack-group"]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.group))).toEqual(['needed', 'useful', 'leave']);
    await expect(packing(page).locator('[data-ui="pack-space"]')).toHaveText('Місце: 12 / 12 од.');
    expect(await used()).toBe(12);
    await expect(packing(page).locator('[data-ui="pack-progress"]')).toContainText('Взято 7/11');
    expect(await packing(page).locator('[data-ui="pack-item"]').count()).toBe(14);   // 14 речей без кішки
    await expect(packing(page).locator('button')).toHaveCount(0);                    // нічого натискати: усе вже в авто, завантажувати нічого
    await expect(packing(page).locator('[aria-pressed]')).toHaveCount(0);
    await expect(packing(page).locator('[data-act="pack"], [data-act="unpack"], [data-act="autopack"]')).toHaveCount(0);
    expect((await core(page)).game.flags).toEqual(expect.arrayContaining(['f.pack-tent', 'f.pack-documents', 'f.pack-wallet', 'f.pack-sleeping-bag', 'f.pack-water', 'f.pack-simple-dinner']));

    // Далі — на дорогу: пакування зникає, гравець на дорозі, журнал пам'ятає пакування (лише факти стану).
    await act('visit', 'loc.home');                                   // GAME-138: CH1-HOME-001 — пакування вдома, тоді дорога
    await act('complete', 'q.ch1-home-001');
    await act('visit', 'loc.road');
    await expect(packing(page)).toHaveCount(0);
    const c = await core(page);
    expect(c.game.player?.locationId).toBe('loc.road');
    const types = c.journal.map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(['Visit', 'CompleteQuest']));
    expect(await panel(page).textContent()).not.toContain('⟦');         // жодного ключа без тексту
    expect(errors).toEqual([]);
    await ctx.close();
  });
}
