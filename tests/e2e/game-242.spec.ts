// GAME-242 · ритм дня: ввечері в таборі з'являється «Пора спати», сон веде до ранку 07:00 й екрана підсумку дня.
// Стан читаємо з ядра (window.__game.read), а не з пікселів. Вечір — без очікування: ?skipMinutes=N перемотує годинник ПІСЛЯ завантаження сейву.
import { expect, test } from '@playwright/test';
import { arriveInCamp, CAMP } from './camp-arrival';
import { core } from './chapter-driver';
import { waitGameReady } from './ready';

const minutesOf = async (page: import('@playwright/test').Page): Promise<number> => ((await core(page)) as unknown as { clock: { minutes: number } }).clock.minutes;
const tod = (m: number): number => (m + 480) % 1440;

test('GAME-242 · вечір у таборі: підказка «Пора спати», сон → 07:00 і підсумок дня', async ({ page }) => {
  const errors = await arriveInCamp(page);
  const m0 = await minutesOf(page);
  // Перемотуємо до 22:05 тієї ж доби (хвилина 0 = 08:00 → 22:05 = 845 + 1440·k).
  const target = 845 + 1440 * Math.floor(m0 / 1440) + (845 + 1440 * Math.floor(m0 / 1440) <= m0 ? 1440 : 0);
  await page.goto(`/?seed=7&mapFirst=1&skipMinutes=${target - m0}`);
  await waitGameReady(page);
  await page.locator('[data-ui="recovery-close"]').click({ timeout: 800 }).catch(() => undefined);
  expect((await core(page)).game.player?.locationId).toBe(CAMP);
  expect(tod(await minutesOf(page))).toBeGreaterThanOrEqual(22 * 60);
  await expect(page.locator('[data-ui="bedtime-bark"]')).toContainText('Пора спати');

  await page.locator('[data-touch="story"]').click();
  await page.locator('.ui-story [data-act="sleep"]').click({ timeout: 5_000 });
  await expect(page.locator('[data-ui="summary"]')).toBeVisible({ timeout: 5_000 });
  expect(tod(await minutesOf(page)), 'прокинулись о 07:00').toBe(7 * 60);
  expect(errors).toEqual([]);
});
