// GAME-209 · ящик, що штовхається, старий ящик (знахідка → Атлас) і лавка, яку лагодять руками. Обидві орієнтації телефона.
//  1) штовхання по клітинках: ящик зсувається на клітинку, а зсув, що закрив би прохід (біля 1-клітинного проходу), відхилено — ящик стоїть;
//  2) старий ящик відкривається явно (E): прапорець сліду, +5 XP, у Атласі «Шлях Генрі» слід «Старий ящик» знайдено;
//  3) лавка: три удари молотка, пил і тріски на кожен, мала нагорода раз.
// Негативний контроль (закон 1): ?breakSpot=trace.camp-crate — німий об'єкт, слід не знайдено. Знімки — SHOTS_DIR.
import { expect, test, type Page } from '@playwright/test';
import { arriveInCamp } from './camp-arrival';
import { core, probe, route, routeXY, walk } from './chapter-driver';
import { waitGameReady } from './ready';

const SHOTS_DIR = process.env.SHOTS_DIR ?? 'research/visual-audit';
const VIEWS = [{ side: 'portrait', w: 390, h: 844 }, { side: 'landscape', w: 844, h: 390 }] as const;
const FLAG = 'f.trace-camp-crate';
const at = async (page: Page): Promise<[number, number]> => { const p = await probe(page); return [p.playerX, p.playerY]; };
const center = (c: number, r: number): { x: number; y: number } => ({ x: c * 32 + 16, y: r * 32 + 16 });
const interact = async (page: Page): Promise<void> => { await page.keyboard.down('KeyE'); await page.waitForTimeout(90); await page.keyboard.up('KeyE'); await page.waitForTimeout(450); };
/** E до зсуву/відмови (кадр під навантаженням паралельного e2e може пропустити натискання — повторюємо, поки лічильник не зрушить). */
async function press(page: Page, done: (c: Awaited<ReturnType<typeof probe>>['crate']) => boolean): Promise<void> {
  for (let i = 0; i < 4; i++) { await interact(page); if (done((await probe(page)).crate)) return; }
}
const xp = async (page: Page): Promise<number> => (await page.evaluate(() => (window as unknown as { __game: { read: () => { game: { progress?: { xp: number } } } } }).__game.read())).game.progress?.xp ?? 0;
async function standAt(page: Page, c: number, r: number): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await walk(page, routeXY('camp-lake', await at(page), center(c, r)));
    await page.waitForTimeout(400);
    const p = await probe(page);
    if (Math.hypot(p.playerX - (c * 32 + 16), p.playerY - (r * 32 + 16)) < 12) return;
  }
}

