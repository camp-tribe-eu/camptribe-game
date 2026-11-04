// GAME-231 · «Ніч у таборі»: о 18:00 вмикаються ліхтарі табору (м'яке тепле коло), уночі — цвіркуни й сова (лише через src/audio), сусід стоїть УСЮ розмову (сигнал — діалог ядра),
// значок ♥ над Сарою не лягає на полум'я, а сидячі біля наметів сусіди — на килимку. Час: ?atMinute=N — хвилини ядра від 08:00: 240 → 12:00, 590 → 17:50, 600 → 18:00, 750 → 20:30.
// Знімки (G231_SHOTS, за замовчуванням test-results/g231-shots): 390×844, 844×390 + 9:16, 1:1, 16:9. FPS уночі не гірший за денний (той самий кадр, лише з колами світла).
import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { waitGameReady } from './ready';

const SHOTS = process.env.G231_SHOTS ?? 'test-results/g231-shots';
const SETTINGS_KEY = 'camplife.settings.v1';
const VIEWS = [
  { side: 'portrait', w: 390, h: 844 }, { side: 'landscape', w: 844, h: 390 },
  { side: '9x16', w: 360, h: 640 }, { side: '1x1', w: 600, h: 600 }, { side: '16x9', w: 800, h: 450 },
] as const;
const DAY = 240; const DUSK_EARLY = 590; const SIX = 600; const NIGHT = 750;

interface Lamps { count: number; on: boolean; alpha: number; radius: number }
interface Night { level: number; cricket: number; owl: number }
interface N { id: string; state: string; phase: string; x: number; y: number; emote: string | null; sitting: boolean; f: number }
const g = <T>(page: Page, read: string): Promise<T> => page.evaluate((r) => JSON.parse(JSON.stringify(new Function('g', `return ${r}`)((window as unknown as { __game: unknown }).__game))) as unknown, read) as Promise<T>;
const lamps = (page: Page): Promise<Lamps> => g<Lamps>(page, 'g.probe.lamps');
const night = (page: Page): Promise<Night> => g<Night>(page, 'g.night()');
const nbs = (page: Page): Promise<N[]> => g<N[]>(page, 'g.probe.neighbours');

