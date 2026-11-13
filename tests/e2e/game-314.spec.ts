// GAME-314 · зразковий день біля озера ОДНИМ живим проходом, дотиком, в обох орієнтаціях (390×844 і 932×430):
// відʼїзд → дорога (міні-гра mg.drive, штраф камери — з гаманця) → приїзд, вибір ділянки (з тих, що лишила дорога) → заїзд (drive-in) →
// день: дошка табору (рутини, пристрої) і місія сусіда ногами по мапі → ніч із бурею на ОДНІЙ моделі (camp-night) → підсумок.
// Геро ходить лише всередині сторінки (requestAnimationFrame), як game-93/179/312; дорогу веде той самий rAF-бот із DOM (вільна смуга — data-free).
// Знімки в research/game-314/ — за G314_SHOTS=1. Вимірений час проходу пишеться в консоль (G314 E2E ...).
import { mkdirSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { waitGameReady } from './ready';
import { laneOf, solve } from '../../src/content/drive-in';
interface Pt { x: number; y: number }
interface Probe { playerX: number; playerY: number; nearObject: string | null; residents: { id: string; x: number; y: number }[]; npcMarks: Record<string, string> }
const probe = (page: Page): Promise<Probe> => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __game: { probe: Probe } }).__game.probe)) as Probe);
const SHOTS = process.env.G314_SHOTS === '1';
if (SHOTS) mkdirSync('research/game-314', { recursive: true });
const shot = async (page: Page, name: string): Promise<void> => { if (SHOTS) await page.screenshot({ path: `research/game-314/${name.replace(/-(portrait|landscape)$/, '')}-${(page.viewportSize()?.width ?? 0) < (page.viewportSize()?.height ?? 0) ? 'portrait' : 'landscape'}.png` }); };
const TILE = 32;
interface TiledMap { width: number; height: number; layers: { name: string; data?: number[]; objects?: { name: string; x: number; y: number }[] }[] }
const MAP = JSON.parse(readFileSync(new URL('../../public/maps/camp-lake.tmj', import.meta.url), 'utf8')) as TiledMap;
const WALLS = MAP.layers.find((l) => l.name === 'walls')?.data ?? [];
/** Якорі зон табору (src/view/world/ambient.ts → ZONES): туди веде похід місії. */
const ZONE: Record<string, Pt> = Object.fromEntries(([['sanitary', 23, 6], ['clearing', 21, 18], ['tents-old', 1, 5], ['pier', 35, 7], ['campfire', 3, 5], ['tents-south', 4, 16]] as const).map(([z, c, r]) => [z, { x: (c + 0.5) * TILE, y: (r + 0.5) * TILE }]));

