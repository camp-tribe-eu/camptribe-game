// GAME-266 ч.1 · родина не гуськом, без «зірки»-запасної й без чужих знаків. Два вьюпорти: 390×844 і 932×430.
// Міра розкиду: кут між напрямками «герой → слідувач 1» і «герой → слідувач 2» — |sin| ≥ 0,45 (не в одну лінію позаду героя)
// і кожен слідувач ≥ 20 px від героя та один від одного (не накладаються). Мутація: ?lineFollow=1 не існує — мутація робиться в follow.ts (див. PR).
import { expect, test, type Page } from '@playwright/test';

interface Pt { x: number; y: number }
interface Probe { ready: boolean; playerX: number; playerY: number; followers: Pt[]; markerIcons: Record<string, string> }
const probe = (page: Page): Promise<Probe> => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __game: { probe: Probe } }).__game.probe)) as Probe);

function spread(p: Probe): { sin: number; minDist: number } {
  const [a, b] = p.followers as [Pt, Pt];
  const va = { x: a.x - p.playerX, y: a.y - p.playerY }; const vb = { x: b.x - p.playerX, y: b.y - p.playerY };
  const sin = Math.abs(va.x * vb.y - va.y * vb.x) / (Math.hypot(va.x, va.y) * Math.hypot(vb.x, vb.y) || 1);
  return { sin, minDist: Math.min(Math.hypot(va.x, va.y), Math.hypot(vb.x, vb.y), Math.hypot(a.x - b.x, a.y - b.y)) };
}

for (const vp of [{ width: 390, height: 844 }, { width: 932, height: 430 }]) {
  test.describe(`GAME-266 ${vp.width}×${vp.height}`, () => {
    test.use({ viewport: vp });
    test('родина не гуськом; піктограми — не запасна «зірка»', async ({ page }) => {
      test.setTimeout(90_000);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto('/?seed=2');
      await page.waitForFunction(() => (window as unknown as { __game?: { probe: { ready: boolean } } }).__game?.probe.ready === true, null, { timeout: 30_000 });
      await page.waitForTimeout(500);
      const start = await probe(page);
      expect(start.followers.length, 'слідувачів нема — тест нічого не доводить').toBe(2);
      const s0 = spread(start);
      console.log(`GAME-266 ${vp.width}: на появі sin=${s0.sin.toFixed(2)} min=${s0.minDist.toFixed(0)}px`);
      await page.screenshot({ path: `research/game-266/${process.env.G266_TAG ?? 'after'}-${vp.width}-spawn.png` });
      expect(s0.sin, 'на появі родина в одну лінію').toBeGreaterThanOrEqual(0.45);
      expect(s0.minDist).toBeGreaterThanOrEqual(20);
      // ходьба: вправо, вниз, вліво — і зупинка; після кожного відрізка міряємо розкид у русі й у спокої
      const seen: number[] = [];
      for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft'] as const) {
        await page.keyboard.down(key);
        for (let i = 0; i < 6; i++) { await page.waitForTimeout(150); seen.push(spread(await probe(page)).sin); }
        await page.keyboard.up(key);
        await page.waitForTimeout(1500);
        const p = await probe(page);
        const s = spread(p);
        console.log(`GAME-266 ${vp.width}: після ${key} sin=${s.sin.toFixed(2)} min=${s.minDist.toFixed(0)}px`);
        expect(s.sin, `після ${key} родина в одну лінію`).toBeGreaterThanOrEqual(0.45);
        expect(s.minDist, `після ${key} хтось накладається`).toBeGreaterThanOrEqual(20);
      }
      await page.screenshot({ path: `research/game-266/${process.env.G266_TAG ?? 'after'}-${vp.width}-walk.png` });
      expect(Math.max(...seen)).toBeGreaterThanOrEqual(0.45);
      const icons = Object.values((await probe(page)).markerIcons);
      expect(icons.length, 'жодної піктограми на мапі — тест нічого не доводить').toBeGreaterThan(0);
      expect(icons, 'запасна «зірка» на мапі').not.toContain('star');
      expect(errors).toEqual([]);
    });
  });
}
