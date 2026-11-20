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

const mount = async (page: Page, weather: 'sunny' | 'cloudy' | 'rain' = 'rain', bare = false): Promise<void> => {
  await page.evaluate((s) => (window as unknown as { __mount: (x: unknown) => void }).__mount(s), { lang: 'uk', weather, seed: 7, bare });
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
    test.setTimeout(150_000);   // GAME-321: ягоди й порядок мають мінімум часу в роботі (20 с кадрів кожна) — це задум картки, а не повільність
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.goto('/');
    await page.addScriptTag({ content: bundle });
    await mount(page);
    if (SHOTS) mkdirSync(SHOTS, { recursive: true });

    // Дошка: вісім рутин (GAME-333: +«Вузли»), у кожної виконавець і причина саме сьогодні; решта родини при ділі.
    await expect(page.locator('[data-ui="camp-routine"]')).toHaveCount(8);
    await expect(page.locator('[data-ui="camp-busy"]')).toBeVisible();
    expect(await problems(page), 'дошка').toEqual([]);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${vp.name}-board.png` });

    // Дошка табору (§9а): верша стоїть, але занедбана — «ось-ось закінчиться»; догляд — і вона знову «працює саме».
    // Вогнище й ягоди — лише руками; вода поки без бочки — теж чекає рук.
    await expect(page.locator('[data-ui="camp-routine"][data-id="fish"]')).toHaveAttribute('data-status', 'low');
    await expect(page.locator('[data-ui="camp-routine"][data-id="fish"]')).toHaveAttribute('data-done', 'yes');
    await expect(page.locator('[data-ui="camp-routine"][data-id="fire"]')).toHaveAttribute('data-status', 'hands');
    await expect(page.locator('[data-ui="camp-routine"][data-id="water"]')).toHaveAttribute('data-status', 'hands');
    await tapIt(page.locator('[data-ui="camp-tend"][data-id="fish"]'));
    await expect(page.locator('[data-ui="camp-routine"][data-id="fish"]')).toHaveAttribute('data-status', 'auto');
    await expect(page.locator('[data-ui="camp-routine"][data-id="fish"]')).toHaveAttribute('data-outcome', 'good');

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
    // GAME-321: чотири ягоди зібрано, але «Досить» відкривається лише після мінімуму часу в роботі (кадри) — ждемо СТАН кнопки, не годинник.
    await expect(page.locator('[data-ui="berry-enough"]')).toBeDisabled();
    await expect(page.locator('[data-ui="berry-enough"]')).toBeEnabled({ timeout: 40_000 });
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
    await expect(page.locator('[data-ui="tidy-sleep"]')).toBeEnabled({ timeout: 40_000 });
    await tapIt(page.locator('[data-ui="tidy-sleep"]'));
    await expect(page.locator('[data-ui="camp-routine"][data-id="tidy"]')).toHaveAttribute('data-done', 'yes');

    // НІЧ: слід кожної рутини, прибраний табір — без лисиці, незроблені справи — свої наслідки, і жодного блоку.
    await tapIt(page.locator('[data-ui="camp-to-night"]'));
    await expect(page.locator('[data-ui="camp-night"]')).toHaveAttribute('data-blocked', 'no');
    await expect(page.locator('[data-ui="night-beat"]')).toHaveCount(9);
    await expect(page.locator('[data-ui="night-beat"][data-id="night.tidy.quiet"]')).toBeVisible();
    await expect(page.locator('[data-ui="night-beat"][data-id="night.light.dark"]')).toBeVisible();
    await expect(page.locator('[data-ui="night-beat"][data-id="night.wood.none"]')).toBeVisible();
    // Рибу дала доглянута верша — без вудки й без хвилин дня.
    await expect(page.locator('[data-ui="night-beat"][data-id="night.fish.supper"]')).toBeVisible();
    await expect(page.locator('[data-ui="night-morning"]')).toBeVisible();
    const over = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('.ui-camp');
      return root ? root.scrollWidth - innerWidth : 0;
    });
    expect(over, 'ніч ширша за екран').toBeLessThanOrEqual(1);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${vp.name}-night.png` });
  });
}

