// GAME-183 · табір без ☰: від приїзду до кінця табірного сюжету (дні 1–3) — лише ходьба, кнопка дії біля об'єкта й відповіді в рамці розмови / рамці вибору. Панель ☰ жодного разу не з'явилась.
// Дорога до табору (екран подорожі, дім, крамниця, дорога — не цей зріз) проходиться кнопками в звичайній збірці e2e; далі сторінка перезавантажується з ?mapFirst=1 (справжня поведінка,
// автозбереження підхоплює табір) — і від цієї миті спостерігач DOM фіксує будь-яку появу панелі ☰ (.ui-story). Обидві орієнтації телефона: 390×844 і 844×390.
// Негативні контролі (закон 1): ?breakSpot=step.ST-005 — крок мапою не робиться (прохід мусить застрягти); спостерігач справді бачить панель, коли її відкрити.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

interface Core { game: { player: { locationId: string } | null; flags: string[]; quests: Record<string, { status: string }>; inventory: Record<string, number>; dialogue: unknown; wave?: unknown; campaignEnded: boolean }; clock: { minutes: number } }
interface Probe { playerX: number; playerY: number; nearObject: string | null; saveLoaded: boolean; fx: { target: string | null; guide: string; ring: number } }
const core = (page: Page): Promise<Core> => page.evaluate(() => (window as unknown as { __game: { read: () => Core } }).__game.read());
const probe = (page: Page): Promise<Probe> => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __game: { probe: Probe } }).__game.probe)) as Probe);
const CAMP = 'loc.camp.lake';
const SETTINGS_KEY = 'camplife.settings.v1';
const VIEWS = [{ name: 'портрет', side: 'portrait', w: 390, h: 844 }, { name: 'ландшафт', side: 'landscape', w: 844, h: 390 }] as const;

// ---------- мапа табору: шлях по плитках, клавіші стрілок (як game-175.spec) ----------
interface Tmj { width: number; height: number; layers: { name: string; data?: number[]; objects?: { name: string; x: number; y: number }[] }[] }
const MAP = JSON.parse(readFileSync('public/maps/camp-lake.tmj', 'utf8')) as Tmj;
const WALLS = MAP.layers.find((l) => l.name === 'walls')?.data ?? [];
const OBJECTS = MAP.layers.find((l) => l.name === 'objects')?.objects ?? [];

function route(from: [number, number], spot: string): [number, number][] {
  // Останній збіг за іменем: step.CH1-D2-FIRE-001 стоїть на клітинці вогнища, але ім'я в нього своє.
  const o = OBJECTS.find((x) => x.name === spot);
  if (!o) throw new Error(`на мапі табору немає ${spot}`);
  const blocked = (tx: number, ty: number): boolean => (WALLS[ty * MAP.width + tx] ?? 1) > 0;
  const goal = (tx: number, ty: number): boolean => !blocked(tx, ty) && Math.hypot(tx * 32 + 16 - o.x, ty * 32 + 16 - o.y) <= 24;
  const start = [Math.floor(from[0] / 32), Math.floor(from[1] / 32)] as const;
  const prev = new Map<string, string | null>([[`${start[0]},${start[1]}`, null]]);
  const q: [number, number][] = [[start[0], start[1]]];
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i] as [number, number];
    if (goal(x, y)) {
      const out: [number, number][] = [];
      for (let k: string | null | undefined = `${x},${y}`; k; k = prev.get(k)) { const [a, b] = k.split(',').map(Number) as [number, number]; out.unshift([a * 32 + 16, b * 32 + 16]); }
      return out;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx; const ny = y + dy; const k = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || nx >= MAP.width || ny >= MAP.height || prev.has(k) || blocked(nx, ny)) continue;
      prev.set(k, `${x},${y}`); q.push([nx, ny]);
    }
  }
  throw new Error(`немає шляху до ${spot}`);
}

async function walk(page: Page, pts: [number, number][]): Promise<void> {
  await page.evaluate((pts) => new Promise<void>((resolve) => {
    const g = (window as unknown as { __game: { probe: { playerX: number; playerY: number } } }).__game;
    const down = new Set<string>();
    const fire = (type: string, key: string, code: number): void => {
      const e = new KeyboardEvent(type, { key, code: key, bubbles: true, cancelable: true });
      Object.defineProperty(e, 'keyCode', { get: () => code });
      window.dispatchEvent(e);
    };
    const codes: Record<string, number> = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40 };
    const set = (want: string | null): void => {
      for (const k of [...down]) if (k !== want) { fire('keyup', k, codes[k] as number); down.delete(k); }
      if (want && !down.has(want)) { fire('keydown', want, codes[want] as number); down.add(want); }
    };
    let i = 0;
    const t0 = performance.now();
    const tick = (): void => {
      const p = pts[i];
      if (!p || performance.now() - t0 > 45_000) { set(null); resolve(); return; }
      const dx = p[0] - g.probe.playerX;
      const dy = p[1] - g.probe.playerY;
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3) { i++; requestAnimationFrame(tick); return; }
      set(Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'ArrowLeft' : 'ArrowRight') : (dy < 0 ? 'ArrowUp' : 'ArrowDown'));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), pts);
}

