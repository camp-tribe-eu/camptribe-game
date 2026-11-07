// GAME-243 (S2) · нотатник Вікторії і мінімапа замість постійної стрілки й трьох нижніх підказок.
// Удома (пакування): нотатник показує справжні речі за назвою з місцем; узяв — пункт закреслився сам; мінімапа з точкою героя й ≥ 1 крапкою цілі; після навчання стрілки немає.
// Знімки 390×844, 932×430, 1280×800 — research/agenda/. Негативні контролі (закон 1) — мутації в src/content/agenda.test.ts; тут — червоніє, якщо стрілка живе далі.
import { expect, test, type Page } from '@playwright/test';
import { walkIntro } from './intro-walk';
import { core, installMenuObserver, loaded, menuSeen, playUntil, probe, route, walk } from './chapter-driver';

const SETTINGS_KEY = 'camplife.settings.v1';
const SHOTS = 'research/agenda';

async function startAt(page: Page, portrait: boolean, until: (c: Awaited<ReturnType<typeof core>>) => boolean): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(([k]) => { try { localStorage.setItem(k as string, JSON.stringify({ textScale: 100, language: 'uk', hintSeen: true })); } catch { /* сховища немає */ } }, [SETTINGS_KEY] as const);
  await installMenuObserver(page);
  await page.goto('/?seed=7&mapFirst=1&intro=1&soloHero=1');
  await loaded(page);
  await walkIntro(page);
  await playUntil(page, portrait, [], until, () => menuSeen(page), 80);
  expect(errors).toEqual([]);
  await page.locator('[data-ui="recovery-close"]').click({ timeout: 2_000 }).catch(() => undefined);   // нагадування про збереження — разове, лягає поверх нотатника, доки його не закрито
}

const box = async (page: Page, sel: string) => { const l = page.locator(sel).first(); return (await l.count()) > 0 && (await l.isVisible()) ? l.boundingBox() : null; };

/** Нічого з HUD не налазить одне на одне: ☰, пауза, годинник, нотатник, радар, джойстик, кнопка дії, рядок біля дії. */
async function noOverlaps(page: Page): Promise<void> {
  const sels = ['.ui-story-btn', '.ui-pause-btn', '[data-ui="hud"]', '[data-ui="agenda"]', '[data-ui="minimap"]', '.touch-stick', '.touch-interact', '[data-ui="next-hint"]', '[data-ui="item-card"]'];
  const boxes: [string, { x: number; y: number; width: number; height: number }][] = [];
  for (const s of sels) { const b = await box(page, s); if (b) boxes.push([s, b]); }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const [an, a] = boxes[i] as (typeof boxes)[number]; const [bn, b] = boxes[j] as (typeof boxes)[number];
    const overlap = a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;
    expect(overlap, `${an} не налазить на ${bn}`).toBe(false);
  }
}

async function takeSpot(page: Page, touch: boolean, spot: string): Promise<void> {
  const at = await probe(page);
  await walk(page, route('home', [at.playerX, at.playerY], spot));
  await expect.poll(async () => (await probe(page)).nearObject, { timeout: 5_000, message: `біля ${spot}` }).toBe(spot);
  const flag = `f.take-${spot.replace('pack.item.', '')}`;
  if ((await core(page)).game.flags.includes(flag)) return;
  if (touch) await page.locator('[data-touch="interact"]').tap();
  else { await page.keyboard.down('KeyE'); await page.waitForTimeout(200); await page.keyboard.up('KeyE'); }
  await expect.poll(async () => (await core(page)).game.flags.includes(flag), { timeout: 5_000 }).toBe(true);
}

const packing = (c: Awaited<ReturnType<typeof core>>): boolean => c.game.quests['CH1-HOME-001']?.status === 'active' && c.game.player?.locationId === 'loc.home';

test('навчання: у перший ранок стрілка веде до авто; нотатник і мінімапа вже є — портрет 390×844', async ({ browser }) => {
  test.setTimeout(300_000);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await startAt(page, true, (c) => c.game.quests['ST-003']?.status === 'active' && c.game.player?.locationId === 'loc.home');
  await expect.poll(async () => (await probe(page)).fx.guide, { timeout: 15_000, message: 'навчання: стрілка є' }).not.toBe('none');
  const first = page.locator('[data-ui="agenda-item"][data-current="yes"]');
  await expect(first).toHaveAttribute('data-item', 'go-shop');
  await expect(page.locator('[data-ui="goal"], [data-ui="nearest"]'), 'нижніх підказок «Ціль»/«Нагорода» немає').toHaveCount(0);
});

