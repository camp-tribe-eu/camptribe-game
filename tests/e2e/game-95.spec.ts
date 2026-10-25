// GAME-95 · телефонне керування за зразком ігор (Stardew mobile, Forager, Coromon): плаваючий джойстик, контекстна кнопка
// дії, тап по об'єкту на канві, підказка-тост. Дотик — справжній (CDP Input.dispatchTouchEvent): іде через вхідний
// конвеєр браузера з перевіркою влучання, тож «дотик на кнопці не створює джойстик» перевіряється на живому DOM.
// Негативні контролі (мутації) — у звіті картки; кожна перевірка має мутацію, що її червонить.
import { expect, test, type Browser, type CDPSession, type Page } from '@playwright/test';

const SETTINGS_KEY = 'camplife.settings.v1';
// Два положення телефона: сторч і горизонтально (власник: грати будуть горизонтально, як Stardew mobile) — кожен тест іде в обох.
const VIEWPORTS = [{ width: 390, height: 844 }, { width: 844, height: 390 }] as const;
type Vp = { readonly width: number; readonly height: number };
interface Probe { ready: boolean; playerX: number; playerY: number; nearObject: string | null; nearKind: string | null; commandsSent: number; cameraScrollX: number; cameraScrollY: number }
interface Rect { left: number; top: number; right: number; bottom: number; width: number; height: number }

const probe = (page: Page): Promise<Probe> => page.evaluate(() => ({ ...(window as unknown as { __game: { probe: Probe } }).__game.probe }));
const rectOf = (page: Page, sel: string): Promise<Rect> => page.locator(sel).first().evaluate((el) => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
});
const centerOf = (r: Rect): { x: number; y: number } => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
const meets = (r: Rect, p: { x: number; y: number }): boolean => p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
const stickState = (page: Page): Promise<{ active: boolean; held: string; rect: Rect }> => page.locator('[data-touch="stick"]').evaluate((el) => {
  const r = el.getBoundingClientRect();
  return { active: (el as HTMLElement).dataset.active === 'yes', held: (el as HTMLElement).dataset.held ?? '', rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } };
});

async function newPage(browser: Browser, vp: Vp, opts: { hintSeen?: boolean } = {}): Promise<{ page: Page; cdp: CDPSession }> {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.addInitScript(([k, seen]) => { try { localStorage.setItem(k, JSON.stringify({ textScale: 100, language: 'uk', hintSeen: seen })); } catch { /* сховища немає */ } }, [SETTINGS_KEY, opts.hintSeen ?? true] as const);
  await page.goto('/?seed=2');
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { saveLoaded: boolean } } }).__game?.probe.saveLoaded === true, null, { timeout: 30_000 });
  return { page, cdp: await ctx.newCDPSession(page) };
}
const touch = (cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', x?: number, y?: number): Promise<unknown> =>
  cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: x ?? 0, y: y ?? 0 }] });

/** Старт утримання плаваючим джойстиком з точки (x, y): палець опущено й відведено на (dx, dy); touchEnd робить викликач. */
async function press(cdp: CDPSession, x: number, y: number, dx: number, dy: number): Promise<void> {
  await touch(cdp, 'touchStart', x, y);
  await touch(cdp, 'touchMove', x + dx, y + dy);
}
/** Утримати, доки умова не справдиться (межа maxMs), і відпустити. */
async function driveUntil(page: Page, cdp: CDPSession, dx: number, dy: number, until: (p: Probe) => boolean, maxMs = 10_000): Promise<void> {
  const y0 = Math.round((page.viewportSize()?.height ?? 844) * 0.5);   // середина висоти: поза спокійною основою й під шапкою в обох положеннях
  await press(cdp, 70, y0, dx, dy);
  const start = Date.now();
  for (;;) {
    await page.waitForTimeout(16);
    if (until(await probe(page)) || Date.now() - start >= maxMs) break;
  }
  await touch(cdp, 'touchEnd');
  await page.waitForTimeout(80);
}
/** Підвести персонажа до Елізи (так само, як e2e GAME-91: ліворуч, потім вниз), уже плаваючим джойстиком. */
async function walkToEliza(page: Page, cdp: CDPSession): Promise<void> {
  await driveUntil(page, cdp, -50, 0, (p) => p.playerX <= 88);
  await driveUntil(page, cdp, 0, 50, (p) => p.nearObject === 'npc.elise');
  // Зону Елізи (48 px при 128 px/с) персонаж проходить за ~0,75 с; під навантаженням CI опитування рідше і проскакує її
  // (CI #45: nearObject null). Тоді довертаємо коротким ходом назад, як зробив би гравець (так само, як world.spec, #43).
  for (let i = 0; i < 4 && (await probe(page)).nearObject !== 'npc.elise'; i++) {
    await driveUntil(page, cdp, 0, i % 2 === 0 ? -50 : 50, (p) => p.nearObject === 'npc.elise', 2000);
  }
  expect((await probe(page)).nearObject).toBe('npc.elise');
}
/** Де на екрані (CSS px) стоїть точка світу: масштаб — з розміру елемента канви й кадру. */
async function screenOf(page: Page, wx: number, wy: number): Promise<{ x: number; y: number }> {
  const p = await probe(page);
  const c = await page.locator('#stage canvas').evaluate((el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, k: r.width / (el as HTMLCanvasElement).width }; });
  return { x: c.left + (wx - p.cameraScrollX) * c.k, y: c.top + (wy - p.cameraScrollY) * c.k };
}
const ELISE = { x: 80, y: 272 };   // public/maps/camp-lake.tmj, об'єкт npc.elise (ноги)