const signature = async (page: Page): Promise<string> => {
  const c = await core(page);
  // Рамка вибору (авто, сушарка, крок із кількома виходами) — теж «дія спрацювала»: стан ядра ще не змінився, але гравцю вже питають, що саме.
  return JSON.stringify([await page.locator('.ui-talk').count(), c.game.player?.locationId, c.game.flags, Object.entries(c.game.quests).map(([k, v]) => `${k}:${v.status}`), c.game.inventory, c.game.dialogue, c.game.wave]);
};

// ---------- дорога до табору: екран подорожі (поза зрізом), звичайна збірка e2e ----------
const panel = (page: Page) => page.locator('.ui-story');
async function act(page: Page, kind: string, key = ''): Promise<void> {
  try { await panel(page).locator(`[data-act="${kind}"][data-key="${key}"]`).click({ timeout: 5_000 }); } catch { throw new Error(`крок «${kind} ${key}»: кнопки немає на екрані подорожі`); }
  await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії
  if (kind === 'visit' && (key === 'loc.road' || key === 'loc.camp.lake')) {
    const dlg = panel(page).locator('[data-ui="dialogue"]');
    for (let i = 0; i < 6 && await dlg.isVisible({ timeout: 400 }).catch(() => false); i++) { await dlg.locator('[data-act]').last().click(); await page.waitForTimeout(400); }
  }
}
/** Нова гра (соло, велосипед) → приїзд у табір (ST-005 активний) → автозбереження → перезавантаження з ?mapFirst=1: справжня гра, табір. */
async function arriveInCamp(page: Page, extra = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(([k]) => { try { localStorage.setItem(k as string, JSON.stringify({ textScale: 100, language: 'uk', hintSeen: true })); } catch { /* сховища немає */ } }, [SETTINGS_KEY] as const);
  await page.goto('/?seed=7');
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { saveLoaded: boolean } } }).__game?.probe.saveLoaded === true, null, { timeout: 30_000 });
  await page.locator('[data-touch="story"]').click();
  await panel(page).locator('[data-act="create"]', { hasText: /Велосипед|Bike/ }).first().click();
  await page.waitForTimeout(400);
  for (const [k, key] of [['complete', 'q.prologue-home-001'], ['complete', 'q.st-001'], ['complete', 'q.st-002'], ['visit', 'loc.shop'], ['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'], ['complete', 'q.st-003'],
    ['visit', 'loc.home'], ['complete', 'q.ch1-home-001'], ['visit', 'loc.road'], ['complete', 'q.st-004'], ['visit', 'loc.camp.lake']] as const) await act(page, k, key);
  expect((await core(page)).game.player?.locationId).toBe(CAMP);
  await page.waitForTimeout(600);   // автозбереження — на кожну команду
  await page.addInitScript(() => {
    // Спостерігач ☰: будь-яка поява панелі (.ui-story) чи клік на кнопці ☰ — запис. Рамка розмови (.ui-talk) — не панель.
    const w = window as unknown as { __menu: string[] };
    w.__menu = [];
    const look = (): void => { if (document.querySelector('.ui-story') && !w.__menu.includes('panel')) w.__menu.push('panel'); };
    new MutationObserver(look).observe(document, { childList: true, subtree: true });
    document.addEventListener('click', (e) => { if ((e.target as Element | null)?.closest('[data-touch="story"]')) w.__menu.push('☰-click'); }, true);
  });
  await page.goto(`/?seed=7&mapFirst=1${extra}`);
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { saveLoaded: boolean } } }).__game?.probe.saveLoaded === true, null, { timeout: 30_000 });
  await page.locator('[data-ui="recovery-close"]').click({ timeout: 800 }).catch(() => undefined);
  expect((await core(page)).game.player?.locationId, 'сейв підхопився: гравець у таборі').toBe(CAMP);
  return errors;
}
const menuSeen = (page: Page): Promise<string[]> => page.evaluate(() => (window as unknown as { __menu: string[] }).__menu);

