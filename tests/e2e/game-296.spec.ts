// GAME-296 · розділ 2 у живій мапі-першій грі: від «Продовжити подорож» до тихого водоспаду ЛИШЕ ДОТИКАМИ (☰ — дотик; ходьба — клавіатурою відсутня на телефоні, тож герой веде стрілку «Далі»).
// Стан — справжній кінець розділу 1 (tests/e2e/fixtures/ch1-end.json). Шлях: ☰ «Лягти спати» → тизер → ☰ «Продовжити подорож» → авто (дім → дорога → Мюллерталь) → господиня → вказівник стежки (поїздка туди й назад)
// → вечеря → сон → підсумок «день 1» → план дня 2 (табличка, вибір) → вставка на стежці → авто «Як проведемо день?» → «Піти до водоспаду» (туди й назад) → водоспад зараховано.
// Рахуємо ВУЗЛИ розмов, а не кліки: на CI дотик під час зміни рамки буває холостим. Обидві орієнтації. Знімки для PR: GAME_SHOTS=1 → research/game-296/*.png (не на критичному шляху).
// Негативний контроль (закон 1): ?breakSpot=obj.vehicle — авто німе, і той самий шлях зупиняється біля першої поїздки.
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { answerOne, core, goAndDo, probe, skipClockToEvening, talk } from './chapter-driver';
import { waitGameReady } from './ready';

const VIEWS = [{ side: 'portrait', w: 390, h: 844 }, { side: 'landscape', w: 932, h: 430 }] as const;
const SETTINGS_KEY = 'camplife.settings.v1';
const SHOTS = process.env.GAME_SHOTS === '1' ? 'research/game-296' : '';
/** Відповіді рамки вибору, які гравець дає за підказкою: куди їдемо й що вирішуємо. Решта (напр. дім) — не для цього шляху. */
const WANT: readonly string[] = ['loc.road', 'loc.camp.mullerthal', 'loc.trail.official', 'q.ch2-d2-activity-001.waterfall'];
const QUEST = (c: { game: { quests: Record<string, { status: string }> } }, q: string): string | undefined => c.game.quests[q]?.status;

