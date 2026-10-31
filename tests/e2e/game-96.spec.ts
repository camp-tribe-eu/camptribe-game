// GAME-96 · телефон грають В ОБОХ положеннях (рішення власника 24.10, як Stardew Valley mobile); накладки «Поверни» немає.
// 1) Вбік: ☰, ‖, джойстик, кнопка дії ≥ 16 px від країв (і ≥ вирізу збоку); рамка «день · час · гроші» — у верхній правій чверті й не
//    перекриває ☰/‖; мапа ≥ 85 % висоти. 2) Різні пропорції (9:16, 1:1, 16:9; з дотиком і без): нічого не вилізло за екран, цілі ≥ 44 px,
//    гра керується. 3) Поворот сторч → вбік → сторч: стан живий, годинник іде, пауза не ставиться.
// Сторч-розкладку тримають game-91/92/95 без змін. Негативні контролі (мутації) — у звіті картки.
import { expect, test, type Browser, type CDPSession, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { waitGameReady } from './ready';
/** Розмір мапи кемпінгу, px (GAME-172: 40×24 клітинки по 32 — було 640×384); з файлу мапи, а не числом у тесті. */
const CAMP = JSON.parse(readFileSync(new URL('../../public/maps/camp-lake.tmj', import.meta.url), 'utf8')) as { width: number; height: number; tilewidth: number; tileheight: number };
const MAP_W = CAMP.width * CAMP.tilewidth;
const MAP_H = CAMP.height * CAMP.tileheight;

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
  await waitGameReady(page);
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
    // Краї екрана (чверть, середина і три чверті висоти) — пікселі мапи, не тло смуг: УСІ шість точок (рецензія PR #77: «≥ 2 з 3»
    // пропускало б смугу в дві третини висоти). Якщо тінь дерева колись впаде на край — це червоний тест і привід підвинути точку, не послабити.
    const ys = [0.25, 0.5, 0.75].map((f) => Math.round(vp.height * f));
    const px = await pixels(page, [...ys.map((y) => [1, y] as const), ...ys.map((y) => [vp.width - 2, y] as const)]);
    expect(px.length).toBe(6);
    expect(px.slice(0, 3).filter((p) => BG.has(p)).length, `лівий край — мапа: ${px.slice(0, 3).join(' | ')}`).toBe(0);
    expect(px.slice(3).filter((p) => BG.has(p)).length, `правий край — мапа: ${px.slice(3).join(' | ')}`).toBe(0);
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
    // Камера в межах мапи: їдемо вниз і вправо, доки камера не дійде до межі (чекаємо СТАН, а не час); кожен зразок scroll ∈ [0, мапа − кадр].
    // Без setBounds камера йшла б за персонажем за межу мапи і зразок вийшов би з проміжку; без обмеження кадру мапою maxX/maxY < 0.
    const scroll = (): Promise<{ x: number; y: number }> => page.evaluate(() => { const p = (window as unknown as { __game: { probe: { cameraScrollX: number; cameraScrollY: number } } }).__game.probe; return { x: p.cameraScrollX, y: p.cameraScrollY }; });
    const maxX = MAP_W - buf.w; const maxY = MAP_H - buf.h;   // GAME-172: мапа з файлу (1280×768)
    const seen: { x: number; y: number }[] = [];
    for (const [key, dir] of [['ArrowDown', 'y'], ['ArrowRight', 'x']] as const) {
      await page.keyboard.down(key);
      // Стан, не час: камера дійшла до межі АБО персонаж упёрся в перешкоду (10 однакових зразків поспіль) — далі їхати нікуди.
      let still = 0; let anchor = await pos(page);
      await expect.poll(async () => {
        const s = await scroll(); seen.push(s);
        const p = await pos(page);
        if (Math.hypot(p.x - anchor.x, p.y - anchor.y) < 0.5) still++; else { still = 0; anchor = p; }   // дрижання колізії < 0,5 px — теж «стоїть
        return s[dir] >= (dir === 'x' ? maxX : maxY) - 0.01 || still >= 10;
      }, { message: `камера дійшла до межі ${dir} або персонаж упёрся`, timeout: 20_000, intervals: [50] }).toBe(true);
      await page.keyboard.up(key);
    }
    for (const s of seen) {
      expect(s.x, `scrollX ∈ [0, ${maxX}]`).toBeGreaterThanOrEqual(0); expect(s.x, `scrollX ∈ [0, ${maxX}]`).toBeLessThanOrEqual(maxX + 0.01);
      expect(s.y, `scrollY ∈ [0, ${maxY}]`).toBeGreaterThanOrEqual(0); expect(s.y, `scrollY ∈ [0, ${maxY}]`).toBeLessThanOrEqual(maxY + 0.01);
    }
    const end = await scroll();
    if (maxY > 0) expect(end.y, 'камера дійшла до нижньої межі мапи (тест доводить межу)').toBeGreaterThan(0);
    if (vp.width === 1920 && vp.height === 1080) await page.screenshot({ path: `${SHOTS}/game-96-1920x1080-game.png` });
  });
}

