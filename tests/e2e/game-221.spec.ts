// GAME-221 · балачка мешканців над головою НЕ зупиняє гру: бульбашка видна, герой далі рухається (позиція міняється під утримуваною клавішею),
// рамка розмови не відкривається. Обидві орієнтації телефона. Мутація (див. PR): updateBark ставить паузу/відкриває діалог → тест червоний.
import { expect, test, type Page } from '@playwright/test';
import { walkInPage } from './walk.helpers';

interface Resident { id: string; x: number; y: number; moving: boolean }
interface Probe { ready: boolean; playerX: number; playerY: number; residents: Resident[]; bark: string | null; barkCount: number }
const probe = (page: Page): Promise<Probe> => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __game: { probe: Probe } }).__game.probe)) as Probe);

async function open(page: Page): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?seed=2');
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { ready: boolean } } }).__game?.probe.ready === true, null, { timeout: 30_000 });
  expect(errors).toEqual([]);
}

const dialogueOpen = (page: Page): Promise<number> => page.locator('.ui-talk [data-ui="dialogue"]').count();

for (const [orient, viewport] of [['portrait', { width: 390, height: 844 }], ['landscape', { width: 844, height: 390 }]] as const) {
  test.describe(`GAME-221 балачка не зупиняє гру · ${orient}`, () => {
    test.use({ viewport });
    test('бульбашка видна — герой рухається, діалогу нема', async ({ page }) => {
      test.setTimeout(120_000);
      await open(page);
      // GAME-313: до найближчого мешканця — у сторінці по кадрах (ціль щокадру), зупинка в кадрі, де над кимось звучить репліка; страховка 70 с кидає помилку.
      await walkInPage<Probe>(page, { label: 'жоден мешканець не озвався', toNearest: 'residents', until: [{ bark: true }], settle: false, maxMs: 70_000 });
      // Бульбашка висить ~4 с: одразу тримаємо клавішу й міряємо зсув, поки вона ще видима.
      const before = await probe(page);
      expect(before.bark, 'бульбашки вже нема').not.toBeNull();
      if (process.env.G221_SHOT) await page.screenshot({ path: `${process.env.G221_SHOT}/chatter-${orient}.png` });
      let moved = 0;
      let bubbleSeen = true;
      for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp']) {
        await page.keyboard.down(key);
        await page.waitForTimeout(350);
        const mid = await probe(page);
        await page.keyboard.up(key);
        bubbleSeen = bubbleSeen && mid.bark !== null;
        moved = Math.max(moved, Math.hypot(mid.playerX - before.playerX, mid.playerY - before.playerY));
        if (moved >= 6) break;
      }
      expect(moved, `герой не зрушив (${moved.toFixed(1)} px) під час балачки`).toBeGreaterThanOrEqual(6);
      expect(bubbleSeen, 'бульбашка зникла до зсуву — тест не про те').toBe(true);
      expect(await dialogueOpen(page), 'відкрилась рамка розмови').toBe(0);
    });
  });
}
