// GAME-354 · приймання №9 (екран): 600×600 — дошка без накладання липкого низу й без білої смуги, «Дрова» без гортання; ніч у низькому ландшафті — «До підсумку» на екрані;
// «Риба» — кнопка вудки не стрибає, коли рядок «Ще трохи роботи» зникає; «Чому:» біля «Вузлів» переживає перемонтування дошки (сейв).
// Мутації (перевірено, див. звіт): прибрати @media-блок «GAME-354» у index.html → «квадрат» червоніє; прибрати `.sd-board-wrap { background }` → «фон» червоніє;
// прибрати резерв рядка (camp-more-slot) у CampRoutines → «риба» червоніє; прибрати липкий низ ночі (camp-summary-foot) → «ніч» червоніє;
// прибрати читання reasons із сейву (початковий стан) → «чому» червоніє; прибрати reasons із запису сейву → «запис» червоніє.
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { expect, test, type Locator, type Page } from '@playwright/test';

test.use({ hasTouch: true });

const BOARD_VPS = [
  { name: 'portrait', w: 390, h: 844 },
  { name: 'landscape', w: 932, h: 430 },
  { name: 'square', w: 600, h: 600 },
];
const NIGHT_VPS = [
  { name: 'landscape', w: 932, h: 430 },
  { name: 'landscape-390', w: 844, h: 390 },
  { name: 'landscape-tight', w: 932, h: 360 },   // 13-й слід на живій збірці додає ~50 px: тут той самий запас
];

let bundle = '';
test.beforeAll(async () => {
  const r = await build({ configFile: false, logLevel: 'silent', define: { __GAME_VERSION__: '"t"', __GAME_COMMIT__: '"t"' }, oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } }, esbuild: {
    jsx: 'automatic', jsxImportSource: 'preact' }, build: { write: false, minify: false, lib: { entry: fileURLToPath(new URL('./routines-harness.tsx', import.meta.url)), formats: ['iife'], name: 'H' } } } as never) as unknown as { output: { code: string }[] };
  bundle = (Array.isArray(r) ? r[0] : r)?.output[0]?.code ?? '';
});

const NIGHT_BOARD = { round: 'evening', picks: [], results: { water: 'good', firewood: 'good', fire: 'good', lanterns: 'good', fish: 'good', berries: 'good', tidy: 'good', knots: 'good' }, facts: { water: 1, dryLogs: 8, lit: 3, fish: 2, bitter: 0, berries: 5, foodOut: false }, devices: {} };
const tapIt = async (l: Locator): Promise<void> => { await l.scrollIntoViewIfNeeded(); await l.tap(); };
const boot = async (page: Page, w: number, h: number): Promise<void> => {
  await page.setViewportSize({ width: w, height: h });
  await page.goto('/');
  await page.addScriptTag({ content: bundle });
};
/** Справжній SampleDay (дошка в обгортці .sd-board-wrap, як у грі) → відкрити дошку. */
const openBoard = async (page: Page, board?: unknown): Promise<void> => {
  await page.evaluate((b) => (window as unknown as { __mountSample: (g: string, b?: unknown) => void }).__mountSample('day', b), board);
  await tapIt(page.locator('[data-ui="sd-board"]'));
  await page.locator('[data-ui="camp-board"]').waitFor();
};

for (const vp of BOARD_VPS) {
  test(`GAME-354 · дошка: жоден рядок не під липким низом, «Далі»/«Ніч» на екрані — ${vp.name}`, async ({ page }) => {
    await boot(page, vp.w, vp.h);
    await openBoard(page);
    const m = await page.evaluate(() => {
      const camp = document.querySelector<HTMLElement>('.sd-board-wrap .ui-camp') as HTMLElement;
      const foot = (document.querySelector('[data-ui="camp-foot"]') as HTMLElement).getBoundingClientRect();
      const noScroll = camp.scrollHeight - camp.clientHeight <= 0;
      camp.scrollTop = camp.scrollHeight;   // у кінці гортання липкий низ лежить ПІСЛЯ останнього рядка
      const f2 = (document.querySelector('[data-ui="camp-foot"]') as HTMLElement).getBoundingClientRect();
      const rows = [...document.querySelectorAll('[data-ui="camp-routine"]')].map((e) => { const r = e.getBoundingClientRect(); return { id: e.getAttribute('data-id'), top: r.top, bottom: r.bottom }; });
      camp.scrollTop = 0;
      return { noScroll, footTop: f2.top, footBottom: f2.bottom, footTop0: foot.top, rows, sh: camp.scrollHeight, ch: camp.clientHeight };
    });
    expect(m.rows.length).toBe(8);
    for (const r of m.rows) expect(r.bottom, `рядок «${r.id}» не під «Далі»/«Ніч» (${Math.round(r.bottom)} проти ${Math.round(m.footTop)})`).toBeLessThanOrEqual(m.footTop + 0.5);
    expect(m.footBottom, '«Далі»/«Ніч» на екрані').toBeLessThanOrEqual(vp.h);
    if (vp.name === 'square') expect(m.noScroll, `квадрат: дошка вміщається без гортання (${m.sh} на ${m.ch})`).toBe(true);
  });
}

test('GAME-354 · фон: під дошкою нема прозорої смуги, крізь яку видно мапу — квадрат', async ({ page }) => {
  await boot(page, 600, 600);
  await openBoard(page);
  const bg = await page.evaluate(() => getComputedStyle(document.querySelector('.sd-board-wrap') as HTMLElement).backgroundColor);
  expect(bg, 'фон обгортки дошки').not.toBe('rgba(0, 0, 0, 0)');
  expect(bg).not.toBe('transparent');
});

