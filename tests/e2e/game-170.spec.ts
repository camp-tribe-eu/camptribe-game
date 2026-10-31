// GAME-170 зріз 2 · хвиля W4 «Вечір на трьох фронтах» — грається: стартує сама на етапі вечері (CH1-D2-CAMP-001), три цілі на мапі,
// картка мети вгорі з ІГРОВИМИ хвилинами, вогнище читає наслідок дров (встигли → вогнище; ні → ліхтар), кінець розділу не чекає хвилі.
//  (a) сторч 390×844, клавіатура: усі три справи в строк → done, картка зникає, сцена гілкою fire;
//  (b) вбік 844×390, дотик: нічого не робимо → усі late, хвиля згасає сама (міряємо реальний час), сцена гілкою lantern, розділ завершено;
//  (c) негативні контролі (закон 1): ?hideUi=wave — картки немає; ?breakSpot=task.firewood — дотик до цілі нічого не шле.
// Розкладка — числами: картка в межах екрана, не перетинає ☰, ‖ і HUD; сторч — поле гри починається під карткою.
import { readFileSync } from 'node:fs';
import { expect, test, type Browser, type CDPSession, type Page } from '@playwright/test';
import { playFire } from './chapter-driver';
import { waitGameReady } from './ready';

interface Core { game: { campaignEnded: boolean; quests: Record<string, { status: string }>; flags: string[]; wave?: { active: { tasks: Record<string, { dueAt: number; outcome: string }> } | null; past: Record<string, Record<string, string>> } }; clock: { minutes: number }; journal: { type: string; ref: string | null }[] }
interface Probe { playerX: number; playerY: number; nearObject: string | null; commandsSent: number; cameraScrollX: number; cameraScrollY: number }
interface Rect { left: number; top: number; right: number; bottom: number; width: number; height: number }
const core = (page: Page): Promise<Core> => page.evaluate(() => (window as unknown as { __game: { read: () => Core } }).__game.read());
const probe = (page: Page): Promise<Probe> => page.evaluate(() => ({ ...(window as unknown as { __game: { probe: Probe } }).__game.probe }));
const panel = (page: Page) => page.locator('[data-ui="story"]');
const card = (page: Page) => page.locator('[data-ui="wave"]');
const rectOf = (page: Page, sel: string): Promise<Rect> => page.locator(sel).first().evaluate((el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; });
const meets = (a: Rect, b: Rect): boolean => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const WAVE = 'wave.ch1-day2-evening';
const SETTINGS_KEY = 'camplife.settings.v1';

/** Цілі з мапи (ноги об'єкта) — координати беремо з файлу, не з голови: зсунеться мапа — зсунеться й тест. */
const MAP = JSON.parse(readFileSync('public/maps/camp-lake.tmj', 'utf8')) as { layers: { objects?: { name: string; x: number; y: number }[] }[] };
const at = (name: string): { x: number; y: number } => {
  const o = MAP.layers.flatMap((l) => l.objects ?? []).find((n) => n.name === name);
  if (!o) throw new Error(`на мапі немає об'єкта ${name}`);
  return { x: o.x, y: o.y };
};

