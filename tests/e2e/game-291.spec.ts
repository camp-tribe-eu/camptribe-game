// GAME-291 · CH2-SCHENGEN: день 3 розділу 2 — авто «Куди вирушаємо?» → набережна Шенгену (власна мапа) → сцена «Три країни, одна пляшка» → друга половинка медальйона, мікрокарта,
// з'єднання (свідомий вибір), мітка Джорджа на мапі → родина знову в кемпінгу.
// Стан — з ядра (tests/e2e/fixtures/ch2-schengen-<погода>.json, G291_WRITE=1 у src/content/ch2-schengen.test.ts): розділ 2, ранок дня 3, квест Шенгену активний.
// Обидві орієнтації телефона. Рахуємо ВУЗЛИ сцени, а не кліки (на CI дотик під час зміни рамки буває холостим), і чекаємо СТАНУ гри, а не часу. Лише дотики й стрілка «Далі».
// Розкладка пам'ятника (9:16 і 16:9): стан, а не око — пам'ятник ЦІЛКОМ у вікні камери й не під рамкою розмови; обличчя (знімки) для PR: GAME_SHOTS=1 → research/game-291/*.png (не на критичному шляху).
// Негативний контроль (закон 1): ?breakSpot=obj.vehicle — авто німе, той самий шлях зупиняється; ?map=schengen без героя на мапі — показує мапу для знімка розкладки.
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { core, goAndDo, probe, talk } from './chapter-driver';
import { waitGameReady } from './ready';

const VIEWS = [{ side: 'portrait', w: 390, h: 844 }, { side: 'landscape', w: 932, h: 430 }] as const;
const SETTINGS_KEY = 'camplife.settings.v1';
const SHOTS = process.env.GAME_SHOTS === '1' ? 'research/game-291' : '';
const SCENE = 'dlg.ch2-schengen';
const TAIL = ['wave', 'w1', 'george', 'bottle', 'join', 'j1', 'joined', 'micro', 'trail', 't1', 'mark', 'close-m'];
const NODES = { sunny: ['open', 'arrive', 'three', ...TAIL], rain: ['open', 'open-rain', 'three', ...TAIL] } as const;
const PLACEMENT = JSON.parse(readFileSync(new URL('../../art/placement/schengen.json', import.meta.url), 'utf8')) as { objects: { id: string; x: number; y: number; w: number; h: number }[] };

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
}
const QUEST = (c: Awaited<ReturnType<typeof core>>, q: string): string | undefined => c.game.quests[q]?.status;
const hint = (page: Page): Promise<string> => page.locator('[data-ui="agenda-item"][data-current="yes"]').first().innerText();
const noScroll = (page: Page): Promise<boolean> => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const inFrame = async (page: Page, w: number): Promise<boolean> => { const b = await talk(page).boundingBox(); return b !== null && b.x >= 0 && b.x + b.width <= w + 1; };

/** Пам'ятник (слід із art/placement/schengen.json) у координатах екрана: за вікном камери з зонда й рамкою полотна. */
async function monumentOnScreen(page: Page): Promise<{ left: number; top: number; right: number; bottom: number; vw: number; vh: number }> {
  const m = PLACEMENT.objects.find((o) => o.id === 'monument');
  if (!m) throw new Error('пам\'ятника немає в art/placement/schengen.json');
  const p = await probe(page);
  const cv = await page.locator('canvas').first().boundingBox();
  if (!cv) throw new Error('полотна немає');
  const k = cv.width / p.view.w;
  // видимі пікселі пам'ятника (не весь аркуш 96×96): висота 2,5 м × 28 px/м = 70 px, ширина — обрізка аркуша (75 px) по центру сліду
  const wx0 = m.x - 37.5, wy0 = m.y - 70, wx1 = m.x + 37.5, wy1 = m.y;
  // Вікно камери береться зі скролу камери (cameraScrollX/Y), а не з worldView: worldView оновлюється лише в кадрі відмальовки й на мить після зміни мапи ще показує стару мапу
  return { left: cv.x + (wx0 - p.cameraScrollX) * k, top: cv.y + (wy0 - p.cameraScrollY) * k, right: cv.x + (wx1 - p.cameraScrollX) * k, bottom: cv.y + (wy1 - p.cameraScrollY) * k, vw: cv.x + cv.width, vh: cv.y + cv.height };
}

