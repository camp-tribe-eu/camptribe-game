// GAME-349 · приймання №9: порада про вогкі дрова — на дошці ДО входу; «Ліхтарі» вміщаються на екрані (390×844, 932×430, 600×600);
// в дощ панель ліхтарів не веде до сонця. Мутації (перевірено, див. звіт): прибрати fire-wet-board з CampRoutines → «порада» червоніє;
// прибрати правило .ui-camp-list:has(> [data-ui="lantern"]) в index.html → «Далі»/«Крутити» тікають за екран; прибрати гілку sunRate(weather) > 0 → «дощ» червоніє.
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { expect, test, type Locator, type Page } from '@playwright/test';

test.use({ hasTouch: true });

const VIEWPORTS = [
  { name: 'portrait', w: 390, h: 844 },
  { name: 'landscape', w: 932, h: 430 },
  { name: 'square', w: 600, h: 600 },
];

let bundle = '';
test.beforeAll(async () => {
  const r = await build({ configFile: false, logLevel: 'silent', define: { __GAME_VERSION__: '"t"', __GAME_COMMIT__: '"t"' }, oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } }, esbuild: {
    jsx: 'automatic', jsxImportSource: 'preact' }, build: { write: false, minify: false, lib: { entry: fileURLToPath(new URL('./routines-harness.tsx', import.meta.url)), formats: ['iife'], name: 'H' } } } as never) as unknown as { output: { code: string }[] };
  bundle = (Array.isArray(r) ? r[0] : r)?.output[0]?.code ?? '';
});

const tapIt = async (l: Locator): Promise<void> => { await l.scrollIntoViewIfNeeded(); await l.tap(); };
const mount = async (page: Page, devices: unknown, weather = 'rain'): Promise<void> => {
  await page.evaluate((s) => (window as unknown as { __mount: (x: unknown) => void }).__mount(s), { lang: 'uk', weather, seed: 7, devices });
  await page.locator('[data-ui="camp-board"]').waitFor();
};
const open = async (page: Page, id: string): Promise<void> => {
  await tapIt(page.locator(`[data-ui="camp-routine"][data-id="${id}"]`));
  await expect(page.locator(`[data-ui="camp-work"][data-kind="${id}"]`)).toBeVisible();
};
const boot = async (page: Page, vp: { w: number; h: number }): Promise<void> => {
  await page.setViewportSize({ width: vp.w, height: vp.h });
  await page.goto('/');
  await page.addScriptTag({ content: bundle });
};

test('GAME-349 · «Вогонь» на дошці каже про вогкі дрова ДО входу; з сухими (пристрій місії) — мовчить', async ({ page }) => {
  await boot(page, VIEWPORTS[0] as { w: number; h: number });
  await mount(page, {});   // вогкі
  const note = page.locator('[data-ui="fire-wet-board"]');
  await expect(note).toBeVisible();
  await expect(note).toContainText('вогкі');
  await expect(note).toContainText('Дрова');
  await expect(page.locator('[data-ui="camp-work"]')).toHaveCount(0);   // ми ще на дошці — вибір не записано
  await mount(page, { woodpile: { care: 1 } });   // сухі
  await expect(page.locator('[data-ui="camp-routine"][data-id="fire"]')).toBeVisible();
  await expect(page.locator('[data-ui="fire-wet-board"]')).toHaveCount(0);
  // Сам текст рядка теж: із сухими — звичайний підпис, без «вогкі» (мітка й текст мають різні умови — перевіряємо обидва).
  await expect(page.locator('[data-ui="camp-routine"][data-id="fire"]')).not.toContainText('вогкі');
  await expect(page.locator('[data-ui="camp-routine"][data-id="fire"]')).toContainText('Вечеря й вечір біля вогню');
});

for (const vp of VIEWPORTS) {
  test(`GAME-349 · «Ліхтарі» без прокрутки: три ліхтарі, «Крутити динамо» й «Далі» на екрані — ${vp.name}`, async ({ page }) => {
    await boot(page, vp);
    await mount(page, {}, 'sunny');
    await open(page, 'lanterns');
    await expect(page.locator('[data-ui="lantern"]')).toHaveCount(3);
    const boxes = await page.locator('[data-ui="lantern-crank"], [data-ui="lantern-done"]').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { ui: e.getAttribute('data-ui'), top: r.top, bottom: r.bottom, h: r.height }; }));
    expect(boxes.length).toBe(4);
    for (const [i, b] of boxes.entries()) {
      expect(b.bottom, `${b.ui} ${i} на екрані (${Math.round(b.top)}..${Math.round(b.bottom)} при ${vp.h})`).toBeLessThanOrEqual(vp.h);
      expect(b.top).toBeGreaterThanOrEqual(0);
      expect(b.h).toBeGreaterThanOrEqual(30);
    }
    const spots = await page.locator('[data-ui="lantern-spot"]').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { b: r.bottom, w: r.width }; }));
    for (const s of spots) { expect(s.b).toBeLessThanOrEqual(vp.h); expect(s.w, 'кнопка плями не стиснута').toBeGreaterThanOrEqual(36); }
    const over = await page.evaluate(() => { const e = document.querySelector<HTMLElement>('.ui-camp'); return e ? e.scrollHeight - e.clientHeight : -1; });
    expect(over, 'панель не прокручується').toBeLessThanOrEqual(0);
  });
}

test('GAME-349 · ліхтарі: у дощ — чесний рядок без плями сонця; у сонце — пляма є', async ({ page }) => {
  await boot(page, VIEWPORTS[0] as { w: number; h: number });
  await mount(page, {}, 'rain');
  await open(page, 'lanterns');
  await expect(page.locator('[data-ui="lantern-nosun"]')).toContainText('сонця немає');
  await expect(page.locator('[data-ui="lantern-sun"]')).toHaveCount(0);
  await expect(page.locator('[data-ui="lantern-rule"]')).not.toContainText('пляму');
  await mount(page, {}, 'sunny');
  await open(page, 'lanterns');
  await expect(page.locator('[data-ui="lantern-sun"]')).toBeVisible();
  await expect(page.locator('[data-ui="lantern-nosun"]')).toHaveCount(0);
});
