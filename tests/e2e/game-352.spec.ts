// GAME-352 · епізод закінчується ВДОМА: дорога додому пройдена → сцена «вдома» (два дотики) → кінцева картка з рядком від кожної ланки й «Почати знову».
// Стенд — справжній SampleDay зі справжнім CSS (home-harness.tsx). Мутації (прогнано руками, див. звіт картки):
//   прибрати з AFTER_NIGHT рядок 'home' → тест 1 червоніє на «сцена вдома»; прибрати з recapLines рядок дороги ('road') → тест 1 червоніє на sd-sum-road;
//   `.ui-camp-foot` у кінцевій картці замінити на div І утричі повторити рядки підсумку (довша за екран) → «кнопки поза екраном» червоніє на всіх трьох екранах (одна заміна на div без довшого тексту лишається зеленою: поточний текст вміщається — це чесна межа сторожа);
//   у HomeArrival прибрати `done()` на останньому дотику → тест 1 застрягає на «вдома».
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
    build: { write: false, minify: false, lib: { entry: fileURLToPath(new URL('./home-harness.tsx', import.meta.url)), formats: ['iife'], name: 'H' } } } as never) as unknown as { output: { code: string }[] } | { output: { code: string }[] }[];
  bundle = (Array.isArray(r) ? r[0] : r)?.output[0]?.code ?? '';
});

const tapIt = async (l: Locator): Promise<void> => { await l.scrollIntoViewIfNeeded(); await l.tap(); };
const num = (page: Page, k: '__restarts' | '__seen'): Promise<number> => page.evaluate((key) => (window as unknown as Record<string, number>)[key] ?? -1, k);

async function open(page: Page, vp: { w: number; h: number }, o: { home?: boolean; road?: string; lang?: 'uk' | 'en'; clean?: string } = {}): Promise<void> {
  await page.setViewportSize({ width: vp.w, height: vp.h });
  await page.goto('/');
  await page.addScriptTag({ content: bundle });
  await page.evaluate((x) => (window as unknown as { __mountHome: (y: unknown) => void }).__mountHome(x), o);
}
/** Кнопки картки лежать у межах екрана БЕЗ прокрутки сторінки, а текст картки або вміщається, або гортається (overflow-y auto) — обрізаного без виходу нема. */
async function fits(page: Page, vp: { w: number; h: number }, card: string, what: string): Promise<void> {
  const r = await page.evaluate(({ sel, w, h }) => {
    const c = document.querySelector<HTMLElement>(sel);
    if (!c) return { missing: true } as const;
    const btns = [...c.querySelectorAll<HTMLElement>('button')].map((b) => b.getBoundingClientRect());
    const oy = getComputedStyle(c).overflowY;
    return { missing: false, off: btns.filter((b) => b.top < -0.5 || b.left < -0.5 || b.bottom > h + 0.5 || b.right > w + 0.5).length, n: btns.length, clipped: c.scrollHeight > c.clientHeight + 1, scrolls: oy === 'auto' || oy === 'scroll', hpage: document.documentElement.scrollWidth > w + 1 };
  }, { sel: card, ...vp });
  expect(r.missing, `${what}: картка є`).toBe(false);
  if (r.missing) return;
  expect(r.n, `${what}: кнопка є`).toBeGreaterThan(0);
  expect(r.off, `${what}: кнопки поза екраном`).toBe(0);
  expect(r.hpage, `${what}: горизонтальної прокрутки нема`).toBe(false);
  expect(!r.clipped || r.scrolls, `${what}: текст або вміщається, або гортається`).toBe(true);
}

