// GAME-178 · E/тап на авто вдома не їде, поки потрібна річ ще на полиці: локація лишається, HUD каже «Ще бракує: …».
// Негативний контроль (закон 1): без гейта в actOnMap (старий код) тап на авто показував «Куди їдемо?» і їхав — цей тест червонів би (локація стає не домом / підказки немає).
import { expect, test } from '@playwright/test';
import { core, installMenuObserver, loaded, menuSeen, playUntil, probe, route, walk } from './chapter-driver';

const VIEWS = [{ name: 'портрет', side: 'portrait', w: 390, h: 844 }, { name: 'ландшафт', side: 'landscape', w: 844, h: 390 }] as const;
const SETTINGS_KEY = 'camplife.settings.v1';

for (const v of VIEWS) {
  test(`авто вдома з річчю на полиці: дія не їде, підказка є — ${v.name}`, async ({ browser }) => {
    test.setTimeout(600_000);
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(([k]) => { try { localStorage.setItem(k as string, JSON.stringify({ textScale: 100, language: 'uk', hintSeen: true })); } catch { /* сховища немає */ } }, [SETTINGS_KEY] as const);
    await installMenuObserver(page);
    await page.goto('/?seed=7&mapFirst=1&intro=1');
    await loaded(page);
    const intro = page.locator('[data-ui="intro"]');
    for (let i = 0; i < 30 && (await intro.count()) > 0; i++) {
      const pick = page.locator('[data-act="create"]', { hasText: /Велосипед|Bike/ });
      if (await pick.count()) await pick.first().click(); else await page.locator('[data-ui="intro-next"]').click();
      await page.waitForTimeout(320);
    }
    // До пакування: крамниця зроблена, ST-003 завершено, активна CH1-HOME-001, гравець удома (авто з речами на полицях).
    await playUntil(page, v.side === 'landscape', [], (c) => c.game.quests['CH1-HOME-001']?.status === 'active' && c.game.player?.locationId === 'loc.home', () => menuSeen(page), 80);
    const before = await core(page);
    expect(before.game.player?.locationId).toBe('loc.home');
    // Підійти до авто (кільце не заповниться: нічого не покладено), потім E/тап.
    const at = await probe(page);
    await walk(page, route('home', [at.playerX, at.playerY], 'obj.vehicle'));
    await expect.poll(async () => (await probe(page)).nearObject, { timeout: 5_000 }).toBe('obj.vehicle');
    if (v.side === 'portrait') await page.locator('[data-touch="interact"]').tap();
    else { await page.keyboard.down('KeyE'); await page.waitForTimeout(200); await page.keyboard.up('KeyE'); }
    await expect(page.locator('[data-ui="depart-hint"]')).toContainText(/Ще бракує/, { timeout: 5_000 });
    await expect(page.locator('.ui-talk')).toHaveCount(0);   // рамки «Куди їдемо?» немає
    const after = await core(page);
    expect(after.game.player?.locationId, 'локація не змінилась').toBe('loc.home');
    expect(after.game.quests['CH1-HOME-001']?.status, 'пакування не завершено поїздкою').toBe('active');
    expect(errors).toEqual([]);
    await ctx.close();
  });
}
