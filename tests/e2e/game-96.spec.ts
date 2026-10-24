// GAME-96 · телефон грають В ОБОХ положеннях (рішення власника 24.10, як Stardew Valley mobile); накладки «Поверни» немає.
// 1) Вбік: ☰, ‖, джойстик, кнопка дії ≥ 16 px від країв (і ≥ вирізу збоку); рамка «день · час · гроші» — у верхній правій чверті й не
//    перекриває ☰/‖; мапа ≥ 85 % висоти. 2) Різні пропорції (9:16, 1:1, 16:9; з дотиком і без): нічого не вилізло за екран, цілі ≥ 44 px,
//    гра керується. 3) Поворот сторч → вбік → сторч: стан живий, годинник іде, пауза не ставиться.
// Сторч-розкладку тримають game-91/92/95 без змін. Негативні контролі (мутації) — у звіті картки.
import { expect, test, type Browser, type CDPSession, type Page } from '@playwright/test';

const SHOTS = process.env.SHOT_DIR ?? 'test-results';   // скріншоти для звіту картки
const SETTINGS_KEY = 'camplife.settings.v1';
interface Clock { minutes: number; paused: boolean }
interface Rect { left: number; top: number; right: number; bottom: number; width: number; height: number }
type Vp = { readonly width: number; readonly height: number };
const clock = (page: Page): Promise<Clock> => page.evaluate(() => (window as unknown as { __game: { read: () => { clock: Clock } } }).__game.read().clock);
const pos = (page: Page): Promise<{ x: number; y: number }> => page.evaluate(() => { const p = (window as unknown as { __game: { probe: { playerX: number; playerY: number } } }).__game.probe; return { x: p.playerX, y: p.playerY }; });

async function open(browser: Browser, vp: Vp, touch: boolean, inset = 0): Promise<{ page: Page; cdp: CDPSession }> {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
  await page.addInitScript(([k, l]) => { try { localStorage.setItem(k as string, JSON.stringify({ textScale: 100, language: l, hintSeen: true })); } catch { /* сховища немає */ } }, [SETTINGS_KEY, 'uk'] as const);
  await page.goto('/?seed=2');
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { saveLoaded: boolean } } }).__game?.probe.saveLoaded === true, null, { timeout: 30_000 });
  // Виріз екрана: Chromium не дає емулювати env(safe-area-inset-*), тож перекриваємо змінні --safe-*, з яких CSS складає відступи.
  if (inset > 0) await page.addStyleTag({ content: `:root { --safe-left: ${inset}px !important; --safe-right: ${inset}px !important; }` });
  return { page, cdp: await ctx.newCDPSession(page) };
}
const rect = (page: Page, sel: string): Promise<Rect> =>
  page.locator(sel).first().evaluate((el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; });
const touchEv = (cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', x?: number, y?: number): Promise<unknown> =>
  cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: x ?? 0, y: y ?? 0 }] });
const intersects = (a: Rect, b: Rect): boolean => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

