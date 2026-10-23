// GAME-83 · QA: спорядження було невидиме в Пролозі, а на старті гравець не знав, що робити.
// 1) недоступна купівля — вимкнена кнопка з ціною й причиною; 2) HUD (місце, день і час, гроші) у трьох в'юпортах;
// 3) підказка «Відкрий ☰» зникає після першої дії й не повертається після перезавантаження;
// 4) у речах видно «мокре» і стан. Кожна перевірка має негативний контроль (мутація — у звіті картки).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

interface Core {
  game: { moneyCents: number; inventory: Record<string, number>; gear: Record<string, { condition: number; wet: boolean }> };
  journal: unknown[];
}
const core = (page: Page): Promise<Core> => page.evaluate(() => (window as unknown as { __game: { read: () => Core } }).__game.read());
const panel = (page: Page) => page.locator('[data-ui="story"]');
/** Сума в євро як у грі (uk-UA): «50,00 €»; у збірках Chromium без повних ICU-даних замість знака — «EUR». */
const eur = (cents: number): RegExp => new RegExp(`${Math.trunc(cents / 100)},${String(cents % 100).padStart(2, '0')}\\s*(?:€|EUR)`);
const SETTINGS_KEY = 'camplife.settings.v1';

async function load(page: Page, query = ''): Promise<void> {
  await page.goto(`/${query}`);
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { saveLoaded: boolean } } }).__game?.probe.saveLoaded === true, null, { timeout: 30_000 });
}
async function openStory(page: Page): Promise<void> {
  await page.locator('[data-touch="story"]').click();
  await expect(panel(page)).toBeVisible();
}
/** Один крок проходу кліком. GAME-80: панель глуха ~350 мс після дії — чекаємо 400. Подію в дорозі закриваємо, як гравець. */
async function act(page: Page, kind: string, key = ''): Promise<void> {
  await panel(page).locator(`[data-act="${kind}"][data-key="${key}"]`).click({ timeout: 5_000 });
  await page.waitForTimeout(400);
  if (kind === 'visit' && key === 'loc.road') {
    const answer = panel(page).locator('[data-key="dlg.road-apples.box.c2"]');
    if (await answer.isVisible({ timeout: 400 }).catch(() => false)) {
      await answer.click();
      await panel(page).locator('[data-act="continue"]').click();
      await page.waitForTimeout(400);
    }
  }
}
async function createBike(page: Page): Promise<void> {
  await panel(page).locator('[data-act="create"]', { hasText: 'Велосипед' }).first().click();
  await page.waitForTimeout(400);
}
async function toShop(page: Page): Promise<void> {
  await createBike(page);
  for (const [k, key] of [['visit', 'loc.home'], ['complete', 'q.st-001'], ['visit', 'loc.home'], ['complete', 'q.st-002'], ['visit', 'loc.shop']] as const) await act(page, k, key);
}
/** Далі з крамниці: намет і спальник, завершити st-003, на дорогу (там дощ чи сонце — за зерном), далі до озера. */
async function shopToLake(page: Page): Promise<void> {
  for (const [k, key] of [['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'], ['complete', 'q.st-003'], ['visit', 'loc.road']] as const) await act(page, k, key);
}

