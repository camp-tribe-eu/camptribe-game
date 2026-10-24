// GAME-84 · дрібні дефекти Прологу (QA), лише ті, що видно в справжньому браузері: №1, №7–№13.
// Кожна перевірка має негативний контроль (мутація CSS/коду — у звіті картки). Числа — межі прямокутників, а не «на око».
import { GAME_NAME } from '../../src/config/brand';
import { expect, test, type Browser, type Page } from '@playwright/test';

const SETTINGS_KEY = 'camplife.settings.v1';
const panel = (page: Page) => page.locator('[data-ui="story"]');
interface Rect { left: number; top: number; right: number; bottom: number; width: number; height: number }
const rectOf = (page: Page, sel: string): Promise<Rect> => page.locator(sel).first().evaluate((el) => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
});

async function newPage(browser: Browser, vp: { width: number; height: number }, scale: 100 | 200, touch: boolean): Promise<Page> {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
  await page.addInitScript(([k, s]) => { try { if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify({ textScale: s, language: 'uk', hintSeen: true })); } catch { /* сховища немає */ } }, [SETTINGS_KEY, scale] as const);
  return page;
}
async function load(page: Page, query = '?seed=2'): Promise<void> {
  await page.goto(`/${query}`);
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { ready: boolean; saveLoaded: boolean } } }).__game?.probe.saveLoaded === true, null, { timeout: 30_000 });
}
async function act(page: Page, kind: string, key = ''): Promise<void> {
  await panel(page).locator(`[data-act="${kind}"][data-key="${key}"]`).click({ timeout: 5_000 });
  await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії
}
async function openStory(page: Page): Promise<void> {
  await page.locator('[data-touch="story"]').click();
  await expect(panel(page)).toBeVisible();
}
async function createBike(page: Page): Promise<void> {
  await panel(page).locator('[data-act="create"]', { hasText: 'Велосипед' }).first().click();
  await page.waitForTimeout(400);
}

test.describe('№1 «Піти» туди, де стоїш', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('удома на старті й після ST-001/ST-002 кнопки «Піти: Дім» немає; крамниця й далі є (позитивний контроль)', async ({ page }) => {
    await load(page);
    await openStory(page);
    await createBike(page);
    const home = panel(page).locator('[data-act="visit"][data-key="loc.home"]');
    await expect(panel(page).locator('[data-act="visit"][data-key="loc.shop"]')).toHaveCount(0);   // крамниця ще зачинена до ST-002
    await expect(home).toHaveCount(0);
    await expect(panel(page).locator('[data-act="complete"][data-key="q.st-001"]')).toBeVisible();   // і її можна завершити без «Піти»
    await act(page, 'complete', 'q.st-001');
    await expect(home).toHaveCount(0);
    await act(page, 'complete', 'q.st-002');
    await expect(home).toHaveCount(0);
    await expect(panel(page).locator('[data-act="visit"][data-key="loc.shop"]')).toBeVisible();
    await act(page, 'visit', 'loc.shop');
    await expect(panel(page).locator('[data-act="visit"][data-key="loc.home"]')).toBeVisible();     // з крамниці додому — справжня дорога
    await expect(panel(page).locator('[data-act="visit"][data-key="loc.shop"]')).toHaveCount(0);    // а в крамницю, де стоїш, — ні
  });
});

test.describe('№11 жодного 404 за звичайний сеанс', () => {
  test('відповіді, консоль і запити: жодної помилки, значок оголошено у <head>, /favicon.ico не просять', async ({ browser }) => {
    const page = await newPage(browser, { width: 390, height: 844 }, 100, true);
    const bad: string[] = [];
    const requested: string[] = [];
    const consoleErrors: string[] = [];
    page.on('request', (r) => requested.push(new URL(r.url()).pathname));
    page.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => consoleErrors.push(e.message));
    await load(page);
    await openStory(page);
    await createBike(page);
    await act(page, 'complete', 'q.st-001');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await page.reload();
    await load(page);
    await page.waitForTimeout(500);   // значок вкладки браузер просить після розбору сторінки
    expect(bad).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(requested.filter((p) => p.endsWith('/favicon.ico'))).toEqual([]);
    // Значок оголошено й він вбудований (data:): запиту немає — тож і 404 бути не може, а вкладка має картинку.
    const href = await page.locator('link[rel="icon"]').getAttribute('href');
    expect(href, 'у <head> немає <link rel="icon">').toMatch(/^data:image\/svg\+xml,/);
    expect(decodeURIComponent(href ?? '')).toContain('<svg');
  });
});

test.describe('№12 «Зберегти» не двічі', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('у меню паузи слово «Зберегти» — рівно один елемент (кнопка); група має власну назву', async ({ page }) => {
    await load(page);
    await page.locator('[data-touch="pause"]').click();
    await expect(page.locator('[data-ui="pause"]')).toBeVisible();
    await expect(page.locator('[data-ui="pause"]').getByText('Зберегти', { exact: true })).toHaveCount(1);
    await expect(page.locator('[data-ui="save"]')).toHaveText('Зберегти');
    await expect(page.locator('[data-ui="pause"] fieldset legend', { hasText: 'Збереження' })).toHaveCount(1);
    // Англійською — так само: «Save» один раз.
    await page.locator('[data-ui="lang-en"]').click();
    await expect(page.locator('[data-ui="pause"]').getByText('Save', { exact: true })).toHaveCount(1);
  });
});

