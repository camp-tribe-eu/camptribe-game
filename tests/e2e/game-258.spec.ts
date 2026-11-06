// GAME-258 · приїзд у табір: стрілка веде спершу до Елізи, а не до намету; намет до знайомства й до ділянки не ставиться (м'який рядок, жодного штрафу).
// Негативний контроль (закон 1): без `after` у content/waves.json стрілка одразу на «task.pitch-tent», і перший expect червоніє.
import { expect, test } from '@playwright/test';
import { probe, route, walk } from './chapter-driver';
import { arriveInCamp, taskOutcome } from './camp-arrival';

const VIEWS = [{ w: 844, h: 390, name: 'ландшафт' }, { w: 390, h: 844, name: 'портрет' }] as const;
for (const v of VIEWS) {
  test(`табір, ${v.name}: стрілка → Еліза (не намет); дія біля намету до черги — лише м'який рядок`, async ({ browser }) => {
    test.setTimeout(300_000);
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errors = await arriveInCamp(page);
    await expect.poll(async () => (await probe(page)).fx.target, { timeout: 20_000, message: 'перша ціль «Далі» у таборі — Еліза' }).toBe('npc.elise');
    const q = await probe(page);
    await walk(page, route('camp-lake', [q.playerX, q.playerY], 'task.pitch-tent'));
    await expect.poll(async () => (await probe(page)).nearObject, { timeout: 8_000 }).toBe('task.pitch-tent');
    await page.locator('[data-touch="interact"]').tap();
    await page.waitForTimeout(600);
    expect(await taskOutcome(page, 'pitch-tent'), 'намет до знайомства з Елізою не ставиться').toBe('open');
    expect((await probe(page)).fx.target, 'стрілка лишилась на Елізі').toBe('npc.elise');
    expect(errors).toEqual([]);
    await ctx.close();
  });
}
