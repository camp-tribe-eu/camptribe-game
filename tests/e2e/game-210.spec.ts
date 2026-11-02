// GAME-210 · «краса кадру»: крони/дахи над героєм (з прозорістю, поки він під ними) і плями світла з вікон на підлозі інтер'єрів.
// Мутації (докази, що тест уміє червоніти): глибина смуг у scene.makeBands нижча за героя → «над героєм» і fade червоні; плями вимкнені → тест плям червоний.
import { expect, test, type Page } from '@playwright/test';

interface Probe {
  ready: boolean; playerX: number; playerY: number; playerDepth: number; coveredTiles: number; behindTiles: number;
  canopy: { bands: number; over: number; minAlpha: number };
  light: { patches: number; depth: number; alpha: number };
  daylight: { visible: boolean; darkness: number };
}
const probe = (page: Page): Promise<Probe> => page.evaluate(() => ({ ...(window as unknown as { __game: { probe: Probe } }).__game.probe }));

async function open(page: Page, query = ''): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/?${query}`);
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: Probe } }).__game?.probe.ready === true, null, { timeout: 30_000 });
  expect(errors).toEqual([]);
}

async function hold(page: Page, key: string, until: (p: Probe) => boolean, maxMs = 10_000): Promise<Probe> {
  await page.keyboard.down(key);
  const start = Date.now();
  let p = await probe(page);
  while (!until(p) && Date.now() - start < maxMs) { await page.waitForTimeout(16); p = await probe(page); }
  await page.keyboard.up(key);
  await page.waitForTimeout(250);
  return probe(page);
}

test.describe('крони над героєм (GAME-210, табір 1280×800)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  // Той самий маршрут, що в game-93: перед наметом (ноги ≈133) — смуга позаду героя; у проході позад намету — смуга НАД героєм.
  test('позаду намету крона над героєм (глибина смуги > глибини героя) і напівпрозора; перед ним — ні', async ({ page }) => {
    await open(page);
    const front = await hold(page, 'ArrowUp', (p) => p.playerY <= 136);
    expect(front.coveredTiles, 'перед наметом дах не перекриває').toBe(0);
    expect(front.canopy.minAlpha, 'крона, що не над героєм, непрозора').toBe(1);

    await hold(page, 'ArrowLeft', (p) => p.playerX <= 150);
    const back = await hold(page, 'ArrowUp', (p) => p.playerY <= 100);
    expect(back.canopy.over, 'є смуга з глибиною БІЛЬШОЮ за глибину героя').toBeGreaterThan(0);
    expect(back.coveredTiles, 'вона перекриває кадр героя').toBeGreaterThan(0);
    await expect.poll(async () => (await probe(page)).canopy.minAlpha, { timeout: 5_000, message: 'крона над героєм напівпрозора' }).toBeLessThan(0.7);

    // Вийшов з-під крони — вона знову непрозора (покадрово, без tween).
    await hold(page, 'ArrowDown', (p) => p.playerY >= 150);
    await expect.poll(async () => (await probe(page)).canopy.minAlpha, { timeout: 5_000, message: 'вийшов — крона знову непрозора' }).toBe(1);
  });
});

for (const map of ['home', 'shop'] as const) {
  test(`плями світла з вікон на підлозі «${map}»: намальовані, під героєм, вдень повні, вночі згаслі`, async ({ page }) => {
    await open(page, `map=${map}&noReveal=1`);
    const day = await probe(page);
    expect(day.light.patches, 'плями є').toBeGreaterThanOrEqual(3);
    expect(day.light.depth, 'пляма — на підлозі, під героєм і меблями (глибина менша за героя)').toBeLessThan(day.playerDepth);
    expect(day.light.alpha, 'вдень повна').toBe(1);
    await open(page, `map=${map}&noReveal=1&atMinute=960`);
    await expect.poll(async () => (await probe(page)).light.alpha, { timeout: 5_000, message: 'вночі пляма згасла' }).toBe(0);
  });
}

test('табір без вікон: плям світла нема', async ({ page }) => {
  await open(page);
  expect((await probe(page)).light.patches).toBe(0);
});
