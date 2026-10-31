// GAME-92 · смак власника про розкладку телефона (GAME-91): ☰ і ‖ не липнуть до країв, текст шапки не липне до ☰,
// рядки шапки на одній лівій межі, джойстик і кнопка дії на однакових відступах від країв.
// Усе міряємо числами (межі прямокутників у px). Негативні контролі (мутації) — у звіті картки.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { waitGameReady } from './ready';

const SETTINGS_KEY = 'camplife.settings.v1';
/** Базовий відступ від краю — токен --gap у index.html (16 px); тест тримає власну копію числа, щоб видалення токена було червоним. */
const GAP = 16;
interface Rect { left: number; top: number; right: number; bottom: number; width: number; height: number }
const rectOf = (page: Page, sel: string): Promise<Rect> => page.locator(sel).first().evaluate((el) => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
});
const meets = (a: Rect, b: Rect): boolean => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
interface Vp { width: number; height: number }
/** Відстань від прямокутника до найближчого краю вікна. */
const edgeGap = (r: Rect, vp: Vp): { top: number; right: number; bottom: number; left: number; min: number } => {
  const g = { top: r.top, right: vp.width - r.right, bottom: vp.height - r.bottom, left: r.left };
  return { ...g, min: Math.min(g.top, g.right, g.bottom, g.left) };
};

async function newPage(browser: Browser, vp: Vp, scale: 100 | 200, opts: { hintSeen?: boolean; insets?: { top: number; right: number; bottom: number; left: number } } = {}): Promise<Page> {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  if (opts.insets) {
    // Справжній env(safe-area-inset-*) у Chromium: CDP-перевизначення вирізів (чубчик, жест «додому»).
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: opts.insets });
  }
  await page.addInitScript(([k, s, seen]) => { try { localStorage.setItem(k, JSON.stringify({ textScale: s, language: 'uk', hintSeen: seen })); } catch { /* сховища немає */ } }, [SETTINGS_KEY, scale, opts.hintSeen ?? true] as const);
  await page.goto('/?seed=2');
  await waitGameReady(page);
  return page;
}

// 320×568 — найвужчий живий телефон (iPhone SE 1): рецензія PR #35 — раніше лише арифметикою.
const PHONES: Vp[] = [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 375, height: 667 }, { width: 360, height: 800 }, { width: 412, height: 915 }];
const CONTROLS = { 'ширма ☰': '[data-touch="story"]', 'пауза ‖': '[data-touch="pause"]', 'джойстик': '[data-touch="stick"]', 'кнопка дії': '[data-touch="interact"]' } as const;

for (const vp of PHONES) {
  test(`${vp.width}×${vp.height}: ☰, ‖, джойстик і кнопка дії ≥ ${GAP} px від найближчого краю; джойстик і кнопка дії — однакові відступи знизу й збоку`, async ({ browser }) => {
    const page = await newPage(browser, vp, 100);
    const got: Record<string, Rect> = {};
    for (const [name, sel] of Object.entries(CONTROLS)) {
      got[name] = await rectOf(page, sel);
      const g = edgeGap(got[name] as Rect, vp);
      expect(g.min, `${name}: відступи ${JSON.stringify(g)}`).toBeGreaterThanOrEqual(GAP - 0.01);
    }
    const stick = edgeGap(got['джойстик'] as Rect, vp);
    const act = edgeGap(got['кнопка дії'] as Rect, vp);
    expect(Math.abs(stick.bottom - act.bottom), `низ: ${stick.bottom} / ${act.bottom}`).toBeLessThan(0.5);
    expect(Math.abs(stick.left - act.right), `бік: ${stick.left} / ${act.right}`).toBeLessThan(0.5);
    expect(Math.abs(stick.bottom - stick.left), 'джойстик: низ = бік').toBeLessThan(0.5);
    // Збалансовані розміри: кнопка дії менша за джойстик, але не крихітна.
    expect((got['кнопка дії'] as Rect).width).toBeGreaterThanOrEqual(64);
    expect((got['кнопка дії'] as Rect).width).toBeLessThan((got['джойстик'] as Rect).width);
    expect(meets(got['джойстик'] as Rect, got['кнопка дії'] as Rect)).toBe(false);
    await page.context().close();
  });
}

for (const scale of [100, 200] as const) for (const hint of [false, true]) {
  test(`шапка 390×844, текст ${scale} %${hint ? ' з підказкою' : ''}: проміжки ☰↔текст і текст↔‖ ≥ 8 px, без перетинів, рядки на одній лівій межі`, async ({ browser }) => {
    const page = await newPage(browser, { width: 390, height: 844 }, scale, { hintSeen: !hint });
    if (hint) await expect(page.locator('[data-ui="hint"]')).toBeVisible();
    const [menu, pause, hud, place, time, money] = await Promise.all(['[data-touch="story"]', '[data-touch="pause"]', '[data-ui="hud"]', '[data-ui="hud-place"]', '[data-ui="hud-time"]', '[data-ui="hud-money"]'].map((q) => rectOf(page, q)));
    if (!menu || !pause || !hud || !place || !time || !money) throw new Error('немає елемента шапки');
    expect(hud.left - menu.right, '☰ ↔ текст').toBeGreaterThanOrEqual(8);
    expect(pause.left - hud.right, 'текст ↔ ‖').toBeGreaterThanOrEqual(8);
    expect(meets(menu, hud) || meets(pause, hud) || meets(menu, pause)).toBe(false);
    for (const [name, r] of Object.entries({ place, time, money })) expect(meets(r, menu) || meets(r, pause), `${name} під кнопкою`).toBe(false);
    // Місце і «День, час» починаються з однієї лівої межі (сума — після «·» в тому ж рядку, не мірюється).
    expect(Math.abs(time.left - place.left), 'місце / час').toBeLessThan(0.5);
    expect(Math.abs(place.left - hud.left), 'місце / колонка').toBeLessThan(0.5);
    if (hint) { const h = await rectOf(page, '[data-ui="hint"]'); expect(Math.abs(h.left - place.left), 'підказка / місце').toBeLessThan(0.5); }
    // Порядок рядків: місце, потім «день · гроші» (гроші в тому самому рядку, що й час, якщо влазять).
    expect(time.top, 'час нижче місця').toBeGreaterThanOrEqual(place.bottom - 0.5);
    if (scale === 100) expect(Math.abs(money.top - time.top), 'гроші в рядку часу').toBeLessThan(2);
    await page.context().close();
  });
}

