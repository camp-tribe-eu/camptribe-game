// GAME-98 · телефон вбік: 1) контраст тексту HUD на НАПІВПРОЗОРІЙ рамці поверх мапи; 2) фокус після закриття паузи й підсумку дня.
// 1) axe на напівпрозорому тлі над полотном повертає «incomplete» — тобто нічого не міряє (закон 4). Тут міряємо з пікселів
//    скріншота: текст робимо прозорим, знімаємо рамку — і маємо справжнє змішане тло під рядком; найсвітліший піксель — найгірший
//    випадок. Друга вимога строгіша: найсвітліший піксель УСЬОГО видимого поля гри, змішаний із тлом рамки (мапа рухається, і
//    під рамку може заїхати будь-яка плитка). Обидва ≥ 4.5:1 (WCAG AA, звичайний текст).
// 2) Після «Продовжити» в паузі (і Escape) фокус — на #stage, як після екрана подорожі, а не на <body>.
// Негативні контролі (мутації) — у звіті картки: альфа рамки 30 % замість 85 % → червоне; без повернення фокуса → червоне.
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';

const SETTINGS_KEY = 'camplife.settings.v1';
const AA = 4.5;
type Rgb = readonly [number, number, number];
interface Rect { x: number; y: number; width: number; height: number }

async function open(browser: Browser, vp: { width: number; height: number }, touch: boolean, hintSeen = true): Promise<Page> {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, ...(touch ? { hasTouch: true, isMobile: true } : {}) });
  const page = await ctx.newPage();
  await page.addInitScript(([k, seen]) => { try { localStorage.setItem(k as string, JSON.stringify({ textScale: 100, language: 'uk', hintSeen: seen })); } catch { /* сховища немає */ } }, [SETTINGS_KEY, hintSeen] as const);
  // holdToast: тост живе 5 с від старту, а на повільному CI сторінка готова пізніше — без перемикача тест червонів би
  // за часом, а не за контрастом (рецензія Fable, GAME-98).
  await page.goto(hintSeen ? '/?seed=2' : '/?seed=2&holdToast=1');
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { saveLoaded: boolean } } }).__game?.probe.saveLoaded === true, null, { timeout: 30_000 });
  // Полотно Phaser має встигнути намалювати мапу: інакше «тло» — порожній чорний, і контраст вийшов би завищеним.
  await expect.poll(async () => (await page.locator('#stage canvas').evaluate((el) => el.getBoundingClientRect().height)) / vp.height, { timeout: 15_000 }).toBeGreaterThanOrEqual(0.85);
  return page;
}

/** Відносна яскравість WCAG 2.x. */
const lum = ([r, g, b]: Rgb): number => {
  const ch = (v: number): number => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
};
const ratio = (a: Rgb, b: Rgb): number => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number]; return (hi + 0.05) / (lo + 0.05); };
const hex = (c: Rgb): string => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** Колір із обчисленого стилю: rgb(…) / rgba(…). */
async function cssColor(loc: Locator, prop: 'color' | 'backgroundColor'): Promise<{ rgb: Rgb; a: number }> {
  const s = await loc.evaluate((el, p) => getComputedStyle(el)[p as 'color'], prop);
  const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(s);
  if (!m) throw new Error(`колір не розібрано: ${s}`);
  return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], a: m[4] === undefined ? 1 : Number(m[4]) };
}

/** Найсвітліший піксель (за яскравістю WCAG) у прямокутнику скріншота сторінки. PNG розбирає сам браузер. */
async function lightest(page: Page, clip: Rect): Promise<{ rgb: Rgb; n: number }> {
  const png = await page.screenshot({ clip, animations: 'disabled' });
  const px = await page.evaluate(async (b64) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bin], { type: 'image/png' }));
    const cv = new OffscreenCanvas(bmp.width, bmp.height);
    const cx = cv.getContext('2d');
    if (!cx) throw new Error('2d недоступний');
    cx.drawImage(bmp, 0, 0);
    return Array.from(cx.getImageData(0, 0, bmp.width, bmp.height).data);
  }, png.toString('base64'));
  let best: Rgb = [0, 0, 0];
  let bestL = -1;
  for (let i = 0; i < px.length; i += 4) {
    const c: Rgb = [px[i] ?? 0, px[i + 1] ?? 0, px[i + 2] ?? 0];
    const l = lum(c);
    if (l > bestL) { bestL = l; best = c; }
  }
  return { rgb: best, n: px.length / 4 };
}

