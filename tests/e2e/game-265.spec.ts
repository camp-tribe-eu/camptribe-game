// GAME-265 · вступ, полірування (QA Fable 05.11), обидві орієнтації: 390×844 і 932×430. Усе за станом/DOM, без таймерів-очікувань:
// 1) зарядку шукаємо дотиком по ОБ'ЄКТАХ кімнати (торшер, вікно, полиця) — прозорі зони на місцях, де об'єкти намальовані (intro-geometry.ts), а не три текстові кнопки;
// 2) «Ніч» — кімната видна під темним тоном (піксельна перевірка знімка: не чорний екран);
// 3) холодний початок — речення з'являється ЦІЛИМ у момент, коли біт починається (спостерігач мутацій), і вміщається в екран;
// 4) у виборі героя вступ не пропонує «самостійного дослідника», а вступ із родинним героєм проходиться до кінця;
// 5) картка «Субота, 08:00» не перекриває жодного персонажа (рамка картки ∩ рамка Джорджа/тата й решти = ∅).
// Закон 1 (мутації, 06.11): (2) повернути `.ui-intro[data-kind="night"] .ui-intro-room { opacity: 0 }`; (3) повернути друк літера за літерою в cold-open.ts;
// (4) прибрати фільтр introHeroes у Intro.tsx; (5) прибрати `margin: 0 0 0 auto` картки в index.html; (1) повернути кнопки `.ui-btn` без geometry-позицій.
// Знімки до/після: G265_SHOTS=before|after → research/game-265/ (не на критичному шляху).
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { roomGeometry, type Rect } from '../../src/view/intro-geometry';
import { introTo, walkIntro } from './intro-walk';
import { waitGameReady } from './ready';

test.use({ deviceScaleFactor: 1 });
const VIEWS = [{ side: 'portrait', w: 390, h: 844 }, { side: 'landscape', w: 932, h: 430 }] as const;
const TAG = process.env.G265_SHOTS;
const uk = JSON.parse(readFileSync(new URL('../../src/i18n/uk.json', import.meta.url), 'utf8')) as Record<string, string>;

const meets = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
async function box(page: Page, sel: string): Promise<Rect> {
  const b = await page.locator(sel).first().boundingBox();
  if (!b) throw new Error(`немає рамки для ${sel}`);
  return { x: b.x, y: b.y, w: b.width, h: b.height };
}
async function shot(page: Page, name: string, w: number, h: number): Promise<void> {
  if (TAG) await page.screenshot({ path: `research/game-265/${TAG}-${name}-${w}x${h}.png` });
}
async function open(page: Page, v: { w: number; h: number }, q = 'intro=1&seed=1'): Promise<void> {
  await page.setViewportSize({ width: v.w, height: v.h });
  await page.goto(`/?${q}`);
  await waitGameReady(page);
}

