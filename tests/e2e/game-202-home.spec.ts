// GAME-202 (решта картки) · «Збори» вдома: родина (авто, з Мією) після крамниці повертається додому — живе хвиля «Виїзд о шостій» з м'яким строком
// (лічильник хвилин у картці мети, спізнення — лише кумедний рядок, ніколи не провал). Герой у розмові доручає Вікторії праску (task.iron-clothes на home.tmj):
// вона сама йде й працює, ядро закриває справу від помічника; після цього вибір у розмові ЗНИКАЄ (умова ядра taskOpen) — «каже „іду“, а не йде» більше нема.
// Обидві орієнтації телефона; знімок — поки Вікторія прасує. Негативний контроль (закон 1): без доручення справа лишається відкритою й ніхто не йде.
import { expect, test, type Page } from '@playwright/test';
import { core, probe, routeXY, talk, walk } from './chapter-driver';
import { waitGameReady } from './ready';

const SHOTS = process.env.FAMILY_SHOTS ?? 'test-results';
const SETTINGS_KEY = 'camplife.settings.v1';
const VIEWS = [{ side: 'landscape', w: 844, h: 390, name: 'ландшафт' }, { side: 'portrait', w: 390, h: 844, name: 'портрет' }] as const;
const panel = (page: Page) => page.locator('.ui-story');

async function act(page: Page, kind: string, key = ''): Promise<void> {
  await panel(page).locator(`[data-act="${kind}"][data-key="${key}"]`).click({ timeout: 5_000 });
  await page.waitForTimeout(400);
}
/** Дім після крамниці (авто, з Мією, seed 7) кнопками панелі, далі перезавантаження в справжню гру на мапі дому. */
async function homePacking(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(([k]) => { try { localStorage.setItem(k as string, JSON.stringify({ textScale: 100, language: 'uk', hintSeen: true })); } catch { /* сховища немає */ } }, [SETTINGS_KEY] as const);
  await page.goto('/?seed=7');
  await waitGameReady(page);
  await page.locator('[data-touch="story"]').click();
  await panel(page).locator('[data-act="create"]', { hasText: /Авто|Car/ }).first().click();
  await page.waitForTimeout(400);
  for (const [k, key] of [['complete', 'q.prologue-home-001'], ['complete', 'q.st-001'], ['complete', 'q.st-002'], ['visit', 'loc.shop'], ['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'], ['complete', 'q.st-003'], ['visit', 'loc.home']] as const) await act(page, k, key);
  const c = await core(page);
  expect(c.game.player?.locationId).toBe('loc.home');
  expect(c.game.quests['CH1-HOME-001']?.status).toBe('active');
  await page.waitForTimeout(600);
  await page.goto('/?seed=7&mapFirst=1');
  await waitGameReady(page);
  await page.locator('[data-ui="recovery-close"]').click({ timeout: 800 }).catch(() => undefined);
  expect((await core(page)).game.player?.locationId, 'сейв підхопився: гравець удома').toBe('loc.home');
  return errors;
}
const outcome = async (page: Page, task: string): Promise<string> => {
  const w = (await core(page)).game.wave as { active: { tasks: Record<string, { outcome: string }> } | null; past: Record<string, Record<string, string>> } | undefined;
  return w?.active?.tasks[task]?.outcome ?? w?.past['wave.ch1-home-departure']?.[task] ?? 'none';
};
/** Підійти до слідувача `i`, відкрити розмову; повертає рамку. */
async function approach(page: Page, i: number, id: string): Promise<void> {
  const q0 = await probe(page);
  await walk(page, routeXY('home', [q0.playerX, q0.playerY], { x: 240, y: 144 }, true));   // кухня (7,4): жодної живої цілі в зоні дії
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
  await page.waitForTimeout(600);
  // Перша репліка («М-м? Я слухаю») → «Далі» → гілка дому.
  await talk(page).locator('[data-act]').last().click();
  await page.waitForTimeout(450);
}
async function closeTalk(page: Page): Promise<void> {
  for (let k = 0; k < 4 && await talk(page).isVisible().catch(() => false); k++) { await talk(page).locator('[data-act]').last().click(); await page.waitForTimeout(450); }
}

for (const v of VIEWS) {
  test(`«Збори»: доручення Вікторії «праска» вдома — сама йде, працює, справа закрита ядром; вибір зникає — ${v.name}`, async ({ browser }) => {
    test.setTimeout(600_000);
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errors = await homePacking(page);
    expect(await outcome(page, 'iron-clothes'), 'справа «праска» відкрита вдома (авто)').toBe('open');
    await expect(page.locator('[data-ui="wave-task"][data-task="iron-clothes"]'), 'м’який строк видно в картці мети').toBeVisible();
    await approach(page, 0, 'npc.victoria');
    const choice = talk(page).locator('[data-act]', { hasText: /Попрасуєш/ });
    await expect(choice).toBeVisible({ timeout: 5_000 });
    await choice.click();
    await page.waitForTimeout(450);
    await closeTalk(page);
    expect((await core(page)).game.flags, 'доручення — факт ядра').toContain('f.errand-iron-clothes-victoria');
    await expect.poll(async () => (await probe(page)).jobs[0]?.kind ?? null, { timeout: 5_000, message: 'Вікторія мусить узятись за праску' }).toBe('errand');
    await expect.poll(async () => { const j = (await probe(page)).jobs[0]; return j?.kind === 'errand' ? j.phase : null; }, { timeout: 30_000, message: 'Вікторія мусить дійти до дошки й працювати' }).toBe('work');
    await page.screenshot({ path: `${SHOTS}/fin-packing-errand-${v.side}.png` });
    await expect.poll(() => outcome(page, 'iron-clothes'), { timeout: 20_000, message: 'ядро мусить зарахувати справу від помічника' }).toBe('done');
    await expect.poll(async () => (await probe(page)).jobs[0], { timeout: 15_000, message: 'після справи Вікторія вільна' }).toBeNull();
    // Умова ядра taskOpen: справу зроблено — у розмові доручення більше не пропонується (інакше «іду» — а йти нікуди).
    await approach(page, 0, 'npc.victoria');
    await expect(talk(page)).toBeVisible();
    await expect(talk(page).locator('[data-act]', { hasText: /Попрасуєш/ })).toHaveCount(0);
    await closeTalk(page);
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

test('негативний контроль: без доручення ніхто не йде до дошки, справа «праска» лишається відкритою', async ({ browser }) => {
  test.setTimeout(300_000);
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await homePacking(page);
  await page.waitForTimeout(8_000);
  const p = await probe(page);
  expect(p.jobs.every((j) => j === null)).toBe(true);
  expect(await outcome(page, 'iron-clothes')).toBe('open');
  expect((await core(page)).game.flags.some((f) => f.startsWith('f.errand-'))).toBe(false);
  await ctx.close();
});