const box = async (loc: Locator): Promise<Rect> => {
  const b = await loc.boundingBox();
  if (!b) throw new Error('немає прямокутника');
  return { x: Math.floor(b.x), y: Math.floor(b.y), width: Math.floor(b.width), height: Math.floor(b.height) };
};
const HIDE_TEXT = 'hud-text-off';
const setStyle = (page: Page, id: string, css: string | null): Promise<void> => page.evaluate(([i, c]) => {
  document.getElementById(i as string)?.remove();
  if (c === null) return;
  const s = document.createElement('style'); s.id = i as string; s.textContent = c; document.head.append(s);
}, [id, css] as const);

/** Текст (sel) на напівпрозорому тлі (bgSel) поверх мапи: зміряне тло під рядком і найгірше тло з усього поля. */
async function measure(page: Page, vp: { width: number; height: number }, sel: string, bgSel: string): Promise<{ under: number; worst: number; note: string }> {
  const text = await cssColor(page.locator(sel).first(), 'color');
  expect(text.a, `${sel}: колір тексту непрозорий`).toBe(1);
  const bg = await cssColor(page.locator(bgSel).first(), 'backgroundColor');
  expect(bg.a, `${bgSel}: тло напівпрозоре — саме той випадок, де axe каже «incomplete»`).toBeLessThan(1);
  let line = await box(page.locator(sel).first());
  if (sel === bgSel) {
    // Текст і тло — один елемент із заокругленими кутами: у кутах рамки без тла видно голу мапу. Беремо контентну коробку
    // (без padding) — саме там лежить текст.
    const p = await page.locator(sel).first().evaluate((el) => { const s = getComputedStyle(el); return [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].map((v) => Math.ceil(parseFloat(v))); });
    const [t = 0, r = 0, b = 0, l = 0] = p;
    line = { x: line.x + l, y: line.y + t, width: line.width - l - r, height: line.height - t - b };
  }
  expect(line.width * line.height, `${sel}: рядок має площу`).toBeGreaterThan(0);
  // Текст прозорий — у знімку лишається лише тло, змішане браузером з мапою під ним.
  await setStyle(page, HIDE_TEXT, `${bgSel}, ${bgSel} * { color: transparent !important; text-shadow: none !important; }`);
  const under = await lightest(page, line);
  // Та сама ділянка без рамки — гола мапа; вона мусить бути світлішою, інакше ми зняли не мапу (а, скажімо, чорне порожнє полотно).
  await setStyle(page, HIDE_TEXT, '.ui-header { visibility: hidden !important; }');
  const bare = await lightest(page, line);
  // Найсвітліший піксель усього екрана без шапки — разом із кнопками дотику (☰/джойстик): це суворіше за «найсвітліший тайл».
  const field = await lightest(page, { x: 0, y: 0, width: vp.width, height: vp.height });
  await setStyle(page, HIDE_TEXT, null);
  expect(under.n, 'зміряно пікселів під рядком').toBe(line.width * line.height);
  expect(lum(bare.rgb), `гола мапа ${hex(bare.rgb)} світліша за тло рамки ${hex(under.rgb)} — зняли саме мапу`).toBeGreaterThan(lum(under.rgb));
  // Найгірше тло: найсвітліший піксель поля гри під тлом рамки (альфа-змішування, як у браузера).
  const mix: Rgb = [0, 1, 2].map((i) => bg.a * (bg.rgb[i] ?? 0) + (1 - bg.a) * (field.rgb[i] ?? 0)) as unknown as Rgb;
  const r = { under: ratio(text.rgb, under.rgb), worst: ratio(text.rgb, mix) };
  const note = `${sel} ${hex(text.rgb)}: під рядком ${hex(under.rgb)} → ${r.under.toFixed(2)}:1; найсвітліше поле ${hex(field.rgb)} під ${hex(bg.rgb)}·${bg.a} = ${hex(mix)} → ${r.worst.toFixed(2)}:1`;
  console.log(`GAME-98 контраст ${vp.width}×${vp.height}: ${note}`);
  return { ...r, note };
}

for (const vp of [{ width: 844, height: 390 }, { width: 667, height: 375 }]) {
  test(`${vp.width}×${vp.height} дотик: текст рамки «день · час · гроші» ≥ ${AA}:1 на змішаному тлі (пікселі, не axe)`, async ({ browser }) => {
    const page = await open(browser, vp, true);
    for (const sel of ['[data-ui="hud-time"]', '[data-ui="hud-money"]']) {
      const r = await measure(page, vp, sel, '[data-ui="hud"]');
      expect(r.under, r.note).toBeGreaterThanOrEqual(AA);
      expect(r.worst, r.note).toBeGreaterThanOrEqual(AA);
    }
    await page.context().close();
  });
}

