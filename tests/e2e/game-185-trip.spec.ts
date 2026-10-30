// GAME-185 · підтвердження поїздки: біля авто на дорозі (єдиний напрямок — табір) рамка «Куди їдемо?» питає, «Не зараз» і Escape лишають локацію; відповідь «їдемо» везе й завершує ST-004.
// Негативний контроль (закон 1): без підтвердження (старий код) рамки не було б, і герой поїхав би одразу — тест на це червонів би.
import { expect, test, type Page } from '@playwright/test';
import { core, installMenuObserver, menuSeen as menuOf, probe, route, talk, walk } from './chapter-driver';

const ROAD = 'loc.road';
const SETTINGS_KEY = 'camplife.settings.v1';

// ---------- дорога до табору: екран подорожі (поза зрізом), звичайна збірка e2e ----------
const panel = (page: Page) => page.locator('.ui-story');
async function act(page: Page, kind: string, key = ''): Promise<void> {
  try { await panel(page).locator(`[data-act="${kind}"][data-key="${key}"]`).click({ timeout: 5_000 }); } catch { throw new Error(`крок «${kind} ${key}»: кнопки немає на екрані подорожі`); }
  await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії
  if (kind === 'visit' && (key === 'loc.road' || key === 'loc.camp.lake')) {
    const dlg = panel(page).locator('[data-ui="dialogue"]');
    for (let i = 0; i < 6 && await dlg.isVisible({ timeout: 400 }).catch(() => false); i++) { await dlg.locator('[data-act]').last().click(); await page.waitForTimeout(400); }
  }
}
/** Нова гра (соло, велосипед) → приїзд на дорогу (ST-004 активний) → автозбереження → перезавантаження з ?mapFirst=1: справжня гра, табір. */
async function arriveOnRoad(page: Page, extra = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(([k]) => { try { localStorage.setItem(k as string, JSON.stringify({ textScale: 100, language: 'uk', hintSeen: true })); } catch { /* сховища немає */ } }, [SETTINGS_KEY] as const);
  await page.goto('/?seed=7');
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { saveLoaded: boolean } } }).__game?.probe.saveLoaded === true, null, { timeout: 30_000 });
  await page.locator('[data-touch="story"]').click();
  await panel(page).locator('[data-act="create"]', { hasText: /Велосипед|Bike/ }).first().click();
  await page.waitForTimeout(400);
  for (const [k, key] of [['complete', 'q.prologue-home-001'], ['complete', 'q.st-001'], ['complete', 'q.st-002'], ['visit', 'loc.shop'], ['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'], ['complete', 'q.st-003'],
    ['visit', 'loc.home'], ['complete', 'q.ch1-home-001'], ['visit', 'loc.road']] as const) await act(page, k, key);
  expect((await core(page)).game.player?.locationId).toBe(ROAD);
  await page.waitForTimeout(600);   // автозбереження — на кожну команду
  await installMenuObserver(page);
  await page.goto(`/?seed=7&mapFirst=1${extra}`);
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { saveLoaded: boolean } } }).__game?.probe.saveLoaded === true, null, { timeout: 30_000 });
  await page.locator('[data-ui="recovery-close"]').click({ timeout: 800 }).catch(() => undefined);
  expect((await core(page)).game.player?.locationId, 'сейв підхопився: гравець на дорозі').toBe(ROAD);
  return errors;
}

const menuSeen = menuOf;
/** Відійти від авто справжнім маршрутом (до прилавка) — за межу зони дії (1,5 тайла), щоб авто «перезарядилось»; пряма лінія вбік упиралась у перешкоду (CI #112). */
const away = async (page: Page): Promise<void> => {
  const at = await probe(page);
  await walk(page, route('road', [at.playerX, at.playerY], 'obj.sell'));
  const p = await probe(page);
  expect(Math.hypot(p.playerX - at.playerX, p.playerY - at.playerY), 'відійшли від авто далі за зону дії').toBeGreaterThan(64);
};
const toCar = async (page: Page): Promise<void> => {
  for (let t = 0; t < 3; t++) { const q = await probe(page); await walk(page, route('road', [q.playerX, q.playerY], 'obj.vehicle')); if (await talk(page).count()) break; await page.waitForTimeout(1500); if (await talk(page).count()) break; }
};

test('авто на дорозі: рамка питає (одна відповідь + «Не зараз»); Escape й «Не зараз» лишають на дорозі, відповідь їде в табір', async ({ page }) => {
  test.setTimeout(300_000);
  await arriveOnRoad(page);
  await toCar(page);
  await expect(talk(page)).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.ui-talk [data-ui="line"]')).toHaveText('Куди їдемо?');
  expect(await talk(page).locator('[data-act="visit"]').count(), 'єдиний напрямок — одна відповідь').toBe(1);
  await expect(talk(page).locator('[data-act="visit"]')).toHaveAttribute('data-key', 'loc.camp.lake');
  await expect(talk(page).locator('[data-act="cancel"]')).toHaveText('Не зараз');
  await page.keyboard.press('Escape');
  await expect(talk(page)).toHaveCount(0);
  const c = await core(page);
  expect(c.game.player?.locationId, 'Escape: лишились на дорозі').toBe(ROAD);
  expect(c.game.quests['ST-004']?.status, 'ST-004 не завершено без відповіді').toBe('active');
  // «Не зараз» на дорозі: відійти від авто й підійти знову — рамка повертається, ✕ не їде.
  await away(page);
  await toCar(page);
  await expect(talk(page)).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(450);   // «глухота» рамки ~350 мс після появи (DialogueBox ACT_COOLDOWN_MS)
  await talk(page).locator('[data-act="cancel"]').click();
  await expect(talk(page)).toHaveCount(0);
  expect((await core(page)).game.player?.locationId, '«Не зараз»: лишились на дорозі').toBe(ROAD);
  // Згода: ланцюг цілий — ST-004 завершено, приїхали в табір.
  await away(page);
  await toCar(page);
  await expect(talk(page)).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(450);   // «глухота» рамки ~350 мс після появи (DialogueBox ACT_COOLDOWN_MS)
  await talk(page).locator('[data-act="visit"]').click();
  await expect.poll(async () => (await core(page)).game.player?.locationId, { timeout: 10_000 }).toBe('loc.camp.lake');
  expect((await core(page)).game.quests['ST-004']?.status).toBe('completed');
  expect(await menuSeen(page)).toEqual([]);
});
