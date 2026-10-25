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
    expect(frame.left, `рамка ${JSON.stringify(frame)}: правіше ☰`).toBeGreaterThanOrEqual((await rect(page, '[data-touch="story"]')).right + 8);
    expect(frame.bottom, 'рамка: низ вище середини висоти').toBeLessThanOrEqual(vp.height / 2);
    expect(frame.right, 'рамка: правий край у межах з вирізом').toBeLessThanOrEqual(vp.width - sides);
    expect(time.width, 'час видно').toBeGreaterThan(0);
    expect(money.width, 'гроші видно').toBeGreaterThan(0);
    const sR = await rect(page, '[data-touch="story"]');
    const pR = await rect(page, '[data-touch="pause"]');
    expect(intersects(frame, sR), 'рамка не на ☰').toBe(false);
    expect(intersects(frame, pR), 'рамка не на ‖').toBe(false);
    // Симетрія (смак власника): ‖ — дзеркало ☰; рамка — ліворуч від ‖ у тому ж ряду, проміжок ≥ 8.
    const mirror = (sv: Rect, pv: Rect, fr: Rect, w: number): void => {
      expect(Math.abs(sv.left - (w - pv.right)), `відступ збоку ☰ ${sv.left} vs ‖ ${w - pv.right}`).toBeLessThanOrEqual(2);
      expect(Math.abs(sv.top - pv.top), '‖ і ☰ на одній висоті').toBeLessThanOrEqual(2);
      expect(Math.abs(sv.width - pv.width), 'однакова ширина').toBeLessThanOrEqual(1);
      expect(Math.abs(sv.height - pv.height), 'однакова висота').toBeLessThanOrEqual(1);
      expect(fr.right, 'рамка ліворуч від ‖ з проміжком ≥ 8').toBeLessThanOrEqual(pv.left - 8);
      expect(Math.abs((fr.top + fr.bottom) / 2 - (pv.top + pv.bottom) / 2), 'рамка по центру з ‖').toBeLessThanOrEqual(2);
    };
    mirror(sR, pR, frame, vp.width);
    expect(Math.min(sR.width, sR.height, pR.width, pR.height), 'кнопки ≥ 44').toBeGreaterThanOrEqual(44);
    // Phaser перераховує масштаб полотна сам, із затримкою — чекаємо умову, а не фіксовану паузу (рецензія PR #53).
    const stageH = await page.locator('#stage').evaluate((el) => el.getBoundingClientRect().height);
    expect(stageH / vp.height, `поле гри ${stageH} із ${vp.height}: шапка лежить на мапі`).toBeGreaterThanOrEqual(0.99);
    await expect.poll(async () => (await page.locator('#stage canvas').evaluate((el) => el.getBoundingClientRect().height)) / vp.height,
      { message: 'полотно ≥ 85 % висоти', timeout: 10_000 }).toBeGreaterThanOrEqual(0.85);
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
    // GAME-96: полотно = ⌈поле / zoom⌉ · zoom — може виступати за поле на < zoom px, це ховає overflow #stage (видимого виступу немає).
    const zoom = async (): Promise<number> => page.locator('#stage canvas').evaluate((el) => el.getBoundingClientRect().width / (el as HTMLCanvasElement).width);
    await expect.poll(async () => (await rect(page, '#stage canvas')).bottom - (await zoom()), { timeout: 15_000 }).toBeLessThanOrEqual(c.vp.height + 0.5);
    const cv = await rect(page, '#stage canvas');
    expect(cv.right, 'полотно не виступає за поле більше ніж на zoom px').toBeLessThanOrEqual(c.vp.width + (await zoom()));
    expect(cv.left).toBeGreaterThanOrEqual(-0.5);
    expect(await page.locator('#stage').evaluate((el) => getComputedStyle(el).overflow), '#stage ховає виступ').toBe('hidden');
    const sels = ['[data-touch="story"]', '[data-touch="pause"]', '[data-ui="hud"]', ...(c.touch ? ['[data-touch="stick"]', '[data-touch="interact"]'] : [])];
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

