// GAME-311 · рутини табору грають ДОТИКОМ в обох орієнтаціях: дошка, робота (вода й порядок) і ніч.
// Перевіряємо не «чи відкрилось», а те, що обіцяє картка: ціль ≥ 48 px, нічого не вилазить за екран і не налазить
// одне на одне, текст не обрізаний, кожна рутина потребує роботи, а ніч показує наслідки й нікого не блокує.
// Мутації, що роблять цей файл червоним: «одна кнопка закриває воду» (phase done одразу після крана) ·
// «ніч без слідів» (nightOf → []) · «кнопки 32 px» (.ui-camp-big min-height: 32px).
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { expect, test, type Locator, type Page } from '@playwright/test';

test.use({ hasTouch: true });

const SHOTS = process.env.G311_SHOTS ? 'research/game-311' : '';
const VIEWPORTS = [
  { name: 'portrait', w: 390, h: 844 },
  { name: 'landscape', w: 932, h: 430 },
];
/** Найменша ціль пальця (OD-014: один палець, ≥ 48 px). */
const TARGET = 48;

let bundle = '';
test.beforeAll(async () => {
  const r = await build({ configFile: false, logLevel: 'silent', define: { __GAME_VERSION__: '"t"', __GAME_COMMIT__: '"t"' }, oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } }, esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
    build: { write: false, minify: false, lib: { entry: fileURLToPath(new URL('./routines-harness.tsx', import.meta.url)), formats: ['iife'], name: 'H' } } } as never) as unknown as { output: { code: string }[] } | { output: { code: string }[] }[];
  bundle = (Array.isArray(r) ? r[0] : r)?.output[0]?.code ?? '';
});

/** Усі видимі кнопки панелі: розмір, вихід за екран, обрізаний текст, накладання одна на одну. */
async function problems(page: Page): Promise<string[]> {
  return page.evaluate((target) => {
    const bad: string[] = [];
    const btns = [...document.querySelectorAll<HTMLElement>('.ui-camp .ui-btn')].filter((b) => b.offsetParent !== null);
    const vw = innerWidth;
    const vh = innerHeight;
    if (btns.length === 0) bad.push('кнопок немає зовсім');
    for (const b of btns) {
      const r = b.getBoundingClientRect();
      const what = `${b.dataset.ui ?? b.className}`;
      if (r.height < target - 0.5 || r.width < target - 0.5) bad.push(`${what}: ціль ${Math.round(r.width)}×${Math.round(r.height)} < ${target}`);
      if (r.left < -1 || r.right > vw + 1) bad.push(`${what}: вилазить за ширину екрана (${Math.round(r.left)}..${Math.round(r.right)} при ${vw})`);
      if (b.scrollWidth > b.clientWidth + 1) bad.push(`${what}: текст обрізано (${b.scrollWidth} > ${b.clientWidth})`);
    }
    const root = document.querySelector<HTMLElement>('.ui-camp');
    if (root && root.scrollWidth > vw + 1) bad.push(`панель ширша за екран: ${root.scrollWidth} > ${vw}`);
    if (root && root.scrollHeight > vh + 1 && getComputedStyle(root).overflowY === 'visible') bad.push('панель вища за екран і не прокручується');
    // кнопки дошки не налазять одна на одну
    const rows = [...document.querySelectorAll<HTMLElement>('[data-ui="camp-routine"]')].map((b) => b.getBoundingClientRect());
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i] as DOMRect;
        const c = rows[j] as DOMRect;
        if (a.left < c.right - 1 && a.right > c.left + 1 && a.top < c.bottom - 1 && a.bottom > c.top + 1) bad.push(`рутини налазять одна на одну: ${i}/${j}`);
      }
    }
    return bad;
  }, TARGET);
}

const mount = async (page: Page, weather: 'sunny' | 'cloudy' | 'rain' = 'rain'): Promise<void> => {
  await page.evaluate((s) => (window as unknown as { __mount: (x: unknown) => void }).__mount(s), { lang: 'uk', weather, seed: 7 });
  await page.locator('[data-ui="camp-board"]').waitFor();
};
const tapIt = async (l: Locator): Promise<void> => { await l.scrollIntoViewIfNeeded(); await l.tap(); };
/** Утримання крана: дотик без відпускання — ті самі події вказівника, що їх шле палець. Чекаємо не час, а СТАН відра. */
async function holdTap(page: Page, selector: string, untilPercent: number): Promise<void> {
  await page.locator(selector).dispatchEvent('pointerdown');
  await page.waitForFunction((p) => Number(document.querySelector('[data-ui="water-level"]')?.getAttribute('data-level') ?? '0') >= p, untilPercent);
  await page.locator(selector).dispatchEvent('pointerup');
}

