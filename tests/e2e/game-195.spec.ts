// GAME-195 · розвилка рибки (OD-023): «відпустити» і «взяти» — два різні вечори, обидва доходять до кінця сцени вечора дня 2.
// Шлях до етапу вогнища — кнопками ☰ (як game-190); далі ногами: озеро → улов → вибір → вогнище руками → (узяв: рибка на патичку) → вечірня сцена.
// Обидві орієнтації телефона.
import { expect, test, type Page } from '@playwright/test';
import { core, playFire, playFishing, probe, route, walk } from './chapter-driver';

const SETTINGS_KEY = 'camplife.settings.v1';
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
const nodeOf = async (page: Page): Promise<{ id: string; node: string } | null> => (await core(page)).game.dialogue as { id: string; node: string } | null;

for (const v of VIEWS) {
  for (const choice of ['release', 'keep'] as const) {
    test(`вечір дня 2 після рибки «${choice === 'release' ? 'відпустити' : 'взяти'}»: доходить до кінця — ${v.name}`, async ({ browser }) => {
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
      for (const [k, key] of [['complete', 'q.prologue-home-001'], ['complete', 'q.st-001'], ['complete', 'q.st-002'], ['visit', 'loc.shop'], ['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'], ['complete', 'q.st-003'],
        ['visit', 'loc.home'], ['complete', 'q.ch1-home-001'], ['visit', 'loc.road'], ['complete', 'q.st-004'], ['visit', 'loc.camp.lake'],
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
      const touch = v.side === 'landscape';
      await expect.poll(async () => (await probe(page)).fire.phase, { timeout: 10_000 }).toBe('stack');
      // 1) озеро: улов → вибір → факт ядра (без вибору факту нема).
      expect((await core(page)).game.flags.filter((f) => f.startsWith('f.fish-'))).toEqual([]);
      const q = await probe(page);
      await walk(page, route('camp-lake', [q.playerX, q.playerY], 'fish.shore'));
      await expect.poll(async () => { const p = await probe(page); const s = p.fish.spot; return Math.hypot(p.playerX - s.x, p.playerY - s.y) <= 36 && !p.playerMoving; }, { timeout: 8_000 }).toBe(true);
      await playFishing(page, touch, choice);
      const flags = (await core(page)).game.flags;
      expect(flags.includes(choice === 'keep' ? 'f.fish-kept' : 'f.fish-released'), 'вибір записано фактом ядра').toBe(true);
      // 2) вогнище руками.
      const p2 = await probe(page);
      await walk(page, route('camp-lake', [p2.playerX, p2.playerY], 'obj.campfire'));
      await expect.poll(async () => (await probe(page)).nearObject, { timeout: 8_000 }).toBe('obj.campfire');
      const btn = page.locator('[data-touch="interact"]');
      for (let k = 0; k < 3; k++) {
        await page.waitForTimeout(450);
        if (touch) await btn.tap(); else { await page.keyboard.down('KeyE'); await page.waitForTimeout(80); await page.keyboard.up('KeyE'); }
        await expect.poll(async () => (await probe(page)).fire.logs, { timeout: 5_000 }).toBe(k + 1);
      }
      await expect.poll(async () => (await probe(page)).fire.phase, { timeout: 5_000 }).toBe('match');
      if (choice === 'keep') {
        // 3) узяв: після розпалу — рибка на патичку. Без вводу не нанизана й вечір не почався.
        await playFire(page, touch);
        await expect.poll(async () => (await probe(page)).grill.phase, { timeout: 10_000, message: 'після розпалу — патичок із рибкою' }).toBe('skewer');
        await page.waitForTimeout(3_000);
        expect((await probe(page)).grill.phase, 'без вводу рибка не нанизується').toBe('skewer');
        expect(await nodeOf(page), 'вечір не почався, поки рибка не засмажена').toBeNull();
        await page.waitForTimeout(450);
        if (touch) await btn.tap(); else { await page.keyboard.down('KeyE'); await page.waitForTimeout(80); await page.keyboard.up('KeyE'); }
        await expect.poll(async () => (await probe(page)).grill.phase, { timeout: 3_000 }).toBe('grill');
        // Піднімаємо патичок, коли жар високий; доки рибка не готова.
        await page.evaluate((isTouch) => new Promise<void>((resolve) => {
          const g = (window as unknown as { __game: { probe: { grill: { phase: string; heat: number } } } }).__game;
          const b = document.querySelector('[data-touch="interact"]');
          let holding = false;
          const set = (want: boolean): void => {
            if (want === holding) return;
            holding = want;
            if (isTouch && b) b.dispatchEvent(new PointerEvent(want ? 'pointerdown' : 'pointerup', { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true }));
            else { const e = new KeyboardEvent(want ? 'keydown' : 'keyup', { key: 'e', code: 'KeyE', bubbles: true, cancelable: true }); Object.defineProperty(e, 'keyCode', { get: () => 69 }); window.dispatchEvent(e); }
          };
          const t0 = performance.now();
          const step = (): void => {
            const s = g.probe.grill;
            if (s.phase !== 'grill' || performance.now() - t0 > 30_000) { set(false); resolve(); return; }
            set(s.heat > 0.6);
            requestAnimationFrame(step);
          };
          step();
        }), touch);
      } else await playFire(page, touch);
      // 4) вечірня сцена: пройти до кінця й звірити гілку вечора.
      await expect.poll(async () => (await nodeOf(page))?.id, { timeout: 15_000, message: 'вечір почався' }).toBe('dlg.ch1-fire');
      const seen: string[] = [];
      for (let i = 0; i < 40; i++) {
        const d = await nodeOf(page);
        if (!d) break;
        seen.push(d.node);
        await panel(page).locator('[data-ui="dialogue"] [data-act]').first().click({ timeout: 5_000 });
        await page.waitForTimeout(250);
      }
      expect(await nodeOf(page), 'вечір дійшов до кінця (діалог закрито)').toBeNull();
      if (choice === 'keep') { expect(seen.some((n) => n === 'fk1' || n === 'fkl'), 'гілка улову').toBe(true); expect(seen).not.toContain('fr1'); }
      else { expect(seen).toContain('fr3'); expect(seen).not.toContain('fk1'); expect((await core(page)).game.flags).toContain('f.trust-nora-fish'); }
      expect(seen[seen.length - 1]).toMatch(/^(l12-plain|b3)$/);
      // 5) факт вибору лишається в збереженні: перезавантаження не губить його.
      await page.waitForTimeout(800);
      await page.reload();
      await page.waitForFunction(() => (window as unknown as { __game?: { probe: { saveLoaded: boolean } } }).__game?.probe.saveLoaded === true, null, { timeout: 30_000 });
      expect((await core(page)).game.flags).toContain(choice === 'keep' ? 'f.fish-kept' : 'f.fish-released');
      expect(errors).toEqual([]);
      await ctx.close();
    });
  }
}
