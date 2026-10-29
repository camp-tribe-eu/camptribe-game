// GAME-183 · табір без ☰: від приїзду до кінця табірного сюжету (дні 1–3) — лише ходьба, кнопка дії біля об'єкта й відповіді в рамці розмови / рамці вибору. Панель ☰ жодного разу не з'явилась.
// Дорога до табору (екран подорожі, дім, крамниця, дорога — не цей зріз) проходиться кнопками в звичайній збірці e2e; далі сторінка перезавантажується з ?mapFirst=1 (справжня поведінка,
// автозбереження підхоплює табір) — і від цієї миті спостерігач DOM фіксує будь-яку появу панелі ☰ (.ui-story). Обидві орієнтації телефона: 390×844 і 844×390.
// Негативні контролі (закон 1): ?breakSpot=step.ST-005 — крок мапою не робиться (прохід мусить застрягти); спостерігач справді бачить панель, коли її відкрити.
import { expect, test, type Page } from '@playwright/test';
import { answerOne, core, goAndDo, installMenuObserver, menuSeen as menuOf, playUntil, probe, route, talk, walk } from './chapter-driver';

const CAMP = 'loc.camp.lake';
const SETTINGS_KEY = 'camplife.settings.v1';
const VIEWS = [{ name: 'портрет', side: 'portrait', w: 390, h: 844 }, { name: 'ландшафт', side: 'landscape', w: 844, h: 390 }] as const;

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
/** Нова гра (соло, велосипед) → приїзд у табір (ST-005 активний) → автозбереження → перезавантаження з ?mapFirst=1: справжня гра, табір. */
async function arriveInCamp(page: Page, extra = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(([k]) => { try { localStorage.setItem(k as string, JSON.stringify({ textScale: 100, language: 'uk', hintSeen: true })); } catch { /* сховища немає */ } }, [SETTINGS_KEY] as const);
  await page.goto('/?seed=7');
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { saveLoaded: boolean } } }).__game?.probe.saveLoaded === true, null, { timeout: 30_000 });
  await page.locator('[data-touch="story"]').click();
  await panel(page).locator('[data-act="create"]', { hasText: /Велосипед|Bike/ }).first().click();
  await page.waitForTimeout(400);
  for (const [k, key] of [['complete', 'q.prologue-home-001'], ['complete', 'q.st-001'], ['complete', 'q.st-002'], ['visit', 'loc.shop'], ['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'], ['complete', 'q.st-003'],
    ['visit', 'loc.home'], ['complete', 'q.ch1-home-001'], ['visit', 'loc.road'], ['complete', 'q.st-004'], ['visit', 'loc.camp.lake']] as const) await act(page, k, key);
  expect((await core(page)).game.player?.locationId).toBe(CAMP);
  await page.waitForTimeout(600);   // автозбереження — на кожну команду
  await installMenuObserver(page);
  await page.goto(`/?seed=7&mapFirst=1${extra}`);
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { saveLoaded: boolean } } }).__game?.probe.saveLoaded === true, null, { timeout: 30_000 });
  await page.locator('[data-ui="recovery-close"]').click({ timeout: 800 }).catch(() => undefined);
  expect((await core(page)).game.player?.locationId, 'сейв підхопився: гравець у таборі').toBe(CAMP);
  return errors;
}
const menuSeen = menuOf;

const DONE = ['ST-005', 'CH1-D2-001', 'CH1-D2-ELISE-001', 'CH1-D2-CAMP-001', 'CH1-D2-FIRE-001', 'CH1-D3-001', 'CH1-D3-GEAR-001', 'CH1-D3-ELISE-001'];

