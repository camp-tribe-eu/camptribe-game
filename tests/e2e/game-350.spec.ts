// GAME-350 · ранок після ночі: «згортаємо табір, не лишаємо слідів» між ніччю й підсумком дня.
// Стенд — справжній SampleDay зі справжнім CSS (strike-harness.tsx); порт зберігає ранок так, як main.ts (форма ядра strikeError).
// Мутації (прогнано руками, див. звіт картки): вимкнути справу «вогнище» (needs: ['nope'] у feel) → тест 1 червоніє на «вогнище зроблено»;
// прибрати рядок чистоти з Summary (SampleDay) → тести 1 і 2 червоніють на «Чистота табору»; `.sk-target { min-height: 48px }` → `min-height: 200px` в index.html → «кнопки поза екраном» у всіх трьох розмірах. (Липкий низ `.ui-camp-foot` сам нічого не доводить: без нього все теж влізає.)
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { expect, test, type Locator, type Page } from '@playwright/test';

test.use({ hasTouch: true });

const VIEWPORTS = [
  { name: 'portrait 390x844', w: 390, h: 844 },
  { name: 'landscape 932x430', w: 932, h: 430 },
  { name: 'square 600x600', w: 600, h: 600 },
];
let bundle = '';
test.beforeAll(async () => {
  const r = await build({ configFile: false, logLevel: 'silent', define: { __GAME_VERSION__: '"t"', __GAME_COMMIT__: '"t"' }, oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } }, esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
    build: { write: false, minify: false, lib: { entry: fileURLToPath(new URL('./strike-harness.tsx', import.meta.url)), formats: ['iife'], name: 'H' } } } as never) as unknown as { output: { code: string }[] } | { output: { code: string }[] }[];
  bundle = (Array.isArray(r) ? r[0] : r)?.output[0]?.code ?? '';
});

interface Saved { closed: boolean; results: Record<string, string> }
const tapIt = async (l: Locator): Promise<void> => { await l.scrollIntoViewIfNeeded(); await l.tap(); };
const saved = (page: Page): Promise<Saved | undefined> => page.evaluate(() => (window as unknown as { __strike?: Saved }).__strike);
const saves = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as { __saves: number }).__saves);

async function open(page: Page, vp: { w: number; h: number }, o: { saved?: Saved | undefined; lang?: 'uk' | 'en' } = {}): Promise<void> {
  await page.setViewportSize({ width: vp.w, height: vp.h });
  await page.goto('/');
  await page.addScriptTag({ content: bundle });
  await page.evaluate((x) => (window as unknown as { __mountStrike: (y: unknown) => void }).__mountStrike(x), o);
}
/** Усі кнопки дошки лежать у межах екрана БЕЗ прокрутки (закон: ключові кнопки на екрані). */
async function onScreen(page: Page, vp: { w: number; h: number }, what: string): Promise<void> {
  const bad = await page.evaluate(({ w, h }) => [...document.querySelectorAll<HTMLElement>('[data-ui="camp-strike"] button')].filter((b) => !(b as HTMLButtonElement).disabled || b.dataset.ui === 'strike-finish').map((b) => ({ id: b.dataset.ui, r: b.getBoundingClientRect() }))
    .filter(({ r }) => r.top < -0.5 || r.left < -0.5 || r.bottom > h + 0.5 || r.right > w + 0.5).map(({ id, r }) => `${id} [${Math.round(r.left)},${Math.round(r.top)}-${Math.round(r.right)},${Math.round(r.bottom)}]`), vp);
  expect(bad, `${what}: кнопки поза екраном`).toEqual([]);
}
const doJob = async (page: Page, ids: string[]): Promise<void> => { for (const id of ids) await tapIt(page.locator(`[data-ui="strike-t-${id}"]`)); };
const GOOD = { tent: ['peg1', 'peg2', 'peg3', 'peg4', 'fold', 'bag'], litter: ['tin', 'wrap', 'bottle', 'cap'], fire: ['pour1', 'pour2', 'pour3', 'stir', 'feel'], car: ['bags', 'cooler', 'chairs', 'boots', 'shut'] };