const LANDSCAPE: readonly Vp[] = [{ width: 844, height: 390 }, { width: 932, height: 430 }, { width: 667, height: 375 }, { width: 568, height: 320 }];
for (const vp of LANDSCAPE) for (const inset of [0, 47]) {
  test(`${vp.width}×${vp.height}${inset ? `, виріз ${inset} px з боків` : ''}: ☰, ‖, джойстик, кнопка дії ≥ 16 px від країв${inset ? ` і ≥ ${inset} px збоку` : ''}; рамка справа вгорі; карта ≥ 85 % висоти`, async ({ browser }) => {
    const { page } = await open(browser, vp, true, inset);
    const sides = inset > 0 ? inset : 16;
    const gaps = async (sel: string): Promise<{ left: number; top: number; right: number; bottom: number }> => {
      const r = await rect(page, sel);
      return { left: r.left, top: r.top, right: vp.width - r.right, bottom: vp.height - r.bottom };
    };
    const story = await gaps('[data-touch="story"]');
    const pause = await gaps('[data-touch="pause"]');
    const stick = await gaps('[data-touch="stick"]');
    const act = await gaps('[data-touch="interact"]');
    for (const [name, g] of [['☰', story], ['‖', pause], ['джойстик', stick], ['кнопка дії', act]] as const) {
      for (const side of ['left', 'top', 'right', 'bottom'] as const) expect(g[side], `${name}: ${side} ≥ 16`).toBeGreaterThanOrEqual(16);
    }
    expect(story.left, '☰ від лівого краю').toBeGreaterThanOrEqual(sides);
    expect(stick.left, 'джойстик від лівого краю').toBeGreaterThanOrEqual(sides);
    expect(pause.right, '‖ від правого краю').toBeGreaterThanOrEqual(sides);
    expect(act.right, 'кнопка дії від правого краю').toBeGreaterThanOrEqual(sides);
    // Рамка «день · час · гроші»: у верхній правій чверті (лівий край правіше середини, низ вище середини), не на ☰/‖.
    const frame = await rect(page, '[data-ui="hud"]');
    const time = await rect(page, '[data-ui="hud-time"]');
    const money = await rect(page, '[data-ui="hud-money"]');
    expect(frame.left, `рамка ${JSON.stringify(frame)}: лівий край правіше середини`).toBeGreaterThanOrEqual(vp.width / 2);
    expect(frame.bottom, 'рамка: низ вище середини висоти').toBeLessThanOrEqual(vp.height / 2);
    expect(frame.right, 'рамка: правий край у межах з вирізом').toBeLessThanOrEqual(vp.width - sides);
    expect(time.width, 'час видно').toBeGreaterThan(0);
    expect(money.width, 'гроші видно').toBeGreaterThan(0);
    const sR = await rect(page, '[data-touch="story"]');
    const pR = await rect(page, '[data-touch="pause"]');
    expect(intersects(frame, sR), 'рамка не на ☰').toBe(false);
    expect(intersects(frame, pR), 'рамка не на ‖').toBe(false);
    expect(Math.min(sR.width, sR.height, pR.width, pR.height), 'кнопки ≥ 44').toBeGreaterThanOrEqual(44);
    await page.waitForTimeout(800);   // Phaser перераховує масштаб полотна сам, раз на 0,5 с — міряємо після, а не до
    const canvas = await page.locator('#stage canvas').evaluate((el) => el.getBoundingClientRect().height);
    const stageH = await page.locator('#stage').evaluate((el) => el.getBoundingClientRect().height);
    expect(stageH / vp.height, `поле гри ${stageH} із ${vp.height}: шапка лежить на мапі`).toBeGreaterThanOrEqual(0.99);
    expect(canvas / vp.height, `полотно ${canvas} із ${vp.height}`).toBeGreaterThanOrEqual(0.85);
    if (vp.width === 844 && !inset) {
      await page.screenshot({ path: `${SHOTS}/game-96-844x390-game.png` });
      await page.locator('[data-touch="pause"]').tap();
      await expect(page.locator('[data-ui="pause"]')).toBeVisible();
      await page.screenshot({ path: `${SHOTS}/game-96-844x390-pause.png` });
    }
  });
}

test('вбік: нагадування GAME-94 (поле з кодом) ловить дотик, шапка — ні', async ({ browser }) => {
  const { page } = await open(browser, { width: 844, height: 390 }, true);
  // Шапка прозора для дотику: у вільному місці між ☰ і рамкою дотик іде на мапу.
  const hit = await page.evaluate(() => document.elementFromPoint(400, 20)?.closest('.ui-header') !== null);
  expect(hit, 'шапка не перехоплює дотик у порожньому місці').toBe(false);
  // Нагадування: вставляємо рядок так само, як Shell, і перевіряємо, що дотик по ньому потрапляє в нього, а не крізь.
  const ok = await page.evaluate(() => {
    const h = document.querySelector('.ui-header');
    if (!h) return false;
    const d = document.createElement('div'); d.className = 'ui-reminder';
    d.innerHTML = '<textarea id="t96" rows="2"></textarea>';
    h.appendChild(d);
    const ta = document.getElementById('t96');
    if (!ta) return false;
    const r = ta.getBoundingClientRect();
    return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.id === 't96';
  });
  expect(ok, 'дотик по полю в нагадуванні влучає в поле').toBe(true);
});

