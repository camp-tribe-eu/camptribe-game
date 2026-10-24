// GAME-96 · телефон грають горизонтально (рішення власника 23.10.2026, як Stardew Valley mobile).
// 1) Розкладка вбік: ☰, ‖, джойстик і кнопка дії ≥ 16 px від країв (і ≥ 47 px збоку при вирізі 47 px), карта ≥ 85 % висоти.
// 2) Телефон сторч: накладка «Поверни телефон» (role=dialog), годинник ядра стоїть; повернули — накладки немає, годинник іде.
// 3) Планшет і десктоп: накладки немає ніколи.
// Негативні контролі (мутації) — у звіті картки; кожна перевірка має мутацію, що її червонить.
import { expect, test, type Browser, type Page } from '@playwright/test';

const SHOTS = process.env.SHOT_DIR ?? 'test-results';   // скріншоти для звіту картки
const SETTINGS_KEY = 'camplife.settings.v1';
interface Clock { minutes: number; paused: boolean }
const clock = (page: Page): Promise<Clock> => page.evaluate(() => (window as unknown as { __game: { read: () => { clock: Clock } } }).__game.read().clock);

async function open(browser: Browser, vp: { width: number; height: number }, touch: boolean, inset = 0, language = 'uk'): Promise<Page> {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
  await page.addInitScript(([k, l]) => { try { localStorage.setItem(k as string, JSON.stringify({ textScale: 100, language: l, hintSeen: true })); } catch { /* сховища немає */ } }, [SETTINGS_KEY, language] as const);
  await page.goto('/?seed=2');
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { saveLoaded: boolean } } }).__game?.probe.saveLoaded === true, null, { timeout: 30_000 });
  // Виріз екрана: Chromium не дає емулювати env(safe-area-inset-*), тож перекриваємо змінні --safe-*, з яких CSS складає відступи.
  if (inset > 0) await page.addStyleTag({ content: `:root { --safe-left: ${inset}px !important; --safe-right: ${inset}px !important; }` });
  return page;
}
const rect = (page: Page, sel: string): Promise<{ left: number; top: number; right: number; bottom: number }> =>
  page.locator(sel).first().evaluate((el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; });

const LANDSCAPE = [{ width: 844, height: 390 }, { width: 932, height: 430 }, { width: 667, height: 375 }, { width: 568, height: 320 }] as const;
for (const vp of LANDSCAPE) for (const inset of [0, 47]) {
  test(`${vp.width}×${vp.height}${inset ? `, виріз ${inset} px з боків` : ''}: ☰, ‖, джойстик, кнопка дії ≥ 16 px від країв${inset ? ` і ≥ ${inset} px від лівого/правого`: ''}; карта ≥ 85 % висоти`, async ({ browser }) => {
    const page = await open(browser, vp, true, inset);
    const sides = inset > 0 ? inset : 16;
    const gaps = async (sel: string): Promise<{ left: number; top: number; right: number; bottom: number }> => {
      const r = await rect(page, sel);
      return { left: r.left, top: r.top, right: vp.width - r.right, bottom: vp.height - r.bottom };
    };
    const story = await gaps('[data-touch="story"]');
    const pause = await gaps('[data-touch="pause"]');
    const stick = await gaps('[data-touch="stick"]');
    const act = await gaps('[data-touch="interact"]');
    for (const [name, g] of [['☰', story], ['‖', pause], ['джойстик', stick], ['кнопка дії', act]] as const) {
      for (const side of ['left', 'top', 'right', 'bottom'] as const) {
        expect(g[side], `${name}: ${side} ≥ 16`).toBeGreaterThanOrEqual(16);
      }
    }
    expect(story.left, '☰ від лівого краю').toBeGreaterThanOrEqual(sides);
    expect(stick.left, 'джойстик від лівого краю').toBeGreaterThanOrEqual(sides);
    expect(pause.right, '‖ від правого краю').toBeGreaterThanOrEqual(sides);
    expect(act.right, 'кнопка дії від правого краю').toBeGreaterThanOrEqual(sides);
    await page.waitForTimeout(800);   // Phaser перераховує масштаб полотна сам, раз на 0,5 с — міряємо після, а не до
    const canvas = await page.locator('#stage canvas').evaluate((el) => el.getBoundingClientRect().height);
    const stageH = await page.locator('#stage').evaluate((el) => el.getBoundingClientRect().height);
    expect(stageH / vp.height, `поле гри ${stageH} із ${vp.height}: шапка лежить на мапі, а не відбирає висоту`).toBeGreaterThanOrEqual(0.99);
    expect(canvas / vp.height, `полотно ${canvas} із ${vp.height}`).toBeGreaterThanOrEqual(0.85);
    expect(await page.locator('[data-ui="rotate"]').count(), 'вбік накладки немає').toBe(0);
    if (vp.width === 844 && !inset) {
      await page.screenshot({ path: `${SHOTS}/game-96-844x390-game.png` });
      await page.locator('[data-touch="pause"]').tap();
      await expect(page.locator('[data-ui="pause"]')).toBeVisible();
      await page.screenshot({ path: `${SHOTS}/game-96-844x390-pause.png` });
    }
  });
}

