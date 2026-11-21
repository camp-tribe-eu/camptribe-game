// GAME-351 · дорога ДОДОМУ після «згортаємо табір»: та сама міні-гра дороги (варіант homebound) між ранком і підсумком дня.
// Стенд — справжні SampleDay + MinigameHost + поверхня дороги зі справжнім CSS (roadhome-harness.tsx). Справжню проводку main.ts веде game-314 (повний день).
// Мутації (прогнано руками, див. звіт картки): рядок дороги додому прибрано з Summary (SampleDay) → тести фініш/пропуск/перезавантаження червоніють на «Дорога додому»;
// `if (session !== null && …) ? null :` у порті стенда → undefined-перевірка «підсумок не вискакує поверх результату» червоніє; `.mg-btn { min-height: 48px }` → `min-height: 300px` в index.html → «кнопки поза екраном».
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
    build: { write: false, minify: false, lib: { entry: fileURLToPath(new URL('./roadhome-harness.tsx', import.meta.url)), formats: ['iife'], name: 'H' } } } as never) as unknown as { output: { code: string }[] } | { output: { code: string }[] }[];
  bundle = (Array.isArray(r) ? r[0] : r)?.output[0]?.code ?? '';
});

const tapIt = async (l: Locator): Promise<void> => { await l.scrollIntoViewIfNeeded(); await l.tap(); };
interface Rec { last: string; consequence: string }
const rec = (page: Page): Promise<Rec | undefined> => page.evaluate(() => (window as unknown as { __results?: Record<string, Rec> }).__results?.['mg.drive-home']);

async function open(page: Page, vp: { w: number; h: number }, o: { results?: Record<string, Rec>; lang?: 'uk' | 'en' } = {}): Promise<void> {
  await page.setViewportSize({ width: vp.w, height: vp.h });
  await page.goto('/');
  await page.addScriptTag({ content: bundle });
  await page.evaluate((x) => (window as unknown as { __mountRoadHome: (y: unknown) => void }).__mountRoadHome(x), o);
}
/** Усі видимі кнопки екрана міні-гри лежать у межах екрана БЕЗ прокрутки (закон: ключові кнопки на екрані). */
async function onScreen(page: Page, vp: { w: number; h: number }, what: string): Promise<void> {
  const bad = await page.evaluate(({ w, h }) => [...document.querySelectorAll<HTMLElement>('[data-ui="minigame"] button')].filter((b) => b.getBoundingClientRect().width > 0)
    .map((b) => ({ id: b.dataset.ui, r: b.getBoundingClientRect() }))
    .filter(({ r }) => r.top < -0.5 || r.left < -0.5 || r.bottom > h + 0.5 || r.right > w + 0.5).map(({ id, r }) => `${id} [${Math.round(r.left)},${Math.round(r.top)}-${Math.round(r.right)},${Math.round(r.bottom)}]`), vp);
  expect(bad, `${what}: кнопки поза екраном`).toEqual([]);
}

