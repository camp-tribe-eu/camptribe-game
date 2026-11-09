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
for (const v of VIEWS) {
  test(`кінець розділу 1 → «Продовжити подорож» (мапа Мюллерталя — окрема картка) — ${v.name}`, async ({ browser }) => {
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
    // 1) Сон у кінці розділу 1 → тизер → пауза (GAME-264) → ☰ → «Продовжити подорож» → CH2-ARRIVAL-001 активний.
    await openPanel(page);
    await act(page, 'sleep').click();
    await expect(page.locator('[data-ui="episode"]'), 'після сну — тизер розділу 2').toBeVisible({ timeout: 15_000 });
    await page.locator('[data-ui="episode-skip"]').click();
    await expect(page.locator('[data-ui="episode"]')).toHaveCount(0);
    await expect(page.locator('[data-ui="pause"]')).toBeVisible();
    await page.locator('[data-ui="resume"]').click();
    await openPanel(page);
    await expect(act(page, 'chapter'), 'після тизера ☰ пропонує «Продовжити подорож»').toHaveText(/Продовжити подорож|Continue the journey/);
    await act(page, 'chapter').click();
    c = await core(page);
    expect(c.game.quests['CH2-ARRIVAL-001']?.status).toBe('active');
    expect(c.game.campaignEnded, 'розділ 1 більше не «кінець»').toBe(false);
    // 2) Маркер розділу: дні розділу 2 рахуються від старту (сон кінця розділу 1 у них не входить).
    expect((c.game as unknown as { chapterStart?: number }).chapterStart, 'маркер старту розділу 2 поставлено').toBeGreaterThan(0);
    expect(c.game.quests['CH1-D3-HOME-001']?.status).toBe('completed');
    // Дорога в Мюллерталь, господиня й вибір місця на мапі — окрема картка (мапа Мюллерталя ще не намальована: mapKeyFor відкидає її на мапу озера); тут не перевіряються.
    if (process.env.GAME_SHOTS === '1') await page.screenshot({ path: `${SHOTS}/${v.side}-continue.png` });
    expect(errors).toEqual([]);
    await ctx.close();
  });
}
