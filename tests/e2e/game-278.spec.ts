// GAME-278 (OD-030) · «Масштаб» у налаштуваннях: «Авто» + явні цілі кроки, дозволені для поля. Кожен крок змінює zoom полотна (probe.view.zoom і
// розмір полотна на екрані), переживає перезавантаження; непридатний збережений крок → Авто для цього поля без перезапису налаштування.
// Мутація 1 (applyFrame ігнорує налаштування: fieldFrame без loadSettings().zoom) → червоніє «крок ×N змінює zoom».
// Мутація 2 (frameSize не перевіряє zoomSteps, бере явний zoom як є) → червоніє «непридатний крок → Авто».
import { expect, test, type Page } from '@playwright/test';
import { waitGameReady } from './ready';

const KEY = 'camplife.settings.v1';
interface View { zoom: number; w: number; h: number }
// Світ на паузі не оновлює probe.view, тож zoom читаємо з самого полотна: розмір на екрані ÷ розмір кадру (атрибут width).
const view = (page: Page): Promise<View> => page.evaluate(() => {
  const c = document.querySelector('canvas') as HTMLCanvasElement;
  return { zoom: Math.round(c.getBoundingClientRect().width / c.width), w: c.width, h: c.height };
});
const canvasW = (page: Page): Promise<number> => page.evaluate(() => (document.querySelector('canvas') as HTMLCanvasElement).getBoundingClientRect().width);
const stored = (page: Page): Promise<number | null> => page.evaluate((k) => { const r = localStorage.getItem(k); return r ? (JSON.parse(r) as { zoom?: number }).zoom ?? null : null; }, KEY);
async function openPause(page: Page): Promise<void> {
  await page.locator('[data-touch="pause"]').click();
  await expect(page.locator('[data-ui="pause"]')).toBeVisible();
}
async function load(page: Page): Promise<void> { await page.goto('/?mapFirst=1&seed=1'); await waitGameReady(page); }
const steps = (page: Page): Promise<string[]> => page.locator('[data-ui="zoom"] [data-ui^="zoom-"]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.ui?.slice(5) ?? ''));

const FIELDS = [{ w: 1280, h: 800, touch: false }, { w: 932, h: 430, touch: false }, { w: 932, h: 430, touch: true }, { w: 390, h: 844, touch: true }];
for (const c of FIELDS) {
  test(`GAME-278 ${c.w}×${c.h}${c.touch ? ' дотик' : ''}: кожен крок змінює zoom, переживає перезавантаження; непридатний → Авто`, async ({ browser }) => {
    test.setTimeout(180_000);
    const ctx = await browser.newContext({ viewport: { width: c.w, height: c.h }, hasTouch: c.touch, isMobile: c.touch });
    const page = await ctx.newPage();
    await load(page);
    const auto = (await view(page)).zoom;
    await openPause(page);
    const offered = await steps(page);
    expect(offered[0], 'перший — Авто').toBe('auto');
    const ks = offered.slice(1).map(Number);
    expect(ks.length, `${c.w}×${c.h}: є що обрати`).toBeGreaterThanOrEqual(c.touch && c.h < 500 ? 1 : 2);   // телефон вбік на дотику: ×1 — плитка < 44 px, лишається ×2
    expect(ks.every((k) => Number.isInteger(k) && (c.touch ? 32 * k >= 44 : true)), 'цілі; на дотику плитка ≥ 44 px').toBe(true);
    expect(ks, 'Авто теж серед явних кроків (його zoom доступний)').toContain(auto);
    for (const k of ks) {
      await page.locator(`[data-ui="zoom-${k}"]`).click();
      await expect(page.locator(`[data-ui="zoom-${k}"]`)).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(async () => (await view(page)).zoom, { message: `крок ×${k} змінює zoom` }).toBe(k);
      const v = await view(page);
      const hero = (49 * k) / c.h;
      expect(hero, `×${k}: зріст героя ${(hero * 100).toFixed(1)} %`).toBeGreaterThanOrEqual(0.06);
      expect(hero).toBeLessThanOrEqual(0.3);
      expect(await canvasW(page), 'полотно = кадр × zoom').toBe(v.w * k);
      expect(await stored(page), 'збережено в налаштуваннях').toBe(k);
    }
    // Найбільший крок переживає перезавантаження; сейв гри (інший ключ) zoom не містить.
    const last = ks[ks.length - 1] ?? auto;
    await page.reload(); await waitGameReady(page);
    expect((await view(page)).zoom, 'після перезавантаження').toBe(last);
    expect(await page.evaluate(() => Object.entries(localStorage).filter(([k]) => k !== 'camplife.settings.v1').some(([, v]) => /"zoom"/.test(v))), 'zoom не в сейві гри').toBe(false);
    // Авто повертає правило.
    await openPause(page);
    await page.locator('[data-ui="zoom-auto"]').click();
    await expect.poll(async () => (await view(page)).zoom).toBe(auto);
    expect(await stored(page)).toBe(0);
    // Непридатний крок (×7: герой > 30 %) у налаштуваннях → Авто для цього поля, значення не переписано.
    await page.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k) ?? '{}') as object; localStorage.setItem(k, JSON.stringify({ ...s, zoom: 7 })); }, KEY);
    await page.reload(); await waitGameReady(page);
    expect((await view(page)).zoom, 'непридатний ×7 → Авто').toBe(auto);
    expect(await stored(page), 'налаштування не перезаписано').toBe(7);
    await openPause(page);
    await expect(page.locator('[data-ui="zoom-auto"]')).toHaveAttribute('aria-pressed', 'true');
    await ctx.close();
  });
}

test('GAME-278: зміна розміру поля — збережений крок, що став непридатним, дає Авто; повернення — знову крок', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await load(page);
  await openPause(page);
  await page.locator('[data-ui="zoom-4"]').click();
  await expect.poll(async () => (await view(page)).zoom).toBe(4);
  await page.setViewportSize({ width: 1280, height: 300 });   // ×4: герой 65 % — не крок
  await expect.poll(async () => (await view(page)).zoom, { message: 'на низькому полі ×4 → Авто' }).not.toBe(4);
  expect(await stored(page), 'налаштування лишилось ×4').toBe(4);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect.poll(async () => (await view(page)).zoom, { message: 'поле повернулось — ×4' }).toBe(4);
  await ctx.close();
});

// GAME-279 · хвости рецензії PR #212. Мутація 3 (Shell не підписаний на port.onFieldResize) → червоніє «кроки оновились після повороту».
test('GAME-279: поворот із відкритим меню — список кроків і «Авто» оновлюються; кнопки мають aria-label «Масштаб ×k»', async ({ browser }) => {
  test.setTimeout(180_000);
  const ctx = await browser.newContext({ viewport: { width: 932, height: 430 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await load(page);
  await openPause(page);
  const before = await steps(page);
  const ks = before.slice(1).map(Number);
  for (const k of ks) await expect(page.locator(`[data-ui="zoom-${k}"]`)).toHaveAttribute('aria-label', `Масштаб ×${k}`);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => steps(page), { message: 'кроки оновились після повороту' }).not.toEqual(before);
  const after = await steps(page);
  expect(after[0]).toBe('auto');
  await expect(page.locator('[data-ui="zoom-auto"]')).toHaveAttribute('aria-pressed', 'true');
  for (const k of after.slice(1).map(Number)) await expect(page.locator(`[data-ui="zoom-${k}"]`)).toHaveAttribute('aria-label', `Масштаб ×${k}`);
  await ctx.close();
});
