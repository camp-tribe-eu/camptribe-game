// GAME-86 · автозбереження після кожної дії: F5 БЕЗ паузи не губить прогрес.
import { expect, test, type Page } from '@playwright/test';

interface Core { game: { moneyCents: number; player: { locationId: string | null } | null; quests: Record<string, { status: string }> }; journal: unknown[] }
const core = (page: Page): Promise<Core> => page.evaluate(() => (window as unknown as { __game: { read: () => Core } }).__game.read());
const panel = (page: Page) => page.locator('[data-ui="story"]');
const loaded = (page: Page, url = '/') => page.goto(url).then(() => page.waitForFunction(() => (window as unknown as { __game?: { probe: { saveLoaded: boolean } } }).__game?.probe.saveLoaded === true, null, { timeout: 30_000 }));

async function act(page: Page, kind: string, key?: string): Promise<void> {
  await panel(page).locator(key ? `[data-act="${kind}"][data-key="${key}"]` : `[data-act="${kind}"]`).first().click();
  await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії
}

/** Зберігання встигло: короткий обмежений опит сховища (≤ 500 мс), а не пауза — пауза сама б зберегла. */
async function stored(page: Page): Promise<string> {
  const read = () => page.evaluate(() => new Promise<string>((resolve) => {
    const req = indexedDB.open('camplife', 1);
    req.onsuccess = () => { const r = req.result.transaction('saves').objectStore('saves').get('main'); r.onsuccess = () => { req.result.close(); resolve(String(r.result)); }; };
  }));
  return read();
}

async function start(page: Page, url = '/'): Promise<void> {
  await loaded(page, url);
  await page.locator('[data-touch="story"]').click();
  await act(page, 'create');
  await act(page, 'complete', 'q.prologue-home-001');
  await act(page, 'complete', 'q.st-001');
  await act(page, 'complete', 'q.st-002');
}

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('F5 без паузи після двох квестів: персонаж, квести, гроші й журнал на місці', async ({ page }) => {
  await start(page);
  const before = await core(page);
  expect(before.game.player).not.toBeNull();
  expect(Object.values(before.game.quests).filter((q) => q.status === 'completed').length).toBeGreaterThanOrEqual(2);
  await expect.poll(() => stored(page), { timeout: 500 }).toContain('"ST-002":{"status":"completed"');   // «збережено» видно в сховищі
  await page.reload();
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { saveLoaded: boolean } } }).__game?.probe.saveLoaded === true);
  const after = await core(page);
  expect(after.game.player).toEqual(before.game.player);
  expect(after.game.quests).toEqual(before.game.quests);
  expect(after.game.moneyCents).toBe(before.game.moneyCents);
  expect(after.journal).toEqual(before.journal);
});

for (const place of ['loc.shop', 'loc.road']) {
  test(`F5 без паузи на місці ${place}: гравець там само, прогрес не втрачено`, async ({ page }) => {
    await start(page);
    if (place === 'loc.road') { await act(page, 'visit', 'loc.shop'); await act(page, 'pickup', 'item.tent'); await act(page, 'pickup', 'item.sleeping-bag'); await act(page, 'complete', 'q.st-003'); await act(page, 'visit', 'loc.home'); await act(page, 'complete', 'q.ch1-home-001'); }
    await act(page, 'visit', place);
    const before = await core(page);
    expect(before.game.player?.locationId).toBe(place);
    await page.waitForTimeout(500);
    await page.reload();
    await page.waitForFunction(() => (window as unknown as { __game?: { probe: { saveLoaded: boolean } } }).__game?.probe.saveLoaded === true);
    const after = await core(page);
    expect(after.game.player?.locationId).toBe(place);
    expect(after.game.quests).toEqual(before.game.quests);
    expect(after.game.moneyCents).toBe(before.game.moneyCents);
  });
}

test('негативний контроль: без автозбереження (?noAutosave=1) F5 губить прогрес — тест вище чутливий', async ({ page }) => {
  await start(page, '/?noAutosave=1');
  expect((await core(page)).game.player).not.toBeNull();
  await page.waitForTimeout(500);
  await page.reload();     // без ?noAutosave: читаємо сховище, яке перемикач не наповнив
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { saveLoaded: boolean } } }).__game?.probe.saveLoaded === true);
  expect((await core(page)).game.player).toBeNull();
});
