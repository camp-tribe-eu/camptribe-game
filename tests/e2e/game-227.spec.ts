// GAME-227 · купання в озері: з берега в мілину, у глибину (голова й плечі, −40 %, кола, краплі), назад на сушу (мокрі сліди ≈ 3 с); Мія й родина на воду не входять;
// сонячна справа «скупатися» (GAME-208) закривається дотиком до буйка. Обидві орієнтації (390×844, 844×390). Знімки — G227_SHOTS.
import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { weatherOf } from '../../src/core/weather';
import { core, probe, route, walk } from './chapter-driver';
import { waitGameReady } from './ready';

const CAMP = 'loc.camp.lake';
const SETTINGS_KEY = 'camplife.settings.v1';
const SHOTS = process.env.G227_SHOTS;
const VIEWS = [{ side: 'portrait', w: 390, h: 844 }, { side: 'landscape', w: 844, h: 390 }] as const;
const panel = (page: Page) => page.locator('.ui-story');
const seedWith = (w: 'sunny'): number => { for (let s = 0; s < 200; s++) if (weatherOf(s, 0) === w) return s; throw new Error(w); };
interface SwimP { state: string; hidden: boolean; rows: number; bob: number; rings: number; drops: number; wetMarks: number; wetLeftMs: number; steps: number; petsWet: number; sounds: string[]; enters: number; exits: number; speed: number }
const swimOf = async (page: Page): Promise<SwimP> => (await page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __game: { probe: { swim: unknown } } }).__game.probe.swim)))) as SwimP;

async function act(page: Page, kind: string, key = ''): Promise<void> {
  await panel(page).locator(`[data-act="${kind}"][data-key="${key}"]`).click({ timeout: 5_000 });
  await page.waitForTimeout(400);
  if (kind === 'visit' && (key === 'loc.road' || key === 'loc.camp.lake')) {
    const dlg = panel(page).locator('[data-ui="dialogue"]');
    for (let i = 0; i < 6 && await dlg.isVisible({ timeout: 400 }).catch(() => false); i++) { await dlg.locator('[data-act]').last().click(); await page.waitForTimeout(400); }
  }
}
async function arriveInCamp(page: Page, seed: number): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(([k]) => { try { localStorage.setItem(k as string, JSON.stringify({ textScale: 100, language: 'uk', hintSeen: true })); } catch { /* сховища немає */ } }, [SETTINGS_KEY] as const);
  await page.goto(`/?seed=${seed}`);
  await waitGameReady(page);
  await page.locator('[data-touch="story"]').click();
  await panel(page).locator('[data-act="create"]', { hasText: /Велосипед|Bike/ }).first().click();
  await page.waitForTimeout(400);
  for (const [k, key] of [['complete', 'q.prologue-home-001'], ['complete', 'q.st-001'], ['complete', 'q.st-002'], ['visit', 'loc.shop'], ['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'], ['complete', 'q.st-003'],
    ['visit', 'loc.home'], ['complete', 'q.ch1-home-001'], ['visit', 'loc.road'], ['complete', 'q.st-004'], ['visit', 'loc.camp.lake']] as const) await act(page, k, key);
  expect((await core(page)).game.player?.locationId).toBe(CAMP);
  await page.waitForTimeout(600);
  await page.goto(`/?seed=${seed}&mapFirst=1`);
  await waitGameReady(page);
  await page.locator('[data-ui="recovery-close"]').click({ timeout: 800 }).catch(() => undefined);
  expect((await core(page)).game.player?.locationId, 'сейв підхопився: гравець у таборі').toBe(CAMP);
  return errors;
}

/** Відстань, яку герой проходить за ms, утримуючи стрілку. */
async function hold(page: Page, key: string, ms: number): Promise<number> {
  const a = await probe(page);
  await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key);
  const b = await probe(page);
  return Math.hypot(b.playerX - a.playerX, b.playerY - a.playerY);
}

