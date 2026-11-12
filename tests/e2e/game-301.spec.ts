// GAME-301 · крамниця: авто не налазить на будівлю й двері, від каси до авто можна дійти ТІЛЬКИ дотиком (джойстик), а після оплати гравець бачить чек.
// Власник: «двері зачинені і на них авто, знову наїхало і далі я не можу йти» і «чи я купив чи ні?».
// Негативний контроль (закон 1): стара мапа (авто на дверях, подвір'я немає) — червоніє на перевірці прямокутників і на проході за поріг; без чека
// «Куплено / Залишилось» — червоніє перевірка тексту. Знімки до/після — лише за G301_SHOTS=1 (G301_TAG=before|after), не на критичному шляху.
import { readFileSync } from 'node:fs';
import { walkIntro } from './intro-walk';
import { expect, test, type Page } from '@playwright/test';
import { core, installMenuObserver, loaded, menuSeen, playUntil, probe, route, talk } from './chapter-driver';

const VIEWS = [{ name: 'портрет', side: 'portrait', w: 390, h: 844 }, { name: 'ландшафт', side: 'landscape', w: 932, h: 430 }] as const;
const SETTINGS_KEY = 'camplife.settings.v1';
type Rect = [number, number, number, number];
const placed = JSON.parse(readFileSync('art/placement/shop.json', 'utf8')) as { buildings: Rect[]; doors: Rect[] };
const meets = (a: readonly number[], b: readonly number[]): boolean => Math.min(a[2] as number, b[2] as number) > Math.max(a[0] as number, b[0] as number) && Math.min(a[3] as number, b[3] as number) > Math.max(a[1] as number, b[1] as number);
const frame = (page: Page): Promise<unknown> => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(0))));

/**
 * Іти до точок СПРАВЖНІМ дотиком: палець на джойстику (CDP), ручка відводиться в бік наступної точки; крок — один кадр браузера (rAF), без таймерів.
 * Герой «заблокований», якщо ручка тримається, а він не зрушив з місця 60 кадрів поспіль, — тест падає з координатами.
 */
async function touchWalk(page: Page, pts: [number, number][]): Promise<void> {
  const box = await page.locator('[data-touch="stick"]').boundingBox();
  if (!box) throw new Error('джойстика немає');
  const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [c] });
  try {
    let last = await probe(page);
    let still = 0;
    for (const [i, p] of pts.entries()) {
      const prev = pts[i - 1];
      // Відрізок маршруту між центрами клітинок — вертикальний чи горизонтальний: спершу вирівнюємось впоперек (інакше після прольоту повз точку герой тисне в стіну збоку від дверей).
      const vertical = prev !== undefined && Math.abs(prev[0] - p[0]) < 1 && Math.abs(prev[1] - p[1]) >= 1;
      const horizontal = prev !== undefined && Math.abs(prev[1] - p[1]) < 1 && Math.abs(prev[0] - p[0]) >= 1;
      for (let f = 0; ; f++) {
        const q = await probe(page);
        const dx = p[0] - q.playerX; const dy = p[1] - q.playerY;
        const step = Math.hypot(q.playerX - last.playerX, q.playerY - last.playerY);
        const tol = Math.max(4, step * 0.6);
        if (Math.abs(dx) < tol && Math.abs(dy) < tol) break;
        still = step < 0.05 ? still + 1 : 0;
        if (still > 60) throw new Error(`герой заблокований: ручка тримається, а він стоїть у (${Math.round(q.playerX)}, ${Math.round(q.playerY)}) на шляху до (${p[0]}, ${p[1]})`);
        if (f > 3000) throw new Error(`не дійшов до (${p[0]}, ${p[1]}) за 3000 кадрів, герой (${Math.round(q.playerX)}, ${Math.round(q.playerY)})`);
        last = q;
        const horiz = vertical ? Math.abs(dx) > tol : horizontal ? Math.abs(dy) <= tol : Math.abs(dx) >= Math.abs(dy);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: c.x + (horiz ? Math.sign(dx) * 40 : 0), y: c.y + (horiz ? 0 : Math.sign(dy) * 40) }] });
        await frame(page);
      }
    }
  } finally {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  }
}

