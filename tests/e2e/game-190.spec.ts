// GAME-190 · дрова й вогнище руками (OD-022): без вводу нічого не стається; з вводом — гілки, колода, 3 удари → дрова в ядрі; вогнище: 3 поліна, сірник (тримати → відпустити
// в зеленому) → сцена вечора. Обидві орієнтації телефона; знімки посеред рубання й сірника — у scratchpad (G190_SHOTS).
import { expect, test, type Page } from '@playwright/test';
import { answerOne, core, goAndDo, playFire, playWood, probe, route, talk, walk } from './chapter-driver';

const CAMP = 'loc.camp.lake';
const SETTINGS_KEY = 'camplife.settings.v1';
const SHOTS = process.env.G190_SHOTS ?? 'test-results';
const VIEWS = [{ side: 'portrait', w: 390, h: 844, name: 'портрет' }, { side: 'landscape', w: 844, h: 390, name: 'ландшафт' }] as const;
const panel = (page: Page) => page.locator('.ui-story');
async function act(page: Page, kind: string, key = ''): Promise<void> {
  await panel(page).locator(`[data-act="${kind}"][data-key="${key}"]`).click({ timeout: 5_000 });
  await page.waitForTimeout(400);
  if (kind === 'visit' && (key === 'loc.road' || key === 'loc.camp.lake')) {
    const dlg = panel(page).locator('[data-ui="dialogue"]');
    for (let i = 0; i < 6 && await dlg.isVisible({ timeout: 400 }).catch(() => false); i++) { await dlg.locator('[data-act]').last().click(); await page.waitForTimeout(400); }
  }
}
/** Приїзд у табір кнопками ☰ (це не те, що перевіряємо); далі мапа-перша гра: хвиля справ, розмова з Елізою — ногами, як у game-183. */
async function arriveInCamp(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(([k]) => { try { localStorage.setItem(k as string, JSON.stringify({ textScale: 100, language: 'uk', hintSeen: true })); } catch { /* сховища немає */ } }, [SETTINGS_KEY] as const);
  await page.goto('/?seed=7');
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { saveLoaded: boolean } } }).__game?.probe.saveLoaded === true, null, { timeout: 30_000 });
  await page.locator('[data-touch="story"]').click();
  await panel(page).locator('[data-act="create"]', { hasText: /Велосипед|Bike/ }).first().click();
  await page.waitForTimeout(400);
  for (const [k, key] of [['complete', 'q.prologue-home-001'], ['complete', 'q.st-001'], ['complete', 'q.st-002'], ['visit', 'loc.shop'], ['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'], ['complete', 'q.st-003'],
    ['visit', 'loc.home'], ['complete', 'q.ch1-home-001'], ['visit', 'loc.road'], ['complete', 'q.st-004'], ['visit', 'loc.camp.lake']] as const) await act(page, k, key);
  expect((await core(page)).game.player?.locationId).toBe(CAMP);
  await page.waitForTimeout(600);
  await page.goto('/?seed=7&mapFirst=1');
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { saveLoaded: boolean } } }).__game?.probe.saveLoaded === true, null, { timeout: 30_000 });
  await page.locator('[data-ui="recovery-close"]').click({ timeout: 800 }).catch(() => undefined);
  expect((await core(page)).game.player?.locationId, 'сейв підхопився: гравець у таборі').toBe(CAMP);
  return errors;
}
const wood = async (page: Page): Promise<number> => (await core(page)).game.inventory['item.firewood'] ?? 0;

