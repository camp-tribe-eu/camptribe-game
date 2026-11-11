// GAME-304 · речі лежать у своїх місцях, а не на підлозі: продукти — в холодильнику, намет і спорядження — в коморі, документи й одяг — в шафі, гаманець і телефони — в тумбі,
// речі Мії — у її скриньці. Дотик до контейнера відкриває вікно «всередині» (крупний план полиць), де річ беруть і закривають. Доводить:
//  1) УСІ речі зі списку пакування зібрано ДОТИКОМ через контейнери — обидві орієнтації (390×844 і 932×430); на мапі немає жодного об'єкта `pack.*` (нічого не лежить на підлозі);
//  2) вікно коректне: нічого не вилазить, нічого не налазить одне на одне, текст вміщається, прокрутки нема (перевірка геометрією на КОЖНОМУ контейнері);
//  3) час: збирання всього в ігрових хвилинах не більше за старий (речі по підлозі) + 2 хв на річ (старі числа заміряні на main до цієї картки: портрет 60, ландшафт 56 хв на 14 речей);
//  4) клавіатура: E відкриває, стрілки ходять по полицях, Enter бере, Escape закриває;
//  5) НЕГАТИВНИЙ КОНТРОЛЬ (закон 1): німий контейнер (?breakSpot=box.fridge — лише збірка e2e) не відкривається, тож збір не вдається, і «зелене» тут червоніє.
// Знімки вікон усіх контейнерів у обох орієнтаціях — лише за GAME304_SHOTS=1 (research/game-304/): не на критичному шляху тесту.
import { expect, test, type Page } from '@playwright/test';
import { walkIntro } from './intro-walk';
import { closeBox, core, installMenuObserver, loaded, menuSeen, playUntil, pressInteract, probe, route, walk } from './chapter-driver';

const SETTINGS_KEY = 'camplife.settings.v1';
const SHOTS = 'research/game-304';
const SHOOT = process.env.GAME304_SHOTS === '1';
/** Ігрові хвилини, за які старий дім (17 об'єктів-речей на підлозі) віддавав усі 14 речей велосипедисту: заміряно на main (origin/main 6af9ecf) тим самим ходом, 11.11.2026. */
const OLD_MINUTES = { portrait: 60, landscape: 56 } as const;
const PER_ITEM_MIN = 2;

const SOLO = ['box.nightstand', 'box.wardrobe', 'box.fridge', 'box.storeroom'];   // велосипедист без кішки: 14 речей
const FAMILY = [...SOLO, 'box.mia'];                                              // родина з кішкою і авто: 17 речей

async function startHome(page: Page, solo: boolean, touch: boolean, query = ''): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(([k]) => { try { localStorage.setItem(k as string, JSON.stringify({ textScale: 100, language: 'uk', hintSeen: true })); } catch { /* сховища немає */ } }, [SETTINGS_KEY] as const);
  await installMenuObserver(page);
  await page.goto(`/?seed=7&mapFirst=1&intro=1${solo ? '&soloHero=1' : ''}${query}`);
  await loaded(page);
  await walkIntro(page, solo ? /Велосипед|Bike/ : /Кішка|Cat/);   // родина з кішкою й авто — щоб у грі була й скринька Мії (17 речей)
  await playUntil(page, touch, [], (c) => c.game.quests['CH1-HOME-001']?.status === 'active' && c.game.player?.locationId === 'loc.home', () => menuSeen(page), 80);
  expect(errors).toEqual([]);
}

/** Підійти до контейнера й торкнутись (тап по кнопці дії): вікно «всередині» мусить відкритись. Падає, коли контейнер німий. */
async function openBox(page: Page, spot: string, touch = true, tag = ''): Promise<void> {
  const at = await probe(page);
  await walk(page, route('home', [at.playerX, at.playerY], spot));
  await expect.poll(async () => (await probe(page)).nearObject, { timeout: 5_000, message: `біля ${spot}` }).toBe(spot);
  if (SHOOT && tag !== '') await page.screenshot({ path: `${SHOTS}/world-${spot.slice(4)}-${tag}.png` });   // герой перед контейнером на мапі
  await pressInteract(page, touch);
  await expect(page.locator('[data-ui="box-panel"]'), `${spot}: вікно «всередині» відкрилось`).toBeVisible({ timeout: 5_000 });
}

type Box = { x: number; y: number; width: number; height: number };
const meets = (a: Box, b: Box): boolean => a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;

