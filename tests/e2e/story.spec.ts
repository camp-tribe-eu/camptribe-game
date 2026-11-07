// GAME-32 / GAME-36 · пролог проходиться в браузері через екран «Подорож»: вибір персонажа, квести,
// розмова з Елізою, журнал — до кінця розділу. Кожна дія — справжній клік по кнопці, команда йде в ядро.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { checkOrWriteDay1, seedDay1 } from './day1-fixture';

interface Core { game: { campaignEnded: boolean; grants: string[]; player: { transportId: string } | null }; clock: { paused: boolean; minutes: number }; journal: { type: string }[] }
const core = (page: Page): Promise<Core> => page.evaluate(() => (window as unknown as { __game: { read: () => Core } }).__game.read());

async function open(page: Page, query = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/${query}`);
  // GAME-223: те саме, що tests/e2e/ready.ts, але вбудовано — сторож нижче (:518) дозволяє цьому файлу лише три імпорти.
  await page.waitForFunction(() => { const p = (window as unknown as { __game?: { probe: { ready: boolean; saveLoaded: boolean } } }).__game?.probe; return p?.saveLoaded === true && p.ready === true; }, null, { timeout: 30_000 });
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
  await act(page, 'checkout', 'basket.all');
  await act(page, 'complete', 'q.st-003');
  await act(page, 'visit', 'loc.home');
  await act(page, 'complete', 'q.ch1-home-001');
  await act(page, 'visit', 'loc.road');
  // GAME-141: велозона — сцена дня 2, з ST-004 її вибору більше немає.
  await expect(panel(page).locator('[data-key="q.elise-bike-area.choice"]')).toHaveCount(0);
  await act(page, 'complete', 'q.st-004');
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
  // GAME-84 №5: друга розмова — без нового знайомства: ні «Я Еліза…», ні відповіді «Дякую! Де краще поставити намет?» як першого разу.
  await act(page, 'talk', 'npc.elise');
  await expect(panel(page).locator('[data-ui="dialogue"]', { hasText: 'Еліза, тут' })).toHaveCount(0);
  await expect(panel(page).locator('[data-key="dlg.elise-greeting.hello.c2"]')).toHaveCount(0);
  await act(page, 'choose', 'dlg.elise-greeting.hello.c4');
  // GAME-110: намет уже стоїть — місце вдруге не обирають (f.pitch не отримає двох значень), лише дякують.
  await expect(panel(page).locator('[data-key="dlg.elise-greeting.spot.c1"]')).toHaveCount(0);
  // GAME-141: ST-005 уже активний з першої розмови (велозона більше не між ними), тож ціль «намет» закрита ще тоді —
  // «Намет уже стоїть» (spot.c6) нічого не змінює й меню зливає її з «Ще роззирнусь» (spot.c4).
  await expect(panel(page).locator('[data-key="dlg.elise-greeting.spot.c6"]')).toHaveCount(0);
  await act(page, 'choose', 'dlg.elise-greeting.spot.c4');
  await act(page, 'continue');
  // GAME-84 №1: «Поставити намет» зарахувалось самим поверненням у табір (ST-005 відкрився, коли ти вже тут) — «Піти: Кемпінг» немає.
  await expect(panel(page).locator('[data-act="visit"][data-key="loc.camp.lake"]')).toHaveCount(0);
  await act(page, 'pickup', 'item.firewood');
  await act(page, 'complete', 'q.st-005');
}

/**
 * GAME-141 · день 2 велосипедиста після підсумку дня 1 (екран подорожі відкрито): ранок, порада Елізи (прийнято), вибір
 * «Глянути нову велозону», «Ходімо, гляну», вечеря просто, вечір біля вогнища (гачок GAME-142) — кінець розділу.
 */
async function playBikeDay2(page: Page): Promise<void> {
  await act(page, 'complete', 'q.ch1-d2-001');
  await act(page, 'talk', 'npc.elise');
  await act(page, 'choose', 'dlg.elise-greeting.hello.c11');
  await act(page, 'choose', 'dlg.elise-greeting.morning.c1');
  await act(page, 'choose', 'dlg.elise-greeting.advice.c1');
  await act(page, 'continue');
  await act(page, 'continue');
  await act(page, 'complete', 'q.elise-bike-area.choice');
  await act(page, 'talk', 'npc.elise');
  await act(page, 'choose', 'dlg.elise-greeting.hello.c12');
  await act(page, 'choose', 'dlg.elise-greeting.bikezone.c1');
  await act(page, 'continue');
  await act(page, 'continue');
  await act(page, 'complete', 'q.elise-bike-area');
}

/** GAME-256 · вечір дня 2 (після 18:00): вечеря, вогнище. Окремо від ранку — між ними тест перемотує годинник до вечора. */
async function playBikeDay2Evening(page: Page): Promise<void> {
  await act(page, 'talk', 'npc.elise');
  await act(page, 'choose', 'dlg.elise-greeting.hello.c14');
  await act(page, 'choose', 'dlg.elise-greeting.dinner.c2');
  await act(page, 'continue');
  await act(page, 'continue');
  await act(page, 'complete', 'q.ch1-d2-camp-001');
  await act(page, 'complete', 'q.ch1-d2-fire-001');
}

/**
 * GAME-144 · день 3 велосипедиста після підсумку дня 2 (екран подорожі відкрито): ранок, речі, прощання з Елізою (без подяки
 * за пакети — їх не прибирали), дорога додому, дім — кінець розділу. Сталий сід e2e 20261022: день 0 дощовий, тож намет і
 * спальник мокрі ще з дороги, а стан намету впав — сцена «Збираємо речі» каже саме про це (R1-04: проблема за ФАКТИЧНИМ станом),
 * і поруч — справжня дія «висушити», після якої сцена міняється. Сонячний день 0 і нейтральну сцену проходить game-106.spec (?seed=2).
 */
async function playBikeDay3(page: Page): Promise<void> {
  await act(page, 'complete', 'q.ch1-d3-001');
  const gear = panel(page).locator('[data-ui="quest"]', { hasText: 'Збираємо речі' });
  await expect(gear).toContainText('Намет вологий');
  await act(page, 'dry', 'item.tent');
  await expect(gear).toContainText('пом\'явся');                      // сухий, але стан після дощової дороги впав: «зношений», не «вологий»
  await expect(gear).not.toContainText('вологий');
  await act(page, 'dry', 'item.sleeping-bag');
  await expect(panel(page).locator('[data-act="dry"]')).toHaveCount(0);   // сушити більше нічого — кнопки без дії немає
  await act(page, 'complete', 'q.ch1-d3-gear-001');
  await act(page, 'talk', 'npc.elise');
  await act(page, 'choose', 'dlg.elise-greeting.hello.c15');
  await expect(panel(page).locator('[data-ui="dialogue"]', { hasText: 'Уже збираєтесь' })).toBeVisible();
  await act(page, 'continue');
  await expect(panel(page).locator('[data-ui="dialogue"]')).not.toContainText('пакети');   // подяка — лише з f.litter-cleaned-ch1
  await act(page, 'choose', 'dlg.elise-greeting.goodbye.c2');
  await act(page, 'continue');
  await act(page, 'continue');
  await act(page, 'complete', 'q.ch1-d3-elise-001');
  await act(page, 'visit', 'loc.road');
  await act(page, 'complete', 'q.ch1-d3-return-001');
  await act(page, 'visit', 'loc.home');
  await act(page, 'complete', 'q.ch1-d3-home-001');
}
// ПРОХІД-END

/** GAME-106: кінець дня відкриває підсумок дня N; «Продовжити» — на мапу. reopen — знову відкрити ☰. */
async function finishDay(page: Page, reopen: boolean, day = 1): Promise<void> {
  // GAME-264: підсумок дня з'являється сам; у кінці розділу його кнопка — «Лягти спати»: сон → картка-«серія» (тизер розділу 2) → меню паузи зі збереженням → «Продовжити».
  await expect(page.locator('[data-ui="summary"]')).toBeVisible();
  await expect(page.locator('[data-ui="episode"]')).toHaveCount(0);
  await expect(page.locator('[data-ui="summary"] h2')).toHaveText(`Підсумок дня ${day}`);
  const go = page.locator('[data-ui="summary-continue"]');
  const endOfChapter = /Лягти спати|Go to sleep/.test((await go.textContent()) ?? '');
  await go.click();
  if (endOfChapter) {
    await expect(page.locator('[data-ui="episode"]')).toBeVisible();
    await page.locator('[data-ui="episode-skip"]').click();
    await expect(page.locator('[data-ui="episode"]')).toHaveCount(0);
    await expect(page.locator('[data-ui="pause"]')).toBeVisible();
    await page.locator('[data-ui="resume"]').click();
  }
  // 15 с: на CI PR #53 сторінка під навантаженням 5 с не відповідала на запит лічильника («Received: undefined»).
  await expect(page.locator('[data-ui="summary"]')).toHaveCount(0, { timeout: 15_000 });
  if (reopen) await page.locator('[data-touch="story"]').click();
}

/**
 * GAME-256 · день сюжету закриває СОН, а вечірні кроки чекають 18:00. Вечір — без очікування: ?skipMinutes=N перемотує годинник ПІСЛЯ завантаження збереження
 * (GAME-242), тож скачок — лише в часі; усе, що відбувається далі, — справжні кліки. Тест не про час, тому перемотування тут допустиме.
 */
async function skipToEvening(page: Page): Promise<void> {
  const minutes = (await core(page)).clock.minutes;
  const delta = (19 * 60 - ((minutes + 480) % 1440) + 1440) % 1440;
  await page.goto(`/?skipMinutes=${delta}`);
  await page.waitForFunction(() => { const p = (window as unknown as { __game?: { probe: { ready: boolean; saveLoaded: boolean } } }).__game?.probe; return p?.saveLoaded === true && p.ready === true; });
  await page.locator('[data-ui="recovery-close"]').click({ timeout: 800 }).catch(() => undefined);
  await expect.poll(async () => ((await core(page)).clock.minutes + 480) % 1440, { timeout: 10_000 }).toBeGreaterThanOrEqual(19 * 60);
  await page.locator('[data-touch="story"]').click();
  await expect(page.locator('[data-ui="story"]')).toBeVisible();
}

/** Вечір → «Лягти спати» у наметі → ранок і підсумок дня `day` (GAME-242/256). */
async function sleepDay(page: Page, day: number, reopen = true): Promise<void> {
  await skipToEvening(page);
  await panel(page).locator('[data-act="sleep"]').click({ timeout: 5_000 });
  await finishDay(page, reopen, day);
}

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

// GAME-255 · було один тест на 3 дні (33–44 с локально, на CI ≈ 4 fps — майже весь бюджет 120 с). Тепер дві частини, кожна ≤ ~20 с:
// A — вибір героя, пролог, день 1 і журнал на цю мить; B — дні 2–3, кінець розділу, нагороди — зі СПРАВЖНЬОГО сейву дня 1 (tests/e2e/day1-fixture.ts:
// його записала гра, а частина A кожного разу звіряє свій стан із ним, тож фікстура не розходиться з проходом).
test('день 1 (пролог від вибору персонажа) — кліками, кожна дія доходить до ядра; журнал на екрані = журнал ядра', async ({ page }) => {
  const errors = await open(page);
  await expect(panel(page).locator('[data-ui="create"]')).toBeVisible();
  expect((await core(page)).game.player).toBeNull();
  await playBikeProlog(page);
  await sleepDay(page, 1);   // GAME-256: день 1 закриває сон у наметі, а не завершення ST-005
  // GAME-141: ST-005 — не кінець розділу: далі ранок дня 2.
  await expect(panel(page).locator('[data-ui="ended"]')).toHaveCount(0);
  const c = await core(page);
  expect(c.game.campaignEnded).toBe(false);
  expect(c.game.player?.transportId).toBe('transport.bike');
  // Журнал на екрані = журнал ядра, запис у запис.
  await panel(page).locator('[data-ui="journal"] summary').click();
  await panel(page).locator('[data-ui="journal-more"]').click();   // GAME-253: довгий журнал згорнуто до останніх записів
  expect(await panel(page).locator('[data-ui="journal"] li').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.type)))
    .toEqual(c.journal.map((e) => e.type).reverse());   // GAME-253: найновіше зверху
  expect(c.journal.length).toBeGreaterThan(6);
  // GAME-110: пам'ятний вибір дня 1 (намет біля сосон) — у журналі на екрані текстом, рівно раз.
  await expect(panel(page).locator('[data-ui="journal"] li[data-type="Memory"]')).toHaveText(['Запам\'ятали: намет біля сосон']);
  expect(await panel(page).textContent()).not.toContain('⟦');      // жодного ключа без тексту
  await checkOrWriteDay1(page);                                     // GAME-255: стан = фікстура, з якої стартує частина B
  expect(errors).toEqual([]);
});

test('дні 2–3 до кінця розділу — кліками зі збереженого дня 1; кінець, нагороди, журнал', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await seedDay1(page);
  await page.locator('[data-touch="story"]').click();
  await expect(panel(page)).toBeVisible();
  expect((await core(page)).game.campaignEnded).toBe(false);
  await expect(panel(page).locator('[data-act="complete"][data-key="q.ch1-d2-001"]')).toBeVisible();   // це справді ранок дня 2
  const t3 = Date.now();
  await playBikeDay2(page);
  await skipToEvening(page);
  await playBikeDay2Evening(page);
  await sleepDay(page, 2);
  // GAME-144: вогнище — вечір дня 2, не кінець розділу: далі ранок дня 3.
  await expect(panel(page).locator('[data-ui="ended"]')).toHaveCount(0);
  expect((await core(page)).game.campaignEnded).toBe(false);
  await playBikeDay3(page);
  await finishDay(page, true, 3);
  console.log(`GAME-144: дні 2–3 кліками за ${((Date.now() - t3) / 1000).toFixed(1)} с; ігрових хвилин ${(await core(page)).clock.minutes}`);
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
  await panel(page).locator('[data-ui="journal-more"]').click();   // GAME-253: довгий журнал згорнуто до останніх записів
  expect(await panel(page).locator('[data-ui="journal"] li').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.type)))
    .toEqual(c.journal.map((e) => e.type).reverse());   // GAME-253: найновіше зверху
  expect(c.journal.length).toBeGreaterThan(10);   // GAME-84 №1: два «Прибуття» вдома й одне в таборі більше не пишуться — було 16, тепер 13
  // GAME-110: пам'ятні вибори (намет біля сосон — з дня 1; порада Елізи вдень 2) — у журналі на екрані текстом, кожен рівно раз.
  await expect(panel(page).locator('[data-ui="journal"] li[data-type="Memory"]')).toHaveText(['Запам\'ятали: порада Елізи сушити намет зранку — прийнято', 'Запам\'ятали: намет біля сосон']);   // GAME-253: найновіше зверху
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
    ['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'], ['checkout', 'basket.all'], ['complete', 'q.st-003'], ['visit', 'loc.home'], ['complete', 'q.ch1-home-001']] as const) await act(page, k, key);
  await panel(page).locator('[data-act="visit"][data-key="loc.road"]').click();
  await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії
  const fired = await panel(page).locator('[data-ui="dialogue"]').isVisible({ timeout: 400 }).catch(() => false);
  return { page, fired, close: () => ctx.close() };
}

test('подія в дорозі не трапилась — дорога триває: жодної розмови, далі звичайні дії', async ({ browser }) => {
  test.setTimeout(480_000);   // до 16 зерен, кожне — новий контекст і кроки пролога; на CI одне зерно 15–20 с (CI PR #53: 180 с замало)
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
  test.setTimeout(480_000);   // до 16 зерен, кожне — новий контекст і кроки пролога; на CI одне зерно 15–20 с (CI PR #53: 180 с замало)
  // Шанс «Яблук» 40 % (GAME-108: ще дев'ять подій ділять дорогу), різні зерна, кожне — у чистому контексті.
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
  await expect(panel(page).locator('[data-ui="journal"] li').nth(1)).toContainText('Яблука біля дороги');   // GAME-253: найновіше зверху
  await expect(panel(page).locator('[data-ui="journal"] li').first()).toHaveText('Запам\'ятали: яблуко з придорожнього ящика й записка «Дякую!»');
});

test('автівкою — без бічного квесту й без відповіді про велосипед, і так само до кінця розділу', async ({ page }) => {
  await open(page);
  await panel(page).locator('[data-act="create"]', { hasText: 'Авто' }).first().click();
  await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії
  for (const [k, key] of [['complete', 'q.prologue-home-001'], ['complete', 'q.st-001'], ['complete', 'q.st-002'], ['visit', 'loc.shop'],
    ['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'], ['checkout', 'basket.all'], ['complete', 'q.st-003'], ['visit', 'loc.home'], ['complete', 'q.ch1-home-001'], ['visit', 'loc.road']] as const) await act(page, k, key);
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
  await sleepDay(page, 1);
  // День 2 автом (GAME-141): без вибору велозони.
  await act(page, 'complete', 'q.ch1-d2-001');
  await act(page, 'talk', 'npc.elise');
  await act(page, 'choose', 'dlg.elise-greeting.hello.c11');
  await act(page, 'choose', 'dlg.elise-greeting.morning.c2');
  await act(page, 'continue');
  await expect(panel(page).locator('[data-key="q.elise-bike-area.choice"]')).toHaveCount(0);
  await act(page, 'complete', 'q.ch1-d2-elise-001');
  await skipToEvening(page);   // GAME-256: вечеря — після 18:00
  await act(page, 'talk', 'npc.elise');
  await act(page, 'choose', 'dlg.elise-greeting.hello.c14');
  await act(page, 'choose', 'dlg.elise-greeting.dinner.c1');
  await act(page, 'continue');
  await act(page, 'continue');
  await act(page, 'complete', 'q.ch1-d2-camp-001');
  await act(page, 'complete', 'q.ch1-d2-fire-001');
  await sleepDay(page, 2);
  // День 3 автом (GAME-144): кінець розділу — лише тепер; усе на ядрі, без вибору велозони.
  await expect(panel(page).locator('[data-ui="ended"]')).toHaveCount(0);
  expect((await core(page)).game.campaignEnded).toBe(false);
  await act(page, 'complete', 'q.ch1-d3-001');
  await act(page, 'dry', 'item.tent');                                // сталий сід e2e: дощ — і в авто намет із спальником вологі
  await act(page, 'dry', 'item.sleeping-bag');
  await act(page, 'complete', 'q.ch1-d3-gear-001');
  await act(page, 'talk', 'npc.elise');
  await act(page, 'choose', 'dlg.elise-greeting.hello.c15');
  await act(page, 'continue');
  await act(page, 'choose', 'dlg.elise-greeting.goodbye.c2');
  await act(page, 'continue');
  await act(page, 'continue');
  await act(page, 'complete', 'q.ch1-d3-elise-001');
  await act(page, 'visit', 'loc.road');
  await act(page, 'complete', 'q.ch1-d3-return-001');
  await act(page, 'visit', 'loc.home');
  await act(page, 'complete', 'q.ch1-d3-home-001');
  await finishDay(page, true, 3);
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
    ['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'], ['checkout', 'basket.all'], ['complete', 'q.st-003'], ['visit', 'loc.home'], ['complete', 'q.ch1-home-001'], ['visit', 'loc.road']] as const) await act(page, k, key);
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
    const btn = panel(page).locator('[data-act="pickup"][data-key="item.firewood"]');
    // GAME-200: розділ «Цілі» подовжив панель — на телефоні кнопка може бути нижче краю; дотик за межами екрана нічого не робить.
    await btn.scrollIntoViewIfNeeded();
    const box = await btn.boundingBox();
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
  // GAME-280: фокус на кнопці — ПЕРЕДУМОВА натискання, а не припущення. StoryPanel повертає фокус на рядок стану щоразу, як приходить новий offer
  // (port.onStory → setOffer), тож `.focus()` одним викликом міг упасти ДО такого оновлення, і перший Enter йшов у порожнє місце (журнал 0 — CI 42414046498).
  // Тут фокус ставиться знову й перевіряється через два кадри, доки кнопка справді тримає його; жодного очікування за часом.
  await expect.poll(() => page.evaluate(async () => {
    const b = document.querySelector<HTMLElement>('[data-ui="story"] [data-act="create"]');
    b?.focus();
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    return b !== null && document.activeElement === b;
  }), { message: 'кнопка «create» тримає фокус перед натисканням' }).toBe(true);
  // Повторний down тієї самої клавіші Playwright шле з repeat: true — як автоповтор затиснутої клавіші.
  for (let i = 0; i < 4; i++) { await page.keyboard.down('Enter'); await page.waitForTimeout(30); }
  await page.keyboard.up('Enter');
  // Спершу дочекатись, що перше натискання дійшло (на повільному раннері за 50 мс журнал ще 0 — CI #120), потім — що лишилось РІВНО одне.
  await expect.poll(async () => (await core(page)).journal.length, { timeout: 3_000 }).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(300);
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

// GAME-242: раніше тест грав усі три дні перед перезавантаженням і на CI (≈ 4 fps) виходив за свої 120 с (заміряно локально
// при CPU ×20: 2,8 хв і на main, і на гілці). Кінець розділу після трьох днів перевіряє сусідній тест «кінець розділу видно
// поза ☰»; тут — сам сейв: після прологу й дня 1 стан ядра після перезавантаження ТОЙ САМИЙ, що до (сувора рівність, не одна ознака).
test('сейв після прологу: перезавантаження — і кінець розділу на місці', async ({ page }) => {
  await open(page);
  await playBikeProlog(page);
  await sleepDay(page, 1, false);   // панель не відкриваємо знову — пауза ‖ поверх мапи
  await page.locator('[data-touch="pause"]').click();
  await page.locator('[data-ui="save"]').click();
  await expect(page.locator('[data-ui="status"]')).toBeVisible();
  const before = (await core(page)).game;
  expect(before.grants.length, 'пролог справді пройдено (є нагороди)').toBeGreaterThan(0);
  await page.reload();
  await open(page);
  expect((await core(page)).game, 'стан ядра після перезавантаження = до нього').toEqual(before);
});

// GAME-89 №6: після кінця кампанії поза ☰ видно, що розділ завершено; мапа лишається живою (персонаж ходить).
test('кінець розділу видно поза ☰: підказка в HUD, ☰ підсвічена, мапа далі рухається', async ({ page }) => {
  await open(page);
  await expect(page.locator('[data-ui="ended-hint"]')).toHaveCount(0);   // до кінця підказки немає (контроль)
  await playBikeProlog(page);
  await sleepDay(page, 1);
  await expect(page.locator('[data-ui="ended-hint"]')).toHaveCount(0);   // GAME-141: межа дня 1 — ще не кінець
  await playBikeDay2(page);
  await skipToEvening(page);
  await playBikeDay2Evening(page);
  await sleepDay(page, 2);
  await expect(page.locator('[data-ui="ended-hint"]')).toHaveCount(0);   // GAME-144: межа дня 2 — теж ще не кінець
  await playBikeDay3(page);
  await finishDay(page, false, 3);
  const hint = page.locator('[data-ui="ended-hint"]');
  await expect(hint).toBeVisible();
  await expect(hint).toContainText('Кінець дня 3');
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
  expect(imports.sort()).toEqual(['./day1-fixture', '@playwright/test', 'node:fs', 'typescript']);   // GAME-255: ./day1-fixture — лише сейв дня 1 для частини B; прохід (FLOW) нижче перевіряється, як і раніше
  expect(src).not.toMatch(/\brequire\s*\(|\bimport\s*\(/);                       // і жодних динамічних імпортів
  // Під перевіркою — сам прохід і помічники, якими він ходить (panel, act): за синтаксичним деревом
  // (рецензія: регулярні вирази обходились шаблоном `${…}` і «//» усередині рядка).
  const FLOW = ['panel', 'act', 'leaveRoadEvent', 'playBikeProlog', 'playBikeDay2', 'playBikeDay2Evening'];   // GAME-141: і день 2
  const roots: ts.Node[] = [];
  ts.forEachChild(sf, (n) => {
    if (ts.isFunctionDeclaration(n) && n.name && FLOW.includes(n.name.text)) roots.push(n);
    if (ts.isVariableStatement(n)) for (const d of n.declarationList.declarations) if (ts.isIdentifier(d.name) && FLOW.includes(d.name.text)) roots.push(d);
  });
  expect(roots.length).toBe(FLOW.length);
  const ALLOWED = new Set(['playBikeProlog', 'playBikeDay2', 'playBikeDay2Evening', 'act', 'leaveRoadEvent', 'panel', 'locator', 'first', 'last', 'click', 'tap', 'press', 'down', 'up', 'expect', 'toBeVisible', 'toHaveCount', 'Error', 'isVisible', 'catch', 'waitForTimeout']);
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
interface Probe { playerX: number; playerY: number; nearObject: string | null; fps: number }
const probe = (page: Page): Promise<Probe> => page.evaluate(() => ({ ...(window as unknown as { __game: { probe: Probe } }).__game.probe }));
/** Точка Елізи з мапи (public/maps/camp-lake.tmj) — ціль за координатою, як у world.spec (CI PR #53: кроки за годинником
 *  на повільному CI то не доходили, то проскакували зону Ø 96 px). Звірка з мапою — нижче, щоб константа не застаріла. */
const ELISE = { x: 80, y: 272 };
const KEY_CODE = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40 } as const;
/** Ходьба до координати, яку стереже сама сторінка: keydown, перевірка позиції кожен кадр (rAF), keyup одразу на цілі.
 *  CI PR #53: цикл «клавіша з Playwright → probe → клавіша» мав затримку в сотні мс на кожен обмін, і персонаж проскакував
 *  зону Елізи то по X, то по Y. Тут обміну через CDP між кроками немає. Подія — як справжня клавіша (keyCode), як у world.spec. */
async function walkInPage(page: Page, key: keyof typeof KEY_CODE, axis: 'playerX' | 'playerY', target: number, lead: number): Promise<void> {
  await page.evaluate(({ code, key, axis, target, lead }) => new Promise<void>((resolve) => {
    const g = (window as unknown as { __game: { probe: { playerX: number; playerY: number; nearObject: string | null } } }).__game;
    const fire = (type: string): void => {
      const e = new KeyboardEvent(type, { key, code: key, bubbles: true, cancelable: true });
      Object.defineProperty(e, 'keyCode', { get: () => code });
      window.dispatchEvent(e);
    };
    const neg = key === 'ArrowLeft' || key === 'ArrowUp';
    const done = (): boolean => g.probe.nearObject === 'npc.elise' || (neg ? g.probe[axis] <= target + lead : g.probe[axis] >= target - lead);
    const start = performance.now();
    const tick = (): void => {
      if (done() || performance.now() - start > 8_000) { fire('keyup'); settle(); } else requestAnimationFrame(tick);
    };
    // keyup доходить до сцени через кілька кадрів (при ~6 fps — 150–300 мс), а персонаж ще їде: міряємо проскок лише коли
    // позиція простояла ~700 мс (раніше було waitForTimeout(100) — менше одного кадру, lead вчився з недобору й не збігався).
    const settle = (): void => {
      let last = g.probe[axis];
      let since = performance.now();
      const watch = (): void => {
        const now = performance.now();
        if (g.probe[axis] !== last) { last = g.probe[axis]; since = now; }
        if (now - since > 700 || now - start > 12_000) resolve(); else requestAnimationFrame(watch);
      };
      requestAnimationFrame(watch);
    };
    fire('keydown');
    requestAnimationFrame(tick);
  }), { code: KEY_CODE[key], key, axis, target, lead });
}
async function walkToElise(page: Page): Promise<void> {
  const map = JSON.parse(readFileSync('public/maps/camp-lake.tmj', 'utf8')) as { layers: { objects?: { name: string; x: number; y: number }[] }[] };
  const o = map.layers.flatMap((l) => l.objects ?? []).find((n) => n.name === 'npc.elise');
  expect({ x: o?.x, y: o?.y }, 'Еліза на мапі зсунулась — онови ELISE').toEqual(ELISE);
  // Довертаємо за координатою по обох осях: X до ±16 px, потім Y до точки Елізи (зона дії Ø 96 px).
  const trail: string[] = [];   // шлях у тексті падіння: CI червонів без даних, локально (і при CPU ×8) зелений
  // Випередження (CI PR #53, шлях 48↔101 навколо x=80 при 0,7–7 fps): keyup доходить до сцени через кілька кадрів, і персонаж
  // проскакує ще ~50 px. Відпускаємо клавішу за `lead` px до цілі; lead вчиться з власного проскоку на кожній осі.
  const lead = { playerX: 0, playerY: 0 };
  for (let i = 0; i < 10 && (await probe(page)).nearObject !== 'npc.elise'; i++) {
    const p = await probe(page);
    trail.push(`${Math.round(p.playerX)},${Math.round(p.playerY)}@${p.fps.toFixed(1)}fps`);
    // Допуск по X — 32 px: при x ± 32 хорда зони Ø 96 по Y ≈ 71 px, більше за проскок ~53 px на CI; ±16 при кроці ~53 px
    // недосяжне (шлях 48↔101 вище).
    const axis = Math.abs(p.playerX - ELISE.x) > 32 ? 'playerX' : 'playerY';
    const target = axis === 'playerX' ? ELISE.x : ELISE.y;
    const neg = p[axis] > target;
    await walkInPage(page, axis === 'playerX' ? (neg ? 'ArrowLeft' : 'ArrowRight') : (neg ? 'ArrowUp' : 'ArrowDown'), axis, target, lead[axis]);
    const after = (await probe(page))[axis];
    const overshoot = neg ? target - after : after - target;   // > 0 — проскочили ціль
    lead[axis] = Math.min(80, Math.max(0, lead[axis] + overshoot));
  }
  const last = await probe(page);
  expect(last.nearObject, `шлях до Елізи: ${trail.join(' → ')} → ${Math.round(last.playerX)},${Math.round(last.playerY)}`).toBe('npc.elise');
}

test.describe('Еліза на мапі (клавіатура)', () => {
  test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });
  test.setTimeout(120_000);   // ходьба на CI при 0,7–7 fps: keyup доходить до сцени за сотні мс, довертань кілька

  test('у кемпінгу: дійти пішки, натиснути дію — відкривається розмова з нею', async ({ page }) => {
    await open(page);
    await panel(page).locator('[data-act="create"]', { hasText: 'Велосипед' }).first().click();
    await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії
    for (const [k, key] of [['complete', 'q.prologue-home-001'], ['complete', 'q.st-001'], ['complete', 'q.st-002'], ['visit', 'loc.shop'],
      ['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'], ['checkout', 'basket.all'], ['complete', 'q.st-003'], ['visit', 'loc.home'], ['complete', 'q.ch1-home-001'], ['visit', 'loc.road'], ['complete', 'q.st-004'], ['visit', 'loc.camp.lake']] as const) await act(page, k, key);
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
