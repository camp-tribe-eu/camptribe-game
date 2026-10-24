// GAME-97 · частота кадрів сцени. Після сцени LPC (GAME-93) ігровий годинник відставав від реального: кадри були повільні,
// а Phaser і міст обрізають довгий кадр (≤ ~200/250 мс), тож час «губився». Міряємо fps самою сценою (probe.fps, вікно ~3 с).
// Поріг ≥ 20 fps: годинник ядра йде 1 хв/с, поки кадр ≤ 250 мс (MAX_FRAME_MS), тобто мінімум 4 fps; 20 fps — запас 5× над
// цією межею, тож вимір не червоніє від шуму, але червоніє від довгої роботи в кадрі (негативний контроль: 300 мс у update).
import { expect, test, type Page } from '@playwright/test';

// Без сусідів: проєкт «perf» іде після всіх інших (playwright.config.ts), а тут — по одному тесту за раз.
test.describe.configure({ mode: 'serial' });

const FLOOR_FPS = 20;
interface Probe { ready: boolean; fps: number; fpsWindows: number }
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
