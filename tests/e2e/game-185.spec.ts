// GAME-185 · після ☰-less розділу 1 (рецензія PR #105): ☰ у мапі-першій грі — лише меню; журнал — окремий екран; у «Що беремо?» недоступні купівлі — вимкнені рядки
// з причиною; у ландшафті 844×390 HUD не лежить на героєві. Негативні контролі (закон 1): мутація кожної перевірки показана червоною в картці.
import { expect, test, type Page } from '@playwright/test';
import { core, loaded, probe, route, talk, walk } from './chapter-driver';

const CAMP = 'loc.camp.lake';

const SETTINGS_KEY = 'camplife.settings.v1';
const VIEWS = [{ side: 'portrait', w: 390, h: 844 }, { side: 'landscape', w: 844, h: 390 }] as const;
const panel = (page: Page) => page.locator('.ui-story');

async function act(page: Page, kind: string, key = ''): Promise<void> {
  await panel(page).locator(`[data-act="${kind}"][data-key="${key}"]`).click({ timeout: 5_000 });
  await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії
}
/** Нова гра (соло, велосипед) звичайною збіркою e2e (кнопки ☰) до крамниці з активним ST-003 → автозбереження → перезавантаження ?mapFirst=1: справжня гра, крамниця. */
async function arriveInShop(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(([k]) => { try { localStorage.setItem(k as string, JSON.stringify({ textScale: 100, language: 'uk', hintSeen: true })); } catch { /* сховища немає */ } }, [SETTINGS_KEY] as const);
  await page.goto('/?seed=7');
  await loaded(page);
  await page.locator('[data-touch="story"]').click();
  await panel(page).locator('[data-act="create"]', { hasText: /Велосипед|Bike/ }).first().click();
  await page.waitForTimeout(400);
  for (const [k, key] of [['complete', 'q.prologue-home-001'], ['complete', 'q.st-001'], ['complete', 'q.st-002'], ['visit', 'loc.shop']] as const) await act(page, k, key);
  expect((await core(page)).game.player?.locationId).toBe('loc.shop');
  await page.waitForTimeout(600);   // автозбереження — на кожну команду
  await page.goto('/?seed=7&mapFirst=1');
  await loaded(page);
  await page.locator('[data-ui="recovery-close"]').click({ timeout: 800 }).catch(() => undefined);
  expect((await core(page)).game.player?.locationId, 'сейв підхопився: гравець у крамниці').toBe('loc.shop');
  return errors;
}
async function openBuy(page: Page): Promise<void> {
  for (let t = 0; t < 3 && !(await talk(page).count()); t++) {
    const q = await probe(page);
    await walk(page, route('shop', [q.playerX, q.playerY], 'obj.buy'));
    await expect.poll(async () => (await probe(page)).nearObject, { timeout: 5_000 }).toBe('obj.buy');
    await page.keyboard.down('KeyE'); await page.waitForTimeout(200); await page.keyboard.up('KeyE');
    await page.waitForTimeout(600);
  }
  await expect(talk(page)).toBeVisible({ timeout: 10_000 });
}

