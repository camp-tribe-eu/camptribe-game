// GAME-97 · частота кадрів сцени. Після сцени LPC (GAME-93) ігровий годинник відставав від реального: кадри були повільні,
// а Phaser і міст обрізають довгий кадр (≤ ~200/250 мс), тож час «губився». Міряємо fps самою сценою (probe.fps, вікно ~3 с).
// Поріг ≥ 20 fps: годинник ядра йде 1 хв/с, поки кадр ≤ 250 мс (MAX_FRAME_MS), тобто мінімум 4 fps; 20 fps — запас 5× над
// цією межею, тож вимір не червоніє від шуму, але червоніє від довгої роботи в кадрі (негативний контроль: 300 мс у update).
import { expect, test, type Page } from '@playwright/test';
import { budget } from './budgets';

// Без сусідів: проєкт «perf» іде після всіх інших (playwright.config.ts), а тут — по одному тесту за раз.
test.describe.configure({ mode: 'serial' });

const FLOOR_FPS = 20;
interface Probe { ready: boolean; fps: number; fpsWindows: number; followers: { x: number; y: number }[]; daylight: { visible: boolean } }
const probe = (page: Page): Promise<Probe> => page.evaluate(() => ({ ...(window as unknown as { __game: { probe: Probe } }).__game.probe }));

for (const vp of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`fps сцени ≥ ${FLOOR_FPS} на ${vp.width}×${vp.height}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto('/?seed=2');
    await page.waitForFunction(() => (window as unknown as { __game?: { probe: { ready: boolean } } }).__game?.probe.ready === true, null, { timeout: 30_000 });
    // Перше вікно могло почати ще до готовності сторінки, тож беремо ДРУГЕ закрите вікно — воно повністю в нашому вимірі.
    const w0 = (await probe(page)).fpsWindows;
    await page.waitForFunction((n) => (window as unknown as { __game: { probe: Probe } }).__game.probe.fpsWindows >= n + 2, w0, { timeout: 40_000, polling: 250 });
    const p = await probe(page);
    console.log(`GAME-97 fps ${vp.width}x${vp.height}: ${p.fps.toFixed(1)}`);
    expect(p.fps).toBeGreaterThanOrEqual(FLOOR_FPS);
  });
}

// Корінь червоного ui-shell.spec.ts:19 на main: справа не лише у fps. Phaser згладжує дельту кадру — 120 кадрів після старту
// (і поза фокусом) ріже її до 16,7 мс, а понад 200 мс підміняє останньою «нормальною». Годинник, що брав згладжену дельту,
// при 8 fps ішов у 8 разів повільніше за реальний час. Тепер годинник бере сиру дельту (scene.ts), а слабкий пристрій тут —
// штучні 80 мс у кожному кадрі (?frameLagMs, лише збірка e2e): ≈ 11 fps, кадр із запасом нижче MAX_FRAME_MS навіть на повільному CI, і всі ці кадри — у тих 120.
// Негативний контроль: scene.ts зі згладженою дельтою (`this.bridge.frame(delta)`) — тут 1,2 с гри за 6 с (19 %), тест червоний.
test('при ≈ 11 fps годинник гри йде в ногу з реальним часом (≥ 80 %)', async ({ page }) => {
  const LAG_MS = 80;
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/?seed=2&frameLagMs=${LAG_MS}`);
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { ready: boolean } } }).__game?.probe.ready === true, null, { timeout: 30_000 });
  const gameMs = (): Promise<{ ms: number; at: number }> => page.evaluate(() => {
    const c = (window as unknown as { __game: { read: () => { clock: { minutes: number; accMs: number } } } }).__game.read().clock;
    return { ms: c.minutes * 1000 + c.accMs, at: performance.now() };   // STEP_MS = 1000: хвилина гри — секунда реального часу
  });
  const a = await gameMs();
  await page.waitForTimeout(6000);
  const b = await gameMs();
  const p = await probe(page);
  const ratio = (b.ms - a.ms) / (b.at - a.at);
  console.log(`GAME-97 годинник при lag ${LAG_MS} мс: ${(b.ms - a.ms).toFixed(0)} мс гри за ${(b.at - a.at).toFixed(0)} мс, fps ${p.fps.toFixed(1)}`);
  expect(p.fps, 'штучна затримка не спрацювала — тест нічого не доводить').toBeLessThan(15);
  expect(ratio).toBeGreaterThanOrEqual(0.8);
});

