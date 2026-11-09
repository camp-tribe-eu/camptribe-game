// GAME-288 · CH2-D1-SUMMARY: вечеря за столом у Мюллерталі, Інгрід упізнає символ медальйона, сон = сейв, підсумок дня 1 розділу 2.
// Сейв — з ядра (tests/e2e/fixtures/ch2-dinner.json, G288_WRITE=1 у src/content/ch2-dinner.test.ts): розділ 2, день 1, повернулись із лісу (кадр орхідеї є), 19:00, квест вечора активний.
// Дві орієнтації телефона: дійти пішки до столу → дія → розмова до кінця (стан гри не змінився) → ☰ «Завершити» → «Лягти спати» → підсумок «день 1» без горизонтальної
// прокрутки → сейв у сховищі < 500 КБ. Знімки для PR: GAME_SHOTS=1 → research/game-288/*.png (не на критичному шляху).
// Негативний контроль (закон 1): ?breakSpot=obj.dinner — німий стіл, розмови нема, цей самий прохід червоніє.
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { answerOne, core, probe, route, talk, walk } from './chapter-driver';
import { waitGameReady } from './ready';

const VIEWS = [{ side: 'portrait', w: 390, h: 844 }, { side: 'landscape', w: 932, h: 430 }] as const;
const SETTINGS_KEY = 'camplife.settings.v1';
const SPOT = 'obj.dinner';
const SHOTS = process.env.GAME_SHOTS === '1' ? 'research/game-288' : '';

async function open(page: Page, extra = ''): Promise<void> {
  const save = readFileSync(new URL('./fixtures/ch2-dinner.json', import.meta.url), 'utf8').trim();
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

/** Дійти до столу й натиснути дію. */
async function sit(page: Page): Promise<void> {
  const p0 = await probe(page);
  await walk(page, route('mullerthal', [p0.playerX, p0.playerY], SPOT));
  await expect.poll(async () => (await probe(page)).nearObject, { timeout: 5_000 }).toBe(SPOT);
  await page.keyboard.press('Space');
}

/** Сейв у сховищі гри (IndexedDB camplife/saves/main): рядок і його довжина в байтах UTF-8. */
const stored = (page: Page): Promise<{ bytes: number; slept: number | null }> => page.evaluate(() => new Promise((resolve, reject) => {
  const req = indexedDB.open('camplife', 1);
  req.onerror = () => reject(req.error);
  req.onsuccess = () => {
    const get = req.result.transaction('saves', 'readonly').objectStore('saves').get('main');
    get.onsuccess = () => {
      const s = String(get.result ?? '');
      let slept: number | null = null;
      try { slept = (JSON.parse(s) as { sim: { game: { slept?: number } } }).sim.game.slept ?? 0; } catch { /* порожній сейв */ }
      req.result.close();
      resolve({ bytes: new TextEncoder().encode(s).length, slept });
    };
    get.onerror = () => reject(get.error);
  };
}));

for (const v of VIEWS) {
  test(`${v.side}: вечеря → Інгрід упізнає символ → сон → підсумок «день 1», сейв < 500 КБ`, async ({ browser }) => {
    test.setTimeout(150_000);
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page);
    const before = await core(page);
    expect(before.game.quests['CH2-D1-SUMMARY-001']?.status).toBe('active');
    await sit(page);
    await expect(talk(page)).toBeVisible({ timeout: 6_000 });
    expect((await core(page)).game.dialogue, 'сцена вечері').toMatchObject({ id: 'dlg.ch2-dinner' });
    const frame = await page.locator('.ui-talk').boundingBox();
    expect(frame && frame.x >= 0 && frame.x + frame.width <= v.w + 1, 'рамка розмови в межах екрана').toBe(true);
    if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.waitForTimeout(500); await page.screenshot({ path: `${SHOTS}/dinner-${v.side}.png` }); }
    // Рахуємо ВУЗЛИ, через які пройшла сцена, а не кліки: на CI дотик під час зміни рамки буває холостим (той самий вузол двічі) — це не інший шлях.
    const nodes: string[] = [];
    for (let clicks = 0; (await core(page)).game.dialogue !== null && clicks < 30; clicks++) {
      const node = ((await core(page)).game.dialogue as { node: string }).node;
      if (nodes[nodes.length - 1] !== node) nodes.push(node);
      if (SHOTS && node === 'club3') await page.screenshot({ path: `${SHOTS}/ingrid-${v.side}.png` });
      await answerOne(page);
    }
    expect(nodes.length, `шлях сцени — 12 вузлів: 9 «Далі» і 3 вибори (${nodes.join(' → ')})`).toBe(12);
    const after = await core(page);
    expect(after.game.dialogue).toBeNull();
    expect(after.game.flags, 'вечеря косметична: прапорців не додала').toEqual(before.game.flags);
    expect(after.journal.filter((e) => e.type === 'StartScene').length).toBe(1);
    // після вечері сюжет сам завершує день-квест; далі ☰ → спати
    await expect.poll(async () => (await core(page)).game.quests['CH2-D1-SUMMARY-001']?.status, { timeout: 6_000, message: 'день-квест завершився сам' }).toBe('completed');
    await page.locator('[data-touch="story"]').click();
    await expect(page.locator('[data-ui="story"]')).toBeVisible();
    await page.waitForTimeout(600);   // «глухота» кнопок дій після відкриття ☰
    await page.locator('[data-ui="story"] [data-act="sleep"]').click({ timeout: 5_000 });
    const summary = page.locator('[data-ui="summary"]');
    await expect(summary).toBeVisible({ timeout: 15_000 });
    await expect(summary).toHaveAttribute('data-day', '1');
    await expect(summary.locator('h2')).toHaveText('Підсумок дня 1');
    await expect(summary.locator('[data-ui="summary-section"][data-kind="quests"]')).toContainText('Вечір у Мюллерталі');
    await expect(summary.locator('[data-ui="summary-section"]'), 'лише квести дня: без ночівлі й подій розділу 1').toHaveCount(1);
    await expect(summary.locator('[data-ui="summary-tomorrow"]')).toContainText('стежка, закрита після зсуву');
    await expect(summary.locator('[data-ui="summary-next"]')).toContainText('Закрита стежка');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'без горизонтальної прокрутки').toBe(true);
    await page.waitForTimeout(1_800);   // підсумок з'являється по секціях (CSS-затримка) — знімок із усім
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/summary-${v.side}.png` });
    // сон = сейв: автозбереження після сну лежить у сховищі й малий
    await expect.poll(async () => (await stored(page)).slept, { timeout: 10_000, message: 'сейв після сну (slept = 3)' }).toBe(3);
    const s = await stored(page);
    process.stdout.write(`GAME-288 e2e ${v.side}: save ${s.bytes} bytes\n`);
    expect(s.bytes, 'сейв < 500 КБ').toBeLessThan(500 * 1024);
    expect((await core(page)).game.quests['CH2-D2-PLAN-001']?.status, 'день 2 розділу відкрито').toBe('active');
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

test('негативний контроль: німий стіл (?breakSpot) не відкриває розмову, той самий прохід червоніє', async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await open(page, `&breakSpot=${SPOT}`);
  await sit(page).catch(() => undefined);
  await page.waitForTimeout(1_200);
  expect((await core(page)).game.dialogue, 'розмови нема').toBeNull();
  await expect(talk(page)).toHaveCount(0);
  expect((await core(page)).journal.filter((e) => e.type === 'StartScene').length).toBe(0);
  await ctx.close();
});
