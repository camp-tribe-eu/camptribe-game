// GAME-300 · дефекти, які власник знайшов у прев'ю: (1) гра не на весь екран на ПК (мапа крамниці 896 px зліва у вікні 2000×1086, решта — порожній фіолет);
// (2) у вступі герой і родина «висять у повітрі»: ноги на верхньому краї полиці, а не на підлозі.
// Усе за DOM/пікселями знімка, без таймерів-очікувань. Закон 1 (мутації, 11.11):
//  (1а) повернути у frameSize вузької гілки `Math.min(MAP_HEIGHT, …)` (висота полотна ≤ мапи) → «портрет 390×844: полотно покриває поле» червоне;
//  (1б) у coverMap повернути `return k0` → «ПК, крамниця: мапа покриває вікно» червоне (смуга фіолету праворуч);
//  (2а) у roomGeometry зсунути `castY = feetY - FEET_ROW - 20` і в intro-room.ts той самий зсув → «підошви на смузі підлоги» червоне (на місці підошов — стіна);
//  (2б) повернути `+ (id === 'matthew' && !opts.family ? 18 : 0)` у intro-room.ts → «Метью не наїжджає на полицю» червоне.
// Знімки до/після — research/game-300/.
import { expect, test, type Page } from '@playwright/test';
import { roomGeometry, type Rect } from '../../src/ui/intro-geometry';
import { introTo } from './intro-walk';
import { waitGameReady } from './ready';

const SETTINGS_KEY = 'camplife.settings.v1';
const SHOTS = process.env.G300_SHOTS;   // before|after → research/game-300/
interface View { readonly name: string; readonly w: number; readonly h: number; readonly touch: boolean }
const VIEWS: readonly View[] = [
  { name: 'portrait', w: 390, h: 844, touch: true }, { name: 'landscape', w: 932, h: 430, touch: true },
  { name: 'square', w: 800, h: 800, touch: false }, { name: 'desktop', w: 1600, h: 900, touch: false },
];
const BIG: View = { name: 'desktop2000', w: 2000, h: 1086, touch: false };

async function open(page: Page, v: View, q: string): Promise<void> {
  await page.setViewportSize({ width: v.w, height: v.h });
  await page.addInitScript(([k]) => { try { localStorage.setItem(k as string, JSON.stringify({ textScale: 100, language: 'uk', hintSeen: true })); } catch { /* сховища немає */ } }, [SETTINGS_KEY] as const);
  await page.goto(`/?${q}`);
  await waitGameReady(page);
}
async function rect(page: Page, sel: string): Promise<Rect> {
  const b = await page.locator(sel).first().boundingBox();
  if (!b) throw new Error(`немає рамки для ${sel}`);
  return { x: b.x, y: b.y, w: b.width, h: b.height };
}
/** Масштаб кадру = CSS-ширина полотна / його ширина в пікселях гри. */
const zoom = (page: Page): Promise<number> => page.evaluate(() => { const c = document.querySelector('#stage canvas') as HTMLCanvasElement; return Math.round(c.getBoundingClientRect().width / c.width); });

/** Різноманітність кольорів (квантовано до 4 біт) у смузі екрана: плоска заливка (порожній фон за мапою) дає 1–2 кольори, намальований світ — десятки. */
async function colours(page: Page, clip: { x: number; y: number; width: number; height: number }): Promise<number> {
  const b64 = (await page.screenshot({ clip })).toString('base64');
  return page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d') as CanvasRenderingContext2D;
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    const set = new Set<number>();
    for (let i = 0; i < d.length; i += 4) set.add((((d[i] as number) >> 4) << 8) | (((d[i + 1] as number) >> 4) << 4) | ((d[i + 2] as number) >> 4));
    return set.size;
  }, b64);
}

for (const v of [...VIEWS, BIG]) {
  for (const map of ['camp', 'shop'] as const) {
    test(`${v.name} ${v.w}×${v.h}, ${map}: полотно гри покриває поле — порожньої смуги немає`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: v.touch, isMobile: v.touch, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      await open(page, v, `seed=2&map=${map}`);
      const stage = await rect(page, '#stage');
      const cv = await rect(page, '#stage canvas');
      const k = await zoom(page);
      expect(Math.abs(stage.x), 'поле від лівого краю вікна').toBeLessThanOrEqual(0.5);
      expect(Math.abs(stage.x + stage.w - v.w), 'поле до правого краю вікна').toBeLessThanOrEqual(0.5);
      expect(Math.abs(stage.y + stage.h - v.h), 'поле до низу вікна').toBeLessThanOrEqual(0.5);
      expect(cv.x, 'полотно від лівого краю поля').toBeLessThanOrEqual(stage.x + 0.5);
      expect(cv.y, 'полотно від верху поля').toBeLessThanOrEqual(stage.y + 0.5);
      expect(cv.x + cv.w, `полотно до правого краю поля (${cv.w}×${cv.h} проти ${stage.w}×${stage.h}, ×${k})`).toBeGreaterThanOrEqual(stage.x + stage.w - 0.5);
      expect(cv.y + cv.h, `полотно до низу поля (${cv.w}×${cv.h} проти ${stage.w}×${stage.h}, ×${k})`).toBeGreaterThanOrEqual(stage.y + stage.h - 0.5);
      expect(cv.w - stage.w, 'зайве по ширині < zoom').toBeLessThan(k + 0.5);
      expect(cv.h - stage.h, 'зайве по висоті < zoom').toBeLessThan(k + 0.5);
      if (SHOTS) await page.screenshot({ path: `research/game-300/${SHOTS}-${map}-${v.name}.png` });
      await ctx.close();
    });
  }
}

