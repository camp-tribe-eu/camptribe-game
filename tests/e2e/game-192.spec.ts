// GAME-192 (OD-022, стовп 7: воля замість повідка) · стрілка «Далі» й рядок «Далі: …» — лише коли застряг (бездіяльність), на кілька секунд після зміни цілі,
// або завжди, якщо так обрано в налаштуваннях. probe.fx.target звітує ціль завжди (драйвери e2e ходять за нею). Таймер стискаємо ?hintIdleMs=.
// Негативний контроль: у режимі «завжди» стрілка не ховається — той самий тест «прихована до бездіяльності» там мусить червоніти.
import { expect, test, type Browser, type Page } from '@playwright/test';

const SETTINGS_KEY = 'camplife.settings.v1';
const VIEWS = [{ w: 390, h: 844, name: 'портрет' }, { w: 844, h: 390, name: 'ландшафт' }] as const;
interface Probe { saveLoaded: boolean; fx: { target: string | null; guide: string } }
const probe = (page: Page): Promise<Probe> => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __game: { probe: Probe } }).__game.probe)) as Probe);
const guide = async (page: Page): Promise<string> => (await probe(page)).fx.guide;

async function start(browser: Browser, v: { w: number; h: number }, mode: 'stuck' | 'always'): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.addInitScript(([k, m]) => { try { localStorage.setItem(k as string, JSON.stringify({ textScale: 100, language: 'uk', hintSeen: true, hintMode: m })); } catch { /* сховища немає */ } }, [SETTINGS_KEY, mode] as const);
  await page.goto('/?seed=7&mapFirst=1&hintIdleMs=6000');
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { saveLoaded: boolean } } }).__game?.probe.saveLoaded === true, null, { timeout: 30_000 });
  await page.locator('[data-touch="story"]').click();
  await page.locator('[data-ui="story"] [data-act="create"]', { hasText: /Велосипед|Bike/ }).first().click();
  await page.waitForTimeout(400);
  await page.locator('[data-ui="story-close"]').click();
  await page.locator('[data-ui="recovery-close"]').click({ timeout: 800 }).catch(() => undefined);
  return page;
}

for (const v of VIEWS) {
  test(`коли застряг: стрілка прихована → з'являється після бездіяльності → дія ховає — ${v.name}`, async ({ browser }) => {
    test.setTimeout(120_000);
    const page = await start(browser, v, 'stuck');
    await expect.poll(async () => (await probe(page)).fx.target, { timeout: 20_000, message: 'ціль звітується завжди' }).not.toBeNull();
    // Вікно показу нової цілі (1,5 с) спливає — стрілки й рядка «Далі» нема, а ціль у пробі лишається.
    await expect.poll(() => guide(page), { timeout: 15_000, message: 'після вікна нової цілі стрілка мусить сховатись' }).toBe('none');
    await expect(page.locator('[data-ui="next-hint"][data-kind="next"]')).toHaveCount(0);
    await expect(page.locator('[data-ui="goal"]')).toBeVisible();   // рядок «Ціль» лишається завжди
    expect((await probe(page)).fx.target).not.toBeNull();
    // Бездіяльність → стрілка і рядок «Далі: …».
    await expect.poll(() => guide(page), { timeout: 15_000, message: 'після бездіяльності стрілка мусить з\'явитись' }).not.toBe('none');
    await expect(page.locator('[data-ui="next-hint"]')).toBeVisible();
    // Дія (кнопка дії затиснута) — ховає.
    const box = await page.locator('[data-touch="interact"]').boundingBox();
    expect(box).not.toBeNull();
    if (box) { await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); }
    await expect.poll(() => guide(page), { timeout: 5_000, message: 'дія мусить сховати стрілку' }).toBe('none');
    await page.mouse.up();
    await page.context().close();
  });

  test(`«Завжди» в налаштуваннях: стрілка видна без бездіяльності — ${v.name}`, async ({ browser }) => {
    test.setTimeout(120_000);
    const page = await start(browser, v, 'always');
    await expect.poll(() => guide(page), { timeout: 20_000 }).not.toBe('none');
    await page.waitForTimeout(5_000);   // довше за вікно нової цілі (1,5 с) і далі за нього: у режимі «стук» вже сховалась би
    expect(await guide(page), 'у режимі «завжди» стрілка не ховається').not.toBe('none');
    await expect(page.locator('[data-ui="next-hint"]')).toBeVisible();
    await page.context().close();
  });

  test(`налаштування «Підказки» перемикається й зберігається — ${v.name}`, async ({ browser }) => {
    test.setTimeout(120_000);
    const page = await start(browser, v, 'stuck');
    await page.locator('[data-touch="pause"]').click();
    await expect(page.locator('[data-ui="hints-stuck"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-ui="hints-always"]').click();
    await expect(page.locator('[data-ui="hints-always"]')).toHaveAttribute('aria-pressed', 'true');
    const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}') as { hintMode?: string }, SETTINGS_KEY);
    expect(saved.hintMode).toBe('always');
    await page.context().close();
  });
}
