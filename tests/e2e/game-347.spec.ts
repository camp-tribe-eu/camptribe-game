// GAME-346 (leftovers, файл game-347) · «Частина 2» не перегортається сама. Єдиний шлях до наступної частини — дотик «Далі», і він (а) зачинений першу мить після повернення на дошку
// (запізнілий дотик, що закривав роботу, не має гортати день), (б) пише рядок-причину «Ти натиснув «Далі» — тепер: Частина 3».
// Мутація (перевірено): у finish() CampRoutines прибрати `setLocked(true)` → «дотик одразу після роботи не має гортати частину» червоніє;
// прибрати рядок camp-round-cue → «рядок-причина» червоніє.
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { expect, test } from '@playwright/test';

test.use({ hasTouch: true });
let bundle = '';
test.beforeAll(async () => {
  const r = await build({ configFile: false, logLevel: 'silent', define: { __GAME_VERSION__: '"t"', __GAME_COMMIT__: '"t"' }, oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } }, esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
    build: { write: false, minify: false, lib: { entry: fileURLToPath(new URL('./routines-harness.tsx', import.meta.url)), formats: ['iife'], name: 'H' } } } as never) as unknown as { output: { code: string }[] } | { output: { code: string }[] }[];
  bundle = (Array.isArray(r) ? r[0] : r)?.output[0]?.code ?? '';
});

test('GAME-346 · (leftovers) частина дня змінюється лише дотиком «Далі», з рядком-причиною', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.addScriptTag({ content: bundle });
  await page.evaluate((s) => (window as unknown as { __mount: (x: unknown) => void }).__mount(s), { lang: 'uk', weather: 'rain', seed: 7, bare: true });
  const board = page.locator('[data-ui="camp-board"]');
  const next = page.locator('[data-ui="camp-next"]');
  await board.waitFor();
  await expect(board).toHaveAttribute('data-round', 'morning');
  await expect(page.locator('[data-ui="camp-round-cue"]'), 'без дотику рядка-причини немає').toHaveCount(0);

  await expect(next).toBeEnabled({ timeout: 5_000 });   // після короткої блокади (кадри)
  await next.tap();
  await expect(board).toHaveAttribute('data-round', 'noon');
  const cue = page.locator('[data-ui="camp-round-cue"]');
  await expect(cue, 'рядок-причина після дотику').toBeVisible();
  await expect(cue).toHaveAttribute('data-round', 'noon');

  // Простій у частині 2: кадри йдуть, а частина не міняється.
  await page.waitForTimeout(2500);
  await expect(board, 'простій не гортає частину').toHaveAttribute('data-round', 'noon');
  await expect(page.locator('[data-ui="camp-left"]')).toContainText('2');

  // Після роботи «Далі» на дошці мить зачинене: дотик ТОЧНО В МИТЬ повернення не перегортає частину.
  await page.locator('[data-ui="camp-routine"][data-id="lanterns"]').tap();
  await expect(page.locator('[data-ui="camp-work"][data-kind="lanterns"]')).toBeVisible();
  // «Здаюсь» лишає завершення на кнопці роботи; повернення на дошку робить сама робота — тут лише перевіряємо стан кнопки відразу після її закриття.
  await page.evaluate(() => { (document.querySelector('[data-ui="lantern-done"]') as HTMLButtonElement | null)?.removeAttribute('disabled'); });
  await page.locator('[data-ui="lantern-done"]').dispatchEvent('click');
  await expect(board).toBeVisible();
  expect(await next.isDisabled(), 'дотик одразу після роботи не має гортати частину').toBe(true);
  await next.dispatchEvent('click');
  await expect(board, 'клік по зачиненому «Далі» нічого не робить').toHaveAttribute('data-round', 'noon');
  await expect(next).toBeEnabled({ timeout: 5_000 });
});