for (const v of VIEWS) {
  test(`крамниця: чек після каси, авто біля будівлі, від каси до авто дотиком — ${v.name}`, async ({ browser }) => {
    test.setTimeout(600_000);
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(([k]) => { try { localStorage.setItem(k as string, JSON.stringify({ textScale: 100, language: 'uk', hintSeen: true })); } catch { /* сховища немає */ } }, [SETTINGS_KEY] as const);
    await installMenuObserver(page);
    await page.goto('/?seed=7&mapFirst=1&intro=1');
    await loaded(page);
    await walkIntro(page, /Сім|Family|Родин/);
    // День 1: до каси, потім оплата (кошик → гроші мінус, речі власні).
    await playUntil(page, v.side === 'landscape', [], (c) => c.game.player?.locationId === 'loc.shop' && (c.game.inventory['item.tent'] ?? 0) > 0 && (c.game.inventory['item.sleeping-bag'] ?? 0) > 0, () => menuSeen(page), 80);
    const shot = async (name: string): Promise<void> => { if (process.env.G301_SHOTS !== '1') return; if (await page.locator('[data-ui="recovery-close"]').count()) await page.locator('[data-ui="recovery-close"]').click(); await page.screenshot({ path: `research/game-301/${process.env.G301_TAG ?? 'after'}-${name}-${v.side}.png` });
    };

    // 2. Чек: що куплено і скільки лишилось — не лише значок кошика над героєм.
    const receipt = page.locator('[data-ui="purchase-receipt"]');
    await shot('receipt');
    await expect(receipt, 'після оплати має бути чек «Куплено / Залишилось»').toBeVisible({ timeout: 5_000 });
    await expect(receipt).toContainText('Куплено');
    await expect(receipt).toContainText('Намет');
    await expect(receipt).toContainText('Спальник');
    await expect(receipt.locator('[data-ui="purchase-receipt-left"]')).toHaveText(/Залишилось\s+15,02\s*(€|EUR)/);
    // Бот-водій тисне дію ще раз біля каси (ring уже оплатив), тож могла відкритись рамка «Що беремо?» — закриваємо «Не зараз» (сцена стоїть, поки рамка відкрита).
    await expect.poll(async () => { if (await talk(page).count()) await talk(page).locator('[data-act="cancel"]').click({ timeout: 1_000 }).catch(() => undefined); return talk(page).count(); }, { timeout: 8_000 }).toBe(0);
    await expect(receipt, 'чек гасне сам').toHaveCount(0, { timeout: 15_000 });

    // 1a. Авто стоїть БІЛЯ будівлі: спрайт не налазить на будівлю й двері, колізія не затуляє прохід перед дверима.
    await shot('shop');
    const at0 = await probe(page);
    expect(at0.map).toBe('shop');
    expect(at0.car, 'авто на мапі крамниці є (родина на авто)').not.toBeNull();
    const car = at0.car as NonNullable<typeof at0.car>;
    for (const b of placed.buildings) expect(meets(car.sprite, b), `спрайт авто ${JSON.stringify(car.sprite)} налазить на будівлю ${JSON.stringify(b)}`).toBe(false);
    for (const d of placed.doors) {
      expect(meets(car.sprite, d), `спрайт авто ${JSON.stringify(car.sprite)} закриває двері ${JSON.stringify(d)}`).toBe(false);
      expect(meets(car.block, [d[0], d[3], d[2], d[3] + 32]), `колізія авто ${JSON.stringify(car.block)} затуляє прохід перед дверима`).toBe(false);
    }

    // 1b. Від каси до авто — лише дотиком: крізь двері на подвір'я; ні разу не стати. Поріг (нижче дверей) мусить бути пройдений.
    const doorBottom = (placed.doors[0] as Rect)[3];
    const path = route('shop', [at0.playerX, at0.playerY], 'obj.vehicle', true);
    expect(path.some((p) => p[1] > doorBottom), 'маршрут до авто веде за поріг, на подвір\'я').toBe(true);
    await touchWalk(page, path);
    expect((await probe(page)).playerY, 'герой вийшов за поріг (нижче дверей)').toBeGreaterThan(doorBottom);
    // GAME-186: слідувач (Метью) може стати ближчим за авто — тоді підступаємо ще (так само дотиком), як гравець у грі.
    for (let t = 0; t < 3 && (await probe(page)).nearObject !== 'obj.vehicle'; t++) {
      const q = await probe(page);
      await touchWalk(page, route('shop', [q.playerX, q.playerY], 'obj.vehicle', true));
    }
    await expect.poll(async () => (await probe(page)).nearObject, { timeout: 5_000, message: 'біля авто кнопка дії мусить знати, що поруч' }).toBe('obj.vehicle');
    await shot('car');

    // 1c. Сісти: або їде, або каже чому не може (рамка «Куди їдемо?» чи «Ще бракує»). Тиша — збій.
    const stated = async (): Promise<string> => {
      if ((await core(page)).game.player?.locationId !== 'loc.shop') return 'went';
      if (await talk(page).count()) return 'asked';
      if (await page.locator('[data-ui="depart-hint"]').count()) return 'reason';
      return '';
    };
    // Підійшов і стоїть — авто саме питає «Куди їдемо?» (кільце наближення). Якщо за 6 с тихо (кільце не пішло) — тиснемо кнопку дії, як гравець.
    const rang = await expect.poll(stated, { timeout: 6_000 }).not.toBe('').then(() => true, () => false);
    if (!rang) await page.locator('[data-touch="interact"]').tap();
    await expect.poll(stated, { timeout: 8_000, message: 'біля авто натиск «Сісти» мусить або їхати, або пояснити причину' }).not.toBe('');
    if ((await stated()) === 'reason') await expect(page.locator('[data-ui="depart-hint"]')).toContainText(/Ще бракує|розвантаж/);
    expect(errors).toEqual([]);
    await ctx.close();
  });
}