for (const v of VIEWS) {
  test(`купання: вхід, плавання, вихід; Мія й родина не у воді; сонячна справа закривається — ${v.side}`, async ({ browser }) => {
    test.setTimeout(420_000);
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errors = await arriveInCamp(page, seedWith('sunny'));
    // До берега пляжу (клітинка (27,10) — суша), нічого не плаваємо: суша = «land», ноги видно.
    const q0 = await probe(page);
    await walk(page, route('camp-lake', [q0.playerX, q0.playerY], 'obj.water'));
    await expect.poll(async () => (await probe(page)).playerMoving, { timeout: 8_000 }).toBe(false);
    let s = await swimOf(page);
    expect(s.state, 'на березі — суша').toBe('land'); expect(s.hidden).toBe(false); expect(s.rows).toBe(64); expect(s.enters).toBe(0);
    const landStep = await hold(page, 'ArrowLeft', 500);
    // Поступовий вхід: мілина (ноги сховані), далі глибина.
    const shore = await probe(page);
    await walk(page, [[28 * 32 + 16, 10 * 32 + 16]]);
    s = await swimOf(page);
    expect(s.state, 'клітинка (28,10) — мілина').toBe('shallow'); expect(s.rows).toBe(46); expect(s.hidden).toBe(true);
    await walk(page, [[31 * 32 + 16, 10 * 32 + 16]]);
    await page.waitForTimeout(300);
    s = await swimOf(page);
    expect(s.state, 'клітинка (31,10) — глибина').toBe('swim'); expect(s.rows, 'голова й плечі').toBe(34);
    expect(s.enters).toBe(1); expect(s.speed).toBeCloseTo(0.6, 2);
    const deep = await probe(page);
    expect(Math.hypot(deep.playerX - shore.playerX, deep.playerY - shore.playerY), 'позиція змінилась').toBeGreaterThan(80);
    // Кола, гойдання 0–2 px, краплі на старті/повороті; Мія й родина не на воді.
    let sawRings = 0; let sawDrops = 0; const bobs = new Set<number>();
    const swimStep = await (async () => { const p = hold(page, 'ArrowLeft', 500); const t0 = Date.now(); while (Date.now() - t0 < 450) { const k = await swimOf(page); sawRings = Math.max(sawRings, k.rings); sawDrops = Math.max(sawDrops, k.drops); bobs.add(k.bob); expect(k.petsWet).toBe(0); } return p; })();
    expect(sawRings, 'кола навколо плечей').toBeGreaterThan(0);
    expect(sawDrops, 'краплі на старті').toBeGreaterThanOrEqual(2); expect(sawDrops).toBeLessThanOrEqual(4);
    for (const b of bobs) { expect(b).toBeGreaterThanOrEqual(0); expect(b).toBeLessThanOrEqual(2); }
    expect(swimStep, `у глибині повільніше: ${swimStep.toFixed(1)} проти ${landStep.toFixed(1)} на суші`).toBeLessThan(landStep * 0.8);
    await walk(page, [[31 * 32 + 16, 10 * 32 + 16]]);
    if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/swim-${v.side}.png` }); }
    for (const f of (await probe(page) as unknown as { followers: { x: number; y: number }[] }).followers) {
      expect(f.x < 28 * 32 || f.y < 9 * 32 || f.y >= 12 * 32, `слідувач (${f.x | 0},${f.y | 0}) не у воді`).toBe(true);
    }
    expect((await swimOf(page)).sounds, 'звук входу').toContain('enter');
    // Сонячна справа: буйок (32,10) — дотик дією, прапорець done.
    await walk(page, [[32 * 32 + 16, 10 * 32 + 8]]);
    await page.keyboard.down('KeyE'); await page.waitForTimeout(150); await page.keyboard.up('KeyE');
    await expect.poll(async () => (await core(page)).game.flags.includes('f.req-wx-sunny-swim-done'), { timeout: 6_000, message: 'справа «скупатися» зроблена' }).toBe(true);
    // Вихід: назад на сушу; ≈ 3 с мокрих крапель на кроках, потім сухо.
    await walk(page, [[28 * 32 + 16, 10 * 32 + 16], [27 * 32 + 16, 10 * 32 + 16]]);
    s = await swimOf(page);
    expect(s.state).toBe('land'); expect(s.hidden).toBe(false); expect(s.exits).toBe(1);
    expect(s.sounds, 'звук виходу').toContain('exit');
    await walk(page, [[23 * 32 + 16, 10 * 32 + 16]]);
    s = await swimOf(page);
    expect(s.steps, 'мокрі сліди на кроках після виходу').toBeGreaterThan(0);
    await page.waitForTimeout(3_300);
    s = await swimOf(page);
    expect(s.wetLeftMs, 'через 3 с підсохло').toBe(0);
    const stepsDry = s.steps;
    await hold(page, 'ArrowLeft', 400);
    expect((await swimOf(page)).steps, 'сухо: нових крапель нема').toBe(stepsDry);
    expect((await swimOf(page)).petsWet).toBe(0);
    expect(errors).toEqual([]);
    await ctx.close();
  });
}
