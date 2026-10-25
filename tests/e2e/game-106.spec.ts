// GAME-106 · підсумок дня після кінця дня 1 (ST-005): лише факти, «Продовжити» / «Завершити сесію». Дотиком на 390×844 і
// 844×390, мишею на 1280×800. Кожна дія — справжній клік (дотик), команда йде в ядро; факти підсумку звіряємо з ядром (window.__game).
// «Завершити сесію» → перезавантаження → прогрес на місці, підсумок не нав'язується вдруге.
import { mkdirSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

interface Core { game: { campaignEnded: boolean; moneyCents: number; flags: string[] }; journal: { type: string; ref: string | null }[] }
const core = (page: Page): Promise<Core> => page.evaluate(() => (window as unknown as { __game: { read: () => Core } }).__game.read());
const panel = (page: Page) => page.locator('[data-ui="story"]');
const summary = (page: Page) => page.locator('[data-ui="summary"]');
const SHOTS = process.env.GAME106_SHOTS;

const MODES = [
  { id: 'portrait', name: 'дотик 390×844 (вертикально)', viewport: { width: 390, height: 844 }, touch: true },
  { id: 'landscape', name: 'дотик 844×390 (горизонтально)', viewport: { width: 844, height: 390 }, touch: true },
  { id: 'mouse', name: 'миша 1280×800', viewport: { width: 1280, height: 800 }, touch: false },
] as const;

for (const mode of MODES) {
  test(`підсумок дня 1: ${mode.name} — факти, «Завершити сесію», перезавантаження, прогрес на місці`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: mode.viewport, ...(mode.touch ? { hasTouch: true, isMobile: true } : {}) });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const loaded = async (): Promise<void> => {
      await page.waitForFunction(() => (window as unknown as { __game?: { probe: { saveLoaded: boolean } } }).__game?.probe.saveLoaded === true, null, { timeout: 30_000 });
    };
    await page.goto('/?seed=2');
    await loaded();
    const press = async (loc: Locator): Promise<void> => {
      await loc.scrollIntoViewIfNeeded();
      if (mode.touch) await loc.tap(); else await loc.click();
      await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії
    };
    const act = async (kind: string, key = ''): Promise<void> => {
      const b = panel(page).locator(`[data-act="${kind}"][data-key="${key}"]`);
      if (!(await b.isVisible({ timeout: 5_000 }).catch(() => false))) throw new Error(`крок «${kind} ${key}»: кнопки немає`);
      await press(b);
      // На дорозі з шансом 50 % — подія (GAME-31): відповідаємо, як гравець.
      if (kind === 'visit' && key === 'loc.road' && await panel(page).locator('[data-key="dlg.road-apples.box.c2"]').isVisible({ timeout: 400 }).catch(() => false)) {
        await press(panel(page).locator('[data-key="dlg.road-apples.box.c2"]'));
        await press(panel(page).locator('[data-act="continue"]'));
      }
    };

    // День 1 автом: Пролог до ST-005 — так само, як tests/e2e/story.spec.ts (кроки меню; до Елізи — «Поговорити» в меню).
    await press(page.locator('[data-touch="story"]'));
    await press(panel(page).locator('[data-act="create"]', { hasText: /Авто|Car/ }).first());
    for (const [k, key] of [['complete', 'q.prologue-home-001'], ['complete', 'q.st-001'], ['complete', 'q.st-002'], ['visit', 'loc.shop'], ['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'],
      ['complete', 'q.st-003'], ['visit', 'loc.home'], ['complete', 'q.ch1-home-001'], ['visit', 'loc.road'], ['complete', 'q.st-004'], ['visit', 'loc.camp.lake'], ['talk', 'npc.elise'],
      ['choose', 'dlg.elise-greeting.hello.c2'], ['continue', ''], ['choose', 'dlg.elise-greeting.spot.c1'], ['continue', ''], ['pickup', 'item.firewood']] as const) await act(k, key);
    await expect(summary(page)).toHaveCount(0);                     // контроль: до кінця дня підсумку немає
    await act('complete', 'q.st-005');

    // Підсумок: діалог із заголовком у фокусі, екран подорожі й шапка сховані, світ на паузі.
    await expect(summary(page)).toBeVisible();
    await expect(summary(page)).toHaveAttribute('role', 'dialog');
    await expect(summary(page).locator('h2')).toHaveText('Підсумок дня 1');
    await expect(summary(page).locator('h2')).toBeFocused();
    await expect(panel(page)).toHaveCount(0);
    await expect(page.locator('[data-ui="hud"]')).toHaveCount(0);
    const c = await core(page);
    expect(c.game.campaignEnded).toBe(true);
    expect((await page.evaluate(() => (window as unknown as { __game: { read: () => { clock: { paused: boolean } } } }).__game.read().clock.paused))).toBe(true);

    // Факти — проти ядра. Секція є тоді й лише тоді, коли є факт.
    const kinds = await summary(page).locator('[data-ui="summary-section"]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.kind));
    const keys = async (kind: string): Promise<string[]> => summary(page).locator(`[data-kind="${kind}"] li`).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.key ?? ''));
    expect(kinds).toContain('night');
    expect(await keys('night')).toEqual(['sum.night.tent']);
    await expect(summary(page).locator('[data-kind="night"]')).toContainText('у наметі');
    expect(await keys('quests')).toEqual(['q.prologue-home-001', 'q.st-001', 'q.st-002', 'q.st-003', 'q.ch1-home-001', 'q.st-004', 'q.st-005']);
    expect(await keys('got')).toEqual(['item.tent', 'item.sleeping-bag', 'item.firewood']);
    expect(kinds).not.toContain('bought');                           // нічого не купували
    expect(kinds).not.toContain('sold');
    // Подія в дорозі (кидок RNG): секція «У дорозі» — рівно коли в журналі ядра є RoadEvent.
    const hadEvent = c.journal.some((e) => e.type === 'RoadEvent');
    expect(kinds.includes('events')).toBe(hadEvent);
    if (hadEvent) expect(await keys('events')).toEqual(['dlg.road-apples.title']);
    // Гроші: 50 € на старті (START_MONEY_CENTS) + 10 € за кінець розділу — і в ядрі те саме.
    await expect(summary(page).locator('[data-ui="summary-money"]')).toHaveAttribute('data-start', '5000');
    await expect(summary(page).locator('[data-ui="summary-money"]')).toHaveAttribute('data-end', String(c.game.moneyCents));
    expect(c.game.moneyCents).toBe(6000);
    expect(await summary(page).textContent()).not.toContain('⟦');   // жодного ключа без тексту

    // Цілі ≥ 44 px; обидві кнопки в межах екрана (після прокрутки діалогу).
    const buttons = summary(page).locator('button');
    expect(await buttons.count()).toBe(2);
    for (const b of await buttons.all()) {
      await b.scrollIntoViewIfNeeded();
      const r = await b.boundingBox();
      if (!r) throw new Error('кнопки не видно');
      expect(r.width).toBeGreaterThanOrEqual(44);
      expect(r.height).toBeGreaterThanOrEqual(44);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(mode.viewport.width);
    }
    // axe на самому діалозі: заголовок, контраст, імена кнопок. Порушень — 0 (і перевірок не 0, інакше нічого не міряли).
    const axe = await new AxeBuilder({ page }).include('[data-ui="summary"]').analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    expect(axe.passes.length).toBeGreaterThan(5);
    if (SHOTS && mode.touch) {
      mkdirSync(SHOTS, { recursive: true });
      await summary(page).evaluate((el) => { el.scrollTop = 0; });
      await page.screenshot({ path: `${SHOTS}/summary-${mode.viewport.width}x${mode.viewport.height}.png` });
    }

    // «Завершити сесію»: сейв записано, меню паузи з підтвердженням.
    const journalLen = c.journal.length;
    await press(summary(page).locator('[data-ui="summary-end"]'));
    await expect(summary(page)).toHaveCount(0);
    await expect(page.locator('[data-ui="pause"]')).toBeVisible();
    await expect(page.locator('[data-ui="status"]')).toContainText('Сесію збережено');

    // Перезавантаження: прогрес на місці (кінець дня, гроші, журнал), підсумок не нав'язується вдруге — гравець на мапі.
    await page.reload();
    await loaded();
    const after = await core(page);
    expect(after.game.campaignEnded).toBe(true);
    expect(after.game.moneyCents).toBe(6000);
    expect(after.game.flags).toContain('f.night-tent');
    expect(after.journal.length).toBe(journalLen);
    await expect(summary(page)).toHaveCount(0);
    await expect(page.locator('[data-ui="ended-hint"]')).toBeVisible();
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