for (const VP of VIEWPORTS) test.describe(`${VP.width}×${VP.height}`, () => {
const ZONE = { x: 60, y: Math.round(VP.height * 0.5) };
test.describe('плаваючий джойстик', () => {
  test('дотик ліворуч, де джойстика не було, рухає персонажа, основа з\'являється під пальцем; відпустив — блідий спокій знизу ліворуч', async ({ browser }) => {
    const { page, cdp } = await newPage(browser, VP);
    const rest = await stickState(page);
    expect(rest.active, 'у спокої не активний').toBe(false);
    expect(await page.locator('[data-touch="stick"]').evaluate((el) => Number(getComputedStyle(el).opacity)), 'спокій блідий').toBeLessThan(0.6);
    const before = await probe(page);
    const at = ZONE;   // ліва частина, далеко від спокійної основи (знизу), під шапкою
    expect(at.x, 'точка в лівих 40 %').toBeLessThan(VP.width * 0.4);
    expect(meets(rest.rect, at), 'точка поза спокійною основою (інакше це не плаваючий дотик)').toBe(false);
    await press(cdp, at.x, at.y, 0, 50);
    await expect.poll(async () => (await probe(page)).playerY - before.playerY, { timeout: 5000 }).toBeGreaterThan(8);
    const held = await stickState(page);
    expect(held.active).toBe(true);
    expect(held.held).toContain('down');
    const c = centerOf(held.rect);
    expect(Math.abs(c.x - at.x), 'основа під пальцем по x').toBeLessThan(1.5);
    expect(Math.abs(c.y - at.y), 'основа під пальцем по y').toBeLessThan(1.5);
    await touch(cdp, 'touchEnd');
    await expect.poll(async () => (await stickState(page)).held).toBe('');
    const after = await stickState(page);
    expect(after.active).toBe(false);
    expect(Math.abs(after.rect.left - rest.rect.left), 'повернулась у спокій: left').toBeLessThan(0.5);
    expect(Math.abs(after.rect.top - rest.rect.top), 'повернулась у спокій: top').toBeLessThan(0.5);
    await page.context().close();
  });

  for (const [name, x, y] of [['права половина екрана', Math.round(VP.width * 0.75), ZONE.y], ['шапка, рядок HUD', 60, 20]] as const) {
    test(`дотик поза зоною (${name}) джойстика не створює`, async ({ browser }) => {
      const { page, cdp } = await newPage(browser, VP);
      const rest = await stickState(page);
      await press(cdp, x, y, 0, 40);
      await page.waitForTimeout(150);
      const s = await stickState(page);
      expect(s.active, 'основа не активна').toBe(false);
      expect(s.held, 'жодного напрямку').toBe('');
      expect(s.rect.left).toBeCloseTo(rest.rect.left, 0);
      expect(s.rect.top).toBeCloseTo(rest.rect.top, 0);
      await touch(cdp, 'touchEnd');
      await page.context().close();
    });
  }

  for (const [name, sel] of [['☰', '[data-touch="story"]'], ['‖', '[data-touch="pause"]'], ['кнопка дії', '[data-touch="interact"]']] as const) {
    test(`дотик на ${name} джойстика не створює`, async ({ browser }) => {
      const { page, cdp } = await newPage(browser, VP);
      const rest = await stickState(page);
      const c = centerOf(await rectOf(page, sel));
      await touch(cdp, 'touchStart', c.x, c.y);
      await page.waitForTimeout(150);
      const s = await stickState(page);
      expect(s.active, 'основа не активна').toBe(false);
      expect(s.rect.left).toBeCloseTo(rest.rect.left, 0);
      expect(s.rect.top).toBeCloseTo(rest.rect.top, 0);
      await touch(cdp, 'touchEnd');
      await page.context().close();
    });
  }

  test('дотик на панелі (роль діалог) джойстика не створює', async ({ browser }) => {
    const { page, cdp } = await newPage(browser, VP);
    await page.locator('[data-touch="pause"]').tap();
    await expect(page.locator('[role="dialog"]').first()).toBeVisible();
    const rest = await stickState(page);
    // Без відведення пальця: основа під діалогом схована (visibility), і відведення саме знімає захоплення. Порожнє поле панелі при лівому краї — не на її кнопці.
    await touch(cdp, 'touchStart', 6, ZONE.y);
    await page.waitForTimeout(150);
    const s = await stickState(page);
    expect(s.active).toBe(false);
    expect(s.rect.left).toBeCloseTo(rest.rect.left, 0);
    await touch(cdp, 'touchEnd');
    await page.context().close();
  });

  // Усі шляхи скидання лишились і для плаваючої основи: після перерви рух зупинений і основа вдома.
  const breaks: Array<[string, (p: Page) => Promise<void>]> = [
    ['blur вікна', (p) => p.evaluate(() => { window.dispatchEvent(new Event('blur')); })],
    ['pagehide', (p) => p.evaluate(() => { window.dispatchEvent(new Event('pagehide')); })],
    ['visibilitychange у hidden', (p) => p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); })],
    ['відкрита панель role=dialog', (p) => p.locator('[data-touch="pause"]').evaluate((el) => { (el as HTMLElement).click(); })],
  ];
  for (const [name, doBreak] of breaks) {
    test(`${name} посеред утримання плаваючим джойстиком: напрямок знято, основа вдома`, async ({ browser }) => {
      const { page, cdp } = await newPage(browser, VP);
      const rest = await stickState(page);
      await press(cdp, ZONE.x, ZONE.y, 0, 50);
      await expect.poll(async () => (await stickState(page)).held).toContain('down');
      expect((await stickState(page)).active).toBe(true);
      await doBreak(page);
      await expect.poll(async () => (await stickState(page)).held, { message: 'напрямок знято' }).toBe('');
      const s = await stickState(page);
      expect(s.active).toBe(false);
      expect(Math.abs(s.rect.left - rest.rect.left)).toBeLessThan(0.5);
      expect(Math.abs(s.rect.top - rest.rect.top)).toBeLessThan(0.5);
      await page.context().close();
    });
  }
});

