// GAME-216 · холодний початок демо: ≤ 45 с кіно перед вступом (дощ у вікні → родина → атлас → листівка «H+E» → затемнення → вступ).
// Пропуск (кнопка «Пропустити вступ») працює з будь-якого біта (на 0,5 с, 10 с, 30 с → керування у вступі ≤ 1 с); з існуючим сейвом кіно не показується;
// обидві орієнтації. У збірці e2e кіно вмикає лише ?coldOpen=1 разом з ?intro=1 (test-switches.ts).
// Негативні контролі (закон 1): без ?coldOpen=1 кіно немає (перевірка «кіно видно» червоніє); «Нова гра» → перезавантаження →
// сейв є → вступ є, а кіно — ні (прибрати перевірку loadedSave у main.ts — червоніє).
import { expect, test, type Page } from '@playwright/test';
import { waitGameReady } from './ready';

const SHOTS = process.env.GAME216_SHOTS ?? 'test-results/game-216';   // знімки трьох бітів (GAME216_SHOTS=тека)
const CONTROL_BUDGET_MS = 1_000;
const VIEWS = [{ side: 'landscape', w: 844, h: 390 }, { side: 'portrait', w: 390, h: 844 }] as const;

const cold = (page: Page) => page.locator('[data-ui="cold-open"]');
/** Почати кіно (дотик «Почати» — він же розблоковує звук) і повернути мить старту. */
async function begin(page: Page): Promise<number> {
  await expect(cold(page)).toHaveAttribute('data-state', 'start');
  await page.locator('[data-ui="cold-open-start"]').click();
  await expect(cold(page)).toHaveAttribute('data-state', 'play');
  return Date.now();
}
/** GAME-302: пропуск — кнопка «Пропустити вступ» (випадковий дотик по сцені кіно не обриває: game-302.spec) → кіно зникло, вступ готовий приймати дотик: «Далі» видно. Міряємо від тапу. */
async function skipAndMeasure(page: Page): Promise<number> {
  const t0 = Date.now();
  await page.locator('[data-ui="cold-open-skip"]').click();
  await expect(cold(page)).toHaveCount(0);
  await expect(page.locator('[data-ui="intro-spots"]')).toBeVisible();
  return Date.now() - t0;
}

for (const v of VIEWS) {
  test(`${v.side}: три біти на знімках, тап на ~30 с → керування у вступі ≤ 1 с`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: v.w, height: v.h });
    await page.goto('/?intro=1&soloHero=1&coldOpen=1&seed=1');
    await waitGameReady(page);
    await expect(cold(page)).toBeVisible();
    await expect(page.locator('[data-ui="intro"]')).toHaveCount(0);   // вступ іще не показаний: спершу кіно
    const t0 = await begin(page);
    const at = async (ms: number): Promise<void> => { const left = t0 + ms - Date.now(); if (left > 0) await page.waitForTimeout(left); };
    await at(4_000);   // біт 1: вікно з дощем, підпис друкується
    await expect(page.locator('[data-ui="cold-caption"]')).toHaveAttribute('data-beat', 'window');
    await page.screenshot({ path: `${SHOTS}/coldopen-${v.side}-window.png` });
    await at(12_000);  // біт 2: панорама по родині
    await expect(page.locator('[data-ui="cold-caption"]')).toHaveAttribute('data-beat', 'family');
    await expect(page.locator('[data-ui="cold-caption"]')).toContainText(/Метью|Matthew/);
    await page.screenshot({ path: `${SHOTS}/coldopen-${v.side}-family.png` });
    await at(27_000);  // біт 4: листівка дідуся, «H+E»
    await expect(page.locator('[data-ui="cold-caption"]')).toHaveAttribute('data-beat', 'postcard');
    await expect(page.locator('[data-ui="cold-caption"]')).toContainText('H+E');
    await page.screenshot({ path: `${SHOTS}/coldopen-${v.side}-postcard.png` });
    await at(30_000);
    const ms = await skipAndMeasure(page);
    console.log(`[GAME-216] ${v.side}: тап на 30 с → керування за ${ms} мс (бюджет ${CONTROL_BUDGET_MS})`);
    expect(ms).toBeLessThan(CONTROL_BUDGET_MS);
    await expect(page.locator('[data-ui="line"]')).toContainText(/Метью|Matthew/);   // вступ — із першого кроку (кімната з дощем)
  });
}