test.describe('№9 дотикові елементи (джойстик, дія) не просвічують крізь панелі', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('на карті джойстик і кнопку дії видно; під панеллю подорожі й під паузою їх немає (visibility: hidden)', async ({ page }) => {
    await load(page);
    const arrows = page.locator('.touch > *');
    expect(await arrows.count()).toBe(2);   // джойстик + кнопка дії (GAME-91)
    const vis = (): Promise<string[]> => arrows.evaluateAll((els) => els.map((e) => getComputedStyle(e).visibility));
    expect((await vis()).every((v) => v === 'visible')).toBe(true);          // позитивний контроль: на карті вони є
    await openStory(page);
    expect((await vis()).every((v) => v === 'hidden')).toBe(true);
    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0);
    expect((await vis()).every((v) => v === 'visible')).toBe(true);          // панель закрито — стрілки повернулись
    await page.locator('[data-touch="pause"]').click();
    await expect(page.locator('[data-ui="pause"]')).toBeVisible();
    expect((await vis()).every((v) => v === 'hidden')).toBe(true);
  });
});

// GAME-91: підпис збірки прибрано з екрана гри — він у меню паузи (було: на канві, GAME-84 №10).
for (const scale of [100, 200] as const) {
  test.describe(`№10 підпис збірки, телефон 390×844, текст ${scale} %`, () => {
    test(`на екрані гри підпису немає; в меню паузи — повний SHA, у межах екрана`, async ({ browser }) => {
      const page = await newPage(browser, { width: 390, height: 844 }, scale, true);
      await load(page);
      await expect(page.locator('.build')).toHaveCount(0);
      expect(await page.locator('#app').innerText()).not.toMatch(new RegExp(`${GAME_NAME} v|[0-9a-f]{40}`));   // ні в шапці, ні деінде на екрані гри
      await page.locator('[data-touch="pause"]').click();
      const build = page.locator('[data-ui="pause"] [data-ui="build"]');
      await build.scrollIntoViewIfNeeded();
      expect((await build.textContent()) ?? '').toMatch(new RegExp(`^${GAME_NAME} v\\S+ · ([0-9a-f]{40}|unknown)$`));   // повний SHA (або чесне «unknown» без git)
      const b = await rectOf(page, '[data-ui="build"]');
      expect(b.left).toBeGreaterThanOrEqual(0);
      expect(b.right).toBeLessThanOrEqual(390);                                  // не вилазить за екран (при 200 % раніше — вилазив)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);   // сторінка не їде вбік
    });
  });
}

test.describe('№7 текст 200 % на телефоні', () => {
  for (const width of [360, 375, 390]) {
    test(`жодне слово суми на екрані подорожі (рядок стану, ціни в кнопках) не розривається посеред слова, вікно ${width} px`, async ({ browser }) => {
      const page = await newPage(browser, { width, height: 700 }, 200, true);
      await load(page);
      await openStory(page);
      await createBike(page);
      await act(page, 'complete', 'q.st-001');
      await act(page, 'complete', 'q.st-002');
      await act(page, 'visit', 'loc.shop');          // у крамниці: ціни в кнопках («Купити … (89,00 €)», «бракує …»)
      // Слова суми — число й валюта — кожне окремо мусить лишитись в одному рядку (між ними рядок рватись може, посеред слова — ні).
      const found = await panel(page).evaluate((root) => {
        const out: { text: string; lines: number }[] = [];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
          for (const m of n.data.matchAll(/\d+,\d\d(?=\s*(?:€|EUR))|(?<=\d,\d\d\s*)(?:€|EUR)/g)) {
            const range = document.createRange();
            range.setStart(n, m.index ?? 0);
            range.setEnd(n, (m.index ?? 0) + m[0].length);
            out.push({ text: m[0], lines: new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size });
          }
        }
        return out;
      });
      expect(found.length, 'сум на екрані мало бути кілька (рядок стану й ціни), інакше нема що перевіряти').toBeGreaterThanOrEqual(6);
      expect(found.filter((f) => f.lines !== 1)).toEqual([]);
    });
  }

  test('перенос слів на екрані 200 %: hyphens: auto (з дефісом там, де браузер знає мову); «де завгодно» — лише крайній випадок', async ({ browser }) => {
    const page = await newPage(browser, { width: 390, height: 844 }, 200, true);
    await load(page);
    await openStory(page);
    // Автопрокрутка фокусу (заголовок за верхом після дії) перевіряється нижче, на екрані розмови (№8): там вона була видна.
    const css = await panel(page).evaluate((el) => getComputedStyle(el).hyphens);
    expect(css).toBe('auto');
  });
});