for (const vp of VIEWPORTS) {
  test(`GAME-350 · ніч → ранок → усі справи → підсумок з чистотою — ${vp.name}`, async ({ page }) => {
    await open(page, vp);
    const board = page.locator('[data-ui="camp-strike"]');
    await expect(board, 'після ночі показано ранок, а не підсумок').toBeVisible();
    await expect(page.locator('[data-ui="sd-summary"]')).toHaveCount(0);
    await expect(page.locator('[data-ui^="strike-job-"][role="tab"]'), 'чотири справи').toHaveCount(4);
    await expect(page.locator('[data-ui="strike-finish"]'), 'рушити можна лише коли все розв’язано').toBeDisabled();
    await onScreen(page, vp, 'стартовий екран');

    for (const job of ['tent', 'litter', 'fire', 'car'] as const) {
      await expect(page.locator('[data-ui="strike-targets"]'), `відкрито справу ${job}`).toHaveAttribute('data-job', job);
      await onScreen(page, vp, `справа ${job}`);
      await doJob(page, GOOD[job]);
      await expect(page.locator(`[data-ui="strike-job-${job}"]`), `${job} зроблено`).toHaveAttribute('data-state', 'closed');
    }
    expect((await saved(page))?.results, 'усі справи в сейві як «добре»').toEqual({ tent: 'good', litter: 'good', fire: 'good', car: 'good' });
    expect((await saved(page))?.closed).toBe(false);
    const finish = page.locator('[data-ui="strike-finish"]');
    await expect(finish).toBeEnabled();
    await onScreen(page, vp, 'усі справи зроблено');
    await tapIt(finish);

    await expect(board, 'ранок закрито').toHaveCount(0);
    const sum = page.locator('[data-ui="sd-summary"]');
    await expect(sum).toBeVisible();
    await expect(sum).toHaveAttribute('data-clean', 'good');
    const line = page.locator('[data-ui="sd-sum-clean"]');
    await expect(line, 'у підсумку є рядок чистоти табору').toContainText('Чистота табору: Добре');
    await expect(page.locator('[data-ui="sd-sum-clean-why"]'), 'при «добре» причини немає').toHaveCount(0);
    expect((await saved(page))?.closed).toBe(true);
    await expect(page.locator('[data-ui="sd-restart"]')).toBeVisible();
    const low = await page.evaluate(() => Math.max(...[...document.querySelectorAll<HTMLElement>('[data-ui="sd-summary"] button')].map((b) => b.getBoundingClientRect().bottom)));
    expect(low, 'кнопка «Почати знову» в межах екрана').toBeLessThanOrEqual(vp.h + 0.5);
  });

  test(`GAME-350 · слабкий результат не блокує: усе лишено як є → «Сяк-так» і «Чому» — ${vp.name}`, async ({ page }) => {
    await open(page, vp);
    for (let i = 0; i < 4; i++) { await onScreen(page, vp, `пропуск ${i}`); await tapIt(page.locator('[data-ui="strike-skip"]')); }
    await expect(page.locator('[data-ui="strike-finish"]')).toBeEnabled();
    expect((await saved(page))?.results, 'лишене записано як сяк-так').toEqual({ tent: 'scrappy', litter: 'scrappy', fire: 'scrappy', car: 'scrappy' });
    await tapIt(page.locator('[data-ui="strike-finish"]'));
    const sum = page.locator('[data-ui="sd-summary"]');
    await expect(sum).toHaveAttribute('data-clean', 'scrappy');
    await expect(page.locator('[data-ui="sd-sum-clean"]')).toContainText('Чистота табору: Сяк-так');
    await expect(page.locator('[data-ui="sd-sum-clean-why"]'), 'названо причину: вогонь — найважливіше').toContainText('Чому: Вогнище згасили не до кінця');
  });
}

test('GAME-350 · хибні дотики нічого не ламають, справа з помилками — «нормально»; перезавантаження зберігає зроблене', async ({ page }) => {
  const vp = VIEWPORTS[0] as (typeof VIEWPORTS)[number];
  await open(page, vp);
  await tapIt(page.locator('[data-ui="strike-t-fold"]'));     // тканина до кілків — хибно
  await expect(page.locator('[data-ui="strike-note"]'), 'підказка про порядок').toContainText('Спершу інше');
  await expect(page.locator('[data-ui="strike-t-fold"]'), 'хибний дотик нічого не зробив').toBeEnabled();
  expect(await saves(page), 'хибний дотик нічого не пише в сейв').toBe(0);
  await doJob(page, GOOD.tent);
  expect((await saved(page))?.results.tent, 'одна помилка → нормально').toBe('fine');
  await expect(page.locator('[data-ui="strike-job-tent-state"]')).toHaveText('зроблено');
  // «перезавантаження»: стенд монтується з тим, що лежить у сейві
  const keep = await saved(page);
  await open(page, vp, { saved: keep });
  await expect(page.locator('[data-ui="strike-job-tent"]'), 'зроблена справа лишилась зробленою').toHaveAttribute('data-state', 'closed');
  await expect(page.locator('[data-ui="strike-job-litter"]')).toHaveAttribute('data-state', 'open');
  await expect(page.locator('[data-ui="strike-targets"]'), 'відкрита перша НЕзроблена справа').toHaveAttribute('data-job', 'litter');
  // лісове не береться
  await tapIt(page.locator('[data-ui="strike-t-cone"]'));
  await expect(page.locator('[data-ui="strike-note"]')).toContainText('лісове');
  await expect(page.locator('[data-ui="strike-t-cone"]')).toBeEnabled();
});

test('GAME-350 · закритий ранок після перезавантаження одразу веде до підсумку (англійською теж)', async ({ page }) => {
  const vp = VIEWPORTS[1] as (typeof VIEWPORTS)[number];
  await open(page, vp, { lang: 'en', saved: { closed: true, results: { tent: 'good', litter: 'good', fire: 'fine', car: 'fine' } } });
  await expect(page.locator('[data-ui="camp-strike"]')).toHaveCount(0);
  await expect(page.locator('[data-ui="sd-sum-clean"]')).toContainText('Site cleanliness: Good');
});
