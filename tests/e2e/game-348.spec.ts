// GAME-348 · приймання №8: «Дрова» вміщається на екрані (390×844 і 932×430) із правилом; вогонь каже, що дрова вогкі, і не каже, коли сухі.
// Мутації (перевірено, див. звіт): прибрати з CampRoutines рядок wood-rule → «правило» червоніє; прибрати fire-wet → «вогкі» червоніє;
// у index.html знову зробити рядки дров високими (див. правило .ui-camp-work [data-ui="wood-log"]) → «Далі» тікає за екран і тест червоніє.
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { expect, test, type Locator, type Page } from '@playwright/test';

test.use({ hasTouch: true });

const VIEWPORTS = [
  { name: 'portrait', w: 390, h: 844 },
  { name: 'landscape', w: 932, h: 430 },
];

let bundle = '';
test.beforeAll(async () => {
  const r = await build({ configFile: false, logLevel: 'silent', define: { __GAME_VERSION__: '"t"', __GAME_COMMIT__: '"t"' }, oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } }, esbuild: {
    jsx: 'automatic', jsxImportSource: 'preact' }, build: { write: false, minify: false, lib: { entry: fileURLToPath(new URL('./routines-harness.tsx', import.meta.url)), formats: ['iife'], name: 'H' } } } as never) as unknown as { output: { code: string }[] };
  bundle = (Array.isArray(r) ? r[0] : r)?.output[0]?.code ?? '';
});

const tapIt = async (l: Locator): Promise<void> => { await l.scrollIntoViewIfNeeded(); await l.tap(); };
const mount = async (page: Page, devices: unknown): Promise<void> => {
  await page.evaluate((s) => (window as unknown as { __mount: (x: unknown) => void }).__mount(s), { lang: 'uk', weather: 'rain', seed: 7, devices });
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

for (const vp of VIEWPORTS) {
  test(`GAME-348 · «Дрова» без прокрутки: усі 8 полін, правило й «Далі» на екрані — ${vp.name}`, async ({ page }) => {
    await boot(page, vp);
    await mount(page, {});
    await open(page, 'firewood');
    await tapIt(page.locator('[data-ui="wood-place-choice"][data-place="near"]'));
    await expect(page.locator('[data-ui="wood-log"]')).toHaveCount(8);
    const box = async (sel: string) => (await page.locator(sel).first().boundingBox()) as { x: number; y: number; width: number; height: number };
    const rule = await box('[data-ui="wood-rule"]');
    const next = await box('[data-ui="wood-done"]');
    const logs = await page.locator('[data-ui="wood-log"]').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; }));
    expect(rule.y + rule.height, `правило «товсті першими» на екрані (${Math.round(rule.y)}..${Math.round(rule.y + rule.height)} при ${vp.h})`).toBeLessThanOrEqual(vp.h);
    expect(next.y + next.height, `«Далі» на екрані (${Math.round(next.y + next.height)} при ${vp.h})`).toBeLessThanOrEqual(vp.h);
    expect(next.height).toBeGreaterThanOrEqual(44);
    for (const [i, l] of logs.entries()) expect(l.bottom, `поліно ${i + 1} на екрані`).toBeLessThanOrEqual(vp.h);
    const over = await page.evaluate(() => { const e = document.querySelector<HTMLElement>('.ui-camp'); return e ? e.scrollHeight - e.clientHeight : -1; });
    expect(over, 'панель не прокручується').toBeLessThanOrEqual(0);
  });
}

test('GAME-348 · вогонь: вогкі дрова — рядок про це; сухі (ручна рутина чи пристрій місії) — рядка нема', async ({ page }) => {
  await boot(page, VIEWPORTS[0] as { w: number; h: number });
  // вогкі: ні рутини «Дрова», ні пристрою
  await mount(page, {});
  await open(page, 'fire');
  const wet = page.locator('[data-ui="fire-wet"]');
  await expect(wet).toBeVisible();
  await expect(wet).toContainText('вогкі');
  await expect(wet).toContainText('Дрова');
  // сухі через пристрій місії Клер (woodpile) — без жодної ручної рутини
  await mount(page, { woodpile: { care: 1 } });
  await open(page, 'fire');
  await expect(page.locator('[data-ui="fire-rule"]')).toBeVisible();
  await expect(page.locator('[data-ui="fire-wet"]')).toHaveCount(0);
});

test('GAME-348 · порядок: третя їжа «В авто» не лягає — гра каже чому, річ лишається надворі', async ({ page }) => {
  await boot(page, VIEWPORTS[0] as { w: number; h: number });
  await mount(page, {});
  for (let k = 0; k < 3; k++) await tapIt(page.locator('[data-ui="camp-next"]'));
  await open(page, 'tidy');
  const put = async (id: string, place: string): Promise<void> => {
    await tapIt(page.locator(`[data-ui="tidy-pick"][data-id="${id}"]`));
    await tapIt(page.locator(`[data-ui="tidy-place"][data-place="${place}"]`));
  };
  await put('pot', 'car');
  await put('bread', 'car');
  await expect(page.locator('[data-ui="tidy-car-full"]')).toHaveCount(0);
  await put('berries', 'car');
  await expect(page.locator('[data-ui="tidy-car-full"]')).toBeVisible();
  await expect(page.locator('[data-ui="tidy-thing"][data-id="berries"]')).toHaveAttribute('data-place', 'out');
  await put('berries', 'hung');   // підвісили — відмова зникає, річ на місці
  await expect(page.locator('[data-ui="tidy-car-full"]')).toHaveCount(0);
  await expect(page.locator('[data-ui="tidy-thing"][data-id="berries"]')).toHaveAttribute('data-place', 'hung');
});
