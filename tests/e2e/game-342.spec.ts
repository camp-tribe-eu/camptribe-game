// GAME-342 · зразковий день: від відкриття сторінки до керованого героя (дорога їде) — не більше 5 справжніх дотиків (було ~17 у ☰).
// Дотики рахує сама сторінка: слухач pointerdown (touch) у фазі захоплення на window — тап Playwright (CDP) тут справжній, не click().
// Мутація (перевірено): прибрати виклик `if (sampleOn) sampleQuickStart();` у src/main.ts, або SAMPLE_QUICK_STEPS 40 → 3 (знову «не пройдено крок») → обидві орієнтації червоніють:
//   «після відкриття сторінки одразу вступ дороги, без ☰» (гравець мусив би водити ☰ до дороги).
import { expect, test, type Page } from '@playwright/test';
import { waitGameReady } from './ready';

const MAX_TAPS = 5;
const taps = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as { __taps: number }).__taps);

for (const o of [{ name: 'portrait', viewport: { width: 390, height: 844 } }, { name: 'landscape', viewport: { width: 932, height: 430 } }] as const) {
  test.describe(`GAME-342 — ${o.name}`, () => {
    test.use({ viewport: o.viewport, hasTouch: true, isMobile: false });

    test(`зразковий день: до керованого героя ≤ ${MAX_TAPS} дотиків, окремий слот, звичайна база не створена`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.addInitScript(() => {
        const w = window as unknown as { __taps: number };
        w.__taps = 0;
        window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' && e.isTrusted) w.__taps++; }, true);
      });
      await page.goto('/?seed=7&sampleDay=1');
      await waitGameReady(page);
      const mg = page.locator('[data-ui="minigame"]');
      await expect(mg, 'після відкриття сторінки одразу вступ дороги, без ☰').toHaveAttribute('data-phase', 'open', { timeout: 15_000 });
      await page.locator('[data-ui="mg-start"]').tap();
      await expect(mg).toHaveAttribute('data-phase', 'play');
      await expect.poll(async () => Number(await page.locator('[data-ui="mg-drive"]').getAttribute('data-progress')), { message: 'дорога їде: герой під керуванням', timeout: 5_000 }).toBeGreaterThan(0.005);
      const n = await taps(page);
      expect(n, `дотиків від відкриття до керованого героя: ${n}`).toBeLessThanOrEqual(MAX_TAPS);
      expect(n, 'дотики справді враховано (лічильник живий)').toBeGreaterThanOrEqual(1);
      expect((await page.evaluate(() => indexedDB.databases())).map((d) => d.name).sort(), 'зразок пише лише у свій слот').toEqual(['camplife-sample']);
      // Стан після швидкого старту — той самий, що після ручного проходу: намет і спальник узято, ми на дорозі.
      const g = await page.evaluate(() => (window as unknown as { __game: { read: () => { game: { player: { locationId: string }; inventory: Record<string, number>; quests: Record<string, { status: string }> } } } }).__game.read().game);
      expect(g.player.locationId).toBe('loc.road');
      expect(g.inventory['item.tent'], 'намет узято (як після ручних збирань)').toBe(1);
      expect(g.inventory['item.sleeping-bag'], 'спальник узято').toBe(1);
      expect(Object.values(g.quests).filter((q) => q.status === 'completed').length, 'пролог і збори закрито').toBeGreaterThanOrEqual(5);
      expect(errors).toEqual([]);
    });
  });
}