async function open(page: Page, extra = ''): Promise<void> {
  const save = readFileSync(new URL('./fixtures/ch1-end.json', import.meta.url), 'utf8').trim();
  await page.addInitScript(([k]) => { try { localStorage.setItem(k as string, JSON.stringify({ textScale: 100, language: 'uk', hintSeen: true })); } catch { /* сховища немає */ } }, [SETTINGS_KEY] as const);
  await page.goto('/?seed=7');
  await waitGameReady(page);
  await page.evaluate((json) => new Promise<void>((resolve, reject) => {
    const req = indexedDB.open('camplife', 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => { const tx = req.result.transaction('saves', 'readwrite'); tx.objectStore('saves').put(json, 'main'); tx.oncomplete = () => { req.result.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
  }), save);
  await page.goto(`/?seed=7&mapFirst=1${extra}`);
  await waitGameReady(page);
  await page.locator('[data-ui="recovery-close"]').click({ timeout: 800 }).catch(() => undefined);
  expect((await core(page)).game.quests['CH1-D3-HOME-001']?.status, 'сейв кінця розділу 1').toBe('completed');
}

async function openPanel(page: Page): Promise<void> {
  if (await page.locator('[data-ui="story"]').isVisible().catch(() => false)) return;
  await page.locator('[data-touch="story"]').tap();
  await expect(page.locator('[data-ui="story"]')).toBeVisible();
  await page.waitForTimeout(600);   // «глухота» кнопок дій після відкриття (ACT_COOLDOWN_MS)
}
const act = (page: Page, a: string) => page.locator(`[data-ui="story"] [data-act="${a}"]`);
const hudDay = async (page: Page): Promise<number> => Number(/День (\d+)/.exec(await page.locator('[data-ui="hud-time"]').innerText())?.[1] ?? NaN);
/** «Далі:» мапи-першої гри — поточний пункт нотатника (data-current); ціль розділу — у ☰ «Цілі» (unit-тест goalOf), у HUD її замінює нотатник (як у розділі 1). */
const hint = (page: Page): Promise<string> => page.locator('[data-ui="agenda-item"][data-current="yes"]').first().innerText();

/** Читає розмову до кінця й рахує ВУЗЛИ за сценою: у вузлі вибору `fork` — гілка `pick`, у решті — перша відповідь. */
async function readScene(page: Page, nodes: Map<string, string[]>, forkPick: number): Promise<void> {
  for (let clicks = 0; clicks < 60; clicks++) {
    const d = (await core(page)).game.dialogue as { id: string; node: string } | null;
    if (d === null) return;
    const seen = nodes.get(d.id) ?? [];
    if (seen[seen.length - 1] !== d.node) seen.push(d.node);
    nodes.set(d.id, seen);
    const box = talk(page);
    if (await box.count() === 0) { await page.waitForTimeout(300); continue; }
    const acts = box.locator('[data-act]');
    if (await acts.count() === 0) { await page.waitForTimeout(300); continue; }
    await acts.nth(d.node === 'fork' ? Math.min(forkPick, (await acts.count()) - 1) : 0).click({ timeout: 5_000 }).catch(() => undefined);
    await page.waitForTimeout(450);   // «глухота» рамки ~350 мс після відповіді
  }
  throw new Error('розмова не закривається за 60 дотиків');
}

/** Рамка вибору («Куди їдемо?» / «Як проведемо день?»): відповідь із WANT; повертає її ключ і текст запитання. */
async function chooseTrip(page: Page, trips: string[]): Promise<void> {
  const box = talk(page);
  const acts = await box.locator('[data-act]').evaluateAll((els) => els.map((e) => ({ act: e.getAttribute('data-act') ?? '', key: e.getAttribute('data-key') ?? '' })));
  const idx = acts.findIndex((a) => a.act !== 'cancel' && WANT.includes(a.key));
  if (idx < 0) throw new Error(`у рамці вибору немає потрібної відповіді: ${JSON.stringify(acts)}`);
  const d = (await core(page)).game.player?.locationId;
  trips.push(`${d}→${acts[idx]?.key}`);
  await box.locator('[data-act]').nth(idx).click({ timeout: 5_000 });
  await page.waitForTimeout(450);
}

/**
 * Гравець грає, поки `stop` не стане правдою. Лише дотики: ☰ (сон, «Продовжити»), рамка розмови/вибору, дія біля об'єкта (кнопка дії) і ходьба до цілі зі стрілки.
 * Стрілки нема (вільний час, сон) — це стан, а не об'єкт: до вечора перемотуємо годинник (?skipMinutes, тест не про час), спати — ☰.
 */
async function play(page: Page, stop: (c: Awaited<ReturnType<typeof core>>) => boolean, log: string[], nodes: Map<string, string[]>, trips: string[], forkPick: number, shot?: (tag: string) => Promise<void>): Promise<void> {
  for (let i = 0; i < 90; i++) {
    const c = await core(page);
    if (stop(c)) return;
    if (await page.locator('[data-ui="summary-continue"]').count()) { await page.locator('[data-ui="summary-continue"]').click(); log.push('summary'); await page.waitForTimeout(500); continue; }
    if (c.game.dialogue !== null) { await readScene(page, nodes, forkPick); log.push('scene'); continue; }
    if (await talk(page).count()) {
      const cancel = await talk(page).locator('[data-act="cancel"]').count();
      if (cancel > 0) {
        if (shot) await shot(`trip-${trips.length}`);
        await chooseTrip(page, trips);
        log.push('trip');
      } else log.push(await answerOne(page));
      continue;
    }
    const target = (await probe(page)).fx.target;
    if (target === null) {
      // вільний час / сон: день 1 до 18:00 — чекаємо вечора; далі (вечерю зіграно, день-квест завершено) — ☰ «Лягти спати»
      if (QUEST(c, 'CH2-D1-SUMMARY-001') === 'active') { await skipClockToEvening(page); log.push('wait-evening'); continue; }
      await openPanel(page);
      await act(page, 'sleep').click({ timeout: 5_000 });
      log.push('sleep');
      await page.waitForTimeout(800);
      continue;
    }
    log.push(await goAndDo(page, true));
  }
  throw new Error(`не дійшли за 90 кроків: ${log.slice(-14).join(' → ')}`);
}

for (const v of VIEWS) {
  test(`${v.side}: «Продовжити подорож» → … → тихий водоспад лише дотиками`, async ({ browser }) => {
    test.setTimeout(240_000);
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    if (SHOTS) mkdirSync(SHOTS, { recursive: true });
    const shot = async (tag: string): Promise<void> => { if (SHOTS) { await page.waitForTimeout(700); await page.screenshot({ path: `${SHOTS}/${tag}-${v.side}.png` }); } };
    await open(page);
    // 1) сон кінця розділу 1 → тизер → ☰ «Продовжити подорож» → CH2-ARRIVAL-001
    await openPanel(page);
    await act(page, 'sleep').click();
    await expect(page.locator('[data-ui="episode"]'), 'після сну — тизер розділу 2').toBeVisible({ timeout: 15_000 });
    await page.locator('[data-ui="episode-skip"]').click();
    await expect(page.locator('[data-ui="pause"]')).toBeVisible();
    await page.locator('[data-ui="resume"]').click();
    await openPanel(page);
    await act(page, 'chapter').click();
    await expect.poll(async () => QUEST(await core(page), 'CH2-ARRIVAL-001'), { timeout: 5_000 }).toBe('active');
    await page.locator('[data-ui="story-close"]').click({ timeout: 3_000 }).catch(() => undefined);
    // «Далі» розділу 2 в нотатнику й день: «День 1» (а не сирий день гри)
    await expect.poll(() => hint(page), { timeout: 8_000, message: '«Далі» розділу 2: авто до Мюллерталя' }).toContain('Мюллерталь');
    expect(await hudDay(page), 'HUD: день розділу, а не сирий день гри').toBe(1);
    await shot('start');

    const log: string[] = [];
    const nodes = new Map<string, string[]>();
    const trips: string[] = [];
    // 2) день 1: авто (дім → дорога → Мюллерталь), господиня, вказівник стежки (туди й назад), вечеря, сон
    await play(page, (c) => QUEST(c, 'CH2-D1-WALK-001') === 'active', log, nodes, trips, 0);
    expect(trips, 'авто двічі: дім → дорога → кемпінг').toEqual(['loc.home→loc.road', 'loc.road→loc.camp.mullerthal']);
    expect((await core(page)).game.player?.locationId).toBe('loc.camp.mullerthal');
    await expect.poll(async () => (await probe(page)).map, { timeout: 15_000 }).toBe('mullerthal');
    expect([...nodes.keys()], 'розмова з господинею була (події в дорозі, що випадають по дорозі, — не рахуємо)').toContain('dlg.host-mullerthal');
    expect([...nodes.keys()].filter((k) => k.startsWith('dlg.ch2-')), 'сцен розділу 2 ще не було').toEqual([]);
    await expect.poll(() => hint(page), { message: '«Далі»: вказівник стежки' }).toContain('вказівник стежки');
    await shot('walk');
    await play(page, (c) => QUEST(c, 'CH2-D1-SUMMARY-001') === 'active', log, nodes, trips, 0, shot);
    expect(trips.at(-1), 'вказівник стежки: поїздка на офіційну стежку (туди й назад в одній відповіді)').toBe('loc.camp.mullerthal→loc.trail.official');
    expect((await core(page)).game.player?.locationId, 'після прогулянки — знову в кемпінгу, а не на мапі табору біля озера').toBe('loc.camp.mullerthal');
    expect((await probe(page)).map).toBe('mullerthal');
    expect(await hudDay(page)).toBe(1);
    // вечеря → день-квест завершується сам → ☰ «Лягти спати» (сон кінця розділу 1 — 3-й, цей — 4-й) → підсумок → ранок дня 2
    await play(page, (c) => QUEST(c, 'CH2-D2-PLAN-001') === 'active' && ((c.game as unknown as { slept?: number }).slept ?? 0) >= 4, log, nodes, trips, 0);
    const day1Nodes = nodes.get('dlg.ch2-dinner')?.length ?? 0;
    expect(day1Nodes, `вечеря — 12 вузлів (${nodes.get('dlg.ch2-dinner')?.join(' → ')})`).toBe(12);
    // підсумок «день 1» → HUD нового дня «День 2» (рівно +1 від підсумку)
    const summary = page.locator('[data-ui="summary"]');
    await expect(summary).toBeVisible({ timeout: 15_000 });
    await expect(summary, 'підсумок вчорашнього дня розділу — «день 1»').toHaveAttribute('data-day', '1');
    await expect(summary.locator('h2')).toHaveText('Підсумок дня 1');
    await shot('summary');
    await page.locator('[data-ui="summary-continue"]').click();
    await expect(summary).toHaveCount(0);
    expect(await hudDay(page), 'HUD ранку дня 2 = підсумок + 1 (а не сирий «День 4»)').toBe(2);
    await expect.poll(() => hint(page), { message: '«Далі» дня 2: табличка стежки' }).toContain('після зсуву');
    // 3) день 2: табличка → вибір (забута стежка) → вставка → «Як проведемо день?» → «Куди вирушаємо?» → водоспад
    await play(page, (c) => QUEST(c, 'CH2-D2-WATERFALL-001') === 'completed', log, nodes, trips, 0, shot);
    const c = await core(page);
    expect(c.game.quests['CH2-D2-ACTIVITY-001']?.status).toBe('completed');
    expect(c.game.quests['CH2-D2-EVENING-001']?.status, 'після водоспаду — вечір дня 2').toBe('active');
    expect(trips.slice(-1), 'авто: рамка «Як проведемо день?» — відповідь «Піти до водоспаду» їде туди й назад').toEqual(['loc.camp.mullerthal→q.ch2-d2-activity-001.waterfall']);
    expect(c.game.player?.locationId, 'поїздка туди й назад: знову в кемпінгу').toBe('loc.camp.mullerthal');
    expect(c.journal.filter((e) => e.type === 'Visit').length, 'візити поїздки записані ядром').toBeGreaterThanOrEqual(4);
    // вузли сцен: план (7), вставка (6), вечеря (12)
    expect(nodes.get('dlg.ch2-plan'), `план — 7 вузлів (${nodes.get('dlg.ch2-plan')?.join(' → ')})`).toHaveLength(7);
    expect(nodes.get('dlg.ch2-trail-forgotten'), `вставка — 6 вузлів (${nodes.get('dlg.ch2-trail-forgotten')?.join(' → ')})`).toHaveLength(6);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'без горизонтальної прокрутки').toBe(true);
    await shot('waterfall-done');
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

test('негативний контроль: німе авто (?breakSpot=obj.vehicle) — з дому нікуди не поїхати, той самий шлях зупиняється', async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await open(page, '&breakSpot=obj.vehicle');
  await openPanel(page);
  await act(page, 'sleep').click();
  await expect(page.locator('[data-ui="episode"]')).toBeVisible({ timeout: 15_000 });
  await page.locator('[data-ui="episode-skip"]').click();
  await page.locator('[data-ui="resume"]').click();
  await openPanel(page);
  await act(page, 'chapter').click();
  await expect.poll(async () => QUEST(await core(page), 'CH2-ARRIVAL-001'), { timeout: 5_000 }).toBe('active');
  await page.locator('[data-ui="story-close"]').click({ timeout: 3_000 }).catch(() => undefined);
  const log: string[] = [];
  await expect(play(page, (c) => c.game.player?.locationId === 'loc.road', log, new Map(), [], 0)).rejects.toThrow();
  expect((await core(page)).game.player?.locationId, 'авто німе — лишились вдома').toBe('loc.home');
  await ctx.close();
});
