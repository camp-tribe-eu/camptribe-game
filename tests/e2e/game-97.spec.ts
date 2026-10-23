// GAME-97 · частота кадрів сцени. Після сцени LPC (GAME-93) ігровий годинник відставав від реального: кадри були повільні,
// а Phaser і міст обрізають довгий кадр (≤ ~200/250 мс), тож час «губився». Міряємо fps самою сценою (probe.fps, вікно ~3 с).
// Поріг ≥ 20 fps: годинник ядра йде 1 хв/с, поки кадр ≤ 250 мс (MAX_FRAME_MS), тобто мінімум 4 fps; 20 fps — запас 5× над
// цією межею, тож вимір не червоніє від шуму, але червоніє від довгої роботи в кадрі (негативний контроль: 300 мс у update).
import { expect, test, type Page } from '@playwright/test';

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
