// GAME-341 · шосте приймання: підсумок дня без чипа «Ціль» поверх підпису, ◀ ▶ заїзду в одному ряду, видимий підпис повзунка «Тент над дровами».
// Мутації, що роблять цей файл червоним (перевірено): прибрати `#app:has([data-ui="sd-summary"]) .ui-goal` з index.html → тест 1;
// у index.html прибрати `.ui-camp[data-ui="drive-in"] > .sd-pad { display: grid … }` → тест 2 (landscape); прибрати <span class="mg-tune-label"> у MissionSurfaces.tsx → тест 3.
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { expect, test, type Page } from '@playwright/test';

test.use({ hasTouch: true });

const VIEWPORTS = [
  { name: 'portrait', w: 390, h: 844 },
  { name: 'landscape', w: 932, h: 430 },
];
let bundle = '';
test.beforeAll(async () => {
  const r = await build({ configFile: false, logLevel: 'silent', define: { __GAME_VERSION__: '"t"', __GAME_COMMIT__: '"t"' }, oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } }, esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
    build: { write: false, minify: false, lib: { entry: fileURLToPath(new URL('./routines-harness.tsx', import.meta.url)), formats: ['iife'], name: 'H' } } } as never) as unknown as { output: { code: string }[] } | { output: { code: string }[] }[];
  bundle = (Array.isArray(r) ? r[0] : r)?.output[0]?.code ?? '';
});

const call = (page: Page, fn: string, arg?: string): Promise<void> => page.evaluate(([f, a]) => ((window as unknown as Record<string, (x?: string) => void>)[f as string] as (x?: string) => void)(a), [fn, arg]);
async function open(page: Page, vp: { w: number; h: number }): Promise<void> {
  await page.setViewportSize({ width: vp.w, height: vp.h });
  await page.goto('/');
  await page.addScriptTag({ content: bundle });
}

for (const vp of VIEWPORTS) {
  test(`GAME-341 · підсумок дня: чип «Ціль» не лежить на підписах — ${vp.name}`, async ({ page }) => {
    await open(page, vp);
    await call(page, '__mountSummaryGoal');
    await expect(page.locator('[data-ui="sd-summary"]')).toBeVisible();
    const goal = page.locator('[data-ui="goal"]');
    await expect(goal, 'чип у DOM є (інакше тест нічого не доводить)').toHaveCount(1);
    expect(await goal.evaluate((e) => getComputedStyle(e).visibility), 'чип «Ціль» схований, поки відкритий підсумок').toBe('hidden');
    // контроль: без підсумку той самий чип видно
    await page.evaluate(() => document.getElementById('harness')?.remove());
    expect(await goal.evaluate((e) => getComputedStyle(e).visibility), 'контроль: без підсумку чип видно').toBe('visible');
  });

  test(`GAME-341 · заїзд: ▲ ▼ ◀ ▶ в одному ряду — ${vp.name}`, async ({ page }) => {
    await open(page, vp);
    await call(page, '__mountDrive', 'lane.beeches');
    await expect(page.locator('[data-ui="drive-in"]')).toBeVisible();
    const tops = await page.evaluate(() => (['forward', 'back', 'left', 'right'] as const).map((s) => Math.round((document.querySelector<HTMLElement>(`[data-ui="di-${s}"]`)?.getBoundingClientRect().top ?? -1))));
    if (vp.name === 'landscape') expect(new Set(tops).size, `усі чотири стрілки в одному ряду: ${tops.join(',')}`).toBe(1);
    else expect(tops[2], `◀ і ▶ в одному ряду: ${tops.join(',')}`).toBe(tops[3]);
    const low = await page.evaluate(() => Math.max(...[...document.querySelectorAll<HTMLElement>('[data-ui="drive-in"] .ui-btn')].map((b) => b.getBoundingClientRect().bottom)));
    expect(low, 'кнопки в межах екрана').toBeLessThanOrEqual(vp.h);
  });

  test(`GAME-341 · «Тент над дровами»: повзунок має видимий підпис — ${vp.name}`, async ({ page }) => {
    await open(page, vp);
    await call(page, '__mountTarp');
    const label = page.locator('[data-ui="mg-tune-label"]');
    await expect(label).toBeVisible();
    await expect(label).toHaveText('Натяг мотузки');
    const g = await page.evaluate(() => {
      const l = (document.querySelector<HTMLElement>('[data-ui="mg-tune-label"]') as HTMLElement).getBoundingClientRect();
      const d = (document.querySelector<HTMLElement>('[data-ui="mg-tune-dial"]') as HTMLElement).getBoundingClientRect();
      const b = document.querySelector<HTMLElement>('[data-ui="mg-move-on"]')?.getBoundingClientRect();
      return { lb: l.bottom, lt: l.top, dt: d.top, db: d.bottom, bb: b?.bottom ?? 0, h: innerHeight };
    });
    expect(g.lb, 'підпис над повзунком').toBeLessThanOrEqual(g.dt + 1);
    expect(g.lt).toBeGreaterThanOrEqual(0);
    expect(Math.max(g.db, g.bb), 'повзунок і кнопки в межах екрана').toBeLessThanOrEqual(g.h);
  });
}
