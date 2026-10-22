// GAME-24 (рух, камера, колізії, взаємодія) і GAME-69 (дотик, три в'юпорти) — у справжньому браузері.
import { expect, test, type Page } from '@playwright/test';

interface Probe { ready: boolean; playerX: number; playerY: number; nearObject: string | null; commandsSent: number; cameraScrollX: number; cameraScrollY: number }

const probe = (page: Page): Promise<Probe> => page.evaluate(() => ({ ...(window as unknown as { __game: { probe: Probe } }).__game.probe }));
const grants = (page: Page): Promise<string[]> =>
  page.evaluate(() => [...(window as unknown as { __game: { bridge: { state: { game: { grants: string[] } } } } }).__game.bridge.state.game.grants]);

async function open(page: Page, query = ''): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/${query}`);
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: Probe } }).__game?.probe.ready === true, null, { timeout: 30_000 });
  expect(errors).toEqual([]);
}

async function holdKey(page: Page, key: string, until: (p: Probe) => boolean, maxMs = 4000): Promise<Probe> {
  await page.keyboard.down(key);
  const start = Date.now();
  let p = await probe(page);
  while (!until(p) && Date.now() - start < maxMs) { await page.waitForTimeout(16); p = await probe(page); }
  await page.keyboard.up(key);
  await page.waitForTimeout(50);
  return probe(page);
}

/** Утримати дотикову кнопку (pointer-події, як від пальця). false — кнопки не видно, прохід неможливий. */
async function holdTouch(page: Page, action: string, until: (p: Probe) => boolean, maxMs = 4000): Promise<boolean> {
  const btn = page.locator(`[data-touch="${action}"]`);
  if (!(await btn.isVisible())) return false;
  await btn.dispatchEvent('pointerdown');
  const start = Date.now();
  let p = await probe(page);
  while (!until(p) && Date.now() - start < maxMs) { await page.waitForTimeout(16); p = await probe(page); }
  await btn.dispatchEvent('pointerup');
  await page.waitForTimeout(50);
  return true;
}

/** Повний прохід дотиком: дійти до вогнища і взаємодіяти. Повертає кількість надісланих команд. */
async function touchFlow(page: Page): Promise<number> {
  if (!(await holdTouch(page, 'left', (p) => p.playerX <= 60))) return 0;
  if (!(await holdTouch(page, 'up', (p) => p.nearObject !== null))) return 0;
  if (!(await holdTouch(page, 'interact', () => true, 100))) return 0;
  await page.waitForTimeout(100);
  return (await probe(page)).commandsSent;
}

test.describe('клавіатура (десктоп)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('стрілка 1 с зсуває персонажа в очікуваному напрямку', async ({ page }) => {
    await open(page);
    const p0 = await probe(page);
    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(1000);
    await page.keyboard.up('ArrowDown');
    const p1 = await probe(page);
    expect(p1.playerY - p0.playerY).toBeGreaterThan(30);   // ~64 px/с; запас на старт кадрів
    expect(Math.abs(p1.playerX - p0.playerX)).toBeLessThan(1);
  });

  test('60+ кадрів поштовху в стіну — персонаж лишається по цей бік', async ({ page }) => {
    await open(page);
    const p = await holdKey(page, 'ArrowRight', () => false, 2500);
    expect(p.playerX).toBeGreaterThan(140);                  // дійшов до стіни…
    expect(p.playerX + 6).toBeLessThanOrEqual(160 + 0.5);    // …і не пройшов (ліва грань стіни x=160)
  });

  test('камера йде за персонажем у межах мапи', async ({ page }) => {
    await open(page);
    const p0 = await probe(page);
    const p1 = await holdKey(page, 'ArrowDown', () => false, 1500);
    expect(p1.cameraScrollY).toBeGreaterThan(p0.cameraScrollY);
    expect(p1.cameraScrollY).toBeLessThanOrEqual(192 - 160);
  });

  test('дія біля об’єкта — рівно одна команда; подвійне натискання — одна; в ядрі нагорода одна', async ({ page }) => {
    await open(page);
    await holdKey(page, 'ArrowLeft', (p) => p.playerX <= 60);
    const near = await holdKey(page, 'ArrowUp', (p) => p.nearObject !== null);
    expect(near.nearObject).toBe('obj.campfire');
    await page.keyboard.press('Space');
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);
    expect((await probe(page)).commandsSent).toBe(1);
    await page.waitForTimeout(500);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(100);
    expect((await probe(page)).commandsSent).toBe(2);            // друга свідома взаємодія — друга команда…
    expect((await grants(page)).filter((g) => g === 'rw.campfire_warmth')).toHaveLength(1); // …але нагорода рівно одна
  });

  test('далеко від об’єкта дія не надсилає команд', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);
    expect((await probe(page)).commandsSent).toBe(0);
  });
});

const VIEWPORTS = [
  { name: 'телефон', width: 390, height: 844, isMobile: true },
  { name: 'планшет', width: 820, height: 1180, isMobile: true },
  { name: 'десктоп з дотиком', width: 1280, height: 800, isMobile: false },
] as const;

for (const vp of VIEWPORTS) {
  test.describe(`дотик · ${vp.name} ${vp.width}×${vp.height}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: vp.isMobile });

    test('рух і взаємодія дотиком — одна команда', async ({ page }) => {
      await open(page);
      expect(await touchFlow(page)).toBe(1);
    });

    test('кожна дотикова ціль ≥ 44×44 CSS px', async ({ page }) => {
      await open(page);
      const boxes = await page.locator('[data-touch]').evaluateAll((els) =>
        els.map((e) => { const r = e.getBoundingClientRect(); return { a: (e as HTMLElement).dataset.touch, w: r.width, h: r.height }; }));
      expect(boxes).toHaveLength(5);
      for (const b of boxes) { expect(b.w, b.a).toBeGreaterThanOrEqual(44); expect(b.h, b.a).toBeGreaterThanOrEqual(44); }
    });

    test('негативний контроль: прихована кнопка взаємодії — прохід дотиком неможливий', async ({ page }) => {
      await open(page, '?hideTouch=interact');
      expect(await touchFlow(page)).toBe(0);
    });
  });
}

test.describe('поворот екрана (телефон)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('поворот не втрачає стан сцени', async ({ page }) => {
    await open(page);
    await holdTouch(page, 'down', (p) => p.playerY > 110);
    const before = await probe(page);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(300);
    const after = await probe(page);
    expect(after.ready).toBe(true);
    expect(after.playerX).toBeCloseTo(before.playerX, 0);
    expect(after.playerY).toBeCloseTo(before.playerY, 0);
    expect(after.commandsSent).toBe(before.commandsSent);
  });
});
