// GAME-309 · дорога у справжньому браузері, обидві орієнтації, один палець: поїздку проходять СПРАВЖНІМИ
// кнопками й свайпом по дорозі до кожного з трьох результатів. Кадри дає тест (стенд drive-harness.tsx) —
// жодних очікувань за часом і жодного керування героєм із Node (GAME-298).
// Мутації (перелік у PR): .mg-btn без min-height 48 → «ціль < 48 px» червоніє; камера без штрафу → «гроші не
// зменшились» червоніє; пауза не заморожує кадри → «кадри на паузі» червоніє.
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { expect, test, type Page } from '@playwright/test';

test.use({ hasTouch: true });

const SHOTS = process.env.G309_SHOTS;
const SHOT_DIR = fileURLToPath(new URL('../../research/game-309/', import.meta.url));
const VIEWPORTS = [{ name: 'portrait', w: 390, h: 844 }, { name: 'landscape', w: 932, h: 430 }];
/** Кадрів у пачці між рішеннями гравця: 12 кадрів — 0,2 с гри, тобто реакція вп'ятеро швидша за потрібну. */
const BATCH = 12;
/** Пачок на поїздку з запасом: межа гри — 5400 кадрів. */
const BATCHES = 600;

let bundle = '';
test.beforeAll(async () => {
  const r = await build({ configFile: false, logLevel: 'silent', define: { __GAME_VERSION__: '"t"', __GAME_COMMIT__: '"t"' }, oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } }, esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
    build: { write: false, minify: false, lib: { entry: fileURLToPath(new URL('./drive-harness.tsx', import.meta.url)), formats: ['iife'], name: 'DR' } } } as never) as unknown as { output: { code: string }[] } | { output: { code: string }[] }[];
  bundle = (Array.isArray(r) ? r[0] : r)?.output[0]?.code ?? '';
  expect(bundle.length, 'стенд не зібрався').toBeGreaterThan(1000);
  if (SHOTS) mkdirSync(SHOT_DIR, { recursive: true });
});

interface St {
  phase: string; paused: boolean; frame: number; limit: number; helped: boolean; outcome: string | null;
  reported: { outcome: string; consequence: string }[];
  lane: number; pace: string; fines: number; money: number; cameraAhead: boolean; offer: string | null;
  fuelL: number; comfort: number; roadSec: number; arrival: string; drivePhase: string;
}
type Api = { open(o: { lang: string; seed: number; scrappyStreak: number }): void; frame(n: number): void; advice(): number | null; state(): St };
const state = (page: Page): Promise<St> => page.evaluate(() => (window as unknown as { __drive: Api }).__drive.state());
const frame = (page: Page, n: number): Promise<void> => page.evaluate((k) => (window as unknown as { __drive: Api }).__drive.frame(k), n);
const advice = (page: Page): Promise<number | null> => page.evaluate(() => (window as unknown as { __drive: Api }).__drive.advice());

async function openDrive(page: Page, vp: { w: number; h: number }, lang = 'uk', seed = 7, scrappyStreak = 0): Promise<void> {
  await page.setViewportSize({ width: vp.w, height: vp.h });
  await page.goto('/');
  await page.addScriptTag({ content: bundle });
  await page.evaluate(([l, s, k]) => (window as unknown as { __drive: Api }).__drive.open({ lang: l as string, seed: s as number, scrappyStreak: k as number }), [lang, seed, scrappyStreak] as const);
  await expect(page.locator('[data-ui="minigame"]')).toBeVisible();
}