test('удома: нотатник з речами й місцями, пункт закреслюється, мінімапа, стрілки після навчання немає — портрет 390×844', async ({ browser }) => {
  test.setTimeout(600_000);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await startAt(page, true, packing);
  const agenda = page.locator('[data-ui="agenda"]');
  await expect(agenda).toBeVisible();
  await expect(agenda).toContainText('Нотатник Вікторії');
  const rows = page.locator('[data-ui="agenda-item"]');
  expect(await rows.count()).toBeGreaterThanOrEqual(3);
  expect(await rows.count()).toBeLessThanOrEqual(6);
  await expect(page.locator('[data-ui="agenda-item"][data-item="item.documents"]')).toContainText('шухляда в передпокої');   // назва речі й місце
  await expect(page.locator('[data-ui="agenda-item"][data-item="item.documents"]')).toContainText('Документи');
  await expect(page.locator('[data-ui="agenda-item"][data-done="yes"]')).toHaveCount(0);
  // Мінімапа: видима, з точкою героя й ≥ 1 крапкою цілі.
  const mini = page.locator('[data-ui="minimap-canvas"]');
  await expect(mini).toBeVisible();
  await expect.poll(async () => Number(await mini.getAttribute('data-dots')), { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
  expect(Number(await mini.getAttribute('data-px'))).toBeGreaterThan(0);
  const mb = await page.locator('[data-ui="minimap"]').boundingBox();
  expect(mb?.width ?? 0, 'радар ≥ 96 px').toBeGreaterThanOrEqual(96);
  expect(mb?.width ?? 999, 'радар ≤ 120 px').toBeLessThanOrEqual(121);
  const dotsBefore = Number(await mini.getAttribute('data-dots'));
  // GAME-267: мінімапа малює лише коли знімок змінився. Герой стоїть → за 2 с жодного перемальовування (раніше — щокадру).
  const draws = async (): Promise<number> => Number(await mini.getAttribute('data-draws'));
  const d0 = await draws();
  expect(d0, 'перше малювання було').toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(2_000);
  expect(await draws() - d0, 'герой стоїть: 0 перемальовувань мінімапи за 2 с').toBe(0);
  // Нижні підказки зникли; навчання скінчилось — стрілки немає (але ціль досяжна: probe знає її).
  await expect(page.locator('[data-ui="goal"], [data-ui="nearest"]')).toHaveCount(0);
  await expect.poll(async () => (await probe(page)).fx.target, { timeout: 5_000 }).not.toBeNull();
  await expect.poll(async () => (await probe(page)).fx.guide, { timeout: 5_000, message: 'після навчання стрілки немає' }).toBe('none');
  await noOverlaps(page);
  await page.screenshot({ path: `${SHOTS}/home-390x844.png` });
  // Узяти річ — пункт закреслився сам, крапка її зникла.
  await takeSpot(page, true, 'pack.item.documents');
  expect(await draws(), 'герой пішов → мінімапа перемалювалась').toBeGreaterThan(d0);
  await expect(page.locator('[data-ui="agenda-item"][data-item="item.documents"]')).toHaveAttribute('data-done', 'yes');
  await expect(page.locator('[data-ui="agenda-item"][data-done="no"]').first()).toHaveAttribute('data-current', 'yes');
  await expect.poll(async () => Number(await mini.getAttribute('data-dots')), { timeout: 5_000 }).toBeLessThan(dotsBefore);
  await expect.poll(async () => (await probe(page)).fx.guide).toBe('none');
  // Дотик по радару — велика мапа з легендою; повторний — закриває.
  await page.locator('[data-ui="minimap"]').tap();
  const big = page.locator('[data-ui="minimap-big"]');
  await expect(big).toBeVisible();
  await expect(page.locator('[data-ui="minimap-legend"]')).toBeVisible();
  await expect.poll(async () => Number(await page.locator('[data-ui="minimap-big-canvas"]').getAttribute('data-dots'))).toBeGreaterThanOrEqual(1);
  await page.screenshot({ path: `${SHOTS}/map-big-390x844.png` });
  await page.locator('[data-ui="minimap-close"]').tap();
  await expect(big).toHaveCount(0);
  // Згортання нотатника: заголовок ≥ 44 px, список ховається.
  const head = page.locator('.ui-agenda-head');
  expect((await head.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await head.tap();
  await expect(page.locator('[data-ui="agenda-item"]')).toHaveCount(0);
  await head.tap();
  await expect(page.locator('[data-ui="agenda-item"]').first()).toBeVisible();
});

for (const [name, vp, touch] of [['932x430', { width: 932, height: 430 }, true], ['1280x800', { width: 1280, height: 800 }, false]] as const) {
  test(`удома: нотатник і радар не налазять на HUD та керування — ${name}`, async ({ browser }) => {
    test.setTimeout(400_000);
    const ctx = await browser.newContext({ viewport: vp, hasTouch: touch, isMobile: touch });
    const page = await ctx.newPage();
    await startAt(page, false, packing);
    await expect(page.locator('[data-ui="agenda"]')).toBeVisible();
    await expect(page.locator('[data-ui="minimap"]')).toBeVisible();
    await takeSpot(page, touch, 'pack.item.documents');
    await noOverlaps(page);
    await page.screenshot({ path: `${SHOTS}/home-${name}.png` });
    const rb = await page.locator('[data-ui="minimap"]').boundingBox();
    expect(rb?.width ?? 0).toBeLessThanOrEqual(121);
    expect(rb?.width ?? 0).toBeGreaterThanOrEqual(96);
  });
}
