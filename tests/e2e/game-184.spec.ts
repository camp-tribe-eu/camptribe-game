// GAME-184 · три побічні історії табору (продовження арок Нори, Інгрід і Люка): камера під Мією, зоряна карта з четвертою частиною від Мії і сценою біля вогнища, радіо Люка.
// Кожна історія — ЛИШЕ ногами, дією на мапі й відповідями в рамці розмови: від виходу на мапу табору (production mapFirst=1) спостерігач DOM фіксує будь-яку появу панелі ☰ — їх нуль.
// Спершу здається перше прохання просильника (відкриває продовження: «!» повертається), потім — продовження. Дві орієнтації телефона: 390×844 і 844×390.
// Мутації (перевірено, див. звіт): ?breakSpot=<ціль> (об'єкт німий) → історія не виконується, прохід червоніє; ?hideUi=requests (нема трекера) → «трекер є» червоніє;
// validator: after на чуже прохання / коло (REQUEST_AFTER_INVALID, scripts/validator/fixtures.mjs). Знімки здачі (SHOTS=1) → research/visual-audit/side-story-*.png.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

interface Pt { x: number; y: number }
interface Probe { saveLoaded: boolean; playerX: number; playerY: number; nearObject: string | null; residents: { id: string; x: number; y: number }[]; npcMarks: Record<string, string>; fx: { target: string | null; guide: string; pops: number } }
interface Core { game: { player: { locationId: string } | null; flags: string[]; dialogue: unknown }; journal: { type: string; ref?: string }[] }
const probe = (page: Page): Promise<Probe> => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __game: { probe: Probe } }).__game.probe)) as Probe);
const core = (page: Page): Promise<Core> => page.evaluate(() => (window as unknown as { __game: { read: () => Core } }).__game.read());
const SHOTS = process.env.SHOTS === '1';
const CAMP = 'loc.camp.lake';
const SETTINGS_KEY = 'camplife.settings.v1';

const TILE = 32;
interface TiledMap { width: number; height: number; layers: { name: string; data?: number[]; objects?: { name: string; x: number; y: number }[] }[] }
const MAP = JSON.parse(readFileSync(new URL('../../public/maps/camp-lake.tmj', import.meta.url), 'utf8')) as TiledMap;
const WALLS = MAP.layers.find((l) => l.name === 'walls')?.data ?? [];
const OBJ = new Map((MAP.layers.find((l) => l.name === 'objects')?.objects ?? []).map((o) => [o.name, { x: o.x, y: o.y }] as const));
const solid = (c: number, r: number): boolean => c < 0 || r < 0 || c >= MAP.width || r >= MAP.height || (WALLS[r * MAP.width + c] ?? 0) > 0;
const tile = (p: Pt): { c: number; r: number } => ({ c: Math.floor(p.x / TILE), r: Math.floor(p.y / TILE) });

function nextStep(from: { c: number; r: number }, to: { c: number; r: number }): { c: number; r: number } | null {
  const key = (c: number, r: number): number => r * MAP.width + c;
  const prev = new Map<number, number>([[key(from.c, from.r), -1]]);
  const q = [from];
  for (let i = 0; i < q.length; i++) {
    const t = q[i] as { c: number; r: number };
    if (t.c === to.c && t.r === to.r) {
      const path: number[] = [];
      for (let k = key(t.c, t.r); k >= 0; k = prev.get(k) ?? -1) path.unshift(k);
      const n = path[1];
      return n === undefined ? null : { c: n % MAP.width, r: Math.floor(n / MAP.width) };
    }
    for (const [dc, dr] of [[0, -1], [-1, 0], [0, 1], [1, 0]] as const) {
      const c = t.c + dc; const r = t.r + dr;
      if (solid(c, r) || prev.has(key(c, r))) continue;
      prev.set(key(c, r), key(t.c, t.r)); q.push({ c, r });
    }
  }
  return null;
}

