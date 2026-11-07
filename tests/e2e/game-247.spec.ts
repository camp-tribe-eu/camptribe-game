// GAME-247 · «Нагорода видна одразу»: наклейка «+€ · +XP · +навичка» спливає НАД головою героя (OD-029, 07.11.2026, «давай як у Stardew»; для наклейки це змінило правило GAME-229 «над героєм цифр нема»), дзвіночок (src/audio, ключ sfx-chime).
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
const SHOTS = process.env.G247_SHOTS === '1' ? 'research/game-277' : null;   // OD-029: знімки наклейки над героєм
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
      const box = await sticker(page).boundingBox();
      if (!box) throw new Error('наклейка без рамки');
      expect(box.x, 'наклейка не виходить за лівий край').toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, 'і за правий').toBeLessThanOrEqual(v.w);
      expect(box.y + box.height, 'і за нижній').toBeLessThanOrEqual(v.h);
      const after = (await page.evaluate(() => (window as unknown as { __game: { sounds: () => string[] } }).__game.sounds())).filter((k) => k === 'sfx-chime').length;
      expect(after - before, 'дзвіночок через мікшер — рівно раз').toBe(1);
      expect((await page.evaluate(() => [...(window as unknown as { __game: { probe: { fx: { headLabels: string[] } } } }).__game.probe.fx.headLabels])).filter((l) => /\d|XP/.test(l)), 'Phaser-підписи над героєм без цифр (GAME-229 лишається для них; наклейка — DOM, OD-029)').toEqual([]);
      // OD-029: підпис над героєм — його рамка цілком вище спрайта героя й не перетинає його (мутація «поставити на героя» — StickerPlace gap < 0 — червоніє тут).
      const hero = (await probe(page)).heroRect;
      expect(hero.w, 'проба віддає рамку героя').toBeGreaterThan(0);
      expect(box.y + box.height, 'наклейка вища за верх героя').toBeLessThanOrEqual(hero.y);
      expect(Math.abs(box.x + box.width / 2 - (hero.x + hero.w / 2)), 'і по центру над ним (у межах екрана)').toBeLessThanOrEqual(Math.max(hero.w, box.width / 2 + 8));
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
      // GAME-280: наклейка живе 5 ІГРОВИХ хвилин (STICKER_MIN, 1 хв = 1 с живої гри), а кожен виклик Playwright під навантаженням (4 воркери) триває секунди:
      // «видно → прочитати → дати ще одну → прочитати» як окремі виклики вилітали за ці 5 с (нагорода ставала новою наклейкою або зникала — 14 з 24 червоних).
      // Тож спостерігач у сторінці, на кожному кадрі: першу появу фіксує ЗНІМКОМ, у ту ж мить дає третю нагороду й фіксує злиту наклейку. Тест читає знімки, а не живий DOM.
      type Rec = { first: string[] | null; firstCount: number; merged: string[] | null };
      await page.evaluate(() => {
        const w = window as unknown as { __game: { rewardSum: (r: Sum) => void }; __g280?: Rec };
        const rec: Rec = { first: null, firstCount: 0, merged: null };
        w.__g280 = rec;
        const parts = (el: Element): string[] => [...el.querySelectorAll('.ui-reward-part')].map((p) => (p.textContent ?? '').trim());
        const tick = (): void => {
          const all = [...document.querySelectorAll('[data-ui="reward-sticker"]')];
          if (all[0] && rec.first === null) { rec.first = parts(all[0]); rec.firstCount = all.length; w.__game.rewardSum({ cents: 100, xp: 0, om: 0, skills: {} }); }   // ще одна, поки жива — теж злилась
          else if (all[0] && rec.first !== null && rec.merged === null && parts(all[0])[0] === '+6 €') rec.merged = parts(all[0]);
          if (rec.merged === null) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      await talk(page).locator('[data-act="cancel"]').first().click({ timeout: 5_000 });
      await expect(talk(page)).toHaveCount(0);
      const snap = (): Promise<Rec> => page.evaluate(() => (window as unknown as { __g280: Rec }).__g280);
      await expect.poll(async () => (await snap()).merged !== null, { message: 'рамку закрито — наклейка вийшла з черги, і третя нагорода злилась у неї' }).toBe(true);
      const rec = await snap();
      expect(rec.firstCount, 'одна наклейка, а не стос').toBe(1);
      expect(rec.first, 'злиття: суми додано').toEqual(['+5 €', '+15 XP', '+2 ОМ', expect.stringMatching(/^\+4 \S+/)]);
      expect(rec.merged?.[0], 'третя нагорода злилась у ту саму наклейку').toBe('+6 €');
      await shot(page, `merged-${v.side}`);
      const seen = await page.evaluate(() => window.__g247);
      if (!seen) throw new Error('спостерігач кадрів не стартував');
      expect(seen.max, 'за весь час ніколи більше однієї наклейки').toBeLessThanOrEqual(1);
      expect(seen.overlap, 'кадрів, де наклейка перекривала рамку чи банер').toBe(0);
      expect(errors).toEqual([]);
      await ctx.close();
    });
  });
}
