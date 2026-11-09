// GAME-290 · CH2-D2-ACTIVITY: день 2 розділу 2 — «Як проведемо день?» (авто) → тихий водоспад + галявина орхідей + ідеальне фото (сухо) або майстер-клас у кемпінгу (дощ), і вечір дня 2.
// Стан — з ядра (tests/e2e/fixtures/ch2-activity-<погода>.json і ch2-evening-<вихід>.json, G290_WRITE=1 у src/content/ch2-activity.test.ts): розділ 2, день 2, квест «Як провести день» активний.
// Обидві орієнтації телефона. Рахуємо ВУЗЛИ сцен, а не кліки (на CI дотик під час зміни рамки буває холостим), і чекаємо СТАНУ гри, а не часу. Лише дотики й стрілка «Далі».
// Знімки для PR: GAME_SHOTS=1 → research/game-290/*.png (не на критичному шляху). Негативний контроль (закон 1): ?breakSpot=obj.vehicle — авто німе, той самий шлях зупиняється.
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { core, goAndDo, probe, talk } from './chapter-driver';
import { waitGameReady } from './ready';

const VIEWS = [{ side: 'portrait', w: 390, h: 844 }, { side: 'landscape', w: 932, h: 430 }] as const;
const SETTINGS_KEY = 'camplife.settings.v1';
const SHOTS = process.env.GAME_SHOTS === '1' ? 'research/game-290' : '';
const PERFECT = 'item.photo.perfect';
const WATERFALL_NODES = ['open', 'look', 'hush', 'quiet', 's1', 'meadow1', 'meadow2', 'angle', 'a1', 'click', 'close'];
const WORKSHOP_RAIN_NODES = ['open', 'open-rain', 'cocoa', 'pick', 'map', 'hint', 'shot', 'close'];
const EVENING_NODES = (photo: 'w1' | 'w2'): string[] => ['open', 'dish', 'd1', 'g1', photo, 'ask', 'listen', 'close'];