// GAME-38 · бюджет fps еталонної сцени (?seed=2, 1280×800, без ?frameLagMs): медіана з ≥ fpsSamples незалежних вікон probe.fps
// (по ~3 с, scene.ts) ≥ fpsMedianMin — обидва пороги з budgets.json. Тут, а не окремим файлом: проєкт perf іде послідовно лише
// в межах файла, а два файли perf розійшлися б різними воркерами й ділили б процесор.
// Негативний контроль: GAME38_FRAME_LAG_MS=80 npx playwright test game-97 --project=perf --no-deps -g "GAME-38" — ≈11 fps, червоне.
const FPS_MEDIAN_MIN = budget('fpsMedianMin');
const FPS_SAMPLES = budget('fpsSamples');
const fpsLag = Number(process.env.GAME38_FRAME_LAG_MS ?? 0);

/** Медіана з FPS_SAMPLES закритих вікон fps. `walk` — герой ходить туди-сюди весь вимір (слідувачі рухаються й анімуються — найважчий випадок). */
async function medianFps(page: Page, walk: boolean): Promise<{ samples: number[]; median: number }> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/?seed=2&atMinute=960${fpsLag ? `&frameLagMs=${fpsLag}` : ''}`);
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { ready: boolean } } }).__game?.probe.ready === true, null, { timeout: 30_000 });
  // GAME-112: еталонна сцена — З РОДИНОЮ (два слідувачі); без них fps міряв би сцену без найдорожчого, що в ній додалось.
  expect((await probe(page)).followers.length, 'у еталонній сцені нема слідувачів родини').toBeGreaterThanOrEqual(2);
  // GAME-99: старт гри тепер о 08:00 (день), тож для виміру З ефектом береться ніч (?atMinute=960 — найважчий випадок: маска + пляма); fps міряється З ефектом «день і ніч» (маска + пляма), а не без нього.
  expect((await probe(page)).daylight.visible, 'ефект день-ніч не намальовано — fps міряв би сцену без нього').toBe(true);
  let walking = walk;
  let travelled = 0;   // сумарний шлях слідувачів за вимір (тайлів-пікселів): герой ходить туди-сюди, тож «початок ≠ кінець» нічого б не доводило
  let prevPos = (await probe(page)).followers;
  const walker = (async (): Promise<void> => {   // рядок 5 мапи (спавн): вільно від x≈16 до x≈300; 1,5 с ходу ≈ 192 px (6 тайлів, далі за GAP слідувачів) — не впирається в стіни
    for (let left = true; walking; left = !left) { await page.keyboard.down(left ? 'ArrowLeft' : 'ArrowRight'); await page.waitForTimeout(750); const now = (await probe(page)).followers; travelled += now.reduce((a, f, i) => a + Math.hypot(f.x - (prevPos[i]?.x ?? f.x), f.y - (prevPos[i]?.y ?? f.y)), 0); prevPos = now; await page.waitForTimeout(750); await page.keyboard.up(left ? 'ArrowLeft' : 'ArrowRight'); }
  })();
  const nextWindow = async (after: number): Promise<Probe> => {
    await page.waitForFunction((n) => (window as unknown as { __game: { probe: Probe } }).__game.probe.fpsWindows > n, after, { timeout: 15_000, polling: 100 });
    return probe(page);
  };
  // Вікно, відкрите ще до готовності сторінки, відкидаємо: воно не повністю в нашому вимірі.
  let last = (await nextWindow((await probe(page)).fpsWindows)).fpsWindows;
  const samples: number[] = [];
  while (samples.length < FPS_SAMPLES) {
    const p = await nextWindow(last);   // кожен замір — окреме закрите вікно (fpsWindows зріс), не повтор того самого числа
    samples.push(p.fps);
    last = p.fpsWindows;
  }
  walking = false;
  await walker;
  if (walk) expect(travelled, 'слідувачі стояли — ходьби не було').toBeGreaterThan(100);   // ≥ 100 px сумарно (за вимір ≈ 15 с — сотні)
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const at = (i: number): number => sorted[i] ?? Number.NaN;   // NaN, а не 0: порожній список не пройде порогу тихо
  return { samples, median: sorted.length % 2 ? at(mid) : (at(mid - 1) + at(mid)) / 2 };
}

for (const walk of [false, true]) {
  test(`GAME-38 медіана fps еталонної сцени з родиною${walk ? ' під час ходьби (GAME-112)' : ''} ≥ ${FPS_MEDIAN_MIN} з ≥ ${FPS_SAMPLES} замірів`, async ({ page }) => {
    test.setTimeout(30_000 + FPS_SAMPLES * 10_000);
    const { samples, median } = await medianFps(page, walk);
    console.log(`GAME-38 fps median ${median.toFixed(1)}${walk ? ' (ходьба)' : ''} з ${samples.length} замірів [${samples.map((s) => s.toFixed(1)).join(', ')}] (поріг ${FPS_MEDIAN_MIN}${fpsLag ? `, frameLagMs ${fpsLag}` : ''})`);
    expect(samples.length).toBeGreaterThanOrEqual(FPS_SAMPLES);
    expect(median).toBeGreaterThanOrEqual(FPS_MEDIAN_MIN);
  });
}