type Goal = { at: Pt } | { resident: string };
/** Пішки до цілі всередині сторінки (rAF): стоп — коли співрозмовник `id` у зоні дії (і Space, якщо `act`), коли герой біля `spot`, або коли відкрилась міні-гра місії. */
async function walkTo(page: Page, id: string, goal: Goal, opts: { spot?: Pt; act?: boolean; untilMinigame?: boolean } = {}, maxMs = 90_000): Promise<{ pressed: boolean; minigame: boolean }> {
  const r = await page.evaluate(({ id, goal, maxMs, spot, act, untilMinigame, walls, cols, rows, tileSize }) => new Promise<{ pressed: boolean; minigame: boolean } | null>((resolve) => {
    const g = (window as unknown as { __game: { probe: { playerX: number; playerY: number; nearObject: string | null; residents: { id: string; x: number; y: number }[]; npcMarks: Record<string, string> } } }).__game;
    const solid = (c: number, r: number): boolean => c < 0 || r < 0 || c >= cols || r >= rows || (walls[r * cols + c] ?? 0) > 0;
    const nextStep = (from: { c: number; r: number }, to: { c: number; r: number }): { c: number; r: number } | null => {
      const key = (c: number, r: number): number => r * cols + c;
      const prev = new Map<number, number>([[key(from.c, from.r), -1]]);
      const q = [from];
      for (let i = 0; i < q.length; i++) {
        const t = q[i] as { c: number; r: number };
        if (t.c === to.c && t.r === to.r) {
          const path: number[] = [];
          for (let k = key(t.c, t.r); k >= 0; k = prev.get(k) ?? -1) path.unshift(k);
          const n = path[1];
          return n === undefined ? null : { c: n % cols, r: Math.floor(n / cols) };
        }
        for (const [dc, dr] of [[0, -1], [-1, 0], [0, 1], [1, 0]] as const) {
          const c = t.c + dc; const r = t.r + dr;
          if (solid(c, r) || prev.has(key(c, r))) continue;
          prev.set(key(c, r), key(t.c, t.r)); q.push({ c, r });
        }
      }
      return null;
    };
    const codes: Record<string, number> = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Space: 32 };
    const down = new Set<string>();
    const fire = (type: string, k: string): void => {
      const e = new KeyboardEvent(type, { key: k === 'Space' ? ' ' : k, code: k, bubbles: true, cancelable: true });
      Object.defineProperty(e, 'keyCode', { get: () => codes[k] });
      window.dispatchEvent(e);
    };
    const set = (want: string | null): void => {
      for (const k of [...down]) if (k !== want) { fire('keyup', k); down.delete(k); }
      if (want && !down.has(want)) { fire('keydown', want); down.add(want); }
    };
    const t0 = performance.now();
    let waited = 0;
    let last = { x: g.probe.playerX, y: g.probe.playerY };
    const tick = (): void => {
      const p = g.probe;
      if (untilMinigame && document.querySelector('[data-ui="minigame"]')) { set(null); resolve({ pressed: false, minigame: true }); return; }
      if (spot && Math.hypot(p.playerX - spot.x, p.playerY - spot.y) < 12) { set(null); resolve({ pressed: false, minigame: false }); return; }
      if (id && p.nearObject === id) {
        set(null);
        if (!act) { resolve({ pressed: false, minigame: false }); return; }
        // «…»/«!» над головою — або (після розмови позначка гасне, GAME-261) просто в зоні дії 20 кадрів поспіль: Space у тому ж кадрі.
        if (/^(chat|request)$/.test(p.npcMarks[id] ?? '') || ++waited > 20) { fire('keydown', 'Space'); requestAnimationFrame(() => { fire('keyup', 'Space'); resolve({ pressed: true, minigame: false }); }); return; }
        requestAnimationFrame(tick);
        return;
      }
      if (performance.now() - t0 > maxMs) { set(null); resolve(null); return; }
      const target = 'at' in goal ? goal.at : (p.residents.find((x) => x.id === goal.resident) ?? { x: p.playerX, y: p.playerY });
      const here = { c: Math.floor(p.playerX / tileSize), r: Math.floor(p.playerY / tileSize) };
      const to = { c: Math.floor(target.x / tileSize), r: Math.floor(target.y / tileSize) };
      const next = nextStep(here, to) ?? to;
      const dx = (next.c + 0.5) * tileSize - p.playerX; const dy = (next.r + 0.5) * tileSize - p.playerY;
      const tol = Math.max(3, Math.hypot(p.playerX - last.x, p.playerY - last.y) * 0.55);
      last = { x: p.playerX, y: p.playerY };
      const vertical = next.c === here.c;
      const across = vertical ? dx : dy;
      const along = vertical ? dy : dx;
      const axis = Math.abs(across) > tol ? across : along;
      const horizontal = Math.abs(across) > tol ? vertical : !vertical;
      set(horizontal ? (axis < 0 ? 'ArrowLeft' : 'ArrowRight') : (axis < 0 ? 'ArrowUp' : 'ArrowDown'));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), { id, goal, maxMs, spot: opts.spot ?? null, act: opts.act === true, untilMinigame: opts.untilMinigame === true, walls: WALLS, cols: MAP.width, rows: MAP.height, tileSize: TILE });
  if (!r) throw new Error(`не дійшов до ${id || JSON.stringify(goal)}: ${JSON.stringify(await probe(page))}`);
  return r;
}

const panel = (page: Page) => page.locator('[data-ui="story"]');
const box = (page: Page) => panel(page).locator('[data-ui="dialogue"]');
const mg = (page: Page) => page.locator('[data-ui="minigame"]');

async function closeTalk(page: Page): Promise<void> {
  for (let i = 0; i < 14 && await box(page).isVisible(); i++) { await panel(page).locator('[data-act]').last().click(); await page.waitForTimeout(380); }
  await expect(box(page)).toBeHidden({ timeout: 5_000 });
}
async function talkTo(page: Page, id: string, name: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    const r = await walkTo(page, id, { resident: id }, { act: true });
    expect(r.pressed, `${id}: Space не натиснуто`).toBe(true);
    await expect(box(page)).toBeVisible({ timeout: 8_000 }).catch(() => undefined);
    const who = (await box(page).isVisible()) ? await panel(page).locator('[data-ui="speaker"]').getAttribute('data-npc') : null;
    if (who === id) break;
    expect(attempt, `${id}: говорили з ${who} замість нього`).toBeLessThan(4);
    await closeTalk(page);
  }
  await expect(panel(page).locator('[data-ui="speaker"]')).toHaveText(name);
}
/** Вибір за текстом; перед ним «Далі» крізь репліки без вибору. Рахує рішення гравця. */
async function pick(page: Page, text: string | RegExp, c: { n: number }): Promise<void> {
  const btn = panel(page).locator('[data-act="choose"]', { hasText: text });
  for (let i = 0; i < 8 && !(await btn.first().isVisible().catch(() => false)); i++) { await panel(page).locator('[data-act="continue"]').click({ timeout: 5_000 }); await page.waitForTimeout(400); }
  await expect(btn.first(), `вибору «${String(text)}» немає`).toBeVisible({ timeout: 5_000 });
  await btn.first().click();
  c.n++;
  await page.waitForTimeout(420);
}

