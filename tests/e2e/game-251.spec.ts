// GAME-251 · «Ніч видно»: вночі навколо героя — м'яке світле коло (радіус ≈ 2,75 тайла), вдень його нема. Піксель біля героя помітно світліший за
// піксель за ~5 тайлів. Мутація (коло вимкнено) → ЧЕРВОНИЙ. Знімок 932×430 — research/night-light/after.png (G251_SHOT=1).
import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { waitGameReady } from './ready';

interface Hero { radius: number; alpha: number }
const g = <T>(page: Page, read: string): Promise<T> => page.evaluate((r) => JSON.parse(JSON.stringify(new Function('g', `return ${r}`)((window as unknown as { __game: unknown }).__game))) as unknown, read) as Promise<T>;

async function open(page: Page, atMinute: number): Promise<void> {
  await page.addInitScript(() => { try { localStorage.setItem('camplife.settings.v1', JSON.stringify({ textScale: 100, language: 'uk', hintSeen: true })); } catch { /* сховища немає */ } });
  await page.setViewportSize({ width: 932, height: 430 });
  await page.goto(`/?seed=2&map=camp&noAutosave=1&noReveal=1&atMinute=${atMinute}`);
  await waitGameReady(page);
  await page.waitForTimeout(900);
}

/** Яскравість (0…255) квадрата 12×12 ігрових px: поруч із героєм і на 5 тайлах (160 px) від нього в чотирьох сторонах (ті, що в кадрі й далеко від вогнища). */
async function lumNear(page: Page): Promise<{ near: number; far: number[] }> {
  const p = await g<{ playerX: number; playerY: number; cameraScrollX: number; cameraScrollY: number }>(page, 'g.probe');
  const png = (await page.locator('#stage canvas').screenshot()).toString('base64');
  return page.evaluate(async ({ png, p }) => {
    const img = new Image(); img.src = `data:image/png;base64,${png}`; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d'); if (!ctx) throw new Error('no 2d');
    ctx.drawImage(img, 0, 0);
    const zoom = img.width / (document.querySelector('#stage canvas') as HTMLCanvasElement).width;
    const lum = (wx: number, wy: number): number | null => {
      const S = 12 * zoom, x = (wx - p.cameraScrollX) * zoom - S / 2, y = (wy - p.cameraScrollY) * zoom - S / 2;
      if (x < 0 || y < 0 || x + S > img.width || y + S > img.height) return null;
      const d = ctx.getImageData(Math.round(x), Math.round(y), Math.round(S), Math.round(S)).data;
      let s = 0; for (let i = 0; i < d.length; i += 4) s += 0.2126 * (d[i] ?? 0) + 0.7152 * (d[i + 1] ?? 0) + 0.0722 * (d[i + 2] ?? 0);
      return s / (d.length / 4);
    };
    const far = [[160, 0], [-160, 0], [0, 160], [0, -160]].filter(([dx, dy]) => Math.hypot(p.playerX + (dx ?? 0) - 112, p.playerY + (dy ?? 0) - 132) > 90)
      .map(([dx, dy]) => lum(p.playerX + (dx ?? 0), p.playerY + (dy ?? 0))).filter((v): v is number => v !== null);
    return { near: lum(p.playerX + 24, p.playerY + 4) ?? -1, far };
  }, { png, p });
}

test('вночі навколо героя світліше, ніж за 5 тайлів; вдень кола нема', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, 240);   // 12:00
  const day = await g<Hero>(page, 'g.probe.daylight.heroLight');
  expect(day.alpha).toBe(0);
  await open(page, 750);   // 20:30 (ніч)
  const h = await g<Hero>(page, 'g.probe.daylight.heroLight');
  expect(h.alpha, 'коло героя вночі').toBeGreaterThan(0.3);
  expect(h.radius / 32).toBeGreaterThanOrEqual(2.5);
  expect(h.radius / 32).toBeLessThanOrEqual(3);
  const { near, far } = await lumNear(page);
  expect(far.length, 'жодної контрольної точки в кадрі — тест нічого не доводить').toBeGreaterThan(0);
  for (const f of far) expect(near, `біля героя ${near.toFixed(1)} проти далеких ${f.toFixed(1)}`).toBeGreaterThan(f + 12);
  if (process.env.G251_SHOT) { mkdirSync('research/night-light', { recursive: true }); await page.screenshot({ path: 'research/night-light/after.png' }); }
});
