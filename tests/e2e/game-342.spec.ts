// GAME-342 · зразковий день: від відкриття сторінки до керованого героя — не більше 5 справжніх дотиків (було ~17 у ☰).
// Дотики рахує сама сторінка: слухач pointerdown (touch) у фазі захоплення на window — тап Playwright (CDP) тут справжній, не click().
// GAME-353: зразок тепер ПОЧИНАЄТЬСЯ вдома — «керований герой» = герой на мапі дому, що йде за стрілкою, а перша дія — авто до крамниці. Дотики: вступ (1) + «їдемо» в рамці (1) = 2 ≤ 5;
// сам швидкий старт (герой, пролог) дотиків не коштує. Старий шлях до дороги (?skipHome=1, лише e2e) лишається під тим самим бюджетом ≤ 5 — другий блок нижче (його перевіряли GAME-342/346).
// GAME-346: +1 дотик на вступ; вступ видно до першої дії. Мутація (перевірено): у samplePort `intro: () => sampleIntroOpen` → `() => false` → «вступ зразка видно до першої події» червоніє.
// Мутація (перевірено): прибрати виклик `if (sampleOn) sampleQuickStart();` у src/main.ts, або SAMPLE_QUICK_STEPS 40 → 3 (знову «не пройдено крок») → обидві орієнтації червоніють:
//   «швидкий старт дійшов до порога дому» (гравець мусив би водити ☰ до дому).
import { expect, test, type Page } from '@playwright/test';
import { waitGameReady } from './ready';
import { core, probe, route, walk } from './chapter-driver';

const MAX_TAPS = 5;
const taps = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as { __taps: number }).__taps);

const dialogueBtn = (page: Page) => page.locator('[data-ui="dialogue"] [data-act]').last();

for (const o of [{ name: 'portrait', viewport: { width: 390, height: 844 } }, { name: 'landscape', viewport: { width: 932, height: 430 } }] as const) {
  test.describe(`GAME-342 (шлях до дороги, ?skipHome=1) — ${o.name}`, () => {
    test.use({ viewport: o.viewport, hasTouch: true, isMobile: false });

    // seed=7 — дорога без події (1 дотик); без ?seed збірка e2e бере сталий сід 20261022 — подія в дорозі відкрита (2 дотики діалогу + «Старт»), як у більшості справжніх сідів.
    for (const [label, url] of [['seed=7 (без події в дорозі)', '/?seed=7&sampleDay=1&skipHome=1'], ['сід за замовчуванням (подія в дорозі)', '/?sampleDay=1&skipHome=1']] as const) {
      test(`${label}: до керованого героя ≤ ${MAX_TAPS} дотиків, окремий слот`, async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.addInitScript(() => {
          const w = window as unknown as { __taps: number };
          w.__taps = 0;
          window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' && e.isTrusted) w.__taps++; }, true);
        });
        await page.goto(url);
        await waitGameReady(page);
        expect(await page.evaluate(() => (window as unknown as { __game: { probe: { sampleQuickStart?: string } } }).__game.probe.sampleQuickStart), 'швидкий старт дійшов до дороги (не застряг)').toBe('ok');
        // GAME-346: перед першою подією дороги — кадр «хто ми й куди їдемо» (+1 дотик); без нього зразок відкривався подією з невідомими людьми.
        const intro = page.locator('[data-ui="sample-intro"]');
        await expect(intro, 'вступ зразка видно до першої події').toBeVisible();
        await expect(page.locator('[data-ui="sample-intro-text"]')).not.toBeEmpty();
        await page.locator('[data-ui="sample-intro-go"]').tap();
        await expect(intro).toBeHidden();
        const mg = page.locator('[data-ui="minigame"]');
        // Подія в дорозі (діалог) — справжні дотики по кнопці діалогу, доки не відкриється вступ дороги.
        for (let i = 0; i < 8 && !(await mg.isVisible().catch(() => false)); i++) {
          if (await dialogueBtn(page).isVisible().catch(() => false)) await dialogueBtn(page).tap();
          await page.waitForTimeout(350);
        }
        await expect(mg, 'вступ дороги без ☰').toHaveAttribute('data-phase', 'open', { timeout: 15_000 });
        await page.locator('[data-ui="mg-start"]').tap();
        await expect(mg).toHaveAttribute('data-phase', 'play');
        await expect.poll(async () => Number(await page.locator('[data-ui="mg-drive"]').getAttribute('data-progress')), { message: 'дорога їде: герой під керуванням', timeout: 5_000 }).toBeGreaterThan(0.005);
        const n = await taps(page);
        expect(n, `дотиків від відкриття до керованого героя: ${n}`).toBeLessThanOrEqual(MAX_TAPS);
        expect(n, 'дотики справді враховано (лічильник живий)').toBeGreaterThanOrEqual(1);
        expect((await page.evaluate(() => indexedDB.databases())).map((d) => d.name).sort(), 'зразок пише лише у свій слот').toEqual(['camplife-sample']);
        const g = await page.evaluate(() => (window as unknown as { __game: { read: () => { game: { player: { locationId: string }; inventory: Record<string, number>; quests: Record<string, { status: string }> } } } }).__game.read().game);
        expect(g.player.locationId).toBe('loc.road');
        expect(g.inventory['item.tent'], 'намет узято (як після ручних збирань)').toBe(1);
        expect(g.inventory['item.sleeping-bag'], 'спальник узято').toBe(1);
        expect(Object.values(g.quests).filter((q) => q.status === 'completed').length, 'пролог і збори закрито').toBeGreaterThanOrEqual(5);
        expect(errors).toEqual([]);
        test.info().annotations.push({ type: 'taps', description: String(n) });
      });
    }
  });
}

