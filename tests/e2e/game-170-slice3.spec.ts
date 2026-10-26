// GAME-170 зріз 3 · хвилі W1 «Виїзд о шостій» (дім — кнопки екрана подорожі), W2 «Небо темнішає» (зупинка — кнопки), W3 «Встигнути до
// зливи» (табір — цілі на мапі) граються з початку гри автівкою з Мією (сім'я з підлітком):
//  (a) сторч 390×844, клавіатура: W1 — три кнопки «Зробити» з Enter → усі done; W3 — чотири цілі клавіатурою → усі done; картка мети W3
//      у межах екрана, не перетинає ☰, ‖ і HUD (той самий сторож розкладки, що в game-170.spec); міряємо реальний час;
//  (b) вбік 844×390, дотик: W1 — один тап по кнопці, решта спізнюється на мапі (міряємо, скільки хвиля згасає); W2 — один тап; W3 — одна
//      ціль джойстиком і кнопкою дії, решта спізнюється → намет вологий (wetGear); розділ не зламано (ST-005 завершується);
//  (c) негативні контролі (закон 1): ?hideAct=task — кнопок справ немає; ?breakSpot=task.pick-spot — E біля ділянки нічого не шле.
import { readFileSync } from 'node:fs';
import { expect, test, type Browser, type CDPSession, type Page } from '@playwright/test';