/** Вікно виглядає правильно: усе в межах екрана, без прокрутки, нічого не налазить, текст речей не обрізано, цілі дотику ≥ 44 px. */
async function looksRight(page: Page, label: string): Promise<void> {
  const vp = page.viewportSize() as { width: number; height: number };
  const panel = page.locator('[data-ui="box-panel"]');
  const dims = await panel.evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight, sw: el.scrollWidth, cw: el.clientWidth }));
  expect(dims.sh, `${label}: вікно без вертикальної прокрутки (${dims.sh} > ${dims.ch})`).toBeLessThanOrEqual(dims.ch + 1);
  expect(dims.sw, `${label}: вікно без горизонтальної прокрутки`).toBeLessThanOrEqual(dims.cw + 1);
  const parts: [string, Box][] = [];
  for (const sel of ['.ui-box-head', '[data-ui="box-hint"]', '[data-ui="box-inside"]', '[data-ui="box-card"]', '[data-ui="box-done"]']) {
    const l = panel.locator(sel);
    if ((await l.count()) === 0 || !(await l.first().isVisible())) continue;
    const b = await l.first().boundingBox();
    if (b) parts.push([sel, b]);
  }
  for (const [n, b] of parts) {
    expect(b.x, `${label}: ${n} не лівіше екрана`).toBeGreaterThanOrEqual(-1);
    expect(b.y, `${label}: ${n} не вище екрана`).toBeGreaterThanOrEqual(-1);
    expect(b.x + b.width, `${label}: ${n} не правіше екрана`).toBeLessThanOrEqual(vp.width + 1);
    expect(b.y + b.height, `${label}: ${n} не нижче екрана`).toBeLessThanOrEqual(vp.height + 1);
  }
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) expect(meets((parts[i] as [string, Box])[1], (parts[j] as [string, Box])[1]), `${label}: ${(parts[i] as [string, Box])[0]} не налазить на ${(parts[j] as [string, Box])[0]}`).toBe(false);
  // Речі: усередині «шафи», одна від одної окремо, назва не обрізана, ціль дотику ≥ 44 px.
  const inside = (await panel.locator('[data-ui="box-inside"]').boundingBox()) as Box;
  const slots = await panel.locator('[data-ui="box-slot"]').all();
  const boxes: Box[] = [];
  for (const s of slots) {
    const b = (await s.boundingBox()) as Box;
    expect(b.x >= inside.x - 1 && b.x + b.width <= inside.x + inside.width + 1 && b.y >= inside.y - 1 && b.y + b.height <= inside.y + inside.height + 1, `${label}: річ усередині контейнера`).toBe(true);
    expect(b.height, `${label}: ціль дотику ≥ 44 px`).toBeGreaterThanOrEqual(44);
    boxes.push(b);
  }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(meets(boxes[i] as Box, boxes[j] as Box), `${label}: речі не налазять одна на одну`).toBe(false);
  // Вміст речі (піктограма, назва, підпис) стоїть на своїй полиці: не вилазить за клітинку й не налазить на дошку чи сусідню полицю.
  const overflow = await panel.locator('[data-ui="box-slot"] > *').evaluateAll((els) => els.filter((e) => e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent));
  expect(overflow, `${label}: усе вміщається на своїй полиці`).toEqual([]);
  const clipped = await panel.locator('[data-ui="box-name"], [data-ui="box-title"], [data-ui="box-hint"]').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent));
  expect(clipped, `${label}: текст вміщається`).toEqual([]);
}

