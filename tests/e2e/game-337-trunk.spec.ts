// GAME-337 · «Багажник» у звичайній грі, речі лишились: екран «Не влазить: що лишимо вдома?» — з кнопками на ПЕРШОМУ екрані (раніше ☰ на 2,9 екрана, кнопки на 1400-му px); коли зайве лишили — «Куди їдемо?» рамкою, не порожня ☰.
// Мутації, що червонять файл: прибрати розкладку «Не влазить» у StoryPanel (ранній return) · прибрати story(false) в ефекті sawOverflow (Shell).
// Знімки — лише за GAME332_SHOTS=1 (research/game-332/).
import { expect, test, type Page } from '@playwright/test';
import { walkIntro } from './intro-walk';
import { core, installMenuObserver, loaded, menuSeen, playUntil, pressInteract, probe, route, takeFromOpenBox, walk } from './chapter-driver';

const SETTINGS_KEY = 'camplife.settings.v1';
const SOLO = ['box.nightstand', 'box.wardrobe', 'box.fridge', 'box.storeroom'];
const FAMILY = [...SOLO, 'box.mia'];

async function startHome(page: Page, solo: boolean, touch: boolean): Promise<void> {
  await page.addInitScript(([k]) => { try { localStorage.setItem(k as string, JSON.stringify({ textScale: 100, language: 'uk', hintSeen: true })); } catch { /* сховища немає */ } }, [SETTINGS_KEY] as const);
  await installMenuObserver(page);
  await page.goto(`/?seed=7&mapFirst=1&intro=1${solo ? '&soloHero=1' : ''}`);
  await loaded(page);
  await walkIntro(page, solo ? /Велосипед|Bike/ : /Кішка|Cat/);
  await playUntil(page, touch, [], (c) => c.game.quests['CH1-HOME-001']?.status === 'active' && c.game.player?.locationId === 'loc.home', () => menuSeen(page), 80);
}

/** Узяти УСЕ з усіх контейнерів (як жадібний гравець): речей більше, ніж влізе. */
async function takeEverything(page: Page, boxes: readonly string[], touch: boolean): Promise<void> {
  for (const spot of boxes) {
    const at = await probe(page);
    await walk(page, route('home', [at.playerX, at.playerY], spot));
    await expect.poll(async () => (await probe(page)).nearObject, { timeout: 5_000, message: `біля ${spot}` }).toBe(spot);
    await pressInteract(page, touch);
    await takeFromOpenBox(page, touch, 'all');
  }
}

/** Підійти до авто з повною сумкою: відкривається «Багажник». */
async function toTrunk(page: Page): Promise<void> {
  const at = await probe(page);
  await walk(page, route('home', [at.playerX, at.playerY], 'obj.vehicle'));
  await expect(page.locator('[data-ui="minigame"] [data-ui="mg-start"]'), 'біля авто з сумкою відкрилась міні-гра').toBeVisible({ timeout: 10_000 });
}

/**
 * Повільна машина (CI): відкладені ефекти оболонки (Preact виконує їх «після кадру» через setTimeout) запізнюються, і наступний кадр гри встигає раніше за них.
 * Саме так після «Багажника» замість «Куди їдемо?» відкривалась ☰ (а «Не влазить» губилось). Тут це запізнення — навмисне й однакове щоразу; повертає «як було».
 */
async function slowEffects(page: Page, ms: number): Promise<() => Promise<void>> {
  await page.evaluate((ms) => {
    const w = window as unknown as { __st?: typeof setTimeout; setTimeout: unknown };
    const st = window.setTimeout.bind(window);
    w.__st = st as typeof setTimeout;
    w.setTimeout = (fn: TimerHandler, d = 0, ...a: unknown[]): number => st(fn, d + ms, ...a);
  }, ms);
  return () => page.evaluate(() => { const w = window as unknown as { __st?: typeof setTimeout; setTimeout: unknown }; if (w.__st) w.setTimeout = w.__st; });
}

for (const [name, vp, solo, boxes] of [['portrait', { width: 390, height: 844 }, true, SOLO], ['landscape', { width: 932, height: 430 }, false, FAMILY]] as const) {
test(`речі лишились: «Не влазить» — кнопки на першому екрані, після останньої — «Куди їдемо?» — ${name} ${vp.width}×${vp.height}`, async ({ browser }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  const ctx = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await startHome(page, solo, true);
  await takeEverything(page, boxes, true);
  await toTrunk(page);
  await page.locator('[data-ui="mg-start"]').tap();
  await page.locator('[data-ui="mg-pause"]').tap();
  await page.locator('[data-ui="mg-move-on"]').tap();
  await expect(page.locator('[data-ui="mg-result"]')).toHaveAttribute('data-outcome', 'scrappy');
  const restore = await slowEffects(page, 400);
  await page.locator('[data-ui="mg-close"]').tap();
  const overflow = page.locator('[data-ui="pack-overflow"]');
  await expect(overflow, 'екран «Не влазить»').toBeVisible({ timeout: 10_000 });
  await restore();
  const vh = (page.viewportSize() as { height: number }).height;
  const first = page.locator('[data-ui="pack-overflow"] [data-act="leave"]').first();
  const b = await first.boundingBox();
  expect(b && b.y + b.height <= vh, 'перша кнопка «Лишити вдома» — на першому екрані').toBe(true);
  if (name === 'portrait') expect(await page.locator('.ui-story').evaluate((e) => e.scrollHeight - e.clientHeight), 'екран без прокрутки').toBeLessThanOrEqual(1);
  await expect(page.locator('[data-act="load"]'), 'кнопки «Завантажити речі», що мовчить, нема').toHaveCount(0);
  const buttons = page.locator('[data-ui="pack-overflow"] [data-act="leave"]');
  for (let i = 0; i < 20 && (await buttons.count()) > 0; i++) { await buttons.first().click(); await page.waitForTimeout(450); }
  expect((await core(page)).game.flags.filter((f) => f.startsWith('f.take-')), 'сумка порожня').toEqual([]);
  await expect(page.locator('.ui-talk [data-ui="dialogue"] [data-act="visit"]').first(), 'після останнього — рамка «Куди їдемо?»').toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.ui-story'), '☰ закрилась').toHaveCount(0);
  await playUntil(page, true, [], (k) => k.game.player?.locationId === 'loc.road', () => menuSeen(page), 30);
  expect(errors).toEqual([]);
  await ctx.close();
});
}