// GAME-96, рецензія PR #77 №3: сторч затверджено «як було на main» — полотно заповнює поле так само. Було (FIT) і є (NONE + zoom):
// полотно від лівого верхнього кута поля, ширина = ⌊поле / k⌋·k (≥ поле − k), висота = min(мапа, поле / k)·k; нижче полотна — вільне місце під
// дотикові кнопки (GAME-89 №4), це тло сторінки за задумом. Сторож: полотно не менше за задум, і ВСІ краї ПОЛОТНА (низ, право) — мапа.
// Негативний контроль (мутація): zoom 1 у вузькій гілці frameSize → полотно удвічі менше → червоніє.
const PORTRAIT: Vp[] = [{ width: 390, height: 844 }, { width: 375, height: 667 }, { width: 360, height: 800 }, { width: 412, height: 915 }];
for (const vp of PORTRAIT) {
  test(`сторч ${vp.width}×${vp.height}: полотно заповнює поле як на main, краї полотна — мапа, а не тло`, async ({ browser }) => {
    const { page } = await open(browser, vp, true);
    const k = Math.max(1, Math.round((await rect(page, '#stage')).height / 384));
    const st = await rect(page, '#stage');
    const want = { w: Math.floor(vp.width / k) * k, h: Math.min(384, Math.floor(st.height / k)) * k };
    await expect.poll(async () => { const c = await rect(page, '#stage canvas'); return c.width >= want.w - 1 && c.height >= want.h - 1; }, { message: `полотно ≥ ${want.w}×${want.h}`, timeout: 15_000 }).toBe(true);
    const c = await rect(page, '#stage canvas');
    expect(c.left, 'зліва від краю поля').toBeLessThanOrEqual(0.5);
    expect(c.top - st.top, 'зверху від краю поля').toBeLessThanOrEqual(0.5);
    expect(c.right, 'вправо — ширина поля з точністю до k px').toBeGreaterThanOrEqual(vp.width - k - 0.5);
    // Смуга тла вздовж краю була б ~100 % точок; поодинокі темні пікселі спрайтів на краю (контур об'єкта = колір тла) — ні: тож рахуємо частку по всій довжині краю.
    const along = (from: number, len: number): number[] => Array.from({ length: Math.floor(len / 6) - 1 }, (_, i) => Math.round(from + 3 + i * 6));
    const px = await pixels(page, [...along(c.left, c.width).map((x) => [x, Math.floor(c.bottom) - 2] as const), ...along(c.top, c.height).map((y) => [Math.floor(c.right) - 2, y] as const)]);
    const nb = along(c.left, c.width).length;
    const bgShare = (a: string[]): number => a.filter((p) => BG.has(p)).length / a.length;
    expect(bgShare(px.slice(0, nb)), `низ полотна — мапа, частка тла ${bgShare(px.slice(0, nb))}`).toBeLessThan(0.15);
    expect(bgShare(px.slice(nb)), `правий край полотна — мапа, частка тла ${bgShare(px.slice(nb))}`).toBeLessThan(0.15);
    if (vp.width === 390) await page.screenshot({ path: `${SHOTS}/game-96-390x844-portrait.png` });
  });
}

