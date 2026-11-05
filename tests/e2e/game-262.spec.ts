// GAME-262 · поворот телефону в таборі не перемотує день і не закриває сторінку (QA Fable 05.11: 10:48 → 22:01, друга зміна орієнтації — «page closed»).
import { expect, test } from '@playwright/test';
import { arriveInCamp } from './camp-arrival';
import { core } from './chapter-driver';

test('табір: поворот 390×844 → 844×390 → 390×844 — годинник ≤ кількох хвилин, без pageerror, сторінка жива', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = await arriveInCamp(page);
  page.on('crash', () => errors.push('crash'));
  page.on('close', () => errors.push('close'));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.waitForTimeout(500);
  const t0 = (await core(page)).clock.minutes;
  const t1s: number[] = [];
  for (const vp of [{ width: 844, height: 390 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(vp);
    // Кадри під час зміни розміру зупиняються (QA: полотно «замерзає»): імітуємо стоп головного потоку на 5 с — перший кадр після нього принесе дельту ~5000 мс.
    await page.evaluate(() => { const end = performance.now() + 5000; while (performance.now() < end) { /* стоп кадрів */ } });
    await page.waitForTimeout(1200);
    expect(page.isClosed(), 'сторінка жива').toBe(false);
    t1s.push((await core(page)).clock.minutes);
  }
  for (let i = 0; i < 8; i++) { await page.setViewportSize(i % 2 ? { width: 390, height: 844 } : { width: 844, height: 390 }); if (i % 3 === 0) await page.waitForTimeout(300); t1s.push((await core(page)).clock.minutes); }
  console.log('clock', t0, t1s, errors);
  expect(errors, 'pageerror/console error').toEqual([]);
  expect((t1s[1] ?? 1e9) - t0, 'годинник ≤ 5 хв за два повороти зі стопом кадрів по 5 с').toBeLessThanOrEqual(5);
});
