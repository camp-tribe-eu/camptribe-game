// GAME-179 · розмова з NPC на мапі: підійшов — над головою «…» — дія — рамка внизу з портретом, іменем і текстом; кожен NPC табору.
// Мутації (перевірено, див. PR): ?hideUi=portrait (портрет не дають) → «портрет є» червоніє; прибрати dialogue/luc-chat.json → Люк мовчить, тест Люка червоніє;
// markerFor завжди null → «…» не видно, тест червоніє.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

interface Pt { x: number; y: number }
interface Probe { ready: boolean; playerX: number; playerY: number; nearObject: string | null; residents: { id: string; x: number; y: number }[]; followers: Pt[]; npcMarks: Record<string, string> }
const probe = (page: Page): Promise<Probe> => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __game: { probe: Probe } }).__game.probe)) as Probe);
const core = (page: Page): Promise<{ game: { dialogue: unknown }; clock: { paused: boolean } }> => page.evaluate(() => (window as unknown as { __game: { read: () => never } }).__game.read());

const TILE = 32;
interface TiledMap { width: number; height: number; layers: { name: string; data?: number[]; objects?: { name: string; type?: string; x: number; y: number }[] }[] }
const MAP = JSON.parse(readFileSync(new URL('../../public/maps/camp-lake.tmj', import.meta.url), 'utf8')) as TiledMap;
const WALLS = MAP.layers.find((l) => l.name === 'walls')?.data ?? [];
const solid = (c: number, r: number): boolean => c < 0 || r < 0 || c >= MAP.width || r >= MAP.height || (WALLS[r * MAP.width + c] ?? 0) > 0;
const tile = (p: Pt): { c: number; r: number } => ({ c: Math.floor(p.x / TILE), r: Math.floor(p.y / TILE) });
const ELISE = (MAP.layers.find((l) => l.name === 'objects')?.objects ?? []).find((o) => o.name === 'npc.elise') as Pt;

/** Усі, з ким говоримо на мапі табору, і як їх звати (uk). Джордж — на мапі дому: покритий сторожем npc-talk.test (мапа ⇄ контент). */
const CAST: [string, string][] = [
  ['npc.elise', 'Еліза'], ['npc.amina', 'Аміна'], ['npc.luc', 'Люк'], ['npc.nora', 'Нора'], ['npc.ingrid', 'Інгрід'], ['npc.sarah', 'Сара'], ['npc.claire', 'Клер'],
  ['npc.victoria', 'Вікторія'], ['npc.matthew', 'Метью'],
];

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

/** Пішки до того, хто рухається: ціль перечитується щокроку; зупинка, коли найближчий співрозмовник — потрібний. */
async function walkToNpc(page: Page, id: string, where: (p: Probe) => Pt, maxMs = 80_000, arrived?: (p: Probe) => boolean): Promise<Probe> {
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
      if (p.nearObject === id || arrived?.(p)) return p;
      const goal = where(p);
      const here = tile({ x: p.playerX, y: p.playerY });
      const to = tile(goal);
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
  throw new Error(`не дійшов до ${id}: ${JSON.stringify(await probe(page))}`);
}

const panel = (page: Page) => page.locator('[data-ui="story"]');
async function act(page: Page, kind: string, key = ''): Promise<void> {
  await panel(page).locator(`[data-act="${kind}"][data-key="${key}"]`).click({ timeout: 8_000 });
  await page.waitForTimeout(400);   // панель глуха ~350 мс після дії
  if (kind === 'visit' && key === 'loc.road') {   // подія в дорозі (з шансом): остання відповідь до кінця розмови
    for (let i = 0; i < 6 && await panel(page).locator('[data-ui="dialogue"]').isVisible({ timeout: 400 }).catch(() => false); i++) {
      await panel(page).locator('[data-ui="dialogue"] [data-act]').last().click();
      await page.waitForTimeout(400);
    }
  }
}