// GAME-321 · ОДИН табличний сторож на всі ручні рутини: кнопка виходу недоступна на старті й після одного дотику.
// Мутація (перевірено): прибрати `disabled={!ok('…')}` з будь-якої кнопки виходу в CampRoutines → цей тест червоніє саме на тій рутині.
const EXITS: readonly { id: string; exit: string; round: number; one: readonly string[] }[] = [
  { id: 'firewood', exit: 'wood-done', round: 0, one: ['[data-ui="wood-place-choice"][data-place="near"]'] },
  { id: 'lanterns', exit: 'lantern-done', round: 0, one: ['[data-ui="lantern-crank"][data-l="0"]'] },
  { id: 'fish', exit: 'fish-done', round: 0, one: ['[data-ui="fish-rod"]'] },
  { id: 'berries', exit: 'berry-enough', round: 0, one: ['[data-ui="berry"][data-i="0"]'] },
  { id: 'tidy', exit: 'tidy-sleep', round: 3, one: ['[data-ui="tidy-pick"][data-id="pot"]', '[data-ui="tidy-place"][data-place="car"]'] },
];
for (const vp of VIEWPORTS) {
  test(`GAME-321 · вихід із рутини закритий без роботи — ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.goto('/');
    await page.addScriptTag({ content: bundle });
    for (const r of EXITS) {
      await mount(page, 'rain', true);
      for (let k = 0; k < r.round; k++) await tapIt(page.locator('[data-ui="camp-next"]'));
      await tapIt(page.locator(`[data-ui="camp-routine"][data-id="${r.id}"]`));
      await expect(page.locator(`[data-ui="camp-work"][data-kind="${r.id}"]`)).toBeVisible();
      const open = (): Promise<boolean> => page.evaluate((sel) => { const b = document.querySelector<HTMLButtonElement>(sel); return b !== null && !b.disabled; }, `[data-ui="${r.exit}"]`);
      expect(await open(), `${r.id}: вихід доступний на старті`).toBe(false);
      for (const sel of r.one) await tapIt(page.locator(sel));
      expect(await open(), `${r.id}: вихід доступний після одного дотику`).toBe(false);
      // GAME-323: вимкнену кнопку ВИДНО вимкненою (раніше вона виглядала як увімкнена). Мутація (перевірено): прибрати css-правило `button:disabled` → червоніє.
      expect(Number(await page.locator(`[data-ui="${r.exit}"]`).evaluate((b) => getComputedStyle(b).opacity)), `${r.id}: вимкнений вихід видно тьмяним`).toBeLessThan(0.7);
      await expect(page.locator(`[data-ui="camp-work"][data-kind="${r.id}"]`), `${r.id}: панель роботи лишилась`).toBeVisible();
    }
  });
}

// GAME-323 · риба. Кнопка вудки не рухається, коли клює (раніше мітка «Клює!» зсувала її на 65 px — палець промахувався 3 з 3, мишею 0 риб із 28),
// а поклівку реально зловити так, як це робить людина: клює → ~400 мс на реакцію → підсікання → шкала видна → «піймав» → «лишити».
// Мутації (перевірено): прибрати `height` з `.ui-fish-slot` → «вудка не зсунулась» червоніє; BITE_MS = 300 → «зловлено» червоніє (див. й fishing.test).
for (const vp of VIEWPORTS) {
  test(`GAME-323 · риба: вудка стоїть на місці й улов досяжний — ${vp.name}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.goto('/');
    await page.addScriptTag({ content: bundle });
    await mount(page, 'rain', true);
    await tapIt(page.locator('[data-ui="camp-routine"][data-id="fish"]'));
    await expect(page.locator('[data-ui="camp-work"][data-kind="fish"]')).toBeVisible();
    const r = await page.evaluate(() => new Promise<{ tops: Record<string, number[]>; sawBite: boolean; sawReel: boolean; landed: string; missed: number; frames: number }>((resolve) => {
      const q = (s: string): HTMLElement | null => document.querySelector<HTMLElement>(s);
      const rod = (): HTMLElement | null => q('[data-ui="fish-rod"]');
      const phase = (): string => q('[data-ui="fish-slot"]')?.getAttribute('data-phase') ?? '';
      let held = false;
      const press = (down: boolean): void => { held = down; rod()?.dispatchEvent(new PointerEvent(down ? 'pointerdown' : 'pointerup', { bubbles: true })); };
      const tops: Record<string, number[]> = {};
      const out = { sawBite: false, sawReel: false, missed: 0 };
      let frame = 0; let n = 0; let prev = ''; let hookAt = 0;
      const pct = (e: HTMLElement | null): number => parseFloat(e?.style.left ?? '0');
      const done = (landed: string): void => resolve({ tops, ...out, landed, frames: frame });
      const loop = (): void => {
        frame++;
        const ph = phase();
        const b = rod()?.getBoundingClientRect();
        if (b) (tops[ph] ??= []).push(Math.round(b.top * 10) / 10);
        if (prev === 'bite' && ph === 'idle') out.missed++;
        if (ph !== prev) n = 0;
        n++; prev = ph;
        if (ph === 'idle' && !held) press(true);
        else if (ph === 'charge' && held && n > 20) press(false);
        else if (ph === 'bite') { out.sawBite = true; if (!held && n > 24) { press(true); hookAt = frame; } }   // ≈ 400 мс реакції
        else if (ph === 'reel') {
          out.sawReel = true;
          const z = q('.ui-fish-zone'); const fish = q('[data-ui="fish-reel"] .ui-camp-tilt i');
          const centre = pct(z) + parseFloat(z?.style.width ?? '0') / 2;
          const want = pct(fish) > centre;
          if (want !== held) press(want);
        } else if (ph === 'choice') { done(q('[data-ui="fish-landed"]')?.textContent ?? ''); return; }
        else if (ph === 'wait' && held) press(false);
        if (frame > 2400 || (hookAt > 0 && frame - hookAt > 2000)) { done('TIMEOUT'); return; }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }));
    expect(r.sawBite, 'поклівка була').toBe(true);
    expect(r.sawReel, 'після підсікання видно шкалу').toBe(true);
    expect(r.missed, 'людина з реакцією ~400 мс не пропускає клювання').toBe(0);
    expect(r.landed, 'зловлено: видно «Піймав: …»').toMatch(/Піймав: (Окунь|Короп|Форель|Щука)/);
    const all = Object.entries(r.tops).filter(([ph]) => ['idle', 'charge', 'wait', 'bite', 'reel'].includes(ph));
    expect(all.length, 'виміряно кілька фаз').toBeGreaterThanOrEqual(4);
    const flat = all.flatMap(([, v]) => v);
    expect(Math.max(...flat) - Math.min(...flat), `вудка не зсунулась між фазами: ${JSON.stringify(Object.fromEntries(all.map(([k, v]) => [k, [Math.min(...v), Math.max(...v)]])))}`).toBeLessThanOrEqual(0.5);
  });
}