/** GAME-353 · новий старт: удома. Перша дія гравця — авто до крамниці; до неї ≤ 5 дотиків (вступ + «їдемо»). */
for (const o of [{ name: 'portrait', viewport: { width: 390, height: 844 } }, { name: 'landscape', viewport: { width: 932, height: 430 } }, { name: 'square', viewport: { width: 600, height: 600 } }] as const) {
  test.describe(`GAME-342/353 (старт удома) — ${o.name}`, () => {
    test.use({ viewport: o.viewport, hasTouch: true, isMobile: false });
    test(`до першої дії ≤ ${MAX_TAPS} дотиків, окремий слот`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.addInitScript(() => {
        const w = window as unknown as { __taps: number };
        w.__taps = 0;
        window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' && e.isTrusted) w.__taps++; }, true);
      });
      await page.goto('/?seed=7&sampleDay=1');
      await waitGameReady(page);
      expect(await page.evaluate(() => (window as unknown as { __game: { probe: { sampleQuickStart?: string } } }).__game.probe.sampleQuickStart), 'швидкий старт дійшов до порога дому (не застряг)').toBe('ok');
      const intro = page.locator('[data-ui="sample-intro"]');
      await expect(intro, 'вступ зразка видно до першої дії').toBeVisible();
      await expect(page.locator('[data-ui="sample-intro-text"]')).not.toBeEmpty();
      await page.locator('[data-ui="sample-intro-go"]').tap();
      await expect(intro).toBeHidden();
      const g0 = (await core(page)).game;
      expect(g0.player?.locationId, 'герой удома, а не на дорозі').toBe('loc.home');
      expect(g0.quests['ST-003']?.status, 'крамниця — перша справа').toBe('active');
      expect((await probe(page)).map).toBe('home');
      // Перша дія: підійти до авто (стрілка веде) й відповісти «їдемо» в рамці — справжній дотик по кнопці рамки.
      await expect.poll(async () => (await probe(page)).fx.target, { message: 'стрілка вказує мету', timeout: 15_000 }).toBe('obj.vehicle');
      const at = await probe(page);
      await walk(page, route('home', [at.playerX, at.playerY], 'obj.vehicle', true));
      const go = page.locator('.ui-talk [data-ui="dialogue"] [data-act="visit"]');
      await expect(go.first(), 'авто питає «Куди їдемо?»').toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(450);   // «глухота» рамки ~350 мс після появи
      await go.first().tap();
      await expect.poll(async () => (await core(page)).game.player?.locationId, { message: 'перша дія гравця: авто повезло до крамниці' }).toBe('loc.shop');
      const n = await taps(page);
      expect(n, `дотиків до першої дії: ${n}`).toBeLessThanOrEqual(MAX_TAPS);
      expect(n, 'дотики справді враховано (лічильник живий)').toBeGreaterThanOrEqual(1);
      expect((await page.evaluate(() => indexedDB.databases())).map((d) => d.name).sort(), 'зразок пише лише у свій слот').toEqual(['camplife-sample']);
      expect(errors).toEqual([]);
      test.info().annotations.push({ type: 'taps', description: String(n) });
    });
  });
}
