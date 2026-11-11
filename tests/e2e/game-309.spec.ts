// GAME-309 · дорога: справжній екран, справжній дотик, обидві орієнтації. Тест ПРОХОДИТЬ УСЮ поїздку
// пальцем: свайпи по дорозі, кнопки швидкості й зупинки, пауза. Нічого не підкручує в логіці — лише
// стискає ігровий час (speedUp), бо п'ять хвилин реального очікування в CI нікому не потрібні.
// Знімки: G309_SHOTS=1 npx playwright test game-309 → research/game-309/.
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { expect, test, type Locator, type Page } from '@playwright/test';

const SHOTS = process.env.G309_SHOTS;
const SHOT_DIR = fileURLToPath(new URL('../../research/game-309/', import.meta.url));
const VIEWS = [{ name: 'portrait', w: 390, h: 844 }, { name: 'landscape', w: 932, h: 430 }];
/** Найменший дотиковий розмір (OD-014). */
const MIN_TAP = 48;
/** Прискорення ігрового часу в стенді: поїздка на 5 хв проходить за ~20 с. */
const SPEED_UP = 16;

test.use({ hasTouch: true });

let bundle = '';
test.beforeAll(async () => {
  const r = await build({
    configFile: false, logLevel: 'silent', define: { __GAME_VERSION__: '"t"', __GAME_COMMIT__: '"t"' },
    oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } }, esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
    build: { write: false, minify: false, lib: { entry: fileURLToPath(new URL('./drive-harness.tsx', import.meta.url)), formats: ['iife'], name: 'D' } },
  } as never) as unknown as { output: { code: string }[] } | { output: { code: string }[] }[];
  bundle = (Array.isArray(r) ? r[0] : r)?.output[0]?.code ?? '';
  expect(bundle.length, 'стенд не зібрався').toBeGreaterThan(1000);
  if (SHOTS) mkdirSync(SHOT_DIR, { recursive: true });
});

async function mount(page: Page, w: number, h: number, seed = 7): Promise<void> {
  await page.setViewportSize({ width: w, height: h });
  await page.goto('/');
  await page.addScriptTag({ content: bundle });
  await page.evaluate(([s, up]) => (window as unknown as { __drive: { mount: (x: unknown) => void } }).__drive.mount({ seed: s, moneyCents: 50_000, speedUp: up, lang: 'uk' }), [seed, SPEED_UP]);
  await expect(page.locator('[data-ui="drive"]')).toBeVisible();
}

const num = async (l: Locator, attr: string): Promise<number> => Number(await l.getAttribute(attr));

/** Свайп по дорозі справжніми вказівниками дотику. */
async function swipe(page: Page, dx: number): Promise<void> {
  const road = page.locator('[data-ui="drive-road"]');
  const box = await road.boundingBox();
  if (!box) throw new Error('дороги немає на екрані');
  const x = box.x + box.width / 2; const y = box.y + box.height / 2;
  const init = { pointerType: 'touch', pointerId: 1, isPrimary: true, bubbles: true };
  await road.dispatchEvent('pointerdown', { ...init, clientX: x, clientY: y });
  await road.dispatchEvent('pointerup', { ...init, clientX: x + dx, clientY: y });
}

/** Проїхати поїздку до кінця пальцем. Повертає, скільки разів перестроювались. */
async function drive(page: Page, steps = 400): Promise<number> {
  const root = page.locator('[data-ui="drive"]');
  let moves = 0;
  for (let i = 0; i < steps; i++) {
    if (await root.getAttribute('data-phase') === 'arrived') return moves;
    const advice = await page.evaluate(() => (window as unknown as { __drive: { advice: () => number | null } }).__drive.advice());
    const lane = await num(root, 'data-lane');
    if (advice !== null && advice !== lane) { await swipe(page, advice > lane ? 90 : -90); moves++; }
    const stop = page.locator('[data-ui="drive-stop"]');
    if (await stop.count() > 0 && Number(await root.getAttribute('data-fuel')) < 1.2) await stop.tap();
    await page.waitForTimeout(120);
  }
  return moves;
}