test.describe('кнопка дії за ціллю', () => {
  test('поруч нікого: idle і бліда, але натискається; біля Елізи: ready із значком розмови; біля вогнища: значок вогню; пішов — знову idle', async ({ browser }) => {
    const { page, cdp } = await newPage(browser, VP);
    const btn = page.locator('[data-touch="interact"]');
    await expect(btn).toHaveAttribute('data-state', 'idle');
    expect(await btn.evaluate((el) => Number(getComputedStyle(el).opacity)), 'idle блідий').toBeLessThan(0.6);
    expect((await probe(page)).nearKind).toBeNull();
    // Idle натискається: дотик нічого шкідливого не робить (жодної команди).
    const c0 = (await probe(page)).commandsSent;
    await btn.tap();
    await page.waitForTimeout(200);
    expect((await probe(page)).commandsSent, 'idle: команд нема').toBe(c0);

    await walkToEliza(page, cdp);
    await expect(btn).toHaveAttribute('data-state', 'ready');
    await expect(btn).toHaveAttribute('data-target', 'talk');
    expect(await btn.locator('svg').count(), 'значок розмови замість ●').toBe(1);
    expect(await btn.evaluate((el) => Number(getComputedStyle(el).opacity)), 'ready яскравий').toBe(1);
    const talkIcon = await btn.locator('path').getAttribute('d');

    // Вогнище (112,144) — вгору від Елізи: рід fire, значок інший.
    await driveUntil(page, cdp, 0, -50, (p) => p.nearObject === 'obj.campfire');
    expect((await probe(page)).nearObject).toBe('obj.campfire');
    await expect(btn).toHaveAttribute('data-target', 'fire');
    expect(await btn.locator('path').getAttribute('d'), 'значок вогню відрізняється від розмови').not.toBe(talkIcon);

    await driveUntil(page, cdp, 50, 0, (p) => p.nearObject === null);
    await expect(btn).toHaveAttribute('data-state', 'idle');
    expect(await btn.locator('svg').count()).toBe(0);
    await page.context().close();
  });
});

