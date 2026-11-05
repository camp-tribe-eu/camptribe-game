// GAME-228 · «Розбивання»: ящик, бочка, горщик і суха гілка в таборі. Удар (E/●) → стоп героя, уламки, дим, звук матеріалу, знахідка летить до героя, плашка «+1 …» біля кута.
// Обидві орієнтації (390×844, 844×390) + знімки 9:16, 1:1, 16:9 (G228_SHOTS). Мапа табору без сюжету: ?map=camp.
import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { probe, routeXY, walk } from './chapter-driver';
import { waitGameReady } from './ready';

const SHOTS = process.env.G228_SHOTS;
const SETTINGS_KEY = 'camplife.settings.v1';
const VIEWS = [{ side: 'portrait', w: 390, h: 844 }, { side: 'landscape', w: 844, h: 390 }] as const;
const SHAPES = [{ name: '9x16', w: 390, h: 844 }, { name: '1x1', w: 600, h: 600 }, { name: '16x9', w: 844, h: 475 }] as const;
interface SmashP { smashes: number; shakes: number; lastDebris: number; lastFreeze: number; debris: number; smoke: number; hold: number; broken: string[]; toasts: { kind: string; count: number }[]; toastText: string[]; toastAlpha: number; findSizes: number[]; props: number }
interface CampP { items: number; plank: number; shard: number; twig: number; trembles: number; hint: string; sounds: string[]; smash: SmashP }
const camp = (page: Page): Promise<CampP> => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __game: { probe: { camp: unknown } } }).__game.probe.camp)) as CampP);
const shot = async (page: Page, name: string): Promise<void> => { if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${name}.png` }); } };

async function open(page: Page, w0: number, h0: number): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(([k]) => { try { localStorage.setItem(k as string, JSON.stringify({ textScale: 100, language: 'uk', hintSeen: true })); } catch { /* сховища немає */ } }, [SETTINGS_KEY] as const);
  await page.setViewportSize({ width: w0, height: h0 });
  await page.goto('/?seed=3&map=camp');
  await waitGameReady(page);
  await page.waitForTimeout(500);
  return errors;
}
const at = async (page: Page): Promise<[number, number]> => { const p = await probe(page); return [p.playerX, p.playerY]; };
async function goTo(page: Page, x: number, y: number): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await walk(page, routeXY('camp-lake', await at(page), { x, y }));
    await page.waitForTimeout(250);
    const [px, py] = await at(page);
    if (Math.hypot(px - x, py - y) < 14) return;
  }
  const [fx, fy] = await at(page);
  throw new Error(`goTo: не дійшли до (${x}, ${y}) за 5 проходів; герой у (${Math.round(fx)}, ${Math.round(fy)})`);
}
const press = async (page: Page): Promise<void> => { await page.keyboard.down('KeyE'); await page.waitForTimeout(90); await page.keyboard.up('KeyE'); };

for (const v of VIEWS) {
  test(`ящик: удар — стоп героя, уламки 4–7, знахідка летить до героя, плашка «+1 Дошка» — ${v.side}`, async ({ page }) => {
    test.setTimeout(150_000);
    const errors = await open(page, v.w, v.h);
    expect((await camp(page)).smash.props, 'речі табору стоять').toBe(4);
    await goTo(page, 660, 340);   // ящик за колонкою (680, 340)
    await expect.poll(async () => (await camp(page)).hint, { timeout: 5_000 }).toBe('crate.reception');
    await press(page);
    const c00 = await camp(page);
    const s0 = c00.smash;
    expect(c00.items, 'знахідка з’явилась (летить)').toBe(1);
    expect(s0.smashes).toBe(1);
    expect(s0.lastDebris, 'уламків 4–7').toBeGreaterThanOrEqual(4); expect(s0.lastDebris).toBeLessThanOrEqual(7);
    expect(s0.lastFreeze, 'стоп героя 5–7 кадрів').toBeGreaterThanOrEqual(5); expect(s0.lastFreeze).toBeLessThanOrEqual(7);
    expect(s0.hold, 'герой завмер').toBeGreaterThan(0);
    expect(s0.broken, 'спрайт зник').toContain('crate.reception');
    const hold = await probe(page);
    await page.waitForTimeout(150);
    expect((await probe(page)).playerX, 'під час стопу герой не зсувається').toBeCloseTo(hold.playerX, 0);
    await expect.poll(async () => (await camp(page)).smash.debris, { timeout: 2_000 }).toBeGreaterThan(0);
    await shot(page, `crate-hit-${v.side}`);
    await expect.poll(async () => (await camp(page)).plank, { timeout: 8_000 }).toBe(1);
    const c = await camp(page);
    expect(c.items, 'знахідка підібрана').toBe(0);
    expect(c.smash.toastText, 'плашка «+1 Дошка»').toEqual(['+1 Дошка']);
    expect(c.smash.toastAlpha).toBeGreaterThan(0);
    expect(c.sounds).toEqual(expect.arrayContaining(['crack', 'pop']));
    await shot(page, `crate-toast-${v.side}`);
    await expect(async () => { expect((await camp(page)).smash.toastText, 'плашка гасне за ≈3 с').toEqual([]); }).toPass({ timeout: 6_000 });
    // Ящик розбито: повторно його вже нема — удар лишень нічого не вибирає.
    await press(page); await page.waitForTimeout(300);
    expect((await camp(page)).smash.smashes, 'розбитого ящика вдруге не вдарити').toBe(1);
    expect(errors, errors.join('\n')).toEqual([]);
  });
}

test('гілка тремтить і дає гілочку; горщик дає черепок; одна й та сама знахідка збирається в лічильник — landscape', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = await open(page, 844, 390);
  await goTo(page, 600, 560);   // суха гілка біля дров (620, 556)
  await expect.poll(async () => (await camp(page)).hint, { timeout: 5_000 }).toBe('branch.wood');
  await press(page);
  await expect.poll(async () => (await camp(page)).smash.shakes, { timeout: 2_000 }).toBe(1);
  await expect.poll(async () => (await camp(page)).twig, { timeout: 8_000 }).toBeGreaterThanOrEqual(1);
  const t = await camp(page);
  expect(t.sounds).toContain('snap');
  expect(t.smash.toastText[0]).toMatch(/^\+\d Гілочка$/);
  // Повторно того ж дня — лише здригання, нічого не падає.
  await page.waitForTimeout(900); await press(page); await page.waitForTimeout(500);
  const t1 = await camp(page);
  expect(t1.trembles).toBe(1); expect(t1.twig).toBe(t.twig); expect(t1.items).toBe(0);
  await goTo(page, 400, 270);   // горщик біля рецепції (400, 250)
  await expect.poll(async () => (await camp(page)).hint, { timeout: 5_000 }).toBe('pot.reception');
  await press(page);
  await expect.poll(async () => (await camp(page)).shard, { timeout: 8_000 }).toBe(1);
  expect((await camp(page)).sounds).toContain('clay');
  expect(errors, errors.join('\n')).toEqual([]);
});

for (const s of SHAPES) {
  test(`знімок: ящик розбито, плашка видна — ${s.name}`, async ({ page }) => {
    test.setTimeout(120_000);
    const errors = await open(page, s.w, s.h);
    await goTo(page, 660, 340);
    await press(page);
    await expect.poll(async () => (await camp(page)).smash.debris, { timeout: 2_000 }).toBeGreaterThan(0);
    await shot(page, `smash-${s.name}-debris`);
    await expect.poll(async () => (await camp(page)).plank, { timeout: 8_000 }).toBe(1);
    expect((await camp(page)).smash.toastText).toEqual(['+1 Дошка']);
    await shot(page, `smash-${s.name}-toast`);
    expect(errors, errors.join('\n')).toEqual([]);
  });
}