// ---------- розмова й вибір на мапі ----------
const talk = (page: Page) => page.locator('.ui-talk [data-ui="dialogue"]');
/** Яку відповідь вибирає гравець у розмові з Елізою (за текстом): те, що веде сюжет; «просто привіталась» і прохання — ні. */
const PREFER = [/Де краще поставити намет/, /Чудово! Там і поставлю/, /Намет уже стоїть/, /Доброго ранку/, /Зрозуміло, дякую/, /Можна взяти мангал/, /Разом: кожен/, /Ми вже збираємося додому/, /Розкажімо по одній/, /Неодмінно/];
async function answerOne(page: Page): Promise<string> {
  const box = talk(page);
  const acts = await box.locator('[data-act]').evaluateAll((els) => els.map((e) => ({ act: e.getAttribute('data-act') ?? '', key: e.getAttribute('data-key') ?? '', text: (e as HTMLElement).innerText })));
  const choiceBox = acts.some((a) => a.act === 'cancel');
  let idx = -1;
  if (choiceBox) {
    // Рамка вибору дії (авто, сушарка, крок із вибором): авто — на дорогу, решта — перший варіант (не «Не зараз»).
    idx = acts.findIndex((a) => a.key === 'loc.road');
    if (idx < 0) idx = acts.findIndex((a) => a.act !== 'cancel');
  } else {
    for (const re of PREFER) { idx = acts.findIndex((a) => re.test(a.text)); if (idx >= 0) break; }
    if (idx < 0) idx = acts.findIndex((a) => a.act === 'continue');
    if (idx < 0) idx = acts.length - 1;
  }
  const a = acts[idx];
  if (!a) throw new Error('у рамці розмови немає жодної відповіді');
  await box.locator('[data-act]').nth(idx).click();
  await page.waitForTimeout(450);   // «глухота» рамки ~350 мс після відповіді
  return `${choiceBox ? 'choice' : 'talk'}:${a.act}:${a.key || a.text.slice(0, 24)}`;
}

const AUTO = (name: string): boolean => name.startsWith('step.') || name.startsWith('take.') || name === 'obj.vehicle' || name.startsWith('req.');
/** Один «заход»: куди каже стрілка → дійти → дія від наближення (кільце) або кнопка дії (E / тап по кнопці). Повертає назву цілі. */
async function goAndDo(page: Page, touch: boolean): Promise<string> {
  await expect.poll(async () => (await probe(page)).fx.target, { timeout: 20_000, message: 'стрілка «Далі» мусить вказувати ціль у таборі' }).not.toBeNull();
  const p = await probe(page);
  const target = p.fx.target as string;
  const before = await signature(page);
  for (let t = 0; t < 3; t++) {
    const q = t === 0 ? p : await probe(page);
    await walk(page, route([q.playerX, q.playerY], target));
    if (!AUTO(target)) {
      await expect.poll(async () => (await probe(page)).nearObject, { timeout: 5_000, message: `біля ${target} кнопка дії мусить знати, що поруч` }).toBe(target);
      if (touch) await page.locator('[data-touch="interact"]').tap();
      else { await page.keyboard.down('KeyE'); await page.waitForTimeout(200); await page.keyboard.up('KeyE'); }
    }
    try { await expect.poll(() => signature(page), { timeout: 5_000 }).not.toBe(before); break; } catch { /* ще раз із поточної точки */ }
  }
  expect(await signature(page), `біля ${target} дія не спрацювала`).not.toBe(before);
  await page.waitForTimeout(150);
  return target;
}

/** Табір від приїзду до виїзду: поки гравець у таборі — рамка (розмова чи вибір) → відповідь, підсумок дня → «Продовжити», інакше — ходьба до цілі зі стрілки. */
async function playCamp(page: Page, touch: boolean, log: string[]): Promise<string[]> {
  // Повертає запис спостерігача ☰ на МИТЬ ПЕРЕД останньою дією в таборі: що відкривається вже на дорозі (подія в дорозі) — наступний зріз, не табір.
  let inCamp: string[] = [];
  for (let i = 0; i < 120; i++) {
    const c = await core(page);
    if (c.game.player?.locationId !== CAMP) return inCamp;
    inCamp = await menuSeen(page);
    if (await page.locator('[data-ui="summary-continue"]').count()) { await page.locator('[data-ui="summary-continue"]').click(); log.push('summary'); await page.waitForTimeout(500); continue; }
    if (await talk(page).count()) { log.push(await answerOne(page)); continue; }
    log.push(await goAndDo(page, touch));
  }
  throw new Error(`табір не закінчився за 120 кроків: ${log.slice(-12).join(' → ')}`);
}

const DONE = ['ST-005', 'CH1-D2-001', 'CH1-D2-ELISE-001', 'CH1-D2-CAMP-001', 'CH1-D2-FIRE-001', 'CH1-D3-001', 'CH1-D3-GEAR-001', 'CH1-D3-ELISE-001'];