async function open(page: Page, query: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(([k]) => { try { localStorage.setItem(k, JSON.stringify({ textScale: 100, language: 'uk', hintSeen: true })); } catch { /* сховища немає */ } }, [SETTINGS_KEY] as const);
  await page.goto(`/${query}`);
  await waitGameReady(page);
  await page.locator('[data-touch="story"]').click();
  await expect(panel(page)).toBeVisible();
  return errors;
}
async function act(page: Page, kind: string, key = ''): Promise<void> {
  try { await panel(page).locator(`[data-act="${kind}"][data-key="${key}"]`).click({ timeout: 5_000 }); } catch { throw new Error(`крок «${kind} ${key}»: кнопки немає на екрані подорожі`); }
  await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії
  if (kind === 'visit' && key === 'loc.road') {
    const dlg = panel(page).locator('[data-ui="dialogue"]');
    for (let i = 0; i < 6 && await dlg.isVisible({ timeout: 400 }).catch(() => false); i++) { await dlg.locator('[data-act]').last().click(); await page.waitForTimeout(400); }
  }
}
/** День 1 велосипедистом (як story.spec) і ранок дня 2 до етапу вечері: CH1-D2-CAMP-001 стає активним останнім кліком. */
async function toEvening(page: Page): Promise<void> {
  await panel(page).locator('[data-act="create"]', { hasText: 'Велосипед' }).first().click();
  await page.waitForTimeout(400);
  for (const [k, key] of [['complete', 'q.prologue-home-001'], ['complete', 'q.st-001'], ['complete', 'q.st-002'], ['visit', 'loc.shop'], ['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'],
    ['complete', 'q.st-003'], ['visit', 'loc.home'], ['complete', 'q.ch1-home-001'], ['visit', 'loc.road'], ['complete', 'q.st-004'], ['visit', 'loc.camp.lake'],
    ['talk', 'npc.elise'], ['choose', 'dlg.elise-greeting.hello.c1'], ['continue', ''], ['continue', ''], ['choose', 'dlg.elise-greeting.spot.c1'], ['continue', ''],
    ['pickup', 'item.firewood'], ['complete', 'q.st-005']] as const) await act(page, k, key);
  await expect(page.locator('[data-ui="summary"] h2')).toHaveText('Підсумок дня 1');
  await page.locator('[data-ui="summary-continue"]').click();
  await expect(page.locator('[data-ui="summary"]')).toHaveCount(0, { timeout: 15_000 });
  await page.locator('[data-touch="story"]').click();
  for (const [k, key] of [['complete', 'q.ch1-d2-001'], ['talk', 'npc.elise'], ['choose', 'dlg.elise-greeting.hello.c11'], ['choose', 'dlg.elise-greeting.morning.c1'],
    ['choose', 'dlg.elise-greeting.advice.c1'], ['continue', ''], ['continue', ''], ['complete', 'q.ch1-d2-elise-001']] as const) await act(page, k, key);
  expect((await core(page)).game.quests['CH1-D2-CAMP-001']?.status).toBe('active');
}
/** Вечеря з Елізою (ціль CAMP-001), завершення етапу — відкривається етап вогнища. */
async function dinnerAndCamp(page: Page): Promise<void> {
  await page.locator('[data-touch="story"]').click();
  for (const [k, key] of [['talk', 'npc.elise'], ['choose', 'dlg.elise-greeting.hello.c14'], ['choose', 'dlg.elise-greeting.dinner.c2'], ['continue', ''], ['continue', ''], ['complete', 'q.ch1-d2-camp-001']] as const) await act(page, k, key);
  expect((await core(page)).game.quests['CH1-D2-FIRE-001']?.status).toBe('active');
  await panel(page).locator('[data-ui="story-close"]').click();
}
/** Сцена відкрита дотиком до вогнища: перша репліка (open) → далі — гілка fire чи lantern; догратись до кінця; завершити розділ. */
async function playFireplace(page: Page, branchText: string): Promise<void> {
  const dlg = panel(page).locator('[data-ui="dialogue"]');
  await expect(dlg).toBeVisible();
  await act(page, 'continue');
  await expect(dlg).toContainText(branchText);
  for (let i = 0; i < 20 && await dlg.isVisible({ timeout: 300 }).catch(() => false); i++) {
    const choices = dlg.locator('[data-act="choose"]');
    if (await choices.count()) await choices.last().click(); else await dlg.locator('[data-act="continue"]').click();
    await page.waitForTimeout(400);
  }
  await act(page, 'complete', 'q.ch1-d2-fire-001');
  await expect(page.locator('[data-ui="summary"] h2')).toHaveText('Підсумок дня 2');
  await page.locator('[data-ui="summary-continue"]').click();
  await expect(page.locator('[data-ui="summary"]')).toHaveCount(0, { timeout: 15_000 });
  // GAME-144: вогнище — межа дня 2; розділ триває (ранок дня 3), і на ньому режисер уже відкрив W5 «Не залишати слідів».
  const c = await core(page);
  expect(c.game.campaignEnded).toBe(false);
  expect(c.game.quests['CH1-D3-001']?.status).toBe('active');
  expect(Object.keys(c.game.wave?.active?.tasks ?? {}).sort()).toEqual(['clean-up', 'pack-tent', 'walk-site']);
}
/** Розкладка картки — числами: в екрані, не перетинає ☰, ‖, HUD; сторч — полотно гри починається під нею. */
async function cardLayout(page: Page, vp: { width: number; height: number }): Promise<void> {
  const c = await rectOf(page, '[data-ui="wave"]');
  expect(c.width).toBeGreaterThan(100);
  expect(c.left).toBeGreaterThanOrEqual(0);
  expect(c.right).toBeLessThanOrEqual(vp.width);
  expect(c.top).toBeGreaterThanOrEqual(0);
  expect(c.bottom).toBeLessThan(vp.height * 0.4);
  for (const sel of ['[data-touch="story"]', '[data-touch="pause"]', '[data-ui="hud"]']) expect(meets(c, await rectOf(page, sel)), `картка перетинає ${sel}`).toBe(false);
  if (vp.height > vp.width) {
    const canvas = await rectOf(page, '#stage canvas');
    expect(canvas.top, 'сторч: поле гри під карткою, не під нею').toBeGreaterThanOrEqual(c.bottom - 1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}
const KEY_CODE = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, KeyE: 69 } as const;
/** Клавіша тримається в самій сторінці (як story.spec.walkInPage), доки ціль не поруч чи координата не досягнута. */
async function walk(page: Page, key: keyof typeof KEY_CODE, axis: 'playerX' | 'playerY', target: number, near: string): Promise<void> {
  await page.evaluate(({ code, key, axis, target, near }) => new Promise<void>((resolve) => {
    const g = (window as unknown as { __game: { probe: { playerX: number; playerY: number; nearObject: string | null } } }).__game;
    const fire = (type: string): void => { const e = new KeyboardEvent(type, { key, code: key, bubbles: true, cancelable: true }); Object.defineProperty(e, 'keyCode', { get: () => code }); window.dispatchEvent(e); };
    const neg = key === 'ArrowLeft' || key === 'ArrowUp';
    const done = (): boolean => g.probe.nearObject === near || (neg ? g.probe[axis] <= target : g.probe[axis] >= target);
    const start = performance.now();
    const tick = (): void => { if (done() || performance.now() - start > 8_000) { fire('keyup'); setTimeout(resolve, 250); } else requestAnimationFrame(tick); };
    fire('keydown');
    requestAnimationFrame(tick);
  }), { code: KEY_CODE[key], key, axis, target, near });
}
/** Підійти до об'єкта клавіатурою: спершу по X, потім по Y (ліва галявина без стін між цілями), і натиснути E. */
async function goAndPress(page: Page, name: string): Promise<void> {
  const t = at(name);
  for (let i = 0; i < 3 && (await probe(page)).nearObject !== name; i++) {
    const p = await probe(page);
    if (Math.abs(p.playerX - t.x) > 12) await walk(page, p.playerX < t.x ? 'ArrowRight' : 'ArrowLeft', 'playerX', t.x, name);
    const q = await probe(page);
    if (q.nearObject !== name) await walk(page, q.playerY < t.y ? 'ArrowDown' : 'ArrowUp', 'playerY', t.y, name);
  }
  expect((await probe(page)).nearObject, `підійшов до ${name}`).toBe(name);
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(200);
  await page.keyboard.up('KeyE');
  await page.waitForTimeout(300);
}
const remaining = (c: Core): Record<string, number> => Object.fromEntries(Object.entries(c.game.wave?.active?.tasks ?? {}).map(([id, t]) => [id, t.dueAt - c.clock.minutes]));

test.describe('(a) сторч 390×844, клавіатура: усе встигли', () => {
  const VP = { width: 390, height: 844 };
  test.use({ viewport: VP, hasTouch: true, isMobile: true });
  test('хвиля стартує сама на етапі вечері; картка 0/3 → 3 done; пауза зупиняє строки; вогнище — гілка fire; розділ завершено', async ({ page }, info) => {
    test.setTimeout(240_000);
    const errors = await open(page, '?seed=5');
    await toEvening(page);
    // Хвиля вже відкрита ядром (режисер — на тому ж кліку), але картка видна лише на мапі: шапки під панеллю немає.
    const c0 = await core(page);
    expect(Object.keys(c0.game.wave?.active?.tasks ?? {}).sort()).toEqual(['cover-bikes', 'dinner', 'firewood']);
    expect(c0.journal.filter((e) => e.type === 'StartWave')).toHaveLength(0);   // StartWave — не запис журналу (не з переліку)
    await panel(page).locator('[data-ui="story-close"]').click();
    await expect(card(page)).toBeVisible();
    const t0 = Date.now();
    await expect(card(page)).toHaveAttribute('data-done', '0');
    await expect(card(page)).toHaveAttribute('data-total', '3');
    await expect(card(page).locator('[data-ui="wave-title"]')).toHaveText('Вечір на трьох фронтах · 0/3');
    const tasks = card(page).locator('[data-ui="wave-task"]');
    await expect(tasks).toHaveCount(3);
    for (const [id, min] of [['dinner', 45], ['firewood', 40], ['cover-bikes', 50]] as const) {
      const row = card(page).locator(`[data-task="${id}"]`);
      await expect(row).toHaveAttribute('data-outcome', 'open');
      expect(Number(await row.getAttribute('data-remaining'))).toBeLessThanOrEqual(min);
      expect(Number(await row.getAttribute('data-remaining'))).toBeGreaterThanOrEqual(min - 3);
      await expect(row).toContainText('хв');
    }
    await cardLayout(page, VP);
    await page.screenshot({ path: 'test-results/game-170-portrait-card.png' });

    // Пауза: строки стоять разом із годинником (різниця dueAt − minutes не змінюється за 2,5 с реального часу).
    await page.locator('[data-touch="pause"]').click();
    const paused0 = await core(page);
    await page.waitForTimeout(2_500);
    const paused1 = await core(page);
    expect(paused1.clock.minutes).toBe(paused0.clock.minutes);
    expect(remaining(paused1)).toEqual(remaining(paused0));
    await page.locator('[data-ui="resume"]').click();
    await expect(card(page)).toBeVisible();

    // Три цілі клавіатурою: дрова → велосипеди → стіл. Кожна — done у ядрі й на картці.
    const sent0 = (await probe(page)).commandsSent;
    await goAndPress(page, 'task.firewood');
    expect((await core(page)).game.wave?.active?.tasks['firewood']?.outcome).toBe('done');
    await expect(card(page).locator('[data-task="firewood"]')).toHaveAttribute('data-outcome', 'done');
    await expect(card(page)).toHaveAttribute('data-done', '1');
    await goAndPress(page, 'task.cover-bikes');
    expect((await core(page)).game.wave?.active?.tasks['cover-bikes']?.outcome).toBe('done');
    await goAndPress(page, 'task.dinner');
    const real = (Date.now() - t0) / 1000;
    const c1 = await core(page);
    expect(c1.game.wave?.active).toBeNull();
    expect(c1.game.wave?.past[WAVE]).toEqual({ dinner: 'done', firewood: 'done', 'cover-bikes': 'done' });
    expect((await probe(page)).commandsSent - sent0).toBe(3);
    await expect(card(page)).toHaveCount(0);
    expect(real, 'усі три справи клавіатурою — менше за найкоротший строк (40 ігрових хв ≈ 40 с)').toBeLessThan(40);
    info.annotations.push({ type: 'wave-real-seconds-all-done', description: real.toFixed(1) });
    console.log(`GAME-170 (a): три справи клавіатурою за ${real.toFixed(1)} с реального часу`);

    // Вечеря з Елізою, кінець етапу → вогнище на мапі відкриває сцену; дрова встигли → «Вогнище тихо потріскує».
    await dinnerAndCamp(page);
    await goAndPress(page, 'obj.campfire');
    await playFire(page, false);   // GAME-190: вогнище розпалюють руками (поліна → сірник), тоді вже вечір біля вогню
    await expect(panel(page)).toBeVisible({ timeout: 10_000 });
    await playFireplace(page, 'Вогнище тихо потріскує');
    expect(errors).toEqual([]);
  });
});

test.describe('(b) вбік 844×390, дотик: нічого не робимо', () => {
  const VP = { width: 844, height: 390 };
  test.use({ viewport: VP, hasTouch: true, isMobile: true });
  const touch = (cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0): Promise<unknown> => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  async function driveUntil(page: Page, cdp: CDPSession, dx: number, dy: number, until: (p: Probe) => boolean, maxMs = 10_000): Promise<void> {
    await touch(cdp, 'touchStart', 70, Math.round(VP.height * 0.5));
    await touch(cdp, 'touchMove', 70 + dx, Math.round(VP.height * 0.5) + dy);
    const start = Date.now();
    for (;;) { await page.waitForTimeout(16); if (until(await probe(page)) || Date.now() - start >= maxMs) break; }
    await touch(cdp, 'touchEnd');
    await page.waitForTimeout(120);
  }
  test('усі три late, хвиля згасає сама за ≈ 40–60 с реального часу; вогнище — гілка lantern; розділ усе одно завершено', async ({ browser }: { browser: Browser }, info) => {
    test.setTimeout(300_000);
    const ctx = await browser.newContext({ viewport: VP, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    const errors = await open(page, '?seed=5');
    await toEvening(page);
    await panel(page).locator('[data-ui="story-close"]').click();
    await expect(card(page)).toBeVisible();
    const t0 = Date.now();
    const m0 = (await core(page)).clock.minutes;
    await cardLayout(page, VP);
    await page.screenshot({ path: 'test-results/game-170-landscape-card.png' });
    // Чекаємо, нічого не роблячи: найдовший строк — 50 ігрових хв (велосипеди) → хвиля закінчується сама.
    await expect.poll(async () => (await core(page)).game.wave?.active === null, { timeout: 90_000, intervals: [500] }).toBe(true);
    const real = (Date.now() - t0) / 1000;
    const c1 = await core(page);
    expect(c1.game.wave?.past[WAVE]).toEqual({ dinner: 'late', firewood: 'late', 'cover-bikes': 'late' });
    expect(c1.clock.minutes - m0, 'ігрових хвилин минуло ≥ найдовшого строку').toBeGreaterThanOrEqual(50);
    expect(real).toBeGreaterThanOrEqual(30);
    expect(real).toBeLessThanOrEqual(75);   // ≈ 50 с за годинником гри + запас на повільний кадр CI
    info.annotations.push({ type: 'wave-real-seconds-ignored', description: real.toFixed(1) });
    console.log(`GAME-170 (b): хвиля згасла сама за ${real.toFixed(1)} с реального часу (${c1.clock.minutes - m0} ігрових хв)`);
    await expect(card(page)).toHaveCount(0);
    expect(c1.game.campaignEnded).toBe(false);

    // Вечеря, кінець етапу; до вогнища джойстиком, тап по ньому → сцена «Сьогодні без вогнища» (дрова спізнились).
    await dinnerAndCamp(page);
    const fire = at('obj.campfire');
    await driveUntil(page, cdp, -50, 0, (p) => p.playerX <= fire.x + 8);
    await driveUntil(page, cdp, 0, -50, (p) => p.nearObject === 'obj.campfire');
    for (let i = 0; i < 4 && (await probe(page)).nearObject !== 'obj.campfire'; i++) await driveUntil(page, cdp, 0, i % 2 === 0 ? 50 : -50, (p) => p.nearObject === 'obj.campfire', 2_000);
    expect((await probe(page)).nearObject).toBe('obj.campfire');
    // Кнопка дії (GAME-95) показує «вогнище» і дотик до неї відкриває сцену — як робить гравець на телефоні.
    await expect(page.locator('[data-touch="interact"]')).toHaveAttribute('data-target', 'fire');
    const b = await rectOf(page, '[data-touch="interact"]');
    await page.touchscreen.tap(b.left + b.width / 2, b.top + b.height / 2);
    await playFire(page, true);   // GAME-190: тап поклав перше полінце; далі поліна й сірник
    await expect(panel(page)).toBeVisible({ timeout: 10_000 });
    await playFireplace(page, 'Сьогодні без вогнища');
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

test.describe('(c) негативні контролі', () => {
  const VP = { width: 390, height: 844 };
  test.use({ viewport: VP, hasTouch: true, isMobile: true });
  test('?hideUi=wave — картки немає; ?breakSpot=task.firewood — E біля дров нічого не шле (тест (a) на цьому червоніє)', async ({ page }) => {
    test.setTimeout(240_000);
    await open(page, '?seed=5&hideUi=wave&breakSpot=task.firewood');
    await toEvening(page);
    await panel(page).locator('[data-ui="story-close"]').click();
    await page.waitForTimeout(500);
    expect((await core(page)).game.wave?.active).not.toBeNull();
    await expect(card(page)).toHaveCount(0);
    const sent0 = (await probe(page)).commandsSent;
    await goAndPress(page, 'task.firewood');
    expect((await probe(page)).commandsSent - sent0).toBe(0);
    expect((await core(page)).game.wave?.active?.tasks['firewood']?.outcome).toBe('open');
  });
});

// Картка хвилі не накриває жодного елемента керування: HUD, ☰, ‖, джойстик, кнопка дії — у двох орієнтаціях телефона й трьох пропорціях.
const CONTROLS = ['[data-ui="hud"]', '[data-touch="story"]', '[data-touch="pause"]', '[data-touch="stick"]', '[data-touch="interact"]'] as const;
/** Селектори керування, яких картка торкається. Елемента немає на екрані → помилка (порожній перетин не мусить означати «все гаразд»). */
async function overlaps(page: Page): Promise<string[]> {
  const c = await card(page).boundingBox();
  if (!c) throw new Error('картки хвилі немає на екрані');
  const hit: string[] = [];
  for (const sel of CONTROLS) {
    const b = await page.locator(sel).first().boundingBox();
    if (!b) throw new Error(`${sel}: елемента немає на екрані`);
    if (c.x < b.x + b.width && b.x < c.x + c.width && c.y < b.y + b.height && b.y < c.y + c.height) hit.push(sel);
  }
  return hit;
}
const LAYOUTS = [['сторч 390×844', 390, 844], ['вбік 844×390', 844, 390], ['9:16 360×640', 360, 640], ['1:1 600×600', 600, 600], ['16:9 640×360', 640, 360]] as const;
for (const [name, width, height] of LAYOUTS) {
  test.describe(`(d) розкладка картки: ${name}`, () => {
    test.use({ viewport: { width, height }, hasTouch: true, isMobile: true });
    test('картка не перетинає HUD, ☰, ‖, джойстик і кнопку дії', async ({ page }) => {
      test.setTimeout(240_000);
      await open(page, '?seed=5');
      await toEvening(page);
      await panel(page).locator('[data-ui="story-close"]').click();
      await expect(card(page)).toBeVisible();
      expect(await overlaps(page), 'картка перетинає елементи керування').toEqual([]);
    });
  });
}
test.describe('(d) негативний контроль розкладки', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('CSS ставить картку на ☰ → перевірка червоніє', async ({ page }) => {
    test.setTimeout(240_000);
    await open(page, '?seed=5');
    await toEvening(page);
    await panel(page).locator('[data-ui="story-close"]').click();
    await expect(card(page)).toBeVisible();
    const m = await page.locator('[data-touch="story"]').first().boundingBox();
    if (!m) throw new Error('☰ немає');
    await page.addStyleTag({ content: `[data-ui="wave"]{position:fixed!important;left:${m.x}px!important;top:${m.y}px!important;right:auto!important;bottom:auto!important;transform:none!important}` });
    expect(await overlaps(page)).toContain('[data-touch="story"]');
  });
});