for (const v of VIEWS) {
  test(`зарядка: дотик по об'єктах кімнати ${v.side}`, async ({ page }) => {
    await open(page, v);
    await introTo(page, 'search');
    const spots = page.locator('[data-ui="intro-spot"]');
    await expect(spots).toHaveCount(3);
    expect(await page.locator('[data-ui="intro-spots"] .ui-btn').count(), 'об\'єкти — не текстові кнопки').toBe(0);
    const g = roomGeometry(v.w, v.h);
    for (const sp of ['lamp', 'window', 'shelf'] as const) {
      const b = await box(page, `[data-spot="${sp}"]`);
      const want = g[sp];
      expect(Math.abs(b.x - want.x) + Math.abs(b.y - want.y), `${sp}: зона там, де об'єкт намальований`).toBeLessThanOrEqual(2);
      expect(b.w >= 44 && b.h >= 44 && b.x >= 0 && b.y >= 0 && b.x + b.w <= v.w && b.y + b.h <= v.h, `${sp}: ≥44 px і в екрані`).toBe(true);
    }
    await shot(page, 'search', v.w, v.h);
    await page.locator('[data-spot="lamp"]').click();
    await expect(page.locator('[data-spot="lamp"]')).toHaveAttribute('data-seen', 'yes');
    await expect(page.locator('[data-ui="line"]')).toContainText(uk['intro.spot.lamp.line'] as string);
    await page.waitForTimeout(280);   // 250 мс між дотиками (захист від подвійного тапу)
    await page.locator('[data-spot="shelf"]').click();
    await expect(page.locator('[data-ui="letter"]')).toBeVisible();
  });

  test(`«Ніч»: кімната видна під тоном, текст читний ${v.side}`, async ({ page }) => {
    await open(page, v);
    await introTo(page, 'night');
    await expect(page.locator('[data-ui="intro-caption"]')).toBeVisible();
    const b64 = (await page.screenshot()).toString('base64');
    const m = await page.evaluate(async (data) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const x = c.getContext('2d') as CanvasRenderingContext2D;
      x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      let lit = 0;
      const colors = new Set<number>();
      for (let i = 0; i < d.length; i += 16) { if ((d[i] as number) + (d[i + 1] as number) + (d[i + 2] as number) > 90) lit++; colors.add((((d[i] as number) >> 4) << 8) | (((d[i + 1] as number) >> 4) << 4) | ((d[i + 2] as number) >> 4)); }
      return { lit: lit / (d.length / 16), colors: colors.size };
    }, b64);
    expect(m.lit, `ніч: частка світліших пікселів ${m.lit.toFixed(3)}`).toBeGreaterThan(0.08);
    expect(m.colors, `ніч: кольорів ${m.colors}`).toBeGreaterThan(12);
    await shot(page, 'night', v.w, v.h);
  });

  test(`холодний початок: ціле речення, не обірване ${v.side}`, async ({ page }) => {
    await page.setViewportSize({ width: v.w, height: v.h });
    await page.goto('/?intro=1&coldOpen=1&seed=1');
    await waitGameReady(page);
    // Спостерігач ставимо ДО «Почати»: на кожну зміну в кіно запам'ятовуємо (біт, текст) підпису — перший непорожній запис біта мусить бути цілим реченням.
    await page.evaluate(() => {
      const root = document.querySelector('[data-ui="cold-open"]') as HTMLElement;
      const w = window as unknown as { __cap: { beat: string; text: string }[] };
      w.__cap = [];
      new MutationObserver(() => {
        const el = root.querySelector<HTMLElement>('[data-ui="cold-caption"]');
        if (el) w.__cap.push({ beat: el.dataset['beat'] ?? '', text: el.textContent ?? '' });
      }).observe(root, { childList: true, characterData: true, subtree: true, attributes: true });
    });
    await page.locator('[data-ui="cold-open-start"]').click();
    const cap = page.locator('[data-ui="cold-caption"]');
    await expect(cap).toHaveAttribute('data-beat', 'window');   // перший біт: тим самим шляхом друкується й «family» (його черга настає через 7 с)
    await expect(cap).toHaveText(uk['cold.window'] as string);
    const log = await page.evaluate(() => (window as unknown as { __cap: { beat: string; text: string }[] }).__cap);
    const first = log.find((e) => e.beat === 'window' && e.text !== '');
    expect(first?.text, 'перший показаний рядок біта — ціле речення, а не обірваний початок').toBe(uk['cold.window']);
    const b = await box(page, '[data-ui="cold-caption"]');
    expect(b.x >= 0 && b.x + b.w <= v.w && b.y >= 0 && b.y + b.h <= v.h, 'підпис у межах екрана').toBe(true);
    expect(await cap.evaluate((e) => e.scrollHeight <= e.clientHeight + 1 && e.scrollWidth <= e.clientWidth + 1), 'підпис без обрізання').toBe(true);
    await shot(page, 'cold-window', v.w, v.h);
  });

  test(`вибір героя: лише родина, вступ проходиться ${v.side}`, async ({ page }) => {
    await open(page, v);
    await introTo(page, 'pick');
    const opts = page.locator('[data-act="create"]');
    expect(await opts.count()).toBeGreaterThan(0);
    const texts = await opts.allTextContents();
    expect(texts.filter((t) => /Самостій|explorer|Велосипед|Bike/i.test(t)), `у виборі немає соло: ${texts.join(' | ')}`).toEqual([]);
    await shot(page, 'pick', v.w, v.h);
    await walkIntro(page, /./);   // обрати першого родинного героя й дійти до кінця вступу без тупика
    await expect(page.locator('[data-ui="intro"]')).toHaveCount(0);
  });

  test(`картка «Субота, 08:00» не лягає на персонажів ${v.side}`, async ({ page }) => {
    await open(page, v);
    await introTo(page, 'morning');
    const card = await box(page, '[data-ui="intro-morning"]');
    const g = roomGeometry(v.w, v.h);
    expect(card.x >= 0 && card.x + card.w <= v.w && card.y >= 0 && card.y + card.h <= v.h, 'картка в екрані').toBe(true);
    for (const who of ['victoria', 'matthew', 'george'] as const) expect(meets(card, g.cast(who, true)), `картка не перекриває ${who}`).toBe(false);
    await shot(page, 'morning', v.w, v.h);
  });
}