for (const v of VIEWS) {
  test(`табір від приїзду до виїзду без ☰: лише ходьба, дія біля об'єкта й рамки — ${v.name}`, async ({ browser }) => {
    test.setTimeout(900_000);
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errors = await arriveInCamp(page);
    // Кадр: ціль («Ціль: …») і стрілка «Далі» на мапі табору (картка PR).
    await expect(page.locator('[data-ui="goal"]')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-ui="next-hint"]')).toBeVisible();
    await expect.poll(async () => (await probe(page)).fx.guide, { timeout: 15_000 }).not.toBe('none');
    await page.screenshot({ path: `research/visual-audit/camp-goal-arrow-${v.side}.png` });
    const log: string[] = [];
    const seenInCamp = await playCamp(page, v.side === 'landscape', log);
    const c = await core(page);
    expect(c.game.player?.locationId, 'з табору виїхали авто/велосипедом на дорогу').toBe('loc.road');
    for (const q of DONE) expect(c.game.quests[q]?.status, `${q} завершено в таборі ногами`).toBe('completed');
    expect(seenInCamp, `панель ☰ ні разу не відкривалась, поки гравець у таборі (кроки: ${log.join(' → ')})`).toEqual([]);
    expect(log.some((s) => s.startsWith('choice:')), 'авто спитало «Куди їдемо?» у рамці вибору').toBe(true);
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

test.describe('негативні контролі (закон 1)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('?breakSpot=step.ST-005 — крок мапою не робиться: розділ застряг на ST-005 (перевірка «пройдено ногами» тут червоніє)', async ({ page }) => {
    test.setTimeout(300_000);
    await arriveInCamp(page, '&breakSpot=step.ST-005');
    const log: string[] = [];
    for (let i = 0; i < 12; i++) {
      if ((await core(page)).game.quests['ST-005']?.status !== 'active') break;
      if (await talk(page).count()) { log.push(await answerOne(page)); continue; }
      try { log.push(await goAndDo(page, false)); } catch { break; }
    }
    expect((await core(page)).game.quests['ST-005']?.status, 'німий об\'єкт кроку: ST-005 не завершився').toBe('active');
    expect(await menuSeen(page)).toEqual([]);   // ☰ не відкривали навіть тут: застрягти — не привід лізти в меню
  });

  test('спостерігач ☰ вміє червоніти: відкрита панель — запис «panel»; а в таборі панель не пропонує жодного кроку сюжету', async ({ page }) => {
    test.setTimeout(240_000);
    await arriveInCamp(page);
    expect(await menuSeen(page)).toEqual([]);
    await page.locator('[data-touch="story"]').click();
    await expect(panel(page)).toBeVisible();
    expect(await menuSeen(page)).toContain('panel');
    // ☰ у таборі: ні «Завершити», ні «Піти», ні «Узяти», ні «Висушити», ні «Продати»; лишаються журнал, Атлас і «Закрити».
    for (const kind of ['complete', 'visit', 'pickup', 'dry', 'sell', 'decline', 'talk', 'task']) await expect(panel(page).locator(`[data-act="${kind}"]`), `у ☰ табору є кнопка «${kind}»`).toHaveCount(0);
    await expect(panel(page).locator('[data-ui="atlas-open"]')).toBeVisible();
    await expect(panel(page).locator('[data-ui="journal"]')).toBeVisible();
    await expect(panel(page).locator('[data-ui="story-close"]')).toBeVisible();
  });

  test('авто на стоянці табору: рамка «Куди їдемо?» з напрямками й «Не зараз»; Escape скасовує, не відкриваючи ☰', async ({ page }) => {
    test.setTimeout(300_000);
    await arriveInCamp(page);
    // Рухаємось ногами до стоянки: ціль стрілки — не авто (там ST-005), тож ведемо героя до об'єкта вручну, як гравець.
    for (let t = 0; t < 3; t++) { const q = await probe(page); await walk(page, route([q.playerX, q.playerY], 'obj.vehicle')); if (await talk(page).count()) break; await page.waitForTimeout(1500); if (await talk(page).count()) break; }
    await expect(talk(page)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.ui-talk [data-ui="line"]')).toHaveText('Куди їдемо?');
    expect(await talk(page).locator('[data-act="visit"]').count(), 'є напрямки').toBeGreaterThanOrEqual(2);
    await expect(talk(page).locator('[data-act="cancel"]')).toHaveText('Не зараз');
    await page.keyboard.press('Escape');
    await expect(talk(page)).toHaveCount(0);
    expect((await core(page)).game.player?.locationId, 'Escape — «не зараз»: лишились у таборі').toBe(CAMP);
    expect(await menuSeen(page)).toEqual([]);
  });
});
