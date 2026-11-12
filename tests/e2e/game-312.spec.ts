// GAME-312 · місії сусідів у справжньому браузері: розмова → ПОХІД ногами в зону табору → міні-гра на місці (каркас GAME-308) → повернення → другий похід (пристрій
// для табору, EPISODE-DESIGN §9а) → віддача. Жодна місія не закривається одним дотиком; одна активна; дві орієнтації телефона.
// Керування героєм — лише всередині сторінки (requestAnimationFrame), як GAME-298: рішення й клавіші — одне на показаний кадр. Міні-ігри — дотиками й перетягуванням
// пальця у сторінці (rAF), без «ідеальних» перемикачів: пошук за блиском, шкала — за сигналом, ритм — рівним дотиком.
// Сторожі договору (п'ять частин, похід через міні-гру, пристрій, ніч, 5–10 хв) і їхні мутації — юніт-тести: src/content/missions.test.ts, src/view/mission-time.test.ts.
// Знімки в research/game-312/ — лише за G312_SHOTS=1 (не на критичному шляху тесту).
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { waitGameReady } from './ready';

interface Pt { x: number; y: number }
interface Probe { playerX: number; playerY: number; nearObject: string | null; residents: { id: string; x: number; y: number }[]; npcMarks: Record<string, string> }
interface Core { game: { flags: string[]; dialogue: unknown; minigames?: Record<string, { last: string }> } }
const probe = (page: Page): Promise<Probe> => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __game: { probe: Probe } }).__game.probe)) as Probe);
const core = (page: Page): Promise<Core> => page.evaluate(() => (window as unknown as { __game: { read: () => Core } }).__game.read());
const SHOTS = process.env.G312_SHOTS === '1';
const shot = async (page: Page, name: string): Promise<void> => { if (SHOTS) await page.screenshot({ path: `research/game-312/${name}.png` }); };

const TILE = 32;
interface TiledMap { width: number; height: number; layers: { name: string; data?: number[]; objects?: { name: string; x: number; y: number }[] }[] }
const MAP = JSON.parse(readFileSync(new URL('../../public/maps/camp-lake.tmj', import.meta.url), 'utf8')) as TiledMap;
const WALLS = MAP.layers.find((l) => l.name === 'walls')?.data ?? [];
const OBJ = new Map((MAP.layers.find((l) => l.name === 'objects')?.objects ?? []).map((o) => [o.name, { x: o.x, y: o.y }] as const));
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
const line = async (page: Page): Promise<string> => (await panel(page).locator('[data-ui="line"]').textContent()) ?? '';
const mg = (page: Page) => page.locator('[data-ui="minigame"]');

async function act(page: Page, kind: string, key = ''): Promise<void> {
  await panel(page).locator(`[data-act="${kind}"][data-key="${key}"]`).click({ timeout: 8_000 });
  await page.waitForTimeout(400);
  if (kind === 'visit' && key === 'loc.road') {
    for (let i = 0; i < 6 && await box(page).isVisible({ timeout: 400 }).catch(() => false); i++) { await box(page).locator('[data-act]').last().click(); await page.waitForTimeout(400); }
  }
}
async function toCamp(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?seed=7');
  await waitGameReady(page);
  await page.locator('[data-touch="story"]').click();
  await panel(page).locator('[data-act="create"]', { hasText: 'Велосипед' }).first().click();
  await page.waitForTimeout(400);
  for (const [k, key] of [['complete', 'q.prologue-home-001'], ['complete', 'q.st-001'], ['complete', 'q.st-002'], ['visit', 'loc.shop'], ['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'], ['checkout', 'basket.all'],
    ['complete', 'q.st-003'], ['visit', 'loc.home'], ['complete', 'q.ch1-home-001'], ['visit', 'loc.road'], ['complete', 'q.st-004'], ['visit', 'loc.camp.lake']] as const) await act(page, k, key);
  await page.locator('[data-ui="story-close"]').click();
  await page.locator('[data-ui="recovery-reminder"] button', { hasText: 'Закрити' }).click({ timeout: 2_000 }).catch(() => undefined);
  await expect.poll(async () => (await probe(page)).residents.length, { message: 'мешканці табору на мапі', timeout: 15_000 }).toBeGreaterThan(0);
  return errors;
}
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
/** Похід: дійти ногами в зону — міні-гра відкривається сама. */
async function trip(page: Page, zone: string): Promise<void> {
  const r = await walkTo(page, '', { at: ZONE[zone] as Pt }, { spot: ZONE[zone] as Pt, untilMinigame: true });
  if (!r.minigame) await expect(mg(page), `${zone}: на місці не відкрилась міні-гра`).toBeVisible({ timeout: 8_000 });
}