for (const v of VIEWS) {
  test(`${v.side}: ящик штовхається по клітинках, сторож не дає закрити прохід`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: v.w, height: v.h });
    const errors = await arriveInCamp(page);
    const p0 = (await probe(page)).crate;
    expect(p0.active).toBe(true);
    expect([p0.c, p0.r]).toEqual([18, 14]);
    // Зсув праворуч: (18,14) → (19,14).
    await standAt(page, 17, 14);
    await press(page, (c) => c.pushes >= 1);
    expect((await probe(page)).crate, 'перший зсув').toMatchObject({ c: 19, r: 14, pushes: 1 });
    expect((await probe(page)).crate.dust, 'пил на зсув').toBeGreaterThan(0);
    await page.screenshot({ path: `${SHOTS_DIR}/crate-push-${v.side}.png` });
    // Знизу вгору: (19,14) → (19,13) — дозволено; ще вгору в (19,12) — це 1-клітинний прохід табору: сторож відхиляє, ящик стоїть.
    await standAt(page, 18, 15);   // в обхід ящика (маршрут стін про нього не знає)
    await standAt(page, 19, 15);
    await press(page, (c) => c.pushes >= 2);
    expect((await probe(page)).crate, 'другий зсув').toMatchObject({ c: 19, r: 13, pushes: 2 });
    await standAt(page, 19, 14);
    await press(page, (c) => c.refused >= 1);
    const stuck = (await probe(page)).crate;
    expect(stuck.lastRefusal).toBe('softlock');
    expect([stuck.c, stuck.r], 'ящик не посунувся в прохід').toEqual([19, 13]);
    expect(stuck.refused).toBe(1);
    await page.screenshot({ path: `${SHOTS_DIR}/crate-refused-${v.side}.png` });
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test(`${v.side}: старий ящик → знахідка в Атласі; лавка лагодиться трьома ударами`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: v.w, height: v.h });
    const errors = await arriveInCamp(page);
    expect((await core(page)).game.flags).not.toContain(FLAG);
    // Підійти до старого ящика й постояти: сам він не відкривається (лише E).
    await walk(page, route('camp-lake', await at(page), 'trace.camp-crate'));
    await page.waitForTimeout(1_500);
    expect((await core(page)).game.flags, 'прохід повз не відкриває').not.toContain(FLAG);
    expect((await probe(page)).crate.oldOpen).toBe(false);
    await page.screenshot({ path: `${SHOTS_DIR}/old-crate-closed-${v.side}.png` });
    const xp0 = await xp(page);
    await interact(page);
    await expect.poll(async () => (await core(page)).game.flags.includes(FLAG), { timeout: 5_000 }).toBe(true);
    expect((await probe(page)).crate.oldOpen).toBe(true);
    expect((await xp(page)) - xp0, 'знахідка: +5 XP').toBe(5);
    await page.screenshot({ path: `${SHOTS_DIR}/old-crate-open-${v.side}.png` });
    await page.locator('[data-touch="story"]').click();
    await page.locator('[data-ui="atlas-open"]').click();
    const row = page.locator(`[data-ui="henry"] [data-ui="trace"][data-id="trace.camp-crate"]`);
    await expect(row).toHaveAttribute('data-found', 'yes');
    await expect(row).toContainText('Старий ящик');
    await expect(row).toContainText('1978');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'без горизонтальної прокрутки').toBe(true);
    await row.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS_DIR}/old-crate-atlas-${v.side}.png` });
    await page.locator('[data-ui="atlas-close"]').click();
    await page.reload();   // ☰ лишається відкритим і ставить гру на паузу: далі — свіжа сцена зі збереження
    await waitGameReady(page);
    await page.locator('[data-ui="recovery-close"]').click({ timeout: 800 }).catch(() => undefined);
    // Лавка: три удари.
    await walk(page, route('camp-lake', await at(page), 'repair.bench'));
    await page.waitForTimeout(600);
    await expect.poll(async () => (await probe(page)).nearObject, { timeout: 5_000, message: 'біля лавки' }).toBe('repair.bench');
    const xp1 = await xp(page);
    expect((await core(page)).game.flags).not.toContain('f.bench-repaired');
    await interact(page);
    expect((await probe(page)).crate).toMatchObject({ repairHits: 1, repairDone: false });
    await page.screenshot({ path: `${SHOTS_DIR}/bench-hit-${v.side}.png` });
    await interact(page);
    expect((await probe(page)).crate.repairHits).toBe(2);
    await interact(page);
    await expect.poll(async () => (await core(page)).game.flags.includes('f.bench-repaired'), { timeout: 5_000 }).toBe(true);
    expect((await probe(page)).crate.repairDone).toBe(true);
    expect((await probe(page)).crate.dust, 'пил і тріски на кожен удар').toBeGreaterThan(10);
    expect((await xp(page)) - xp1, 'мала нагорода раз').toBe(5);
    await interact(page);   // четвертий удар — нічого: справа зроблена
    expect((await xp(page)) - xp1).toBe(5);
    await page.reload();
    await expect.poll(async () => (await core(page)).game.flags.includes('f.bench-repaired')).toBe(true);
    expect(errors, errors.join('\n')).toEqual([]);
  });
}

test('негативний контроль: ?breakSpot — німий старий ящик не дає знахідки', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = await arriveInCamp(page, '&breakSpot=trace.camp-crate');
  await walk(page, route('camp-lake', await at(page), 'trace.camp-crate'));
  await page.waitForTimeout(500);
  await interact(page);
  await page.waitForTimeout(800);
  expect((await core(page)).game.flags).not.toContain(FLAG);
  expect(errors, errors.join('\n')).toEqual([]);
});