// ───── міні-ігри: дотиками у сторінці ─────
async function startMg(page: Page): Promise<void> {
  await expect(mg(page)).toHaveAttribute('data-phase', 'open', { timeout: 10_000 });
  await page.locator('[data-ui="mg-start"]').click();
  await expect(mg(page)).toHaveAttribute('data-phase', 'play');
}
async function finishMg(page: Page, name: string): Promise<string> {
  await expect(mg(page)).toHaveAttribute('data-phase', 'result', { timeout: 120_000 });
  await shot(page, name);
  const outcome = (await mg(page).getAttribute('data-outcome')) ?? '';
  await page.locator('[data-ui="mg-close"]').click();
  await expect(mg(page)).toBeHidden({ timeout: 5_000 });
  return outcome;
}
/** Шкала: тягнемо пальцем у бік, де сигнал росте (підйом на пагорб); ціль пливе — стежимо щокадру. */
async function playHold(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => {
    let dial = 0.05; let dir = 1; let lastSig = 0; let pressed = false;
    const tick = (): void => {
      const root = document.querySelector<HTMLElement>('[data-ui="mg-tune"]');
      const el = document.querySelector<HTMLElement>('[data-ui="mg-tune-dial"]');
      if (!root || !el) { resolve(); return; }
      const sig = Number(root.dataset.signal ?? '0');
      if (sig === 0) dial += 0.006 * dir;
      else if (sig < lastSig) { dir = -dir; dial += 0.003 * dir; }
      else if (sig < 0.95) dial += 0.002 * dir;
      if (dial > 1) { dial = 1; dir = -1; } if (dial < 0) { dial = 0; dir = 1; }
      lastSig = sig;
      const r = el.getBoundingClientRect();
      const ev = (type: string): PointerEvent => new PointerEvent(type, { bubbles: true, clientX: r.left + dial * r.width, clientY: r.top + r.height / 2, buttons: 1, pointerId: 1, pointerType: 'touch' });
      el.dispatchEvent(ev(pressed ? 'pointermove' : 'pointerdown'));
      pressed = true;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
}
/** Ритм: торкатися кожні `beat` кадрів (рівно, як радить Клер). */
async function playRhythm(page: Page, beat: number): Promise<void> {
  await page.evaluate((b) => new Promise<void>((resolve) => {
    let k = 0;
    const tick = (): void => {
      const btn = document.querySelector<HTMLButtonElement>('[data-ui="mg-crank-tap"]');
      if (!btn) { resolve(); return; }
      if (k++ % b === 0) btn.click();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), beat);
}
/** Пошук під плитою: після кожної пригорщі — дочекатись, поки сито стихне; спершу сусіди блиску, інакше «через клітинку». */
async function playSift(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => {
    const tick = (): void => {
      const root = document.querySelector('[data-ui="mg-sift"]');
      if (!root) { resolve(); return; }
      if (root.getAttribute('data-sifting') !== 'yes') {
        const cells = [...root.querySelectorAll<HTMLButtonElement>('[data-ui="mg-sift-cell"]')];
        const cols = 7;
        const st = (i: number): string => cells[i]?.dataset.state ?? '';
        const glints = cells.map((_, i) => i).filter((i) => st(i) === 'glint');
        const near = glints.flatMap((g) => [g - 1, g + 1, g - cols, g + cols].filter((i) => i >= 0 && i < cells.length && (Math.abs((i % cols) - (g % cols)) + Math.abs(Math.floor(i / cols) - Math.floor(g / cols)) === 1) && st(i) === 'sand'));
        const next = near[0] ?? cells.map((_, i) => i).find((i) => ((i % cols) + Math.floor(i / cols)) % 2 === 0 && st(i) === 'sand') ?? cells.map((_, i) => i).find((i) => st(i) === 'sand');
        if (next !== undefined) cells[next]?.click();
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
}
/** Вечеря на вогні (рутина «вогонь», страви йдуть самі за часом кадрів): тримаємо жар посередині смуги поточної страви. */
async function cookDinner(page: Page): Promise<void> {
  const TARGET: Record<string, number> = { soup: 0.6, fish: 0.72, tea: 0.45 };
  await page.evaluate((target) => new Promise<void>((resolve) => {
    const t0 = performance.now();
    let last = 0;
    const tick = (): void => {
      const heat = document.querySelector<HTMLElement>('[data-ui="fire-heat"]');
      const dish = document.querySelector<HTMLElement>('[data-ui="fire-dish"]')?.dataset.dish ?? '';
      if (!heat || performance.now() - t0 > 90_000) { resolve(); return; }
      const h = Number(heat.dataset.heat ?? '0') / 100;
      const goal = target[dish] ?? 0.55;
      const now = performance.now();
      if (now - last > 70) {
        if (h < goal - 0.04) { document.querySelector<HTMLButtonElement>('[data-ui="fire-act"][data-act="blow"]')?.click(); last = now; }
        else if (h > goal + 0.12) { document.querySelector<HTMLButtonElement>('[data-ui="fire-act"][data-act="rake"]')?.click(); last = now; }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), TARGET);
}
/** Ніч бурі (сцена dlg.storm-night): читаємо крізь репліки, на вибір — перша відповідь. */
async function playStormScene(page: Page): Promise<string[]> {
  const seen: string[] = [];
  for (let i = 0; i < 40; i++) {
    await expect(box(page)).toBeVisible({ timeout: 8_000 });
    seen.push((await box(page).innerText()).replace(/\s+/g, ' '));
    if (i === 0) { await box(page).scrollIntoViewIfNeeded(); await shot(page, 'storm-scene'); }
    const choice = panel(page).locator('[data-act="choose"]').first();
    if (await choice.isVisible().catch(() => false)) await choice.click();
    else await panel(page).locator('[data-act="continue"]').click({ timeout: 5_000 });
    await page.waitForTimeout(380);
    if (!(await box(page).isVisible().catch(() => false))) break;
  }
  return seen;
}
/** Похід: дійти ногами в зону — міні-гра відкривається сама. */
async function trip(page: Page, zone: string): Promise<void> {
  const r = await walkTo(page, '', { at: ZONE[zone] as Pt }, { spot: ZONE[zone] as Pt, untilMinigame: true });
  if (!r.minigame) await expect(mg(page), `${zone}: на місці не відкрилась міні-гра`).toBeVisible({ timeout: 8_000 });
}

/** Дрібні прохання Люка (GAME-180) — сходинка до місії: узяти, дійти до цілі, здати. */

// ───── зразковий день ─────
const UK = JSON.parse(readFileSync(new URL('../../content/locales/uk.json', import.meta.url), 'utf8')) as Record<string, string>;
interface Core2 { game: { flags: string[]; moneyCents: number; dialogue: unknown; minigames?: Record<string, { last: string }>; campBoard?: { results?: Record<string, string> } } }
const core2 = (page: Page): Promise<Core2> => page.evaluate(() => (window as unknown as { __game: { read: () => Core2 } }).__game.read());

async function act(page: Page, kind: string, key = '', clickDialogue = false): Promise<void> {
  await panel(page).locator(`[data-act="${kind}"][data-key="${key}"]`).click({ timeout: 8_000 });
  await page.waitForTimeout(400);
  if (clickDialogue) for (let i = 0; i < 6 && await box(page).isVisible({ timeout: 400 }).catch(() => false); i++) { await box(page).locator('[data-act]').last().click(); await page.waitForTimeout(400); }
}

/** Дорога: кроки дня 1 кнопками (як game-312) до виїзду на дорогу; далі — справжня міні-гра. */
async function depart(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?seed=7&sampleDay=1');
  await waitGameReady(page);
  await page.locator('[data-touch="story"]').click();
  await panel(page).locator('[data-act="create"]', { hasText: 'Велосипед' }).first().click();
  await page.waitForTimeout(400);
  for (const [k, key] of [['complete', 'q.prologue-home-001'], ['complete', 'q.st-001'], ['complete', 'q.st-002'], ['visit', 'loc.shop'], ['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'], ['checkout', 'basket.all'],
    ['complete', 'q.st-003'], ['visit', 'loc.home'], ['complete', 'q.ch1-home-001']] as const) await act(page, k, key);
  await act(page, 'visit', 'loc.road', true);
  return errors;
}

/** Дорога пальцем у сторінці (rAF): вільна смуга — з DOM (data-free), перестроювання кнопками ◀ ▶; `brisk` — тиснути «жвавіше» навіть повз камеру. */
async function driveRoad(page: Page, brisk: boolean): Promise<string> {
  await expect(mg(page)).toHaveAttribute('data-phase', 'open', { timeout: 15_000 });
  await page.locator('[data-ui="story-close"]').dispatchEvent('click');   // міні-гра перекриває кнопку: дотик у DOM; панель відкрита — сцена на паузі, кадри дороги стояли б
  await shot(page, `road-intro`);
  await page.locator('[data-ui="mg-start"]').click();
  await expect(mg(page)).toHaveAttribute('data-phase', 'play');
  await page.evaluate((hurry) => new Promise<void>((resolve) => {
    let n = 0;
    const t0 = performance.now();
    const tick = (): void => {
      const root = document.querySelector('[data-ui="minigame"]');
      if (!root || root.getAttribute('data-phase') === 'result' || performance.now() - t0 > 420_000) { resolve(); return; }
      const d = document.querySelector<HTMLElement>('[data-ui="mg-drive"]');
      if (d && root.getAttribute('data-phase') === 'play' && n++ % 4 === 0) {
        const lane = Number(d.dataset.lane);
        const free = [...document.querySelectorAll('.mg-drive-lane')].findIndex((l) => l.getAttribute('data-free') === 'yes');
        if (free >= 0 && free !== lane) document.querySelector<HTMLButtonElement>(`[data-ui="mg-drive-lane-${free < lane ? 'left' : 'right'}"]`)?.click();
        const want = hurry ? 'brisk' : 'steady';
        if (d.dataset.pace !== want) document.querySelector<HTMLButtonElement>('[data-ui="mg-drive-pace"]')?.click();
        const stop = document.querySelector<HTMLButtonElement>('[data-ui="mg-drive-stop"]');
        if (stop && (stop.dataset.kind === 'fuel' ? Number(d.dataset.fuel) < 0.25 : Number(d.dataset.comfort) < 0.45)) stop.click();
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), brisk);
  await expect(mg(page)).toHaveAttribute('data-phase', 'result', { timeout: 5_000 });
  const outcome = (await mg(page).getAttribute('data-outcome')) ?? '';
  await shot(page, `road-result-${outcome}`);
  await page.locator('[data-ui="mg-close"]').click();
  await expect(mg(page)).toBeHidden({ timeout: 5_000 });
  return outcome;
}

const tapIt = async (page: Page, sel: string): Promise<void> => { await page.locator(sel).tap(); await page.waitForTimeout(120); };

const ORIENTATIONS = [
  { name: 'portrait', viewport: { width: 390, height: 844 }, brisk: true },
  { name: 'landscape', viewport: { width: 932, height: 430 }, brisk: false },
] as const;

for (const o of ORIENTATIONS) {
  test.describe(`GAME-314 зразковий день — ${o.name} ${o.viewport.width}×${o.viewport.height}`, () => {
    test.use({ viewport: o.viewport, hasTouch: true, isMobile: false });
    test.setTimeout(900_000);

    test('відʼїзд → дорога → приїзд → ділянка → заїзд → день → ніч → підсумок', async ({ page }) => {
      const t0 = Date.now();
      const errors = await depart(page);
      const moneyBefore = (await core2(page)).game.moneyCents;

      // 1. ДОРОГА → штраф у гаманці, час приїзду в стані
      const outcome = await driveRoad(page, o.brisk);
      const afterRoad = (await core2(page)).game;
      const arrival = { good: 'early', fine: 'ontime', scrappy: 'late' }[outcome] as string;
      expect(afterRoad.flags.filter((f) => f.startsWith('f.arrival-')), 'дорога поставила рівно один f.arrival-*').toEqual([`f.arrival-${arrival}`]);
      if (o.brisk) expect(afterRoad.moneyCents, 'штраф камери зменшив гаманець').toBeLessThan(moneyBefore);
      else expect(afterRoad.moneyCents, 'без штрафу гаманець не змінився').toBe(moneyBefore);
      await page.locator('[data-touch="story"]').click();
      await panel(page).locator('[data-act="complete"][data-key="q.st-004"]').click({ timeout: 8_000 });
      await page.waitForTimeout(400);
      await panel(page).locator('[data-act="visit"][data-key="loc.camp.lake"]').click({ timeout: 8_000 });

      // 2. ПРИЇЗД: ділянки — рівно ті, що лишила дорога
      await expect(box(page)).toBeVisible({ timeout: 10_000 });
      const free = { early: ['water', 'beeches', 'meadow', 'reception'], ontime: ['beeches', 'meadow', 'reception'], late: ['meadow', 'reception'] }[arrival] as string[];
      const spotText = (p: string): string => UK[`dlg.camp-arrival.spot.${p}`] as string;
      const c = { n: 0 };
      const btn = (p: string) => panel(page).locator('[data-act="choose"]', { hasText: spotText(p) });
      for (let i = 0; i < 10 && !(await btn('reception').first().isVisible().catch(() => false)); i++) {
        const first = panel(page).locator('[data-act="choose"]').first();
        if (await first.isVisible().catch(() => false)) { await first.click(); c.n++; } else await panel(page).locator('[data-act="continue"]').click({ timeout: 5_000 });
        await page.waitForTimeout(400);
      }
      for (const p of ['water', 'beeches', 'meadow', 'reception']) await expect(btn(p), `ділянка ${p} за приїзду ${arrival}`).toHaveCount(free.includes(p) ? 1 : 0);
      await shot(page, `pitch-${arrival}`);
      const pitch = free[0] as string;
      await btn(pitch).first().click();
      c.n++;
      await expect.poll(async () => (await core2(page)).game.flags.includes(`f.spot-${pitch}`), { timeout: 5_000 }).toBe(true);
      await closeTalk(page);
      await panel(page).locator('[data-act]').first().waitFor({ state: 'attached' }).catch(() => undefined);
      await page.locator('[data-ui="story-close"]').click({ timeout: 3_000 }).catch(() => undefined);

      // 3. ЗАЇЗД на обрану ділянку (drive-in): розвʼязок за смугою, кожен крок — дотик
      await expect(page.locator('[data-ui="drive-in"]')).toBeVisible({ timeout: 8_000 });
      await shot(page, 'drive-in');
      const lane = laneOf(`lane.${pitch}`);
      for (const s of solve(lane) ?? []) await tapIt(page, `[data-ui="di-${s}"]`);
      await expect(page.locator('[data-ui="drive-in"]')).toHaveAttribute('data-done', 'yes');
      await tapIt(page, '[data-ui="di-done"]');
      await expect(box(page)).toBeVisible({ timeout: 8_000 });
      await closeTalk(page);
      await page.locator('[data-ui="story-close"]').click({ timeout: 3_000 }).catch(() => undefined);
      expect((await core2(page)).game.flags.some((f) => f.startsWith('f.drive-in-')), 'сусід записав результат заїзду').toBe(true);

      // 4. ДЕНЬ: дошка табору (ягоди зранку), місія Клер ногами по мапі
      await expect(page.locator('[data-ui="sd-board"]')).toBeVisible({ timeout: 8_000 });
      await tapIt(page, '[data-ui="sd-board"]');
      await tapIt(page, '[data-ui="camp-routine"][data-id="berries"]');
      for (let i = 0; i < 4; i++) await tapIt(page, `[data-ui="berry"][data-i="${i}"]`);
      await tapIt(page, '[data-ui="berry-enough"]');
      await expect(page.locator('[data-ui="camp-routine"][data-id="berries"]')).toHaveAttribute('data-done', 'yes');
      await shot(page, 'board-day');
      await tapIt(page, '[data-ui="sd-board-close"]');

      await expect.poll(async () => (await probe(page)).residents.length, { message: 'мешканці табору на мапі', timeout: 15_000 }).toBeGreaterThan(0);
      const m = { n: 0 };
      await talkTo(page, 'npc.claire', 'Клер');
      await pick(page, 'Малий сьогодні сам не свій', m);
      await pick(page, 'Погляньмо на той ліхтар', m);
      await pick(page, 'Покрутити ручку самому', m);
      await pick(page, 'Подивитись, як качає Тімо', m);
      await pick(page, 'Вирішити, як бути', m);
      await pick(page, 'Навчу Тімо рівного ритму', m);
      await pick(page, 'Іду до Тімо', m);
      await closeTalk(page);
      await trip(page, 'tents-old');
      await startMg(page);
      await playRhythm(page, 40);
      await finishMg(page, `lantern-crank-result-${o.name}`);
      await talkTo(page, 'npc.claire', 'Клер');
      await pick(page, 'Так. Ми посвітили разом', m);
      await pick(page, 'Тьмяно — до ранку', m);
      await pick(page, 'Він твій', m);
      await pick(page, 'Натягнути тент над дровами', m);
      await closeTalk(page);
      await trip(page, 'tents-south');
      await startMg(page);
      await playHold(page);
      await finishMg(page, `lantern-tarp-result-${o.name}`);
      await talkTo(page, 'npc.claire', 'Клер');
      await pick(page, 'Звісно, покажу', m);
      await pick(page, 'Тепер і в нас', m);
      await expect.poll(async () => (await core2(page)).game.flags.includes('f.mis-lantern-done'), { timeout: 5_000 }).toBe(true);
      await closeTalk(page);

      // 4б. Друга місія: «Обручка» Аміни — спогади звужують коло, пісок під плитою, верша на причалі (пристрій табору → риба сама)
      await talkTo(page, 'npc.amina', 'Аміна');
      await pick(page, 'У тебе щось сталося?', m);
      await pick(page, 'Пройдімо його втретє', m);
      await pick(page, 'Що ти робила біля води?', m);
      await pick(page, 'Ти щось чула, коли вона впала?', m);
      await pick(page, 'У чому ти була взута?', m);
      await pick(page, 'Я йду шукати', m);
      await pick(page, 'Кам’яна плита під колонкою', m);
      await pick(page, 'Підняти плиту', m);
      await pick(page, 'Зрозумів, іду', m);
      await pick(page, 'Іду до колонки з ситом', m);
      await closeTalk(page);
      await trip(page, 'sanitary');
      await startMg(page);
      await playSift(page);
      await finishMg(page, `ring-sift-result-${o.name}`);
      await talkTo(page, 'npc.amina', 'Аміна');
      await pick(page, 'Як ви познайомились?', m);
      await pick(page, 'Тримай', m);
      await pick(page, 'Плести вершу під кладкою', m);
      await closeTalk(page);
      await trip(page, 'pier');
      await startMg(page);
      await playRhythm(page, 50);
      await finishMg(page, `ring-trap-result-${o.name}`);
      await talkTo(page, 'npc.amina', 'Аміна');
      await pick(page, 'Навчи, де ставити', m);
      await pick(page, 'Дякую за обручку', m);
      await expect.poll(async () => (await core2(page)).game.flags.includes('f.mis-ring-done'), { timeout: 5_000 }).toBe(true);
      await closeTalk(page);
      const dayFlags = (await core2(page)).game;
      expect(dayFlags.flags, 'дві місії зроблено').toEqual(expect.arrayContaining(['f.mis-lantern-done', 'f.mis-ring-done']));
      expect(dayFlags.campBoard?.results?.berries, 'ягоди зранку ЗБЕРЕЖЕНО в стані гри попри розмови (дошка не губиться)').toBeDefined();

      // 4в. ВЕЧЕРЯ: дошка відновлюється зі збереженого, а не з нуля
      await tapIt(page, '[data-ui="sd-board"]');
      await expect(page.locator('[data-ui="camp-routine"][data-id="berries"]')).toHaveAttribute('data-done', 'yes');
      await tapIt(page, '[data-ui="camp-next"]');
      await tapIt(page, '[data-ui="camp-routine"][data-id="fire"]');
      await shot(page, 'dinner');
      await cookDinner(page);
      await expect(page.locator('[data-ui="camp-routine"][data-id="fire"]')).toHaveAttribute('data-done', 'yes', { timeout: 10_000 });
      await tapIt(page, '[data-ui="sd-board-close"]');

      // 5. ВЕЧІР: порядок у таборі, і ніч — з усього разом
      await tapIt(page, '[data-ui="sd-board"]');
      await tapIt(page, '[data-ui="camp-next"]'); await tapIt(page, '[data-ui="camp-next"]');
      await expect(page.locator('[data-ui="camp-board"]')).toHaveAttribute('data-round', 'evening');
      await tapIt(page, '[data-ui="camp-routine"][data-id="tidy"]');
      for (const [id, place] of [['pot', 'car'], ['bread', 'hung'], ['berries', 'hung'], ['tins', 'bin'], ['wrap', 'bin'], ['chairs', 'tarp'], ['rods', 'tarp'], ['boots', 'tarp']] as const) {
        await tapIt(page, `[data-ui="tidy-pick"][data-id="${id}"]`);
        await tapIt(page, `[data-ui="tidy-place"][data-place="${place}"]`);
      }
      await tapIt(page, '[data-ui="tidy-sleep"]');
      await tapIt(page, '[data-ui="camp-to-night"]');
      await expect(page.locator('[data-ui="camp-night"]')).toBeVisible();
      await shot(page, 'night');
      const ids = await page.locator('[data-ui="night-beat"]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.id ?? ''));
      expect(ids, 'ягоди дня в ночі').toContain('night.berries.sweet');
      expect(ids, 'порядок дня в ночі').toContain('night.tidy.quiet');
      expect(ids, 'місія Клер у ТІЙ САМІЙ ночі').toContain('night.mission.f.storm-dry-wood');
      expect(ids, 'друга місія (Аміна) у ТІЙ САМІЙ ночі').toContain('night.mission.f.storm-fish-supper');
      expect(ids, 'місія, якої не зроблено (Люк), теж лишає слід').toContain('night.mission.mis.aerial.none');
      expect(ids, 'вечеря на вогні в ночі').toContain(ids.find((i) => i.startsWith('night.fire.')) as string);
      expect(ids, 'верша місії Аміни → риба в ночі сама').not.toContain('night.fish.none');
      expect(ids.filter((i) => i.startsWith(`night.${pitch}.`)).length, `слід обраної ділянки (${pitch}) у ночі`).toBeGreaterThan(0);

      // 6. ГРОЗА (сцена ночі з наслідками ТИХ САМИХ прапорців) і ПІДСУМОК
      await tapIt(page, '[data-ui="camp-summary"]');
      const storm = await playStormScene(page);
      expect(storm[0], 'година бурі 20:30 — так само, як у сцені вогню').toContain('пів на дев’яту');
      expect(storm.join(' | '), 'сцена бурі знає про сухі дрова Клер').toContain('Дрова Рема сухі');
      expect(storm.join(' | '), 'сцена бурі знає про окуня Аміни').toContain('Окунь');
      await shot(page, 'storm-after');
      const sum = page.locator('[data-ui="sd-summary"]');
      await expect(sum).toBeVisible();
      await expect(sum).toHaveAttribute('data-arrival', arrival);
      await expect(sum).toHaveAttribute('data-pitch', pitch);
      await expect(sum).toHaveAttribute('data-missions', '2');
      await expect(sum).toHaveAttribute('data-money', String((await core2(page)).game.moneyCents));
      await shot(page, 'summary');
      await tapIt(page, '[data-ui="sd-finish"]');
      const secs = Math.round((Date.now() - t0) / 1000);
      console.log(`G314 E2E ${o.name}: прохід ${secs} с · дорога ${outcome} (приїзд ${arrival}) · ділянка ${pitch} · штраф ${moneyBefore - afterRoad.moneyCents} ц`);
      expect(errors, 'без помилок у консолі').toEqual([]);
    });
  });
}