for (const v of VIEWS) {
  test.describe(`${v.side} ${v.w}×${v.h}`, () => {
    test.use({ viewport: { width: v.w, height: v.h }, hasTouch: true, isMobile: true });

    test('☰ у мапі-першій: лише Атлас, Журнал, налаштування й закрити; журнал — окремий екран із квестами, навичками й речами', async ({ page }) => {
      test.setTimeout(240_000);
      const errors = await arriveInShop(page);
      await page.locator('[data-touch="story"]').click();
      await expect(panel(page)).toBeVisible();
      // Меню: рівно чотири кнопки; жодної дії сюжету, жодного списку.
      await expect(panel(page).locator('button')).toHaveCount(4);
      for (const ui of ['atlas-open', 'journal', 'settings-open', 'story-close']) await expect(panel(page).locator(`[data-ui="${ui}"]`), ui).toBeVisible();
      for (const ui of ['quest', 'skills', 'inventory', 'actions', 'packing', 'journal-log']) await expect(panel(page).locator(`[data-ui="${ui}"]`), `у меню є «${ui}»`).toHaveCount(0);
      await expect(panel(page).locator('[data-act]'), 'у меню немає кнопок дій').toHaveCount(0);
      await page.screenshot({ path: `research/visual-audit/menu-mapfirst-${v.side}.png` });
      // Журнал: квести, навички, речі, записи; назад — у меню.
      await panel(page).locator('[data-ui="journal"]').click();
      await expect(panel(page).locator('[data-ui="quest"]').first()).toBeVisible();
      await expect(panel(page).locator('[data-ui="skills"]')).toBeVisible();
      await expect(panel(page).locator('[data-ui="journal-log"]')).toBeVisible();
      await expect(panel(page).locator('[data-act]'), 'у журналі немає кнопок дій').toHaveCount(0);
      await page.screenshot({ path: `research/visual-audit/journal-screen-${v.side}.png` });
      await panel(page).locator('[data-ui="journal-back"]').click();
      await expect(panel(page).locator('[data-ui="journal"]')).toBeVisible();
      // Налаштування й збереження — з ☰ у меню паузи.
      await panel(page).locator('[data-ui="settings-open"]').click();
      await expect(page.locator('[data-ui="pause"]')).toBeVisible();
      await expect(page.locator('[data-ui="save"]')).toBeVisible();
      expect(errors).toEqual([]);
    });

    test('«Що беремо?»: недоступні купівлі — вимкнені рядки з причиною (aria-disabled, ≥ 44 px), клік нічого не міняє', async ({ page }) => {
      test.setTimeout(240_000);
      const errors = await arriveInShop(page);
      await openBuy(page);
      const locked = talk(page).locator('[data-act="buy-locked"]');
      expect(await locked.count(), 'є вимкнені рядки').toBeGreaterThan(0);
      for (let i = 0; i < await locked.count(); i++) {
        const row = locked.nth(i);
        await expect(row).toHaveAttribute('aria-disabled', 'true');
        await expect(row).toContainText('бракує');
        expect((await row.boundingBox())?.height ?? 0, 'ціль ≥ 44 px').toBeGreaterThanOrEqual(44);
      }
      await page.screenshot({ path: `research/visual-audit/shop-locked-${v.side}.png` });
      const before = JSON.stringify((await core(page)).game);
      await locked.first().click({ force: true });   // aria-disabled: Playwright чекав би «увімкнено» вічно
      await page.waitForTimeout(500);
      await expect(talk(page)).toBeVisible();
      expect(JSON.stringify((await core(page)).game), 'клік по вимкненому рядку не міняє стан').toBe(before);
      expect(errors).toEqual([]);
    });
  });
}

/** Нова гра → приїзд у табір кнопками ☰ (звичайна збірка e2e) → автозбереження → перезавантаження ?mapFirst=1: справжня гра в таборі, поруч родина. */
async function arriveInCamp(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(([k]) => { try { localStorage.setItem(k as string, JSON.stringify({ textScale: 100, language: 'uk', hintSeen: true })); } catch { /* сховища немає */ } }, [SETTINGS_KEY] as const);
  await page.goto('/?seed=7');
  await loaded(page);
  await page.locator('[data-touch="story"]').click();
  await panel(page).locator('[data-act="create"]', { hasText: /Велосипед|Bike/ }).first().click();
  await page.waitForTimeout(400);
  for (const [k, key] of [['complete', 'q.prologue-home-001'], ['complete', 'q.st-001'], ['complete', 'q.st-002'], ['visit', 'loc.shop'], ['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'], ['complete', 'q.st-003'],
    ['visit', 'loc.home'], ['complete', 'q.ch1-home-001'], ['visit', 'loc.road'], ['complete', 'q.st-004'], ['visit', 'loc.camp.lake']] as const) {
    await act(page, k, key);
    if (k === 'visit' && (key === 'loc.road' || key === 'loc.camp.lake')) {
      const dlg = panel(page).locator('[data-ui="dialogue"]');
      for (let i = 0; i < 6 && await dlg.isVisible({ timeout: 400 }).catch(() => false); i++) { await dlg.locator('[data-act]').last().click(); await page.waitForTimeout(400); }
    }
  }
  expect((await core(page)).game.player?.locationId).toBe(CAMP);
  await page.waitForTimeout(600);
  await page.goto('/?seed=7&mapFirst=1');
  await loaded(page);
  await page.locator('[data-ui="recovery-close"]').click({ timeout: 800 }).catch(() => undefined);
  expect((await core(page)).game.player?.locationId, 'сейв підхопився: гравець у таборі').toBe(CAMP);
  return errors;
}

