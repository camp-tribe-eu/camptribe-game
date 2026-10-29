// GAME-183 · розділ 1 з НОВОЇ ГРИ (вступ увімкнено): вступ → дім → крамниця → дім (пакування) → дорога з подіями й справами → приїзд у табір — ☰ жодного разу не відкрита
// (спостерігач DOM). Друга половина — від табору до кінця розділу — tests/e2e/game-183.spec.ts. Обидві орієнтації: 390×844 і 844×390. Знімки дороги → research/visual-audit/.
import { expect, test } from '@playwright/test';
import { core, installMenuObserver, loaded, menuSeen, playUntil, probe } from './chapter-driver';

const VIEWS = [{ name: 'портрет', side: 'portrait', w: 390, h: 844 }, { name: 'ландшафт', side: 'landscape', w: 844, h: 390 }] as const;
const SETTINGS_KEY = 'camplife.settings.v1';

for (const v of VIEWS) {
  test(`нова гра: вступ → дім → крамниця → дорога → табір без ☰ — ${v.name}`, async ({ browser }) => {
    test.setTimeout(1_200_000);
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(([k]) => { try { localStorage.setItem(k as string, JSON.stringify({ textScale: 100, language: 'uk', hintSeen: true })); } catch { /* сховища немає */ } }, [SETTINGS_KEY] as const);
    await installMenuObserver(page);
    await page.goto('/?seed=7&mapFirst=1&intro=1');
    await loaded(page);
    // Вступ: лише «Далі» й вибір героя (соло, велосипед) — ☰ не потрібна.
    const intro = page.locator('[data-ui="intro"]');
    await expect(intro).toBeVisible();
    for (let i = 0; i < 30 && (await intro.count()) > 0; i++) {
      const pick = page.locator('[data-act="create"]', { hasText: /Велосипед|Bike/ });
      if (await pick.count()) await pick.first().click(); else await page.locator('[data-ui="intro-next"]').click();
      await page.waitForTimeout(320);
    }
    await expect(intro).toHaveCount(0);
    expect((await core(page)).game.player?.locationId).toBe('loc.home');
    const log: string[] = [];
    // До дороги: дім → крамниця → дім → виїзд.
    await playUntil(page, v.side === 'landscape', log, (c) => c.game.player?.locationId === 'loc.road', () => menuSeen(page), 80);
    await expect(page.locator('[data-ui="goal"]')).toBeVisible();
    await expect.poll(async () => (await probe(page)).fx.target, { timeout: 15_000 }).not.toBeNull();
    // Подія в дорозі (шанс) може відкрити розмову — знімок після неї: смуга дороги із ціллю й стрілкою.
    for (let i = 0; i < 6 && (await page.locator('.ui-talk').count()) > 0; i++) { await page.locator('.ui-talk [data-act]').last().click(); await page.waitForTimeout(500); }
    await page.locator('[data-ui="recovery-close"]').click({ timeout: 1_000 }).catch(() => undefined);   // нагадування про збереження — не частина кадру
    await expect.poll(async () => (await probe(page)).fx.guide, { timeout: 15_000 }).not.toBe('none');
    await expect(page.locator('[data-ui="title-up"]')).toHaveCount(0, { timeout: 60_000 });   // банер звання — лише кілька ігрових хвилин
    await page.screenshot({ path: `research/visual-audit/road-goal-arrow-${v.side}.png` });
    // Дорога: справи зупинки, крок «У дорогу», авто → у табір.
    await playUntil(page, v.side === 'landscape', log, (c) => c.game.player?.locationId === 'loc.camp.lake', () => menuSeen(page), 60);
    const c = await core(page);
    for (const q of ['PROLOGUE-HOME-001', 'ST-001', 'ST-002', 'ST-003', 'CH1-HOME-001', 'ST-004']) expect(c.game.quests[q]?.status, `${q} завершено ногами`).toBe('completed');
    expect(await menuSeen(page), `панель ☰ ні разу не відкривалась (кроки: ${log.join(' → ')})`).toEqual([]);
    expect(errors).toEqual([]);
    await ctx.close();
  });
}
