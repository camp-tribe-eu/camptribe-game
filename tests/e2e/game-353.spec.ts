// GAME-353 · зразковий день (?sampleDay=1) ПОЧИНАЄТЬСЯ вдома: холодний старт → дім (збір речей) → крамниця (купити в межах бюджету) → дім → «Багажник» → дорога.
// Три рамки: 390×844 (портрет), 932×430 (ландшафт), 600×600 (квадрат). Кнопки екрана — у межах екрана; до першої дії гравця ≤ 5 дотиків (як GAME-342).
// Перезавантаження посеред дому, крамниці й збору — відновлює (місце, квести, кошик, взяте), а не починає епізод наново; і з відновленого стану шлях до дороги є.
// Негативні контролі: лишити ліхтар у «Багажнику» (f.left-lantern) відрізняється від «Їдемо як є» (нічого не лишається); обидва виходи ведуть на дорогу (softlock немає).
// Мутація (перевірено, звіт картки): у src/main.ts `homeNow` → `() => false` (дім у режимі панелі) → червоніє «кнопки й об'єкти дому на екрані» (мапа табору замість дому, жодного об'єкта).
import { expect, test, type Page } from '@playwright/test';
import { skipSampleIntro, waitGameReady } from './ready';
import { core, installMenuObserver, menuSeen, playUntil, pressInteract, probe, route, takeFromOpenBox, walk } from './chapter-driver';

const MAX_TAPS = 5;
const VIEWS = [
  { name: 'portrait', viewport: { width: 390, height: 844 } },
  { name: 'landscape', viewport: { width: 932, height: 430 } },
  { name: 'square', viewport: { width: 600, height: 600 } },
] as const;
const BOXES = ['box.nightstand', 'box.wardrobe', 'box.fridge', 'box.storeroom'];
const URL = '/?seed=7&sampleDay=1';

const taps = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as { __taps: number }).__taps);
const sampleProbe = (page: Page): Promise<string | undefined> => page.evaluate(() => (window as unknown as { __game: { probe: { sampleQuickStart?: string } } }).__game.probe.sampleQuickStart);

async function open(page: Page, errors: string[]): Promise<void> {
  page.on('pageerror', (e) => errors.push(e.message));
  await installMenuObserver(page);
  await page.addInitScript(() => {
    const w = window as unknown as { __taps: number };
    w.__taps = 0;
    window.addEventListener('pointerdown', (e) => { if (e.isTrusted) w.__taps++; }, true);
  });
  await page.goto(URL);
  await waitGameReady(page);
}

/** Усі кнопки дотику, видимі зараз, лежать у межах екрана (і їх хоч дві: ☰ та пауза). */
async function touchFits(page: Page, label: string): Promise<void> {
  const vp = page.viewportSize() as { width: number; height: number };
  const boxes = await page.locator('[data-touch]').evaluateAll((els) => els.flatMap((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? [{ n: e.getAttribute('data-touch') ?? '', x: r.x, y: r.y, w: r.width, h: r.height }] : []; }));
  expect(boxes.length, `${label}: кнопки ☰ і паузи видно`).toBeGreaterThanOrEqual(2);
  for (const b of boxes) {
    expect(b.x, `${label}: ${b.n} не лівіше`).toBeGreaterThanOrEqual(-1);
    expect(b.y, `${label}: ${b.n} не вище`).toBeGreaterThanOrEqual(-1);
    expect(b.x + b.w, `${label}: ${b.n} не правіше`).toBeLessThanOrEqual(vp.width + 1);
    expect(b.y + b.h, `${label}: ${b.n} не нижче`).toBeLessThanOrEqual(vp.height + 1);
  }
}

const isHome = (c: Awaited<ReturnType<typeof core>>): boolean => c.game.player?.locationId === 'loc.home' && c.game.quests['ST-003']?.status === 'completed' && c.game.quests['CH1-HOME-001']?.status === 'active';

/** Підійти до кожного контейнера й узяти все (як жадібний гравець). */
async function takeEverything(page: Page): Promise<void> {
  for (const spot of BOXES) {
    const at = await probe(page);
    await walk(page, route('home', [at.playerX, at.playerY], spot));
    await expect.poll(async () => (await probe(page)).nearObject, { timeout: 5_000, message: `біля ${spot}` }).toBe(spot);
    await pressInteract(page, true);
    await takeFromOpenBox(page, true, 'all');
  }
}