test.describe('телефон сторч — накладка «Поверни телефон»', () => {
  test('390×844: накладка role=dialog, годинник стоїть; повернули вбік — накладки немає, годинник іде', async ({ browser }) => {
    const page = await open(browser, { width: 390, height: 844 }, true);
    const dlg = page.locator('[data-ui="rotate"]');
    await expect(dlg).toBeVisible();
    expect(await dlg.getAttribute('role')).toBe('dialog');
    expect(await dlg.getAttribute('aria-modal')).toBe('true');
    await expect(page.getByRole('dialog', { name: 'Поверни телефон' })).toBeVisible();
    await expect(dlg).toContainText('Поверни телефон');
    expect((await clock(page)).paused, 'годинник ядра стоїть').toBe(true);
    const frozen = (await clock(page)).minutes;
    await page.waitForTimeout(600);
    expect((await clock(page)).minutes, 'хвилини не рухаються').toBe(frozen);
    await page.screenshot({ path: `${SHOTS}/game-96-390x844-rotate.png` });
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(dlg).toHaveCount(0);
    await page.waitForFunction(async () => (window as unknown as { __game: { read: () => { clock: Clock } } }).__game.read().clock.paused === false);
    const t0 = (await clock(page)).minutes;
    await page.waitForFunction((m) => (window as unknown as { __game: { read: () => { clock: Clock } } }).__game.read().clock.minutes > m, t0, { timeout: 15_000 });
    expect((await clock(page)).paused, 'годинник іде').toBe(false);
  });

  test('пауза, поставлена гравцем, переживає поворот: накладка її не знімає', async ({ browser }) => {
    const page = await open(browser, { width: 844, height: 390 }, true);
    await page.locator('[data-touch="pause"]').tap();
    await expect(page.locator('[data-ui="pause"]')).toBeVisible();
    expect((await clock(page)).paused).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('[data-ui="rotate"]')).toBeVisible();
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('[data-ui="rotate"]')).toHaveCount(0);
    await expect(page.locator('[data-ui="pause"]'), 'меню паузи гравця лишилось').toBeVisible();
    expect((await clock(page)).paused, 'пауза гравця не знята').toBe(true);
    await page.locator('[data-ui="resume"]').tap();
    expect((await clock(page)).paused).toBe(false);
  });

  test('англійська: накладка теж перекладена', async ({ browser }) => {
    const page = await open(browser, { width: 390, height: 844 }, true, 0, 'en');
    await expect(page.locator('[data-ui="rotate"]')).toContainText('Rotate your phone');
  });
});

for (const c of [{ name: 'планшет 820×1180 з дотиком', vp: { width: 820, height: 1180 }, touch: true }, { name: 'десктоп 1280×800', vp: { width: 1280, height: 800 }, touch: false },
  { name: 'вузьке вікно десктопа 390×844 без дотику', vp: { width: 390, height: 844 }, touch: false }]) {
  test(`${c.name}: накладки «Поверни» немає, годинник іде`, async ({ browser }) => {
    const page = await open(browser, c.vp, c.touch);
    await expect(page.locator('[data-ui="hud"]')).toBeVisible();
    expect(await page.locator('[data-ui="rotate"]').count()).toBe(0);
    expect(await page.getByRole('dialog').count()).toBe(0);
    expect((await clock(page)).paused).toBe(false);
  });
}