/** Ногами (клавіші) до точки, яку перечитуємо щокроку. Жодних кліків по мапі й жодної кнопки ☰. */
async function walk(page: Page, where: (p: Probe) => Pt, done: (p: Probe) => boolean, label: string, maxMs = 70_000): Promise<Probe> {
  const keys = { ArrowLeft: false, ArrowRight: false, ArrowUp: false, ArrowDown: false };
  const set = async (want: Partial<typeof keys>): Promise<void> => {
    for (const k of Object.keys(keys) as (keyof typeof keys)[]) {
      const on = want[k] === true;
      if (on !== keys[k]) { keys[k] = on; await (on ? page.keyboard.down(k) : page.keyboard.up(k)); }
    }
  };
  const start = Date.now();
  try {
    while (Date.now() - start < maxMs) {
      const p = await probe(page);
      if (done(p)) return p;
      const here = tile({ x: p.playerX, y: p.playerY });
      const to = tile(where(p));
      const next = nextStep(here, to) ?? to;
      const dx = (next.c + 0.5) * TILE - p.playerX; const dy = (next.r + 0.5) * TILE - p.playerY;
      const vertical = next.c === here.c;
      const across = vertical ? dx : dy;
      const along = vertical ? dy : dx;
      const axis = Math.abs(across) > 3 ? across : along;
      const horizontal = Math.abs(across) > 3 ? vertical : !vertical;
      await set(horizontal ? { ArrowLeft: axis < 0, ArrowRight: axis > 0 } : { ArrowUp: axis < 0, ArrowDown: axis > 0 });
      await page.waitForTimeout(20);
    }
  } finally { await set({}); }
  throw new Error(`${label}: не дійшов: ${JSON.stringify(await probe(page))}`);
}

const panel = (page: Page) => page.locator('[data-ui="story"]');
async function act(page: Page, kind: string, key = ''): Promise<void> {
  await panel(page).locator(`[data-act="${kind}"][data-key="${key}"]`).click({ timeout: 8_000 });
  await page.waitForTimeout(400);
  if (kind === 'visit' && key === 'loc.road') {
    for (let i = 0; i < 6 && await panel(page).locator('[data-ui="dialogue"]').isVisible({ timeout: 400 }).catch(() => false); i++) {
      await panel(page).locator('[data-ui="dialogue"] [data-act]').last().click();
      await page.waitForTimeout(400);
    }
  }
}

/** Дорога до табору — кнопками панелі (як game-180/183: екран подорожі не цей зріз); далі спостерігач ☰ і лише ноги (production mapFirst=1). */
async function toCamp(page: Page, extra = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(([k]) => { try { localStorage.setItem(k as string, JSON.stringify({ textScale: 100, language: 'uk', hintSeen: true })); } catch { /* сховища немає */ } }, [SETTINGS_KEY] as const);
  await page.goto('/?seed=7');
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { saveLoaded: boolean } } }).__game?.probe.saveLoaded === true, null, { timeout: 30_000 });
  await page.locator('[data-touch="story"]').click();
  await panel(page).locator('[data-act="create"]', { hasText: /Велосипед|Bike/ }).first().click();
  await page.waitForTimeout(400);
  for (const [k, key] of [['complete', 'q.prologue-home-001'], ['complete', 'q.st-001'], ['complete', 'q.st-002'], ['visit', 'loc.shop'], ['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'],
    ['complete', 'q.st-003'], ['visit', 'loc.home'], ['complete', 'q.ch1-home-001'], ['visit', 'loc.road'], ['complete', 'q.st-004'], ['visit', 'loc.camp.lake']] as const) await act(page, k, key);
  expect((await core(page)).game.player?.locationId).toBe(CAMP);
  await page.waitForTimeout(600);   // автозбереження — на кожну команду
  await page.addInitScript(() => {
    // Спостерігач ☰: поява панелі (.ui-story) чи клік на кнопці ☰ — запис. Рамка розмови (.ui-talk) — не панель.
    const w = window as unknown as { __menu: string[] };
    w.__menu = [];
    const look = (): void => { if (document.querySelector('.ui-story') && !w.__menu.includes('panel')) w.__menu.push('panel'); };
    new MutationObserver(look).observe(document, { childList: true, subtree: true });
    document.addEventListener('click', (e) => { if ((e.target as Element | null)?.closest('[data-touch="story"]')) w.__menu.push('☰-click'); }, true);
  });
  await page.goto(`/?seed=7&mapFirst=1${extra}`);
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { saveLoaded: boolean } } }).__game?.probe.saveLoaded === true, null, { timeout: 30_000 });
  await page.locator('[data-ui="recovery-close"]').click({ timeout: 800 }).catch(() => undefined);
  await page.locator('[data-ui="recovery-reminder"] button', { hasText: 'Закрити' }).click({ timeout: 1_500 }).catch(() => undefined);
  expect((await core(page)).game.player?.locationId, 'сейв підхопився: гравець у таборі').toBe(CAMP);
  await expect.poll(async () => (await probe(page)).residents.length, { message: 'мешканці табору на мапі', timeout: 15_000 }).toBeGreaterThan(0);
  return errors;
}
const menuSeen = (page: Page): Promise<string[]> => page.evaluate(() => (window as unknown as { __menu: string[] }).__menu);

