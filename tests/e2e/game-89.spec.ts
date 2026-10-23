// GAME-89 · дрібні дефекти Прологу: №2 сід нової гри, №3 попередження консолі після «Нової гри», №4 кадр на телефоні,
// №5 пастка фокуса в діалогах. (№6 — у story.spec.ts, бо потребує проходу до кінця розділу; №1 — юніт-тест src/content/start-time.test.ts.)
import { expect, test, type Browser, type Page } from '@playwright/test';

const SETTINGS_KEY = 'camplife.settings.v1';
interface Core { worldSeed: number; game: { player: unknown } }
const core = (page: Page): Promise<Core> => page.evaluate(() => (window as unknown as { __game: { read: () => Core } }).__game.read());

async function phone(browser: Browser, scale: 100 | 200): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.addInitScript(([k, s]) => { try { localStorage.setItem(k, JSON.stringify({ textScale: s, language: 'uk', hintSeen: true })); } catch { /* сховища немає */ } }, [SETTINGS_KEY, scale] as const);
  return page;
}
async function load(page: Page, url = '/'): Promise<void> {
  await page.goto(url);
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { ready: boolean; saveLoaded: boolean } } }).__game?.probe.saveLoaded === true, null, { timeout: 30_000 });
}
async function newGame(page: Page): Promise<void> {
  await page.locator('[data-touch="pause"]').click();
  await page.locator('[data-ui="pause"] [data-ui="new-game"]').click();
  await page.locator('[data-ui="confirm-new-yes"]').click();
  await expect(page.locator('[data-ui="story"] [data-act="create"]').first()).toBeVisible();
  await page.waitForTimeout(400);   // GAME-80
}

test.describe('№3 і №2 · «Нова гра»', () => {
  test('консоль без попереджень і помилок після «Нової гри»; сід у кожної нової гри свій (і лежить у стані, тобто в сейві)', async ({ browser }) => {
    const page = await phone(browser, 100);
    const noise: string[] = [];
    page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') noise.push(`${m.type()}: ${m.text()}`); });
    page.on('pageerror', (e) => noise.push(`pageerror: ${e.message}`));
    await load(page, '/?freshSeed=1');    // свіжий сід, як у продакшені (без ?seed збірка e2e тримає сталий)
    const first = (await core(page)).worldSeed;
    await newGame(page);
    const second = (await core(page)).worldSeed;
    await page.locator('[data-ui="story-close"]').click();
    await newGame(page);
    const third = (await core(page)).worldSeed;
    // «GL Driver Message … GPU stall» — шум headless-Chromium (ReadPixels на програмному GL), не гра: його відсіюємо, решта — вимога.
    const own = noise.filter((n) => !/GL Driver Message/.test(n));
    expect(own).toEqual([]);
    expect(noise.some((n) => /Cannot pause/i.test(n))).toBe(false);
    expect(new Set([first, second, third]).size).toBe(3);   // хибне спрацювання ≈ 2^-32 на пару
    // Сід нової гри збережено: після перезавантаження він той самий (а не 20261022 за замовчуванням).
    await page.goto('/');   // без ?freshSeed: сід лежить у сейві, а не береться наново
    await page.waitForFunction(() => (window as unknown as { __game?: { probe: { saveLoaded: boolean } } }).__game?.probe.saveLoaded === true);
    expect((await core(page)).worldSeed).toBe(third);
  });

  test('?seed закріплює сід і для нової гри (відтворювані тести лишаються відтворюваними)', async ({ browser }) => {
    const page = await phone(browser, 100);
    await load(page, '/?seed=2');
    await newGame(page);
    expect((await core(page)).worldSeed).toBe(2);
  });
});