for (const vp of VIEWPORTS) {
  test(`GAME-352 · дорога додому пройдена → вдома (2 дотики) → кінець епізоду з усіма рядками → «Почати знову» — ${vp.name}`, async ({ page }) => {
    await open(page, vp);
    const home = page.locator('[data-ui="sd-home"]');
    await expect(home, 'сцена вдома').toBeVisible();
    await expect(page.locator('[data-ui="sd-summary"]'), 'кінцевої картки ще нема').toHaveCount(0);
    await expect(page.locator('[data-ui="sd-home-text"]')).toContainText('Ключ повертається в замку');
    await fits(page, vp, '[data-ui="sd-home"]', 'вдома, перша репліка');
    await tapIt(page.locator('[data-ui="sd-home-next"]'));
    await expect(home).toHaveAttribute('data-beat', '1');
    await expect(page.locator('[data-ui="sd-home-text"]')).toContainText('Рюкзаки розбирають');
    expect(await num(page, '__seen'), 'у сейв «вдома» ще не пишемо').toBe(0);
    await fits(page, vp, '[data-ui="sd-home"]', 'вдома, друга репліка');
    await tapIt(page.locator('[data-ui="sd-home-next"]'));
    expect(await num(page, '__seen'), 'останній дотик пише «вдома»').toBe(1);
    await expect(home, 'сцену закрито').toHaveCount(0);
    const sum = page.locator('[data-ui="sd-summary"]');
    await expect(sum).toBeVisible();
    await expect(page.locator('[data-ui="sd-end-title"]')).toHaveText('Вихідні біля озера · кінець епізоду');
    const ids = await sum.locator('li').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.ui));
    expect(ids, 'рядок від кожної ланки (ночі в цьому стенді нема)').toEqual(['sd-sum-arrival', 'sd-sum-pitch', 'sd-sum-missions', 'sd-sum-clean', 'sd-sum-road', 'sd-sum-wallet']);
    await expect(page.locator('[data-ui="sd-sum-arrival"]')).toContainText('Приїзд: рано й спокійно');
    await expect(page.locator('[data-ui="sd-sum-missions"]')).toContainText('Місій зроблено: 2');
    await expect(page.locator('[data-ui="sd-sum-clean"]')).toContainText('Чистота табору');
    await expect(page.locator('[data-ui="sd-sum-road"]')).toContainText('Дорога додому: вчасно, без поспіху');
    await expect(page.locator('[data-ui="sd-sum-wallet"]')).toContainText('Гаманець');
    await expect(sum, 'старого прощання нема').not.toContainText('Ранок настає завжди');
    await expect(sum.locator('button'), 'єдина дія — «Почати знову», «Продовжити» нема').toHaveCount(1);
    await expect(page.locator('[data-ui="sd-restart"]')).toHaveText('Почати знову');
    await fits(page, vp, '[data-ui="sd-summary"]', 'кінцева картка');
    await tapIt(page.locator('[data-ui="sd-restart"]'));
    expect(await num(page, '__restarts'), '«Почати знову» викликає перезапуск').toBe(1);
  });
}

test('GAME-352 · перезавантаження після приходу додому → одразу кінцева картка, не дорога й не сцена; англійською теж', async ({ page }) => {
  const vp = VIEWPORTS[1] as (typeof VIEWPORTS)[number];
  await open(page, vp, { home: true, lang: 'en', road: 'scrappy' });
  await expect(page.locator('[data-ui="sd-home"]'), 'сцену не повторюємо').toHaveCount(0);
  await expect(page.locator('[data-ui="sd-end-title"]')).toHaveText('Weekend by the lake · end of the episode');
  await expect(page.locator('[data-ui="sd-sum-road"]')).toContainText('The road home: late and sleepy, but home');
  await fits(page, vp, '[data-ui="sd-summary"]', 'кінцева картка, en');
});

test('GAME-352 · пізній приїзд має власну репліку вдома, без докору', async ({ page }) => {
  await open(page, VIEWPORTS[0] as (typeof VIEWPORTS)[number], { road: 'scrappy' });
  await tapIt(page.locator('[data-ui="sd-home-next"]'));
  await expect(page.locator('[data-ui="sd-home-text"]')).toContainText('Речі можуть зачекати до ранку');
});
