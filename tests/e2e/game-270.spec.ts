// GAME-270 · ?perfectHits=1 (лише збірка e2e): удар по кілку влучає без огляду на маркер — довгі проходи не залежать від таймінгу CI.
// Сторож: ТАП ПРОСТО ЗАРАЗ, коли маркер далеко від зеленого. З перемикачем кілок забито; без нього (негативний контроль) — промах, кілків 0.
// Мутація «перемикач ігнорується» (perfectHits: () => false у main.ts) робить перший тест червоним.
import { expect, test, type Page } from '@playwright/test';
import { probe, route, walk } from './chapter-driver';
import { arriveInCamp } from './camp-arrival';

async function startPegging(page: Page, extra: string): Promise<void> {
  await arriveInCamp(page, extra);
  const q = await probe(page);
  await walk(page, route('camp-lake', [q.playerX, q.playerY], 'task.pitch-tent'));
  await expect.poll(async () => (await probe(page)).nearObject, { timeout: 8_000 }).toBe('task.pitch-tent');
  await page.waitForTimeout(2_500);
  await page.locator('[data-touch="interact"]').tap();
  await expect.poll(async () => (await probe(page)).tent.placeOk, { timeout: 5_000 }).toBe(true);
  await page.waitForTimeout(450);
  await page.locator('[data-touch="interact"]').tap();
  await expect.poll(async () => (await probe(page)).tent.phase, { timeout: 5_000 }).toBe('peg');
  await page.waitForTimeout(450);
}
/** Тап, коли маркер ЗАВІДОМО поза зеленим (біля краю шкали); повертає, скільки кілків забито після тапа. */
async function tapOffBand(page: Page): Promise<number> {
  await page.waitForFunction(() => { const t = (window as unknown as { __game: { probe: { tent: { marker: number } } } }).__game.probe.tent; return Math.abs(t.marker - 0.5) > 0.3; }, null, { timeout: 10_000, polling: 'raf' });
  await page.locator('[data-touch="interact"]').tap();
  await page.waitForTimeout(300);
  return (await probe(page)).tent.pegs;
}

test.describe('perfectHits', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  test('з ?perfectHits=1 тап поза зеленим забиває кілок', async ({ page }) => {
    test.setTimeout(300_000);
    await startPegging(page, '&perfectHits=1');
    expect(await tapOffBand(page), 'кілок забито попри маркер поза зеленим').toBe(1);
  });
  test('негативний контроль: без перемикача той самий тап поза зеленим — промах', async ({ page }) => {
    test.setTimeout(300_000);
    await startPegging(page, '');
    expect(await tapOffBand(page), 'без перемикача кілок не забито').toBe(0);
  });
});
