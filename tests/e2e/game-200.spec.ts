// GAME-200 · «одна нитка»: (1) у журналі (☰) на всьому шляху дня 1 є ≥ 2 відкритих цілі (головна + нагорода близько / побічна), не більше 4;
// (2) у кінці дня — тизер «Завтра: …» у підсумку; (3) Атлас показує відсоток заповнення і він збігається з ядром. Обидві орієнтації: 390×844 і 844×390.
// Негативні контролі (закон 1): до персонажа цілей немає; дня без тизера (кінець розділу) тизера немає — перевіряє unit (nearest-reward.test.ts); тут — що рядок не порожній і видимий.
import { mkdirSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { waitGameReady } from './ready';

interface Core { game: { stickers?: string[]; flags: string[]; quests: Record<string, { status: string }> } }
const core = (page: Page): Promise<Core> => page.evaluate(() => (window as unknown as { __game: { read: () => Core } }).__game.read());
const panel = (page: Page) => page.locator('[data-ui="story"]');
const summary = (page: Page) => page.locator('[data-ui="summary"]');
const SHOTS = process.env.GAME200_SHOTS;
const VIEWS = [{ side: 'portrait', w: 390, h: 844 }, { side: 'landscape', w: 844, h: 390 }] as const;

for (const v of VIEWS) {
  test(`цілі журналу ≥ 2 протягом дня 1, тизер «Завтра…» і відсоток Атласу — ${v.side}`, async ({ browser }) => {
    test.setTimeout(240_000);
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/?seed=2');
    await waitGameReady(page);
    const press = async (loc: Locator): Promise<void> => { await loc.scrollIntoViewIfNeeded(); await loc.tap(); await page.waitForTimeout(400); };
    const rows = async (): Promise<string[]> => panel(page).locator('[data-ui="goal-row"]').evaluateAll((els) => els.map((e) => `${(e as HTMLElement).dataset.kind}|${e.textContent ?? ''}`));
    const act = async (kind: string, key = ''): Promise<void> => {
      const b = panel(page).locator(`[data-act="${kind}"][data-key="${key}"]`);
      if (!(await b.isVisible({ timeout: 5_000 }).catch(() => false))) throw new Error(`крок «${kind} ${key}»: кнопки немає`);
      await press(b);
      const dlg = panel(page).locator('[data-ui="dialogue"]');
      for (let i = 0; kind === 'visit' && key === 'loc.road' && i < 6 && await dlg.isVisible({ timeout: 400 }).catch(() => false); i++) await press(dlg.locator('[data-act]').last());
    };

    await press(page.locator('[data-touch="story"]'));
    expect(await rows(), 'до персонажа цілей немає').toEqual([]);   // негативний контроль
    await press(panel(page).locator('[data-act="create"]', { hasText: /Авто|Car/ }).first());
    let checked = 0;
    const steps = [['complete', 'q.prologue-home-001'], ['complete', 'q.st-001'], ['complete', 'q.st-002'], ['visit', 'loc.shop'], ['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'],
      ['complete', 'q.st-003'], ['visit', 'loc.home'], ['complete', 'q.ch1-home-001'], ['visit', 'loc.road'], ['complete', 'q.st-004'], ['visit', 'loc.camp.lake'], ['talk', 'npc.elise'],
      ['choose', 'dlg.elise-greeting.hello.c2'], ['continue', ''], ['choose', 'dlg.elise-greeting.spot.c1'], ['continue', ''], ['pickup', 'item.firewood']] as const;
    for (const [k, key] of steps) {
      await act(k, key);
      if (await panel(page).locator('[data-ui="dialogue"]').count() > 0) continue;   // посеред розмови цілі не показуємо — світ мовчить
      const r = await rows();
      expect(r.length, `після «${k} ${key}»: цілі ${JSON.stringify(r)}`).toBeGreaterThanOrEqual(2);
      expect(r.length).toBeLessThanOrEqual(4);
      expect(r.some((x) => x.startsWith('main|')) && r.some((x) => x.startsWith('reward|') || x.startsWith('side|')), `головна + друга ціль: ${JSON.stringify(r)}`).toBe(true);
      expect(r.join(' ')).not.toContain('⟦');
      checked++;
    }
    expect(checked, 'перевірено на більшості кроків шляху').toBeGreaterThanOrEqual(10);
    if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await panel(page).evaluate((el) => { el.scrollTop = 0; }); await page.screenshot({ path: `${SHOTS}/goals-${v.side}.png` }); }

    // Кінець дня 1: тизер видно; рядок із i18n, не ключ.
    await act('complete', 'q.st-005');
    await expect(summary(page)).toBeVisible();
    const tomorrow = summary(page).locator('[data-ui="summary-tomorrow"]');
    await expect(tomorrow).toBeVisible();
    await expect(tomorrow).toContainText('Завтра:');
    expect((await tomorrow.textContent()) ?? '').not.toContain('sum.tomorrow');
    const box = await tomorrow.boundingBox();
    if (!box) throw new Error('тизера не видно');
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(v.w);
    expect(box.y + box.height, 'тизер у межах екрана без прокрутки').toBeLessThanOrEqual(v.h);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/teaser-${v.side}.png` });
    await press(summary(page).locator('[data-ui="summary-continue"]'));

    // Атлас: відсоток на екрані = відсоток за ядром.
    await press(page.locator('[data-touch="story"]'));
    await press(page.locator('[data-ui="atlas-open"]'));
    const fill = page.locator('[data-ui="atlas-fill"]');
    await expect(fill).toBeVisible();
    const c = await core(page);
    const owned = (c.game.stickers ?? []).filter((s) => s !== 'sticker.henry-postcard').length;
    const first = page.locator('[data-ui="atlas-page-fill"][data-page="ch1"]');
    await expect(first).toHaveAttribute('data-have', String(owned));
    const total = Number(await first.getAttribute('data-total'));
    await expect(first).toHaveAttribute('data-pct', String(Math.floor((owned * 100) / total)));
    expect(owned).toBeGreaterThan(0);
    expect(owned).toBeLessThan(total);
    await expect(first).toHaveAttribute('data-done', 'no');   // сторінка не повна → нагороди немає
    await expect(first).toContainText('%');
    await fill.scrollIntoViewIfNeeded();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/atlas-fill-${v.side}.png` });
    expect(errors).toEqual([]);
    await ctx.close();
  });
}
