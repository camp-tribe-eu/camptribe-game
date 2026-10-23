// GAME-93 · графіка LPC на живій сцені: ходьба в чотири боки (кадр змінюється, стоїть — кадр спокою), 3/4-глибина
// (позаду намету — дах закриває персонажа, перед наметом — ні), мапа з тайлами 32 px.
import { expect, test, type Page } from '@playwright/test';

type Dir = 'up' | 'left' | 'down' | 'right';
interface Probe {
  ready: boolean; playerX: number; playerY: number; playerFrame: number; playerDir: Dir; playerMoving: boolean;
  playerDepth: number; coveredTiles: number; behindTiles: number; cameraScrollY: number;
}
const ROW: Record<Dir, number> = { up: 0, left: 1, down: 2, right: 3 };   // рядки листа LPC
const COLS = 9;

const probe = (page: Page): Promise<Probe> => page.evaluate(() => ({ ...(window as unknown as { __game: { probe: Probe } }).__game.probe }));

async function open(page: Page): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: Probe } }).__game?.probe.ready === true, null, { timeout: 30_000 });
  expect(errors).toEqual([]);
}

/** Тримає клавішу, доки умова не справдиться (межа maxMs), і повертає всі кадри, що пройшли за цей час. */
async function hold(page: Page, key: string, until: (p: Probe) => boolean, maxMs = 4000): Promise<{ end: Probe; seen: Probe[] }> {
  const seen: Probe[] = [];
  await page.keyboard.down(key);
  const start = Date.now();
  let p = await probe(page);
  seen.push(p);
  while (!until(p) && Date.now() - start < maxMs) { await page.waitForTimeout(16); p = await probe(page); seen.push(p); }
  await page.keyboard.up(key);
  await page.waitForTimeout(250);   // гасіння швидкості й зупинка анімації
  return { end: await probe(page), seen };
}

test.describe('LPC на сцені (десктоп 1280×800)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('на старті персонаж стоїть обличчям до гравця: кадр спокою вниз, анімація не грає', async ({ page }) => {
    await open(page);
    const p = await probe(page);
    expect(p.playerDir).toBe('down');
    expect(p.playerFrame).toBe(ROW.down * COLS);
    expect(p.playerMoving).toBe(false);
  });

  for (const [key, dir, axis, sign] of [['ArrowDown', 'down', 'y', 1], ['ArrowUp', 'up', 'y', -1], ['ArrowLeft', 'left', 'x', -1], ['ArrowRight', 'right', 'x', 1]] as const) {
    test(`ходьба ${dir}: кадр змінюється в рядку свого напрямку, відпустив — кадр спокою`, async ({ page }) => {
      await open(page);
      if (dir === 'up') await hold(page, 'ArrowDown', (p) => p.playerY >= 260, 3000);   // вгору є куди йти: далеко від наметів
      const a = await probe(page);
      // Тримаємо, доки не побачимо три різні кадри ходьби (а не фіксований час): під навантаженням кадри йдуть повільно.
      const frames = new Set<number>();
      const { seen } = await hold(page, key, (p) => {
        if (p.playerMoving) frames.add(p.playerFrame);
        return frames.size >= 3 && (axis === 'y' ? p.playerY - a.playerY : p.playerX - a.playerX) * sign > 40;
      }, 4000);
      const walking = seen.filter((p) => p.playerMoving);
      expect(walking.length, `${dir}: анімація грала`).toBeGreaterThan(3);
      for (const p of walking) {
        expect(Math.floor(p.playerFrame / COLS), `${dir}: рядок листа`).toBe(ROW[dir]);
        expect(p.playerFrame % COLS, `${dir}: у ході — не кадр спокою`).toBeGreaterThan(0);
      }
      expect(new Set(walking.map((p) => p.playerFrame)).size, `${dir}: кадри міняються`).toBeGreaterThanOrEqual(3);
      // Зупинка — за подією, а не за фіксованою паузою: на завантаженій машині кадр сцени приходить із запізненням.
      await expect.poll(async () => (await probe(page)).playerMoving, { timeout: 5_000, message: `${dir}: стоїть` }).toBe(false);
      await expect.poll(async () => (await probe(page)).playerFrame, { timeout: 5_000, message: `${dir}: кадр спокою` }).toBe(ROW[dir] * COLS);
      // Кадр не «залипає»: ще за 300 мс той самий.
      await page.waitForTimeout(300);
      expect((await probe(page)).playerFrame).toBe(ROW[dir] * COLS);
    });
  }

  test('упертий у стіну персонаж не «йде на місці»: кадр спокою, напрямок до стіни зберігається', async ({ page }) => {
    await open(page);
    const { end } = await hold(page, 'ArrowRight', () => false, 2500);        // до стіни x=320 і далі тиснемо
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(400);
    const p = await probe(page);
    await page.keyboard.up('ArrowRight');
    expect(end.playerX).toBeGreaterThan(280);
    expect(p.playerMoving).toBe(false);
    expect(p.playerFrame).toBe(ROW.right * COLS);
  });

  // 3/4-глибина: два намети в рядках 2–3 (дах — шар above, низ — walls), між ними прохід у стовпцях 3–4 (x 96–160).
  test('глибина: перед наметом дах НЕ закриває персонажа, позаду — закриває; глибина персонажа = y ніг', async ({ page }) => {
    await open(page);
    const front = (await hold(page, 'ArrowUp', (p) => p.playerY <= 136, 3000)).end;   // впирається в низ намету B: ноги ≈ 133
    expect(front.playerDepth).toBeCloseTo(front.playerY, 5);
    expect(front.behindTiles, 'дах намету лежить позаду персонажа, що стоїть перед наметом').toBeGreaterThan(0);
    expect(front.coveredTiles, 'перед наметом дах не перекриває').toBe(0);

    await hold(page, 'ArrowLeft', (p) => p.playerX <= 150, 3000);                       // у прохід між наметами
    const back = (await hold(page, 'ArrowUp', (p) => p.playerY <= 100, 3000)).end;      // і позад намету (його низ — рядок 3, y 96–128)
    expect(back.playerY).toBeLessThan(128);
    expect(back.playerDepth).toBeLessThan(128);                                          // глибина лінії основи намету — 128
    expect(back.coveredTiles, 'позаду намету дах закриває кадр персонажа').toBeGreaterThan(0);
  });

  test('мапа 32 px: камера їде за персонажем лише по вертикалі (кадр 640 завширшки = мапа), у межах 384 − 352', async ({ page }) => {
    await open(page);
    const p = (await hold(page, 'ArrowDown', () => false, 1500)).end;
    expect(p.cameraScrollY).toBeGreaterThan(0);
    expect(p.cameraScrollY).toBeLessThanOrEqual(32);
  });
});
