// GAME-106 · підсумок дня після кінця дня 1 (ST-005): лише факти, «Продовжити» / «Завершити сесію». Дотиком на 390×844 і
// 844×390, мишею на 1280×800. Кожна дія — справжній клік (дотик), команда йде в ядро; факти підсумку звіряємо з ядром (window.__game).
// «Завершити сесію» → перезавантаження → прогрес на місці, підсумок не нав'язується вдруге. GAME-141: ST-005 — межа дня 1, а не
// кінець розділу; день 2 закінчується «Підсумком дня 2» і кінцем розділу (останній тест).
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
      // На дорозі з шансом — подія (GAME-31): відповідаємо, як гравець. GAME-108: на дорозі одна з десяти подій — з будь-якої виходимо останньою відповіддю (у подій дороги вона безумовна).
      const dlg = panel(page).locator('[data-ui="dialogue"]');
      for (let i = 0; kind === 'visit' && key === 'loc.road' && i < 6 && await dlg.isVisible({ timeout: 400 }).catch(() => false); i++) await press(dlg.locator('[data-act]').last());
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
    expect(c.game.campaignEnded).toBe(false);                       // GAME-141: межа дня 1 — розділ триває
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
    // GAME-108: подій на дорозі десять — назва та, що в журналі ядра.
    if (hadEvent) expect(await keys('events')).toEqual(c.journal.filter((e) => e.type === 'RoadEvent').map((e) => `${String(e.ref)}.title`));
    // Гроші: 50 € на старті (START_MONEY_CENTS) + 10 € за «Прибуття» (ST-005) — і в ядрі те саме.
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
    expect(after.game.campaignEnded).toBe(false);
    expect(after.game.moneyCents).toBe(6000);
    expect(after.game.flags).toContain('f.night-tent');
    expect(after.journal.length).toBe(journalLen);
    await expect(summary(page)).toHaveCount(0);
    await expect(page.locator('[data-ui="ended-hint"]')).toHaveCount(0);   // GAME-141: кінця розділу ще немає — попереду день 2
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