for (const vp of VIEWPORTS) {
  test(`GAME-351 · ранок закрито → дорога додому → доїхали → підсумок із рядком дороги — ${vp.name}`, async ({ page }) => {
    await open(page, vp);
    const mg = page.locator('[data-ui="minigame"]');
    await expect(mg, 'після ранку показано дорогу додому').toBeVisible();
    await expect(mg).toHaveAttribute('data-phase', 'open');
    await expect(page.locator('[data-ui="mg-intro"]'), 'вступ саме дороги додому').toContainText('їдемо додому');
    await expect(page.locator('.mg-title')).toHaveText('Дорога додому');
    await expect(page.locator('[data-ui="sd-summary"]'), 'підсумку ще нема').toHaveCount(0);
    await onScreen(page, vp, 'вступ');
    await tapIt(page.locator('[data-ui="mg-start"]'));
    await expect(mg).toHaveAttribute('data-phase', 'play');
    await expect(page.locator('[data-ui="mg-drive-eta"]'), 'смуга прогресу: «до вечері», не «до рецепції»').toContainText('вечері');
    await expect(page.locator('[data-ui="mg-drive-left"]'), 'коротша за 42 км').not.toContainText('42');
    for (const id of ['mg-pause', 'mg-drive-lane-left', 'mg-drive-lane-right', 'mg-drive-pace']) await expect(page.locator(`[data-ui="${id}"]`), id).toBeVisible();
    await onScreen(page, vp, 'гра');
    await page.evaluate(() => (window as unknown as { __rhPlay: () => void }).__rhPlay());
    await expect(mg).toHaveAttribute('data-phase', 'result');
    await expect(page.locator('[data-ui="mg-result"]')).toHaveAttribute('data-outcome', 'fine');
    await expect(page.locator('[data-ui="sd-summary"]'), 'підсумок не вискакує поверх результату дороги').toHaveCount(0);
    expect((await rec(page))?.consequence, 'у «сейві»: наслідок home.*').toBe('home.ontime');
    await onScreen(page, vp, 'результат');
    await tapIt(page.locator('[data-ui="mg-close"]'));
    await expect(mg, 'дорогу закрито').toHaveCount(0);
    const sum = page.locator('[data-ui="sd-summary"]');
    await expect(sum).toBeVisible();
    await expect(sum).toHaveAttribute('data-road', 'fine');
    await expect(page.locator('[data-ui="sd-sum-road"]'), 'у підсумку є рядок дороги додому').toContainText('Дорога додому: вчасно, без поспіху');
    const low = await page.evaluate(() => Math.max(...[...document.querySelectorAll<HTMLElement>('[data-ui="sd-summary"] button')].map((b) => b.getBoundingClientRect().bottom)));
    expect(low, 'кнопка «Почати знову» в межах екрана').toBeLessThanOrEqual(vp.h + 0.5);
  });

  test(`GAME-351 · пропуск із підтвердженням не блокує: «Точно пропустити?» → «Так» → сяк-так → підсумок — ${vp.name}`, async ({ page }) => {
    await open(page, vp);
    const mg = page.locator('[data-ui="minigame"]');
    await tapIt(page.locator('[data-ui="mg-start"]'));
    await tapIt(page.locator('[data-ui="mg-pause"]'));
    await tapIt(page.locator('[data-ui="mg-move-on"]'));
    await expect(page.locator('[data-ui="mg-sure"]'), 'перепитування є і для дороги додому').toBeVisible();
    await expect(mg, 'один дотик не пропустив').toHaveAttribute('data-phase', 'play');
    await onScreen(page, vp, 'перепитування');
    await tapIt(page.locator('[data-ui="mg-sure-no"]'));
    await expect(page.locator('[data-ui="mg-sure"]')).toHaveCount(0);
    await tapIt(page.locator('[data-ui="mg-move-on"]'));
    await tapIt(page.locator('[data-ui="mg-sure-yes"]'));
    await expect(mg).toHaveAttribute('data-phase', 'result');
    await expect(page.locator('[data-ui="mg-result"]')).toHaveAttribute('data-outcome', 'scrappy');
    await expect(page.locator('[data-ui="mg-result"]'), 'пізній результат без докору').toContainText('диван нікуди не дівся');
    expect((await rec(page))?.last).toBe('scrappy');
    await onScreen(page, vp, 'результат пропуску');
    await tapIt(page.locator('[data-ui="mg-close"]'));
    const sum = page.locator('[data-ui="sd-summary"]');
    await expect(sum).toHaveAttribute('data-road', 'scrappy');
    await expect(page.locator('[data-ui="sd-sum-road"]')).toContainText('Дорога додому: пізно й сонні, зате вдома');
    await expect(page.locator('[data-ui="sd-restart"]'), 'день завершується, нічого не заблоковано').toBeVisible();
  });
}

test('GAME-351 · дорогу вже пройдено (перезавантаження) → одразу підсумок; англійською теж', async ({ page }) => {
  const vp = VIEWPORTS[1] as (typeof VIEWPORTS)[number];
  await open(page, vp, { lang: 'en', results: { 'mg.drive-home': { last: 'good', consequence: 'home.early', plays: 1, scrappyStreak: 0 } as never } as never });
  await expect(page.locator('[data-ui="minigame"]'), 'дорогу не повторюємо').toHaveCount(0);
  await expect(page.locator('[data-ui="sd-sum-road"]')).toContainText('The road home: early and bright-eyed');
});