async function open(page: Page, fixture: string, extra = ''): Promise<void> {
  const save = readFileSync(new URL(`./fixtures/${fixture}.json`, import.meta.url), 'utf8').trim();
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
const QUEST = (c: Awaited<ReturnType<typeof core>>, q: string): string | undefined => c.game.quests[q]?.status;
const hint = (page: Page): Promise<string> => page.locator('[data-ui="agenda-item"][data-current="yes"]').first().innerText();

/** Читає сцену до кінця: кожен вузол рахується один раз; у вузлі вибору — перша відповідь. `onNode` — знімки. */
async function readScene(page: Page, scene: string, onNode?: (node: string) => Promise<void>): Promise<string[]> {
  const nodes: string[] = [];
  for (let clicks = 0; clicks < 60; clicks++) {
    const d = (await core(page)).game.dialogue as { id: string; node: string } | null;
    if (d === null) break;
    expect(d.id).toBe(scene);
    if (nodes[nodes.length - 1] !== d.node) { nodes.push(d.node); if (onNode) await onNode(d.node); }
    const acts = talk(page).locator('[data-act]');
    await expect(acts.first()).toBeVisible({ timeout: 5_000 });
    await acts.nth(0).click({ timeout: 5_000 }).catch(() => undefined);
    await page.waitForTimeout(450);   // «глухота» рамки ~350 мс після відповіді
  }
  return nodes;
}
const noScroll = (page: Page): Promise<boolean> => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const inFrame = async (page: Page, w: number): Promise<boolean> => { const b = await page.locator('.ui-talk').boundingBox(); return b !== null && b.x >= 0 && b.x + b.width <= w + 1; };

/** Рамка вибору «Як проведемо день?»: ключі відповідей (без «Не зараз»). */
const answerKeys = (page: Page): Promise<string[]> => talk(page).locator('[data-act]').evaluateAll((els) => els.filter((e) => e.getAttribute('data-act') !== 'cancel').map((e) => e.getAttribute('data-key') ?? ''));

for (const v of VIEWS) {
  for (const w of [{ name: 'sunny', scene: 'dlg.ch2-waterfall', answer: 'q.ch2-d2-activity-001.waterfall', quest: 'CH2-D2-WATERFALL-001', nodes: WATERFALL_NODES, other: 'CH2-D2-WORKSHOP-001' }, { name: 'rain', scene: 'dlg.ch2-workshop', answer: 'q.ch2-d2-activity-001.workshop', quest: 'CH2-D2-WORKSHOP-001', nodes: WORKSHOP_RAIN_NODES, other: 'CH2-D2-WATERFALL-001' }] as const) {
    test(`${v.side} · ${w.name}: авто «Як проведемо день?» → ${w.scene} → ідеальне фото → вечір дня 2 відкрито`, async ({ browser }) => {
      test.setTimeout(110_000);
      const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: true, isMobile: true });
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      if (SHOTS) mkdirSync(SHOTS, { recursive: true });
      const shot = async (tag: string): Promise<void> => { if (SHOTS) { await page.waitForTimeout(700); await page.screenshot({ path: `${SHOTS}/${tag}-${v.side}-${w.name}.png` }); } };
      await open(page, `ch2-activity-${w.name}`);
      const before = await core(page);
      expect(QUEST(before, 'CH2-D2-ACTIVITY-001')).toBe('active');
      expect(before.game.inventory[PERFECT], 'фото ще немає').toBeUndefined();
      await expect.poll(() => hint(page), { message: '«Далі» дня 2: авто — як провести день' }).toContain('як провести день');
      await shot('start');
      // авто → рамка вибору; за погодою: сухо — водоспад і майстер-клас, дощ — лише майстер-клас (водоспад у дощ необов'язковий)
      await goAndDo(page, true);
      await expect(talk(page)).toBeVisible({ timeout: 6_000 });
      expect(await answerKeys(page), w.name === 'sunny' ? 'сухо: два виходи' : 'дощ: лише безпечний варіант').toEqual(w.name === 'sunny' ? ['q.ch2-d2-activity-001.waterfall', 'q.ch2-d2-activity-001.workshop'] : ['q.ch2-d2-activity-001.workshop']);
      expect(await inFrame(page, v.w), 'рамка вибору в межах екрана').toBe(true);
      await shot('choice');
      await talk(page).locator(`[data-act][data-key="${w.answer}"]`).click({ timeout: 5_000 });
      // сцену відкриває режисер сам; рамка розмови з'являється без жодного дотику
      await expect.poll(async () => ((await core(page)).game.dialogue as { id: string } | null)?.id, { timeout: 8_000, message: `сцена ${w.scene} відкрилась сама` }).toBe(w.scene);
      await expect(talk(page)).toBeVisible({ timeout: 6_000 });
      expect(await inFrame(page, v.w), 'рамка розмови в межах екрана').toBe(true);
      const nodes = await readScene(page, w.scene, async (node) => { if (['look', 'angle', 'click', 'cocoa', 'pick', 'shot'].includes(node)) await shot(`scene-${node}`); });
      expect(nodes, `шлях сцени (${nodes.join(' → ')})`).toEqual(w.nodes);
      // сюжет сам завершив крок і (водоспад) повернув у кемпінг
      await expect.poll(async () => QUEST(await core(page), w.quest), { timeout: 8_000, message: 'квест виходу завершився сам' }).toBe('completed');
      await expect.poll(async () => (await core(page)).game.player?.locationId, { timeout: 8_000, message: 'родина знову в кемпінгу' }).toBe('loc.camp.mullerthal');
      const after = await core(page);
      expect(QUEST(after, 'CH2-D2-EVENING-001'), 'далі — вечір дня 2').toBe('active');
      expect(QUEST(after, w.other), 'другий вихід не стартував').toBeUndefined();
      expect(after.game.inventory[PERFECT], 'ідеальне фото Вікторії в рюкзаку').toBe(1);
      expect(after.game.flags.includes('f.ch2-rain-day'), 'прапорець дощу — лише майстер-клас у дощ').toBe(w.name === 'rain');
      expect(after.journal.filter((e) => e.type === 'StartScene').length, 'одна сцена').toBe(1);
      expect((await probe(page)).map).toBe('mullerthal');
      expect(await noScroll(page), 'без горизонтальної прокрутки').toBe(true);
      await shot('after');
      expect(errors).toEqual([]);
      await ctx.close();
    });
  }
}