for (const vp of VIEWPORTS) {
  test(`GAME-311 · рутини табору дотиком — ${vp.name} ${vp.w}×${vp.h}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.goto('/');
    await page.addScriptTag({ content: bundle });
    await mount(page);
    if (SHOTS) mkdirSync(SHOTS, { recursive: true });

    // Дошка: сім рутин, у кожної виконавець і причина саме сьогодні; решта родини при ділі.
    await expect(page.locator('[data-ui="camp-routine"]')).toHaveCount(7);
    await expect(page.locator('[data-ui="camp-busy"]')).toBeVisible();
    expect(await problems(page), 'дошка').toEqual([]);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${vp.name}-board.png` });

    // ВОДА: одним дотиком не закрити — спершу тримати кран, потім десять кроків тією ногою, яку просить земля.
    await tapIt(page.locator('[data-ui="camp-routine"][data-id="water"]'));
    await expect(page.locator('[data-ui="camp-work"][data-kind="water"]')).toBeVisible();
    await holdTap(page, '[data-ui="water-tap"]', 70);
    await expect(page.locator('[data-ui="water-cue"]')).toBeVisible();
    expect(await problems(page), 'вода').toEqual([]);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${vp.name}-water.png` });
    for (let k = 0; k < 10; k++) {
      const side = await page.locator('[data-ui="water-cue"]').getAttribute('data-side');
      if (side === null) break;
      await tapIt(page.locator(`[data-ui="water-step"][data-side="${side}"]`));
    }
    await expect(page.locator('[data-ui="camp-board"]')).toBeVisible();
    await expect(page.locator('[data-ui="camp-routine"][data-id="water"]')).toHaveAttribute('data-done', 'yes');

    // ЯГОДИ: стиглі проти гіркого двійника — кошик наповнюється дотиками, а не однією кнопкою.
    await tapIt(page.locator('[data-ui="camp-next"]'));
    await tapIt(page.locator('[data-ui="camp-routine"][data-id="berries"]'));
    await expect(page.locator('[data-ui="camp-work"][data-kind="berries"]')).toBeVisible();
    expect(await problems(page), 'ягоди').toEqual([]);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${vp.name}-berries.png` });
    for (let i = 0; i < 4; i++) await tapIt(page.locator(`[data-ui="berry"][data-i="${i}"]`));
    await tapIt(page.locator('[data-ui="berry-enough"]'));
    await expect(page.locator('[data-ui="camp-routine"][data-id="berries"]')).toHaveAttribute('data-done', 'yes');

    // ПОРЯДОК (вечір): кожна річ — свідомо на своє місце, два дотики на річ.
    await tapIt(page.locator('[data-ui="camp-next"]'));
    await tapIt(page.locator('[data-ui="camp-next"]'));
    await expect(page.locator('[data-ui="camp-board"]')).toHaveAttribute('data-round', 'evening');
    await tapIt(page.locator('[data-ui="camp-routine"][data-id="tidy"]'));
    await expect(page.locator('[data-ui="camp-work"][data-kind="tidy"]')).toBeVisible();
    expect(await problems(page), 'порядок').toEqual([]);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${vp.name}-tidy.png` });
    for (const [id, place] of [['pot', 'car'], ['bread', 'hung'], ['berries', 'hung'], ['tins', 'bin'], ['wrap', 'bin'], ['chairs', 'tarp'], ['rods', 'tarp'], ['boots', 'tarp']] as const) {
      await tapIt(page.locator(`[data-ui="tidy-pick"][data-id="${id}"]`));
      await tapIt(page.locator(`[data-ui="tidy-place"][data-place="${place}"]`));
      await expect(page.locator(`[data-ui="tidy-thing"][data-id="${id}"]`)).toHaveAttribute('data-place', place);
    }
    await tapIt(page.locator('[data-ui="tidy-sleep"]'));
    await expect(page.locator('[data-ui="camp-routine"][data-id="tidy"]')).toHaveAttribute('data-done', 'yes');

    // НІЧ: слід кожної рутини, прибраний табір — без лисиці, незроблені справи — свої наслідки, і жодного блоку.
    await tapIt(page.locator('[data-ui="camp-to-night"]'));
    await expect(page.locator('[data-ui="camp-night"]')).toHaveAttribute('data-blocked', 'no');
    await expect(page.locator('[data-ui="night-beat"]')).toHaveCount(8);
    await expect(page.locator('[data-ui="night-beat"][data-id="night.tidy.quiet"]')).toBeVisible();
    await expect(page.locator('[data-ui="night-beat"][data-id="night.light.dark"]')).toBeVisible();
    await expect(page.locator('[data-ui="night-beat"][data-id="night.wood.none"]')).toBeVisible();
    await expect(page.locator('[data-ui="night-morning"]')).toBeVisible();
    const over = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('.ui-camp');
      return root ? root.scrollWidth - innerWidth : 0;
    });
    expect(over, 'ніч ширша за екран').toBeLessThanOrEqual(1);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${vp.name}-night.png` });
  });
}
