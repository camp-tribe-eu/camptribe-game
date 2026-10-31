// GAME-202 · родина не ходить гуськом (OD-024 §3): герой у розмові доручає Вікторії віднести речі під навіс — вона сама йде до task.gear-shelter, працює руками
// (thrust по колу) і справа хвилі закривається ядром від помічника; тим часом герой і Метью — в інших місцях (родина на ≥ 3 різних точках одночасно).
// Негативний контроль (закон 1): без доручення справа лишається відкритою і ніхто нікуди не йде. Обидві орієнтації телефона; знімок — поки Вікторія працює.
import { expect, test, type Page } from '@playwright/test';
import { core, probe, routeXY, talk, walk } from './chapter-driver';
import { arriveInCamp, taskOutcome } from './camp-arrival';

const SHOTS = process.env.FAMILY_SHOTS ?? 'test-results';
const TILE = 32;
const VIEWS = [{ side: 'landscape', w: 844, h: 390, name: 'ландшафт' }, { side: 'portrait', w: 390, h: 844, name: 'портрет' }] as const;

/** Герой стає лицем до слідувача `i` і тисне дію; у рамці розмови — вибір із текстом `choice`, далі «далі» до кінця розмови. */
async function delegate(page: Page, i: number, id: string, choice: RegExp): Promise<void> {
  // Герой відходить у тихий кут мапи (тайл 1,1: жодної живої цілі в зоні дії — інакше дія іде об'єкту, а не родині; GAME-186). Родина тупцює коло героя
  // (а за 4 с стояння розходиться по дозвіллю, GAME-173), тож крок до неї і дія — поки вона поруч; не вийшло — ще крок.
  const q0 = await probe(page);
  await walk(page, routeXY('camp-lake', [q0.playerX, q0.playerY], { x: 48, y: 48 }));
  for (let attempt = 0; ; attempt++) {
    await page.waitForTimeout(1_200);
    const p = await probe(page);
    const f = p.followers[i];
    if (!f) throw new Error('слідувача нема');
    const dx = f.x - p.playerX; const dy = f.y - p.playerY;
    const key = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'ArrowLeft' : 'ArrowRight') : (dy < 0 ? 'ArrowUp' : 'ArrowDown');
    await page.keyboard.down(key);
    await page.waitForTimeout(Math.hypot(dx, dy) > 40 ? 160 : 40);
    await page.keyboard.up(key);
    await page.waitForTimeout(500);
    if ((await probe(page)).nearObject === id) break;
    expect(attempt, `${id} так і не став співрозмовником у зоні дії`).toBeLessThan(8);
  }
  await page.keyboard.press('KeyE');
  await expect(talk(page)).toBeVisible({ timeout: 5_000 });
  await page.waitForTimeout(600);   // «глухота» рамки ~350 мс після відкриття: ранній тап ігнорується
  await talk(page).locator('[data-act]', { hasText: choice }).click({ timeout: 5_000 });
  await page.waitForTimeout(450);
  for (let k = 0; k < 4 && await talk(page).isVisible().catch(() => false); k++) { await talk(page).locator('[data-act]').last().click(); await page.waitForTimeout(450); }
}

for (const v of VIEWS) {
  test(`доручення Вікторії «речі під навіс»: сама йде, працює, справа закрита ядром; родина на трьох точках — ${v.name}`, async ({ browser }) => {
    test.setTimeout(600_000);
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errors = await arriveInCamp(page);
    expect(await taskOutcome(page, 'gear-shelter'), 'справа «речі під навіс» відкрита на приїзді').toBe('open');
    const c0 = (await probe(page)).commandsSent;
    await delegate(page, 0, 'npc.victoria', /навіс/);
    expect((await core(page)).game.flags, 'доручення — факт ядра').toContain('f.errand-gear-shelter-victoria');
    await expect.poll(async () => (await probe(page)).jobs[0]?.kind ?? null, { timeout: 5_000, message: 'Вікторія мусить узятись за доручення' }).toBe('errand');
    // Герой тим часом робить своє — підходить ближче до табору (тайл 2,5), щоб навіс і Вікторія були в кадрі; вона йде своїм шляхом, не за ним.
    const q1 = await probe(page);
    await walk(page, routeXY('camp-lake', [q1.playerX, q1.playerY], { x: 80, y: 176 }));
    // Поки Вікторія працює — три різні точки: герой, Вікторія біля навісу (≥ 2,5 тайла від героя), Метью окремо.
    await expect.poll(async () => { const j = (await probe(page)).jobs[0]; return j?.kind === 'errand' ? j.phase : null; }, { timeout: 30_000, message: 'Вікторія мусить дійти й працювати' }).toBe('work');
    const p = await probe(page);
    const [vic, mat] = p.followers as [{ x: number; y: number }, { x: number; y: number }];
    const d = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y) / TILE;
    console.log(`GAME-202 ${v.name}: герой↔Вікторія ${d(vic, { x: p.playerX, y: p.playerY }).toFixed(2)} т, герой↔Метью ${d(mat, { x: p.playerX, y: p.playerY }).toFixed(2)} т, Вікторія↔Метью ${d(vic, mat).toFixed(2)} т`);
    expect(d(vic, { x: p.playerX, y: p.playerY }), 'Вікторія працює далеко від героя, а не в строю').toBeGreaterThanOrEqual(2.5);
    expect(d(vic, mat), 'Метью не пішов за Вікторією гуськом').toBeGreaterThanOrEqual(2);
    expect(d(mat, { x: p.playerX, y: p.playerY }), 'Метью — окрема точка, не на героєві').toBeGreaterThan(0.5);
    expect(p.jobs[1], 'у Метью доручення нема — він вільний').toBeNull();
    await page.screenshot({ path: `${SHOTS}/family-errand-${v.side}.png` });
    await expect.poll(() => taskOutcome(page, 'gear-shelter'), { timeout: 20_000, message: 'ядро мусить зарахувати справу від помічника' }).toBe('done');
    expect((await probe(page)).commandsSent, 'команда ядру пішла').toBeGreaterThan(c0);
    // Справу зроблено — доручення зникло, Вікторія вертається до родини.
    await expect.poll(async () => (await probe(page)).jobs[0], { timeout: 15_000, message: 'після справи Вікторія вільна' }).toBeNull();
    await page.waitForTimeout(4_000);
    const q = await probe(page);
    expect(d(q.followers[0] as { x: number; y: number }, { x: q.playerX, y: q.playerY }), 'Вікторія повернулась до героя').toBeLessThanOrEqual(4);
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

test('негативний контроль: без доручення ніхто не йде до навісу й справа лишається відкритою', async ({ browser }) => {
  test.setTimeout(300_000);
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await arriveInCamp(page);
  await page.waitForTimeout(8_000);
  const p = await probe(page);
  expect(p.jobs.every((j) => j === null), 'без доручення в родини немає роботи').toBe(true);
  expect(await taskOutcome(page, 'gear-shelter')).toBe('open');
  expect((await core(page)).game.flags.some((f) => f.startsWith('f.errand-'))).toBe(false);
  await ctx.close();
});