/** Кожна видима кнопка: ≥ 48×48 і повністю в екрані; поле гри не прокручується вбік. */
async function checkTargets(page: Page, label: string): Promise<void> {
  const r = await page.evaluate(() => {
    const out: string[] = [];
    const root = document.querySelector('.mg') as HTMLElement;
    for (const b of Array.from(root.querySelectorAll<HTMLElement>('button'))) {
      const bb = b.getBoundingClientRect();
      if (bb.width === 0 && bb.height === 0) continue;
      if (bb.width < 48 || bb.height < 48) out.push(`${b.dataset.ui}: ${bb.width.toFixed(1)}×${bb.height.toFixed(1)} < 48`);
      if (bb.left < -0.5 || bb.top < -0.5 || bb.right > innerWidth + 0.5 || bb.bottom > innerHeight + 0.5) out.push(`${b.dataset.ui}: поза екраном`);
    }
    if (root.scrollWidth > root.clientWidth + 1) out.push(`горизонтальна прокрутка ${root.scrollWidth} > ${root.clientWidth}`);
    return out;
  });
  expect(r, label).toEqual([]);
}

/** Свайп по дорозі справжніми вказівниками дотику: палець на центр потрібної смуги. */
async function swipeToLane(page: Page, lane: number): Promise<void> {
  const road = page.locator('[data-ui="mg-drive-road"]');
  const box = await road.boundingBox();
  if (!box) throw new Error('дороги немає на екрані');
  const x = box.x + box.width * ((lane * 2 + 1) / 6);
  const y = box.y + box.height / 2;
  const init = { pointerType: 'touch', pointerId: 1, isPrimary: true, bubbles: true };
  await road.dispatchEvent('pointerdown', { ...init, clientX: box.x + box.width / 2, clientY: y });
  await road.dispatchEvent('pointermove', { ...init, clientX: x, clientY: y, buttons: 1 });
}

interface Play { readonly swipes: number; readonly taps: number; readonly st: St }
/** Проїхати поїздку пальцем до результату. `hurry` — тиснути «жвавіше» там, де камери попереду немає. */
async function playDrive(page: Page, opts: { hurry?: boolean; dodge?: boolean } = {}): Promise<Play> {
  const dodge = opts.dodge !== false;
  let swipes = 0; let taps = 0;
  let st = await state(page);
  for (let i = 0; i < BATCHES && st.phase === 'play'; i++) {
    if (dodge) {
      const free = await advice(page);
      if (free !== null && free !== st.lane) { await swipeToLane(page, free); swipes++; }
    }
    const wantBrisk = opts.hurry === true && !st.cameraAhead;
    if (wantBrisk !== (st.pace === 'brisk')) { await page.locator('[data-ui="mg-drive-pace"]').tap(); taps++; }
    if (st.offer === 'fuel' && st.fuelL < 1.2) { await page.locator('[data-ui="mg-drive-stop"]').tap(); taps++; }
    await frame(page, BATCH);
    st = await state(page);
  }
  return { swipes, taps, st };
}