test.describe('тап по об\'єкту на канві', () => {
  /** Стан після взаємодії: кількість команд і чи відкрилась розмова/панель подорожі. */
  const outcome = async (page: Page): Promise<{ sent: number; panel: boolean }> => ({ sent: (await probe(page)).commandsSent, panel: (await page.locator('[data-ui="story"]').count()) > 0 });

  test('тап по Елізі в зоні дії відкриває розмову так само, як кнопка дії', async ({ browser }) => {
    const viaTap = await newPage(browser, VP);
    await walkToEliza(viaTap.page, viaTap.cdp);
    const s0 = await outcome(viaTap.page);
    expect(s0.panel).toBe(false);
    const at = await screenOf(viaTap.page, ELISE.x, ELISE.y - 24);
    await viaTap.page.touchscreen.tap(at.x, at.y);
    await expect(viaTap.page.locator('[data-ui="story"]')).toBeVisible();
    const tapped = await outcome(viaTap.page);
    expect(tapped.sent - s0.sent, 'тап: рівно одна команда (Talk)').toBe(1);
    await viaTap.page.context().close();

    const viaBtn = await newPage(browser, VP);
    await walkToEliza(viaBtn.page, viaBtn.cdp);
    const b0 = await outcome(viaBtn.page);
    await viaBtn.page.locator('[data-touch="interact"]').tap();
    await expect(viaBtn.page.locator('[data-ui="story"]')).toBeVisible();
    const pressed = await outcome(viaBtn.page);
    expect(pressed.sent - b0.sent, 'кнопка: рівно одна команда — та сама').toBe(1);
    await viaBtn.page.context().close();
  });

  test('тап по Елізі поза зоною дії нічого не робить (без шляху до неї): команд нема, панелі нема, персонаж стоїть', async ({ browser }) => {
    const { page, cdp } = await newPage(browser, VP);
    // На старті Eліза поза кадром (портрет): підходимо ліворуч так, щоб її було видно, але вона ще далеко від зони дії.
    await driveUntil(page, cdp, -50, 0, (p) => p.playerX <= 165);
    await driveUntil(page, cdp, 0, 50, (p) => p.playerY >= 215);
    // Спершу дочекатися, поки персонаж зупиниться: на повільному CI він ще котився після відпускання стіка, і зсув
    // «після тапу» був інерцією, а не ходом до Елізи (CI PR #65 і #69). Те саме очікування, що й у world.spec.
    await expect.poll(async () => { const a = await probe(page); await page.waitForTimeout(120); const b = await probe(page); return Math.hypot(a.playerX - b.playerX, a.playerY - b.playerY); }, { timeout: 10_000 }).toBeLessThan(0.1);
    const p0 = await probe(page);
    expect(p0.nearObject, 'Елізи поруч нема').toBeNull();
    const at = await screenOf(page, ELISE.x, ELISE.y - 24);
    expect(at.x, 'Еліза в кадрі (інакше тап був би порожнім)').toBeGreaterThan(0);
    expect(at.x).toBeLessThan(VP.width);
    expect(at.y).toBeLessThan(VP.height);
    await page.touchscreen.tap(at.x, at.y);
    await page.waitForTimeout(500);
    const p1 = await probe(page);
    expect(p1.commandsSent).toBe(p0.commandsSent);
    await expect(page.locator('[data-ui="story"]')).toHaveCount(0);
    expect(Math.hypot(p1.playerX - p0.playerX, p1.playerY - p0.playerY), 'персонаж не пішов').toBeLessThan(2);
    await page.context().close();
  });

  test('тап, що не дочекався кадру до паузи, після «Продовжити» не спрацьовує (рецензія)', async ({ browser }) => {
    const { page, cdp } = await newPage(browser, VP);
    await walkToEliza(page, cdp);
    const p0 = await probe(page);
    const at = await screenOf(page, ELISE.x, ELISE.y - 24);
    // Тап по Елізі й пауза — в одному завданні сторінки: пауза ставиться з обробника того самого touchend (після канви Phaser),
    // тож кадру update між тапом і паузою немає, тап лишається непрочитаним. Дотик — справжній (CDP), синтетичний TouchEvent Phaser не бачить.
    await page.evaluate(() => window.addEventListener('touchend', () => (document.querySelector('[data-touch="pause"]') as HTMLElement).click(), { once: true }));
    await touch(cdp, 'touchStart', at.x, at.y);
    await touch(cdp, 'touchEnd');
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    expect((await probe(page)).commandsSent, 'на паузі тап не спрацював').toBe(p0.commandsSent);
    await page.getByRole('button', { name: 'Продовжити' }).tap();
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
    await page.waitForTimeout(500);
    expect((await probe(page)).commandsSent, 'старий тап не надіслав команди').toBe(p0.commandsSent);
    await expect(page.locator('[data-ui="story"]')).toHaveCount(0);
    await page.context().close();
  });

  test('тап по порожньому місцю в зоні дії біля Елізи нічого не робить', async ({ browser }) => {
    const { page, cdp } = await newPage(browser, VP);
    await walkToEliza(page, cdp);
    const p0 = await probe(page);
    const at = await screenOf(page, ELISE.x + 70, ELISE.y - 20);   // поруч, але не по ній
    await page.touchscreen.tap(at.x, at.y);
    await page.waitForTimeout(500);
    expect((await probe(page)).commandsSent).toBe(p0.commandsSent);
    await expect(page.locator('[data-ui="story"]')).toHaveCount(0);
    await page.context().close();
  });
});

