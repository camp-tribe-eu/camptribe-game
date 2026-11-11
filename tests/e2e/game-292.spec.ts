// GAME-292 · CH2-D3: день 3 розділу 2 після Шенгену — збір (мокрий чи сухий намет за погодою), прощання з Інгрід, авто «додому», підсумок розділу, сон, тизер розділу 3 (Ельзас) і Атлас із печаткою.
// Стан — з ядра (tests/e2e/fixtures/ch2-pack-<погода>.json, G292_WRITE=1 у src/content/ch2-pack.test.ts): розділ 2, родина в кемпінгу після Шенгену, крок збору активний, сцена ще попереду.
// Обидві орієнтації телефона. Рахуємо ВУЗЛИ сцени, а не кліки, і чекаємо СТАНУ гри, а не часу: клік, що не змінив вузол (рамка на мить глуха після відповіді), повторюємо — як гравець, що тисне ще раз.
// Розкладка (9:16 і 16:9): рамки й картки — в межах екрана, без горизонтальної прокрутки, підсумок без рядків розділу 1, печатка й тизер видимі; знімки для PR: GAME_SHOTS=1 → research/game-292.
// Негативний контроль (закон 1): ?breakSpot=obj.vehicle — авто німе, той самий шлях зупиняється й розділ НЕ завершується.
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { core, goAndDo, skipClockToEvening, talk } from './chapter-driver';
import { waitGameReady } from './ready';

const VIEWS = [{ side: 'portrait', w: 390, h: 844 }, { side: 'landscape', w: 932, h: 430 }] as const;
const SETTINGS_KEY = 'camplife.settings.v1';
const SHOTS = process.env.GAME_SHOTS === '1' ? 'research/game-292' : '';
const SCENE = 'dlg.ch2-pack';
const END = 'CH2-D3-HOME-001';
/** Вузли сцени збору на шляху «перші відповіді»: сухо / дощ. */
const NODES = {
  sunny: ['open', 'pack', 'p1', 'tent-dry', 'farewell', 'g1', 'final', 'road'],
  rain: ['open', 'open-wet', 'pack', 'p1', 'tent-wet', 'farewell', 'g1', 'final', 'road'],
} as const;

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
const noScroll = (page: Page): Promise<boolean> => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const inFrame = async (page: Page, w: number): Promise<boolean> => { const b = await talk(page).boundingBox(); return b !== null && b.x >= 0 && b.x + b.width <= w + 1; };
const nodeOf = async (page: Page): Promise<string | null> => ((await core(page)).game.dialogue as { node: string } | null)?.node ?? null;
/** Кадри, а не секунди: два кадри відмальовки (анімації рамки й нагороди вляглись). */
const frames = (page: Page, n = 3): Promise<void> => page.evaluate((k) => new Promise<void>((resolve) => { const f = (i: number): void => { if (i <= 0) resolve(); else requestAnimationFrame(() => f(i - 1)); }; f(k); }), n);

/** Читає сцену до кінця: кожен вузол рахується один раз; у вузлі вибору — перша відповідь. `onNode` — знімки (рамка з повним текстом). */
async function readScene(page: Page, onNode?: (node: string) => Promise<void>): Promise<string[]> {
  const nodes: string[] = [];
  for (let guard = 0; guard < 120; guard++) {
    const node = await nodeOf(page);
    if (node === null) break;
    const d = (await core(page)).game.dialogue as { id: string };
    expect(d.id).toBe(SCENE);
    if (nodes[nodes.length - 1] !== node) {
      nodes.push(node);
      await expect(talk(page)).toHaveAttribute('data-typing', 'no', { timeout: 8_000 });
      if (onNode) await onNode(node);
    }
    const acts = talk(page).locator('[data-act]');
    await expect(acts.first()).toBeVisible({ timeout: 5_000 });
    await acts.nth(0).click({ timeout: 5_000 }).catch(() => undefined);
    // стан, а не час: вузол змінився (або розмову закрито); холосту дотику (рамка ще глуха) відповідає наступна ітерація — повторний клік
    await expect.poll(() => nodeOf(page), { timeout: 3_000 }).not.toBe(node).catch(() => undefined);
  }
  return nodes;
}