for (const vp of VIEWPORTS) {
  test(`GAME-309 · поїздка проходиться пальцем до результату, ${vp.name} ${vp.w}×${vp.h}`, async ({ page }) => {
    await openDrive(page, vp);
    await expect(page.locator('[data-ui="mg-intro"]')).toBeVisible();
    await checkTargets(page, 'вступ');
    await page.locator('[data-ui="mg-start"]').tap();

    // Смуга прогресу: скільки проїхали, скільки лишилось і чи встигаємо до рецепції.
    await expect(page.locator('[data-ui="mg-drive-done"]')).toBeVisible();
    await expect(page.locator('[data-ui="mg-drive-left"]')).toBeVisible();
    await expect(page.locator('[data-ui="mg-drive-eta"]')).toBeVisible();
    await checkTargets(page, 'гра');
    await frame(page, 60);
    if (SHOTS) await page.screenshot({ path: `${SHOT_DIR}${vp.name}-drive.png` });

    // Пауза доступна завжди й справді зупиняє кадри.
    await page.locator('[data-ui="mg-pause"]').tap();
    const frozen = (await state(page)).frame;
    await frame(page, 120);
    expect((await state(page)).frame, 'кадри на паузі йшли далі').toBe(frozen);
    if (SHOTS) await page.screenshot({ path: `${SHOT_DIR}${vp.name}-paused.png` });
    await page.locator('[data-ui="mg-resume"]').tap();

    // Свайп по дорозі міняє смугу — без жодного влучання в час.
    const before = (await state(page)).lane;
    await swipeToLane(page, before === 2 ? 0 : 2);
    await frame(page, 40);
    expect((await state(page)).lane, 'свайп не змінив смуги').not.toBe(before);

    const r = await playDrive(page, { hurry: true });
    expect(r.swipes, 'жодного перестроювання — перевірка нічого не довела').toBeGreaterThan(0);
    expect(r.st.phase, 'поїздка не дійшла до результату').toBe('result');
    expect(['good', 'fine', 'scrappy']).toContain(r.st.outcome);
    // Результат записано рівно раз, і його наслідок — значення f.arrival (docs/ARRIVAL-CONTRACT.md).
    expect(r.st.reported).toHaveLength(1);
    expect(r.st.reported[0]?.consequence).toBe(`arrival.${r.st.arrival}`);
    expect(['arrival.early', 'arrival.ontime', 'arrival.late']).toContain(r.st.reported[0]?.consequence);
    await expect(page.locator('[data-ui="mg-result"]')).toBeVisible();
    await checkTargets(page, 'результат');
    if (SHOTS) await page.screenshot({ path: `${SHOT_DIR}${vp.name}-result.png` });
    await page.locator('[data-ui="mg-close"]').tap();
    expect((await state(page)).phase).toBe('closed');
  });
}

test('GAME-309 · камера: знак попереджає заздалегідь, а штраф справді забирає гроші', async ({ page }) => {
  await openDrive(page, VIEWPORTS[0] as { w: number; h: number }, 'uk', 2);
  await page.locator('[data-ui="mg-start"]').tap();
  await page.locator('[data-ui="mg-drive-pace"]').tap();   // жваво — і не скидаємо швидкість на знак
  const money = (await state(page)).money;
  let sawSign = 0;
  let st = await state(page);
  for (let i = 0; i < BATCHES && st.phase === 'play' && st.fines === 0; i++) {
    if (st.cameraAhead) {
      sawSign++;
      if (sawSign === 1 && SHOTS) await page.screenshot({ path: `${SHOT_DIR}camera-sign.png` });
      await expect(page.locator('[data-ui="mg-drive-camera"]')).toBeVisible();
    }
    await frame(page, BATCH);
    st = await state(page);
  }
  expect(sawSign, 'знак камери жодного разу не з’явився').toBeGreaterThan(0);
  expect(st.fines, 'камера не виписала штрафу').toBeGreaterThan(0);
  expect(st.money, 'штраф не зняв грошей родини').toBeLessThan(money);
});

test('GAME-309 · «сяк-так» не блокує: нічого не робив — приїхав пізно, і це не глухий кут', async ({ page }) => {
  await openDrive(page, VIEWPORTS[0] as { w: number; h: number });
  await page.locator('[data-ui="mg-start"]').tap();
  const r = await playDrive(page, { dodge: false });
  expect(r.st.phase).toBe('result');
  expect(r.st.outcome).toBe('scrappy');
  expect(r.st.reported[0]?.consequence).toBe('arrival.late');
  await page.locator('[data-ui="mg-close"]').tap();
  expect((await state(page)).phase, 'результат «сяк-так» не закрився').toBe('closed');
});

test('GAME-309 · допомога після двох «сяк-так» поспіль: більше часу, і про неї сказано без докору', async ({ page }) => {
  await openDrive(page, VIEWPORTS[0] as { w: number; h: number }, 'uk', 7, 2);
  const st = await state(page);
  expect(st.helped).toBe(true);
  expect(st.limit).toBeGreaterThan(90 * 60);
  await expect(page.locator('[data-ui="mg-help"]')).toBeVisible();
  await expect(page.locator('[data-ui="mg-hint"]')).toBeVisible();
});
