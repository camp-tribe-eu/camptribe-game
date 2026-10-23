// GAME-14 · спайк Phaser 4. Кожен пункт «Способу перевірки» — окремий тест із числом.
import { expect, test, type Page } from '@playwright/test';

const ZOOM = 3;

interface SpikeProbe { ready: boolean; pushFrames: number; framesPushed: number; playerX: number; wallLeftX: number }

async function open(page: Page): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/spike.html');
  await page.waitForFunction(() => (window as unknown as { __spike?: SpikeProbe }).__spike?.ready === true, null, { timeout: 30_000 });
  expect(errors).toEqual([]);
}

const probe = (page: Page): Promise<SpikeProbe> =>
  page.evaluate(() => ({ ...(window as unknown as { __spike: SpikeProbe }).__spike }));

test('мапа .tmj з тайлами Kenney завантажується; скриншот — артефакт', async ({ page }, info) => {
  await open(page);
  const shot = await page.locator('#game canvas').screenshot();
  await info.attach('spike-scene', { body: shot, contentType: 'image/png' });
  // Канва не порожня: щонайменше 5 різних кольорів (трава, стежка, стіна, гравець, фон-тайли).
  const colors = await distinctColors(page, shot);
  expect(colors).toBeGreaterThanOrEqual(5);
});

test(`піксель — рівні блоки ${ZOOM}×${ZOOM}: усі пікселі блоку одного кольору (скрипт, не око)`, async ({ page }) => {
  await open(page);
  const shot = await page.locator('#game canvas').screenshot();
  const bad = await page.evaluate(async ([b64, z]) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    if (!ctx) return { blocks: 0, bad: -1, w: 0, h: 0 };
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let blocks = 0, badBlocks = 0;
    for (let y = 0; y + z <= c.height; y += z) {
      for (let x = 0; x + z <= c.width; x += z) {
        blocks++;
        const i0 = (y * c.width + x) * 4;
        let same = true;
        for (let dy = 0; dy < z && same; dy++) for (let dx = 0; dx < z; dx++) {
          const i = ((y + dy) * c.width + (x + dx)) * 4;
          if (d[i] !== d[i0] || d[i + 1] !== d[i0 + 1] || d[i + 2] !== d[i0 + 2]) { same = false; break; }
        }
        if (!same) badBlocks++;
      }
    }
    return { blocks, bad: badBlocks, w: c.width, h: c.height };
  }, [shot.toString('base64'), ZOOM] as const);
  expect(bad.w).toBe(320 * ZOOM);
  expect(bad.h).toBe(192 * ZOOM);
  expect(bad.blocks).toBe(320 * 192);
  expect(bad.bad).toBe(0);
});

test('персонаж, якого штовхають у стіну 60 кадрів, не проходить крізь неї', async ({ page }) => {
  await open(page);
  const before = await probe(page);
  await page.evaluate(() => { (window as unknown as { __spike: SpikeProbe }).__spike.pushFrames = 60; });
  await page.waitForFunction(() => (window as unknown as { __spike: SpikeProbe }).__spike.framesPushed >= 60, null, { timeout: 20_000 });
  const after = await probe(page);
  expect(after.framesPushed).toBe(60);
  // Рухався (інакше «не пройшов» нічого не доводить)…
  expect(after.playerX).toBeGreaterThan(before.playerX + 16);
  // …і зупинився на лівій грані стіни.
  expect(after.playerX).toBeLessThanOrEqual(after.wallLeftX + 0.5);
});

async function distinctColors(page: Page, png: Buffer): Promise<number> {
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    if (!ctx) return 0;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const set = new Set<number>();
    for (let i = 0; i < d.length; i += 4 * 97) set.add(((d[i] ?? 0) << 16) | ((d[i + 1] ?? 0) << 8) | (d[i + 2] ?? 0));
    return set.size;
  }, png.toString('base64'));
}