async function open(page: Page, atMinute: number, w: number, h: number, settings: Record<string, unknown> = {}): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(([k, s]) => { try { localStorage.setItem(k as string, JSON.stringify(s)); } catch { /* сховища немає */ } }, [SETTINGS_KEY, { textScale: 100, language: 'uk', hintSeen: true, ...settings }] as const);
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`/?seed=2&map=camp&noAutosave=1&noReveal=1&atMinute=${atMinute}`);
  await waitGameReady(page);
  await page.waitForTimeout(700);
  return errors;
}
const shot = async (page: Page, name: string, side: string): Promise<void> => { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${name}-${side}.png` }); };

for (const v of VIEWS) {
  test(`ліхтарі: о 17:50 і вдень темні, о 18:00 і 20:30 світять (коло ≈ 2,5 м), знімки — ${v.side}`, async ({ page }) => {
    test.setTimeout(120_000);
    const errors = await open(page, DAY, v.w, v.h);
    const day = await lamps(page);
    expect(day.count, 'ліхтарів на мапі табору нема — тест нічого не доводить').toBeGreaterThanOrEqual(3);
    expect(day.on).toBe(false);
    expect(day.alpha).toBe(0);
    await shot(page, '12h', v.side);
    for (const [at, name, minAlpha] of [[DUSK_EARLY, '17h50', -1], [SIX, '18h00', 0.3], [NIGHT, '20h30', 0.5]] as const) {
      await page.goto(`/?seed=2&map=camp&noAutosave=1&noReveal=1&atMinute=${at}`);
      await waitGameReady(page);
      await page.waitForTimeout(700);
      const l = await lamps(page);
      if (minAlpha < 0) { expect(l.on, '17:50 — ще не вмикали').toBe(false); expect(l.alpha).toBe(0); } else {
        expect(l.on, `${name}: ліхтарі горять`).toBe(true);
        expect(l.alpha, `${name}: яскравість`).toBeGreaterThan(minAlpha);
        expect(l.alpha).toBeLessThanOrEqual(1);
        expect(l.radius / 28, 'радіус у метрах').toBeGreaterThan(2);
        expect(l.radius / 28).toBeLessThan(3);
      }
      await shot(page, name, v.side);
    }
    expect(errors).toEqual([]);
  });
}

test('нічні звуки: вдень цвіркунів нема; о 20:30 після жесту — цвіркуни; mute — тиша й жодних звуків', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = await open(page, DAY, 844, 390);
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(3_500);
  expect((await night(page)).cricket, 'вдень — тиша').toBe(0);
  await page.goto(`/?seed=2&map=camp&noAutosave=1&noReveal=1&atMinute=${NIGHT}`);
  await waitGameReady(page);
  await page.keyboard.press('ArrowUp');   // перший жест відмикає звук
  await expect.poll(async () => (await night(page)).cricket, { timeout: 15_000, message: 'уночі цвіркуни стрекочуть' }).toBeGreaterThanOrEqual(2);
  expect((await night(page)).level).toBeGreaterThan(0);
  const muted = await open(page, NIGHT, 844, 390, { audio: { master: 0.8, sfx: 1, music: 0.6, muted: true } });
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(5_000);
  const n = await night(page);
  expect(n.cricket + n.owl, 'у mute нічого не грає').toBe(0);
  expect([...errors, ...muted]).toEqual([]);
});

test('FPS уночі (кола світла й нічний шар) не гірший за денний', async ({ page }) => {
  test.setTimeout(120_000);
  const fps = async (at: number): Promise<number> => {
    await page.goto(`/?seed=2&map=camp&noAutosave=1&noReveal=1&atMinute=${at}`);
    await waitGameReady(page);
    const w0 = await g<number>(page, 'g.probe.fpsWindows');
    await expect.poll(async () => g<number>(page, 'g.probe.fpsWindows'), { timeout: 20_000 }).toBeGreaterThan(w0 + 1);
    return g<number>(page, 'g.probe.fps');
  };
  await page.setViewportSize({ width: 844, height: 390 });
  const day = await fps(DAY);
  const dusk = await fps(NIGHT);
  console.log(`GAME-231 fps: день ${day}, ніч ${dusk}`);
  expect(day).toBeGreaterThan(0);
  expect(dusk, `ніч ${dusk} проти дня ${day}`).toBeGreaterThanOrEqual(day * 0.8);
});

test('♥ над Сарою біля вогнища — збоку від полум\'я; о 19:00 сидячі біля наметів на килимку (знімки)', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = await open(page, 78, 844, 390);   // Сара стоїть біля лавки під вогнищем (3,5) з хвилини 78 до 118; герой на старті поруч
  await expect.poll(async () => (await nbs(page)).find((n) => n.id === 'npc.sarah')?.emote, { timeout: 6_000 }).toBe('heart');
  await shot(page, 'heart-sarah', 'landscape');
  await page.goto(`/?seed=2&map=camp&noAutosave=1&noReveal=1&atMinute=660`);
  await waitGameReady(page);
  await page.waitForTimeout(700);
  const ns = await nbs(page);
  expect(ns.every((n) => n.phase === 'home' && n.sitting), 'о 19:00 усі сидять біля наметів').toBe(true);
  await shot(page, 'mats-19h', 'landscape');
  expect(errors).toEqual([]);
});

// ---- Розмова вночі: сусід стоїть усю розмову (потрібна історія дня 1, як у game-179) ----
const TILE = 32;
interface Pt { x: number; y: number }
interface Probe { playerX: number; playerY: number; nearObject: string | null; npcMarks: Record<string, string> }
const probe = (page: Page): Promise<Probe> => g<Probe>(page, 'g.probe');
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
async function toCamp(page: Page, query: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/?seed=7${query}`);
  await waitGameReady(page);
  await page.locator('[data-touch="story"]').click();
  await panel(page).locator('[data-act="create"]', { hasText: 'Велосипед' }).first().click();
  await page.waitForTimeout(400);
  for (const [k, key] of [['complete', 'q.prologue-home-001'], ['complete', 'q.st-001'], ['complete', 'q.st-002'], ['visit', 'loc.shop'], ['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'],
    ['complete', 'q.st-003'], ['visit', 'loc.home'], ['complete', 'q.ch1-home-001'], ['visit', 'loc.road'], ['complete', 'q.st-004'], ['visit', 'loc.camp.lake']] as const) await act(page, k, key);
  await page.locator('[data-ui="story-close"]').click();
  await page.waitForTimeout(300);
  return errors;
}
async function walkTo(page: Page, id: string, maxMs = 60_000): Promise<void> {
  const keys = { ArrowLeft: false, ArrowRight: false, ArrowUp: false, ArrowDown: false };
  const set = async (want: Partial<typeof keys>): Promise<void> => {
    for (const k of Object.keys(keys) as (keyof typeof keys)[]) { const on = want[k] === true; if (on !== keys[k]) { keys[k] = on; await (on ? page.keyboard.down(k) : page.keyboard.up(k)); } }
  };
  const t0 = Date.now();
  try {
    while (Date.now() - t0 < maxMs) {
      const p = await probe(page);
      if (p.nearObject === id) return;
      const n = (await nbs(page)).find((x) => x.id === id) as N;
      // Сусід біля намету: підходимо знизу (клітинка нижче), там завжди вільно (рядок 4 мапи прохідний).
      const goal: Pt = { x: n.x, y: n.y + TILE };
      const dx = goal.x - p.playerX; const dy = goal.y - p.playerY;
      if (Math.abs(dx) > 6) await set(dx < 0 ? { ArrowLeft: true } : { ArrowRight: true });
      else await set(dy < 0 ? { ArrowUp: true } : { ArrowDown: true });
      await page.waitForTimeout(20);
    }
  } finally { await set({}); }
  throw new Error(`не дійшов до ${id}: ${JSON.stringify(await probe(page))}`);
}

