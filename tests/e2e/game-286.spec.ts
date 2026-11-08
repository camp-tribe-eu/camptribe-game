// GAME-286 · розділ 2: після кінця розділу 1 «Продовжити подорож» запускає CH2-ARRIVAL-001; дорога в Мюллерталь, господиня, вибір місця.
// Стан — справжній кінець розділу 1 (tests/e2e/fixtures/ch1-end.json, збирає ядро: src/content/ch2-arrival.test.ts, G286_WRITE=1). Обидві орієнтації.
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { core } from './chapter-driver';
import { waitGameReady } from './ready';

const VIEWS = [{ name: 'портрет 390×844', side: 'portrait', w: 390, h: 844 }, { name: 'ландшафт 932×430', side: 'landscape', w: 932, h: 430 }] as const;
const SAVE = readFileSync(new URL('./fixtures/ch1-end.json', import.meta.url), 'utf8').trim();
const SETTINGS_KEY = 'camplife.settings.v1';
const SHOTS = 'research/game-286';

async function openPanel(page: Page): Promise<void> {
  if (await page.locator('[data-ui="story"]').isVisible().catch(() => false)) return;
  await page.locator('.ui-story-btn').click();
  await expect(page.locator('[data-ui="story"]')).toBeVisible();
  await page.waitForTimeout(500);   // «глухота» кнопок дій після відкриття (ACT_COOLDOWN_MS)
}
const act = (page: Page, a: string, key?: string) => page.locator(`[data-ui="story"] [data-act="${a}"]${key ? `[data-key="${key}"]` : ''}`);
/** Відповідь у розмові за текстом (рамка `.ui-talk`, а за відсутності — панель). */
async function answer(page: Page, re: RegExp): Promise<void> {
  const box = page.locator('.ui-talk [data-act], [data-ui="story"] [data-ui="dialogue"] [data-act]').filter({ hasText: re }).first();
  await box.click({ timeout: 5_000 });
  await page.waitForTimeout(450);
}

for (const v of VIEWS) {
  test(`кінець розділу 1 → «Продовжити подорож» → Мюллерталь → господиня → місце — ${v.name}`, async ({ browser }) => {
    test.setTimeout(240_000);
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(([k]) => { try { localStorage.setItem(k as string, JSON.stringify({ textScale: 100, language: 'uk', hintSeen: true })); } catch { /* сховища немає */ } }, [SETTINGS_KEY] as const);
    await page.goto('/?seed=7');
    await waitGameReady(page);
    await page.evaluate((json) => new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('camplife', 1);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => { const tx = req.result.transaction('saves', 'readwrite'); tx.objectStore('saves').put(json, 'main'); tx.oncomplete = () => { req.result.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
    }), SAVE);
    await page.goto('/?seed=7');
    await waitGameReady(page);
    await page.locator('[data-ui="recovery-close"]').click({ timeout: 800 }).catch(() => undefined);
    let c = await core(page);
    expect(c.game.quests['CH1-D3-HOME-001']?.status, 'сейв кінця розділу 1 підхопився').toBe('completed');
    expect(c.game.quests['CH2-ARRIVAL-001'], 'розділ 2 ще не почато').toBeUndefined();
    // 1) «Продовжити подорож» → CH2-ARRIVAL-001 активний, Мюллерталь відкрито.
    await openPanel(page);
    await act(page, 'chapter').click();
    c = await core(page);
    expect(c.game.quests['CH2-ARRIVAL-001']?.status).toBe('active');
    await expect(act(page, 'chapter'), 'дія зникає після запуску').toHaveCount(0);
    // 2) Дорога → Мюллерталь (ціль «доїхати» зараховано), печатка лише тепер.
    await openPanel(page);
    if (await act(page, 'visit', 'loc.camp.mullerthal').count() === 0) { await act(page, 'visit', 'loc.road').click(); await openPanel(page); }
    await act(page, 'visit', 'loc.camp.mullerthal').click();
    await expect.poll(async () => (await core(page)).game.player?.locationId, { timeout: 20_000 }).toBe('loc.camp.mullerthal');
    expect((await core(page)).game.quests['CH2-ARRIVAL-001']?.status).toBe('active');
    // 3) Господиня: вітання → вибір місця біля струмка.
    await openPanel(page);
    await act(page, 'talk', 'npc.host-mullerthal').click();
    await answer(page, /Дорога була чудова/);
    await answer(page, /Біля струмка/);
    if (process.env.GAME_SHOTS === '1') await page.screenshot({ path: `${SHOTS}/${v.side}-host.png` });
    c = await core(page);
    expect(c.game.flags).toContain('f.ch2-spot-stream');
    await page.locator('.ui-talk [data-act="continue"], [data-ui="story"] [data-act="continue"]').first().click({ timeout: 5_000 }).catch(() => undefined);
    // 4) Усі цілі виконано — крок «Інший кордон» завершується, далі прогулянка.
    await openPanel(page);
    await act(page, 'complete', 'CH2-ARRIVAL-001').click().catch(async () => { await page.locator('[data-ui="story"] [data-act="complete"]').first().click(); });
    c = await core(page);
    expect(c.game.quests['CH2-ARRIVAL-001']?.status).toBe('completed');
    expect(c.game.quests['CH2-D1-WALK-001']?.status).toBe('active');
    expect(errors).toEqual([]);
    await ctx.close();
  });
}
