// GAME-33 · сейви: IndexedDB, автозбереження, код відновлення, запасний слот.
import { expect, test, type Page } from '@playwright/test';
import { stateHash } from '../../src/core/hash';

interface Probe { ready: boolean; saveLoaded: boolean; playerX: number; nearObject: string | null; commandsSent: number; clockMinutes: number }
interface Snap { game: { grants: string[]; moneyCents: number; seq: number }; clock: { minutes: number; paused: boolean }; rng: number[]; finds: number }
/** Усе, крім годинника: годинник іде між знімками законно. */
const noClock = (s: Snap): Omit<Snap, 'clock'> => ({ game: s.game, rng: s.rng, finds: s.finds });
const loaded = (page: Page) => page.waitForFunction(() => (window as unknown as { __game?: { probe: Probe } }).__game?.probe.saveLoaded === true);
const probe = (page: Page): Promise<Probe> => page.evaluate(() => ({ ...(window as unknown as { __game: { probe: Probe } }).__game.probe }));
const snap = (page: Page): Promise<Snap> => page.evaluate(() => (window as unknown as { __game: { read: () => Snap } }).__game.read());

async function open(page: Page): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => {
    const p = (window as unknown as { __game?: { probe: Probe } }).__game?.probe;
    return p?.ready === true && p.saveLoaded === true;
  }, null, { timeout: 30_000 });
  expect(errors).toEqual([]);
}

async function hold(page: Page, key: string, until: (p: Probe) => boolean): Promise<void> {
  await page.keyboard.down(key);
  const t0 = Date.now();
  while (!until(await probe(page)) && Date.now() - t0 < 4000) await page.waitForTimeout(16);
  await page.keyboard.up(key);
}

/** Дійти до вогнища й взаємодіяти: у стані з'являється нагорода. */
async function warmUp(page: Page): Promise<void> {
  await hold(page, 'ArrowLeft', (p) => p.playerX <= 60);
  await hold(page, 'ArrowUp', (p) => p.nearObject !== null);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await snap(page)).game.grants).toContain('rw.campfire-warmth');
}

test.describe('сейви (десктоп)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('нова гра без сейву стартує чистою (інакше «відновлено» нічого не доводить)', async ({ page }) => {
    await open(page);
    expect((await snap(page)).game.grants).toEqual([]);
  });

  test('пауза зберігає; після перезавантаження нагорода на місці', async ({ page }) => {
    await open(page);
    await warmUp(page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.reload();
    await page.waitForFunction(() => (window as unknown as { __game?: { probe: Probe } }).__game?.probe.saveLoaded === true);
    expect((await snap(page)).game.grants).toContain('rw.campfire-warmth');
  });

  test('рецензія PR #13: сейв, записаний на паузі, після перезавантаження не тримає годинник на паузі', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Escape');                       // автозбереження з clock.paused:true
    await page.waitForTimeout(300);
    await page.reload();
    await loaded(page);
    expect((await snap(page)).clock.paused).toBe(false);
    const m0 = (await probe(page)).clockMinutes;
    await expect.poll(async () => (await probe(page)).clockMinutes, { timeout: 5000 }).toBeGreaterThan(m0);
  });

  test('main і prev різні — старт бере main (новіший), а не prev', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Escape');                       // main = чистий стан
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');                       // продовжити
    await warmUp(page);
    await page.keyboard.press('Escape');                       // main = з нагородою, prev = чистий
    await page.waitForTimeout(300);
    const slots = await page.evaluate(() => new Promise<string[]>((resolve) => {
      const req = indexedDB.open('camplife', 1);
      req.onsuccess = () => {
        const st = req.result.transaction('saves').objectStore('saves');
        const a = st.get('main'); const b = st.get('prev');
        st.transaction.oncomplete = () => { req.result.close(); resolve([String(a.result), String(b.result)]); };
      };
    }));
    expect(slots[0]).toContain('rw.campfire-warmth');
    expect(slots[1]).not.toContain('rw.campfire-warmth');      // справді різні — інакше тест сліпий
    await page.reload();
    await loaded(page);
    expect((await snap(page)).game.grants).toContain('rw.campfire-warmth');
  });

  test('зіпсований основний слот — гра бере попередній, а не падає й не стартує з нуля', async ({ page }) => {
    await open(page);
    await warmUp(page);
    await page.keyboard.press('Escape');
    await page.locator('[data-ui="save"]').click();           // main = з нагородою, prev = автозбереження паузи
    await expect(page.locator('[data-ui="status"]')).toHaveText(/Збережено|Saved/);
    await page.evaluate(() => new Promise<void>((resolve) => {
      const req = indexedDB.open('camplife', 1);
      req.onsuccess = () => {
        const tx = req.result.transaction('saves', 'readwrite');
        tx.objectStore('saves').put('{"format":"camplife-save", зіпсовано', 'main');
        tx.oncomplete = () => { req.result.close(); resolve(); };
      };
    }));
    await page.reload();
    await page.waitForFunction(() => (window as unknown as { __game?: { probe: Probe } }).__game?.probe.saveLoaded === true);
    expect((await snap(page)).game.grants).toContain('rw.campfire-warmth');
  });
});