for (const [v, photo, fixture, name] of [[VIEWS[0], 'w1', 'ch2-evening-waterfall', 'після водоспаду'], [VIEWS[1], 'w2', 'ch2-evening-workshop', 'після майстер-класу']] as const) {
  test(`${v.side} · вечір дня 2 ${name}: стіл → вечеря → сон → підсумок «день 2»`, async ({ browser }) => {
    test.setTimeout(110_000);
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    if (SHOTS) mkdirSync(SHOTS, { recursive: true });
    await open(page, fixture);
    expect(QUEST(await core(page), 'CH2-D2-EVENING-001')).toBe('active');
    await expect.poll(() => hint(page), { message: '«Далі»: стіл вечері' }).toContain('вечеря');
    await goAndDo(page, true);
    await expect(talk(page)).toBeVisible({ timeout: 6_000 });
    expect((await core(page)).game.dialogue, 'сцена вечора дня 2').toMatchObject({ id: 'dlg.ch2-evening' });
    expect(await inFrame(page, v.w)).toBe(true);
    const nodes = await readScene(page, 'dlg.ch2-evening', async (node) => { if (SHOTS && (node === 'g1' || node === 'ask')) { await page.waitForTimeout(700); await page.screenshot({ path: `${SHOTS}/evening-${node}-${v.side}.png` }); } });
    expect(nodes, `шлях вечора (${nodes.join(' → ')})`).toEqual(EVENING_NODES(photo));
    await expect.poll(async () => QUEST(await core(page), 'CH2-D2-EVENING-001'), { timeout: 8_000, message: 'день-квест завершився сам' }).toBe('completed');
    // ☰ → спати (чекаємо СТАНУ: сон прийнято ядром), підсумок дня 2
    await expect.poll(async () => {
      if (!(await page.locator('[data-ui="story"]').isVisible().catch(() => false))) await page.locator('[data-touch="story"]').tap().catch(() => undefined);
      return page.locator('[data-ui="story"] [data-act="sleep"]').isVisible().catch(() => false);
    }, { message: '☰ показує «Лягти спати»' }).toBe(true);
    await page.waitForTimeout(600);   // «глухота» кнопок дій після відкриття ☰
    await page.locator('[data-ui="story"] [data-act="sleep"]').click({ timeout: 5_000 });
    const summary = page.locator('[data-ui="summary"]');
    await expect(summary).toBeVisible({ timeout: 15_000 });
    await expect(summary).toHaveAttribute('data-day', '2');
    await expect(summary.locator('h2')).toHaveText('Підсумок дня 2');
    await expect(summary.locator('[data-ui="summary-section"][data-kind="quests"]')).toContainText('Нічні звуки');
    await expect(summary.locator('[data-ui="summary-tomorrow"]')).toContainText('три країни');
    expect(await noScroll(page)).toBe(true);
    await page.waitForTimeout(1_800);   // підсумок з'являється по секціях (CSS-затримка)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/summary-${v.side}.png` });
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

test('негативний контроль: німе авто (?breakSpot=obj.vehicle) не відкриває вибору, той самий шлях зупиняється', async ({ browser }) => {
  test.setTimeout(100_000);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await open(page, 'ch2-activity-sunny', '&breakSpot=obj.vehicle');
  await goAndDo(page, true).catch(() => undefined);
  await page.waitForTimeout(1_200);
  const c = await core(page);
  expect(c.game.dialogue, 'сцени нема').toBeNull();
  expect(QUEST(c, 'CH2-D2-ACTIVITY-001'), 'вибір дня лишився невирішеним').toBe('active');
  expect(c.journal.filter((e) => e.type === 'StartScene').length).toBe(0);
  await ctx.close();
});
