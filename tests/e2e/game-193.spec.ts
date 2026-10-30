// GAME-193 · риболовля на озері табору (OD-022): без вводу уловів нема (навіть із закидом — «зірвалась»); з вводом — закид, клювання, підсікання за зонд, улов; обидва вибори («відпустити» / «взяти на вечерю»)
// працюють. Обидві орієнтації телефона; знімки посеред підсікання — у scratchpad (G193_SHOTS).
import { expect, test, type Page } from '@playwright/test';
import { core, playFishing, probe, route, walk } from './chapter-driver';

const CAMP = 'loc.camp.lake';
const SETTINGS_KEY = 'camplife.settings.v1';
const SHOTS = process.env.G193_SHOTS ?? 'test-results';
const VIEWS = [{ side: 'portrait', w: 390, h: 844, name: 'портрет' }, { side: 'landscape', w: 844, h: 390, name: 'ландшафт' }] as const;
const panel = (page: Page) => page.locator('.ui-story');
async function act(page: Page, kind: string, key = ''): Promise<void> {
  await panel(page).locator(`[data-act="${kind}"][data-key="${key}"]`).click({ timeout: 5_000 });
  await page.waitForTimeout(400);
  if (kind === 'visit' && (key === 'loc.road' || key === 'loc.camp.lake')) {
    const dlg = panel(page).locator('[data-ui="dialogue"]');
    for (let i = 0; i < 6 && await dlg.isVisible({ timeout: 400 }).catch(() => false); i++) { await dlg.locator('[data-act]').last().click(); await page.waitForTimeout(400); }
  }
}
/** Приїзд у табір кнопками ☰ (це не те, що перевіряємо); далі мапа-перша гра: хвиля справ, розмова з Елізою — ногами, як у game-183. */
async function arriveInCamp(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(([k]) => { try { localStorage.setItem(k as string, JSON.stringify({ textScale: 100, language: 'uk', hintSeen: true })); } catch { /* сховища немає */ } }, [SETTINGS_KEY] as const);
  await page.goto('/?seed=7');
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { saveLoaded: boolean } } }).__game?.probe.saveLoaded === true, null, { timeout: 30_000 });
  await page.locator('[data-touch="story"]').click();
  await panel(page).locator('[data-act="create"]', { hasText: /Велосипед|Bike/ }).first().click();
  await page.waitForTimeout(400);
  for (const [k, key] of [['complete', 'q.prologue-home-001'], ['complete', 'q.st-001'], ['complete', 'q.st-002'], ['visit', 'loc.shop'], ['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'], ['complete', 'q.st-003'],
    ['visit', 'loc.home'], ['complete', 'q.ch1-home-001'], ['visit', 'loc.road'], ['complete', 'q.st-004'], ['visit', 'loc.camp.lake']] as const) await act(page, k, key);
  expect((await core(page)).game.player?.locationId).toBe(CAMP);
  await page.waitForTimeout(600);
  await page.goto('/?seed=7&mapFirst=1');
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { saveLoaded: boolean } } }).__game?.probe.saveLoaded === true, null, { timeout: 30_000 });
  await page.locator('[data-ui="recovery-close"]').click({ timeout: 800 }).catch(() => undefined);
  expect((await core(page)).game.player?.locationId, 'сейв підхопився: гравець у таборі').toBe(CAMP);
  return errors;
}


const fishOf = async (page: Page) => (await probe(page)).fish;
async function toShore(page: Page): Promise<void> {
  const q = await probe(page);
  await walk(page, route('camp-lake', [q.playerX, q.playerY], 'fish.shore'));
  await expect.poll(async () => { const p = await probe(page); const s = p.fish.spot; return Math.hypot(p.playerX - s.x, p.playerY - s.y) <= 36 && !p.playerMoving; }, { timeout: 8_000, message: 'герой мусить стати біля берега' }).toBe(true);
}

for (const v of VIEWS) {
  test(`риболовля: без вводу улову нема (закид без підсікання — «зірвалась»); з вводом — улов, обидва вибори — ${v.name}`, async ({ browser }) => {
    test.setTimeout(600_000);
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errors = await arriveInCamp(page);
    const touch = v.side === 'landscape';
    await toShore(page);
    // 1) без вводу: час іде, нічого не стається.
    await page.waitForTimeout(4_000);
    let f = await fishOf(page);
    expect(f.phase).toBe('idle'); expect(f.casts).toBe(0); expect(f.catches).toBe(0);
    // 2) закид без підсікання: клює, ми не торкаємось — «зірвалась», без штрафу й без улову.
    await page.waitForTimeout(450);
    if (touch) { const b = page.locator('[data-touch="interact"]'); await b.dispatchEvent('pointerdown', { pointerId: 7, pointerType: 'touch', isPrimary: true }); await page.waitForTimeout(500); await b.dispatchEvent('pointerup', { pointerId: 7, pointerType: 'touch', isPrimary: true }); }
    else { await page.keyboard.down('KeyE'); await page.waitForTimeout(500); await page.keyboard.up('KeyE'); }
    await expect.poll(async () => (await fishOf(page)).casts, { timeout: 3_000 }).toBe(1);
    await expect.poll(async () => (await fishOf(page)).slipped, { timeout: 9_000, message: 'без тапу вікно «клює» минає' }).toBe(1);
    f = await fishOf(page);
    expect(f.phase).toBe('idle'); expect(f.catches).toBe(0);
    // 3) з вводом: перший улов — відпустити.
    await playFishing(page, touch, 'release', async () => { await page.screenshot({ path: `${SHOTS}/g193-reel-${v.side}.png` }); expect((await fishOf(page)).phase, 'мить знімка: підсікання').toBe('reel'); });
    f = await fishOf(page);
    expect(f.released).toBe(1); expect(f.kept).toBe(0); expect(f.catches).toBe(1);
    // 4) другий улов — узяти на вечерю.
    await playFishing(page, touch, 'keep');
    f = await fishOf(page);
    expect(f.kept).toBe(1); expect(f.released).toBe(1); expect(f.catches).toBe(2);
    expect(errors).toEqual([]);
    await ctx.close();
  });
}
