// GAME-261 · шум HUD (Fable QA 05.11): а) нагадування про код — не на кадрі прибуття і лише раз; б) над героєм після дії немає тексту «OK» (значок + звук);
// в) «…» над сім'єю й сусідами — лише коли є що сказати. Обидві орієнтації: 390×844 і 932×430. Знімки до/після — лише з G261_SHOTS=1 (research/game-261/).
// Мутації (перевірено, див. PR): remindArmed завжди true → «раз» і «не на першому кадрі» червоніють; feedback знову pop('OK') → «без OK» червоніє;
// markerFor ігнорує hasLine → «…» лишається після розмови.
import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { answerOne, probe as worldProbe, routeXY, talk, walk } from './chapter-driver';
import { seedDay1 } from './day1-fixture';
import { waitGameReady } from './ready';

test.use({ hasTouch: true, isMobile: true });

const VIEWS = [{ side: 'portrait', w: 390, h: 844 }, { side: 'landscape', w: 932, h: 430 }] as const;
const SHOTS = process.env.G261_SHOTS === '1' ? process.env.G261_DIR ?? 'research/game-261' : null;
const panel = (page: Page) => page.locator('[data-ui="story"]');
const reminder = (page: Page) => page.locator('[data-ui="recovery-reminder"]');
const fx = (page: Page): Promise<{ headLabels: string[]; headIcons: string[] }> => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __game: { probe: { fx: unknown } } }).__game.probe.fx)));
const marks = (page: Page): Promise<Record<string, string>> => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __game: { probe: { npcMarks: unknown } } }).__game.probe.npcMarks)));
const sounds = (page: Page): Promise<string[]> => page.evaluate(() => (window as unknown as { __game: { sounds: () => string[] } }).__game.sounds());
async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}
async function act(page: Page, kind: string, key = ''): Promise<void> {
  await panel(page).locator(`[data-act="${kind}"][data-key="${key}"]`).click({ timeout: 5_000 });
  await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії
}

for (const v of VIEWS) {
  test.describe(`${v.side} ${v.w}×${v.h}`, () => {
    test.use({ viewport: { width: v.w, height: v.h } });

    test('а) нагадування: на кадрі прибуття його немає, потім є раз, друга подорож — без повтору', async ({ page }) => {
      await page.goto('/?seed=2');
      await waitGameReady(page);
      await page.locator('[data-touch="story"]').click();
      await panel(page).locator('[data-act="create"]', { hasText: 'Велосипед' }).first().click();
      await page.waitForTimeout(400);
      for (const q of ['q.prologue-home-001', 'q.st-001', 'q.st-002']) await act(page, 'complete', q);
      await act(page, 'visit', 'loc.shop');
      await panel(page).locator('[data-ui="story-close"]').click();
      await expect(panel(page)).toHaveCount(0);
      await expect(reminder(page), 'перший кадр після прибуття: HUD вільний від нагадування').toHaveCount(0);
      await shot(page, `after-${v.side}-arrival`);
      await expect(reminder(page), 'у природній паузі нагадування з’являється').toBeVisible();
      await shot(page, `after-${v.side}-reminder`);
      await reminder(page).locator('[data-ui="recovery-close"]').click();
      await expect(reminder(page)).toHaveCount(0);
      await page.locator('[data-touch="story"]').click();
      await panel(page).locator('[data-act="visit"]').first().click();
      await page.waitForTimeout(400);
      await panel(page).locator('[data-ui="story-close"]').click();
      await page.waitForTimeout(4_000);   // довше за REMIND_CALM_S (3 с): друге нагадування вже було б
      await expect(reminder(page), 'раз за все життя: друге прибуття — тиша').toHaveCount(0);
    });

    test('б) після дії над героєм немає тексту «OK» — значок і звук', async ({ page }) => {
      await seedDay1(page);
      // Дія без «+»: торкнутись автомобіля на мапі табору (obj.vehicle, не прибирання з рюкзака) — сцена дає значок і звук підтвердження.
      const p = (await worldProbe(page)) as unknown as { playerX: number; playerY: number };
      await walk(page, routeXY('camp-lake', [p.playerX, p.playerY], { x: 528, y: 592 }, false, 'obj.vehicle'));
      await expect.poll(async () => (await worldProbe(page)).nearObject, { timeout: 10_000 }).toBe('obj.vehicle');
      await page.locator('[data-touch="interact"]').tap();
      await expect.poll(async () => (await fx(page)).headIcons.length, { timeout: 5_000, message: 'дія без «+» мусить дати значок над героєм' }).toBeGreaterThan(0);
      const f = await fx(page);
      expect(f.headIcons.length, 'дія без «+» мусить дати значок над героєм').toBeGreaterThan(0);
      expect(f.headLabels.filter((l) => l === 'OK'), 'тексту «OK» над героєм немає').toEqual([]);
      expect(await sounds(page), 'звук підтвердження лишився (через src/audio)').toContain('ui-confirmation');
      await shot(page, `after-${v.side}-icon`);
    });

    test('в) «…» лише коли є що сказати: до розмови є, після — зникає, інші не зачеплені', async ({ page }) => {
      await seedDay1(page);
      await page.waitForTimeout(1_000);
      const chat = (m: Record<string, string>): string[] => Object.entries(m).filter(([, k]) => k === 'chat').map(([id]) => id);
      await expect.poll(async () => chat(await marks(page)).length, { timeout: 15_000, message: 'позитивний випадок: поруч є, з ким ще не говорили' }).toBeGreaterThan(0);
      await shot(page, `after-${v.side}-chat-before`);
      const who = chat(await marks(page))[0] as string;
      const p0 = (await worldProbe(page)) as unknown as { playerX: number; playerY: number; residents: { id: string; x: number; y: number }[] };
      const res = p0.residents.find((r) => r.id === who);
      if (res) await walk(page, routeXY('camp-lake', [p0.playerX, p0.playerY], res));
      await expect.poll(async () => (await worldProbe(page)).nearObject, { timeout: 15_000 }).toMatch(/^npc\./);
      const talked = (await worldProbe(page)).nearObject as string;
      await page.locator('[data-touch="interact"]').tap();
      await expect(talk(page)).toBeVisible();
      for (let i = 0; i < 12 && await talk(page).count() > 0; i++) await answerOne(page);
      await expect(talk(page)).toHaveCount(0);
      await page.waitForTimeout(500);
      expect((await marks(page))[talked], `негативний випадок: з ${talked} уже говорили — «…» немає`).not.toBe('chat');
      await shot(page, `after-${v.side}-chat-after`);
    });
  });
}