for (const scale of [100, 200] as const) {
  test(`№4 телефон 390×844, текст ${scale} %: канва ціла в полі гри, нічого не обрізано, порожнечі над мапою немає`, async ({ browser }) => {
    const page = await phone(browser, scale);
    await load(page, '/?seed=2');
    const m = await page.evaluate(() => {
      const box = (el: Element) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
      const canvas = document.querySelector('#stage canvas') as HTMLCanvasElement;
      return {
        stage: box(document.querySelector('#stage') as Element),
        canvas: box(canvas),
        header: box(document.querySelector('.ui-header') as Element),
        touch: [...document.querySelectorAll('.touch > *')].map(box),
        buffer: { w: canvas.width, h: canvas.height },
        scroll: { x: document.documentElement.scrollWidth - innerWidth, y: document.documentElement.scrollHeight - innerHeight },
      };
    });
    const eps = 0.5;
    // Канва цілком у полі гри: жодної сторони за його межею (раніше — обрізання справа).
    expect(m.canvas.left).toBeGreaterThanOrEqual(m.stage.left - eps);
    expect(m.canvas.right).toBeLessThanOrEqual(m.stage.right + eps);
    expect(m.canvas.top).toBeGreaterThanOrEqual(m.stage.top - eps);
    expect(m.canvas.bottom).toBeLessThanOrEqual(m.stage.bottom + eps);
    // Видима пропорція = пропорція буфера кадру: канву не розтягнуто й не обрізано CSS.
    expect(Math.abs(m.canvas.width / m.canvas.height - m.buffer.w / m.buffer.h)).toBeLessThan(0.01);
    // Широка по ширині поля (FIT по ширині), а не смужка серед порожнечі.
    expect(m.canvas.width).toBeGreaterThanOrEqual(m.stage.width * 0.98);   // GAME-91: ціле k ріже кадр до floor(w / k) — до k px недобору, не смужка
    // Над мапою — одразу шапка, без смуги: верх канви = верх поля = низ шапки.
    expect(m.canvas.top - m.stage.top).toBeLessThanOrEqual(eps);
    expect(Math.abs(m.stage.top - m.header.bottom)).toBeLessThanOrEqual(eps);
    // GAME-91: дотикові елементи лежать НА мапі (напівпрозорі), у межах екрана; сторінка не прокручується убік.
    for (const b of m.touch) { expect(b.left).toBeGreaterThanOrEqual(-eps); expect(b.right).toBeLessThanOrEqual(390 + eps); expect(b.bottom).toBeLessThanOrEqual(m.canvas.bottom + eps); }
    expect(m.scroll.x).toBeLessThanOrEqual(0);
  });
}

test.describe('№5 · пастка фокуса в модальних діалогах', () => {
  const tabs = async (page: Page, dialog: string, key: 'Tab' | 'Shift+Tab', n: number): Promise<{ inside: boolean; id: string }[]> => {
    const seen: { inside: boolean; id: string }[] = [];
    for (let i = 0; i < n; i++) {
      await page.keyboard.press(key);
      seen.push(await page.evaluate((sel) => {
        const a = document.activeElement as HTMLElement | null;
        return { inside: !!a && !!document.querySelector(sel)?.contains(a), id: a ? `${a.tagName}:${a.dataset.ui ?? a.dataset.act ?? a.textContent?.slice(0, 20)}` : 'null' };
      }, dialog));
    }
    return seen;
  };

  test('екран подорожі (Журнал): Tab і Shift+Tab ходять по колу всередині, ніколи не виходять на BODY', async ({ browser }) => {
    const page = await phone(browser, 100);
    await load(page, '/?seed=2');
    await page.locator('[data-touch="story"]').click();
    await expect(page.locator('[data-ui="story"]')).toBeVisible();
    await page.locator('[data-ui="story"] [data-act="create"]').first().click();
    await page.waitForTimeout(400);
    const n = await page.locator('[data-ui="story"] button, [data-ui="story"] summary').count();
    const fwd = await tabs(page, '[data-ui="story"]', 'Tab', n * 2 + 2);
    expect(fwd.every((s) => s.inside), JSON.stringify(fwd)).toBe(true);
    // Коло справді замкнулось: за 2n+2 кроків той самий елемент зустрівся щонайменше двічі.
    expect(fwd.length - new Set(fwd.map((s) => s.id)).size).toBeGreaterThanOrEqual(n);
    const back = await tabs(page, '[data-ui="story"]', 'Shift+Tab', n * 2 + 2);
    expect(back.every((s) => s.inside), JSON.stringify(back)).toBe(true);
    // Журнал відкрито — його вміст теж у колі (summary лишається досяжною).
    await page.locator('[data-ui="journal"] summary').click();
    const withJournal = await tabs(page, '[data-ui="story"]', 'Tab', n * 2 + 2);
    expect(withJournal.every((s) => s.inside), JSON.stringify(withJournal)).toBe(true);
  });

  test('меню паузи і підтвердження «Нової гри» теж замикають фокус', async ({ browser }) => {
    const page = await phone(browser, 100);
    await load(page, '/?seed=2');
    await page.locator('[data-touch="pause"]').click();
    await expect(page.locator('[data-ui="pause"]')).toBeVisible();
    const pauseN = await page.locator('[data-ui="pause"] button, [data-ui="pause"] textarea, [data-ui="pause"] summary').count();
    for (const key of ['Tab', 'Shift+Tab'] as const) {
      const seen = await tabs(page, '[data-ui="pause"]', key, pauseN + 3);
      expect(seen.every((s) => s.inside), `${key} ${JSON.stringify(seen)}`).toBe(true);
    }
    await page.locator('[data-ui="pause"] [data-ui="new-game"]').click();
    for (const key of ['Tab', 'Shift+Tab'] as const) {
      const seen = await tabs(page, '[data-ui="confirm-new"]', key, 5);
      expect(seen.every((s) => s.inside), `${key} ${JSON.stringify(seen)}`).toBe(true);
    }
  });
});