// GAME-96 продовження (смак власника 25.10): вбік і на десктопі мапа на ВСЮ ширину екрана — без чорних смуг з боків; керування
// поверх мапи; камера в межах мапи (порожнечі немає); пікселі чіткі (цілий zoom, image-rendering: pixelated).
// Негативний контроль (мутація, звіт картки): старий кадр 640×352 під FIT → «≥ 99 % ширини» і «край — мапа» червоніють.
const BG = new Set(['27,31,35', '0,0,0']);   // тло сторінки #1b1f23 і тло Phaser #000000 — те, що видно у смугах
const FULL: { vp: Vp; touch: boolean }[] = [
  ...LANDSCAPE.map((vp) => ({ vp, touch: true })),
  { vp: { width: 1280, height: 800 }, touch: false }, { vp: { width: 1920, height: 1080 }, touch: false }, { vp: { width: 1280, height: 720 }, touch: false },
];
/** Колір пікселя скріншота сторінки (CSS px) у вигляді «r,g,b». */
async function pixels(page: Page, pts: readonly (readonly [number, number])[]): Promise<string[]> {
  const shot = await page.screenshot();
  return page.evaluate(async ([b64, list]) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    if (!ctx) return [];
    ctx.drawImage(img, 0, 0);
    return list.map(([x, y]) => { const d = ctx.getImageData(x, y, 1, 1).data; return `${d[0]},${d[1]},${d[2]}`; });
  }, [shot.toString('base64'), pts] as const);
}
for (const c of FULL) {
  test(`${c.vp.width}×${c.vp.height}${c.touch ? ' дотик' : ' десктоп'}: полотно ≥ 99 % ширини, краї — мапа, а не тло; керування не перетинається, цілі ≥ 44; камера в межах мапи; пікселі чіткі`, async ({ browser }) => {
    const { page } = await open(browser, c.vp, c.touch);
    const vp = c.vp;
    await expect.poll(async () => (await rect(page, '#stage canvas')).width / vp.width, { message: 'полотно ≥ 99 % ширини', timeout: 15_000 }).toBeGreaterThanOrEqual(0.99);
    await expect.poll(async () => (await rect(page, '#stage canvas')).height / vp.height, { message: 'полотно ≥ 99 % висоти', timeout: 15_000 }).toBeGreaterThanOrEqual(0.99);
    const cv = await rect(page, '#stage canvas');
    expect(cv.left, 'лівий край полотна на краю екрана').toBeLessThanOrEqual(0.5);
    expect(cv.top, 'верхній край полотна на краю екрана').toBeLessThanOrEqual(0.5);
    // Чіткі пікселі: цілий масштаб буфера → екран і nearest-neighbour.
    const buf = await page.locator('#stage canvas').evaluate((el) => ({ w: (el as HTMLCanvasElement).width, h: (el as HTMLCanvasElement).height, ir: getComputedStyle(el).imageRendering }));
    const k = cv.width / buf.w;
    expect(Math.abs(k - Math.round(k)), `масштаб ${k} цілий`).toBeLessThan(0.001);
    expect(buf.ir, 'image-rendering: pixelated').toBe('pixelated');
    // Порожнечі немає: кадр не більший за мапу 640×384, і камера з межами мапи не може показати поза нею.
    expect(buf.w, 'кадр не ширший за мапу').toBeLessThanOrEqual(640);
    expect(buf.h, 'кадр не вищий за мапу').toBeLessThanOrEqual(384);
    // Краї екрана (середина висоти, чверть і три чверті) — пікселі мапи, не тло смуг. Хоч один із трьох на кожному боці не тло
    // (тіні дерев на мапі бувають темні, але не три поспіль у колір тла).
    const ys = [0.25, 0.5, 0.75].map((f) => Math.round(vp.height * f));
    const px = await pixels(page, [...ys.map((y) => [1, y] as const), ...ys.map((y) => [vp.width - 2, y] as const)]);
    expect(px.length).toBe(6);
    expect(px.slice(0, 3).filter((p) => !BG.has(p)).length, `лівий край — мапа: ${px.slice(0, 3).join(' | ')}`).toBeGreaterThanOrEqual(2);
    expect(px.slice(3).filter((p) => !BG.has(p)).length, `правий край — мапа: ${px.slice(3).join(' | ')}`).toBeGreaterThanOrEqual(2);
    // Керування поверх мапи: ☰ зліва вгорі, рамка справа вгорі, ‖ під рамкою, джойстик знизу зліва, дія знизу справа; ніщо не перетинається, цілі ≥ 44.
    const sels = ['[data-touch="story"]', '[data-ui="hud"]', '[data-touch="pause"]', ...(c.touch ? ['[data-touch="stick"]', '[data-touch="interact"]'] : [])];
    const rects = await Promise.all(sels.map((s) => rect(page, s)));
    const pairs = rects.flatMap((a, i) => rects.slice(i + 1).map((b, j) => ({ a, b, name: `${sels[i]} ∩ ${sels[i + 1 + j]}` })));
    for (const { a, b, name } of pairs) expect(intersects(a, b), name).toBe(false);
    for (const [i, r] of rects.entries()) {
      expect(r.left, `${sels[i]} ліворуч`).toBeGreaterThanOrEqual(-0.5);
      expect(r.right, `${sels[i]} праворуч`).toBeLessThanOrEqual(vp.width + 0.5);
      expect(r.bottom, `${sels[i]} унизу`).toBeLessThanOrEqual(vp.height + 0.5);
      if (sels[i] !== '[data-ui="hud"]') expect(Math.min(r.width, r.height), `${sels[i]} ≥ 44`).toBeGreaterThanOrEqual(44);
    }
    const [story, hud, pause] = rects as [Rect, Rect, Rect, ...Rect[]];
    expect(story.right, '☰ у лівій половині').toBeLessThanOrEqual(vp.width / 2);
    expect(hud.left, 'рамка правіше ☰').toBeGreaterThanOrEqual(story.right + 8);
    expect(Math.abs(story.top - pause.top), '‖ і ☰ на одній висоті').toBeLessThanOrEqual(2);
    expect(Math.abs(story.left - (vp.width - pause.right)), '‖ дзеркало ☰').toBeLessThanOrEqual(2);
    expect(hud.right, 'рамка ліворуч від ‖ ≥ 8').toBeLessThanOrEqual(pause.left - 8);
    expect(pause.left, '‖ у правій половині').toBeGreaterThanOrEqual(vp.width / 2);
    if (c.touch) {
      const [, , , stick, act] = rects as [Rect, Rect, Rect, Rect, Rect];
      expect(stick.right, 'джойстик зліва').toBeLessThanOrEqual(vp.width / 2);
      expect(stick.top, 'джойстик унизу').toBeGreaterThanOrEqual(vp.height / 2);
      expect(act.left, 'дія справа').toBeGreaterThanOrEqual(vp.width / 2);
      expect(act.top, 'дія внизу').toBeGreaterThanOrEqual(vp.height / 2);
    }
    // Камера в межах мапи: їдемо вниз і вправо, доки є куди; scroll ніколи не виходить за [0, мапа − кадр].
    const scroll = (): Promise<{ x: number; y: number }> => page.evaluate(() => { const p = (window as unknown as { __game: { probe: { cameraScrollX: number; cameraScrollY: number } } }).__game.probe; return { x: p.cameraScrollX, y: p.cameraScrollY }; });
    const maxX = 640 - buf.w; const maxY = 384 - buf.h;
    for (const [key, dir] of [['ArrowDown', 'y'], ['ArrowRight', 'x']] as const) {
      await page.keyboard.down(key);
      const t0 = Date.now();
      while (Date.now() - t0 < 6_000) {
        const s = await scroll();
        expect(s.x, `scrollX ∈ [0, ${maxX}]`).toBeGreaterThanOrEqual(0); expect(s.x).toBeLessThanOrEqual(maxX + 0.01);
        expect(s.y, `scrollY ∈ [0, ${maxY}]`).toBeGreaterThanOrEqual(0); expect(s.y).toBeLessThanOrEqual(maxY + 0.01);
        if (s[dir] >= (dir === 'x' ? maxX : maxY) - 0.01) break;
      }
      await page.keyboard.up(key);
    }
    const end = await scroll();
    if (maxY > 0) expect(end.y, 'камера дійшла до нижньої межі мапи (тест доводить межу)').toBeGreaterThan(0);
    if (vp.width === 1920 && vp.height === 1080) await page.screenshot({ path: `${SHOTS}/game-96-1920x1080-game.png` });
  });
}