/** Старт у таборі: створити героя, пройти день 1 кнопками панелі (як story.spec), зачинити ☰ — далі лише ноги. */
async function toCamp(page: Page, query = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`/?seed=7${query}`);
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { saveLoaded: boolean } } }).__game?.probe.saveLoaded === true, null, { timeout: 30_000 });
  await page.locator('[data-touch="story"]').click();
  await panel(page).locator('[data-act="create"]', { hasText: 'Велосипед' }).first().click();
  await page.waitForTimeout(400);
  for (const [k, key] of [['complete', 'q.prologue-home-001'], ['complete', 'q.st-001'], ['complete', 'q.st-002'], ['visit', 'loc.shop'], ['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'],
    ['complete', 'q.st-003'], ['visit', 'loc.home'], ['complete', 'q.ch1-home-001'], ['visit', 'loc.road'], ['complete', 'q.st-004'], ['visit', 'loc.camp.lake']] as const) await act(page, k, key);
  await page.locator('[data-ui="story-close"]').click();
  await page.waitForTimeout(300);
  return errors;
}

/** Портрет у рамці справжній: <img> з даними, що завантажились, і джерелом file | sprite (не іконка оповідача). */
async function portraitOk(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const img = document.querySelector<HTMLImageElement>('[data-ui="story"][data-mode="talk"] img[data-ui="portrait"]');
    return !!img && img.complete && img.naturalWidth > 0 && (img.dataset.source === 'file' || img.dataset.source === 'sprite');
  });
}

async function talkTo(page: Page, id: string, name: string): Promise<void> {
  const where = (p: Probe): Pt => {
    if (id === 'npc.elise') return ELISE;
    if (id === 'npc.victoria') return p.followers[0] as Pt;
    if (id === 'npc.matthew') return p.followers[1] as Pt;
    return p.residents.find((r) => r.id === id) as Pt;
  };
  const box = panel(page).locator('[data-ui="dialogue"]');
  // Слідувачі (родина) тупцюють коло героя: «найближчий» міг помінятись між кроком і дією — тоді розмова не з тим; закриваємо її й пробуємо ще.
  // Родина тупцює коло героя, тому в грі розмова з нею — лише коли в зоні дії нікого іншого (вогнище, Еліза, предмет): ідемо на чисте місце — галявину.
  if (id === 'npc.victoria' || id === 'npc.matthew') {
    const clearing = { x: 21.5 * TILE, y: 18.5 * TILE };
    await walkToNpc(page, '', () => clearing, 80_000, (p) => Math.hypot(p.playerX - clearing.x, p.playerY - clearing.y) < 12);
  }
  for (let attempt = 0; ; attempt++) {
    const near = await walkToNpc(page, id, where);
    expect(near.nearObject).toBe(id);
    await expect.poll(async () => (await probe(page)).npcMarks[id], { message: `${id}: над головою нема «…»`, timeout: 5_000 }).toBe('chat');
    const still = (await probe(page)).nearObject === id;
    if (still) await page.keyboard.press('Space');
    await expect(box, `${id}: рамка розмови не відкрилась`).toBeVisible({ timeout: 8_000 }).catch(() => undefined);
    const who = (await box.isVisible()) ? await panel(page).locator('[data-ui="speaker"]').getAttribute('data-npc') : null;
    if (who === id) break;
    expect(attempt, `${id}: говорили з ${who} замість нього`).toBeLessThan(3);
    for (let i = 0; i < 12 && await box.isVisible(); i++) { await panel(page).locator('[data-act]').last().click(); await page.waitForTimeout(420); }
  }
  await expect(panel(page)).toHaveAttribute('data-mode', 'talk');
  expect(await portraitOk(page), `${id}: портрета в рамці нема`).toBe(true);
  await expect(panel(page).locator('[data-ui="speaker"]')).toHaveText(name);
  const text = (await panel(page).locator('[data-ui="line"]').textContent()) ?? '';
  expect(text.length, `${id}: порожній текст`).toBeGreaterThan(8);
  expect(text).not.toContain('⟦');
  expect((await core(page)).clock.paused, 'світ на паузі, поки говорять').toBe(true);
  // До кінця: остання відповідь у кожному вузлі.
  for (let i = 0; i < 12 && await box.isVisible(); i++) {
    await panel(page).locator('[data-act]').last().click();
    await page.waitForTimeout(420);
  }
  await expect(box, `${id}: розмова не закінчилась`).toBeHidden({ timeout: 5_000 });
  const c = await core(page);
  expect(c.game.dialogue).toBeNull();
  expect(c.clock.paused, 'після розмови світ іде далі').toBe(false);
}