// Пропорції 9:16, 1:1, 16:9 в обох положеннях; з дотиком і без.
const ASPECTS: { name: string; vp: Vp; touch: boolean }[] = [
  { name: '360×640 дотик (9:16)', vp: { width: 360, height: 640 }, touch: true },
  { name: '640×360 дотик (16:9)', vp: { width: 640, height: 360 }, touch: true },
  { name: '600×600 дотик (1:1)', vp: { width: 600, height: 600 }, touch: true },
  { name: '1280×720 десктоп (16:9)', vp: { width: 1280, height: 720 }, touch: false },
  { name: '720×1280 десктоп (9:16)', vp: { width: 720, height: 1280 }, touch: false },
];
for (const c of ASPECTS) {
  test(`${c.name}: нічого не вилізло за екран, цілі ≥ 44 px, персонаж рухається`, async ({ browser }) => {
    const { page, cdp } = await open(browser, c.vp, c.touch);
    // Масштаб полотна Phaser оновлює не миттєво, а під навантаженням і з запізненням: чекаємо стійкого стану, а не фіксовану паузу.
    await expect.poll(async () => (await rect(page, '#stage canvas')).bottom, { timeout: 15_000 }).toBeLessThanOrEqual(c.vp.height + 0.5);
    const sels = ['[data-touch="story"]', '[data-touch="pause"]', '[data-ui="hud"]', '#stage canvas', ...(c.touch ? ['[data-touch="stick"]', '[data-touch="interact"]'] : [])];
    for (const sel of sels) {
      const r = await rect(page, sel);
      expect(r.left, `${sel} ліворуч`).toBeGreaterThanOrEqual(-0.5);
      expect(r.top, `${sel} угорі`).toBeGreaterThanOrEqual(-0.5);
      expect(r.right, `${sel} праворуч`).toBeLessThanOrEqual(c.vp.width + 0.5);
      expect(r.bottom, `${sel} унизу`).toBeLessThanOrEqual(c.vp.height + 0.5);
    }
    for (const sel of ['[data-touch="story"]', '[data-touch="pause"]', ...(c.touch ? ['[data-touch="stick"]', '[data-touch="interact"]'] : [])]) {
      const r = await rect(page, sel);
      expect(Math.min(r.width, r.height), `${sel} ≥ 44`).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.documentElement.scrollHeight <= window.innerHeight), 'сторінка не скролиться').toBe(true);
    const p0 = await pos(page);
    const moved = async (): Promise<number> => { const p = await pos(page); return Math.hypot(p.x - p0.x, p.y - p0.y); };
    if (c.touch) {
      await touchEv(cdp, 'touchStart', 70, c.vp.height * 0.5);
      await touchEv(cdp, 'touchMove', 120, c.vp.height * 0.5);
      await expect.poll(moved, { timeout: 8_000 }).toBeGreaterThan(10);
      await touchEv(cdp, 'touchEnd');
    } else {
      await page.keyboard.down('ArrowRight');
      await expect.poll(moved, { timeout: 8_000 }).toBeGreaterThan(10);
      await page.keyboard.up('ArrowRight');
    }
    const p1 = await pos(page);
    expect(Math.hypot(p1.x - p0.x, p1.y - p0.y), `персонаж зрушив ${JSON.stringify(p0)} → ${JSON.stringify(p1)}`).toBeGreaterThan(10);
  });
}

test('поворот сторч → вбік → сторч: стан живий, годинник іде, пауза не ставиться', async ({ browser }) => {
  const { page } = await open(browser, { width: 390, height: 844 }, true);
  const hud = (): Promise<string> => page.locator('[data-ui="hud-money"]').innerText();
  const money0 = await hud();
  const p0 = await pos(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  let last = (await clock(page)).minutes;
  for (const vp of [{ width: 844, height: 390 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(vp);
    await expect(page.getByRole('dialog'), 'накладки «Поверни» немає').toHaveCount(0);
    expect((await clock(page)).paused, `${vp.width}×${vp.height}: не на паузі`).toBe(false);
    const before = last;
    await page.waitForFunction((m) => (window as unknown as { __game: { read: () => { clock: Clock } } }).__game.read().clock.minutes > m, before, { timeout: 15_000 });
    last = (await clock(page)).minutes;
    expect(last, 'годинник іде').toBeGreaterThan(before);
    expect(await hud(), 'гроші ті самі').toBe(money0);
    const p = await pos(page);
    expect(Math.hypot(p.x - p0.x, p.y - p0.y), 'персонаж на місці').toBeLessThan(1);
    await expect(page.locator('[data-ui="hud"]')).toBeVisible();
  }
  await page.screenshot({ path: `${SHOTS}/game-96-390x844-game.png` });
});