test.describe('підказка-тост', () => {
  const STABLE = ['.ui-header', '[data-ui="hud-place"]', '[data-ui="hud-time"]', '[data-touch="story"]', '[data-touch="pause"]', '#stage canvas'];
  const snap = (page: Page): Promise<Rect[]> => Promise.all(STABLE.map((q) => rectOf(page, q)));
  // Годинник іде (GAME-97: у ногу з реальним часом), і нова хвилина може бути ширшою на гліф (main: 3 падіння з 30, +2,9 px).
  // Це не стрибок розкладки: для годинника звіряємо місце й висоту, а ширину — ні.
  const same = (a: Rect[], b: Rect[]): void => STABLE.forEach((q, i) => {
    const keys = q === '[data-ui="hud-time"]' ? (['top', 'left', 'height'] as const) : (['top', 'left', 'height', 'width'] as const);
    for (const k of keys) expect(Math.abs((a[i] as Rect)[k] - (b[i] as Rect)[k]), `${q}: ${k}`).toBeLessThan(0.5);
  });

  test('сама зникає не пізніше ніж за 6 с; шапка, місце, годинник, кнопки й поле не рухаються; role=status', async ({ browser }) => {
    const { page } = await newPage(browser, VP, { hintSeen: false });
    const hint = page.locator('[data-ui="hint"]');
    await expect(hint).toBeVisible();
    expect(await hint.getAttribute('role')).toBe('status');
    const t0 = Date.now();
    const withToast = await snap(page);
    await expect(hint).toHaveCount(0, { timeout: 6500 });
    const gone = Date.now() - t0;
    expect(gone, `зникла за ${gone} мс`).toBeLessThanOrEqual(6000);
    same(withToast, await snap(page));
    await page.context().close();
  });

  test('зникає на першу дію гравця (дотик), не чекаючи таймера; розкладка не стрибає', async ({ browser }) => {
    const { page, cdp } = await newPage(browser, VP, { hintSeen: false });
    const hint = page.locator('[data-ui="hint"]');
    await expect(hint).toBeVisible();
    const withToast = await snap(page);
    const t0 = Date.now();
    await press(cdp, ZONE.x, ZONE.y, 0, 50);
    await expect(hint).toHaveCount(0, { timeout: 1500 });
    expect(Date.now() - t0, 'раніше за таймер').toBeLessThan(3000);
    await touch(cdp, 'touchEnd');
    same(withToast, await snap(page));
    await page.context().close();
  });

  test('зникає на першу дію гравця (клавіша)', async ({ browser }) => {
    const { page } = await newPage(browser, VP, { hintSeen: false });
    await expect(page.locator('[data-ui="hint"]')).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('[data-ui="hint"]')).toHaveCount(0, { timeout: 1500 });
    await page.context().close();
  });
});
});
