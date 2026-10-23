// GAME-24 (рух, камера, колізії, взаємодія) і GAME-69 (дотик, три в'юпорти) — у справжньому браузері.
import { expect, test, type Page } from '@playwright/test';

interface Probe { ready: boolean; playerX: number; playerY: number; nearObject: string | null; commandsSent: number; cameraScrollX: number; cameraScrollY: number }

const probe = (page: Page): Promise<Probe> => page.evaluate(() => ({ ...(window as unknown as { __game: { probe: Probe } }).__game.probe }));
const grants = (page: Page): Promise<string[]> =>
  page.evaluate(() => ((window as unknown as { __game: { read: () => { game: { grants: string[] } } } }).__game.read()).game.grants);

async function open(page: Page, query = ''): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/${query}`);
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: Probe } }).__game?.probe.ready === true, null, { timeout: 30_000 });
  expect(errors).toEqual([]);
}

async function holdKey(page: Page, key: string, until: (p: Probe) => boolean, maxMs = 4000): Promise<Probe> {
  await page.keyboard.down(key);
  const start = Date.now();
  let p = await probe(page);
  while (!until(p) && Date.now() - start < maxMs) { await page.waitForTimeout(16); p = await probe(page); }
  await page.keyboard.up(key);
  await page.waitForTimeout(50);
  return probe(page);
}

/** Куди відвести ручку джойстика від центру (CSS px; радіус основи 68, мертва зона 17) — по одному вектору на напрямок. */
const STICK_OFFSETS: Readonly<Record<string, [number, number]>> = {
  up: [0, -50], down: [0, 50], left: [-50, 0], right: [50, 0],
  'up-left': [-36, -36], 'up-right': [36, -36], 'down-left': [-36, 36], 'down-right': [36, 36],
};

/**
 * Утримати дотиковий елемент СПРАВЖНІМ дотиком: CDP Input.dispatchTouchEvent іде через вхідний конвеєр
 * браузера з перевіркою влучання — елемент під іншим чи з pointer-events: none не спрацює.
 * (Рецензія PR #13: dispatchEvent на кнопці обходив перевірку влучання, тест був сліпим.)
 * `action`: 'interact' — кругла кнопка дії; будь-який із STICK_OFFSETS — дотик у центр джойстика й відведення ручки (GAME-91).
 * false — елемента не видно, прохід неможливий.
 */
async function holdTouch(page: Page, action: string, until: (p: Probe) => boolean, maxMs = 4000): Promise<boolean> {
  const offset = STICK_OFFSETS[action];
  const btn = page.locator(offset ? '[data-touch="stick"]' : `[data-touch="${action}"]`);
  if (!(await btn.isVisible())) return false;
  const box = await btn.boundingBox();
  if (!box) return false;
  const cdp = await page.context().newCDPSession(page);
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [center] });
  if (offset) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: center.x + offset[0], y: center.y + offset[1] }] });
  const start = Date.now();
  for (;;) {
    await page.waitForTimeout(16);
    if (until(await probe(page)) || Date.now() - start >= maxMs) break;
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(50);
  return true;
}

/** Повний прохід дотиком: дійти до вогнища і взаємодіяти. Повертає кількість надісланих команд. */
async function touchFlow(page: Page): Promise<number> {
  if (!(await holdTouch(page, 'left', (p) => p.playerX <= 60))) return 0;
  if (!(await holdTouch(page, 'up', (p) => p.nearObject !== null))) return 0;
  if (!(await holdTouch(page, 'interact', () => true, 100))) return 0;
  await page.waitForTimeout(100);
  // Команда мусить дійти до ядра: нагорода записана рівно раз (рецензія PR #13).
  if ((await grants(page)).filter((g) => g === 'rw.campfire-warmth').length !== 1) return -1;
  return (await probe(page)).commandsSent;
}

test.describe('клавіатура (десктоп)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  // GAME-91: замість фіксованої секунди — очікування за зондом (під навантаженням кадри ідуть повільніше, і 1 с давала хибну червоність).
  test('стрілка вниз зсуває персонажа в очікуваному напрямку', async ({ page }) => {
    await open(page);
    const p0 = await probe(page);
    // Тримаємо, доки не пройде 30 px (≈0,5 с при 64 px/с), а не рівно 1 с: на завантаженому CI кадри стартують
    // пізно, і за фіксовану секунду персонаж ішов лише 19 px (PR #30). Межа 5 с: персонаж, що стоїть, — червоний.
    await page.keyboard.down('ArrowDown');
    await expect.poll(async () => (await probe(page)).playerY - p0.playerY, { timeout: 5_000 }).toBeGreaterThan(30);
    await page.keyboard.up('ArrowDown');
    const p1 = await probe(page);
    expect(Math.abs(p1.playerX - p0.playerX)).toBeLessThan(1);
  });

  // Звірка GAME-24 (23.10): раніше перевірялась лише ArrowDown. Кожна стрілка 0,4 с — коротше, ніж до
  // стін від точки появи; зсув уздовж своєї осі > 10 px у правильний бік, по іншій — < 1 px.
  test('кожна з чотирьох стрілок — у свій бік і лише по своїй осі', async ({ page }) => {
    await open(page);
    const dirs = [['ArrowDown', 'y', 1], ['ArrowUp', 'y', -1], ['ArrowLeft', 'x', -1], ['ArrowRight', 'x', 1]] as const;
    for (const [key, axis, sign] of dirs) {
      const a = await probe(page);
      const along = (p: Probe): number => (axis === 'y' ? p.playerY - a.playerY : p.playerX - a.playerX) * sign;
      // Тримаємо, доки не пройде 10 px у свій бік (межа 3 с), а не фіксовані 0,4 с — та сама причина, що вище.
      await page.keyboard.down(key);
      await expect.poll(async () => along(await probe(page)), { timeout: 3_000, message: key }).toBeGreaterThan(10);
      await page.keyboard.up(key);
      await page.waitForTimeout(100);
      const b = await probe(page);
      const across = axis === 'y' ? b.playerX - a.playerX : b.playerY - a.playerY;
      expect(along(b), key).toBeGreaterThan(10);
      expect(Math.abs(across), key).toBeLessThan(1);
    }
  });

  test('60+ кадрів поштовху в стіну — персонаж лишається по цей бік', async ({ page }) => {
    await open(page);
    const p = await holdKey(page, 'ArrowRight', () => false, 2500);
    expect(p.playerX).toBeGreaterThan(140);                  // дійшов до стіни…
    expect(p.playerX + 6).toBeLessThanOrEqual(160 + 0.5);    // …і не пройшов (ліва грань стіни x=160)
  });

  test('камера йде за персонажем у межах мапи', async ({ page }) => {
    await open(page);
    const p0 = await probe(page);
    const p1 = await holdKey(page, 'ArrowDown', () => false, 1500);
    expect(p1.cameraScrollY).toBeGreaterThan(p0.cameraScrollY);
    expect(p1.cameraScrollY).toBeLessThanOrEqual(192 - 160);
  });

  test('дія біля об’єкта — рівно одна команда; подвійне натискання — одна; в ядрі нагорода одна', async ({ page }) => {
    await open(page);
    await holdKey(page, 'ArrowLeft', (p) => p.playerX <= 60);
    const near = await holdKey(page, 'ArrowUp', (p) => p.nearObject !== null);
    expect(near.nearObject).toBe('obj.campfire');
    await page.keyboard.press('Space');
    await page.waitForTimeout(120);          // друге натискання — в ІНШОМУ кадрі: засувка не зливає їх,
    await page.keyboard.press('Space');      // одну команду забезпечує саме відкат 400 мс (рецензія PR #13)
    await page.waitForTimeout(100);
    expect((await probe(page)).commandsSent).toBe(1);
    await page.waitForTimeout(500);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(100);
    expect((await probe(page)).commandsSent).toBe(2);            // друга свідома взаємодія — друга команда…
    expect((await grants(page)).filter((g) => g === 'rw.campfire-warmth')).toHaveLength(1); // …але нагорода рівно одна
  });

  test('далеко від об’єкта дія не надсилає команд', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);
    expect((await probe(page)).commandsSent).toBe(0);
  });
});

const VIEWPORTS = [
  { name: 'телефон', width: 390, height: 844, isMobile: true },
  { name: 'планшет', width: 820, height: 1180, isMobile: true },
  { name: 'десктоп з дотиком', width: 1280, height: 800, isMobile: false },
] as const;

for (const vp of VIEWPORTS) {
  test.describe(`дотик · ${vp.name} ${vp.width}×${vp.height}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: vp.isMobile });

    test('рух і взаємодія дотиком — одна команда', async ({ page }) => {
      await open(page);
      expect(await touchFlow(page)).toBe(1);
    });

    test('кожна дотикова ціль ≥ 44×44 CSS px', async ({ page }) => {
      await open(page);
      const boxes = await page.locator('[data-touch]').evaluateAll((els) =>
        els.map((e) => { const r = e.getBoundingClientRect(); return { a: (e as HTMLElement).dataset.touch, w: r.width, h: r.height }; }));
      expect(boxes.map((b) => b.a).sort()).toEqual(['interact', 'pause', 'stick', 'story']); // джойстик + дія сцени, пауза й «Подорож» оболонки UI
      for (const b of boxes) { expect(b.w, b.a).toBeGreaterThanOrEqual(44); expect(b.h, b.a).toBeGreaterThanOrEqual(44); }
    });

    // Звірка GAME-69 #3: міряємо й ціні паузи та титрів, а не лише кнопки сцени. Посилання титрів
    // були 10 px заввишки — знайдено цим тестом.
    test('кожна ціль діалогу паузи й титрів ≥ 44×44 CSS px', async ({ page }) => {
      await open(page);
      await page.locator('[data-touch="pause"]').tap();
      await page.locator('[data-ui="credits"] summary').tap();
      const small = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-ui="pause"] :is(button, summary, a, textarea, input)')]
        .map((e) => ({ e: `${e.tagName}[${e.dataset.ui ?? e.textContent?.slice(0, 16) ?? ''}]`, r: e.getBoundingClientRect() }))
        .filter(({ r }) => r.width < 44 || r.height < 44).map(({ e, r }) => `${e} ${Math.round(r.width)}×${Math.round(r.height)}`));
      const total = await page.locator('[data-ui="pause"] :is(button, summary, a, textarea, input)').count();
      expect(total).toBeGreaterThan(20);                            // титри справді відкриті
      expect(small).toEqual([]);
    });

    // Звірка GAME-69 #1 «…і діалог»: персонаж біля озера (кроки меню — дотиком), до Елізи — дотиковими
    // стрілками, розмова — дотиком по відповідях, до кінця розмови.
    test('пролог дотиком до кінця розділу: джойстик, кнопка дії й тапи по панелі (дійти до Елізи, розмова, кінець)', async ({ page }) => {
      await open(page);
      await page.locator('[data-touch="story"]').tap();
      const story = page.locator('[data-ui="story"]');
      await story.locator('[data-act="create"]', { hasText: /Велосипед|Bike/ }).first().tap();
      await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії
      for (const [kind, key] of [['complete', 'q.st-001'], ['complete', 'q.st-002'], ['visit', 'loc.shop'],
        ['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'], ['complete', 'q.st-003'], ['visit', 'loc.road'], ['complete', 'q.st-004'], ['visit', 'loc.camp.lake']] as const) {
        await story.locator(`[data-act="${kind}"][data-key="${key}"]`).tap();
        await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії
        // На дорозі з шансом 50 % — подія (GAME-31): відповідаємо дотиком, як гравець.
        if (key === 'loc.road' && await story.locator('[data-key="dlg.road-apples.box.c2"]').isVisible({ timeout: 400 }).catch(() => false)) {
          await story.locator('[data-key="dlg.road-apples.box.c2"]').tap();
          await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії
          await story.locator('[data-act="continue"]').tap();
          await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії
        }
      }
      await page.locator('[data-ui="story-close"]').tap();
      expect(await holdTouch(page, 'left', (p) => p.playerX <= 44)).toBe(true);
      expect(await holdTouch(page, 'down', (p) => p.nearObject === 'npc.elise')).toBe(true);
      expect((await probe(page)).nearObject).toBe('npc.elise');
      expect(await holdTouch(page, 'interact', () => true, 100)).toBe(true);
      await expect(story.locator('[data-ui="dialogue"]')).toBeVisible();
      await story.locator('[data-key="dlg.elise-greeting.hello.c1"]').tap();   // велосипедна відповідь
      await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії
      await story.locator('[data-act="continue"]').tap();
      await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії
      await story.locator('[data-act="continue"]').tap();                       // GAME-84 №5: після велосипеда вона ще й називає себе (intro)
      await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії
      await story.locator('[data-key="dlg.elise-greeting.spot.c1"]').tap();
      await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії
      await story.locator('[data-act="continue"]').tap();
      await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії
      await expect(story.locator('[data-ui="dialogue"]')).toHaveCount(0);
      const g = await page.evaluate(() => (window as unknown as { __game: { read: () => { game: { dialogue: unknown; flags: string[] } } } }).__game.read().game);
      expect(g.dialogue).toBeNull();
      expect(g.flags).toContain('f.elise-met');                               // ефект відповіді дійшов до ядра
      // GAME-91: далі — до кінця розділу тим самим дотиком (панель подорожі: лише тапи), без клавіатури й без миші.
      const tapAct = async (kind: string, key = ''): Promise<void> => {
        await story.locator(`[data-act="${kind}"]${key ? `[data-key="${key}"]` : ''}`).tap();
        await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії
      };
      await tapAct('pickup', 'item.firewood');
      await tapAct('complete', 'q.st-005');
      await expect(story.locator('[data-ui="ended"]')).toBeVisible();
      expect((await page.evaluate(() => (window as unknown as { __game: { read: () => { game: { campaignEnded: boolean } } } }).__game.read().game.campaignEnded))).toBe(true);
    });

    test('негативний контроль: прихована кнопка взаємодії — прохід дотиком неможливий', async ({ page }) => {
      await open(page, '?hideTouch=interact');
      expect(await touchFlow(page)).toBe(0);
    });

    // GAME-91: без джойстика пішки не дійти — прохід дотиком неможливий (нема чим рухати персонажа).
    test('негативний контроль: прихований джойстик — прохід дотиком неможливий', async ({ page }) => {
      await open(page, '?hideTouch=stick');
      expect(await touchFlow(page)).toBe(0);
    });
  });
}

