// GAME-32 / GAME-36 · пролог проходиться в браузері через екран «Подорож»: вибір персонажа, квести,
// розмова з Елізою, журнал — до кінця розділу. Кожна дія — справжній клік по кнопці, команда йде в ядро.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, test, type Browser, type Page } from '@playwright/test';

interface Core { game: { campaignEnded: boolean; grants: string[]; player: { transportId: string } | null }; clock: { paused: boolean; minutes: number }; journal: { type: string }[] }
const core = (page: Page): Promise<Core> => page.evaluate(() => (window as unknown as { __game: { read: () => Core } }).__game.read());

async function open(page: Page, query = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/${query}`);
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { ready: boolean; saveLoaded: boolean } } }).__game?.probe.saveLoaded === true, null, { timeout: 30_000 });
  await page.locator('[data-touch="story"]').click();
  await expect(page.locator('[data-ui="story"]')).toBeVisible();
  return errors;
}

const panel = (page: Page) => page.locator('[data-ui="story"]');
/** Один крок проходу — лише клік. Немає кнопки — падіння з назвою кроку (GAME-36, негативний контроль). */
async function act(page: Page, kind: string, key = '', timeout = 5_000): Promise<void> {
  try {
    await panel(page).locator(`[data-act="${kind}"][data-key="${key}"]`).click({ timeout });
  } catch {
    throw new Error(`крок «${kind} ${key}»: кнопки немає на екрані подорожі`);
  }
  await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії — гравець теж не тисне швидше
  // На дорозі з шансом трапляється одна з десяти подій (GAME-31, GAME-108; кидок залежить від прожитих кадрів) —
  // відповідаємо, як гравець, що поспішає: остання відповідь у кожному вузлі (у подій дороги вона безумовна).
  if (kind === 'visit' && key === 'loc.road') await leaveRoadEvent(page);
}

/** GAME-108: з будь-якої події дороги — останньою відповіддю до кінця розмови. */
async function leaveRoadEvent(page: Page): Promise<void> {
  const dlg = panel(page).locator('[data-ui="dialogue"]');
  for (let i = 0; i < 6 && await dlg.isVisible({ timeout: 400 }).catch(() => false); i++) {
    await dlg.locator('[data-act]').last().click();
    await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії
  }
}

/** Пролог велосипедистом із бічним квестом Елізи. Порядок — як гравець читає завдання. */
// ПРОХІД-START — між цими позначками лише кліки й клавіші, без тестового хука гри (перевіряє тест нижче).
async function playBikeProlog(page: Page): Promise<void> {
  await panel(page).locator('[data-act="create"]', { hasText: 'Велосипед' }).first().click();
  await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії
  await act(page, 'complete', 'q.prologue-home-001');
  await act(page, 'complete', 'q.st-001');
  await act(page, 'complete', 'q.st-002');
  await act(page, 'visit', 'loc.shop');
  await act(page, 'pickup', 'item.tent');
  await act(page, 'pickup', 'item.sleeping-bag');
  await act(page, 'complete', 'q.st-003');
  await act(page, 'visit', 'loc.home');
  await act(page, 'complete', 'q.ch1-home-001');
  await act(page, 'visit', 'loc.road');
  await act(page, 'complete', 'q.elise-bike-area.choice');
  await act(page, 'visit', 'loc.camp.lake');
  await act(page, 'talk', 'npc.elise');
  await expect(panel(page).locator('[data-ui="dialogue"]')).toBeVisible();
  await expect(panel(page).locator('[data-ui="actions"]')).toHaveCount(0);   // у розмові — лише відповіді
  await expect(panel(page).locator('[data-ui="dialogue"]', { hasText: 'Рада тебе бачити' })).toBeVisible();
  await act(page, 'choose', 'dlg.elise-greeting.hello.c1');
  await act(page, 'continue');                                              // велосипед → вона називає себе (intro)
  await expect(panel(page).locator('[data-ui="dialogue"]', { hasText: 'я Еліза' })).toBeVisible();
  await act(page, 'continue');
  await act(page, 'choose', 'dlg.elise-greeting.spot.c1');
  await act(page, 'continue');
  await act(page, 'complete', 'q.elise-bike-area');
  // GAME-84 №5: друга розмова — без нового знайомства: ні «Я Еліза…», ні відповіді «Дякую! Де краще поставити намет?» як першого разу.
  await act(page, 'talk', 'npc.elise');
  await expect(panel(page).locator('[data-ui="dialogue"]', { hasText: 'Еліза, тут' })).toHaveCount(0);
  await expect(panel(page).locator('[data-key="dlg.elise-greeting.hello.c2"]')).toHaveCount(0);
  await act(page, 'choose', 'dlg.elise-greeting.hello.c4');
  // GAME-110: намет уже стоїть — місце вдруге не обирають (f.pitch не отримає двох значень), лише дякують.
  await expect(panel(page).locator('[data-key="dlg.elise-greeting.spot.c1"]')).toHaveCount(0);
  await act(page, 'choose', 'dlg.elise-greeting.spot.c6');
  await act(page, 'continue');
  // GAME-84 №1: «Поставити намет» зарахувалось самим поверненням у табір (ST-005 відкрився, коли ти вже тут) — «Піти: Кемпінг» немає.
  await expect(panel(page).locator('[data-act="visit"][data-key="loc.camp.lake"]')).toHaveCount(0);
  await act(page, 'pickup', 'item.firewood');
  await act(page, 'complete', 'q.st-005');
}
// ПРОХІД-END

/** GAME-106: кінець дня 1 відкриває підсумок дня; «Продовжити» — на мапу. reopen — знову відкрити ☰ (там «кінець розділу»). */
async function finishDay(page: Page, reopen: boolean): Promise<void> {
  await expect(page.locator('[data-ui="summary"]')).toBeVisible();
  await page.locator('[data-ui="summary-continue"]').click();
  await expect(page.locator('[data-ui="summary"]')).toHaveCount(0);
  if (reopen) await page.locator('[data-touch="story"]').click();
}

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('пролог від вибору персонажа до кінця розділу — кліками, кожна дія доходить до ядра', async ({ page }) => {
  const errors = await open(page);
  await expect(panel(page).locator('[data-ui="create"]')).toBeVisible();
  expect((await core(page)).game.player).toBeNull();
  await playBikeProlog(page);
  await finishDay(page, true);
  await expect(panel(page).locator('[data-ui="ended"]')).toBeVisible();
  // GAME-84 №6: на екрані кінця — що далі (Розділ I) і що зробити, щоб не загубити гру (зберегти в паузі).
  await expect(panel(page).locator('[data-ui="ended"]')).toContainText('Розділ I');
  await expect(panel(page).locator('[data-ui="ended"]')).toContainText('збережи');
  const c = await core(page);
  expect(c.game.campaignEnded).toBe(true);
  expect(c.game.player?.transportId).toBe('transport.bike');
  expect(c.game.grants).toEqual(expect.arrayContaining(['rw.q-elise-bike-area', 'rw.st-005']));
  // Журнал на екрані = журнал ядра, запис у запис.
  await panel(page).locator('[data-ui="journal"] summary').click();
  expect(await panel(page).locator('[data-ui="journal"] li').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.type)))
    .toEqual(c.journal.map((e) => e.type));
  expect(c.journal.length).toBeGreaterThan(10);   // GAME-84 №1: два «Прибуття» вдома й одне в таборі більше не пишуться — було 16, тепер 13
  // GAME-110: пам'ятний вибір (намет біля сосон) — у журналі на екрані текстом, рівно раз, хоч spot.c1 обрано двічі.
  await expect(panel(page).locator('[data-ui="journal"] li[data-type="Memory"]')).toHaveText(['Запам\'ятали: намет біля сосон']);
  expect(await panel(page).textContent()).not.toContain('⟦');      // жодного ключа без тексту
  expect(errors).toEqual([]);
});

test('на екрані подорожі світ на паузі; Escape і «Назад до мапи» закривають його й пускають час', async ({ page }) => {
  await open(page);
  expect((await core(page)).clock.paused).toBe(true);
  const m0 = (await core(page)).clock.minutes;
  await page.waitForTimeout(1500);
  expect((await core(page)).clock.minutes).toBe(m0);
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  expect((await core(page)).clock.paused).toBe(false);
  await page.locator('[data-touch="story"]').click();
  await page.locator('[data-ui="story-close"]').click();
  await expect(panel(page)).toHaveCount(0);
  await expect(page.locator('[data-ui="pause"]')).toHaveCount(0);   // не плутається з меню паузи
});

// Погода дня (GAME-46): зерно 2 — день 0 сонячний, зерно 10 — дощовий (weatherOf, src/core/weather.ts).
// Дощ сповільнює велосипед ×1.5 угору (SIM-WX-007): дім → крамниця 25 хв → 38 хв, і годинник іде саме на них.
for (const [seed, weather, label, minutes] of [[2, 'sunny', 'сонячно', 25], [10, 'rain', 'дощ', 38]] as const) {
  test(`дорога (GAME-31) у погоду «${weather}» (GAME-46): у шапці погода дня, кнопка показує час, годинник рухається саме на нього`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await open(page, `?seed=${seed}`);
    await panel(page).locator('[data-act="create"]', { hasText: 'Велосипед' }).first().click();
    await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії
    const where = panel(page).locator('[data-ui="where"]');
    await expect(where).toHaveAttribute('data-weather', weather);
    await expect(where).toContainText(`Погода: ${label}`);
    for (const [k, key] of [['complete', 'q.prologue-home-001'], ['complete', 'q.st-001'], ['complete', 'q.st-002']] as const) await act(page, k, key);
    const shop = panel(page).locator('[data-act="visit"][data-key="loc.shop"]');
    await expect(shop).toContainText(`${minutes} хв`);                // велосипедом дім → крамниця
    const m0 = (await core(page)).clock.minutes;
    await page.waitForTimeout(1500);                                    // стоїмо в меню — час стоїть
    expect((await core(page)).clock.minutes).toBe(m0);
    await shop.click();
    expect((await core(page)).clock.minutes).toBe(m0 + minutes);      // дорога — одним кроком
    await ctx.close();
  });
}

/**
 * До дороги з даним зерном у ЧИСТОМУ контексті браузера: інакше автозбереження попередньої спроби (пауза під час
 * відкриття екрана) вантажиться з її RNG, і всі спроби кидають однаково (рецензія eb12626: 6 перезавантажень —
 * той самий стан RNG). Повертає сторінку і чи трапилась подія.
 */
async function toRoad(browser: Browser, seed: number): Promise<{ page: Page; fired: boolean; close: () => Promise<void> }> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await open(page, `?seed=${seed}`);
  await panel(page).locator('[data-act="create"]', { hasText: 'Велосипед' }).first().click();
  await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії
  for (const [k, key] of [['complete', 'q.prologue-home-001'], ['complete', 'q.st-001'], ['complete', 'q.st-002'], ['visit', 'loc.shop'],
    ['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'], ['complete', 'q.st-003'], ['visit', 'loc.home'], ['complete', 'q.ch1-home-001']] as const) await act(page, k, key);
  await panel(page).locator('[data-act="visit"][data-key="loc.road"]').click();
  await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії
  const fired = await panel(page).locator('[data-ui="dialogue"]').isVisible({ timeout: 400 }).catch(() => false);
  return { page, fired, close: () => ctx.close() };
}

test('подія в дорозі не трапилась — дорога триває: жодної розмови, далі звичайні дії', async ({ browser }) => {
  for (let seed = 1; seed <= 16; seed++) {
    const r = await toRoad(browser, seed);
    if (!r.fired) {
      await expect(panel(r.page).locator('[data-act="complete"][data-key="q.st-004"]')).toBeVisible();
      expect((await core(r.page)).journal.at(-1)?.type).toBe('Visit');
      await r.close();
      return;
    }
    await r.close();
  }
  throw new Error('за 16 зерен подія трапилась щоразу — сумарний шанс 82 % так не поводиться');
});

test('подія в дорозі (GAME-31): трапляється на дорозі, читається, відповідь — у ядрі й у журналі', async ({ browser }) => {
  // Шанс «Яблук» 40 % (GAME-108: ще дев'ять подій ділять дорогу), різні зерна, кожне — у чистому контексті.
  // Спроба ≈ 7 с, до 24 зерен — межа часу більша за типові 60 с.
  test.setTimeout(240_000);
  let page: Page | null = null;
  const others = new Set<string>();
  for (let seed = 1; seed <= 24 && !page; seed++) {
    const r = await toRoad(browser, seed);
    const title = r.fired ? await panel(r.page).locator('[data-ui="dialogue"] h3').textContent() : null;
    if (title === 'Яблука біля дороги') page = r.page;
    else { if (title) others.add(title); await r.close(); }
  }
  if (!page) throw new Error(`за 24 зерна «Яблука» не трапились жодного разу (інші події: ${[...others].join(', ')}) — шанс 40 % так не поводиться`);
  await expect(panel(page).locator('[data-ui="dialogue"] h3')).toHaveText('Яблука біля дороги');
  await expect(panel(page).locator('[data-ui="actions"]')).toHaveCount(0);                // у події — лише відповіді
  await panel(page).locator('[data-key="dlg.road-apples.box.c1"]').click();
  await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії
  await panel(page).locator('[data-act="continue"]').click();
  await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії
  await expect(panel(page).locator('[data-ui="dialogue"]')).toHaveCount(0);
  const c = await core(page) as unknown as { game: { flags: string[] }; journal: { type: string; ref: string | null }[] };
  expect(c.game.flags).toEqual(expect.arrayContaining(['f.road-apple', 'f.seen-road-apples']));
  // GAME-110: узяте яблуко — пам'ятний вибір, тож після запису події йде запис «Запам'ятали» з текстом вибору.
  expect(c.journal.slice(-3).map((e) => e.type)).toEqual(['Visit', 'RoadEvent', 'Memory']);
  expect(c.journal.at(-1)?.ref).toBe('f.road-apple');
  await panel(page).locator('[data-ui="journal"] summary').click();
  await expect(panel(page).locator('[data-ui="journal"] li').nth(-2)).toContainText('Яблука біля дороги');
  await expect(panel(page).locator('[data-ui="journal"] li').last()).toHaveText('Запам\'ятали: яблуко з придорожнього ящика й записка «Дякую!»');
});

test('автівкою — без бічного квесту й без відповіді про велосипед, і так само до кінця розділу', async ({ page }) => {
  await open(page);
  await panel(page).locator('[data-act="create"]', { hasText: 'Авто' }).first().click();
  await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії
  for (const [k, key] of [['complete', 'q.prologue-home-001'], ['complete', 'q.st-001'], ['complete', 'q.st-002'], ['visit', 'loc.shop'],
    ['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'], ['complete', 'q.st-003'], ['visit', 'loc.home'], ['complete', 'q.ch1-home-001'], ['visit', 'loc.road']] as const) await act(page, k, key);
  await expect(panel(page).locator('[data-key="q.elise-bike-area.choice"]')).toHaveCount(0);
  await act(page, 'complete', 'q.st-004');
  await act(page, 'visit', 'loc.camp.lake');
  await act(page, 'talk', 'npc.elise');
  await expect(panel(page).locator('[data-key="dlg.elise-greeting.hello.c2"]')).toBeVisible();   // позитивний контроль
  await expect(panel(page).locator('[data-key="dlg.elise-greeting.hello.c1"]')).toHaveCount(0);
  await act(page, 'choose', 'dlg.elise-greeting.hello.c2');
  await act(page, 'continue');                                              // знайомство (intro) → місце для намету
  await act(page, 'choose', 'dlg.elise-greeting.spot.c1');
  await act(page, 'continue');
  // «Поставити намет» зарахувалось ще на прибутті (ST-005 уже був активний): повторне «Піти» — порожнє, його немає.
  await expect(panel(page).locator('[data-act="visit"][data-key="loc.camp.lake"]')).toHaveCount(0);
  await act(page, 'pickup', 'item.firewood');
  await act(page, 'complete', 'q.st-005');
  await finishDay(page, true);
  await expect(panel(page).locator('[data-ui="ended"]')).toBeVisible();
  const c = await core(page);
  expect(c.game.campaignEnded).toBe(true);
  expect(c.game.grants).not.toContain('rw.q-elise-bike-area');
  expect(await panel(page).textContent()).not.toContain('⟦');
});

// GAME-80 · друге свідоме натискання через ~150 мс не має влучати в кнопку, що з'явилась після першої дії.
/** Авто, до кемпінгу з дровами на екрані: перша дія ще не виконана. */
async function carToCamp(page: Page): Promise<void> {
  await panel(page).locator('[data-act="create"]', { hasText: 'Авто' }).first().click();
  await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії
  for (const [k, key] of [['complete', 'q.prologue-home-001'], ['complete', 'q.st-001'], ['complete', 'q.st-002'], ['visit', 'loc.shop'],
    ['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'], ['complete', 'q.st-003'], ['visit', 'loc.home'], ['complete', 'q.ch1-home-001'], ['visit', 'loc.road']] as const) await act(page, k, key);
  await act(page, 'complete', 'q.st-004');
  await act(page, 'visit', 'loc.camp.lake');
  await expect(panel(page).locator('[data-act="pickup"][data-key="item.firewood"]')).toBeVisible();
}

test.describe('GAME-80 · подвійне натискання', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('два дотики з інтервалом 150 мс — одна дія (журнал +1)', async ({ page }) => {
    await open(page, '?seed=5');
    await carToCamp(page);
    const before = (await core(page)).journal.length;
    const box = await panel(page).locator('[data-act="pickup"][data-key="item.firewood"]').boundingBox();
    if (!box) throw new Error('кнопки «Узяти: Дрова» немає на екрані');
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(150);
    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(500);
    const c = await core(page);
    expect(c.journal.length - before).toBe(1);
    expect(c.journal[c.journal.length - 1]?.type).toBe('Pickup');
  });
});

test('два Enter з інтервалом 150 мс — одна дія; фокус після дії не на кнопці, а на рядку стану', async ({ page }) => {
  await open(page, '?seed=5');
  await carToCamp(page);
  const before = (await core(page)).journal.length;
  await panel(page).locator('[data-act="pickup"][data-key="item.firewood"]').focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  const c = await core(page);
  expect(c.journal.length - before).toBe(1);
  expect(c.journal[c.journal.length - 1]?.type).toBe('Pickup');
  await expect(panel(page).locator('[data-ui="where"]')).toBeFocused();
  // після паузи наступна свідома дія проходить: сторож не глушить гру назавжди (позитивний контроль)
  await panel(page).locator('[data-act]').first().focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  expect((await core(page)).journal.length - before).toBe(2);
});

test('затиснутий Enter не пробігає кроки: одне натискання — одна дія', async ({ page }) => {
  await open(page);
  await panel(page).locator('[data-act="create"]').first().focus();
  // Повторний down тієї самої клавіші Playwright шле з repeat: true — як автоповтор затиснутої клавіші.
  for (let i = 0; i < 4; i++) { await page.keyboard.down('Enter'); await page.waitForTimeout(30); }
  await page.keyboard.up('Enter');
  await page.waitForTimeout(50);
  expect((await core(page)).journal.length).toBe(1);   // лише «Початок подорожі»
});

test('після закриття екрана подорожі фокус на полі гри з підписом: Space — дія сцени, а не кнопка ☰', async ({ page }) => {
  await open(page);
  await page.locator('[data-ui="story-close"]').click();
  await page.waitForTimeout(50);
  expect(await page.evaluate(() => ({ id: document.activeElement?.id, label: document.activeElement?.getAttribute('aria-label') })))
    .toEqual({ id: 'stage', label: expect.stringMatching(/стрілки|arrows/) });
  await page.keyboard.press('Space');                       // далеко від об'єктів: нічого не відкривається
  await page.waitForTimeout(100);
  await expect(panel(page)).toHaveCount(0);
});

test('сейв після прологу: перезавантаження — і кінець розділу на місці', async ({ page }) => {
  await open(page);
  await playBikeProlog(page);
  await finishDay(page, false);
  await page.locator('[data-touch="pause"]').click();
  await page.locator('[data-ui="save"]').click();
  await expect(page.locator('[data-ui="status"]')).toBeVisible();
  await page.reload();
  await open(page);
  await expect(panel(page).locator('[data-ui="ended"]')).toBeVisible();
});

// GAME-89 №6: після кінця кампанії поза ☰ видно, що розділ завершено; мапа лишається живою (персонаж ходить).
test('кінець розділу видно поза ☰: підказка в HUD, ☰ підсвічена, мапа далі рухається', async ({ page }) => {
  await open(page);
  await expect(page.locator('[data-ui="ended-hint"]')).toHaveCount(0);   // до кінця підказки немає (контроль)
  await playBikeProlog(page);
  await finishDay(page, false);
  const hint = page.locator('[data-ui="ended-hint"]');
  await expect(hint).toBeVisible();
  await expect(hint).toContainText('Кінець Прологу');
  await expect(hint).toContainText('☰');
  await expect(page.locator('[data-touch="story"]')).toHaveAttribute('data-hint', 'yes');
  // Мапа лишається придатною: відведений убік джойстик зсуває персонажа.
  const x0 = (await page.evaluate(() => (window as unknown as { __game: { probe: { playerX: number; playerY: number } } }).__game.probe)).playerX;
  const y0 = (await page.evaluate(() => (window as unknown as { __game: { probe: { playerX: number; playerY: number } } }).__game.probe)).playerY;
  const stick = page.locator('[data-touch="stick"]');
  const box = await stick.boundingBox();
  if (!box) throw new Error('джойстика немає');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2, { steps: 4 });   // ручка вправо (GAME-91)
  await page.waitForTimeout(600);
  await page.mouse.up();
  const p1 = await page.evaluate(() => (window as unknown as { __game: { probe: { playerX: number; playerY: number } } }).__game.probe);
  expect(Math.abs(p1.playerX - x0) + Math.abs(p1.playerY - y0)).toBeGreaterThan(4);
});

test('кожна ціль екрана подорожі ≥ 44×44 CSS px і нічого не вилазить за екран (псевдолокаль)', async ({ page }) => {
  await open(page, '?lang=pseudo');
  await panel(page).locator('[data-act="create"]').first().click();
  await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії
  // GAME-81: удома більше немає кнопок «Купити» — для щільного екрана йдемо в крамницю (три «Узяти», дорога, квест).
  await act(page, 'complete', 'q.prologue-home-001');
  await act(page, 'complete', 'q.st-001');
  await act(page, 'complete', 'q.st-002');
  await act(page, 'visit', 'loc.shop');
  await panel(page).locator('[data-ui="journal"] summary').click();
  const bad = await page.evaluate(() => {
    const out: string[] = [];
    const vw = window.innerWidth;
    for (const el of document.querySelectorAll<HTMLElement>('[data-ui="story"] *')) {
      const r = el.getBoundingClientRect();
      if (el.scrollWidth > el.clientWidth + 1 || r.left < -1 || r.right > vw + 1) out.push(`overflow ${el.tagName}.${el.className}`);
      if (el.matches('button, summary') && (r.width < 44 || r.height < 44)) out.push(`small ${el.tagName}[${el.dataset.act ?? el.dataset.ui ?? ''}] ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    return out;
  });
  expect(await panel(page).locator('button').count()).toBeGreaterThan(3);
  expect(bad).toEqual([]);
});