test.describe('розмова вночі', () => {
  test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });
  test('сусід стоїть усю розмову (4 с і більше), без «Z» і не лежить; після розмови ще мить стоїть, потім знову спить', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = await toCamp(page, `&noAutosave=1&atMinute=${NIGHT}`);
    const id = 'npc.nora';
    await expect.poll(async () => (await nbs(page)).find((n) => n.id === id)?.state, { timeout: 10_000, message: 'о цій порі Нора спить' }).toBe('sleep');
    await walkTo(page, id);
    await expect.poll(async () => (await probe(page)).npcMarks[id], { timeout: 6_000, message: 'над головою «…»' }).toMatch(/^(chat|request)$/);
    await page.keyboard.press('Space');
    await expect(page.locator('[data-ui="story"] [data-ui="dialogue"]')).toBeVisible({ timeout: 8_000 });
    await page.mouse.move(5, 5);
    // Розмова відкрита (діалог ядра) — це і є сигнал, яким рига тримає сусіда. Світ на паузі: сцена не йде, тож сусід заморожений у стійці «стоїть».
    expect((await g<{ dialogue: unknown; paused: boolean }>(page, '({ dialogue: g.read().game.dialogue, paused: g.read().clock.paused })')).dialogue, 'діалог ядра відкрито').not.toBeNull();
    await page.waitForTimeout(4_000);
    const n = (await nbs(page)).find((x) => x.id === id) as N;
    expect(n.state, 'у розмові стоїть').toBe('stand');
    expect(n.sitting, 'не сидить і не лежить').toBe(false);
    expect(n.emote, 'без «Z»').not.toBe('zzz');
    await shot(page, 'talk-night', 'desktop');
    for (let i = 0; i < 12 && await page.locator('[data-ui="story"] [data-ui="dialogue"]').isVisible(); i++) { await panel(page).locator('[data-act]').last().click(); await page.waitForTimeout(420); }
    await expect(page.locator('[data-ui="story"] [data-ui="dialogue"]')).toBeHidden({ timeout: 5_000 });
    expect((await nbs(page)).find((x) => x.id === id)?.state, 'щойно закрили рамку — ще стоїть (пільгові кадри)').toBe('stand');
    await expect.poll(async () => (await nbs(page)).find((x) => x.id === id)?.state, { timeout: 30_000, message: 'після розмови знову спить' }).toBe('sleep');
    expect(errors).toEqual([]);
  });
});