test.describe('сейв від старішої версії контенту (рецензія сейвів 23.10)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('застарілий main: гра не вантажить його й не застрягає, у меню — повідомлення й код; копія в карантині', async ({ page }) => {
    await open(page);
    // Справжній сейв нинішньої гри, але з активним квестом, якого в контенті немає (як після оновлення).
    const sim = (await page.evaluate(() => (window as unknown as { __game: { read: () => unknown } }).__game.read())) as { game: Record<string, unknown> };
    const stale = { ...sim, game: { ...sim.game, player: { profileId: 'profile.solo-explorer', transportId: 'transport.bike', animalId: 'animal.none', locationId: 'loc.home' }, quests: { 'q.removed-in-update': { status: 'active', done: [] } } } };
    const file = JSON.stringify({ format: 'camplife-save', schemaVersion: 2, checksum: stateHash(stale), accountId: null, contentRev: 'old', sim: stale });
    await page.evaluate((json) => new Promise<void>((resolve) => {
      const req = indexedDB.open('camplife', 1);
      req.onsuccess = () => { const tx = req.result.transaction('saves', 'readwrite'); tx.objectStore('saves').put(json, 'main'); tx.oncomplete = () => { req.result.close(); resolve(); }; };
    }), file);
    await page.reload();
    await loaded(page);
    expect((await snap(page)).game.grants).toEqual([]);                       // нова гра, а не застряглий сейв
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-ui="stale"]')).toContainText(/не може продовжити|cannot continue/);
    await expect(page.locator('[data-ui="stale-code"]')).toHaveValue(/^CL1\./);
    const keys = await page.evaluate(() => new Promise<string[]>((resolve) => {
      const req = indexedDB.open('camplife', 1);
      req.onsuccess = () => { const r = req.result.transaction('saves').objectStore('saves').getAllKeys(); r.onsuccess = () => { req.result.close(); resolve(r.result.map(String)); }; };
    }));
    expect(keys.some((k) => k.startsWith('stale:'))).toBe(true);

    // Рецензія (друге коло): після автозбереження застарілий сейв іде з main/prev — а повідомлення лишається
    // і в наступній сесії, доки гравець сам його не сховає.
    await page.keyboard.press('Escape');                                     // продовжити
    await page.keyboard.press('Escape');                                     // знову пауза → автозбереження
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.reload();
    await loaded(page);
    await page.locator('[data-touch="story"]').click();
    await expect(page.locator('[data-ui="story"] [data-ui="stale"]')).toBeVisible();   // і на екрані подорожі
    await page.locator('[data-ui="stale-dismiss"]').click();
    await expect(page.locator('[data-ui="stale"]')).toHaveCount(0);
    await page.reload();
    await loaded(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-ui="pause"]')).toBeVisible();
    await expect(page.locator('[data-ui="stale"]')).toHaveCount(0);
    const after = await page.evaluate(() => new Promise<string[]>((resolve) => {
      const req = indexedDB.open('camplife', 1);
      req.onsuccess = () => { const r = req.result.transaction('saves').objectStore('saves').getAllKeys(); r.onsuccess = () => { req.result.close(); resolve(r.result.map(String)); }; };
    }));
    expect(after.some((k) => k.startsWith('stale:'))).toBe(false);
  });

  test('імпорт коду від старішої версії — окреме пояснення, а не «скопійовано не повністю»', async ({ page }) => {
    await open(page);
    const sim = (await page.evaluate(() => (window as unknown as { __game: { read: () => unknown } }).__game.read())) as { game: Record<string, unknown> };
    const stale = { ...sim, game: { ...sim.game, player: { profileId: 'profile.gone', transportId: 'transport.car', animalId: 'animal.none', locationId: null } } };
    const file = JSON.stringify({ format: 'camplife-save', schemaVersion: 2, checksum: stateHash(stale), accountId: null, sim: stale });
    const code = await page.evaluate(async (json) => {
      const bytes = new TextEncoder().encode(json);
      const cs = new CompressionStream('deflate-raw');
      const out = await new Response(new Blob([bytes]).stream().pipeThrough(cs)).arrayBuffer();
      let bin = ''; for (const b of new Uint8Array(out)) bin += String.fromCharCode(b);
      return `CL1.${btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
    }, file);
    await page.keyboard.press('Escape');
    await page.locator('[data-ui="code-in"]').fill(code);
    await page.locator('[data-ui="code-apply"]').click();
    await expect(page.locator('[data-ui="status"]')).toHaveText(/старішої версії|older version/);
  });
});

test.describe('код відновлення (телефон 390×844)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('код → чистий браузер → імпорт → той самий стан', async ({ page, browser }) => {
    await open(page);
    await warmUp(page);
    const before = await snap(page);
    await page.locator('[data-touch="pause"]').tap();
    await page.locator('[data-ui="code-export"]').tap();
    await expect(page.locator('[data-ui="code-out"]')).toHaveValue(/^CL1\./);
    const code = await page.locator('[data-ui="code-out"]').inputValue();
    expect(code).toMatch(/^CL1\.[A-Za-z0-9_-]+$/);

    const fresh = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const p2 = await fresh.newPage();
    await open(p2);
    expect((await snap(p2)).game.grants).toEqual([]);                    // справді чистий браузер
    await p2.locator('[data-touch="pause"]').tap();
    await p2.locator('[data-ui="code-in"]').fill(code);
    await p2.locator('[data-ui="code-apply"]').tap();
    await expect(p2.locator('[data-ui="status"]')).toHaveText(/Гру відновлено|Game restored/);
    const exported = await snap(page);                                     // стан у мить експорту
    expect(noClock(await snap(p2))).toEqual(noClock(exported));            // весь стан, не вибрані поля
    expect((await snap(p2)).clock.minutes).toBe(exported.clock.minutes);   // годинник — на паузі обидва
    // Імпорт записано у сховище: після перезавантаження стан той самий (рецензія: M4).
    await p2.reload();
    await loaded(p2);
    expect((await snap(p2)).game).toEqual(exported.game);                  // годинник уже йде: rng/finds рухаються законно
    expect(before.game.grants).toContain('rw.campfire-warmth');
    await fresh.close();
  });

  test('зіпсований код — відмова з поясненням, стан не змінено', async ({ page }) => {
    await open(page);
    const before = await snap(page);
    await page.locator('[data-touch="pause"]').tap();
    await page.locator('[data-ui="code-in"]').fill('CL1.зламано');
    await page.locator('[data-ui="code-apply"]').tap();
    await expect(page.locator('[data-ui="status"]')).toHaveText(/не підходить|does not fit/);
    expect((await snap(page)).game).toEqual(before.game);      // гра та сама (годинник на паузі змінюється законно)
  });
});