// GAME-96, рецензія PR #77 №5: при zoom ≥ 2 тап і джойстик працюють у СВІТОВИХ координатах (getWorldPoint / displayScale), а не в екранних.
// 844×390 → zoom 2, 1920×1080 → zoom 3. Тап по Елізі в зоні дії відкриває розмову, тап по ній ПОЗА зоною — нічого; джойстик веде куди тягнеш.
// Мутація: тап береться в екранних координатах, а не getWorldPoint (камера + zoom ігноруються) → «відкриває розмову» червоніє.
const ZOOMED: Vp[] = [{ width: 844, height: 390 }, { width: 1920, height: 1080 }];
interface Pr { playerX: number; playerY: number; nearObject: string | null; commandsSent: number; cameraScrollX: number; cameraScrollY: number }
const probeOf = (page: Page): Promise<Pr> => page.evaluate(() => ({ ...(window as unknown as { __game: { probe: Pr } }).__game.probe }));
const ELISE = { x: 80, y: 272 };   // public/maps/camp-lake.tmj, npc.elise (ноги)
async function stickDrive(page: Page, cdp: CDPSession, dx: number, dy: number, until: (p: Pr) => boolean): Promise<void> {
  const y0 = Math.round((page.viewportSize()?.height ?? 800) * 0.5);
  await touchEv(cdp, 'touchStart', 70, y0);
  await touchEv(cdp, 'touchMove', 70 + dx, y0 + dy);
  try { await expect.poll(async () => until(await probeOf(page)), { timeout: 12_000, intervals: [16] }).toBe(true); }
  finally { await touchEv(cdp, 'touchEnd'); }
  await expect.poll(async () => { const a = await probeOf(page); await page.waitForTimeout(120); const b = await probeOf(page); return Math.hypot(a.playerX - b.playerX, a.playerY - b.playerY); }, { timeout: 10_000 }).toBeLessThan(0.1);
}
const screenOfWorld = async (page: Page, wx: number, wy: number): Promise<{ x: number; y: number }> => {
  const p = await probeOf(page);
  const c = await page.locator('#stage canvas').evaluate((el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, k: r.width / (el as HTMLCanvasElement).width }; });
  return { x: c.left + (wx - p.cameraScrollX) * c.k, y: c.top + (wy - p.cameraScrollY) * c.k };
};
for (const vp of ZOOMED) {
  test.describe(`zoom ≥ 2, ${vp.width}×${vp.height}`, () => {
    test('джойстик веде в той бік, куди тягнеш (вліво, вниз, вправо, вгору)', async ({ browser }) => {
      const { page, cdp } = await open(browser, vp, true);
      const k = (await rect(page, '#stage canvas')).width / (await page.locator('#stage canvas').evaluate((el) => (el as HTMLCanvasElement).width));
      expect(k, 'zoom ≥ 2').toBeGreaterThanOrEqual(2);
      // GAME-186: знімок стану з CI показав p0={x:0,y:0} — проба ще не мала героя (сцена не поставила його), тож «x спадає від 0» не наставало ніколи. Чекаємо готової проби.
      await expect.poll(async () => { const p = await probeOf(page); return p.playerX !== 0 || p.playerY !== 0; }, { message: 'проба має позицію героя', timeout: 10_000 }).toBe(true);
      for (const [dx, dy, axis, sign] of [[-50, 0, 'playerX', -1], [0, 50, 'playerY', 1], [50, 0, 'playerX', 1], [0, -50, 'playerY', -1]] as const) {
        const p0 = await probeOf(page);
        const need = (p: Pr): boolean => sign * (p[axis] - (axis === 'playerX' ? p0.playerX : p0.playerY)) > 12;
        await touchEv(cdp, 'touchStart', 70, Math.round(vp.height * 0.5));
        await touchEv(cdp, 'touchMove', 70 + dx, Math.round(vp.height * 0.5) + dy);
        try {
          await expect.poll(async () => need(await probeOf(page)), { message: `${axis} ${sign > 0 ? 'росте' : 'спадає'}`, timeout: 10_000, intervals: [30] }).toBe(true);
        } catch (e) {
          // GAME-186: рідкісний збій на CI (#127, #129) — знімок стану гри в лог, щоб знайти корінь (артефакти CI із сесії недоступні).
          const dump = await page.evaluate(() => {
            const p = (window as unknown as { __game?: { probe: Record<string, unknown> } }).__game?.probe ?? {};
            const pick = ['playerX', 'playerY', 'playerMoving', 'nearObject', 'nearKind', 'cameraScrollX', 'cameraScrollY', 'paused', 'fx', 'tent', 'fish'];
            const res = (p.residents as { id: string; x: number; y: number }[] | undefined) ?? [];
            const near = res.filter((r) => Math.hypot(r.x - Number(p.playerX), r.y - Number(p.playerY)) < 64);
            const panels = [...document.querySelectorAll('[data-ui]')].filter((el) => (el as HTMLElement).offsetParent !== null).map((el) => (el as HTMLElement).dataset.ui);
            return { ...Object.fromEntries(pick.map((k) => [k, p[k]])), residentsNear: near, panels, active: document.activeElement?.id || document.activeElement?.tagName };
          });
          console.log(`GAME-186 джойстик ${axis} p0=${JSON.stringify({ x: p0.playerX, y: p0.playerY })} стан=${JSON.stringify(dump)}`);
          throw e;
        }
        await touchEv(cdp, 'touchEnd');
        const p1 = await probeOf(page);
        const other = axis === 'playerX' ? 'playerY' : 'playerX';
        expect(Math.abs(p1[other] - p0[other]), `ортогональна вісь майже не зсунулась (${other})`).toBeLessThan(Math.abs(p1[axis] - p0[axis]));
        await expect.poll(async () => { const a = await probeOf(page); await page.waitForTimeout(120); const b = await probeOf(page); return Math.hypot(a.playerX - b.playerX, a.playerY - b.playerY); }, { timeout: 10_000 }).toBeLessThan(0.1);
      }
    });

    test('тап по Елізі в зоні дії відкриває розмову; тап по ній поза зоною — нічого', async ({ browser }) => {
      // Поза зоною: підходимо так, щоб Еліза була в кадрі, але далеко від зони дії.
      const out = await open(browser, vp, true);
      await stickDrive(out.page, out.cdp, -50, 0, (p) => p.playerX <= 165);
      await stickDrive(out.page, out.cdp, 0, 50, (p) => p.playerY >= 215);
      const o0 = await probeOf(out.page);
      expect(o0.nearObject, 'Елізи поруч нема').toBeNull();
      const far = await screenOfWorld(out.page, ELISE.x, ELISE.y - 24);
      expect(far.x, 'Еліза в кадрі').toBeGreaterThan(0); expect(far.x).toBeLessThan(vp.width); expect(far.y).toBeLessThan(vp.height);
      await out.page.touchscreen.tap(far.x, far.y);
      await out.page.waitForTimeout(400);   // нічого не станеться — чекати нема на що, крім відсутності події
      expect((await probeOf(out.page)).commandsSent, 'тап поза зоною: команд нема').toBe(o0.commandsSent);
      await expect(out.page.locator('[data-ui="story"]')).toHaveCount(0);
      await out.page.context().close();
      // В зоні.
      const inn = await open(browser, vp, true);
      await stickDrive(inn.page, inn.cdp, -50, 0, (p) => p.playerX <= 88);
      for (let i = 0; i < 6 && (await probeOf(inn.page)).nearObject !== 'npc.elise'; i++) await stickDrive(inn.page, inn.cdp, 0, i % 2 === 0 ? 50 : -50, (p) => p.nearObject === 'npc.elise');
      expect((await probeOf(inn.page)).nearObject).toBe('npc.elise');
      const n0 = await probeOf(inn.page);
      const at = await screenOfWorld(inn.page, ELISE.x, ELISE.y - 24);
      await inn.page.touchscreen.tap(at.x, at.y);
      await expect(inn.page.locator('[data-ui="story"]')).toBeVisible();
      expect((await probeOf(inn.page)).commandsSent - n0.commandsSent, 'тап: рівно одна команда (Talk)').toBe(1);
      await inn.page.context().close();
    });
  });
}
