// GAME-332 · «Багажник» у ЗВИЧАЙНІЙ грі: дім → усі речі з контейнерів у сумку → біля авто відкривається міні-гра → розкладка ДОТИКАМИ (лоток → клітинка) → «Готово» → «Куди їдемо?» → дорога.
// Обидві орієнтації: 390×844 (велосипедист, 14 речей, сітка 5×3) і 932×430 (родина з кішкою й авто, 17 речей, сітка 6×3).
// Доводить: усе не влізло, гравець лишив непотрібне → прапорці f.left-*; потрібне спаковано; результат good записано в стан; шлях до дороги не заблоковано.
// НЕГАТИВНИЙ КОНТРОЛЬ (закон 1): «Їдемо як є» (пауза → далі без цього) — результат scrappy, нічого не лишено вдома, і гра йде далі; розкладка з перепутаним порядком (двері) не лягає.
// Знімки — лише за GAME332_SHOTS=1 (research/game-332/).
import { expect, test, type Page } from '@playwright/test';
import { walkIntro } from './intro-walk';
import { core, goAndDo, installMenuObserver, loaded, menuSeen, playUntil, pressInteract, probe, route, takeFromOpenBox, walk } from './chapter-driver';

const SETTINGS_KEY = 'camplife.settings.v1';
const SHOTS = 'research/game-332';
const SHOOT = process.env.GAME332_SHOTS === '1';
const SOLO = ['box.nightstand', 'box.wardrobe', 'box.fridge', 'box.storeroom'];
const FAMILY = [...SOLO, 'box.mia'];
type Step = readonly [id: string, r: number, c: number];
/** Ідеальні розкладки потрібного в порядку «глибоке першим» (знайдено пошуком у trunk.test.ts, там же доведено, що вони good). */
const SOLO_BIKE: readonly Step[] = [['simple-dinner', 1, 0], ['tent', 1, 1], ['water', 2, 3], ['documents', 1, 3], ['wallet', 1, 4], ['sleeping-bag', 0, 0], ['lantern', 0, 2]];
const FAMILY_CAR: readonly Step[] = [['simple-dinner', 2, 1], ['mia-bowl-food', 1, 0], ['documents', 1, 1], ['tent', 1, 2], ['water', 2, 4], ['mia-carrier', 1, 4], ['wallet', 0, 0], ['sleeping-bag', 0, 1], ['lantern', 0, 3]];

async function startHome(page: Page, solo: boolean, touch: boolean): Promise<void> {
  await page.addInitScript(([k]) => { try { localStorage.setItem(k as string, JSON.stringify({ textScale: 100, language: 'uk', hintSeen: true })); } catch { /* сховища немає */ } }, [SETTINGS_KEY] as const);
  await installMenuObserver(page);
  await page.goto(`/?seed=7&mapFirst=1&intro=1${solo ? '&soloHero=1' : ''}`);
  await loaded(page);
  await walkIntro(page, solo ? /Велосипед|Bike/ : /Кішка|Cat/);
  await playUntil(page, touch, [], (c) => c.game.quests['CH1-HOME-001']?.status === 'active' && c.game.player?.locationId === 'loc.home', () => menuSeen(page), 80);
}

/** Узяти УСЕ з усіх контейнерів (як жадібний гравець): речей більше, ніж влізе. */
async function takeEverything(page: Page, boxes: readonly string[], touch: boolean): Promise<void> {
  for (const spot of boxes) {
    const at = await probe(page);
    await walk(page, route('home', [at.playerX, at.playerY], spot));
    await expect.poll(async () => (await probe(page)).nearObject, { timeout: 5_000, message: `біля ${spot}` }).toBe(spot);
    await pressInteract(page, touch);
    await takeFromOpenBox(page, touch, 'all');
  }
}

/** Підійти до авто з повною сумкою: відкривається «Багажник». */
async function toTrunk(page: Page): Promise<void> {
  const at = await probe(page);
  await walk(page, route('home', [at.playerX, at.playerY], 'obj.vehicle'));
  await expect(page.locator('[data-ui="minigame"] [data-ui="mg-start"]'), 'біля авто з сумкою відкрилась міні-гра').toBeVisible({ timeout: 10_000 });
}

/**
 * Повільна машина (CI): відкладені ефекти оболонки (Preact виконує їх «після кадру» через setTimeout) запізнюються, і наступний кадр гри встигає раніше за них.
 * Саме так після «Багажника» замість «Куди їдемо?» відкривалась ☰ (а «Не влазить» губилось). Тут це запізнення — навмисне й однакове щоразу; повертає «як було».
 */
async function slowEffects(page: Page, ms: number): Promise<() => Promise<void>> {
  await page.evaluate((ms) => {
    const w = window as unknown as { __st?: typeof setTimeout; setTimeout: unknown };
    const st = window.setTimeout.bind(window);
    w.__st = st as typeof setTimeout;
    w.setTimeout = (fn: TimerHandler, d = 0, ...a: unknown[]): number => st(fn, d + ms, ...a);
  }, ms);
  return () => page.evaluate(() => { const w = window as unknown as { __st?: typeof setTimeout; setTimeout: unknown }; if (w.__st) w.setTimeout = w.__st; });
}

