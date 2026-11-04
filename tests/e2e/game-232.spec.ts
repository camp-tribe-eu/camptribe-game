// GAME-232 · «Теплий колір дня»: світ вкритий кольором доби (ранок рожево-жовтий, день нейтральний, після 18:00 фіолетовий, після 20:00 темно-синій),
// а HUD (DOM поверх полотна) — ні. Час: ?atMinute=N — хвилини ядра від 08:00, на екрані 08:00 + N: 1380 → 07:00, 240 → 12:00, 630 → 18:30, 750 → 20:30.
// Знімки (G232_SHOTS або test-results/g232-shots): 390×844, 844×390 + пропорції 9:16, 1:1, 16:9. Виміри: піксель світу відрізняється між 12:00 і 20:30,
// піксель тексту HUD — ні; контраст тексту HUD (WCAG) під кожним кольором ≥ 4,5:1.
import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { waitGameReady } from './ready';

const SHOTS = process.env.G232_SHOTS ?? 'test-results/g232-shots';
const SETTINGS_KEY = 'camplife.settings.v1';
const TIMES = [{ name: '07h', at: 1380 }, { name: '12h', at: 240 }, { name: '18h30', at: 630 }, { name: '20h30', at: 750 }] as const;
const VIEWS = [
  { side: 'portrait', w: 390, h: 844 }, { side: 'landscape', w: 844, h: 390 },
  { side: '9x16', w: 360, h: 640 }, { side: '1x1', w: 600, h: 600 }, { side: '16x9', w: 800, h: 450 },
] as const;

interface Sample { world: [number, number, number]; hudText: [number, number, number]; hudBg: [number, number, number]; contrast: number; lum: number }

async function sample(page: Page): Promise<Sample> {
  const box = await page.locator('[data-ui="hud-time"]').boundingBox();
  if (!box) throw new Error('HUD-час не видно');
  const png = (await page.screenshot()).toString('base64');
  const vp = page.viewportSize() as { width: number; height: number };
  const cv = await page.locator('#stage canvas').boundingBox();
  if (!cv) throw new Error('полотна нема');
  return page.evaluate(async ({ png, box, vp, cv }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${png}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('no 2d');
    ctx.drawImage(img, 0, 0);
    const k = img.width / vp.width;
    const px = (x: number, y: number, w: number, h: number): Uint8ClampedArray => ctx.getImageData(Math.max(0, Math.round(x * k)), Math.max(0, Math.round(y * k)), Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))).data;
    const lin = (v: number): number => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    const lumOf = (r: number, g: number, b: number): number => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    // Світ: середній колір нижньої половини полотна (там лише світ, без шапки HUD).
    const wd = px(cv.x, cv.y + cv.height * 0.55, cv.width, cv.height * 0.4);
    let r = 0, g = 0, b = 0;
    const n = wd.length / 4;
    for (let i = 0; i < wd.length; i += 4) { r += wd[i] ?? 0; g += wd[i + 1] ?? 0; b += wd[i + 2] ?? 0; }
    // HUD: у рамці напису найсвітліший піксель — текст, найтемніший — тло.
    const hd = px(box.x, box.y, box.width, box.height);
    let hi = 0, lo = 1e9, hiI = 0, loI = 0;
    for (let i = 0; i < hd.length; i += 4) {
      const l = lumOf(hd[i] ?? 0, hd[i + 1] ?? 0, hd[i + 2] ?? 0);
      if (l > hi) { hi = l; hiI = i; }
      if (l < lo) { lo = l; loI = i; }
    }
    return {
      world: [r / n, g / n, b / n], hudText: [hd[hiI] ?? 0, hd[hiI + 1] ?? 0, hd[hiI + 2] ?? 0], hudBg: [hd[loI] ?? 0, hd[loI + 1] ?? 0, hd[loI + 2] ?? 0],
      contrast: (hi + 0.05) / (lo + 0.05), lum: 0.2126 * r / n + 0.7152 * g / n + 0.0722 * b / n,
    } as Sample;
  }, { png, box, vp, cv });
}

const dist = (a: readonly number[], b: readonly number[]): number => Math.hypot(...a.map((v, i) => v - (b[i] ?? 0)));

for (const v of VIEWS) {
  test(`колір доби: світ міняється, HUD — ні, контраст HUD ≥ 4,5:1 — ${v.side}`, async ({ page }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(([k]) => { try { localStorage.setItem(k as string, JSON.stringify({ textScale: 100, language: 'uk', hintSeen: true })); } catch { /* сховища немає */ } }, [SETTINGS_KEY] as const);
    await page.setViewportSize({ width: v.w, height: v.h });
    mkdirSync(SHOTS, { recursive: true });
    const got: Record<string, Sample> = {};
    for (const t of TIMES) {
      await page.goto(`/?seed=2&map=camp&noAutosave=1&noReveal=1&atMinute=${t.at}`);
      await waitGameReady(page);
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${SHOTS}/${t.name}-${v.side}.png` });
      got[t.name] = await sample(page);
    }
    const day = got['12h'] as Sample;
    const dusk = got['20h30'] as Sample;
    const worldDelta = dist(day.world, dusk.world);
    expect(worldDelta, `піксель світу 12:00 vs 20:30 (${day.world.map(Math.round)} vs ${dusk.world.map(Math.round)})`).toBeGreaterThan(40);
    expect(dusk.lum).toBeLessThan(day.lum * 0.8);
    // Теплота: о 18:30 світ теплішає/фіолетовішає (відносно дня синього й зеленого стає менше), о 07:00 — теплий.
    const eve = got['18h30'] as Sample;
    expect(eve.world[1] / eve.world[0], 'вечір: зеленого менше, ніж у дня').toBeLessThan(day.world[1] / day.world[0]);
    expect(dist(got['07h']?.world ?? [0, 0, 0], day.world), 'ранок відрізняється від дня').toBeGreaterThan(3);
    // HUD: колір тексту однаковий під усіма кольорами (шар світу його не торкається).
    for (const t of TIMES) {
      const s = got[t.name] as Sample;
      expect(dist(s.hudText, day.hudText), `текст HUD ${t.name}`).toBeLessThanOrEqual(3);
      expect(dist(s.hudBg, day.hudBg), `тло HUD ${t.name} (≤ 20 % зсуву світу — лише напівпрозорість панелі)`).toBeLessThanOrEqual(Math.max(3, 0.2 * worldDelta));
      expect(s.contrast, `контраст тексту HUD ${t.name}`).toBeGreaterThanOrEqual(4.5);
    }
    console.log(`GAME-232 ${v.side}: світ Δ=${worldDelta.toFixed(0)}; HUD-текст ${day.hudText}; контраст ${TIMES.map((t) => `${t.name}=${(got[t.name] as Sample).contrast.toFixed(2)}`).join(' ')}`);
    expect(errors).toEqual([]);
  });
}
