// GAME-208 · погода дає ІНШІ побічні цілі (OD-022: інше заняття, не провал): дощовий і сонячний день у «Цілях» ☰ показують різні справи табору;
// обидві орієнтації (390×844, 844×390). Погоду дня фіксує зерно (?seed=, GAME-169): зерно підбирається перебором weatherOf — тут же перевіряється,
// що день у таборі той самий, який ми порахували. Знімки ранку/дня/вечора — GAME208_SHOTS=<тека> (не комітяться).
// Негативний контроль (закон 1): до табору (удома) справ за погодою в цілях немає; після дотику справа зникає з цілей.
import { mkdirSync, readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { dayOf, weatherOf, type Weather } from '../../src/core/weather';
import { waitGameReady } from './ready';

interface Core { worldSeed: number; clock: { minutes: number }; game: { flags: string[] } }
const core = (page: Page): Promise<Core> => page.evaluate(() => (window as unknown as { __game: { read: () => Core } }).__game.read());
const panel = (page: Page) => page.locator('[data-ui="story"]');
const SHOTS = process.env.GAME208_SHOTS;
const VIEWS = [{ side: 'portrait', w: 390, h: 844 }, { side: 'landscape', w: 844, h: 390 }] as const;
// JSON читаємо з диска: Playwright не вміє `import … from '*.json'` без атрибута типу.
const readJson = <T>(p: string): T => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8')) as T;
const requests = readJson<{ weather?: string; titleKey: string }[]>('../../content/requests.json');
const LOC = readJson<Record<string, string>>('../../content/locales/uk.json');
const titles = (w: Weather): string[] => requests.filter((r) => r.weather === w).map((r) => LOC[r.titleKey] as string);
const seedWith = (w: Weather): number => { for (let s = 0; s < 200; s++) if (weatherOf(s, 0) === w) return s; throw new Error(w); };

for (const v of VIEWS) {
  test(`дощ і сонце дають різні побічні цілі табору — ${v.side}`, async ({ browser }) => {
    test.setTimeout(240_000);
    const seen: Partial<Record<Weather, string[]>> = {};
    for (const w of ['rain', 'sunny'] as const) {
      const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: true, isMobile: true });
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`/?seed=${seedWith(w)}`);
      await waitGameReady(page);
      const press = async (loc: Locator): Promise<void> => { await loc.scrollIntoViewIfNeeded(); await loc.tap(); await page.waitForTimeout(400); };
      const rows = async (): Promise<{ kind: string; text: string }[]> => panel(page).locator('[data-ui="goal-row"]').evaluateAll((els) => els.map((e) => ({ kind: (e as HTMLElement).dataset.kind ?? '', text: e.textContent ?? '' })));
      const act = async (kind: string, key = ''): Promise<void> => {
        const b = panel(page).locator(`[data-act="${kind}"][data-key="${key}"]`);
        if (!(await b.isVisible({ timeout: 5_000 }).catch(() => false))) throw new Error(`крок «${kind} ${key}»: кнопки немає`);
        await press(b);
        const dlg = panel(page).locator('[data-ui="dialogue"]');
        for (let i = 0; kind === 'visit' && key === 'loc.road' && i < 6 && await dlg.isVisible({ timeout: 400 }).catch(() => false); i++) await press(dlg.locator('[data-act]').last());
      };
      await press(page.locator('[data-touch="story"]'));
      await press(panel(page).locator('[data-act="create"]', { hasText: /Авто|Car/ }).first());
      const steps = [['complete', 'q.prologue-home-001'], ['complete', 'q.st-001'], ['complete', 'q.st-002'], ['visit', 'loc.shop'], ['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'],
        ['complete', 'q.st-003'], ['visit', 'loc.home'], ['complete', 'q.ch1-home-001'], ['visit', 'loc.road'], ['complete', 'q.st-004']] as const;
      for (const [k, key] of steps) await act(k, key);
      // Негативний контроль: поза табором справ за погодою в цілях немає.
      for (const t of [...titles('rain'), ...titles('sunny'), ...titles('cloudy')]) expect((await rows()).map((r) => r.text).join('|'), `поза табором: ${t}`).not.toContain(t);
      await act('visit', 'loc.camp.lake');
      const c = await core(page);
      expect(weatherOf(c.worldSeed, dayOf(c.clock)), `день у таборі ${dayOf(c.clock)} — той, що ми порахували`).toBe(w);
      const side = (await rows()).filter((r) => r.kind === 'side').map((r) => r.text);
      expect(side.length, `${w}: є побічна ціль`).toBeGreaterThanOrEqual(1);
      expect(side.some((s) => titles(w).some((t) => s.includes(t))), `${w}: серед побічних — справа цієї погоди ${JSON.stringify(side)}`).toBe(true);
      for (const o of (['rain', 'sunny', 'cloudy'] as const).filter((x) => x !== w)) for (const t of titles(o)) expect(side.join('|'), `${w}: справи погоди «${o}» не показані`).not.toContain(t);
      seen[w] = side;
      expect((await rows()).length).toBeLessThanOrEqual(4);
      if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await panel(page).evaluate((el) => { el.scrollTop = 0; }); await page.screenshot({ path: `${SHOTS}/goals-${w}-${v.side}.png` }); }
      expect(errors, errors.join('\n')).toEqual([]);
      await ctx.close();
    }
    expect(seen.rain, 'дощовий і сонячний день — різні побічні цілі').not.toEqual(seen.sunny);
  });
}

// Знімки світла ранку / дня / вечора на мапі табору (ефект «день і ніч» GAME-99): лише коли задано GAME208_SHOTS. ?atMinute — зсув від старту о 08:00: 60 → 09:00, 300 → 13:00, 690 → 19:30.
test('знімки: ранок, день, вечір — світло табору', async ({ page }) => {
  test.skip(!SHOTS, 'лише для знімків: задайте GAME208_SHOTS');
  mkdirSync(SHOTS as string, { recursive: true });
  await page.setViewportSize({ width: 844, height: 390 });
  for (const [name, minute] of [['morning', 60], ['day', 300], ['evening', 690]] as const) {
    await page.goto(`/?seed=${seedWith('rain')}&map=camp&atMinute=${minute}`);
    await waitGameReady(page);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOTS}/light-${name}.png` });
  }
});
