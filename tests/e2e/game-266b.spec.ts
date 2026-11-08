// GAME-266 ч.2 · дорога з тайлів LPC (не пласка смуга), без емодзі-знаків, кемпер у масштабі сторожа GAME-222. Два вьюпорти.
// Міра дороги: у правій третині кадру беремо рядки, де домінує коричневий (R−G > 20); у них σ яскравості пікселів ≥ 9 і σ середніх рядків ≥ 5
// (стара пласка стежка: 4,6 і 1,5; нова: 13–16 і 10–12). Мутація: повернути одну плитку ґрунту в build_road → тест червоніє.
import { execFileSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';

interface Probe { ready: boolean; markerIcons: Record<string, string> }

async function roadStats(page: Page): Promise<{ bandRows: number; lumStd: number; rowStd: number }> {
  const b64 = (await page.screenshot()).toString('base64');
  return page.evaluate(async (data) => {
    const img = new Image(); img.src = `data:image/png;base64,${data}`; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d'); if (!ctx) throw new Error('no 2d context'); ctx.drawImage(img, 0, 0);
    const x0 = Math.floor(img.width * 0.62), w = Math.floor(img.width * 0.97) - x0;
    const px = ctx.getImageData(x0, 0, w, img.height).data;
    const lums: number[] = []; const rowMeans: number[] = []; let bandRows = 0;
    for (let y = 0; y < img.height; y++) {
      let brown = 0, sum = 0; const row: number[] = [];
      for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; const r = px[i] ?? 0, g = px[i + 1] ?? 0, b = px[i + 2] ?? 0; if (r - g > 20) brown++; const l = (r + g + b) / 3; sum += l; row.push(l); }
      if (brown / w > 0.6) { bandRows++; lums.push(...row); rowMeans.push(sum / w); }
    }
    const std = (a: number[]): number => { if (!a.length) return 0; const m = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };
    return { bandRows, lumStd: std(lums), rowStd: std(rowMeans) };
  }, b64);
}

for (const vp of [{ width: 390, height: 844 }, { width: 932, height: 430 }]) {
  test.describe(`GAME-266b ${vp.width}×${vp.height}`, () => {
    test.use({ viewport: vp });
    test('дорога — не пласка; жодного емодзі-знака; кемпер у масштабі', async ({ page }) => {
      test.setTimeout(90_000);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto('/?seed=2&map=road');
      await page.waitForFunction(() => (window as unknown as { __game?: { probe: Probe } }).__game?.probe.ready === true, null, { timeout: 30_000 });
      await page.waitForTimeout(800);
      if (process.env.G266_TAG) await page.screenshot({ path: `research/game-266/${process.env.G266_TAG}-${vp.width}-road.png` });
      const s = await roadStats(page);
      console.log(`GAME-266b ${vp.width}: смуга ${s.bandRows} рядків, σ пікселів ${s.lumStd.toFixed(1)}, σ рядків ${s.rowStd.toFixed(1)}`);
      expect(s.bandRows, 'смуги дороги в кадрі не знайдено — тест нічого не доводить').toBeGreaterThanOrEqual(64);
      expect(s.lumStd, 'дорога — пласка смуга одного тону').toBeGreaterThanOrEqual(9);
      expect(s.rowStd, 'дорога без узбіччя: рядки смуги однакові').toBeGreaterThanOrEqual(5);
      // знаки: ні піктограм-емодзі в DOM, ні запасної «зірки» на мапі
      const pictos = await page.evaluate(() => [...document.body.innerText.matchAll(/\p{Extended_Pictographic}/gu)].map((m) => m[0]).filter((ch) => ['⛺', '🏕', '🅷', '⭐', '★'].includes(ch)));
      expect(pictos, 'емодзі-знак у кадрі').toEqual([]);
      const icons = Object.values(await page.evaluate(() => (window as unknown as { __game: { probe: Probe } }).__game.probe.markerIcons));
      expect(icons).not.toContain('star');
      expect(errors).toEqual([]);
    });
  });
}

test('кемпер: висота й ширина в межах сторожа масштабу GAME-222', () => {
  const out = execFileSync('python3', ['scripts/art/check_world.py'], { encoding: 'utf8' });
  const row = out.split('\n').find((l) => l.startsWith('motorhome'));
  if (!row) throw new Error('кемпер зник зі звіту сторожа');
  const [, w = 0, h = 0, pxm = 0] = row.trim().split(/\s+/).map(Number);
  console.log(`GAME-266b кемпер ${w}×${h} px, ${pxm} px/м`);
  expect(h, 'кемпер вищий за 3 тайли').toBeLessThanOrEqual(96);
  expect(pxm).toBeGreaterThanOrEqual(21); expect(pxm).toBeLessThanOrEqual(35);
  expect(out).toContain('помилок 0');
});