/** Усі контейнери по черзі: торкнутись → перевірити вигляд → узяти все дотиком → закрити. Повертає, скільки речей узято. */
async function collectAll(page: Page, boxes: readonly string[], tag: string): Promise<number> {
  let n = 0;
  for (const spot of boxes) {
    const id = spot.slice(4);
    await openBox(page, spot, true, tag);
    const panel = page.locator('[data-ui="box-panel"]');
    await expect(panel.locator('[data-ui="box-title"]'), `${spot}: у вікні — назва контейнера`).not.toHaveText('');
    const slots = await panel.locator('[data-ui="box-slot"]').count();
    expect(slots, `${spot}: на полицях є речі`).toBeGreaterThan(0);
    if (SHOOT) await page.screenshot({ path: `${SHOTS}/${id}-${tag}.png` });   // знімок ДО перевірок — щоб червона перевірка лишала доказ
    await looksRight(page, `${tag}/${id}`);
    const ids = await panel.locator('[data-ui="box-take"]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.id as string));
    for (const [k, item] of ids.entries()) {
      await panel.locator(`[data-ui="box-take"][data-id="${item}"]`).tap();
      await expect(panel.locator(`[data-ui="box-slot"][data-id="${item}"]`), `${item} узято`).toHaveAttribute('data-state', 'taken', { timeout: 5_000 });
      await expect(panel.locator('[data-ui="box-card-name"]'), `${item}: картка щойно взятої речі`).not.toHaveText('');
      n++;
      if (k === 0) { await looksRight(page, `${tag}/${id}+карта`); if (SHOOT) await page.screenshot({ path: `${SHOTS}/${id}-${tag}-taken.png` }); }
    }
    await expect(panel, `${spot}: усе взято`).toHaveAttribute('data-left', '0');
    await closeBox(page, true);
    // Порожній контейнер мовчить: на мапі його більше нема що брати (маркер не живий), дотик нічого не відкриває.
    await expect.poll(async () => (await probe(page)).nearObject, { timeout: 3_000, message: `${spot} порожній — не «поруч»` }).not.toBe(spot);
  }
  return n;
}

async function everythingTaken(page: Page, items: number): Promise<void> {
  const c = await core(page);
  expect(c.game.flags.filter((f) => f.startsWith('f.take-')), 'усі речі зі списку взято').toHaveLength(items);
  const icons = await page.evaluate(() => Object.keys((window as unknown as { __game: { probe: { markerIcons: Record<string, string> } } }).__game.probe.markerIcons));
  expect(icons.filter((k) => k.startsWith('pack.')), 'на мапі немає жодного об\'єкта-речі на підлозі (pack.*)').toEqual([]);
  expect(icons.filter((k) => k.startsWith('box.')).length, 'контейнери стоять на мапі').toBeGreaterThanOrEqual(4);
}

for (const [name, vp, solo, boxes, items, old] of [
  ['portrait', { width: 390, height: 844 }, true, SOLO, 14, OLD_MINUTES.portrait],
  ['landscape', { width: 932, height: 430 }, false, FAMILY, 17, OLD_MINUTES.landscape],
] as const) {
  test(`усі речі зібрано ДОТИКОМ через контейнери, нічого не на підлозі — ${name} ${vp.width}×${vp.height}`, async ({ browser }) => {
    test.setTimeout(900_000);
    const ctx = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await startHome(page, solo, true);
    if (SHOOT) await page.screenshot({ path: `${SHOTS}/home-${name}.png` });
    expect(((await core(page)).game.player as { animalId?: string } | null)?.animalId === 'animal.cat', 'у цьому прогоні кішка є тоді й лише тоді, коли ми чекаємо 17 речей').toBe(!solo);
    const t0 = (await core(page)).clock.minutes;
    const taken = await collectAll(page, boxes, name);
    const spent = (await core(page)).clock.minutes - t0;
    expect(taken, 'узято всі речі списку для цього гравця').toBe(items);
    await everythingTaken(page, items);
    console.log(`GAME-304 час збирання (${name}, ${items} речей): ${spent} хв гри; було на підлозі: ${old} хв за 14 речей; дозволено ≤ ${old + PER_ITEM_MIN * items}`);
    expect(spent, `час збирання ${spent} хв не виріс більше ніж на ${PER_ITEM_MIN} хв на річ проти ${old} хв`).toBeLessThanOrEqual(old + PER_ITEM_MIN * items);
    if (SHOOT) await page.screenshot({ path: `${SHOTS}/home-${name}-after.png` });
    await ctx.close();
  });
}

test('клавіатура: E відкриває шафу, стрілки ходять по полицях, Enter бере, Escape закриває — 932×430', async ({ browser }) => {
  test.setTimeout(600_000);
  const ctx = await browser.newContext({ viewport: { width: 932, height: 430 } });
  const page = await ctx.newPage();
  await startHome(page, true, false);
  await openBox(page, 'box.wardrobe', false);
  const panel = page.locator('[data-ui="box-panel"]');
  const takes = panel.locator('[data-ui="box-take"]');
  await expect(takes.first(), 'фокус одразу на першій речі').toBeFocused();
  const first = await takes.first().getAttribute('data-id');
  await page.keyboard.press('ArrowRight');
  await expect(takes.nth(1), 'стрілка вправо — наступна річ').toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(takes.first()).toBeFocused();
  const t0 = (await core(page)).clock.minutes;
  await page.keyboard.press('Enter');
  await expect(panel.locator(`[data-ui="box-slot"][data-id="${first}"]`), 'Enter взяв річ').toHaveAttribute('data-state', 'taken');
  expect((await core(page)).game.flags).toContain(`f.take-${(first as string).replace('item.', '')}`);
  await expect(panel.locator('[data-ui="box-take"]').first(), 'після взяття фокус не губиться — на наступній речі').toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel, 'Escape закрив вікно').toHaveCount(0);
  expect((await core(page)).clock.minutes - t0, 'у вікні годинник стоїть (світ на паузі)').toBeLessThanOrEqual(1);
  await expect.poll(async () => (await probe(page)).playerMoving, { timeout: 3_000 }).toBe(false);
  await ctx.close();
});

test('НЕГАТИВНИЙ КОНТРОЛЬ: німий холодильник (?breakSpot=box.fridge) не відкривається — збір червоніє, а решта контейнерів працює — 390×844', async ({ browser }) => {
  test.setTimeout(600_000);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await startHome(page, true, true, '&breakSpot=box.fridge');
  await expect(collectAll(page, ['box.fridge'], 'mute'), 'збір через німий контейнер мусить впасти').rejects.toThrow(/вікно «всередині» відкрилось|box-panel/);
  expect((await core(page)).game.flags.filter((f) => /water|snacks|simple-dinner/.test(f)), 'з німого холодильника нічого не взято').toEqual([]);
  await openBox(page, 'box.wardrobe');   // справний контейнер поруч відкривається
  await closeBox(page, true);
  await ctx.close();
});