test('844×390 дотик: тост-підказка поруч із рамкою ≥ 4.5:1 на змішаному тлі', async ({ browser }) => {
  const vp = { width: 844, height: 390 };
  const page = await open(browser, vp, true, false);
  // Тост утримано перемикачем holdToast (лише збірка e2e); якщо його немає — тест червоний, а не «пропущено».
  await expect(page.locator('[data-ui="hint"]')).toBeVisible();
  const r = await measure(page, vp, '[data-ui="hint"]', '[data-ui="hint"]');
  expect(r.under, r.note).toBeGreaterThanOrEqual(AA);
  expect(r.worst, r.note).toBeGreaterThanOrEqual(AA);
  await page.context().close();
});

const focusId = (page: Page): Promise<string> => page.evaluate(() => (document.activeElement === document.body ? 'body' : document.activeElement?.id || document.activeElement?.tagName || 'none'));

for (const vp of [{ width: 844, height: 390 }, { width: 390, height: 844 }]) {
  test(`${vp.width}×${vp.height} дотик: ‖ → «Продовжити» — фокус на полі гри (#stage), не на <body>`, async ({ browser }) => {
    const page = await open(browser, vp, true);
    await page.locator('[data-touch="pause"]').tap();
    await expect(page.locator('[data-ui="pause"]')).toBeVisible();
    await expect(page.locator('[data-ui="resume"]')).toBeFocused();   // контроль: фокус справді був у діалозі
    await page.locator('[data-ui="resume"]').tap();
    await expect(page.locator('[data-ui="pause"]')).toHaveCount(0);
    await expect.poll(() => focusId(page), { timeout: 5_000 }).toBe('stage');
    await page.context().close();
  });
}

test('1280×800 клавіатура: Escape відкриває й закриває паузу — фокус на #stage', async ({ browser }) => {
  const page = await open(browser, { width: 1280, height: 800 }, false);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-ui="pause"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-ui="pause"]')).toHaveCount(0);
  await expect.poll(() => focusId(page), { timeout: 5_000 }).toBe('stage');
  await page.context().close();
});

test('844×390 дотик: підсумок дня → «Продовжити» — фокус на #stage', async ({ browser }) => {
  test.setTimeout(120_000);
  const page = await open(browser, { width: 844, height: 390 }, true);
  const panel = page.locator('[data-ui="story"]');
  const tap = async (loc: Locator): Promise<void> => { await loc.scrollIntoViewIfNeeded(); await loc.tap(); await page.waitForTimeout(400); };   // GAME-80: панель глуха ~350 мс
  await tap(page.locator('[data-touch="story"]'));
  await tap(panel.locator('[data-act="create"]', { hasText: /Авто|Car/ }).first());
  for (const [k, key] of [['complete', 'q.prologue-home-001'], ['complete', 'q.st-001'], ['complete', 'q.st-002'], ['visit', 'loc.shop'], ['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'],
    ['complete', 'q.st-003'], ['visit', 'loc.home'], ['complete', 'q.ch1-home-001'], ['visit', 'loc.road']] as const) await tap(panel.locator(`[data-act="${k}"][data-key="${key}"]`));
  if (await panel.locator('[data-key="dlg.road-apples.box.c1"]').isVisible({ timeout: 400 }).catch(() => false)) {
    await tap(panel.locator('[data-key="dlg.road-apples.box.c1"]'));
    await tap(panel.locator('[data-act="continue"]'));
  }
  for (const [k, key] of [['complete', 'q.st-004'], ['visit', 'loc.camp.lake'], ['talk', 'npc.elise'], ['choose', 'dlg.elise-greeting.hello.c2'], ['continue', ''],
    ['choose', 'dlg.elise-greeting.spot.c1'], ['continue', ''], ['pickup', 'item.firewood'], ['complete', 'q.st-005']] as const) await tap(panel.locator(`[data-act="${k}"][data-key="${key}"]`));
  const summary = page.locator('[data-ui="summary"]');
  await expect(summary).toBeVisible();
  await tap(summary.locator('[data-ui="summary-continue"]'));
  await expect(summary).toHaveCount(0);
  await expect.poll(() => focusId(page), { timeout: 5_000 }).toBe('stage');
  await page.context().close();
});