async function lays(page: Page, steps: readonly Step[]): Promise<void> {
  for (const [id, r, c] of steps) {
    await page.locator(`[data-ui="trunk-item"][data-id="item.${id}"]`).tap();
    await page.locator(`[data-ui="trunk-cell"][data-r="${r}"][data-c="${c}"]`).tap();
    await expect(page.locator(`[data-ui="trunk-item"][data-id="item.${id}"]`), `${id} лягло`).toHaveAttribute('data-placed', 'yes');
  }
}

async function fitsScreen(page: Page, label: string): Promise<void> {
  const vp = page.viewportSize() as { width: number; height: number };
  for (const sel of ['[data-ui="trunk-cell"]', '[data-ui="trunk-item"]', '[data-ui="trunk-rotate"]', '[data-ui="trunk-done"]', '[data-ui="mg-pause"]']) {
    for (const el of await page.locator(sel).all()) {
      const b = await el.boundingBox();
      expect(b, `${label}: ${sel} видно`).not.toBeNull();
      const bb = b as { x: number; y: number; width: number; height: number };
      expect(bb.x, `${label}: ${sel} не лівіше`).toBeGreaterThanOrEqual(-1);
      expect(bb.y, `${label}: ${sel} не вище`).toBeGreaterThanOrEqual(-1);
      expect(bb.x + bb.width, `${label}: ${sel} не правіше`).toBeLessThanOrEqual(vp.width + 1);
      expect(bb.y + bb.height, `${label}: ${sel} не нижче (${Math.round(bb.y + bb.height)} > ${vp.height})`).toBeLessThanOrEqual(vp.height + 1);
      if (sel === '[data-ui="trunk-cell"]' || sel === '[data-ui="trunk-done"]') expect(Math.min(bb.width, bb.height), `${label}: ${sel} ≥ 40 px`).toBeGreaterThanOrEqual(40);
    }
  }
  const stage = await page.locator('.mg-stage').evaluate((e) => ({ sh: e.scrollHeight, ch: e.clientHeight }));
  expect(stage.sh, `${label}: без прокрутки поля гри`).toBeLessThanOrEqual(stage.ch + 1);
}