/** Міні-гра «Багажник» вже відкрита біля авто: кнопки на екрані; `how` — «Готово» одразу (непотрібне лишається вдома) або «Їдемо як є» (нічого не лишається). */
async function trunk(page: Page, how: 'done' | 'as-is', label: string): Promise<void> {
  const mg = page.locator('[data-ui="minigame"]');
  await expect(mg.locator('[data-ui="mg-start"]'), `${label}: біля авто з сумкою відкрилась міні-гра`).toBeVisible({ timeout: 10_000 });
  await mg.locator('[data-ui="mg-start"]').tap();
  await expect(page.locator('[data-ui="mg-trunk"]')).toBeVisible();
  const vp = page.viewportSize() as { width: number; height: number };
  for (const sel of ['[data-ui="trunk-cell"]', '[data-ui="trunk-item"]', '[data-ui="trunk-done"]', '[data-ui="mg-pause"]']) {
    for (const el of await page.locator(sel).all()) {
      const b = await el.boundingBox();
      expect(b, `${label}: ${sel} видно`).not.toBeNull();
      const bb = b as { x: number; y: number; width: number; height: number };
      expect(bb.x, `${label}: ${sel}`).toBeGreaterThanOrEqual(-1);
      expect(bb.y, `${label}: ${sel}`).toBeGreaterThanOrEqual(-1);
      expect(bb.x + bb.width, `${label}: ${sel}`).toBeLessThanOrEqual(vp.width + 1);
      expect(bb.y + bb.height, `${label}: ${sel} не нижче екрана`).toBeLessThanOrEqual(vp.height + 1);
    }
  }
  if (how === 'done') {
    await page.locator('[data-ui="trunk-done"]').tap();
    await expect(page.locator('[data-ui="mg-result"]')).toBeVisible();
  } else {
    await page.locator('[data-ui="mg-pause"]').tap();
    await page.locator('[data-ui="mg-move-on"]').tap();
  }
  await page.locator('[data-ui="mg-close"]').tap();
  await expect(mg).toHaveCount(0);
  // «Їдемо як є» нічого не лишає вдома, тож усе взяте може не влізти: той самий екран «Не влазить: що лишимо вдома?» (кнопки «Лишити»), що й у звичайній грі, — вихід є завжди.
  const over = page.locator('[data-ui="pack-overflow"]');
  await over.waitFor({ state: 'visible', timeout: 4_000 }).catch(() => undefined);
  const leave = over.locator('[data-act="leave"]');
  for (let i = 0; i < 20 && (await leave.count()) > 0; i++) { await leave.first().click(); await page.waitForTimeout(450); }
  if (how === 'as-is') expect((await core(page)).game.flags.filter((f) => f.startsWith('f.take-')), 'сумка порожня: «Не влазить» довів до кінця').toEqual([]);
}

/** Грає дім → крамницю → дім (ходьба, кнопки рамки «Куди їдемо?») до порога збору вдома. */
const toHomeAfterShop = (page: Page, log: string[]): Promise<string[]> => playUntil(page, true, log, isHome, () => menuSeen(page), 60);

for (const o of VIEWS) {
  test.describe(`GAME-353 — ${o.name} ${o.viewport.width}×${o.viewport.height}`, () => {
    test.use({ viewport: o.viewport, hasTouch: true, isMobile: true });

    test('холодний старт удома → крамниця → дім → «Багажник» → дорога; кнопки на екрані; ≤ 5 дотиків до першої дії', async ({ page }) => {
      test.setTimeout(540_000);
      const errors: string[] = [];
      await open(page, errors);
      // Старт — удома (не на дорозі): героя створено, пролог закрито, крамницю ще не відвідано.
      expect(await sampleProbe(page), 'швидкий старт зупинився на порозі дому').toBe('ok');
      const c0 = await core(page);
      expect(c0.game.player?.locationId).toBe('loc.home');
      expect(c0.game.quests['ST-003']?.status).toBe('active');
      expect(c0.game.minigames?.['mg.drive'], 'дорогу ще не їхано').toBeUndefined();
      expect((await probe(page)).map, 'на екрані мапа дому, а не табору').toBe('home');
      await expect(page.locator('[data-ui="sample-intro"]'), 'вступ зразка видно').toBeVisible();
      await page.locator('[data-ui="sample-intro-go"]').tap();
      await expect(page.locator('[data-ui="sample-intro"]')).toBeHidden();
      await touchFits(page, 'дім');
      expect(await page.locator('[data-ui="agenda"], [data-ui="wave"], [data-ui="next-hint"]').count(), 'на екрані дому є нотатник цілей').toBeGreaterThan(0);
      // Перша дія гравця: авто везе до крамниці (ходьба + «їдемо» в рамці). Дотиків до неї ≤ 5.
      const sent0 = (await probe(page)).commandsSent;
      const log: string[] = [];
      await playUntil(page, true, log, (c) => c.game.player?.locationId === 'loc.shop', () => menuSeen(page), 10);
      expect((await probe(page)).commandsSent, 'перша дія гравця спрацювала').toBeGreaterThan(sent0);
      const n = await taps(page);
      expect(n, `дотиків до першої дії: ${n}`).toBeLessThanOrEqual(MAX_TAPS);
      expect(n).toBeGreaterThanOrEqual(1);
      expect((await probe(page)).map).toBe('shop');
      await touchFits(page, 'крамниця');
      // Крамниця: купити в межах бюджету (50 €), повернутись додому.
      await toHomeAfterShop(page, log);
      const c1 = await core(page);
      expect(c1.game.inventory['item.tent'], 'намет куплено').toBe(1);
      expect(c1.game.inventory['item.sleeping-bag'], 'спальник куплено').toBe(1);
      expect(c1.game.player?.locationId).toBe('loc.home');
      // Збір: речі з контейнерів у сумку, біля авто — «Багажник».
      await takeEverything(page);
      const at = await probe(page);
      await walk(page, route('home', [at.playerX, at.playerY], 'obj.vehicle'));
      await touchFits(page, 'дім із сумкою');
      await trunk(page, o.name === 'landscape' ? 'done' : 'as-is', o.name);
      const c2 = await core(page);
      expect(c2.game.minigames?.['mg.trunk'], '«Багажник» зіграно').toBeDefined();
      expect(c2.game.flags, 'потрібне спаковано').toContain('f.pack-tent');
      if (o.name === 'landscape') {
        expect(c2.game.flags, 'ліхтар лишили вдома (результат «Багажника» → табір, див. sample-home-353.test)').toContain('f.left-lantern');
        expect(c2.game.flags).not.toContain('f.pack-lantern');
      } else {
        expect(c2.game.flags, '«Їдемо як є»: нічого не лишається вдома').not.toContain('f.left-lantern');
      }
      // Дорога: виїзд, подія в дорозі (діалог), міні-гра дороги відкривається сама.
      await playUntil(page, true, log, (c) => c.game.player?.locationId === 'loc.road', () => menuSeen(page), 30);
      const mg = page.locator('[data-ui="minigame"]');
      for (let i = 0; i < 10 && !(await mg.isVisible().catch(() => false)); i++) {
        const btn = page.locator('[data-ui="dialogue"] [data-act]').last();
        if (await btn.isVisible().catch(() => false)) await btn.tap();
        await page.waitForTimeout(350);
      }
      await expect(mg, 'вступ дороги після дому').toHaveAttribute('data-phase', 'open', { timeout: 20_000 });
      await expect(page.locator('[data-ui="mg-start"]')).toBeVisible();
      expect((await menuSeen(page)).filter((m) => m === '☰-click'), 'дім, крамницю й збори пройдено без ☰').toEqual([]);
      expect(errors).toEqual([]);
    });
  });
}

