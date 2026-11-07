// GAME-254 (S13) · «Менше здоровенних пікселів, більше світу»: цілий масштаб підібрано так, щоб справжній зріст героя (непрозорі рядки кадру,
// probe.heroBody = 49) займав ≈ 1/9 висоти поля: ПК 1280×800 → zoom 2 (≈ 0,12), телефон вбік 932×430 / 844×390 лишають zoom 2
// (OD-030, власник 07.11: на телефоні крупніше, як у Долині). Дробового zoom немає: пікселі лишаються чіткими. Сторч 390×844 і 1:1 — діапазон лишається читабельним.
// Мутація (старий frameSize: k = max(⌈w/640⌉, ⌈h/384⌉)) → червоніє частка зросту й кількість тайлів. Мутація «без кольору землі»
// (камера не фарбує смуги) → червоніє «чорної діри за мапою нема».
// Знімки — лише G254_SHOTS=1 (G254_TAG=before|after) у research/game-254, не на критичному шляху.
import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { probe } from './chapter-driver';
import { HERO_BODY_PX } from '../../src/view/world/frame';
import { seedDay1 } from './day1-fixture';

const SHOTS = process.env.G254_SHOTS === '1' ? 'research/game-254' : null;
const TAG = process.env.G254_TAG ?? 'after';
interface Case { readonly w: number; readonly h: number; readonly touch: boolean; readonly zoom: number; readonly lo: number; readonly hi: number; readonly tiles: number }
// zoom — очікуваний цілий масштаб; lo..hi — частка висоти поля, яку займає зріст героя; tiles — мінімум видимих клітинок 32×32 (було: див. «до» у PR).
const CASES: readonly Case[] = [
  { w: 1280, h: 800, touch: false, zoom: 2, lo: 0.10, hi: 0.125, tiles: 230 },
  { w: 932, h: 430, touch: true, zoom: 2, lo: 0.20, hi: 0.25, tiles: 90 },   // OD-030: телефон вбік — масштаб як був
  { w: 844, h: 390, touch: true, zoom: 2, lo: 0.22, hi: 0.27, tiles: 75 },   // OD-030
  { w: 390, h: 844, touch: true, zoom: 2, lo: 0.09, hi: 0.13, tiles: 70 },
  { w: 600, h: 600, touch: false, zoom: 1, lo: 0.07, hi: 0.16, tiles: 90 },
];

async function open(page: Page, query: string, edit?: (s: string) => string): Promise<void> {
  await seedDay1(page, query, edit);
  await page.addStyleTag({ content: '.ui-talk{display:none}' });
}
const shot = async (page: Page, name: string): Promise<void> => { if (!SHOTS) return; mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${TAG}-${name}.png` }); };

for (const c of CASES) {
  test(`GAME-254 ${c.w}×${c.h}: zoom ${c.zoom} цілий, зріст героя ${c.lo}–${c.hi} висоти, видно ≥ ${c.tiles} клітинок`, async ({ browser }) => {
    test.setTimeout(120_000);
    const ctx = await browser.newContext({ viewport: { width: c.w, height: c.h }, hasTouch: c.touch, isMobile: c.touch });
    const page = await ctx.newPage();
    await open(page, '?mapFirst=1&seed=1');
    await shot(page, `${c.w}x${c.h}-camp`);
    const p = await probe(page);
    const k = p.view.zoom;
    expect(Number.isInteger(k), `zoom ${k} цілий (чіткі пікселі)`).toBe(true);
    expect(k, `zoom для ${c.w}×${c.h}`).toBe(c.zoom);
    expect(p.heroBody, 'зріст героя з текстури = HERO_BODY_PX у frame.ts').toBe(HERO_BODY_PX);
    const frac = (p.heroBody * k) / c.h;
    expect(frac, `зріст героя ${p.heroBody * k} px з ${c.h} = ${frac.toFixed(3)}`).toBeGreaterThanOrEqual(c.lo);
    expect(frac, `зріст героя ${p.heroBody * k} px з ${c.h} = ${frac.toFixed(3)}`).toBeLessThanOrEqual(c.hi);
    const tiles = (p.view.w * p.view.h) / 1024;
    expect(tiles, `видно ${tiles.toFixed(0)} клітинок`).toBeGreaterThanOrEqual(c.tiles);
    // Полотно на екрані = кадр × k, цілим числом, і покриває поле.
    const cv = await page.evaluate(() => { const r = (document.querySelector('canvas') as HTMLCanvasElement).getBoundingClientRect(); return { w: r.width, h: r.height }; });
    expect(cv.w, 'ширина полотна кратна zoom').toBe(Math.round(cv.w / k) * k);
    expect(cv.w).toBeGreaterThanOrEqual(c.w);
    if (c.w / c.h >= 1.2) expect(cv.h).toBeGreaterThanOrEqual(c.h);   // вузьке поле (GAME-91) — кадр ≤ мапи по висоті, як було
    // Камера в межах мапи (мапа табору більша за кадр): ні краю порожнечі.
    expect(p.view.x).toBeGreaterThanOrEqual(0);
    expect(p.view.y).toBeGreaterThanOrEqual(0);
    expect(p.view.x + p.view.w).toBeLessThanOrEqual(p.view.mapW + 0.5);
    expect(p.view.y + p.view.h).toBeLessThanOrEqual(p.view.mapH + 0.5);
    await ctx.close();
  });
}

// Мала мапа (крамниця 448×384) у широкому кадрі: що камера показує за мапою — колір землі, а не чорна діра.
for (const c of CASES.slice(0, 2)) {
  test(`GAME-254 ${c.w}×${c.h}: за малою мапою (крамниця) — не чорна діра на краях полотна`, async ({ browser }) => {
    test.setTimeout(120_000);
    const ctx = await browser.newContext({ viewport: { width: c.w, height: c.h }, hasTouch: c.touch, isMobile: c.touch });
    const page = await ctx.newPage();
    await open(page, '?mapFirst=1&seed=1&map=shop');
    await expect.poll(async () => (await probe(page)).map, { timeout: 15_000 }).toBe('shop');
    await page.addStyleTag({ content: '#ui{display:none !important}' });
    await expect.poll(async () => (await probe(page)).view.mapW, { timeout: 5_000 }).toBe(448);
    const p = await probe(page);
    expect(p.view.w, `кадр ${p.view.w} ширший за мапу 448 — смуги є, перевіряємо їх`).toBeGreaterThan(448);
    await shot(page, `${c.w}x${c.h}-shop`);
    const png = (await page.screenshot()).toString('base64');
    const black = await page.evaluate(async (b64) => {
      const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
      const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
      const g = cv.getContext('2d') as CanvasRenderingContext2D; g.drawImage(img, 0, 0);
      const dark = (x: number, y: number): boolean => { const [r = 0, gg = 0, b = 0, a = 0] = Array.from(g.getImageData(x, y, 1, 1).data); return r + gg + b < 6 || a < 255; };
      const out: string[] = [];
      for (let x = 0; x < img.width; x += 4) for (const y of [0, img.height - 1]) { if (dark(x, y)) out.push(`${x},${y}`); }
      for (let y = 0; y < img.height; y += 4) for (const x of [0, img.width - 1]) { if (dark(x, y)) out.push(`${x},${y}`); }
      return out;
    }, png);
    expect(black.slice(0, 5), `чорних/прозорих пікселів на краях: ${black.length}`).toEqual([]);
    await ctx.close();
  });
}
