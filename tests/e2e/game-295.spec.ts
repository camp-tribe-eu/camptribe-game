// GAME-295 · карта кемпінгу Мюллерталь: після «Продовжити подорож» (стан — кінець розділу 1, фікстура GAME-286) і поїздки дорогою в Мюллерталь сцена
// показує мапу 'mullerthal' (не табір біля озера), а господиня досяжна пішки. Мутація: mapKeyFor відкидає loc.camp.mullerthal на 'camp' → червоний.
// Знімки: GAME_SHOTS=1 → research/game-295/{390x844,932x430}.png (не на критичному шляху).
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { core, probe, route, walk } from './chapter-driver';
import { waitGameReady } from './ready';

const VIEWS = [{ name: 'портрет 390×844', file: '390x844', w: 390, h: 844 }, { name: 'ландшафт 932×430', file: '932x430', w: 932, h: 430 }] as const;
const SAVE = readFileSync(new URL('./fixtures/ch1-end.json', import.meta.url), 'utf8').trim();
const SETTINGS_KEY = 'camplife.settings.v1';

async function openPanel(page: Page): Promise<void> {
  if (await page.locator('[data-ui="story"]').isVisible().catch(() => false)) return;
  await page.locator('.ui-story-btn').click();
  await expect(page.locator('[data-ui="story"]')).toBeVisible();
  await page.waitForTimeout(500);   // «глухота» кнопок дій після відкриття (ACT_COOLDOWN_MS)
}
const act = (page: Page, a: string) => page.locator(`[data-ui="story"] [data-act="${a}"]`);

for (const v of VIEWS) {
  test(`Мюллерталь: мапа 'mullerthal' і досяжна господиня — ${v.name}`, async ({ browser }) => {
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
    // Сон → тизер → пауза → «Продовжити подорож» (як у game-286).
    await openPanel(page);
    await act(page, 'sleep').click();
    await expect(page.locator('[data-ui="episode"]')).toBeVisible({ timeout: 15_000 });
    await page.locator('[data-ui="episode-skip"]').click();
    await expect(page.locator('[data-ui="pause"]')).toBeVisible();
    await page.locator('[data-ui="resume"]').click();
    await openPanel(page);
    await act(page, 'chapter').click();
    expect((await core(page)).game.quests['CH2-ARRIVAL-001']?.status).toBe('active');
    // Дорога → Мюллерталь: поїздка кнопками ☰ (Visit loc.camp.mullerthal).
    for (const loc of ['loc.camp.mullerthal']) {
      await openPanel(page);
      const btn = page.locator(`[data-ui="story"] button[data-key="${loc}"]`).first();
      await expect(btn, `у ☰ є поїздка ${loc}`).toBeVisible();
      await page.waitForTimeout(700);   // «глухота» кнопок дій після відкриття ☰
      await btn.click();
      await expect.poll(async () => (await core(page)).game.player?.locationId, { timeout: 15_000 }).toBe(loc);
    }
    // Мапа сцени — у режимі «ногами» (?mapFirst=1): перезавантаження підхоплює автозбереження, гравець у Мюллерталі.
    await page.waitForTimeout(1500);
    await page.goto('/?seed=7&mapFirst=1');
    await waitGameReady(page);
    await page.locator('[data-ui="recovery-close"]').click({ timeout: 800 }).catch(() => undefined);
    expect((await core(page)).game.player?.locationId).toBe('loc.camp.mullerthal');
    await expect.poll(async () => (await probe(page)).map, { timeout: 15_000, message: 'сцена мусить показати мапу Мюллерталя, а не табір біля озера' }).toBe('mullerthal');
    await page.locator('.ui-story-btn').isVisible().catch(() => false);
    // Господиня досяжна пішки від точки появи.
    const p0 = await probe(page);
    const pts = route('mullerthal', [p0.playerX, p0.playerY], 'npc.host-mullerthal');
    expect(pts.length, 'маршрут до господині існує').toBeGreaterThan(1);
    await walk(page, pts);
    const m = JSON.parse(readFileSync('public/maps/mullerthal.tmj', 'utf8')) as { layers: { name: string; objects?: { name: string; x: number; y: number }[] }[] };
    const host = (m.layers.find((l) => l.name === 'objects')?.objects ?? []).find((o) => o.name === 'npc.host-mullerthal');
    const p1 = await probe(page);
    expect(Math.hypot(p1.playerX - (host?.x ?? 0), p1.playerY - (host?.y ?? 0)), 'герой підійшов до господині').toBeLessThan(48);
    expect((await probe(page)).map).toBe('mullerthal');
    if (process.env.GAME_SHOTS === '1') { await page.locator('[data-ui="recovery-close"]').click({ timeout: 2000 }).catch(() => undefined); await page.waitForTimeout(600); console.log(JSON.stringify((await probe(page)).view)); await page.screenshot({ path: `research/game-295/${v.file}.png` }); }
    expect(errors).toEqual([]);
    await ctx.close();
  });
}