interface Req {
  id: string; giver: string; name: string; targets: string[]; track: string; goal: string; reward: string;
  /** кінцева відповідь здачі (кнопка, що ставить «здано») і рядок, який має прозвучати наприкінці */
  doneChoice: RegExp; closing: RegExp; shotName?: string;
}
interface Arc { key: string; first: Req; follow: Req }
const ARCS: Arc[] = [
  {
    key: 'nora',
    first: { id: 'req.nora-shore', giver: 'npc.nora', name: 'Нора', targets: ['req.nora-shore.t1', 'req.nora-shore.t2', 'req.nora-shore.t3'], track: 'Сміття', goal: 'Збери три шматки сміття на березі.', reward: '+15 досвіду · +10 ОМ', doneChoice: /Нема за що/, closing: /Чистий берег/ },
    follow: { id: 'req.nora-camera', giver: 'npc.nora', name: 'Нора', targets: ['req.nora-camera.t1'], track: 'Камера', goal: 'Знайди Норину камеру. Востаннє її бачили там, де лежить Мія.', reward: '+20 досвіду · +12 ОМ', doneChoice: /Мія просто охороняла/, closing: /не камеру, а мою мрію/, shotName: 'nora-camera' },
  },
  {
    key: 'ingrid',
    first: { id: 'req.ingrid-birds', giver: 'npc.ingrid', name: 'Інгрід', targets: ['req.ingrid-birds.t1'], track: 'Птахи', goal: 'Постій тихо на причалі й подивись на птахів.', reward: '+15 досвіду · +10 ОМ', doneChoice: /Було тихо/, closing: /моделями/ },
    follow: { id: 'req.ingrid-starmap', giver: 'npc.ingrid', name: 'Інгрід', targets: ['req.ingrid-starmap.t1', 'req.ingrid-starmap.t2', 'req.ingrid-starmap.t3', 'req.ingrid-starmap.t4'], track: 'Карта', goal: 'Збери чотири частини зоряної карти Інгрід. Четверту принесла Мія.', reward: '+20 досвіду · +12 ОМ', doneChoice: /Назвемо його Мія/, closing: /все небо над озером/, shotName: 'ingrid-starmap' },
  },
  {
    key: 'luc',
    first: { id: 'req.luc-chain', giver: 'npc.luc', name: 'Люк', targets: ['req.luc-chain.t1'], track: 'Ланцюг', goal: 'Огляни ланцюг на велосипеді Люка.', reward: '+15 досвіду · +10 ОМ', doneChoice: /Дрібниця/, closing: /скрипить тихіше/ },
    follow: { id: 'req.luc-radio', giver: 'npc.luc', name: 'Люк', targets: ['req.luc-radio.t1'], track: 'Радіо', goal: 'З’єднай дроти старого радіо, щоб у таборі заграла музика.', reward: '+20 досвіду · +12 ОМ', doneChoice: /Тепер у нас є саундтрек/, closing: /перемога/, shotName: 'luc-radio' },
  },
];
const flag = (id: string, part: string): string => `f.${id.replace(/\./g, '-')}-${part}`;
const giverAt = (r: Req) => (p: Probe): Pt => p.residents.find((x) => x.id === r.giver) as Pt;

const box = (page: Page) => panel(page).locator('[data-ui="dialogue"]');
async function closeTalk(page: Page): Promise<void> {
  for (let i = 0; i < 12 && await box(page).isVisible(); i++) { await panel(page).locator('[data-act]').last().click(); await page.waitForTimeout(420); }
  await expect(box(page)).toBeHidden({ timeout: 5_000 });
}