test.describe('підписи дотикових кнопок мовою гравця (GAME-30 #3)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('aria-label кнопок сцени — з словника, і змінюється разом із мовою', async ({ page }) => {
    await open(page);
    const labels = (): Promise<(string | null)[]> => page.locator('.touch [data-touch]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    expect(await labels()).toEqual(['Джойстик: рух', 'Дія']);
    await page.locator('[data-touch="pause"]').tap();
    await page.locator('[data-ui="lang-en"]').tap();
    await expect.poll(labels).toEqual(['Joystick: move', 'Act']);   // ефект Preact — після малювання
  });
});

test.describe('поворот екрана (телефон)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('поворот не втрачає стан сцени', async ({ page }) => {
    await open(page);
    await holdTouch(page, 'down', (p) => p.playerY > 110);
    const before = await probe(page);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(300);
    const after = await probe(page);
    expect(after.ready).toBe(true);
    expect(after.playerX).toBeCloseTo(before.playerX, 0);
    expect(after.playerY).toBeCloseTo(before.playerY, 0);
    expect(after.commandsSent).toBe(before.commandsSent);
  });
  // Звірка GAME-69 #4: справжній поворот через CDP — змінюється screen.orientation і приходить подія,
  // а не лише розмір вікна. Плюс сцена після повороту ще слухається (не лише «не загубила стан»).
  test('справжній поворот (подія orientation) — стан на місці, керування працює', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      (window as unknown as { __rot: number }).__rot = 0;
      screen.orientation.addEventListener('change', () => { (window as unknown as { __rot: number }).__rot++; });
    });
    await holdTouch(page, 'down', (p) => p.playerY > 110);
    const before = await probe(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 3, mobile: true, screenOrientation: { type: 'landscapePrimary', angle: 90 } });
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => ({ type: screen.orientation.type, fired: (window as unknown as { __rot: number }).__rot }))).toEqual({ type: 'landscape-primary', fired: 1 });
    const after = await probe(page);
    expect(after.playerX).toBeCloseTo(before.playerX, 0);
    expect(after.playerY).toBeCloseTo(before.playerY, 0);
    expect(after.commandsSent).toBe(before.commandsSent);
    expect(await holdTouch(page, 'up', (p) => p.playerY < after.playerY - 5)).toBe(true);
  });
});
