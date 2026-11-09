// GAME-289 · CH2-D2-PLAN: ранок дня 2 — план дня, табличка «Закрито після зсуву», вибір «забута стежка з Інгрід / інший шлях самим», вставка на стежці.
// Сейв — з ядра (tests/e2e/fixtures/ch2-plan.json, G289_WRITE=1 у src/content/ch2-plan.test.ts): розділ 2, ранок дня 2, у кемпінгу, квест плану активний.
// Дві орієнтації телефона × дві гілки: дійти пішки до вказівника офіційної стежки → дія → сцена плану (рахуємо ВУЗЛИ, а не кліки: на CI дотик під час зміни рамки буває холостим)
// → вибір → квест плану завершився сам, гілка активна, прапорці → дотик до вказівника обраної стежки → вставка (вузли) → гілка завершилась сама, ACTIVITY активний; без горизонтальної прокрутки.
// Знімки для PR: GAME_SHOTS=1 → research/game-289/*.png (лише власні знімки гри, не на критичному шляху). Негативний контроль (закон 1): ?breakSpot=exit.trail.official — німа табличка.
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { core, probe, route, walk } from './chapter-driver';
import { waitGameReady } from './ready';

const VIEWS = [{ side: 'portrait', w: 390, h: 844 }, { side: 'landscape', w: 932, h: 430 }] as const;
const BRANCHES = [
  { name: 'forgotten', pick: 0, quest: 'CH2-D2-TRAIL-FORGOTTEN-001', spot: 'exit.trail.forgotten', scene: 'dlg.ch2-trail-forgotten', planNodes: ['open', 'agenda', 'sign', 'fork', 'go', 'a1', 'close'], insertChoice: 'mark', insertNodes: ['open', 'open-sign', 'club', 'mark', 's1', 'close'], title: 'Забута стежка' },
  { name: 'other', pick: 1, quest: 'CH2-D2-TRAIL-OTHER-001', spot: 'exit.trail.other', scene: 'dlg.ch2-trail-other', planNodes: ['open', 'agenda', 'sign', 'fork', 'go', 'b1', 'close'], insertChoice: 'riddle', insertNodes: ['open', 'open-sign', 'hint', 'riddle', 'r1', 'close'], title: 'Свій шлях' },
] as const;
const SETTINGS_KEY = 'camplife.settings.v1';
const SPOT = 'exit.trail.official';
const SHOTS = process.env.GAME_SHOTS === '1' ? 'research/game-289' : '';

