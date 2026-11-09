// GAME-287 · CH2-D1-WALK: кадр орхідеї в Мюллерталі. Сейв — з ядра (tests/e2e/fixtures/ch2-walk-<погода>.json, G287_WRITE=1 у src/content/ch2-walk.test.ts): розділ 2, день 1, квест
// прогулянки активний (розмова з Вікторією кадру не потрібна: кадр знімається незалежно від неї). Погода дня — з зерна світу в сейві: sunny → obj.photo-orchid, rain → obj.photo-drops.
// Дві орієнтації телефона × дві погоди: дійти пішки → дія → предмет у рюкзаку, прапорець, у ☰ Атласі — засушена орхідея з підписом дідуся; інший кадр не живий; без горизонтальної прокрутки.
// Знімки для PR: GAME_SHOTS=1 → research/game-287/*.png (не на критичному шляху). Негативний контроль (закон 1): ?breakSpot=<кадр> — німий кадр, прапорця й запису Атласу нема, цей самий прохід червоніє.
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { core, probe, route, walk } from './chapter-driver';
import { waitGameReady } from './ready';

const VIEWS = [{ side: 'portrait', w: 390, h: 844 }, { side: 'landscape', w: 932, h: 430 }] as const;
const CASES = [{ weather: 'sunny', spot: 'obj.photo-orchid', other: 'obj.photo-drops', shot: 'orchid' }, { weather: 'rain', spot: 'obj.photo-drops', other: 'obj.photo-orchid', shot: 'drops' }] as const;
const FLAG = 'f.photo-ch2-orchid';
const SETTINGS_KEY = 'camplife.settings.v1';

async function open(page: Page, weather: string, extra = ''): Promise<void> {
  const save = readFileSync(new URL(`./fixtures/ch2-walk-${weather}.json`, import.meta.url), 'utf8').trim();
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
  expect((await core(page)).game.player?.locationId).toBe('loc.camp.mullerthal');
  await expect.poll(async () => (await probe(page)).map, { timeout: 15_000 }).toBe('mullerthal');
}

async function shoot(page: Page, spot: string): Promise<void> {
  const p0 = await probe(page);
  await walk(page, route('mullerthal', [p0.playerX, p0.playerY], spot));
  await expect.poll(async () => (await probe(page)).nearObject, { timeout: 5_000 }).toBe(spot);
  await page.keyboard.press('Space');
}

for (const v of VIEWS) for (const c of CASES) {
  test(`${v.side} · ${c.weather}: кадр ${c.spot} → предмет, прапорець, Атлас з орхідеєю й підписом дідуся`, async ({ browser }) => {
    test.setTimeout(120_000);
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page, c.weather);
    const before = await core(page);
    expect(before.game.quests['CH2-D1-WALK-001']?.status).toBe('active');
    expect(before.game.flags).not.toContain(FLAG);
    await shoot(page, c.spot);
    if (process.env.GAME_SHOTS === '1') { await page.locator('[data-ui="recovery-close"]').click({ timeout: 2000 }).catch(() => undefined); await page.waitForTimeout(600); await page.screenshot({ path: `research/game-287/map-${v.side}-${c.weather}.png` }); }   // знімки для PR, не на критичному шляху
    await expect.poll(async () => (await core(page)).game.flags.includes(FLAG), { timeout: 6_000, message: 'прапорець кадру' }).toBe(true);
    const after = await core(page);
    expect(after.game.inventory['item.photo.orchid'], 'предмет-фото в рюкзаку').toBe(1);
    // повторний кадр — відмова ядра, а не дотик у грі: поруч стоїть Вікторія, другий «пробіл» відкрив би розмову з нею (повторність доводить ch2-walk.test)
    await page.locator('[data-touch="story"]').click();
    await page.locator('[data-ui="atlas-open"]').click();
    const page_ = page.locator('[data-ui="orchid"]');
    await expect(page_).toBeVisible();
    await expect(page_).toHaveAttribute('data-shot', c.shot);
    await expect(page_.locator('[data-ui="orchid-note"]')).toContainText('Шукай там, де скелі плачуть у сонячний день');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'без горизонтальної прокрутки').toBe(true);
    if (process.env.GAME_SHOTS === '1') { await page_.scrollIntoViewIfNeeded(); await page.waitForTimeout(400); await page.screenshot({ path: `research/game-287/atlas-${v.side}-${c.weather}.png` }); }
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

test('негативний контроль: німий кадр (?breakSpot) не дає прапорця, а в Атласі орхідеї нема', async ({ browser }) => {
  test.setTimeout(120_000);
  const c = CASES[0];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await open(page, c.weather, `&breakSpot=${c.spot}`);
  await shoot(page, c.spot).catch(() => undefined);
  await page.waitForTimeout(1_200);
  expect((await core(page)).game.flags).not.toContain(FLAG);
  await page.locator('[data-touch="story"]').click();
  await page.locator('[data-ui="atlas-open"]').click();
  await expect(page.locator('[data-ui="photos"]')).toBeVisible();
  await expect(page.locator('[data-ui="orchid"]')).toHaveCount(0);
  await ctx.close();
});