/** Дрібні прохання Люка (GAME-180) — сходинка до місії: узяти, дійти до цілі, здати. */
async function lucRequest(page: Page, id: string, spot: string, thanks: string | RegExp): Promise<void> {
  const c = { n: 0 };
  await talkTo(page, 'npc.luc', 'Люк');
  await pick(page, 'Беруся', c);
  await closeTalk(page);
  const target = OBJ.get(spot) as Pt;
  await walkTo(page, '', { at: target }, { spot: target });
  await expect.poll(async () => (await core(page)).game.flags.includes(`f.${id.replace(/\./g, '-')}-t1`), { message: `${spot}: ціль не зарахована`, timeout: 8_000 }).toBe(true);
  await talkTo(page, 'npc.luc', 'Люк');
  await pick(page, thanks, c);
  await closeTalk(page);
}

const ORIENTATIONS = [
  { name: 'portrait', viewport: { width: 390, height: 844 } },
  { name: 'landscape', viewport: { width: 844, height: 390 } },
] as const;

for (const o of ORIENTATIONS) {
  test.describe(`GAME-312 місії сусідів — ${o.name} ${o.viewport.width}×${o.viewport.height}`, () => {
    test.use({ viewport: o.viewport, hasTouch: true, isMobile: false });
    test.setTimeout(600_000);

    test('«Обручка»: спогади звужують коло → пісок під плитою → верша на причалі', async ({ page }) => {
      const errors = await toCamp(page);
      const c = { n: 0 };
      const t0 = Date.now();
      await talkTo(page, 'npc.amina', 'Аміна');
      await pick(page, 'У тебе щось сталося?', c);
      await shot(page, `ring-offer-${o.name}`);
      await pick(page, 'Пройдімо його втретє', c);
      await pick(page, 'Що ти робила біля води?', c);
      await pick(page, 'Ти щось чула, коли вона впала?', c);
      await pick(page, 'У чому ти була взута?', c);
      await pick(page, 'Я йду шукати', c);
      await expect(panel(page).locator('[data-act="choose"]', { hasText: 'Пісок біля води' }), 'коло звузилось').toHaveCount(0);
      await shot(page, `ring-circle-${o.name}`);
      await pick(page, 'Кам’яна плита під колонкою', c);
      await pick(page, 'Підняти плиту', c);
      await pick(page, 'Зрозумів, іду', c);
      await pick(page, 'Іду до колонки з ситом', c);
      await closeTalk(page);
      // «Повернутись, не дійшовши — віддачі немає» доводить юніт (missions.test: r-wait): Аміна стоїть біля самої колонки, тож тут похід починається одразу.
      await trip(page, 'sanitary');
      await startMg(page);
      await shot(page, `ring-sift-${o.name}`);
      await playSift(page);
      await finishMg(page, `ring-sift-result-${o.name}`);
      await talkTo(page, 'npc.amina', 'Аміна');
      await pick(page, 'Як ви познайомились?', c);
      await pick(page, 'Тримай', c);
      expect((await core(page)).game.flags, 'сітка для верші').toContain('f.camp-fishtrap');
      await pick(page, 'Плести вершу під кладкою', c);
      await closeTalk(page);
      await trip(page, 'pier');
      await startMg(page);
      await playRhythm(page, 50);
      await finishMg(page, `ring-trap-result-${o.name}`);
      await talkTo(page, 'npc.amina', 'Аміна');
      await pick(page, 'Навчи, де ставити', c);
      await pick(page, 'Дякую за обручку', c);
      await expect.poll(async () => (await core(page)).game.flags.includes('f.mis-ring-done'), { timeout: 5_000 }).toBe(true);
      await shot(page, `ring-payoff-${o.name}`);
      await closeTalk(page);
      console.log(`GAME-312 E2E ${o.name} ring: ${c.n} рішень, ${Math.round((Date.now() - t0) / 1000)} с бота`);
      expect(c.n).toBeGreaterThanOrEqual(10);
      expect(errors, 'без помилок у консолі').toEqual([]);
    });

    test('«Ліхтар Тімо»: дві дії відкривають вибір → ритм у наметі Тімо → тент над дровами', async ({ page }) => {
      const errors = await toCamp(page);
      const c = { n: 0 };
      await talkTo(page, 'npc.claire', 'Клер');
      await pick(page, 'Малий сьогодні сам не свій', c);
      await pick(page, 'Погляньмо на той ліхтар', c);
      await expect(panel(page).locator('[data-act="choose"]', { hasText: 'Вирішити, як бути' })).toHaveCount(0);
      await pick(page, 'Покрутити ручку самому', c);
      await pick(page, 'Подивитись, як качає Тімо', c);
      await shot(page, `lantern-work-${o.name}`);
      await pick(page, 'Вирішити, як бути', c);
      await pick(page, 'Навчу Тімо рівного ритму', c);
      await pick(page, 'Іду до Тімо', c);
      await closeTalk(page);
      await trip(page, 'tents-old');
      await startMg(page);
      await playRhythm(page, 40);
      await shot(page, `lantern-crank-${o.name}`);
      await finishMg(page, `lantern-crank-result-${o.name}`);
      await talkTo(page, 'npc.claire', 'Клер');
      await pick(page, 'Так. Ми посвітили разом', c);
      await pick(page, 'Тьмяно — до ранку', c);
      await pick(page, 'Він твій', c);
      expect((await core(page)).game.flags, 'мотузка Рема').toContain('f.camp-rope');
      await pick(page, 'Натягнути тент над дровами', c);
      await closeTalk(page);
      await trip(page, 'tents-south');
      await startMg(page);
      await playHold(page);
      await finishMg(page, `lantern-tarp-result-${o.name}`);
      await talkTo(page, 'npc.claire', 'Клер');
      await pick(page, 'Звісно, покажу', c);
      await pick(page, 'Тепер і в нас', c);
      await expect.poll(async () => (await core(page)).game.flags.includes('f.mis-lantern-done'), { timeout: 5_000 }).toBe(true);
      expect((await core(page)).game.flags).toContain('f.mis-lantern-taught');
      await shot(page, `lantern-payoff-${o.name}`);
      await closeTalk(page);
      expect(c.n).toBeGreaterThanOrEqual(10);
      expect(errors, 'без помилок у консолі').toEqual([]);
    });

    test('«Антена»: докази замість здогаду → станція на галявині → панель біля вогнища', async ({ page }) => {
      const errors = await toCamp(page);
      await lucRequest(page, 'req.luc-chain', 'req.luc-chain.t1', 'Дрібниця');
      await lucRequest(page, 'req.luc-radio', 'req.luc-radio.t1', 'саундтрек');
      const c = { n: 0 };
      await talkTo(page, 'npc.luc', 'Люк');
      await pick(page, 'А що це в тебе шипить?', c);
      await pick(page, 'Покажи, що він робить', c);
      await expect(panel(page).locator('[data-act="choose"]', { hasText: 'Антена не має контакту' })).toHaveCount(0);
      await pick(page, 'Сіли батарейки', c);
      expect(await line(page)).toMatch(/Перевір ще раз/);
      await pick(page, 'Поводити антеною', c);
      await pick(page, 'Оглянути основу антени', c);
      await shot(page, `aerial-evidence-${o.name}`);
      await pick(page, 'Антена не має контакту', c);
      await pick(page, 'Зачистити контакт', c);
      await pick(page, 'Бо нічого не заважає', c);
      await pick(page, 'Несу приймач на галявину', c);
      await closeTalk(page);
      await trip(page, 'clearing');
      await startMg(page);
      await playHold(page);
      await shot(page, `aerial-tune-${o.name}`);
      await finishMg(page, `aerial-tune-result-${o.name}`);
      await talkTo(page, 'npc.luc', 'Люк');
      await pick(page, 'Слухати прогноз', c);
      await pick(page, 'Записати на долоні', c);
      await pick(page, 'Звідки він іде', c);
      expect((await core(page)).game.flags, 'панель Люка').toContain('f.camp-solar-panel');
      await pick(page, 'Поставити панель біля вогнища', c);
      await closeTalk(page);
      await trip(page, 'campfire');
      await startMg(page);
      await playHold(page);
      await finishMg(page, `aerial-panel-result-${o.name}`);
      await talkTo(page, 'npc.luc', 'Люк');
      await pick(page, 'Покажи, як треба', c);
      await pick(page, 'Дякую, що навчив', c);
      await expect.poll(async () => (await core(page)).game.flags.includes('f.mis-aerial-done'), { timeout: 5_000 }).toBe(true);
      await shot(page, `aerial-payoff-${o.name}`);
      await closeTalk(page);
      expect(c.n).toBeGreaterThanOrEqual(10);
      expect(errors, 'без помилок у консолі').toEqual([]);
    });
  });
}