async function open(page: Page, extra = ''): Promise<void> {
  const save = readFileSync(new URL('./fixtures/ch2-plan.json', import.meta.url), 'utf8').trim();
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

/** Дійти до вказівника на мапі й натиснути дію. */
async function touch(page: Page, spot: string): Promise<void> {
  const p0 = await probe(page);
  await walk(page, route('mullerthal', [p0.playerX, p0.playerY], spot));
  await expect.poll(async () => (await probe(page)).nearObject, { timeout: 5_000 }).toBe(spot);
  await page.keyboard.press('Space');
}
const readSign = (page: Page): Promise<void> => touch(page, SPOT);

/** Рамка розмови: біля об'єкта — `.ui-talk`; сцену, яку відкрив сюжет сам (вставка на стежці), показує ☰. Беремо ту, що на екрані. */
const frame = (page: Page) => page.locator('.ui-talk [data-ui="dialogue"], [data-ui="story"] [data-ui="dialogue"]').first();

/** Читає сцену до кінця: у вузлі вибору `chooseAt` бере відповідь `pick`; кожен вузол рахується один раз. Повертає вузли за порядком. */
async function readScene(page: Page, scene: string, chooseAt: string, pick: number, onNode?: (node: string) => Promise<void>): Promise<string[]> {
  const nodes: string[] = [];
  for (let clicks = 0; clicks < 40; clicks++) {
    const d = (await core(page)).game.dialogue as { id: string; node: string } | null;
    if (d === null) break;
    expect(d.id).toBe(scene);
    if (nodes[nodes.length - 1] !== d.node) { nodes.push(d.node); if (onNode) await onNode(d.node); }
    const acts = frame(page).locator('[data-act]');
    await expect(acts.first()).toBeVisible({ timeout: 5_000 });
    const n = await acts.count();
    await acts.nth(d.node === chooseAt ? Math.min(pick, n - 1) : 0).click({ timeout: 5_000 });
    await page.waitForTimeout(450);   // «глухота» рамки ~350 мс після відповіді
  }
  return nodes;
}

for (const v of VIEWS) for (const b of BRANCHES) {
  test(`${v.side} · ${b.name}: табличка → план → вибір → ${b.spot} → вставка → ACTIVITY`, async ({ browser }) => {
    test.setTimeout(150_000);
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page);
    const before = await core(page);
    expect(before.game.quests['CH2-D2-PLAN-001']?.status).toBe('active');
    expect(before.game.flags).not.toContain('f.trail-official-closed');
    if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.waitForTimeout(500); await page.screenshot({ path: `${SHOTS}/morning-${v.side}.png` }); }
    await readSign(page);
    await expect(page.locator('.ui-talk [data-ui="dialogue"]')).toBeVisible({ timeout: 6_000 });
    expect((await core(page)).game.dialogue, 'сцена плану').toMatchObject({ id: 'dlg.ch2-plan' });
    const box = await page.locator('.ui-talk').boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= v.w + 1, 'рамка розмови в межах екрана').toBe(true);
    const planNodes = await readScene(page, 'dlg.ch2-plan', 'fork', b.pick, async (node) => {
      if (SHOTS && (node === 'sign' || node === 'fork')) { await page.waitForTimeout(2_500); await page.screenshot({ path: `${SHOTS}/${node === 'sign' ? 'sign' : 'choice'}-${v.side}-${b.name}.png` }); }
    });
    expect(planNodes, `шлях сцени плану — 7 вузлів (${planNodes.join(' → ')})`).toEqual(b.planNodes);
    // сюжет сам завершив квест плану переходом у обрану гілку
    await expect.poll(async () => (await core(page)).game.quests[b.quest]?.status, { timeout: 6_000, message: 'гілка активна' }).toBe('active');
    const mid = await core(page);
    expect(mid.game.quests['CH2-D2-PLAN-001']?.status, 'квест плану завершено сюжетом').toBe('completed');
    expect(mid.game.flags, 'табличку прочитано').toContain('f.trail-official-closed');
    expect(mid.game.flags.includes('f.trail-forgotten'), 'прапорець вибору лише в «з Інгрід»').toBe(b.pick === 0);
    expect(Object.keys(mid.game.quests).filter((q) => q.startsWith('CH2-D2-TRAIL-')), 'друга гілка не стартувала').toEqual([b.quest]);
    expect(mid.journal.filter((e) => e.type === 'StartScene').length).toBe(1);
    // у мапі-першій грі з Мюллерталя нікуди не поїхати (стежки — вузли без мап): вставку відкриває дотик до вказівника обраної стежки на мапі кемпінгу
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'без горизонтальної прокрутки').toBe(true);
    await touch(page, b.spot);
    await expect(page.locator('.ui-talk [data-ui="dialogue"]')).toBeVisible({ timeout: 6_000 });
    expect((await core(page)).game.dialogue).toMatchObject({ id: b.scene });
    const insertNodes = await readScene(page, b.scene, b.insertChoice, 0, async (node) => {
      if (SHOTS && (node === 'open-sign' || node === b.insertChoice)) { await page.waitForTimeout(2_500); await page.screenshot({ path: `${SHOTS}/insert-${node === 'open-sign' ? 'start' : 'choice'}-${v.side}-${b.name}.png` }); }
    });
    expect(insertNodes, `шлях вставки — 6 вузлів (${insertNodes.join(' → ')})`).toEqual(b.insertNodes);
    await expect.poll(async () => (await core(page)).game.quests['CH2-D2-ACTIVITY-001']?.status, { timeout: 6_000, message: 'гілка завершилась сама, обидві сходяться в ACTIVITY' }).toBe('active');
    const after = await core(page);
    expect(after.game.quests[b.quest]?.status).toBe('completed');
    expect(after.journal.filter((e) => e.type === 'StartScene').length, 'сцена плану + вставка').toBe(2);
    expect(after.game.inventory, 'сцени нічого не дають').toEqual(before.game.inventory);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'без горизонтальної прокрутки').toBe(true);
    if (SHOTS) { await page.locator('[data-ui="recovery-close"]').click({ timeout: 1500 }).catch(() => undefined); await page.waitForTimeout(800); await page.screenshot({ path: `${SHOTS}/after-${v.side}-${b.name}.png` }); }
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

test('негативний контроль: німа табличка (?breakSpot) не відкриває сцену, той самий прохід червоніє', async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await open(page, `&breakSpot=${SPOT}`);
  await readSign(page).catch(() => undefined);
  await page.waitForTimeout(1_200);
  const c = await core(page);
  expect(c.game.dialogue, 'розмови нема').toBeNull();
  expect(c.game.flags).not.toContain('f.trail-official-closed');
  expect(c.journal.filter((e) => e.type === 'StartScene').length).toBe(0);
  expect(c.game.quests['CH2-D2-PLAN-001']?.status, 'квест плану чекає').toBe('active');
  await ctx.close();
});