/** Читає сцену до кінця: кожен вузол рахується один раз; у вузлі вибору — перша відповідь. `onNode` — знімки. */
async function readScene(page: Page, onNode?: (node: string) => Promise<void>): Promise<string[]> {
  const nodes: string[] = [];
  for (let clicks = 0; clicks < 80; clicks++) {
    const d = (await core(page)).game.dialogue as { id: string; node: string } | null;
    if (d === null) break;
    if (d.id === 'dlg.ch2-pack') break;   // GAME-292: після Шенгену режисер відкриває сцену збору (її веде game-292.spec.ts) — сцена Шенгену на цьому кінчилась
    expect(d.id).toBe(SCENE);
    if (nodes[nodes.length - 1] !== d.node) { nodes.push(d.node); if (onNode) await onNode(d.node); }
    const acts = talk(page).locator('[data-act]');
    await expect(acts.first()).toBeVisible({ timeout: 5_000 });
    await acts.nth(0).click({ timeout: 5_000 }).catch(() => undefined);
    await page.waitForTimeout(450);   // «глухота» рамки ~350 мс після відповіді
  }
  return nodes;
}

for (const v of VIEWS) {
  for (const w of ['sunny', 'rain'] as const) {
    test(`${v.side} · ${w}: авто → набережна Шенгену → «Три країни, одна пляшка» → медальйон цілий, мікрокарта, мітка Джорджа → назад у кемпінг`, async ({ browser }) => {
      test.setTimeout(110_000);
      const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: true, isMobile: true });
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      if (SHOTS) mkdirSync(SHOTS, { recursive: true });
      const shot = async (tag: string): Promise<void> => { if (SHOTS) { await page.waitForTimeout(700); await page.screenshot({ path: `${SHOTS}/${tag}-${v.side}-${w}.png` }); } };
      await open(page, `ch2-schengen-${w}`);
      const before = await core(page);
      expect(before.game.player?.locationId).toBe('loc.camp.mullerthal');
      await expect.poll(async () => (await probe(page)).map, { timeout: 15_000 }).toBe('mullerthal');
      expect(QUEST(before, 'CH2-SCHENGEN-001')).toBe('active');
      expect([before.game.inventory['item.medallion.half2'], before.game.inventory['item.medallion']], 'пляшки ще не знайдено').toEqual([undefined, undefined]);
      await expect.poll(() => hint(page), { message: '«Далі» дня 3: авто — до пам’ятника' }).toContain('пам’ятника');
      await shot('start');
      // авто → рамка поїздки з єдиною відповіддю «Пам'ятник трьох країн» (поїздка кінчається НА набережній)
      await goAndDo(page, true);
      await expect(talk(page)).toBeVisible({ timeout: 6_000 });
      const answers = await talk(page).locator('[data-act]').evaluateAll((els) => els.filter((e) => e.getAttribute('data-act') !== 'cancel').map((e) => e.getAttribute('data-key') ?? ''));
      expect(answers, 'єдина відповідь поїздки').toEqual(['loc.schengen']);
      await talk(page).locator('[data-act][data-key="loc.schengen"]').click({ timeout: 5_000 });
      // герой на набережній, мапа Шенгену, сцену відкриває режисер сам
      await expect.poll(async () => (await core(page)).game.player?.locationId, { timeout: 8_000, message: 'поїздка кінчається на набережній' }).toBe('loc.schengen');
      await expect.poll(async () => (await probe(page)).map, { timeout: 15_000, message: 'мапа Шенгену' }).toBe('schengen');
      await expect.poll(async () => ((await core(page)).game.dialogue as { id: string } | null)?.id, { timeout: 8_000, message: 'сцена відкрилась сама' }).toBe(SCENE);
      await expect(talk(page)).toBeVisible({ timeout: 6_000 });
      expect(await inFrame(page, v.w), 'рамка розмови в межах екрана').toBe(true);
      // розкладка: пам'ятник цілком у вікні камери й не під рамкою розмови
      const m = await monumentOnScreen(page);
      const pr = await probe(page);
      const where = `герой ${Math.round(pr.playerX)},${Math.round(pr.playerY)} скрол ${Math.round(pr.cameraScrollX)},${Math.round(pr.cameraScrollY)} вікно ${pr.view.w}x${pr.view.h} пам'ятник ${JSON.stringify(m)}`;
      const frame = await talk(page).boundingBox();
      expect(m.left, `пам'ятник не виходить ліворуч (${where})`).toBeGreaterThanOrEqual(0);
      expect(m.right, `пам'ятник не виходить праворуч (${where})`).toBeLessThanOrEqual(m.vw);
      expect(m.top, `пам'ятник не виходить угору (${where})`).toBeGreaterThanOrEqual(0);
      expect(m.bottom, `пам'ятник не виходить униз (${where})`).toBeLessThanOrEqual(m.vh);
      expect(m.bottom, `пам'ятник не під рамкою розмови (${v.side})`).toBeLessThanOrEqual((frame?.y ?? m.vh) + 1);
      const nodes = await readScene(page, async (node) => { if (['open', 'open-rain', 'wave', 'bottle', 'join', 'joined', 'trail', 'mark'].includes(node)) await shot(`scene-${node}`); });
      expect(nodes, `шлях сцени (${nodes.join(' → ')})`).toEqual(NODES[w]);
      // сюжет сам завершив крок, з'єднав половинки й повернув у кемпінг
      await expect.poll(async () => QUEST(await core(page), 'CH2-SCHENGEN-001'), { timeout: 8_000, message: 'квест Шенгену завершився сам' }).toBe('completed');
      await expect.poll(async () => (await core(page)).game.inventory['item.medallion'], { timeout: 8_000, message: 'половинки з’єднано в медальйон' }).toBe(1);
      await expect.poll(async () => (await core(page)).game.player?.locationId, { timeout: 8_000, message: 'родина знову в кемпінгу' }).toBe('loc.camp.mullerthal');
      const after = await core(page);
      expect([after.game.inventory['item.medallion.half1'], after.game.inventory['item.medallion.half2'], after.game.inventory['item.microcard']], 'половинок не лишилось, мікрокарта є').toEqual([undefined, undefined, 1]);
      expect(after.game.flags.includes('f.ch2-george-trail'), 'мітка Джорджа на мапі').toBe(true);
      expect(after.game.flags.includes('f.ch2-schengen-rain'), 'прапорець дощу — лише в дощ').toBe(w === 'rain');
      expect(after.journal.filter((e) => e.type === 'StartScene' && e.ref === SCENE).length, 'сцена Шенгену зіграна один раз').toBe(1);
      expect((await probe(page)).map).toBe('mullerthal');
      expect(await noScroll(page), 'без горизонтальної прокрутки').toBe(true);
      await shot('after');
      expect(errors).toEqual([]);
      await ctx.close();
    });
  }
}