/** Підійти до просильника й заговорити (Space на мапі). Над ним мусить бути «!». */
async function openTalk(page: Page, r: Req): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    const near = await walk(page, giverAt(r), (p) => p.nearObject === r.giver, r.giver);
    expect(near.nearObject).toBe(r.giver);
    await expect.poll(async () => (await probe(page)).npcMarks[r.giver], { message: `${r.giver}: над головою нема «!»`, timeout: 5_000 }).toBe('request');
    if ((await probe(page)).nearObject === r.giver) await page.keyboard.press('Space');
    await expect(box(page), `${r.giver}: рамка розмови не відкрилась`).toBeVisible({ timeout: 8_000 }).catch(() => undefined);
    const who = (await box(page).isVisible()) ? await panel(page).locator('[data-ui="speaker"]').getAttribute('data-npc') : null;
    if (who === r.giver) break;
    expect(attempt, `${r.giver}: говорили з ${who} замість нього`).toBeLessThan(4);
    await closeTalk(page);
  }
  await expect(panel(page).locator('[data-ui="speaker"]')).toHaveText(r.name);
}

async function toCard(page: Page): Promise<void> {
  for (let i = 0; i < 8; i++) {
    if (await panel(page).locator('[data-ui="req-card"]').isVisible()) return;
    await panel(page).locator('[data-act="continue"]').click();
    await page.waitForTimeout(450);
  }
  await expect(panel(page).locator('[data-ui="req-card"]')).toBeVisible();
}

async function doTarget(page: Page, r: Req, spot: string, i: number): Promise<void> {
  const target = OBJ.get(spot) as Pt;
  expect((await probe(page)).fx.target, 'стрілка веде до наступної цілі').toBe(spot);
  await walk(page, () => target, (p) => Math.hypot(p.playerX - target.x, p.playerY - target.y) < 14 || p.nearObject === spot && Math.hypot(p.playerX - target.x, p.playerY - target.y) < 30, spot);
  await expect.poll(async () => (await core(page)).game.flags.includes(flag(r.id, `t${i + 1}`)), { message: `${spot}: прапорець цілі не став`, timeout: 6_000 }).toBe(true);
  await expect(page.locator(`[data-ui="req-row"][data-request="${r.id}"]`)).toHaveAttribute('data-done', String(i + 1));
}

/** Повний шлях: «!» → розмова → картка → «Беруся» → трекер → цілі → просильник → (сцена) → здача → журнал. */
async function playRequest(page: Page, r: Req, o: { orientation: string; follow: boolean }): Promise<void> {
  await openTalk(page, r);
  await toCard(page);
  const card = panel(page).locator('[data-ui="req-card"]');
  await expect(card.locator('[data-ui="req-goal"]')).toHaveText(r.goal);
  await expect(card.locator('[data-ui="req-reward"]')).toContainText(`Нагорода: ${r.reward}`);
  const geo = await page.evaluate(() => { const c = document.querySelector('[data-ui="req-card"]')?.getBoundingClientRect(); return { right: c?.right ?? 0, left: c?.left ?? 0, vw: innerWidth, scrollW: document.documentElement.scrollWidth }; });
  expect(geo.scrollW, 'без горизонтальної прокрутки').toBeLessThanOrEqual(geo.vw);
  expect(geo.right <= geo.vw + 1 && geo.left >= -1, 'картка в межах екрана').toBe(true);
  await panel(page).locator('[data-act="choose"]', { hasText: 'Беруся' }).click();
  await page.waitForTimeout(450);
  await closeTalk(page);
  expect((await core(page)).game.flags).toContain(flag(r.id, 'taken'));
  const row = page.locator(`[data-ui="req-row"][data-request="${r.id}"]`);
  await expect(row, 'трекер є').toHaveText(`${r.track} 0/${r.targets.length}`);
  for (const [i, spot] of r.targets.entries()) await doTarget(page, r, spot, i);
  await expect(row).toHaveAttribute('data-ready', 'yes');
  expect((await probe(page)).fx.target, 'усе зроблено — стрілка веде до просильника').toBe(r.giver);
  const pops = (await probe(page)).fx.pops;
  await openTalk(page, r);
  const done = panel(page).locator('[data-act="choose"]', { hasText: r.doneChoice });
  for (let i = 0; i < 10 && !(await done.isVisible()); i++) {
    const pick = panel(page).locator('[data-act="choose"]').first();
    if (await pick.isVisible()) await pick.click(); else await panel(page).locator('[data-act="continue"]').click();   // «Ходімо» до вогнища — вибір; решта — «Далі»
    await page.waitForTimeout(450);
  }
  await expect(done).toBeVisible();
  if (o.follow && r.shotName && SHOTS) { await expect(box(page)).toHaveAttribute('data-typing', 'no', { timeout: 8_000 }); await page.screenshot({ path: `research/visual-audit/side-story-${r.shotName}-${o.orientation}.png` }); }
  await done.click();
  await page.waitForTimeout(450);
  await expect(panel(page).locator('[data-ui="line"]')).toContainText(r.closing);
  await closeTalk(page);
  const c = await core(page);
  expect(c.game.flags).toContain(flag(r.id, 'done'));
  expect(c.journal.some((e) => e.type === 'Memory' && e.ref === flag(r.id, 'done')), 'запис у журналі').toBe(true);
  await expect.poll(async () => (await probe(page)).fx.pops, { message: '«+» над героєм' }).toBeGreaterThan(pops);
  await expect(row).toHaveCount(0);
}