test.describe('GAME-179 розмова з NPC на мапі', () => {
  test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });
  test.setTimeout(240_000);

  for (const [id, name] of CAST) {
    test(`${id}: підійшов — «…» — дія — рамка з портретом, ім'ям і текстом; розмова закінчується`, async ({ page }) => {
      const errors = await toCamp(page);
      await talkTo(page, id, name);
      expect(errors).toEqual([]);
    });
  }

  test('негативний контроль: ?hideUi=portrait — портрета нема, і перевірка це бачить', async ({ page }) => {
    await toCamp(page, '&hideUi=portrait');
    await walkToNpc(page, 'npc.elise', () => ELISE);
    await page.keyboard.press('Space');
    await expect(panel(page).locator('[data-ui="dialogue"]')).toBeVisible({ timeout: 8_000 });
    expect(await portraitOk(page)).toBe(false);
    await expect(panel(page).locator('img[data-ui="portrait"], svg[data-ui="portrait"]')).toHaveAttribute('data-source', 'icon');
  });

  test('екран подорожі (☰): завдання від Елізи — з портретом і ім\'ям; оповідач — нейтральна іконка', async ({ page }) => {
    await toCamp(page);
    await page.locator('[data-touch="story"]').click();
    const giver = panel(page).locator('[data-ui="giver"]');
    await expect(giver.first()).toBeVisible();
    const kinds = await giver.evaluateAll((els) => els.map((e) => `${(e as HTMLElement).dataset.npc}:${e.querySelector('[data-ui="portrait"]')?.getAttribute('data-source')}`));
    expect(kinds.length).toBeGreaterThan(0);
    for (const k of kinds) expect(/^(npc\.elise:(sprite|file)|narrator:icon)$/.test(k), k).toBe(true);
  });
});

for (const [label, viewport] of [['portrait', { width: 390, height: 844 }], ['landscape', { width: 844, height: 390 }]] as const) {
  test.describe(`GAME-179 телефон ${label}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });
    test.setTimeout(240_000);

    test(`Еліза й мешканець: рамка не виходить за екран, кнопки ≥ 44 px, дотик по кнопці дії відкриває розмову (${label})`, async ({ page }) => {
      await toCamp(page);
      await walkToNpc(page, 'npc.elise', () => ELISE);
      await page.locator('[data-touch="interact"]').tap();
      const box = page.locator('[data-ui="dialogue"]');
      await expect(box).toBeVisible({ timeout: 8_000 });
      expect(await portraitOk(page)).toBe(true);
      const geo = await page.evaluate(() => {
        const r = (sel: string): { x: number; y: number; w: number; h: number } | null => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
        return { box: r('[data-ui="dialogue"]'), btns: [...document.querySelectorAll('[data-ui="dialogue"] [data-act]')].map((b) => { const q = b.getBoundingClientRect(); return { w: q.width, h: q.height, bottom: q.bottom, right: q.right }; }), vw: innerWidth, vh: innerHeight, scrollW: document.documentElement.scrollWidth };
      });
      expect(geo.box && geo.box.x >= 0 && geo.box.x + geo.box.w <= geo.vw && geo.box.y >= 0 && geo.box.y + geo.box.h <= geo.vh, JSON.stringify(geo.box)).toBe(true);
      expect(geo.scrollW).toBeLessThanOrEqual(geo.vw);
      for (const b of geo.btns) expect(b.h, 'кнопка відповіді ≥ 44 px').toBeGreaterThanOrEqual(44);
      if (process.env.GAME179_SHOTS) { await page.waitForTimeout(1_500); await page.screenshot({ path: `research/visual-audit/talk-elise-${label}.png` }); }
      for (let i = 0; i < 12 && await box.isVisible(); i++) { await page.locator('[data-ui="dialogue"] [data-act]').last().tap(); await page.waitForTimeout(420); }
      await expect(box).toBeHidden({ timeout: 5_000 });
      // Мешканець табору — той самий рамок.
      await walkToNpc(page, 'npc.luc', (p) => p.residents.find((r) => r.id === 'npc.luc') as Pt);
      await page.locator('[data-touch="interact"]').tap();
      await expect(box).toBeVisible({ timeout: 8_000 });
      expect(await portraitOk(page)).toBe(true);
      if (process.env.GAME179_SHOTS) { await page.waitForTimeout(1_500); await page.screenshot({ path: `research/visual-audit/talk-luc-${label}.png` }); }
    });
  });
}