for (const [name, vp, solo, boxes, steps] of [
  ['portrait', { width: 390, height: 844 }, true, SOLO, SOLO_BIKE],
  ['landscape', { width: 932, height: 430 }, false, FAMILY, FAMILY_CAR],
] as const) {
  test(`спаковано дотиками в «Багажнику», лишене вдома, дорога — ${name} ${vp.width}×${vp.height}`, async ({ browser }) => {
    test.setTimeout(900_000);
    const errors: string[] = [];
    const ctx = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await startHome(page, solo, true);
    await takeEverything(page, boxes, true);
    await toTrunk(page);
    await page.locator('[data-ui="mg-start"]').tap();
    await expect(page.locator('[data-ui="mg-trunk"]')).toBeVisible();
    const total = Number(await page.locator('[data-ui="mg-trunk"]').getAttribute('data-total'));
    expect(total, 'у лотку всі взяті речі').toBe(solo ? 14 : 17);
    await fitsScreen(page, name);
    if (SHOOT) await page.screenshot({ path: `${SHOTS}/${name}-empty.png` });
    const t0 = Date.now();
    await lays(page, steps);
    const ms = Date.now() - t0;
    if (SHOOT) await page.screenshot({ path: `${SHOTS}/${name}-packed.png` });
    // Двері: спроба покласти глибоке ПІСЛЯ того, що стоїть ближче до дверей, не лягає (власний поворот правил) — телефони в ряд 1 ліворуч від намету.
    await expect(page.locator('[data-ui="mg-trunk"]')).toHaveAttribute('data-missing', '0');
    await page.locator('[data-ui="trunk-item"][data-id="item.phones"]').tap();
    await page.locator('[data-ui="trunk-cell"][data-r="1"][data-c="1"]').tap();
    await expect(page.locator('[data-ui="mg-trunk"]'), 'клітинка зайнята або шлях до дверей закритий — не лягло').toHaveAttribute('data-note', /busy|door/);
    await expect(page.locator('[data-ui="trunk-item"][data-id="item.phones"]')).toHaveAttribute('data-placed', 'no');
    await page.locator('[data-ui="trunk-done"]').tap();
    await expect(page.locator('[data-ui="mg-result"]')).toHaveAttribute('data-outcome', 'good');
    console.log(`GAME-332 ${name}: ${steps.length} речей розкладено ${steps.length * 2} дотиками за ${ms} мс (з очікуваннями Playwright)`);
    if (SHOOT) await page.screenshot({ path: `${SHOTS}/${name}-result.png` });
    await page.locator('[data-ui="mg-close"]').tap();
    // Після закриття результату авто завантажується само (LoadCar) і питає «Куди їдемо?».
    await expect.poll(async () => (await core(page)).game.flags.filter((f) => f.startsWith('f.take-')), { timeout: 10_000, message: 'сумка порожніє: усе спаковане лягло в авто' }).toEqual([]);
    const c = await core(page);
    expect(c.game.minigames?.['mg.trunk']?.last, 'результат у стані гри').toBe('good');
    expect(c.game.flags, 'лишене вдома — прапорець').toContain('f.left-snacks');
    expect(c.game.flags, 'ліхтар узято — не лишено').toContain('f.pack-lantern');
    expect(c.game.flags, 'потрібне спаковано').toContain('f.pack-tent');
    await playUntil(page, true, [], (k) => k.game.player?.locationId === 'loc.road', () => menuSeen(page), 30);
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

test('«Їдемо як є»: пауза → далі без цього — scrappy, нічого не лишено вдома, до дороги доїхали — 390×844', async ({ browser }) => {
  test.setTimeout(900_000);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await startHome(page, true, true);
  await takeEverything(page, SOLO, true);
  await toTrunk(page);
  await page.locator('[data-ui="mg-start"]').tap();
  await page.locator('[data-ui="mg-pause"]').tap();
  await page.locator('[data-ui="mg-move-on"]').tap();
  await expect(page.locator('[data-ui="mg-result"]')).toHaveAttribute('data-outcome', 'scrappy');
  const restore = await slowEffects(page, 400);   // кадр гри з LoadCar випереджає ефекти оболонки: «Не влазить» мусить відкритись і так
  await page.locator('[data-ui="mg-close"]').tap();
  const c = await core(page);
  expect(c.game.minigames?.['mg.trunk']?.last).toBe('scrappy');
  // Як раніше: 14 речей на велосипед (12 од.) — старий екран «Не влазить: що лишимо вдома?»; обираємо «можна лишити», доки він є.
  await expect(page.locator('[data-ui="pack-overflow"]'), 'старий екран «Не влазить»').toBeVisible({ timeout: 10_000 });
  await restore();
  const buttons = page.locator('[data-ui="pack-overflow"] [data-act="leave"]');
  for (let i = 0; i < 20 && (await buttons.count()) > 0; i++) { await buttons.first().click(); await page.waitForTimeout(450); }
  expect((await core(page)).game.flags.filter((f) => f.startsWith('f.take-')), 'сумка порожня: старий екран довів до кінця').toEqual([]);
  await page.keyboard.press('Escape');
  await playUntil(page, true, [], (k) => k.game.player?.locationId === 'loc.road', () => menuSeen(page), 30);
  await ctx.close();
});

// GAME-332 (нестабільність CI): усе взяте влазить → після закритого результату авто завантажується наступним кадром гри й питає «Куди їдемо?» РАМКОЮ на мапі.
// На повільній машині кадр випереджав відкладені ефекти оболонки, і замість рамки відкривалась ☰ (світ на паузі, рамки не видно — «біля obj.vehicle дія не спрацювала»).
// Закон 1: без рядка `talkRef.current = true` у Shell.onTalk цей тест червоний щоразу (а не раз на чотири прогони під навантаженням).
test('усе влізло: після «Багажника» — рамка «Куди їдемо?», а не ☰, навіть коли ефекти оболонки запізнюються — 390×844', async ({ browser }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await startHome(page, true, true);
  // Лише «потрібне», куди веде стрілка «Далі»: воно влазить на велосипед.
  for (let i = 0; i < 12 && (await probe(page)).fx.target !== 'obj.vehicle'; i++) await goAndDo(page, true);
  expect((await probe(page)).fx.target, 'потрібне зібрано: стрілка веде до авто').toBe('obj.vehicle');
  await toTrunk(page);
  await page.locator('[data-ui="mg-start"]').tap();
  await page.locator('[data-ui="mg-pause"]').tap();
  await page.locator('[data-ui="mg-move-on"]').tap();
  await expect(page.locator('[data-ui="mg-result"]')).toBeVisible();
  const restore = await slowEffects(page, 400);
  await page.locator('[data-ui="mg-close"]').tap();
  await expect.poll(async () => (await core(page)).game.flags.filter((f) => f.startsWith('f.take-')), { timeout: 10_000, message: 'сумка порожня: усе лягло в авто' }).toEqual([]);
  await expect(page.locator('.ui-talk [data-ui="dialogue"] [data-act="visit"]').first(), 'рамка «Куди їдемо?» на мапі').toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.ui-story'), '☰ не відкрилась поверх рамки').toHaveCount(0);
  expect(await menuSeen(page), '☰ ні разу не відкривалась').toEqual([]);
  await restore();
  await playUntil(page, true, [], (k) => k.game.player?.locationId === 'loc.road', () => menuSeen(page), 30);
  expect(await menuSeen(page), 'до дороги — без ☰').toEqual([]);
  expect(errors).toEqual([]);
  await ctx.close();
});