const ORIENTATIONS = [
  { name: 'portrait', viewport: { width: 390, height: 844 } },
  { name: 'landscape', viewport: { width: 844, height: 390 } },
] as const;

for (const o of ORIENTATIONS) {
  test.describe(`GAME-184 побічні історії — ${o.name} ${o.viewport.width}×${o.viewport.height}`, () => {
    test.use({ viewport: o.viewport, hasTouch: false, isMobile: false });
    test.setTimeout(900_000);

    for (const arc of ARCS) {
      test(`${arc.follow.id}: перше прохання → продовження (нове «!») → цілі → здача, лише ногами, ☰ жодного разу`, async ({ page }) => {
        const errors = await toCamp(page);
        await playRequest(page, arc.first, { orientation: o.name, follow: false });
        // Продовження відкрилось: «!» повернувся до тієї самої людини, а нових цілей до розмови ще нема.
        await expect.poll(async () => (await probe(page)).npcMarks[arc.follow.giver], { message: 'продовження: «!» повернувся', timeout: 5_000 }).toBe('request');
        expect((await core(page)).game.flags).not.toContain(flag(arc.follow.id, 'taken'));
        await playRequest(page, arc.follow, { orientation: o.name, follow: true });
        // Наклейка Атласу за історію: умова — прапорець «здано», показує її сторінка Атласу (журнал/Атлас у ☰ тут не відкриваємо).
        expect(await menuSeen(page), 'панель ☰ жодного разу не відкривалась, поки ішла історія').toEqual([]);
        expect(errors, 'без помилок у консолі').toEqual([]);
      });
    }
  });
}

test.describe('GAME-184 негативні контролі', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: false, isMobile: false });
  test.setTimeout(900_000);

  test('німі дроти радіо (?breakSpot) → прапорець цілі не стає: прохід червоніє', async ({ page }) => {
    await toCamp(page, '&breakSpot=req.luc-radio.t1');
    const arc = ARCS[2] as Arc;
    await playRequest(page, arc.first, { orientation: 'neg', follow: false });
    await openTalk(page, arc.follow);
    await toCard(page);
    await panel(page).locator('[data-act="choose"]', { hasText: 'Беруся' }).click();
    await page.waitForTimeout(450);
    await closeTalk(page);
    await expect(doTarget(page, arc.follow, 'req.luc-radio.t1', 0), 'ціль німа — прапорець не стане').rejects.toThrow();
    expect((await core(page)).game.flags).not.toContain(flag(arc.follow.id, 't1'));
  });

  test('спостерігач ☰ вміє червоніти: клік на ☰ — запис', async ({ page }) => {
    await toCamp(page);
    expect(await menuSeen(page)).toEqual([]);
    await page.locator('[data-touch="story"]').click();
    expect((await menuSeen(page)).length, 'відкрита панель — запис').toBeGreaterThan(0);
  });
});