test.describe('HUD не лежить на героєві й родині (вбік — перевірка, сторч — знімок)', () => {
  test('сторч 390×844: знімок табору з HUD (шапка в потоці, поле під нею)', async ({ browser }) => {
    test.setTimeout(240_000);
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errors = await arriveInCamp(page);
    await expect(page.locator('[data-ui="goal"]')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'research/visual-audit/hud-portrait-390x844.png' });
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

test.describe('HUD вбік не лежить на героєві й родині (844×390)', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test('табір: екранні прямокутники героя й слідувачів не перетинають жодного рядка HUD і смуга внизу не лягає на джойстик та кнопку дії', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = await arriveInCamp(page);
    await expect(page.locator('[data-ui="goal"]')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-ui="next-hint"]')).toBeVisible();
    await page.waitForTimeout(1500);   // слідувачі дійшли до героя
    const hit = await page.evaluate(() => {
      const g = (window as unknown as { __game: { probe: { playerX: number; playerY: number; cameraScrollX: number; cameraScrollY: number; followers: { x: number; y: number }[] } } }).__game.probe;
      const cv = document.querySelector('#stage canvas') as HTMLCanvasElement;
      const c = cv.getBoundingClientRect();
      const k = c.width / cv.width;
      // Тіло персонажа: ноги (x, y) → прямокутник 24 × 48 світових px над ногами.
      const bodies = [{ x: g.playerX, y: g.playerY, who: 'герой' }, ...g.followers.map((f, i) => ({ ...f, who: `слідувач ${i + 1}` }))].map((b) => {
        const l = c.left + (b.x - 12 - g.cameraScrollX) * k; const t = c.top + (b.y - 48 - g.cameraScrollY) * k;
        return { who: b.who, l, t, r: l + 24 * k, b: t + 48 * k };
      });
      const rows = ['.ui-story-btn', '.ui-hud', '.ui-pause-btn', '.ui-wave', '.ui-goal', '.ui-reqs', '.ui-next'].flatMap((sel) => { const e = document.querySelector(sel); return e ? [{ sel, r: e.getBoundingClientRect() }] : []; });
      const over: string[] = [];
      for (const b of bodies) for (const { sel, r } of rows) if (b.l < r.right && b.r > r.left && b.t < r.bottom && b.b > r.top) over.push(`${b.who} під ${sel}`);
      const ctl = ['.touch-stick', '.touch-interact'].flatMap((sel) => { const e = document.querySelector(sel); return e ? [{ sel, r: e.getBoundingClientRect() }] : []; });
      for (const sel of ['.ui-goal', '.ui-reqs', '.ui-next']) { const e = document.querySelector(sel); if (!e) continue; const r = e.getBoundingClientRect(); for (const q of ctl) if (r.left < q.r.right && r.right > q.r.left && r.top < q.r.bottom && r.bottom > q.r.top) over.push(`${sel} на ${q.sel}`); }
      return { over, bodies: bodies.length };
    });
    await page.screenshot({ path: 'research/visual-audit/hud-landscape-844x390.png' });
    expect(hit.bodies, 'герой і хоч один слідувач у кадрі').toBeGreaterThan(1);
    expect(hit.over, 'HUD закриває героя/родину або керування').toEqual([]);
    expect(errors).toEqual([]);
  });
});

test.describe('Escape у розмові з NPC не відкриває ☰ з відповідями (мапа-перша)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('Елiза: Escape — у ☰ жодної кнопки дії (прийняти/відхилити квест недосяжні)', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = await arriveInCamp(page);
    for (let t = 0; t < 4 && !(await talk(page).count()); t++) {
      const q = await probe(page);
      await walk(page, route('camp-lake', [q.playerX, q.playerY], 'npc.elise'));
      await page.keyboard.down('KeyE'); await page.waitForTimeout(200); await page.keyboard.up('KeyE');
      await page.waitForTimeout(800);
    }
    await expect(talk(page)).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    expect(await panel(page).locator('[data-act]').count(), 'у ☰ після Escape є кнопки дії').toBe(0);
    await expect(talk(page), 'рамка розмови лишилась').toBeVisible();
    expect(errors).toEqual([]);
  });
});
