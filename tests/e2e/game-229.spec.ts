// GAME-229 · «Навички ростуть від дій». День 1 до кінця (ST-005) з дією руками на мапі: розбили ящик у таборі → практика «Майстра» → ранг 1.
// Кінець дня: СПЕРШУ екран «Що відкрилось» (фанфара), ПОТІМ підсумок дня (категорії з'являються по одній, лічильник росте). Над героєм жодних цифр.
// Вимкнено в налаштуваннях — екрана немає, навички ростуть так само. Обидві орієнтації (390×844, 844×390) + знімки 9:16, 1:1, 16:9 (G229_SHOTS, типово test-results/g229).
import { mkdirSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { probe, routeXY, walk } from './chapter-driver';
import { waitGameReady } from './ready';
import { heroLabelOk } from '../../src/view/world/hero-label';

test.use({ hasTouch: true, isMobile: true });

const SHOTS = process.env.G229_SHOTS ?? 'test-results/g229';
const SETTINGS_KEY = 'camplife.settings.v1';
const VIEWS = [{ side: 'portrait', w: 390, h: 844 }, { side: 'landscape', w: 844, h: 390 }] as const;
const SHAPES = [{ name: '9x16', w: 390, h: 844 }, { name: '1x1', w: 600, h: 600 }, { name: '16x9', w: 844, h: 475 }] as const;
interface Core { game: { skills: Record<string, number>; practice: Record<string, number>; campaignEnded: boolean } }
const core = (page: Page): Promise<Core> => page.evaluate(() => (window as unknown as { __game: { read: () => Core } }).__game.read());
const sounds = (page: Page): Promise<string[]> => page.evaluate(() => (window as unknown as { __game: { sounds: () => string[] } }).__game.sounds());
const fx = (page: Page): Promise<{ rewardLast: string; headLabels: string[]; rewards: number }> => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __game: { probe: { fx: unknown } } }).__game.probe.fx)));
const panel = (page: Page) => page.locator('[data-ui="story"]');
const levelup = (page: Page) => page.locator('[data-ui="levelup"]');
const summary = (page: Page) => page.locator('[data-ui="summary"]');
const shot = async (page: Page, name: string): Promise<void> => { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const press = async (page: Page, loc: Locator): Promise<void> => { await loc.scrollIntoViewIfNeeded(); await loc.tap(); await page.waitForTimeout(400); };

async function open(page: Page, v: { w: number; h: number }, settings: Record<string, unknown> = {}): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(([k, s]) => { try { localStorage.setItem(k as string, JSON.stringify({ textScale: 100, language: 'uk', hintSeen: true, ...(s as object) })); } catch { /* сховища немає */ } }, [SETTINGS_KEY, settings] as const);
  await page.setViewportSize({ width: v.w, height: v.h });
  // GAME-256: день 1 закриває сон, а «Спати» — з 18:00. Вечір — без очікування й без перезавантаження посеред дня (воно перебазувало б показ нагород і рангів): старт гри о 18:00 (?atMinute=600, перемикач e2e; зсув від 08:00), далі дорога набігає ще години.
  await page.goto('/?seed=2&levelUps=1&atMinute=600');   // збірка e2e: екран рангів у старих e2e вимкнено, тут — справжня поведінка
  await waitGameReady(page);
  return errors;
}
const act = async (page: Page, kind: string, key = ''): Promise<void> => {
  const b = panel(page).locator(`[data-act="${kind}"][data-key="${key}"]`);
  if (!(await b.isVisible({ timeout: 5_000 }).catch(() => false))) throw new Error(`крок «${kind} ${key}»: кнопки немає`);
  await press(page, b);
  const dlg = panel(page).locator('[data-ui="dialogue"]');
  for (let i = 0; kind === 'visit' && key === 'loc.road' && i < 6 && await dlg.isVisible({ timeout: 400 }).catch(() => false); i++) await press(page, dlg.locator('[data-act]').last());
};
const at = async (page: Page): Promise<[number, number]> => { const p = await probe(page); return [p.playerX, p.playerY]; };
async function goTo(page: Page, x: number, y: number): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await walk(page, routeXY('camp-lake', await at(page), { x, y }));
    await page.waitForTimeout(250);
    const [px, py] = await at(page);
    if (Math.hypot(px - x, py - y) < 14) return;
  }
}
const hit = async (page: Page): Promise<void> => { await page.keyboard.down('KeyE'); await page.waitForTimeout(90); await page.keyboard.up('KeyE'); };