for (const v of VIEWS) {
  for (const w of ['sunny', 'rain'] as const) {
    test(`${v.side} · ${w}: збір → прощання з Інгрід → авто додому → підсумок розділу → сон → тизер Ельзасу → Атлас із печаткою`, async ({ browser }) => {
      test.setTimeout(150_000);
      const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: true, isMobile: true });
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      if (SHOTS) mkdirSync(SHOTS, { recursive: true });
      const shot = async (tag: string): Promise<void> => { if (SHOTS) { await frames(page, 8); await page.screenshot({ path: `${SHOTS}/${tag}-${v.side}-${w}.png` }); } };
      await open(page, `ch2-pack-${w}`);
      const before = await core(page);
      expect(before.game.player?.locationId).toBe('loc.camp.mullerthal');
      expect([QUEST(before, 'CH2-SCHENGEN-001'), QUEST(before, 'CH2-D3-PACK-001'), QUEST(before, END)], 'Шенген позаду, збір активний, кінець розділу ще не відкрито').toEqual(['completed', 'active', undefined]);
      // сцену збору відкриває режисер сам (родина в кемпінгу на етапі збору)
      await expect.poll(async () => ((await core(page)).game.dialogue as { id: string } | null)?.id, { timeout: 15_000, message: 'сцена збору відкрилась сама' }).toBe(SCENE);
      await expect(talk(page)).toBeVisible({ timeout: 6_000 });
      expect(await inFrame(page, v.w), 'рамка розмови в межах екрана').toBe(true);
      const nodes = await readScene(page, async (node) => {
        expect(await inFrame(page, v.w), `рамка в межах екрана (${node})`).toBe(true);
        if (['open', 'open-wet', 'pack', 'tent-dry', 'tent-wet', 'farewell', 'road'].includes(node)) await shot(`scene-${node}`);
      });
      expect(nodes, `шлях сцени (${nodes.join(' → ')})`).toEqual(NODES[w]);
      // сюжет сам завершив крок збору й відкрив квест-кінець; розділ ще не завершено
      await expect.poll(async () => QUEST(await core(page), 'CH2-D3-PACK-001'), { timeout: 8_000, message: 'крок збору завершився сам' }).toBe('completed');
      await expect.poll(async () => QUEST(await core(page), END), { timeout: 8_000, message: 'квест-кінець відкрито' }).toBe('active');
      const mid = await core(page);
      expect(mid.game.campaignEnded, 'розділ ще не завершено: лише квест відкрито').toBe(false);
      expect(mid.game.flags.includes('f.ch2-pack-wet'), 'мокрий намет — лише в дощ').toBe(w === 'rain');
      expect(mid.game.inventory['item.medallion'], 'медальйон цілий').toBe(1);
      expect(mid.journal.filter((e) => e.type === 'StartScene' && e.ref === SCENE).length, 'сцена збору зіграна один раз').toBe(1);
      await expect.poll(() => page.locator('[data-ui="agenda-item"][data-current="yes"]').first().innerText(), { message: '«Далі»: авто — додому' }).toMatch(/додому/);
      await shot('after-scene');
      // авто → рамка поїздки з єдиною відповіддю «Дім»
      await goAndDo(page, true);
      await expect(talk(page)).toBeVisible({ timeout: 6_000 });
      const answers = await talk(page).locator('[data-act]').evaluateAll((els) => els.filter((e) => e.getAttribute('data-act') !== 'cancel').map((e) => e.getAttribute('data-key') ?? ''));
      expect(answers, 'єдина відповідь поїздки').toEqual(['loc.home']);
      await expect(talk(page).locator('[data-ui="line"]'), 'дорога додому — в один бік: без «потім назад у кемпінг»').not.toContainText('назад у кемпінг');
      await expect(talk(page).locator('[data-ui="line"]')).toContainText('додому');
      await shot('car-home');
      await talk(page).locator('[data-act][data-key="loc.home"]').click({ timeout: 5_000 });
      // приїхали додому: квест-кінець завершується сам, розділ завершено (з квесту), підсумок розділу відкривається сам
      await expect.poll(async () => (await core(page)).game.player?.locationId, { timeout: 15_000, message: 'родина вдома' }).toBe('loc.home');
      // подія в дорозі (якщо випала) читається, як гравець
      await expect.poll(async () => { const c = await core(page); if (c.game.dialogue !== null) { await talk(page).locator('[data-act]').first().click({ timeout: 2_000 }).catch(() => undefined); } return QUEST(c, END); }, { timeout: 30_000, message: 'квест-кінець завершився візитом' }).toBe('completed');
      const end = await core(page);
      expect(end.game.campaignEnded, 'chapter2 завершено наслідком квесту').toBe(true);
      const summary = page.locator('[data-ui="summary"]');
      await expect(summary, 'підсумок розділу відкрився сам').toBeVisible({ timeout: 15_000 });
      await expect(summary).toHaveAttribute('data-day', '3');
      // підсумок: лише розділ 2 (жодних рядків ночівлі й пакування розділу 1), квести — з назвами розділу 2
      const kinds = await summary.locator('[data-ui="summary-section"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-kind')));
      expect(kinds, 'ніч і пакування розділу 1 не просочуються').not.toContain('night');
      expect(kinds).not.toContain('packed');
      const rows = await summary.locator('[data-ui="summary-section"] li').evaluateAll((els) => els.map((e) => e.getAttribute('data-key') ?? ''));
      expect(rows.filter((k) => k.startsWith('q.')).every((k) => k.startsWith('q.ch2-')), `квести підсумку — розділу 2 (${rows.join(', ')})`).toBe(true);
      expect(rows.some((k) => /ch1|night|fish|firewood|tent/.test(k)), `жодних рядків розділу 1 (${rows.join(', ')})`).toBe(false);
      const sb = await summary.boundingBox();
      expect(sb !== null && sb.x >= 0 && sb.x + sb.width <= v.w + 1, 'підсумок у межах екрана').toBe(true);
      expect(await noScroll(page), 'без горизонтальної прокрутки').toBe(true);
      await expect(summary.locator('[data-ui="summary-safe"]'), 'усі категорії підсумку розгорнулись').toHaveCSS('opacity', '1');   // поява — CSS-анімація із затримкою: чекаємо стан, а не час
      await shot('summary');
      // «Продовжити» (а коли можна лягти — «Лягти спати»): сон веде до тизера; до вечора — перемотуємо годинник (тест не про час) і лягаємо з ☰
      const go = page.locator('[data-ui="summary-continue"]');
      const sleepsNow = /Лягти спати|Go to sleep/.test(await go.innerText());
      await go.click();
      if (!sleepsNow) {
        await expect(summary).toHaveCount(0);
        await skipClockToEvening(page);
        await page.locator('[data-touch="story"]').click();
        await expect(page.locator('[data-ui="story"]')).toBeVisible();
        await page.locator('[data-ui="story"] [data-act="sleep"]').click({ timeout: 5_000 });
      }
      const ep = page.locator('[data-ui="episode"]');
      await expect(ep, 'після сну — тизер розділу 3').toBeVisible({ timeout: 20_000 });
      await expect(ep.locator('[data-ui="episode-line"][data-kind="next"]')).toContainText(/Ельзас|Alsace/);
      await expect(ep.locator('[data-ui="episode-line"][data-kind="trace"]')).toContainText(/Тарт фламбе|тарт фламбе/);
      await expect(ep.locator('[data-ui="episode-line"][data-kind="recap"]')).toHaveCount(3);
      await ep.click({ position: { x: 4, y: 4 } });   // перший дотик — показати все одразу
      await expect(ep).toHaveAttribute('data-state', 'all');
      const lines = await ep.locator('[data-ui="episode-line"]').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, sh: e.scrollHeight, ch: e.clientHeight }; }));
      expect(lines.every((l) => l.l >= 0 && l.r <= v.w + 1 && l.t >= 0 && l.b <= v.h + 1 && l.sh <= l.ch + 1), `рядки тизера в межах екрана й без обрізки (${JSON.stringify(lines)})`).toBe(true);
      expect(await noScroll(page)).toBe(true);
      await shot('teaser');
      expect((await core(page)).game.campaignEnded).toBe(true);
      await page.locator('[data-ui="episode-skip"]').click();
      await expect(ep).toHaveCount(0);
      // після тизера — збережена гра й меню паузи; повертаємось у гру й відкриваємо Атлас
      await expect(page.locator('[data-ui="pause"]')).toBeVisible({ timeout: 10_000 });
      await page.locator('[data-ui="resume"]').click();
      await expect(page.locator('[data-ui="pause"]')).toHaveCount(0);
      await page.locator('[data-touch="story"]').click();
      await expect(page.locator('[data-ui="story"]')).toBeVisible();
      await expect(page.locator('[data-ui="ended"]'), 'у ☰ — кінець розділу 2').toContainText(/Розділ II|Chapter II/);
      await page.locator('[data-ui="atlas-open"]').click();
      const panel = page.locator('[data-ui="atlas-panel"]');
      await expect(panel).toBeVisible();
      // мапа Атласу: Люксембург з печаткою
      await expect(panel.locator('[data-place="luxembourg"]')).toHaveAttribute('data-state', 'stamped');
      await expect(panel.locator('[data-place="luxembourg"] .ui-amap-name')).toHaveText('Люксембург');
      await shot('atlas-map');
      // сторінка Люксембургу: печатка, медальйон, мікрокарта, нотатка дідуся про тарт фламбе
      const lux = panel.locator('[data-ui="luxembourg"]');
      await lux.scrollIntoViewIfNeeded();
      await expect(lux.locator('[data-ui="lux-stamp"]')).toBeVisible();
      await expect(lux.locator('[data-ui="lux-medallion"]')).toHaveAttribute('data-state', 'whole');
      await expect(lux.locator('[data-ui="lux-microcard"]')).toBeVisible();
      await expect(lux.locator('[data-ui="lux-note"]')).toContainText(/Кольмар/);
      const box = async (sel: string): Promise<{ x: number; y: number; width: number; height: number }> => { const b = await lux.locator(sel).boundingBox(); if (!b) throw new Error(sel); return b; };
      const stamp = await box('[data-ui="lux-stamp"]');
      const items = await box('.ui-lux-items');
      const note = await box('[data-ui="lux-note"]');
      const inside = (b: { x: number; y: number; width: number; height: number }): boolean => b.x >= 0 && b.x + b.width <= v.w + 1 && b.y >= 0 && b.y + b.height <= v.h + 1;
      expect([inside(stamp), inside(items), inside(note)], `печатка, перелік і нотатка повністю в екрані (${JSON.stringify({ stamp, items, note })})`).toEqual([true, true, true]);
      const apart = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean => a.x + a.width <= b.x + 1 || b.x + b.width <= a.x + 1 || a.y + a.height <= b.y + 1 || b.y + b.height <= a.y + 1;
      expect([apart(stamp, items), apart(stamp, note), apart(items, note)], 'печатка, перелік і нотатка не накладаються').toEqual([true, true, true]);
      expect(await noScroll(page)).toBe(true);
      await shot('atlas-luxembourg');
      expect(errors).toEqual([]);
      await ctx.close();
    });
  }
}