test.describe('GAME-353 — перезавантаження посеред дому', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('на порозі дому, у крамниці (кошик) і вдома після збору — відновлює, не починає епізод наново; шлях до дороги лишається', async ({ page }) => {
    test.setTimeout(540_000);
    const errors: string[] = [];
    await open(page, errors);
    await skipSampleIntro(page);
    const reload = async (): Promise<void> => {
      await page.waitForTimeout(700);   // автозбереження після команди
      await page.reload();
      await waitGameReady(page);
    };
    // 1) Вдома, до крамниці.
    const a = await core(page);
    await reload();
    expect(await sampleProbe(page), 'збережений день не стартує наново').toBe('skipped');
    await expect(page.locator('[data-ui="sample-intro"]'), 'вступ не повторюється').toHaveCount(0);
    const a2 = await core(page);
    expect(a2.game.player?.locationId).toBe('loc.home');
    expect(a2.game.quests).toEqual(a.game.quests);
    expect((await probe(page)).map).toBe('home');
    // 2) У крамниці з річчю в кошику.
    const log: string[] = [];
    await playUntil(page, true, log, (c) => c.game.player?.locationId === 'loc.shop', () => menuSeen(page), 10);
    await playUntil(page, true, log, (c) => c.game.flags.some((f) => f.startsWith('f.basket-')), () => menuSeen(page), 10);
    const b = await core(page);
    await reload();
    const b2 = await core(page);
    expect(b2.game.player?.locationId).toBe('loc.shop');
    expect(b2.game.flags.filter((f) => f.startsWith('f.basket-')), 'кошик пережив перезавантаження').toEqual(b.game.flags.filter((f) => f.startsWith('f.basket-')));
    expect((await probe(page)).map).toBe('shop');
    // 3) Удома, збір почато: річ узято.
    await toHomeAfterShop(page, log);
    const at = await probe(page);
    await walk(page, route('home', [at.playerX, at.playerY], 'box.nightstand'));
    await expect.poll(async () => (await probe(page)).nearObject, { timeout: 5_000 }).toBe('box.nightstand');
    await pressInteract(page, true);
    await takeFromOpenBox(page, true, 'all');
    const c = await core(page);
    const took = c.game.flags.filter((f) => f.startsWith('f.take-'));
    expect(took.length, 'щось узято з тумби').toBeGreaterThan(0);
    await reload();
    const c2 = await core(page);
    expect(c2.game.flags.filter((f) => f.startsWith('f.take-')), 'взяте пережило перезавантаження').toEqual(took);
    expect(c2.game.flags.filter((f) => f.startsWith('f.pack-')), 'упаковане авто не «розпаковано» знову').toEqual(c.game.flags.filter((f) => f.startsWith('f.pack-')));
    expect(c2.game.player?.locationId).toBe('loc.home');
    // 4) З відновленого стану — до дороги.
    await playUntil(page, true, log, (k) => k.game.player?.locationId === 'loc.road', () => menuSeen(page), 40);
    expect((await core(page)).game.player?.locationId).toBe('loc.road');
    expect(errors).toEqual([]);
  });
});
