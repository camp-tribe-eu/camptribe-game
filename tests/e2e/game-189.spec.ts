// GAME-189 · намет руками (OD-022): без вводу намет не ставиться; з вводом (розміщення + 4 удари по шкалі) справа «Намет» хвилі закривається ядром; підпис цілі й стрілка — на одне місце.
// Обидві орієнтації телефона. Знімки посередині забивання кілків — у scratchpad (шлях із AUDIT_SHOT_DIR або research/visual-audit-ігнор: за замовчуванням test-results).
import { expect, test, type Page } from '@playwright/test';
import { core, playTent, probe, route, walk } from './chapter-driver';

const CAMP = 'loc.camp.lake';
const SETTINGS_KEY = 'camplife.settings.v1';
const SHOTS = process.env.G189_SHOTS ?? 'test-results';
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
const pitchOutcome = async (page: Page): Promise<string> => {
  const w = (await core(page)).game.wave as { active: { tasks: Record<string, { outcome: string }> } | null; past: Record<string, Record<string, string>> } | undefined;
  return w?.active?.tasks['pitch-tent']?.outcome ?? w?.past['wave.ch1-day1-arrival']?.['pitch-tent'] ?? 'none';
};

for (const v of VIEWS) {
  test(`намет руками: без вводу не ставиться; з вводом — 4 кілки й справа «Намет» зроблена; підпис і стрілка збігаються — ${v.name}`, async ({ browser }) => {
    test.setTimeout(600_000);
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errors = await arriveInCamp(page);
    // 1) підпис цілі й стрілка — на одне місце: стрілка веде до task.pitch-tent, а рядок «Далі» каже «постав намет».
    await expect.poll(async () => (await probe(page)).fx.target, { timeout: 20_000, message: 'стрілка мусить вказувати ціль' }).toBe('task.pitch-tent');
    await expect(page.locator('[data-ui="next-hint"]')).toContainText(/намет/i);
    // 2) без вводу намет не ставиться: чекаємо, ядро не бачить «done», фаза автомата — idle.
    await page.waitForTimeout(4_000);
    expect(await pitchOutcome(page), 'без вводу намет не поставлено').toBe('open');
    expect((await probe(page)).tent.phase).toBe('idle');
    // 3) з вводом: дійти, дія (E чи кнопка), розмістити, 4 удари.
    const touch = true;
    const q = await probe(page);
    await walk(page, route('camp-lake', [q.playerX, q.playerY], 'task.pitch-tent'));
    await expect.poll(async () => (await probe(page)).nearObject, { timeout: 8_000 }).toBe('task.pitch-tent');
    await page.locator('[data-touch="interact"]').tap();
    await playTent(page, touch, async () => { await page.screenshot({ path: `${SHOTS}/g189-${v.side}.png` }); expect((await probe(page)).tent.pegs, 'мить знімка: два кілки забито').toBe(2); });
    await expect.poll(() => pitchOutcome(page), { timeout: 8_000, message: 'після 4 влучань ядро зарахувало справу' }).toBe('done');
    expect((await probe(page)).tent.phase).toBe('idle');
    expect(errors).toEqual([]);
    await ctx.close();
  });
}