test.describe('№8 текст 200 % на десктопі: завдання й діалог по центру разом із заголовком', () => {
  test('центри завдання, діалогу й заголовка збігаються (було: притиснуті ліворуч)', async ({ browser }) => {
    const page = await newPage(browser, { width: 1280, height: 800 }, 200, false);
    await load(page);
    await openStory(page);
    await createBike(page);
    await act(page, 'complete', 'q.st-001');
    const centre = (r: Rect): number => (r.left + r.right) / 2;
    const h2 = await rectOf(page, '[data-ui="story"] h2');
    const quest = await rectOf(page, '[data-ui="quest"]');
    expect(Math.abs(centre(quest) - centre(h2)), `завдання ${JSON.stringify(quest)} проти заголовка ${JSON.stringify(h2)}`).toBeLessThan(3);
    expect(quest.width, 'завдання розтягнулось на весь екран: текст знову притиснутий до лівого краю').toBeLessThanOrEqual(660);   // межа макета: min(92vw, 640px)
    // Діалог: до Елізи — повний прохід (кліком), далі беремо рамку діалогу.
    for (const [k, key] of [['complete', 'q.st-002'], ['visit', 'loc.shop'], ['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'], ['complete', 'q.st-003'], ['visit', 'loc.road']] as const) await act(page, k, key);
    const apples = panel(page).locator('[data-key="dlg.road-apples.box.c2"]');
    if (await apples.isVisible({ timeout: 400 }).catch(() => false)) {
      // Подія в дорозі — теж діалог: перевіряємо на ньому, інакше йдемо до Елізи.
      const dlg = await rectOf(page, '[data-ui="dialogue"]');
      const head = await rectOf(page, '[data-ui="story"] h2');
      expect(Math.abs(centre(dlg) - centre(head))).toBeLessThan(3);
      await apples.click();
      await page.waitForTimeout(400);
      await panel(page).locator('[data-act="continue"]').click();
      await page.waitForTimeout(400);
    }
    await act(page, 'complete', 'q.elise-bike-area.choice');
    await act(page, 'visit', 'loc.camp.lake');
    await act(page, 'talk', 'npc.elise');
    const dlg = await rectOf(page, '[data-ui="dialogue"]');
    const head = await rectOf(page, '[data-ui="story"] h2');
    const q2 = await rectOf(page, '[data-ui="quest"]');
    expect(Math.abs(centre(dlg) - centre(head)), `діалог ${JSON.stringify(dlg)}`).toBeLessThan(3);
    expect(dlg.width, 'діалог розтягнувся на весь екран').toBeLessThanOrEqual(660);
    expect(Math.abs(centre(q2) - centre(head)), `завдання ${JSON.stringify(q2)}`).toBeLessThan(3);
    expect(dlg.left).toBeGreaterThan(0);
    expect(dlg.right).toBeLessThanOrEqual(1280);
    // №7 на тому самому екрані: після відкриття розмови панель не прокручена так, що заголовок зник за верх (було scrollTop ≈ 100).
    expect(await panel(page).evaluate((el) => el.scrollTop)).toBe(0);
    expect(head.top).toBeGreaterThanOrEqual(0);
  });
});

test.describe('№13 телефон: поле гри заповнює екран, а не смужка посередині', () => {
  test('390×844 сторч: полотно на всю ширину поля й ≥ 55 % його висоти; повернули вбік — знову широкий кадр 640×352 (GAME-93; було 3:2)', async ({ browser }) => {
    const page = await newPage(browser, { width: 390, height: 844 }, 100, true);
    await load(page);
    const stage = await rectOf(page, '#stage');
    const canvas = await rectOf(page, '#stage canvas');
    expect(canvas.width).toBeGreaterThanOrEqual(stage.width * 0.97);
    expect(canvas.height / stage.height, `полотно ${canvas.width}×${canvas.height} у полі ${stage.width}×${stage.height}`).toBeGreaterThanOrEqual(0.55);
    // Поворот: кадр перераховується під нову форму поля (ResizeObserver), а не лишається вертикальним у горизонтальному полі.
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForFunction(() => { const c = document.querySelector('#stage canvas') as HTMLCanvasElement | null; return !!c && Math.abs(c.width / c.height - 640 / 352) < 0.01; }, null, { timeout: 5_000 });
    const wide = await rectOf(page, '#stage canvas');
    const wideStage = await rectOf(page, '#stage');
    expect(wide.height / wideStage.height).toBeGreaterThanOrEqual(0.95);          // у широкому полі — на всю висоту, як і раніше
    // І назад.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => { const c = document.querySelector('#stage canvas') as HTMLCanvasElement | null; return !!c && c.width / c.height < 1; }, null, { timeout: 5_000 });
  });

  test('на десктопі кадр широкого поля — 640×352 (GAME-93: тайли 32 px; було 240×160 при 16 px)', async ({ browser }) => {
    const page = await newPage(browser, { width: 1280, height: 800 }, 100, false);
    await load(page);
    const size = await page.locator('#stage canvas').evaluate((c) => [(c as HTMLCanvasElement).width, (c as HTMLCanvasElement).height]);
    expect(size).toEqual([640, 352]);
  });
});