for (const v of VIEWS) {
  test(`GAME-309 · поїздку можна проїхати пальцем, ${v.name} ${v.w}×${v.h}`, async ({ page }) => {
    await mount(page, v.w, v.h);
    const root = page.locator('[data-ui="drive"]');

    // 1. Один палець: кожна кнопка — не менша за палець, і всі вміщаються на екран.
    for (const sel of ['drive-pause', 'drive-left-btn', 'drive-right-btn', 'drive-pace']) {
      const box = await page.locator(`[data-ui="${sel}"]`).boundingBox();
      expect(box, sel).not.toBeNull();
      expect(Math.min(box?.width ?? 0, box?.height ?? 0), `${sel} менша за палець`).toBeGreaterThanOrEqual(MIN_TAP);
      expect((box?.x ?? 0) + (box?.width ?? 0), `${sel} вилізла за екран`).toBeLessThanOrEqual(v.w + 1);
      expect((box?.y ?? 0) + (box?.height ?? 0), `${sel} вилізла за екран`).toBeLessThanOrEqual(v.h + 1);
    }

    // 2. Смуга прогресу показує шлях і чи встигаємо до рецепції.
    await expect(page.locator('[data-ui="drive-done"]')).toBeVisible();
    await expect(page.locator('[data-ui="drive-left"]')).toBeVisible();
    await expect(page.locator('[data-ui="drive-eta"]')).toBeVisible();

    // 3. Пауза доступна завжди й справді зупиняє дорогу.
    await page.locator('[data-ui="drive-pause"]').tap();
    await expect(page.locator('[data-ui="drive-paused"]')).toBeVisible();
    const frozen = await num(root, 'data-sec');
    await page.waitForTimeout(400);
    expect(await num(root, 'data-sec'), 'на паузі дорога їхала далі').toBe(frozen);
    if (SHOTS) await page.screenshot({ path: `${SHOT_DIR}${v.name}-paused.png` });
    await page.locator('[data-ui="drive-unpause"]').tap();

    // 4. Свайп міняє смугу — без жодного влучання в час.
    const before = await num(root, 'data-lane');
    await swipe(page, before === 2 ? -90 : 90);
    await expect.poll(async () => num(root, 'data-lane'), { timeout: 5000 }).not.toBe(before);

    // 5. Дві швидкості — однією кнопкою.
    const pace = page.locator('[data-ui="drive-pace"]');
    await pace.tap();
    await expect.poll(async () => root.getAttribute('data-pace'), { timeout: 5000 }).toBe('brisk');
    if (SHOTS) await page.screenshot({ path: `${SHOT_DIR}${v.name}-drive.png` });

    // 6. Уся поїздка пальцем до приїзду.
    const moves = await drive(page);
    expect(moves, 'жодного перестроювання — перевірка нічого не довела').toBeGreaterThan(0);
    await expect(page.locator('[data-ui="drive-result"]')).toBeVisible({ timeout: 15_000 });
    const outcome = await page.locator('[data-ui="drive-result"]').getAttribute('data-outcome');
    expect(['good', 'fine', 'scrappy']).toContain(outcome);

    // 7. Приїзд не блокується: вільні ділянки є завжди, і їх набір залежить від результату.
    const free = (await page.locator('[data-ui="drive-result"]').getAttribute('data-free') ?? '').split(' ').filter(Boolean);
    expect(free.length, `${outcome}: вільних ділянок не лишилось`).toBeGreaterThan(0);
    expect(free.length).toBe({ good: 4, fine: 3, scrappy: 2 }[outcome as 'good']);
    if (SHOTS) await page.screenshot({ path: `${SHOT_DIR}${v.name}-result.png` });
    await page.locator('[data-ui="drive-arrive"]').tap();
  });
}

test('GAME-309 · камера: знак з’являється заздалегідь, а штраф забирає гроші', async ({ page }) => {
  await mount(page, 390, 844, 2);
  const root = page.locator('[data-ui="drive"]');
  const money = await num(root, 'data-money');
  await page.locator('[data-ui="drive-pace"]').tap();   // жваво — і не скидаємо на знак
  await expect(page.locator('[data-ui="drive-camera-sign"]')).toBeVisible({ timeout: 30_000 });
  if (SHOTS) await page.screenshot({ path: `${SHOT_DIR}camera-sign.png` });
  await expect.poll(async () => num(root, 'data-fines'), { timeout: 30_000 }).toBeGreaterThan(0);
  expect(await num(root, 'data-money'), 'штраф не зняв грошей').toBeLessThan(money);
});