for (const v of [VIEWS[3] as View, BIG]) {
  test(`ПК ${v.w}×${v.h}, крамниця: мапа покриває вікно — праворуч і знизу не порожній фон`, async ({ page }) => {
    await open(page, v, 'seed=2&map=shop');
    const stage = await rect(page, '#stage');
    const right = await colours(page, { x: stage.x + stage.w - 60, y: stage.y + 100, width: 56, height: stage.h - 200 });
    const bottom = await colours(page, { x: stage.x + 200, y: stage.y + stage.h - 40, width: stage.w - 400, height: 36 });
    expect(right, `права смуга: кольорів ${right} (плоский фон дає ≤ 2)`).toBeGreaterThan(6);
    expect(bottom, `нижня смуга: кольорів ${bottom} (плоский фон дає ≤ 2)`).toBeGreaterThan(6);
  });
}

// --- Вступ: ноги на підлозі, герой не на полиці ---------------------------------------------------------------------------------------------------------
/** Нейтрально-сірі світлі пікселі (кросівки Метью: 208/189/168 при r = g = b) у прямокутнику знімка. Стіна зеленувато-сіра, вікно кремове, підлога коричнева — не нейтральні. */
async function shoePixels(page: Page, r: Rect): Promise<number> {
  const b64 = (await page.screenshot({ clip: { x: r.x, y: r.y, width: r.w, height: r.h } })).toString('base64');
  return page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d') as CanvasRenderingContext2D;
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const lo = Math.min(d[i] as number, d[i + 1] as number, d[i + 2] as number);
      const hi = Math.max(d[i] as number, d[i + 1] as number, d[i + 2] as number);
      if (lo >= 150 && lo <= 230 && hi - lo <= 2) n++;
    }
    return n;
  }, b64);
}
const meets = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

for (const v of [...VIEWS, BIG]) {
  test(`вступ ${v.name} ${v.w}×${v.h}: підошви Метью — на смузі підлоги (знімок), тіло не на полиці`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: v.touch, isMobile: v.touch, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await open(page, v, 'intro=1&seed=1');
    await introTo(page, 'search');
    await page.locator('[data-ui="intro-room"]').waitFor();
    await page.waitForTimeout(150);   // кадр дощу намальований (rAF)
    const g = roomGeometry(v.w, v.h);
    const feet = g.feet('matthew', false);
    const body = g.body('matthew', false);
    // Знімок, а не лише геометрія: підошви справді намальовані там, де їх кладе roomGeometry (мутація зсуву якоря — червоне).
    const strip = { x: feet.x, y: Math.max(0, feet.y - feet.h), w: feet.w, h: feet.h * 2 };
    const onFeet = await shoePixels(page, strip);
    expect(onFeet, `кросівки (світлі пікселі) на місці підошов: ${onFeet}`).toBeGreaterThan(8);
    // Обидві стопи — по обидва боки від осі тіла (зсув героя вбік, як давні +18 px, лишає одну половину порожньою).
    const left = await shoePixels(page, { ...strip, w: strip.w / 2 });
    const rightHalf = await shoePixels(page, { ...strip, x: strip.x + strip.w / 2, w: strip.w / 2 });
    expect(Math.min(left, rightHalf), `ліва стопа ${left}, права ${rightHalf}: обидві в рамці підошов`).toBeGreaterThan(3);
    // Під підошвами — вже лише підлога: світлих малонасичених пікселів майже немає.
    const below = await shoePixels(page, { x: feet.x, y: feet.y + feet.h + feet.h, w: feet.w, h: feet.h });
    expect(below, `під підошвами лише підлога: ${below}`).toBeLessThan(onFeet / 4);
    // Лінія підлоги: підошви нижче за неї — стоять на підлозі, не на плінтусі/полиці.
    const floorTop = g.shelf.y + g.shelf.h;   // основа полиці = лінія підлоги + BASE_DROP
    expect(feet.y + feet.h, 'підошви глибше за основу полиці (стоять перед нею, на підлозі)').toBeGreaterThan(floorTop);
    expect(meets(body, g.shelf), 'тіло Метью не перекриває полицю').toBe(false);
    // Зона полиці (її дотикова рамка) на екрані та сама, що в геометрії, і герой із нею не перетинається у знімку DOM.
    const shelf = await rect(page, '[data-spot="shelf"]');
    expect(meets(body, shelf), 'тіло Метью не на дотиковій зоні полиці').toBe(false);
    if (SHOTS) await page.screenshot({ path: `research/game-300/${SHOTS}-intro-${v.name}.png` });
    await ctx.close();
  });
}

for (const v of VIEWS) {
  test(`вступ, ранок ${v.name} ${v.w}×${v.h}: Вікторія, Метью й Джордж стоять на підлозі`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: v.touch, isMobile: v.touch, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await open(page, v, 'intro=1&seed=1');
    await introTo(page, 'morning');
    const g = roomGeometry(v.w, v.h);
    for (const who of ['victoria', 'matthew', 'george'] as const) {
      const f = g.feet(who, true);
      expect(f.y + f.h, `${who} — підошви глибше за основу полиці`).toBeGreaterThan(g.shelf.y + g.shelf.h);
      expect(f.y + f.h, `${who} — підошви в екрані`).toBeLessThanOrEqual(v.h);
    }
    expect(meets(g.body('matthew', true), g.shelf), 'Метью не на полиці').toBe(false);
    if (SHOTS) await page.screenshot({ path: `research/game-300/${SHOTS}-morning-${v.name}.png` });
    await ctx.close();
  });
}