/** День 1 до табору; з дією руками (розбити ящик) між приїздом і кінцем дня. Повертає до кроку перед `q.st-005`. */
async function playToDayEnd(page: Page, withHands: boolean): Promise<void> {
  await press(page, page.locator('[data-touch="story"]'));
  await press(page, panel(page).locator('[data-act="create"]', { hasText: /Авто|Car/ }).first());
  for (const [k, key] of [['complete', 'q.prologue-home-001'], ['complete', 'q.st-001'], ['complete', 'q.st-002'], ['visit', 'loc.shop'], ['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'], ['checkout', 'basket.all'],
    ['complete', 'q.st-003'], ['visit', 'loc.home'], ['complete', 'q.ch1-home-001'], ['visit', 'loc.road'], ['complete', 'q.st-004'], ['visit', 'loc.camp.lake'], ['talk', 'npc.elise'],
    ['choose', 'dlg.elise-greeting.hello.c2'], ['continue', ''], ['choose', 'dlg.elise-greeting.spot.c1'], ['continue', ''], ['pickup', 'item.firewood']] as const) await act(page, k, key);
  if (withHands) {
    await press(page, panel(page).locator('[data-ui="story-close"]'));
    expect((await core(page)).game.skills['skill.mechanics'], 'до дії «Майстер» на нулі').toBe(0);
    await goTo(page, 660, 340);   // ящик за колонкою (680, 340), як у game-228
    await hit(page);
    await expect.poll(async () => (await core(page)).game.practice['hand:smash'] ?? 0, { timeout: 5_000 }).toBe(1);
    await press(page, page.locator('[data-touch="story"]'));
  }
}

for (const v of VIEWS) {
  test(`день з рангом: «Що відкрилось» ПЕРЕД підсумком; фанфара; підсумок розгортається; над героєм без цифр — ${v.side}`, async ({ page }) => {
    test.setTimeout(240_000);
    const errors = await open(page, v);
    await playToDayEnd(page, true);

    // Дія руками вчила: розбивання → «Майстер» (механіка): 12 досвіду, ранг 1 (поріг 10).
    const c0 = await core(page);
    expect(c0.game.skills['skill.mechanics']).toBe(12);
    expect(c0.game.practice['hand:smash']).toBe(1);
    // Над героєм цифр не було: усе, що намальовано, проходить правило, а нагорода справді була (інакше сторож порожній).
    const f = await fx(page);
    expect(f.rewardLast, 'нагорода за день була (проба)').toMatch(/^\+\d+ XP/);
    for (const l of f.headLabels) expect(heroLabelOk(l), `підпис над героєм «${l}»`).toBe(true);

    await expect(levelup(page)).toHaveCount(0);   // до кінця дня екрана нема: ранги не перебивають гру
    await act(page, 'complete', 'q.st-005');
    await panel(page).locator('[data-act="sleep"]').click();

    // 1) Спершу «Що відкрилось»; підсумку під ним ще немає.
    await expect(levelup(page)).toBeVisible();
    await expect(summary(page)).toHaveCount(0);
    await expect(levelup(page).locator('h2')).toHaveText('Нові вміння');
    await expect(levelup(page).locator('h2')).toBeFocused();
    const items = levelup(page).locator('[data-ui="levelup-item"]');
    const got = await items.evaluateAll((els) => els.map((e) => `${(e as HTMLElement).dataset.skill}:${(e as HTMLElement).dataset.rank}`));
    expect(got, 'ранг від дії руками серед нових').toContain('skill.mechanics:1');
    expect(got.length, 'і ранги від ходів ядра (табір, планування…)').toBeGreaterThan(1);
    expect(got.every((g) => !g.endsWith(':0')), 'ранги ≥ 1').toBe(true);
    const mech = levelup(page).locator('[data-skill="skill.mechanics"]');
    await expect(mech).toContainText('Механіка');
    await expect(mech).toContainText('Той, хто бачить дрібниці');
    await expect(mech).toContainText('Що відкрилось: Бачиш видимі несправності.');
    expect((await levelup(page).textContent()) ?? '', 'без цифр досвіду й без ключів без тексту').not.toMatch(/XP|⟦|\+\d/);
    expect(await sounds(page), 'фанфара через єдиний аудіомодуль').toContain('sfx-fanfare');
    // Кнопка в межах екрана, ≥ 44 px.
    const btn = levelup(page).locator('[data-ui="levelup-continue"]');
    // «Далі» повністю в кадрі БЕЗ прокрутки (рецензія PR #165): у кожній орієнтації й пропорції; один рядок на навичку (без повторів).
    const inView = async (w: number, h: number): Promise<void> => {
      await levelup(page).evaluate((el) => { el.scrollTop = 0; });
      const r = await btn.boundingBox();
      expect(r && r.width >= 44 && r.height >= 44 && r.x >= 0 && r.x + r.width <= w && r.y >= 0 && r.y + r.height <= h, `кнопка ${w}×${h}: ${JSON.stringify(r)}`).toBe(true);
    };
    await inView(v.w, v.h);
    expect(new Set(got.map((g) => g.split(':')[0])).size, 'одна картка на навичку').toBe(got.length);
    const top = (): Promise<void> => levelup(page).evaluate((el) => { el.scrollTop = 0; });
    await top();
    await shot(page, `levelup-${v.side}`);
    if (v.side === 'portrait') {
      for (const s of SHAPES) { await page.setViewportSize({ width: s.w, height: s.h }); await page.waitForTimeout(250); await top(); await inView(s.w, s.h); await shot(page, `levelup-${s.name}`); }
      for (const s of [{ w: 844, h: 390 }, { w: 844, h: 475 }]) { await page.setViewportSize({ width: s.w, height: s.h }); await page.waitForTimeout(250); await inView(s.w, s.h); }
      await page.setViewportSize({ width: v.w, height: v.h });
    }

    // 2) «Далі» → підсумок дня. Категорії з'являються по одній: на якомусь кадрі перша вже яскравіша за останню, зрештою — всі повні.
    await press(page, btn);
    await expect(levelup(page)).toHaveCount(0);
    const opac = (): Promise<number[]> => summary(page).locator('.ui-summary-sec').evaluateAll((els) => els.map((e) => Number(getComputedStyle(e).opacity)));
    let staggered = false;
    for (let i = 0; i < 40 && !staggered; i++) { const o = await opac(); staggered = o.length > 3 && (o[0] as number) > (o[o.length - 1] as number); if (!staggered) await page.waitForTimeout(25); }
    await expect(summary(page)).toBeVisible();
    await expect(summary(page).locator('h2')).toHaveText('Підсумок дня 1');
    expect(staggered, 'категорії розгортаються по одній (перша раніше за останню)').toBe(true);
    // Лічильник нагороди росте (від 0 до кінцевого) і не спадає; текст у DOM — кінцевий одразу.
    const xp = Number(await summary(page).locator('[data-ui="summary-reward"]').getAttribute('data-xp'));
    expect(xp).toBeGreaterThan(0);
    await expect(summary(page).locator('[data-ui="count-xp"]')).toHaveText(String(xp));
    const tick = (): Promise<number> => summary(page).locator('[data-ui="count-xp"]').evaluate((el) => Number(getComputedStyle(el, '::after').getPropertyValue('--n')));
    const seen: number[] = [];
    for (let i = 0; i < 60; i++) { seen.push(await tick()); if (seen[seen.length - 1] === xp) break; await page.waitForTimeout(30); }
    expect(seen[seen.length - 1], 'лічильник дійшов до кінцевого числа').toBe(xp);
    for (let i = 1; i < seen.length; i++) expect(seen[i] as number, `лічильник не спадає ${seen}`).toBeGreaterThanOrEqual(seen[i - 1] as number);
    await expect.poll(async () => (await opac()).every((o) => o === 1), { timeout: 8_000 }).toBe(true);
    await shot(page, `summary-${v.side}`);
    if (v.side === 'portrait') {
      for (const s of SHAPES) { await page.setViewportSize({ width: s.w, height: s.h }); await page.waitForTimeout(250); await shot(page, `summary-${s.name}`); }
    }
    await press(page, summary(page).locator('[data-ui="summary-continue"]'));
    await expect(summary(page)).toHaveCount(0);
    // Ранги прочитано — вдруге той самий день їх не показує.
    expect(await levelup(page).count()).toBe(0);
    expect(errors, errors.join('\n')).toEqual([]);
  });
}