for (const vp of BOARD_VPS) {
  test(`GAME-354 · «Дрова» у справжній обгортці дошки: 8 полін, «Далі» без гортання — ${vp.name}`, async ({ page }) => {
    await boot(page, vp.w, vp.h);
    await openBoard(page);
    await tapIt(page.locator('[data-ui="camp-routine"][data-id="firewood"]'));
    await tapIt(page.locator('[data-ui="wood-place-choice"][data-place="near"]'));
    await expect(page.locator('[data-ui="wood-log"]')).toHaveCount(8);
    const m = await page.evaluate(() => {
      const camp = document.querySelector<HTMLElement>('.sd-board-wrap .ui-camp') as HTMLElement;
      const cr = camp.getBoundingClientRect();
      const b = (s: string) => { const r = (document.querySelector(s) as HTMLElement).getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; };
      const logs = [...document.querySelectorAll('[data-ui="wood-log"]')].map((e) => e.getBoundingClientRect().bottom);
      return { over: camp.scrollHeight - camp.clientHeight, campBottom: cr.bottom, done: b('[data-ui="wood-done"]'), logs };
    });
    expect(m.over, `панель дров не гортається (${m.over})`).toBeLessThanOrEqual(0);
    expect(m.done.bottom, '«Далі» в межах панелі').toBeLessThanOrEqual(m.campBottom + 0.5);
    for (const [i, l] of m.logs.entries()) expect(l, `поліно ${i + 1} в межах панелі`).toBeLessThanOrEqual(m.campBottom + 0.5);
  });
}

for (const vp of NIGHT_VPS) {
  test(`GAME-354 · ніч: «До підсумку дня» на екрані при багатьох слідах — ${vp.name}`, async ({ page }) => {
    await boot(page, vp.w, vp.h);
    await openBoard(page, NIGHT_BOARD);
    await tapIt(page.locator('[data-ui="camp-to-night"]'));
    await page.locator('[data-ui="camp-night"]').waitFor();
    expect(await page.locator('[data-ui="night-beat"]').count(), 'багато слідів').toBeGreaterThanOrEqual(12);
    const r = await page.locator('[data-ui="camp-summary"]').evaluate((e) => { const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, h: b.height }; });
    expect(r.bottom, `«До підсумку дня» на екрані (${Math.round(r.top)}..${Math.round(r.bottom)} при ${vp.h})`).toBeLessThanOrEqual(vp.h);
    expect(r.top).toBeGreaterThanOrEqual(0);
    expect(r.h).toBeGreaterThanOrEqual(44);
  });
}

test('GAME-354 · «Риба»: «Тримай вудку» не стрибає, коли рядок «Ще трохи роботи» зникає', async ({ page }) => {
  await boot(page, 390, 844);
  await page.evaluate(() => (window as unknown as { __mount: (x: unknown) => void }).__mount({ lang: 'uk', weather: 'sunny', seed: 7, devices: {} }));
  await tapIt(page.locator('[data-ui="camp-routine"][data-id="fish"]'));
  await page.locator('[data-ui="camp-work"][data-kind="fish"]').waitFor();
  await expect(page.locator('[data-ui="camp-more"]')).toBeVisible();
  const top = async () => page.locator('[data-ui="fish-rod"]').evaluate((e) => e.getBoundingClientRect().top);
  const before = await top();
  await page.evaluate(() => (window as unknown as { __frames: (n: number, dtMs: number) => void }).__frames(1300, 50));   // 65 с кадрів: «здаюсь» (60 с) відкриває вихід і прибирає рядок
  await expect(page.locator('[data-ui="camp-more"]')).toHaveCount(0);
  expect(await top(), 'вудка стоїть на тому ж місці').toBe(before);
});

const KNOTS_SCRAPPY = { round: 'noon', picks: [], results: { knots: 'scrappy' }, facts: { water: 0, dryLogs: 0, lit: 0, fish: 0, bitter: 0, foodOut: true }, devices: {}, reasons: { knots: 'camp.reason.knots.cross' } };
test('GAME-354 · «Чому:» біля «Вузлів» — із сейву (дошка перемонтується після місії) і назад у сейв', async ({ page }) => {
  await boot(page, 390, 844);
  await openBoard(page, KNOTS_SCRAPPY);
  const row = page.locator('[data-ui="camp-routine"][data-id="knots"]');
  await expect(row).toHaveAttribute('data-outcome', 'scrappy');
  await expect(row, 'причину з сейву видно на дошці').toContainText('Чому: мотузки перетнулися');
  const saved = await page.evaluate(() => (window as unknown as { __saved?: { reasons?: Record<string, string> } }).__saved);
  expect(saved?.reasons, 'причина лишається в записі сейву').toEqual({ knots: 'camp.reason.knots.cross' });
  // Результат змінився на «добре» — причини нема (і в записі теж).
  await page.evaluate((b) => (window as unknown as { __mountSample: (g: string, b?: unknown) => void }).__mountSample('day', b), { ...KNOTS_SCRAPPY, results: { knots: 'good' } });
  await tapIt(page.locator('[data-ui="sd-board"]'));
  await expect(page.locator('[data-ui="camp-routine"][data-id="knots"]')).not.toContainText('Чому');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __saved?: { results?: Record<string, string>; reasons?: unknown } }).__saved?.results?.knots)).toBe('good');
  expect(await page.evaluate(() => (window as unknown as { __saved?: { reasons?: unknown } }).__saved?.reasons)).toBeUndefined();
});
