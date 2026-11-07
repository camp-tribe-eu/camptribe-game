// GAME-247 · «Нагорода видна одразу»: наклейка «+€ · +XP · +навичка» у кутку HUD (над героєм цифр нема — GAME-229), дзвіночок (src/audio, ключ sfx-chime).
// Обидві орієнтації: 390×844 і 932×430. Усе за кадрами й станом — таймерів реального часу немає.
// Сума в події йде з хука e2e-збірки (rewardSum) — точна сума ядра з нових grantId перевірена юнітом src/ui/reward-sticker.test.ts на справжніх визначеннях гри.
// Мутації (див. PR): сума в наклейці +1 → червоніє «точні суми»; bannersOpen ігнорує talk → червоніє «під рамкою розмови нема»; злиття вимкнено → «одна наклейка».
// Знімки — лише G247_SHOTS=1 (research/game-247), не на критичному шляху.
import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { core, probe, route, talk, walk } from './chapter-driver';
import { seedDay1 } from './day1-fixture';

test.use({ hasTouch: true, isMobile: true });
const VIEWS = [{ side: 'portrait', w: 390, h: 844 }, { side: 'landscape', w: 932, h: 430 }] as const;
const SHOTS = process.env.G247_SHOTS === '1' ? 'research/game-247' : null;
const sticker = (page: Page) => page.locator('[data-ui="reward-sticker"]');
interface Sum { cents: number; xp: number; om: number; skills: Record<string, number> }
declare global { interface Window { __g247?: { overlap: number; frames: number; max: number } } }
const give = (page: Page, r: Sum) => page.evaluate((x) => (window as unknown as { __game: { rewardSum: (r: Sum) => void } }).__game.rewardSum(x), r);
const KEY: Readonly<Record<string, string>> = { 'loc.home': 'home', 'loc.shop': 'shop', 'loc.road': 'road', 'loc.camp.lake': 'camp-lake' };
const shot = async (page: Page, name: string): Promise<void> => { if (!SHOTS) return; mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

async function toVehicle(page: Page): Promise<void> {
  const p = await probe(page);
  const loc = (await core(page)).game.player?.locationId ?? 'loc.home';
  await walk(page, route(KEY[loc] as string, [p.playerX, p.playerY], 'obj.vehicle'));
  await expect.poll(async () => (await probe(page)).nearObject, { timeout: 5_000 }).toBe('obj.vehicle');
  await page.locator('[data-touch="interact"]').tap();
  await expect(talk(page)).toBeVisible({ timeout: 5_000 });
}

for (const v of VIEWS) {
  test.describe(`GAME-247 ${v.side}`, () => {
    async function open(browser: import('@playwright/test').Browser) {
      const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: true, isMobile: true });
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.addInitScript(() => {
        const s = { overlap: 0, frames: 0, max: 0 };
        window.__g247 = s;
        const tick = (): void => {
          const all = [...document.querySelectorAll('[data-ui="reward-sticker"]')];
          s.max = Math.max(s.max, all.length);
          const a = all[0]?.getBoundingClientRect();
          for (const sel of ['.ui-talk', '[data-ui="title-up"]']) {
            const b = document.querySelector(sel)?.getBoundingClientRect();
            if (a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) s.overlap++;
          }
          s.frames++;
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      await seedDay1(page, '?mapFirst=1&seed=1');
      return { ctx, page, errors };
    }

    test(`після справи — наклейка з точними сумами й дзвіночком, у межах екрана — ${v.side}`, async ({ browser }) => {
      test.setTimeout(120_000);
      const { ctx, page, errors } = await open(browser);
      const before = (await page.evaluate(() => (window as unknown as { __game: { sounds: () => string[] } }).__game.sounds())).filter((k) => k === 'sfx-chime').length;
      await give(page, { cents: 550, xp: 15, om: 0, skills: { 'skill.camping': 3 } });
      await expect(sticker(page)).toBeVisible({ timeout: 5_000 });
      const parts = await sticker(page).locator('.ui-reward-part').allInnerTexts();
      expect(parts.map((p) => p.trim()), 'точні суми ядра в наклейці').toEqual(['+5,50 €', '+15 XP', expect.stringMatching(/^\+3 \S+/)]);
      const box = (await sticker(page).boundingBox())!;
      expect(box.x, 'наклейка не виходить за лівий край').toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, 'і за правий').toBeLessThanOrEqual(v.w);
      expect(box.y + box.height, 'і за нижній').toBeLessThanOrEqual(v.h);
      const after = (await page.evaluate(() => (window as unknown as { __game: { sounds: () => string[] } }).__game.sounds())).filter((k) => k === 'sfx-chime').length;
      expect(after - before, 'дзвіночок через мікшер — рівно раз').toBe(1);
      expect((await page.evaluate(() => [...(window as unknown as { __game: { probe: { fx: { headLabels: string[] } } } }).__game.probe.fx.headLabels])).filter((l) => /\d|XP/.test(l)), 'над героєм цифр нема (GAME-229)').toEqual([]);
      await shot(page, `sticker-${v.side}`);
      expect(errors).toEqual([]);
      await ctx.close();
    });

    test(`у розмові наклейка чекає й не перекриває рамку; дві нагороди зливаються в одну — ${v.side}`, async ({ browser }) => {
      test.setTimeout(120_000);
      const { ctx, page, errors } = await open(browser);
      await toVehicle(page);
      await give(page, { cents: 200, xp: 5, om: 0, skills: {} });
      await give(page, { cents: 300, xp: 10, om: 2, skills: { 'skill.cooking': 4 } });
      await page.waitForTimeout(500);
      await expect(talk(page)).toBeVisible();
      await expect(sticker(page), 'під рамкою розмови наклейки нема').toHaveCount(0);
      await shot(page, `waits-${v.side}`);
      await talk(page).locator('[data-act="cancel"]').first().click({ timeout: 5_000 });
      await expect(talk(page)).toHaveCount(0);
      await expect(sticker(page), 'рамку закрито — наклейка вийшла з черги').toBeVisible({ timeout: 5_000 });
      await expect(sticker(page), 'одна наклейка, а не стос').toHaveCount(1);
      const parts = await sticker(page).locator('.ui-reward-part').allInnerTexts();
      expect(parts.map((p) => p.trim()), 'злиття: суми додано').toEqual(['+5 €', '+15 XP', '+2 ОМ', expect.stringMatching(/^\+4 \S+/)]);
      await shot(page, `merged-${v.side}`);
      await give(page, { cents: 100, xp: 0, om: 0, skills: {} });   // ще одна, поки жива — теж злилась
      await expect(sticker(page).locator('.ui-reward-part').first()).toHaveText('+6 €');
      const seen = await page.evaluate(() => window.__g247!);
      expect(seen.max, 'за весь час ніколи більше однієї наклейки').toBeLessThanOrEqual(1);
      expect(seen.overlap, 'кадрів, де наклейка перекривала рамку чи банер').toBe(0);
      expect(errors).toEqual([]);
      await ctx.close();
    });
  });
}