test('«Продовжити» — назад на мапу; день 2 до «Підсумку дня 2», день 3 до «Підсумку дня 3» і кінця розділу (GAME-144); світ іде далі, фокус на полі гри (миша)', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto('/?seed=2');
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { saveLoaded: boolean } } }).__game?.probe.saveLoaded === true, null, { timeout: 30_000 });
  await page.locator('[data-touch="story"]').click();
  const click = async (sel: string): Promise<void> => { await panel(page).locator(sel).first().click(); await page.waitForTimeout(400); };
  await click('[data-act="create"]:has-text("Авто")');
  for (const [k, key] of [['complete', 'q.prologue-home-001'], ['complete', 'q.st-001'], ['complete', 'q.st-002'], ['visit', 'loc.shop'], ['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'],
    ['complete', 'q.st-003'], ['visit', 'loc.home'], ['complete', 'q.ch1-home-001'], ['visit', 'loc.road']] as const) await click(`[data-act="${k}"][data-key="${key}"]`);
  // GAME-108: на дорозі одна з десяти подій — з будь-якої виходимо останньою відповіддю (у подій дороги вона безумовна).
  for (let i = 0; i < 6 && await panel(page).locator('[data-ui="dialogue"]').isVisible({ timeout: 400 }).catch(() => false); i++) await click('[data-ui="dialogue"] [data-act] >> nth=-1');
  for (const [k, key] of [['complete', 'q.st-004'], ['visit', 'loc.camp.lake'], ['talk', 'npc.elise'], ['choose', 'dlg.elise-greeting.hello.c2'], ['continue', ''],
    ['choose', 'dlg.elise-greeting.spot.c1'], ['continue', ''], ['pickup', 'item.firewood'], ['complete', 'q.st-005']] as const) await click(`[data-act="${k}"][data-key="${key}"]`);
  await expect(summary(page)).toBeVisible();
  await expect(summary(page).locator('h2')).toHaveText('Підсумок дня 1');
  await summary(page).locator('[data-ui="summary-continue"]').click();
  await expect(summary(page)).toHaveCount(0);
  await expect(page.locator('[data-ui="ended-hint"]')).toHaveCount(0);   // GAME-141: після дня 1 розділ триває
  // День 2 (GAME-141): ранок → «Доброго ранку!» → табірний день (вечеря) → вечір біля вогнища.
  await page.locator('[data-touch="story"]').click();
  for (const [k, key] of [['complete', 'q.ch1-d2-001'], ['talk', 'npc.elise'], ['choose', 'dlg.elise-greeting.hello.c11'], ['choose', 'dlg.elise-greeting.morning.c2'], ['continue', ''],
    ['complete', 'q.ch1-d2-elise-001'], ['talk', 'npc.elise'], ['choose', 'dlg.elise-greeting.hello.c14'], ['choose', 'dlg.elise-greeting.dinner.c1'], ['continue', ''], ['continue', ''],
    ['complete', 'q.ch1-d2-camp-001']] as const) await click(`[data-act="${k}"][data-key="${key}"]`);
  await expect(summary(page)).toHaveCount(0);                                // контроль: до межі дня 2 підсумку немає
  await click('[data-act="complete"][data-key="q.ch1-d2-fire-001"]');
  await expect(summary(page)).toBeVisible();
  await expect(summary(page).locator('h2')).toHaveText('Підсумок дня 2');
  expect(await summary(page).locator('[data-kind="quests"] li').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.key)))
    .toEqual(['q.ch1-d2-001', 'q.ch1-d2-elise-001', 'q.ch1-d2-camp-001', 'q.ch1-d2-fire-001']);
  await expect(summary(page).locator('[data-kind="packed"]')).toHaveCount(0);   // пакування дня 1 не повторюється
  expect(await summary(page).textContent()).not.toContain('⟦');
  await summary(page).locator('[data-ui="summary-continue"]').click();
  await expect(summary(page)).toHaveCount(0);
  await expect(panel(page)).toHaveCount(0);
  await expect(page.locator('[data-ui="ended-hint"]')).toHaveCount(0);   // GAME-144: після дня 2 розділ триває — попереду день 3
  // День 3 (GAME-144): ранок → речі → прощання з Елізою → дорога → дім; «Підсумок дня 3» — і лише тоді кінець розділу.
  await page.locator('[data-touch="story"]').click();
  await click('[data-act="complete"][data-key="q.ch1-d3-001"]');
  // ?seed=2: день 0 сонячний — спорядження сухе й ціле: нейтральна сцена, «висушити» немає (R1-04).
  await expect(panel(page).locator('[data-ui="quest"]', { hasText: 'Збираємо речі' })).toContainText('усе сухе й ціле');
  await expect(panel(page).locator('[data-act="dry"]')).toHaveCount(0);
  for (const [k, key] of [['complete', 'q.ch1-d3-gear-001'], ['talk', 'npc.elise'], ['choose', 'dlg.elise-greeting.hello.c15'], ['continue', ''],
    ['choose', 'dlg.elise-greeting.goodbye.c1'], ['continue', ''], ['continue', ''], ['complete', 'q.ch1-d3-elise-001'], ['visit', 'loc.road']] as const) await click(`[data-act="${k}"][data-key="${key}"]`);
  for (let i = 0; i < 6 && await panel(page).locator('[data-ui="dialogue"]').isVisible({ timeout: 400 }).catch(() => false); i++) await click('[data-ui="dialogue"] [data-act] >> nth=-1');
  for (const [k, key] of [['complete', 'q.ch1-d3-return-001'], ['visit', 'loc.home']] as const) await click(`[data-act="${k}"][data-key="${key}"]`);
  await expect(summary(page)).toHaveCount(0);                                // контроль: до межі дня 3 підсумку немає
  await click('[data-act="complete"][data-key="q.ch1-d3-home-001"]');
  await expect(summary(page)).toBeVisible();
  await expect(summary(page).locator('h2')).toHaveText('Підсумок дня 3');
  expect(await summary(page).locator('[data-kind="quests"] li').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.key)))
    .toEqual(['q.ch1-d3-001', 'q.ch1-d3-gear-001', 'q.ch1-d3-elise-001', 'q.ch1-d3-return-001', 'q.ch1-d3-home-001']);
  expect(await summary(page).textContent()).not.toContain('⟦');
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
