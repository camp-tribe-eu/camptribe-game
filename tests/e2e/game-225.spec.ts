// GAME-225 · «Живий табір»: лавка (сів/встав), сосна (потрусив → шишка підібрана, раз на день), калюжі після дощу, пірс, колонка, смітник, дошка оголошень.
// Обидві орієнтації (390×844, 844×390). Мапа табору без сюжету: ?map=camp (збірка e2e). Знімки — G225_SHOTS.
import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { weatherOf } from '../../src/core/weather';
import { probe, routeXY, walk } from './chapter-driver';
import { waitGameReady } from './ready';

const SHOTS = process.env.G225_SHOTS;
const SETTINGS_KEY = 'camplife.settings.v1';
const VIEWS = [{ side: 'portrait', w: 390, h: 844 }, { side: 'landscape', w: 844, h: 390 }] as const;
const seedWith = (w: 'sunny' | 'rain'): number => { for (let s = 0; s < 300; s++) if (weatherOf(s, 0) === w) return s; throw new Error(w); };
interface CampP { sitting: boolean; seat: number; sits: number; stands: number; shakes: number; trembles: number; lastDrop: number; items: number; cones: number; berries: number; usedToday: string[]; leaves: number; puddles: number; splashes: number; rings: number; taps: number; drops: number; bend: number; binHops: number; lid: number; board: boolean; pierSteps: number; hint: string; sounds: string[] }
const camp = (page: Page): Promise<CampP> => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __game: { probe: { camp: unknown } } }).__game.probe.camp)) as CampP);
const shot = async (page: Page, name: string, side: string): Promise<void> => { if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${name}-${side}.png` }); } };

async function open(page: Page, w: 'sunny' | 'rain', w0: number, h0: number): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(([k]) => { try { localStorage.setItem(k as string, JSON.stringify({ textScale: 100, language: 'uk', hintSeen: true })); } catch { /* сховища немає */ } }, [SETTINGS_KEY] as const);
  await page.setViewportSize({ width: w0, height: h0 });
  await page.goto(`/?seed=${seedWith(w)}&map=camp`);
  await waitGameReady(page);
  await page.waitForTimeout(500);
  return errors;
}
const at = async (page: Page): Promise<[number, number]> => { const p = await probe(page); return [p.playerX, p.playerY]; };
async function goTo(page: Page, x: number, y: number): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await walk(page, routeXY('camp-lake', await at(page), { x, y }));
    await page.waitForTimeout(250);
    const [px, py] = await at(page);
    if (Math.hypot(px - x, py - y) < 26) return;
  }
}
const press = async (page: Page): Promise<void> => { await page.keyboard.down('KeyE'); await page.waitForTimeout(90); await page.keyboard.up('KeyE'); await page.waitForTimeout(150); };

for (const v of VIEWS) {
  test(`лавка: зайшов — сів (ноги сховані), будь-який рух — встав — ${v.side}`, async ({ page }) => {
    test.setTimeout(120_000);
    const errors = await open(page, 'sunny', v.w, v.h);
    expect((await camp(page)).sitting).toBe(false);
    await goTo(page, 140, 208);   // лавка біля вогнища: точка (100, 198); підходимо збоку, вирівнюємось по висоті й заходимо вручну
    await page.keyboard.down('ArrowUp'); await page.waitForTimeout(75); await page.keyboard.up('ArrowUp');
    await page.keyboard.down('ArrowLeft');
    await expect.poll(async () => (await camp(page)).sitting, { timeout: 6_000 }).toBe(true);
    await page.keyboard.up('ArrowLeft');
    await page.waitForTimeout(400);
    const s = await camp(page);
    expect(s.sitting).toBe(true); expect(s.seat).toBe(2); expect(s.sits).toBe(1);
    const p = await probe(page);
    expect(Math.hypot(p.playerX - 100, p.playerY - 202), 'сидить на точці лавки (−4 px вниз)').toBeLessThan(4);
    expect(p.playerMoving).toBe(false);
    await shot(page, 'sit', v.side);
    await page.waitForTimeout(600);
    expect((await camp(page)).sitting, 'без руху лишається сидіти').toBe(true);
    await page.keyboard.down('ArrowRight');
    await expect.poll(async () => (await camp(page)).sitting, { timeout: 4_000 }).toBe(false);
    await page.waitForTimeout(300);
    await page.keyboard.up('ArrowRight');
    const after = await camp(page);
    expect(after.stands).toBe(1);
    expect((await probe(page)).playerX, 'пішов далі').toBeGreaterThan(108);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test(`сосна: потрусив — шишки падають і підбираються (плашка «+N Шишка» в куті), раз на день — ${v.side}`, async ({ page }) => {
    test.setTimeout(150_000);
    const errors = await open(page, 'sunny', v.w, v.h);
    expect((await camp(page)).puddles, 'сонце — калюж нема').toBe(0);
    await goTo(page, 272, 400);   // під сосною (8,7): стовбур у клітинках (8–9, 11)
    await expect.poll(async () => (await camp(page)).hint, { timeout: 5_000 }).toBe('pine.camp');
    await press(page);
    await page.waitForFunction(() => (window as unknown as { __game: { probe: { camp: { leaves: number } } } }).__game.probe.camp.leaves > 0, null, { timeout: 5_000 });
    await shot(page, 'shake', v.side);
    const c0 = await camp(page);
    expect(c0.shakes).toBe(1);
    expect(c0.lastDrop, 'впало 1–3 шишки').toBeGreaterThanOrEqual(1); expect(c0.lastDrop).toBeLessThanOrEqual(3);
    expect(c0.usedToday).toContain('pine.camp');
    expect(c0.sounds).toContain('thud');
    const pops0 = (await probe(page) as unknown as { fx: { pops: number } }).fx.pops;
    await expect.poll(async () => (await camp(page)).cones, { timeout: 8_000 }).toBe(c0.lastDrop);
    expect((await camp(page)).items, 'усе підібрано').toBe(0);
    // GAME-229: цифр над героєм нема — «+N Шишка» стоїть плашкою в куті (як знахідки GAME-228), а не спливом над головою.
    expect((await probe(page) as unknown as { fx: { pops: number } }).fx.pops - pops0, 'над героєм нічого не спливло').toBe(0);
    expect((await camp(page) as unknown as { smash: { toastText: string[] } }).smash.toastText, 'плашка «+N Шишка»').toEqual([`+${c0.lastDrop} Шишка`]);
    expect((await camp(page)).sounds).toContain('pop');
    // Раз на день: друга спроба — лише здригання, нічого не падає.
    await page.waitForTimeout(700);
    await press(page);
    await page.waitForTimeout(1_200);
    const c1 = await camp(page);
    expect(c1.shakes, 'другий раз — не потрусилось').toBe(1);
    expect(c1.trembles).toBe(1);
    expect(c1.cones).toBe(c0.lastDrop);
    expect(c1.items).toBe(0);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test(`колонка, смітник, дошка оголошень відгукуються — ${v.side}`, async ({ page }) => {
    test.setTimeout(150_000);
    const errors = await open(page, 'sunny', v.w, v.h);
    await goTo(page, 656, 240);
    await press(page);
    const t = await camp(page);
    expect(t.taps).toBe(1); expect(t.sounds).toContain('water');
    await page.waitForFunction(() => (window as unknown as { __game: { probe: { camp: { drops: number } } } }).__game.probe.camp.drops > 0, null, { timeout: 4_000 });
    await shot(page, 'tap', v.side);
    await page.waitForTimeout(900);
    await goTo(page, 592, 240);
    await page.waitForTimeout(300);
    await press(page);
    const b = await camp(page);
    expect(b.binHops).toBe(1); expect(b.sounds).toContain('clank');
    await goTo(page, 464, 208);
    await page.waitForTimeout(300);
    await press(page);
    expect((await camp(page)).board, 'текст дошки видно').toBe(true);
    await shot(page, 'board', v.side);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test(`дощ: калюжі на стежках (кола й хлюп), кроки по пірсу — дерев'яні — ${v.side}`, async ({ page }) => {
    test.setTimeout(150_000);
    const errors = await open(page, 'rain', v.w, v.h);
    expect((await camp(page)).puddles).toBe(6);
    await goTo(page, 120, 244);
    await page.keyboard.down('ArrowRight');
    await expect.poll(async () => (await camp(page)).splashes, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    await shot(page, 'puddle', v.side);
    await page.keyboard.up('ArrowRight');
    expect((await camp(page)).sounds).toContain('splash');
    await goTo(page, 880, 240);
    await page.keyboard.down('ArrowRight');
    await expect.poll(async () => (await camp(page)).pierSteps, { timeout: 8_000 }).toBeGreaterThanOrEqual(2);
    await page.keyboard.up('ArrowRight');
    expect((await camp(page)).sounds).toContain('plank');
    expect(errors, errors.join('\n')).toEqual([]);
  });
}