// GAME-323 · альбом 932×430: робота й заїзд стоять на екрані без прокрутки (було: дрова 593, ліхтарі 603, порядок 444, заїзд 597 px).
// Мутація (перевірено): прибрати з index.html правило `.ui-camp-work { width: min(100%, 900px); }` й блок `.ui-camp[data-ui="drive-in"]` → червоніє на дровах/ліхтарях/порядку/заїзді.
test('GAME-323 · альбом: дрова, ліхтарі, порядок, вода, ягоди, риба й заїзд — без прокрутки', async ({ page }) => {
  await page.setViewportSize({ width: 932, height: 430 });
  await page.goto('/');
  await page.addScriptTag({ content: bundle });
  const over = (): Promise<number> => page.evaluate(() => { const e = document.querySelector<HTMLElement>('.ui-camp'); return e ? e.scrollHeight - e.clientHeight : -1; });
  const seen: string[] = [];
  const check = async (what: string): Promise<void> => { const o = await over(); seen.push(`${what} ${o}`); expect(o, `${what}: панель прокручується на ${o} px`).toBeLessThanOrEqual(0); };
  const open = async (id: string, round = 0): Promise<void> => {
    await mount(page, 'rain', true);
    for (let k = 0; k < round; k++) await tapIt(page.locator('[data-ui="camp-next"]'));
    await tapIt(page.locator(`[data-ui="camp-routine"][data-id="${id}"]`));
    await expect(page.locator(`[data-ui="camp-work"][data-kind="${id}"]`)).toBeVisible();
  };
  await open('firewood'); await tapIt(page.locator('[data-ui="wood-place-choice"][data-place="near"]')); await check('дрова');
  await open('lanterns'); await check('ліхтарі');
  await open('tidy', 3); await check('порядок');
  await open('water'); await check('вода');
  await open('berries'); await check('ягоди');
  await open('fish'); await check('риба');
  for (const lane of ['lane.water', 'lane.beeches', 'lane.meadow', 'lane.reception']) {
    await page.evaluate((l) => (window as unknown as { __mountDrive: (x: string) => void }).__mountDrive(l), lane);
    await expect(page.locator('[data-ui="drive-in"]')).toBeVisible();
    await check(`заїзд ${lane}`);
    const low = await page.evaluate(() => Math.max(...[...document.querySelectorAll<HTMLElement>('[data-ui="drive-in"] .ui-btn')].map((b) => b.getBoundingClientRect().bottom)));
    expect(low, `${lane}: кнопки заїзду в межах екрана`).toBeLessThanOrEqual(430);
  }
});