test('«Продовжити» — назад на мапу: світ іде далі, шапка з підказкою кінця, фокус на полі гри (миша)', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto('/?seed=2');
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { saveLoaded: boolean } } }).__game?.probe.saveLoaded === true, null, { timeout: 30_000 });
  await page.locator('[data-touch="story"]').click();
  const click = async (sel: string): Promise<void> => { await panel(page).locator(sel).first().click(); await page.waitForTimeout(400); };
  await click('[data-act="create"]:has-text("Авто")');
  for (const [k, key] of [['complete', 'q.prologue-home-001'], ['complete', 'q.st-001'], ['complete', 'q.st-002'], ['visit', 'loc.shop'], ['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'],
    ['complete', 'q.st-003'], ['visit', 'loc.home'], ['complete', 'q.ch1-home-001'], ['visit', 'loc.road']] as const) await click(`[data-act="${k}"][data-key="${key}"]`);
  if (await panel(page).locator('[data-key="dlg.road-apples.box.c1"]').isVisible({ timeout: 400 }).catch(() => false)) {
    await click('[data-key="dlg.road-apples.box.c1"]');
    await click('[data-act="continue"]');
  }
  for (const [k, key] of [['complete', 'q.st-004'], ['visit', 'loc.camp.lake'], ['talk', 'npc.elise'], ['choose', 'dlg.elise-greeting.hello.c2'], ['continue', ''],
    ['choose', 'dlg.elise-greeting.spot.c1'], ['continue', ''], ['pickup', 'item.firewood'], ['complete', 'q.st-005']] as const) await click(`[data-act="${k}"][data-key="${key}"]`);
  await expect(summary(page)).toBeVisible();
  await summary(page).locator('[data-ui="summary-continue"]').click();
  await expect(summary(page)).toHaveCount(0);
  await expect(panel(page)).toHaveCount(0);
  await expect(page.locator('[data-ui="ended-hint"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('stage');
  const read = () => page.evaluate(() => (window as unknown as { __game: { read: () => { clock: { paused: boolean; minutes: number } } } }).__game.read().clock);
  expect((await read()).paused).toBe(false);
  const m0 = (await read()).minutes;
  await expect.poll(async () => (await read()).minutes, { timeout: 5_000 }).toBeGreaterThan(m0);   // час іде: мапа жива
  await ctx.close();
});