for (const v of VIEWS) {
  test(`дрова руками: без вводу нічого; гілки → колода → 3 удари → дрова в ядрі; стрілка йде гілка за гілкою — ${v.name}`, async ({ browser }) => {
    test.setTimeout(600_000);
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errors = await arriveInCamp(page);
    // 0) до дров гра веде ногами (намет, справи хвилі, розмова з Елізою) — як game-183; зупинка, щойно стрілка вказала гілку.
    const touch = v.side === 'landscape';
    for (let i = 0; i < 80 && !((await probe(page)).fx.target ?? '').startsWith('wood.'); i++) {
      if (await page.locator('[data-ui="summary-continue"]').count()) { await page.locator('[data-ui="summary-continue"]').click(); await page.waitForTimeout(500); continue; }
      if (await talk(page).count()) { await answerOne(page); continue; }
      await goAndDo(page, touch);
    }
    // 1) стрілка веде до першої гілки; підпис — про дрова.
    await expect.poll(async () => (await probe(page)).fx.target, { timeout: 20_000, message: 'стрілка мусить вказувати першу гілку' }).toBe('wood.branch.0');
    await expect(page.locator('[data-ui="next-hint"]')).toContainText(/гілки|дрова/i);
    // 2) без вводу дрова не з'являються.
    await page.waitForTimeout(4_000);
    expect(await wood(page), 'без вводу дров нема').toBe(0);
    expect((await probe(page)).wood.phase).toBe('gather');
    expect((await probe(page)).wood.got).toBe(0);
    // 3) з вводом. Після першої гілки стрілка веде до другої.
    await playWood(page, touch, async () => { await page.screenshot({ path: `${SHOTS}/g190-chop-${v.side}.png` }); expect((await probe(page)).wood.strikes, 'мить знімка: два удари').toBe(2); });
    await expect.poll(() => wood(page), { timeout: 8_000, message: 'після 3 ударів ядро дало дрова' }).toBe(1);
    expect((await probe(page)).wood.phase).toBe('idle');
    expect(errors).toEqual([]);
    await ctx.close();
  });

  test(`вогнище руками: без вводу не горить; 3 поліна й сірник (тримати → відпустити в зеленому) → сцена вечора; відпустив зарано — згасло — ${v.name}`, async ({ browser }) => {
    test.setTimeout(900_000);
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(([k]) => { try { localStorage.setItem(k as string, JSON.stringify({ textScale: 100, language: 'uk', hintSeen: true })); } catch { /* сховища немає */ } }, [SETTINGS_KEY] as const);
    await page.goto('/?seed=7');
    await page.waitForFunction(() => (window as unknown as { __game?: { probe: { saveLoaded: boolean } } }).__game?.probe.saveLoaded === true, null, { timeout: 30_000 });
    await page.locator('[data-touch="story"]').click();
    await panel(page).locator('[data-act="create"]', { hasText: /Велосипед|Bike/ }).first().click();
    await page.waitForTimeout(400);
    // До етапу вогнища — кнопками ☰ (як game-170: це не предмет перевірки); далі лише мапа.
    for (const [k, key] of [['complete', 'q.prologue-home-001'], ['complete', 'q.st-001'], ['complete', 'q.st-002'], ['visit', 'loc.shop'], ['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'],
      ['complete', 'q.st-003'], ['visit', 'loc.home'], ['complete', 'q.ch1-home-001'], ['visit', 'loc.road'], ['complete', 'q.st-004'], ['visit', 'loc.camp.lake'],
      ['talk', 'npc.elise'], ['choose', 'dlg.elise-greeting.hello.c1'], ['continue', ''], ['continue', ''], ['choose', 'dlg.elise-greeting.spot.c1'], ['continue', ''],
      ['pickup', 'item.firewood'], ['complete', 'q.st-005']] as const) await act(page, k, key);
    await page.locator('[data-ui="summary-continue"]').click();
    await expect(page.locator('[data-ui="summary"]')).toHaveCount(0, { timeout: 15_000 });
    await page.locator('[data-touch="story"]').click();
    for (const [k, key] of [['complete', 'q.ch1-d2-001'], ['talk', 'npc.elise'], ['choose', 'dlg.elise-greeting.hello.c11'], ['choose', 'dlg.elise-greeting.morning.c1'],
      ['choose', 'dlg.elise-greeting.advice.c1'], ['continue', ''], ['continue', ''], ['complete', 'q.ch1-d2-elise-001'],
      ['talk', 'npc.elise'], ['choose', 'dlg.elise-greeting.hello.c14'], ['choose', 'dlg.elise-greeting.dinner.c2'], ['continue', ''], ['continue', ''], ['complete', 'q.ch1-d2-camp-001']] as const) await act(page, k, key);
    expect((await core(page)).game.quests['CH1-D2-FIRE-001']?.status).toBe('active');
    await panel(page).locator('[data-ui="story-close"]').click();
    // Кострище стоїть холодне й чекає: без вводу вечір сам не починається.
    await expect.poll(async () => (await probe(page)).fire.phase, { timeout: 10_000 }).toBe('stack');
    await page.waitForTimeout(4_000);
    expect((await probe(page)).fire.phase, 'без вводу вогонь не горить').toBe('stack');
    expect((await core(page)).game.dialogue, 'без вводу сцена вечора не почалась').toBeNull();
    // До вогнища (112,144): ходьба по плитках зі справжньої мапи.
    const q = await probe(page);
    await walk(page, route('camp-lake', [q.playerX, q.playerY], 'obj.campfire'));
    await expect.poll(async () => (await probe(page)).nearObject, { timeout: 8_000 }).toBe('obj.campfire');
    const touch = v.side === 'landscape';
    const btn = page.locator('[data-touch="interact"]');
    if (touch) await btn.tap(); else { await page.keyboard.down('KeyE'); await page.waitForTimeout(80); await page.keyboard.up('KeyE'); }
    await expect.poll(async () => (await probe(page)).fire.logs, { timeout: 5_000 }).toBe(1);
    // Негативний контроль: нескладене кострище не запалюється (сірник відкривається лише після 3 поліньої).
    expect((await probe(page)).fire.phase).toBe('stack');
    for (let k = 1; k < 3; k++) {
      await page.waitForTimeout(450);
      if (touch) await btn.tap(); else { await page.keyboard.down('KeyE'); await page.waitForTimeout(80); await page.keyboard.up('KeyE'); }
      await expect.poll(async () => (await probe(page)).fire.logs, { timeout: 5_000 }).toBe(k + 1);
    }
    await expect.poll(async () => (await probe(page)).fire.phase, { timeout: 5_000 }).toBe('match');
    // Відпустив зарано (шкала ≈ 0) — згасло, не запалилось, штрафу нема.
    await page.waitForTimeout(450);
    if (touch) await btn.dispatchEvent('pointerdown', { pointerId: 7, pointerType: 'touch', isPrimary: true }); else await page.keyboard.down('KeyE');
    await expect.poll(async () => (await probe(page)).fire.holding).toBe(true);
    if (touch) await btn.dispatchEvent('pointerup', { pointerId: 7, pointerType: 'touch', isPrimary: true }); else await page.keyboard.up('KeyE');
    await expect.poll(async () => (await probe(page)).fire.fizzles, { timeout: 3_000, message: 'відпустив поза зеленим — сірник згас' }).toBe(1);
    expect((await probe(page)).fire.phase).toBe('match');
    // Тепер як слід: тримати й відпустити в зеленому → полум'я росте → сцена вечора.
    await playFire(page, touch, async () => { await page.screenshot({ path: `${SHOTS}/g190-match-${v.side}.png` }); });
    await expect(panel(page)).toBeVisible({ timeout: 10_000 });
    expect(errors).toEqual([]);
    await ctx.close();
  });
}