test('негативний контроль: німе авто (?breakSpot=obj.vehicle) — після збору дорога додому не відкривається, розділ НЕ завершується', async ({ browser }) => {
  test.setTimeout(100_000);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await open(page, 'ch2-pack-sunny', '&breakSpot=obj.vehicle');
  await expect.poll(async () => ((await core(page)).game.dialogue as { id: string } | null)?.id, { timeout: 15_000 }).toBe(SCENE);
  await readScene(page);
  await expect.poll(async () => QUEST(await core(page), END), { timeout: 8_000 }).toBe('active');
  await goAndDo(page, true).catch(() => undefined);
  await frames(page, 30);
  const c = await core(page);
  expect(c.game.player?.locationId, 'авто німе: з кемпінгу не поїхали').toBe('loc.camp.mullerthal');
  expect(QUEST(c, END), 'квест-кінець лишився активним').toBe('active');
  expect(c.game.campaignEnded, 'розділ не завершено без квесту').toBe(false);
  await expect(page.locator('[data-ui="episode"]')).toHaveCount(0);
  await ctx.close();
});


// HUD на мапах розділу 2 поза Мюллерталем (відомий дефект GAME-291: «назва кемпінгу й застаріла ціль»). Коренем був знімок ?map=schengen (мапа підмінена, а герой за ядром лишається в кемпінгу): HUD бере місце з
// локації героя, а не з мапи. У живому шляху HUD уже правильний, і це сторож: кожен кадр поїздки до Шенгену міряє, де герой за ядром, і що написано в HUD. Спостерігач крутиться покадрово (rAF), без таймерів.
test('HUD на мапі Шенгену: назва місця й ціль — за локацією героя, без назви кемпінгу й без «до пам’ятника» вже на набережній', async ({ browser }) => {
  test.setTimeout(100_000);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await open(page, 'ch2-schengen-sunny');
  await page.evaluate(() => {
    const w = window as unknown as { __game: { read: () => { game: { player: { locationId: string } | null } } }; __hud: string[] };
    w.__hud = [];
    const f = (): void => {
      const loc = w.__game.read().game.player?.locationId ?? '-';
      const place = document.querySelector('[data-ui="hud-place"]')?.textContent ?? '-';
      const hint = document.querySelector('[data-ui="agenda-item"][data-current="yes"]')?.textContent ?? '-';
      const s = `${loc}|${place}|${hint}`;
      if (w.__hud[w.__hud.length - 1] !== s) w.__hud.push(s);
      requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
  await goAndDo(page, true);
  await talk(page).locator('[data-act][data-key="loc.schengen"]').click({ timeout: 5_000 });
  await expect.poll(async () => ((await core(page)).game.dialogue as { id: string } | null)?.id, { timeout: 20_000 }).toBe('dlg.ch2-schengen');
  const seen = (await page.evaluate(() => (window as unknown as { __hud: string[] }).__hud)).map((x) => x.split('|') as [string, string, string]);
  const camp = seen.filter(([loc, place]) => loc === 'loc.camp.mullerthal' && place !== '-');
  const quay = seen.filter(([loc, place]) => loc === 'loc.schengen' && place !== '-');
  expect(camp.length, 'сторож не сліпий: у кемпінгу спостерігач бачить HUD з назвою кемпінгу').toBeGreaterThan(0);
  expect(camp.every(([, place]) => place === 'Кемпінг «Мюллерталь»')).toBe(true);
  expect(quay.length, `на набережній HUD бачили (${JSON.stringify(seen)})`).toBeGreaterThan(0);
  expect(quay.every(([, place]) => place === 'Пам\'ятник трьох країн'), `місце на набережній — пам'ятник, не кемпінг (${JSON.stringify(quay)})`).toBe(true);
  expect(quay.every(([, , hint]) => !/пам.ятника/.test(hint)), `ціль «до пам'ятника» вже не показується на набережній (${JSON.stringify(quay)})`).toBe(true);
  await ctx.close();
});