test.describe('мобільний екран подорожі', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('недоступна купівля — вимкнена кнопка з ціною й причиною «бракує», клік нічого не робить', async ({ page }) => {
    await load(page, '?seed=2');
    await openStory(page);
    await toShop(page);
    const c0 = await core(page);
    const locked = panel(page).locator('[data-act="buy-locked"]');
    expect(await locked.count()).toBeGreaterThan(0);
    // Найдешевший тир-2 — синтетичний спальник, 89 €; у гравця на цей момент 50 € → бракує 39 €.
    expect(c0.game.moneyCents).toBe(5_000);
    const bag = panel(page).locator('[data-act="buy-locked"][data-key="item.sleeping-bag-synthetic"]');
    await expect(bag).toHaveAttribute('aria-disabled', 'true');
    await expect(bag).toContainText(eur(8_900));
    await expect(bag).toContainText(eur(3_900))
    await expect(bag).toContainText('бракує');
    // Причина — частина доступного імені (екранний читач чує її разом з назвою).
    expect(await bag.evaluate((el) => (el.textContent ?? '').trim())).toMatch(/спальник.*89,00.*бракує 39,00/s);
    for (const b of await locked.all()) {
      await expect(b).toHaveAttribute('aria-disabled', 'true');
      await expect(b).toContainText('бракує');
    }
    // Недоступна кнопка — не команда: ні гроші, ні речі, ні журнал не рухаються.
    await bag.click({ force: true });   // aria-disabled: без force Playwright чекав би «активності» і не клікнув би взагалі
    await page.waitForTimeout(400);
    const c1 = await core(page);
    expect(c1.game.moneyCents).toBe(c0.game.moneyCents);
    expect(c1.game.inventory).toEqual(c0.game.inventory);
    expect(c1.journal.length).toBe(c0.journal.length);
    // Лишається в порядку Tab (на відміну від disabled): читач її знаходить.
    await bag.focus();
    await expect(bag).toBeFocused();
  });

  test('недоступний стан доступний: axe без serious/critical, а сканер уміє червоніти (кнопка без імені)', async ({ page }) => {
    await load(page, '?seed=2');
    await openStory(page);
    await toShop(page);
    await expect(panel(page).locator('[data-act="buy-locked"]').first()).toBeVisible();
    // Найгірше тло під діалогом (як у a11y.spec.ts): axe не бачить пікселів полотна.
    await page.addStyleTag({ content: '#stage canvas { visibility: hidden !important; } #stage { background: #fff !important; }' });
    const serious = async (): Promise<string[]> => (await new AxeBuilder({ page }).analyze()).violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
    expect(await serious()).toEqual([]);
    // Негативний контроль: безіменна кнопка в тій самій панелі — сканер мусить її знайти.
    await page.evaluate(() => { const b = document.createElement('button'); b.id = 'ctl'; b.setAttribute('aria-label', ''); panelAppend(b); function panelAppend(x: HTMLElement): void { document.querySelector('[data-ui="actions"]')?.append(x); } });
    expect((await serious()).join('\n')).toContain('button-name');
    await page.evaluate(() => document.getElementById('ctl')?.remove());
    expect(await serious()).toEqual([]);
  });

  // Дощ — зерно 10, сонце — зерно 2 (src/core/weather.ts; так само story.spec.ts).
  for (const [seed, wet, word] of [[10, true, 'дощ'], [2, false, 'сонце']] as const) {
    test(`речі після дороги (${word}): спорядження зі станом${wet ? ' і позначкою «мокре»' : ', без «мокре»'}`, async ({ page }) => {
      await load(page, `?seed=${seed}`);
      await openStory(page);
      await toShop(page);
      await shopToLake(page);
      const tent = panel(page).locator('[data-ui="inv-item"][data-key="item.tent"]');
      const g1 = (await core(page)).game.gear['item.tent'];
      if (wet) {
        expect(g1).toEqual({ condition: 100, wet: true });       // перша дорога в дощ: намокло, стан ще не впав
        await expect(tent).toHaveAttribute('data-wet', 'yes');
        await expect(tent).toContainText('мокре');
        await expect(tent).toContainText('стан 100 %');
        // Друга дорога з мокрим: −10 стану (SIM-GEAR-003) — і екран показує те саме число, що ядро.
        await act(page, 'complete', 'q.elise-bike-area.choice');
        await act(page, 'visit', 'loc.camp.lake');
        expect((await core(page)).game.gear['item.tent']).toEqual({ condition: 90, wet: true });
        await expect(tent).toContainText('стан 90 %');
        await expect(tent).toContainText('мокре');
      } else {
        expect(g1).toBeUndefined();                              // сухе й нове — у стані не зберігається
        await expect(tent).toHaveAttribute('data-wet', 'no');
        await expect(tent).toContainText('стан 100 %');
        await expect(tent).not.toContainText('мокре');
      }
    });
  }
});