test('вимкнено в налаштуваннях: екрана «Що відкрилось» немає, підсумок одразу, а навички ростуть так само — landscape', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = await open(page, { w: 844, h: 390 }, { levelUps: false });
  await playToDayEnd(page, true);
  await act(page, 'complete', 'q.st-005');
  await panel(page).locator('[data-act="sleep"]').click();
  await expect(summary(page)).toBeVisible();
  await expect(levelup(page)).toHaveCount(0);
  const c = await core(page);
  expect(c.game.skills['skill.mechanics'], 'навичка росте й без екрана').toBe(12);
  expect(c.game.skills['skill.camping'], 'і ходи ядра теж').toBeGreaterThanOrEqual(10);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('налаштування в паузі: перемикач «Нові ранги» зберігається — portrait', async ({ page }) => {
  const errors = await open(page, { w: 390, h: 844 });
  await page.locator('[data-touch="pause"]').tap();
  await expect(page.locator('[data-ui="pause"]')).toBeVisible();
  const off = page.locator('[data-ui="levelups-off"]');
  await expect(page.locator('[data-ui="levelups-on"]')).toHaveAttribute('aria-pressed', 'true');
  await off.scrollIntoViewIfNeeded();
  await off.tap();
  await expect(off).toHaveAttribute('aria-pressed', 'true');
  expect(JSON.parse(await page.evaluate((k) => localStorage.getItem(k) ?? '{}', SETTINGS_KEY)).levelUps).toBe(false);
  expect(errors).toEqual([]);
});