for (const v of VIEWS) {
  test(`${v.side} · розкладка набережної (мапа без рамки розмови): пам'ятник цілком у вікні камери`, async ({ browser }) => {
    test.setTimeout(90_000);
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    if (SHOTS) mkdirSync(SHOTS, { recursive: true });
    await open(page, 'ch2-schengen-sunny', '&map=schengen');
    await expect.poll(async () => (await probe(page)).map, { timeout: 15_000 }).toBe('schengen');
    await expect.poll(async () => { const p = await probe(page); return p.view.w > 0 && p.playerY > 0; }, { message: 'вікно камери й герой на місці' }).toBe(true);
    const m = await monumentOnScreen(page);
    expect([m.left >= 0, m.right <= m.vw, m.top >= 0, m.bottom <= m.vh], `пам'ятник цілком на екрані (${JSON.stringify(m)})`).toEqual([true, true, true, true]);
    expect(await noScroll(page)).toBe(true);
    if (SHOTS) { await page.waitForTimeout(900); await page.screenshot({ path: `${SHOTS}/map-${v.side}.png` }); }
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

test('негативний контроль: німе авто (?breakSpot=obj.vehicle) не відкриває поїздки, той самий шлях зупиняється', async ({ browser }) => {
  test.setTimeout(100_000);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await open(page, 'ch2-schengen-sunny', '&breakSpot=obj.vehicle');
  await goAndDo(page, true).catch(() => undefined);
  await page.waitForTimeout(1_200);
  const c = await core(page);
  expect(c.game.dialogue, 'сцени нема').toBeNull();
  expect(QUEST(c, 'CH2-SCHENGEN-001'), 'Шенген лишився непройденим').toBe('active');
  expect(c.game.player?.locationId).toBe('loc.camp.mullerthal');
  expect(c.journal.filter((e) => e.type === 'StartScene' && e.ref === SCENE).length, 'сцену Шенгену не зіграно').toBe(0);
  await ctx.close();
});