interface Core { game: { campaignEnded: boolean; quests: Record<string, { status: string }>; gear: Record<string, { wet: boolean }>; wave?: { active: { waveId: string; startedAt: number; tasks: Record<string, { dueAt: number; outcome: string }> } | null; past: Record<string, Record<string, string>> } }; clock: { minutes: number } }
interface Probe { playerX: number; playerY: number; nearObject: string | null; commandsSent: number }
interface Rect { left: number; top: number; right: number; bottom: number; width: number; height: number }
const core = (page: Page): Promise<Core> => page.evaluate(() => (window as unknown as { __game: { read: () => Core } }).__game.read());
const probe = (page: Page): Promise<Probe> => page.evaluate(() => ({ ...(window as unknown as { __game: { probe: Probe } }).__game.probe }));
const panel = (page: Page) => page.locator('[data-ui="story"]');
const card = (page: Page) => page.locator('[data-ui="wave"]');
const taskButtons = (page: Page) => panel(page).locator('[data-act="task"]');
const rectOf = (page: Page, sel: string): Promise<Rect> => page.locator(sel).first().evaluate((el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; });
const meets = (a: Rect, b: Rect): boolean => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const W1 = 'wave.ch1-home-departure';
const W2 = 'wave.ch1-day1-road';
const W3 = 'wave.ch1-day1-arrival';
const SETTINGS_KEY = 'camplife.settings.v1';
const W3_SPOTS = ['task.pick-spot', 'task.pitch-tent', 'task.gear-shelter', 'task.mia-car'] as const;

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
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { saveLoaded: boolean } } }).__game?.probe.saveLoaded === true, null, { timeout: 30_000 });
  await page.locator('[data-touch="story"]').click();
  await expect(panel(page)).toBeVisible();
  return errors;
}
async function act(page: Page, kind: string, key = ''): Promise<void> {
  try { await panel(page).locator(`[data-act="${kind}"][data-key="${key}"]`).click({ timeout: 5_000 }); } catch { throw new Error(`крок «${kind} ${key}»: кнопки немає на екрані подорожі`); }
  await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії
  if (kind === 'visit' && (key === 'loc.road' || key === 'loc.camp.lake')) {
    const dlg = panel(page).locator('[data-ui="dialogue"]');
    for (let i = 0; i < 6 && await dlg.isVisible({ timeout: 400 }).catch(() => false); i++) { await dlg.locator('[data-act]').last().click(); await page.waitForTimeout(400); }
  }
}
/** Сім'я з підлітком · авто · кішка — до повернення додому з крамниці: CH1-HOME-001 активний, гравець удома → режисер відкрив W1. */
async function toHome(page: Page): Promise<void> {
  await panel(page).locator('[data-act="create"]', { hasText: 'Авто · Кішка' }).first().click();
  await page.waitForTimeout(400);
  for (const [k, key] of [['complete', 'q.prologue-home-001'], ['complete', 'q.st-001'], ['complete', 'q.st-002'], ['visit', 'loc.shop'], ['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'],
    ['complete', 'q.st-003']] as const) await act(page, k, key);
  expect((await core(page)).game.wave?.active ?? null, 'у крамниці хвилі ще немає (W1 чекає дому)').toBeNull();
  await expect(taskButtons(page)).toHaveCount(0);
  await act(page, 'visit', 'loc.home');
  const c = await core(page);
  expect(c.game.quests['CH1-HOME-001']?.status).toBe('active');
  expect(c.game.wave?.active?.waveId).toBe(W1);
  expect(Object.keys(c.game.wave?.active?.tasks ?? {}).sort()).toEqual(['lights-window', 'map-to-luggage', 'mia-carrier']);
}
const remaining = (c: Core): number[] => Object.values(c.game.wave?.active?.tasks ?? {}).map((t) => t.dueAt - c.clock.minutes);
const KEY_CODE = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40 } as const;
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
async function goAndPress(page: Page, name: string): Promise<void> {
  const t = at(name);
  for (let i = 0; i < 4 && (await probe(page)).nearObject !== name; i++) {
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
/** Розкладка картки мети — числами (той самий сторож, що в game-170.spec). */
async function cardLayout(page: Page, vp: { width: number; height: number }): Promise<void> {
  const c = await rectOf(page, '[data-ui="wave"]');
  expect(c.width).toBeGreaterThan(100);
  expect(c.left).toBeGreaterThanOrEqual(0);
  expect(c.right).toBeLessThanOrEqual(vp.width);
  expect(c.top).toBeGreaterThanOrEqual(0);
  expect(c.bottom).toBeLessThan(vp.height * 0.4);
  for (const sel of ['[data-touch="story"]', '[data-touch="pause"]', '[data-ui="hud"]', '[data-touch="stick"]', '[data-touch="interact"]']) expect(meets(c, await rectOf(page, sel)), `картка перетинає ${sel}`).toBe(false);
  if (vp.height > vp.width) expect((await rectOf(page, '#stage canvas')).top, 'сторч: поле гри під карткою').toBeGreaterThanOrEqual(c.bottom - 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}
/** Дорога до табору: виїзд (W1 закривається), зупинка (W2), приїзд (W3 відкрита, гравець у таборі). */
async function roadToCamp(page: Page, onRoad: (page: Page) => Promise<void>): Promise<void> {
  await act(page, 'complete', 'q.ch1-home-001');
  await act(page, 'visit', 'loc.road');
  const c = await core(page);
  expect(c.game.wave?.past[W1], 'W1 закрита виїздом').toBeDefined();
  expect(c.game.wave?.active?.waveId).toBe(W2);
  await expect(taskButtons(page)).toHaveCount(3);
  await onRoad(page);
  await act(page, 'complete', 'q.st-004');
  await act(page, 'visit', 'loc.camp.lake');
  const d = await core(page);
  expect(d.game.wave?.past[W2], 'W2 закрита від\'їздом із зупинки').toBeDefined();
  expect(d.game.wave?.active?.waveId).toBe(W3);
  expect(Object.keys(d.game.wave?.active?.tasks ?? {}).sort()).toEqual(['gear-shelter', 'mia-car', 'pick-spot', 'pitch-tent']);
  await expect(taskButtons(page), 'справи табору — цілі мапи, не кнопки').toHaveCount(0);
}

test.describe('(a) сторч 390×844, клавіатура: W1 і W3 усе встигли', () => {
  const VP = { width: 390, height: 844 };
  test.use({ viewport: VP, hasTouch: true, isMobile: true });
  test('W1: три кнопки «Зробити» з клавіатури → усі done; W3: чотири цілі клавіатурою → усі done; картка W3 у межах екрана', async ({ page }, info) => {
    test.setTimeout(240_000);
    const errors = await open(page, '?seed=5');
    await toHome(page);
    await expect(taskButtons(page)).toHaveCount(3);
    await expect(taskButtons(page).first()).toContainText('Зробити:');
    // Екран подорожі зупиняє годинник: строки стоять, поки гравець читає (та сама пауза, що в Shell).
    const r0 = remaining(await core(page));
    await page.waitForTimeout(1_500);
    expect(remaining(await core(page))).toEqual(r0);
    const t0 = Date.now();
    for (let i = 0; i < 3; i++) {
      await taskButtons(page).first().focus();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(450);
      await expect(taskButtons(page)).toHaveCount(2 - i);
    }
    const w1 = (Date.now() - t0) / 1000;
    const c1 = await core(page);
    expect(c1.game.wave?.active).toBeNull();
    expect(c1.game.wave?.past[W1]).toEqual({ 'mia-carrier': 'done', 'map-to-luggage': 'done', 'lights-window': 'done' });
    info.annotations.push({ type: 'w1-real-seconds-all-done', description: w1.toFixed(1) });
    console.log(`GAME-170 зріз 3 (a): W1 три справи клавіатурою за ${w1.toFixed(1)} с`);

    await roadToCamp(page, async () => { /* W2 без дій — усе спізниться від'їздом */ });
    await panel(page).locator('[data-ui="story-close"]').click();
    await expect(card(page)).toBeVisible();
    await expect(card(page)).toHaveAttribute('data-total', '4');
    await expect(card(page).locator('[data-ui="wave-title"]')).toHaveText('Встигнути до зливи · 0/4');
    await cardLayout(page, VP);
    await page.screenshot({ path: 'test-results/game-170-slice3-portrait-w3.png' });
    const t1 = Date.now();
    const sent0 = (await probe(page)).commandsSent;
    for (const name of W3_SPOTS) {
      await goAndPress(page, name);
      expect((await core(page)).game.wave?.active?.tasks[name.slice('task.'.length)]?.outcome ?? 'ended').not.toBe('open');
    }
    const w3 = (Date.now() - t1) / 1000;
    const c2 = await core(page);
    expect(c2.game.wave?.active).toBeNull();
    expect(c2.game.wave?.past[W3]).toEqual({ 'pick-spot': 'done', 'pitch-tent': 'done', 'gear-shelter': 'done', 'mia-car': 'done' });
    expect((await probe(page)).commandsSent - sent0).toBe(4);
    await expect(card(page)).toHaveCount(0);
    expect(w3, 'чотири цілі клавіатурою — менше за найкоротший строк (40 хв ≈ 40 с)').toBeLessThan(40);
    info.annotations.push({ type: 'w3-real-seconds-all-done', description: w3.toFixed(1) });
    console.log(`GAME-170 зріз 3 (a): W3 чотири цілі клавіатурою за ${w3.toFixed(1)} с`);
    expect(errors).toEqual([]);
  });
});

test.describe('(b) вбік 844×390, дотик: одна справа тапом, решта спізнюється', () => {
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
  /** Тап пальцем по елементу (CDP-дотик, як робить гравець): кнопка екрана подорожі вбік може бути нижче краю — спершу прокрутити до неї. */
  const tapOn = async (page: Page, sel: string): Promise<void> => { await page.locator(sel).first().scrollIntoViewIfNeeded(); await page.waitForTimeout(150); const b = await rectOf(page, sel); await page.touchscreen.tap(b.left + b.width / 2, b.top + b.height / 2); await page.waitForTimeout(450); };
  test('W1: тап по «Мія в переноску», решта згасає на мапі (≈ 45 с); W2: тап по маршруту; W3: ділянка джойстиком, решта спізнюється → намет вологий; ST-005 завершується', async ({ browser }: { browser: Browser }, info) => {
    test.setTimeout(400_000);
    const ctx = await browser.newContext({ viewport: VP, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    const errors = await open(page, '?seed=5');
    await toHome(page);
    await tapOn(page, '[data-act="task"][data-key="wave.ch1-home-departure.mia-carrier"]');
    expect((await core(page)).game.wave?.active?.tasks['mia-carrier']?.outcome).toBe('done');
    await expect(taskButtons(page)).toHaveCount(2);
    await panel(page).locator('[data-ui="story-close"]').click();
    await expect(card(page)).toBeVisible();
    await expect(card(page)).toHaveAttribute('data-done', '1');
    await cardLayout(page, VP);
    await page.screenshot({ path: 'test-results/game-170-slice3-landscape-w1.png' });
    const t0 = Date.now();
    const m0 = (await core(page)).game.wave?.active?.startedAt ?? Number.NaN; // game minute the wave started (deterministic, not sampled after the fact)
    await expect.poll(async () => (await core(page)).game.wave?.active === null, { timeout: 90_000, intervals: [500] }).toBe(true);
    const w1 = (Date.now() - t0) / 1000;
    const c1 = await core(page);
    expect(c1.game.wave?.past[W1]).toEqual({ 'mia-carrier': 'done', 'map-to-luggage': 'late', 'lights-window': 'late' });
    expect(c1.clock.minutes - m0).toBeGreaterThanOrEqual(45);
    expect(w1).toBeGreaterThanOrEqual(30);
    expect(w1).toBeLessThanOrEqual(75);
    info.annotations.push({ type: 'w1-real-seconds-ignored', description: w1.toFixed(1) });
    console.log(`GAME-170 зріз 3 (b): W1 згасла сама за ${w1.toFixed(1)} с (${c1.clock.minutes - m0} ігрових хв)`);
    await expect(card(page)).toHaveCount(0);

    await page.locator('[data-touch="story"]').click();
    await expect(panel(page)).toBeVisible();
    await roadToCamp(page, async (p) => {
      await tapOn(p, '[data-act="task"][data-key="wave.ch1-day1-road.check-route"]');
      expect((await core(p)).game.wave?.active?.tasks['check-route']?.outcome).toBe('done');
      await expect(taskButtons(p)).toHaveCount(2);
    });
    expect((await core(page)).game.wave?.past[W2]).toEqual({ 'fix-luggage': 'late', 'mia-water-blanket': 'late', 'check-route': 'done' });
    await panel(page).locator('[data-ui="story-close"]').click();
    await expect(card(page)).toBeVisible();
    await cardLayout(page, VP);
    // Ділянка (1,4) — ліворуч і трохи вище точки появи (6,5): джойстиком до цілі, тап по кнопці дії.
    const t1 = Date.now();
    const m1 = (await core(page)).clock.minutes;
    const spot = at('task.pick-spot');
    await driveUntil(page, cdp, -50, 0, (p) => p.playerX <= spot.x + 8);
    await driveUntil(page, cdp, 0, -50, (p) => p.nearObject === 'task.pick-spot');
    for (let i = 0; i < 4 && (await probe(page)).nearObject !== 'task.pick-spot'; i++) await driveUntil(page, cdp, 0, i % 2 === 0 ? 50 : -50, (p) => p.nearObject === 'task.pick-spot', 2_000);
    expect((await probe(page)).nearObject).toBe('task.pick-spot');
    await tapOn(page, '[data-touch="interact"]');
    expect((await core(page)).game.wave?.active?.tasks['pick-spot']?.outcome).toBe('done');
    await expect(card(page)).toHaveAttribute('data-done', '1');
    await expect.poll(async () => (await core(page)).game.wave?.active === null, { timeout: 90_000, intervals: [500] }).toBe(true);
    const w3 = (Date.now() - t1) / 1000;
    const c3 = await core(page);
    expect(c3.game.wave?.past[W3]).toEqual({ 'pick-spot': 'done', 'pitch-tent': 'late', 'gear-shelter': 'late', 'mia-car': 'late' });
    expect(c3.clock.minutes - m1).toBeGreaterThanOrEqual(55);
    expect(w3).toBeLessThanOrEqual(90);
    expect(c3.game.gear['item.tent']?.wet, 'намет не встигли до зливи → вологий (wetGear)').toBe(true);
    info.annotations.push({ type: 'w3-real-seconds-ignored', description: w3.toFixed(1) });
    console.log(`GAME-170 зріз 3 (b): W3 згасла сама за ${w3.toFixed(1)} с (${c3.clock.minutes - m1} ігрових хв)`);
    // Розділ не зламано: день 1 завершується, як і раніше (Еліза, дрова, ST-005 → підсумок дня 1).
    await page.locator('[data-touch="story"]').click();
    for (const [k, key] of [['talk', 'npc.elise'], ['choose', 'dlg.elise-greeting.hello.c2'], ['continue', ''], ['choose', 'dlg.elise-greeting.spot.c1'], ['continue', ''], ['pickup', 'item.firewood'], ['complete', 'q.st-005']] as const) await act(page, k, key);
    await expect(page.locator('[data-ui="summary"] h2')).toHaveText('Підсумок дня 1');
    expect((await core(page)).game.campaignEnded).toBe(false);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

test.describe('(c) негативні контролі', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('?hideAct=task — кнопок справ удома немає, хоч хвиля жива; ?breakSpot=task.pick-spot — E біля ділянки нічого не шле', async ({ page }) => {
    test.setTimeout(240_000);
    await open(page, '?seed=5&hideAct=task&breakSpot=task.pick-spot');
    await panel(page).locator('[data-act="create"]', { hasText: 'Авто · Кішка' }).first().click();
    await page.waitForTimeout(400);
    for (const [k, key] of [['complete', 'q.prologue-home-001'], ['complete', 'q.st-001'], ['complete', 'q.st-002'], ['visit', 'loc.shop'], ['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'],
      ['complete', 'q.st-003'], ['visit', 'loc.home']] as const) await act(page, k, key);
    expect((await core(page)).game.wave?.active?.waveId).toBe(W1);
    await expect(taskButtons(page)).toHaveCount(0);
    for (const [k, key] of [['complete', 'q.ch1-home-001'], ['visit', 'loc.road'], ['complete', 'q.st-004'], ['visit', 'loc.camp.lake']] as const) await act(page, k, key);
    expect((await core(page)).game.wave?.active?.waveId).toBe(W3);
    await panel(page).locator('[data-ui="story-close"]').click();
    const sent0 = (await probe(page)).commandsSent;
    await goAndPress(page, 'task.pick-spot');
    expect((await probe(page)).commandsSent - sent0).toBe(0);
    expect((await core(page)).game.wave?.active?.tasks['pick-spot']?.outcome).toBe('open');
  });
});