for (const v of VIEWS) {
  test(`табір → дорога → дім до кінця розділу без ☰: лише ходьба, дія біля об'єкта й рамки — ${v.name}`, async ({ browser }) => {
    test.setTimeout(1_500_000);
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errors = await arriveInCamp(page);
    // Кадр: ціль («Ціль: …») і стрілка «Далі» на мапі табору (картка PR).
    await expect(page.locator('[data-ui="goal"]')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-ui="next-hint"]')).toBeVisible();
    await expect.poll(async () => (await probe(page)).fx.guide, { timeout: 15_000 }).not.toBe('none');
    await page.screenshot({ path: `research/visual-audit/camp-goal-arrow-${v.side}.png` });
    const log: string[] = [];
    // Табір → дорога додому → дім: до кінця розділу (кінцевий квест — «Знову вдома» вдома).
    await playUntil(page, v.side === 'landscape', log, (c) => c.game.campaignEnded, () => menuSeen(page), 200);
    const c = await core(page);
    expect(c.game.player?.locationId, 'розділ закінчився вдома').toBe('loc.home');
    for (const q of [...DONE, 'CH1-D3-RETURN-001', 'CH1-D3-HOME-001']) expect(c.game.quests[q]?.status, `${q} завершено ногами`).toBe('completed');
    expect(await menuSeen(page), `панель ☰ ні разу не відкривалась (кроки: ${log.join(' → ')})`).toEqual([]);
    expect(log.some((s) => s.startsWith('choice:')), 'авто спитало «Куди їдемо?» у рамці вибору').toBe(true);
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

test.describe('негативні контролі (закон 1)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('?breakSpot=step.ST-005 — крок мапою не робиться: розділ застряг на ST-005 (перевірка «пройдено ногами» тут червоніє)', async ({ page }) => {
    test.setTimeout(300_000);
    await arriveInCamp(page, '&breakSpot=step.ST-005');
    const log: string[] = [];
    for (let i = 0; i < 12; i++) {
      if ((await core(page)).game.quests['ST-005']?.status !== 'active') break;
      if (await talk(page).count()) { log.push(await answerOne(page)); continue; }
      try { log.push(await goAndDo(page, false)); } catch { break; }
    }
    expect((await core(page)).game.quests['ST-005']?.status, 'німий об\'єкт кроку: ST-005 не завершився').toBe('active');
    expect(await menuSeen(page)).toEqual([]);   // ☰ не відкривали навіть тут: застрягти — не привід лізти в меню
  });

  test('спостерігач ☰ вміє червоніти: відкрита панель — запис «panel»; а в таборі панель не пропонує жодного кроку сюжету', async ({ page }) => {
    test.setTimeout(240_000);
    await arriveInCamp(page);
    expect(await menuSeen(page)).toEqual([]);
    await page.locator('[data-touch="story"]').click();
    await expect(panel(page)).toBeVisible();
    expect(await menuSeen(page)).toContain('panel');
    // ☰ у таборі: ні «Завершити», ні «Піти», ні «Узяти», ні «Висушити», ні «Продати»; лишаються журнал, Атлас і «Закрити».
    for (const kind of ['complete', 'visit', 'pickup', 'dry', 'sell', 'decline', 'talk', 'task']) await expect(panel(page).locator(`[data-act="${kind}"]`), `у ☰ табору є кнопка «${kind}»`).toHaveCount(0);
    await expect(panel(page).locator('[data-ui="atlas-open"]')).toBeVisible();
    await expect(panel(page).locator('[data-ui="journal"]')).toBeVisible();
    await expect(panel(page).locator('[data-ui="story-close"]')).toBeVisible();
  });

  test('авто на стоянці табору: рамка «Куди їдемо?» з напрямками й «Не зараз»; Escape скасовує, не відкриваючи ☰', async ({ page }) => {
    test.setTimeout(300_000);
    await arriveInCamp(page);
    // Рухаємось ногами до стоянки: ціль стрілки — не авто (там ST-005), тож ведемо героя до об'єкта вручну, як гравець.
    for (let t = 0; t < 3; t++) { const q = await probe(page); await walk(page, route('camp-lake', [q.playerX, q.playerY], 'obj.vehicle')); if (await talk(page).count()) break; await page.waitForTimeout(1500); if (await talk(page).count()) break; }
    await expect(talk(page)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.ui-talk [data-ui="line"]')).toHaveText('Куди їдемо?');
    expect(await talk(page).locator('[data-act="visit"]').count(), 'є напрямки').toBeGreaterThanOrEqual(2);
    await expect(talk(page).locator('[data-act="cancel"]')).toHaveText('Не зараз');
    await page.keyboard.press('Escape');
    await expect(talk(page)).toHaveCount(0);
    expect((await core(page)).game.player?.locationId, 'Escape — «не зараз»: лишились у таборі').toBe(CAMP);
    expect(await menuSeen(page)).toEqual([]);
  });
});