test.describe('підказка першого запуску', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('є на старті, зникає після першої дії, не повертається після перезавантаження', async ({ page }) => {
    await load(page);
    const hint = page.locator('[data-ui="hint"]');
    await expect(hint).toBeVisible();
    await expect(hint).toHaveText('Відкрий ☰, щоб почати');
    // Перезавантаження БЕЗ дії підказку не прибирає (інакше «зникла» — це просто «не показується»).
    await page.reload();
    await load(page);
    await expect(hint).toBeVisible();
    await openStory(page);
    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0);
    await expect(hint).toHaveCount(0);
    await page.reload();
    await load(page);
    await expect(page.locator('[data-ui="hud"]')).toBeVisible();
    await expect(hint).toHaveCount(0);
  });

  test('англійською: «Open ☰ to begin»', async ({ page }) => {
    await page.addInitScript((k) => { try { if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify({ textScale: 100, language: 'en' })); } catch { /* сховища немає */ } }, SETTINGS_KEY);
    await load(page);
    await expect(page.locator('[data-ui="hint"]')).toHaveText('Open ☰ to begin');
  });
});

// HUD: три в'юпорти, 100 % і 200 % тексту. «Поле гри» — #stage (його розмір задає розкладка в index.html) і полотно в ньому.
const VIEWPORTS = [{ width: 375, height: 667 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }] as const;
interface Rect { left: number; top: number; right: number; bottom: number }
const meets = (a: Rect, b: Rect): boolean => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const rectOf = (page: Page, sel: string): Promise<Rect> => page.locator(sel).first().evaluate((el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; });

for (const vp of VIEWPORTS) for (const scale of [100, 200] as const) {
  test(`HUD ${vp.width}x${vp.height}, текст ${scale} %: місце, день і час, гроші видно; поле гри й ☰ він не перекриває`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: vp, hasTouch: vp.width < 800, isMobile: vp.width < 800 });
    const page = await ctx.newPage();
    await page.addInitScript(([k, s]) => { try { if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify({ textScale: s, language: 'uk', hintSeen: true })); } catch { /* сховища немає */ } }, [SETTINGS_KEY, scale] as const);
    await load(page, '?seed=2');
    await openStory(page);
    await createBike(page);
    await act(page, 'visit', 'loc.home');
    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0);

    const hud = page.locator('[data-ui="hud"]');
    await expect(hud).toBeVisible();
    await expect(page.locator('[data-ui="hud-place"]')).toHaveText(/\S/);
    await expect(page.locator('[data-ui="hud-place"]')).not.toContainText('ще не обране');
    await expect(page.locator('[data-ui="hud-time"]')).toHaveText(/^День 1, \d\d:\d\d$/);
    const money = (await core(page)).game.moneyCents;
    await expect(page.locator('[data-ui="hud-money"]')).toHaveText(eur(money));
    expect(await page.evaluate(() => document.documentElement.style.fontSize)).toBe(`${scale}%`);

    const h = await rectOf(page, '[data-ui="hud"]');
    const stage = await rectOf(page, '#stage');
    const menu = await rectOf(page, '[data-touch="story"]');
    const pauseBtn = await rectOf(page, '[data-touch="pause"]');
    expect(meets(h, stage), 'HUD не перекриває #stage').toBe(false);
    // Phaser перераховує масштаб полотна сам, раз на 0,5 с, — чекаємо, а не міряємо миттєво.
    await expect.poll(async () => meets(h, await rectOf(page, '#stage canvas')), { message: 'HUD не перекриває полотно' }).toBe(false);
    const canvas = await rectOf(page, '#stage canvas');
    expect(meets(h, menu), 'HUD не перекриває ☰').toBe(false);
    expect(meets(h, pauseBtn), 'HUD не перекриває ‖').toBe(false);
    // HUD не вилазить за екран і не має горизонтального переповнення (200 % тексту).
    expect(h.left).toBeGreaterThanOrEqual(0);
    expect(h.right).toBeLessThanOrEqual(vp.width);
    expect(await hud.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    // Поле гри лишається корисним: полотно не стиснуте до нуля навіть при 200 %.
    expect(canvas.bottom - canvas.top).toBeGreaterThan(100);
    await page.screenshot({ path: `test-results/hud-${vp.width}x${vp.height}-${scale}.png` });
    await ctx.close();
  });
}

test('HUD живий: час іде на мапі, без відкриття екранів', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript((k) => { try { if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify({ textScale: 100, language: 'uk', hintSeen: true })); } catch { /* сховища немає */ } }, SETTINGS_KEY);
  await load(page);
  const t0 = await page.locator('[data-ui="hud-time"]').textContent();
  await expect.poll(async () => page.locator('[data-ui="hud-time"]').textContent(), { timeout: 15_000 }).not.toBe(t0);
});