for (const tapAt of [500, 10_000]) {
  test(`тап на ${tapAt} мс → керування у вступі ≤ 1 с`, async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto('/?intro=1&soloHero=1&coldOpen=1&seed=1');
    await waitGameReady(page);
    await begin(page);
    await page.waitForTimeout(tapAt);
    const ms = await skipAndMeasure(page);
    console.log(`[GAME-216] тап на ${tapAt} мс → керування за ${ms} мс`);
    expect(ms).toBeLessThan(CONTROL_BUDGET_MS);
  });
}

test('«Пропустити» на картці «Почати» веде одразу у вступ', async ({ page }) => {
  await page.goto('/?intro=1&soloHero=1&coldOpen=1&seed=1');
  await waitGameReady(page);
  await page.locator('[data-ui="cold-open-skip"]').click();
  await expect(cold(page)).toHaveCount(0);
  await expect(page.locator('[data-ui="intro-spots"]')).toBeVisible();
});

// Окремий контекст, не перезавантаження: пауза вступу вже записала чистий сейв, і за правилом «сейв є → кіно немає» після reload кіно не було б.
test('Escape під час кіно — теж пропуск', async ({ page }) => {
  await page.goto('/?intro=1&soloHero=1&coldOpen=1&seed=1');
  await waitGameReady(page);
  await begin(page);
  await page.waitForTimeout(1_500);
  // Рецензія PR #144: модифікатор і гаряча клавіша браузера сцену не пропускають (мутація «будь-яка клавіша» → червоне).
  await page.keyboard.press('Shift');
  await page.keyboard.press('Control+KeyC');
  await page.keyboard.press('Space');   // GAME-302: Enter/Space/стрілки теж не обривають кіно (мутація «будь-яка клавіша» → червоне)
  await page.keyboard.press('Enter');
  await expect(cold(page)).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(cold(page)).toHaveCount(0);
  await expect(page.locator('[data-ui="intro-spots"]')).toBeVisible();
});

test('сейв існує → кіно немає: «Нова гра» з меню показує кіно, перезавантаження з тим сейвом — лише вступ', async ({ page }) => {
  await page.goto('/?intro=1&soloHero=1&coldOpen=1&seed=1');
  await waitGameReady(page);
  await page.locator('[data-ui="cold-open-skip"]').click();
  await page.locator('[data-ui="intro-skip"]').click();
  await page.locator('[data-act="create"]').first().click();
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');   // вступ закрито, герой є, сейв записано
  await expect(page.locator('[data-ui="intro"]')).toHaveCount(0);
  // Нова гра з меню паузи → кіно (раз на нову гру).
  await page.locator('[data-touch="pause"]').click();
  await page.locator('[data-ui="pause"] [data-ui="new-game"]').click();
  await page.locator('[data-ui="confirm-new-yes"]').click();
  await expect(cold(page)).toBeVisible();
  // Перезавантаження: сейв нової гри вже є (герой іще не обраний) → вступ є, кіно немає.
  await page.reload();
  await waitGameReady(page);
  await expect(page.locator('[data-ui="intro"]')).toBeVisible();
  await expect(cold(page)).toHaveCount(0);
});

test('негативний контроль: без ?coldOpen=1 кіно немає — вступ одразу', async ({ page }) => {
  await page.goto('/?intro=1&soloHero=1&seed=1');
  await waitGameReady(page);
  await expect(page.locator('[data-ui="intro"]')).toBeVisible();
  await expect(cold(page)).toHaveCount(0);
});