test('негативний контроль: прихована кнопка «Завершити» — прохід червоніє з назвою кроку', async ({ page }) => {
  await open(page, '?hideAct=complete');
  await expect(panel(page).locator('[data-act="create"]').first()).toBeVisible();  // екран живий, сховано лише «Завершити»
  await expect(playBikeProlog(page)).rejects.toThrow('крок «complete q.prologue-home-001»');
});

test('прохід керується лише кліками й клавішами: без приватного API гри та без імпортів ядра', () => {
  const src = readFileSync(new URL(import.meta.url), 'utf8');
  const sf = ts.createSourceFile('story.spec.ts', src, ts.ScriptTarget.Latest, true);
  const imports = sf.statements.filter(ts.isImportDeclaration).map((d) => (d.moduleSpecifier as ts.StringLiteral).text);
  expect(imports.sort()).toEqual(['@playwright/test', 'node:fs', 'typescript']);
  expect(src).not.toMatch(/\brequire\s*\(|\bimport\s*\(/);                       // і жодних динамічних імпортів
  // Під перевіркою — сам прохід і помічники, якими він ходить (panel, act): за синтаксичним деревом
  // (рецензія: регулярні вирази обходились шаблоном `${…}` і «//» усередині рядка).
  const FLOW = ['panel', 'act', 'leaveRoadEvent', 'playBikeProlog'];
  const roots: ts.Node[] = [];
  ts.forEachChild(sf, (n) => {
    if (ts.isFunctionDeclaration(n) && n.name && FLOW.includes(n.name.text)) roots.push(n);
    if (ts.isVariableStatement(n)) for (const d of n.declarationList.declarations) if (ts.isIdentifier(d.name) && FLOW.includes(d.name.text)) roots.push(d);
  });
  expect(roots.length).toBe(FLOW.length);
  const ALLOWED = new Set(['playBikeProlog', 'act', 'leaveRoadEvent', 'panel', 'locator', 'first', 'last', 'click', 'tap', 'press', 'down', 'up', 'expect', 'toBeVisible', 'toHaveCount', 'Error', 'isVisible', 'catch', 'waitForTimeout']);
  const called: string[] = [];
  const bad: string[] = [];
  const walk = (n: ts.Node): void => {
    if (ts.isCallExpression(n) || ts.isNewExpression(n)) {
      const e = n.expression;
      const optional = ts.isCallExpression(n) && !!n.questionDotToken;
      if (ts.isIdentifier(e) && !optional) called.push(e.text);
      else if (ts.isPropertyAccessExpression(e) && !e.questionDotToken && !optional) called.push(e.name.text);
      else bad.push(e.getText(sf));                                        // page['evaluate'](…), x?.(…), (f)(…)
    }
    if (ts.isIdentifier(n) && /^(__game|bridge|dispatch|localStorage|indexedDB|sessionStorage)$/.test(n.text)) bad.push(n.text);
    ts.forEachChild(n, walk);
  };
  roots.forEach(walk);
  expect(bad).toEqual([]);
  expect(called.length).toBeGreaterThan(20);
  expect([...new Set(called.filter((c) => !ALLOWED.has(c)))]).toEqual([]);
});

// GAME-32 · Еліза стоїть на мапі кемпінгу: до неї доходять пішки й заговорюють клавішею дії.
interface Probe { playerX: number; playerY: number; nearObject: string | null }
const probe = (page: Page): Promise<Probe> => page.evaluate(() => ({ ...(window as unknown as { __game: { probe: Probe } }).__game.probe }));
async function walk(page: Page, key: string, until: (p: Probe) => boolean): Promise<Probe> {
  await page.keyboard.down(key);
  const start = Date.now();
  let p = await probe(page);
  while (!until(p) && Date.now() - start < 5_000) { await page.waitForTimeout(16); p = await probe(page); }
  await page.keyboard.up(key);
  await page.waitForTimeout(50);
  return probe(page);
}
async function walkToElise(page: Page): Promise<void> {
  await walk(page, 'ArrowLeft', (p) => p.playerX <= 88);
  const p = await walk(page, 'ArrowDown', (q) => q.nearObject === 'npc.elise');
  expect(p.nearObject).toBe('npc.elise');
}

test.describe('Еліза на мапі (клавіатура)', () => {
  test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });

  test('у кемпінгу: дійти пішки, натиснути дію — відкривається розмова з нею', async ({ page }) => {
    await open(page);
    await panel(page).locator('[data-act="create"]', { hasText: 'Велосипед' }).first().click();
    await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії
    for (const [k, key] of [['complete', 'q.prologue-home-001'], ['complete', 'q.st-001'], ['complete', 'q.st-002'], ['visit', 'loc.shop'],
      ['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'], ['complete', 'q.st-003'], ['visit', 'loc.home'], ['complete', 'q.ch1-home-001'], ['visit', 'loc.road'], ['complete', 'q.st-004'], ['visit', 'loc.camp.lake']] as const) await act(page, k, key);
    await page.locator('[data-ui="story-close"]').click();
    await walkToElise(page);
    await page.keyboard.press('Space');
    await expect(panel(page).locator('[data-ui="dialogue"]')).toBeVisible();
    await expect(panel(page).locator('[data-ui="line"]')).toContainText('Рада тебе бачити');   // GAME-84 №5: привітання без нового знайомства
    expect((await core(page) as unknown as { game: { dialogue: { id: string } | null } }).game.dialogue?.id).toBe('dlg.elise-greeting');
  });

  test('ще вдома: Еліза на мапі є, але ядро розмову не приймає — екран подорожі без розмови', async ({ page }) => {
    await open(page);
    await panel(page).locator('[data-act="create"]').first().click();
    await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії
    await page.locator('[data-ui="story-close"]').click();
    await walkToElise(page);
    await page.keyboard.press('Space');
    await expect(panel(page)).toBeVisible();
    await expect(panel(page).locator('[data-ui="dialogue"]')).toHaveCount(0);
    expect((await core(page) as unknown as { game: { dialogue: unknown } }).game.dialogue).toBeNull();
  });
});