// GAME-323 · кінець зразкового дня: підсумок і ЄДИНА дія «Почати знову» (нова гра й перезавантаження), без дошки й старого меню.
// Мутація (перевірено): у SampleDay `ended` завжди false → червоніє; кнопку «Почати знову» — на закриття підсумку → червоніє.
for (const vp of VIEWPORTS) {
  test(`GAME-323 · після дня — підсумок з одним «Почати знову» — ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.goto('/');
    await page.addScriptTag({ content: bundle });
    const mountSample = (g: 'day' | 'done'): Promise<void> => page.evaluate((x) => (window as unknown as { __mountSample: (y: string) => void }).__mountSample(x), g);
    await mountSample('day');
    await expect(page.locator('[data-ui="sd-board"]'), 'протягом дня дошка є').toBeVisible();
    await expect(page.locator('[data-ui="sd-summary"]')).toHaveCount(0);
    await mountSample('done');
    await expect(page.locator('[data-ui="sd-summary"]')).toBeVisible();
    await expect(page.locator('[data-ui="sd-board"]'), 'після дня дошка не відкривається').toHaveCount(0);
    await expect(page.locator('[data-ui="sd-summary"] button'), 'єдина дія').toHaveCount(1);
    await expect(page.locator('[data-ui="sd-restart"]')).toHaveText('Почати знову');
    expect(await page.evaluate(() => (window as unknown as { __restarts: number }).__restarts)).toBe(0);
    await tapIt(page.locator('[data-ui="sd-restart"]'));
    expect(await page.evaluate(() => (window as unknown as { __restarts: number }).__restarts), '«Почати знову» просить нову гру').toBe(1);
    await expect(page.locator('[data-ui="sd-summary"]'), 'підсумок лишається, поки не перезавантажать').toBeVisible();
  });
}