test('підказка зникає: місце й «день · гроші» не рухаються, ☰ і ‖ теж; підказка — окремий рядок нижче (100 %, 390×844)', async ({ browser }) => {
  const sel = ['[data-ui="hud-place"]', '[data-ui="hud-time"]', '[data-touch="story"]', '[data-touch="pause"]'];
  const withHint = await newPage(browser, { width: 390, height: 844 }, 100, { hintSeen: false });
  await expect(withHint.locator('[data-ui="hint"]')).toBeVisible();
  const a = await Promise.all(sel.map((q) => rectOf(withHint, q)));
  const hint = await rectOf(withHint, '[data-ui="hint"]');
  const without = await newPage(browser, { width: 390, height: 844 }, 100, { hintSeen: true });
  await expect(without.locator('[data-ui="hint"]')).toHaveCount(0);
  const b = await Promise.all(sel.map((q) => rectOf(without, q)));
  sel.forEach((q, i) => {
    expect(Math.abs((a[i] as Rect).top - (b[i] as Rect).top), `${q}: top`).toBeLessThan(0.5);
    expect(Math.abs((a[i] as Rect).left - (b[i] as Rect).left), `${q}: left`).toBeLessThan(0.5);
  });
  expect(hint.top, 'підказка нижче рядка часу').toBeGreaterThanOrEqual((a[1] as Rect).bottom - 0.5);
  await withHint.context().close();
  await without.context().close();
});

test('вирізи екрана (CDP-емуляція env(safe-area-inset-*)): ☰, ‖, джойстик і кнопка дії поза вирізами плюс базовий відступ', async ({ browser }) => {
  const vp = { width: 390, height: 844 };
  const ins = { top: 47, right: 20, bottom: 34, left: 24 };
  const page = await newPage(browser, vp, 100, { insets: ins });
  // Спершу доводимо, що емуляція справді діє (інакше перевірка нижче була б порожньою): токен читає env().
  expect(await page.evaluate(() => { const d = document.createElement('div'); d.style.paddingTop = 'env(safe-area-inset-top, 0px)'; document.body.append(d); const v = getComputedStyle(d).paddingTop; d.remove(); return v; }), 'env() діє').toBe('47px');
  const menu = edgeGap(await rectOf(page, CONTROLS['ширма ☰']), vp);
  const pause = edgeGap(await rectOf(page, CONTROLS['пауза ‖']), vp);
  const stick = edgeGap(await rectOf(page, CONTROLS['джойстик']), vp);
  const act = edgeGap(await rectOf(page, CONTROLS['кнопка дії']), vp);
  expect(menu.top, '☰ під чубчиком').toBeGreaterThanOrEqual(ins.top + GAP - 0.01);
  expect(menu.left, '☰ від лівого вирізу').toBeGreaterThanOrEqual(ins.left + GAP - 0.01);
  expect(pause.top, '‖ під чубчиком').toBeGreaterThanOrEqual(ins.top + GAP - 0.01);
  expect(pause.right, '‖ від правого вирізу').toBeGreaterThanOrEqual(ins.right + GAP - 0.01);
  expect(stick.bottom, 'джойстик над жестом «додому»').toBeGreaterThanOrEqual(ins.bottom + GAP - 0.01);
  expect(stick.left, 'джойстик від лівого вирізу').toBeGreaterThanOrEqual(ins.left + GAP - 0.01);
  expect(act.bottom, 'кнопка дії над жестом «додому»').toBeGreaterThanOrEqual(ins.bottom + GAP - 0.01);
  expect(act.right, 'кнопка дії від правого вирізу').toBeGreaterThanOrEqual(ins.right + GAP - 0.01);
  expect(Math.abs(stick.bottom - act.bottom), 'низ однаковий і з вирізом').toBeLessThan(0.5);
  await page.context().close();
});

test('десктоп без дотику: шапка й кнопки на місці, відступи від країв ≥ базового', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.addInitScript(([k]) => { try { localStorage.setItem(k, JSON.stringify({ textScale: 100, language: 'uk', hintSeen: true })); } catch { /* сховища немає */ } }, [SETTINGS_KEY] as const);
  await page.goto('/?seed=2');
  await waitGameReady(page);
  for (const sel of [CONTROLS['ширма ☰'], CONTROLS['пауза ‖']]) expect(edgeGap(await rectOf(page, sel), { width: 1280, height: 800 }).min).toBeGreaterThanOrEqual(GAP - 0.01);
  await ctx.close();
});
