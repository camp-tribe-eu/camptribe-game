// atMinute — хвилини ЯДРА від старту; на екрані час = +8 год (DAY_START_MINUTE): ядро 0 = 08:00, 240 = 12:00, 720 = 20:00, 960 = 00:00.
// GAME-99 · ефект 1: день і ніч (нічна маска + тепла пляма вогнища). Доводимо ПІКСЕЛЯМИ справжньої сцени, а не лише числами зонда:
// середня яскравість полотна вночі помітно нижча, ніж удень; біля вогнища — яскравіша, ніж далі; з ?daylight=off (негативний контроль) ночі на екрані нема.
// Мутації (по одній, кожна червонить свій тест, див. research/visual-audit.md): MAX_DARKNESS → 0; glowAlpha → 0; прибрати updateDaylight із update.
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

interface Probe { ready: boolean; cameraScrollX: number; cameraScrollY: number; daylight: { on: boolean; visible: boolean; minuteOfDay: number; darkness: number; color: number; glow: number } }
const probe = (page: Page): Promise<Probe> => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __game: { probe: Probe } }).__game.probe)) as Probe);

async function open(page: Page, query: string, vp = { width: 1280, height: 800 }): Promise<void> {
  await page.setViewportSize(vp);
  await page.goto(`/?seed=2&${query}`);
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { ready: boolean } } }).__game?.probe.ready === true, null, { timeout: 30_000 });
  await page.waitForTimeout(400);   // кілька кадрів: update виставив ефект
}

/** Середня яскравість (0…255) полотна й диска навколо вогнища (радіус r ігрових px) — за знімком канви. */
async function luminance(page: Page): Promise<{ avg: number; fire: number }> {
  const p = await probe(page);
  const png = (await page.locator('#stage canvas').screenshot()).toString('base64');
  return page.evaluate(async ({ png, scrollX, scrollY }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${png}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('no 2d');
    ctx.drawImage(img, 0, 0);
    const game = document.querySelector('#stage canvas') as HTMLCanvasElement;
    const zoom = img.width / game.width;
    const lum = (x: number, y: number, w: number, h: number): number => {
      const d = ctx.getImageData(Math.max(0, Math.round(x)), Math.max(0, Math.round(y)), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 4) s += 0.2126 * (d[i] ?? 0) + 0.7152 * (d[i + 1] ?? 0) + 0.0722 * (d[i + 2] ?? 0);
      return s / (d.length / 4);
    };
    const R = 24 * zoom;   // квадрат ±24 ігрових px навколо вогнища (112, 132)
    return { avg: lum(0, 0, img.width, img.height), fire: lum((112 - scrollX) * zoom - R, (132 - scrollY) * zoom - R, 2 * R, 2 * R) };
  }, { png, scrollX: p.cameraScrollX, scrollY: p.cameraScrollY });
}

test.describe('GAME-99 день і ніч', () => {
  test('вночі (00:00 на екрані) маска й пляма видимі, затемнення = максимум', async ({ page }) => {
    await open(page, 'atMinute=960');
    const d = (await probe(page)).daylight;
    expect(d.on).toBe(true);
    expect(d.visible).toBe(true);
    expect(d.darkness).toBeGreaterThanOrEqual(0.7);
    expect(d.glow).toBeGreaterThan(0.5);
  });

  test('перший кадр нової гри (без atMinute) — день 08:00: маска й пляма приховані (BLOCKER рецензії PR #91)', async ({ page }) => {
    await open(page, '');
    const d = (await probe(page)).daylight;
    expect(d.minuteOfDay).toBeGreaterThanOrEqual(480);
    expect(d.minuteOfDay).toBeLessThan(500);
    expect(d.visible).toBe(false);
    expect(d.darkness).toBe(0);
    await expect(page.locator('[data-ui="hud-time"]')).toContainText('08:');
  });

  test('опівдні — маска й пляма приховані (кадр ідентичний до ефекту), затемнення 0', async ({ page }) => {
    await open(page, 'atMinute=240');
    const d = (await probe(page)).daylight;
    expect(d.minuteOfDay).toBeGreaterThanOrEqual(720);
    expect(d.visible).toBe(false);
    expect(d.darkness).toBe(0);
    expect(d.glow).toBe(0);
  });

  test('сутінки (20:00) — між днем і ніччю', async ({ page }) => {
    await open(page, 'atMinute=720');
    const d = (await probe(page)).daylight;
    expect(d.darkness).toBeGreaterThan(0.1);
    expect(d.darkness).toBeLessThan(0.8);
  });

  test('піксельно: ніч темніша за день щонайменше на 35 %, а біля вогнища світліше, ніж загалом', async ({ page }) => {
    await open(page, 'atMinute=240');
    const day = await luminance(page);
    await open(page, 'atMinute=960');
    const night = await luminance(page);
    console.log(`GAME-99 яскравість: день ${day.avg.toFixed(1)}, ніч ${night.avg.toFixed(1)} (вогнище: день ${day.fire.toFixed(1)}, ніч ${night.fire.toFixed(1)})`);
    expect(night.avg).toBeLessThan(day.avg * 0.65);
    // вогнище вночі яскравіше за решту нічного кадру у ≥ 1,4 раза (удень ця пляма — звичайна трава й вогонь)
    expect(night.fire / night.avg).toBeGreaterThan(1.4);
  });

  test('негативний контроль: ?daylight=off — вночі кадр не темнішає і зонд каже on=false', async ({ page }) => {
    await open(page, 'atMinute=240');
    const day = await luminance(page);
    await open(page, 'atMinute=960&daylight=off');
    const off = await luminance(page);
    expect((await probe(page)).daylight.on).toBe(false);
    expect((await probe(page)).daylight.visible).toBe(false);
    expect(off.avg).toBeGreaterThan(day.avg * 0.95);
  });

  // Знімки для власника (смак): лише з GAME99_SHOTS=<тека>; у звичайному прогоні пропущено (NOT RUN, не PASS).
  const shots = process.env.GAME99_SHOTS;
  for (const [name, vp] of [['portrait-390x844', { width: 390, height: 844 }], ['landscape-844x390', { width: 844, height: 390 }]] as const) {
    for (const [phase, q] of [['day', ''], ['dusk', 'atMinute=720'], ['night', 'atMinute=960'], ['before-no-effect', 'atMinute=960&daylight=off']] as const) {
      test(`знімок ${phase} ${name}`, async ({ page }) => {
        test.skip(!shots, 'GAME99_SHOTS не задано');
        await open(page, q, vp);
        mkdirSync(shots as string, { recursive: true });
        writeFileSync(`${shots}/${phase}-${name}.png`, await page.screenshot());
      });
    }
  }
});
