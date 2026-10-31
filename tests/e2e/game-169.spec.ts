// GAME-169 · прогноз погоди на екрані подорожі: окремим рядком від факту, зі словом «прогноз», і саме той, що
// forecastOf(зерно світу, день) у ядрі (GAME-131). Зерно 4, день 0: факт — сонячно, прогноз — хмарно (знайдено
// перебором зерен 0…39 у forecastOf/weatherOf; закріплено в src/view/story-offer.test.ts). Зерно 2: обидва сонячні —
// рядок прогнозу є й тоді, коли він збігся. Негативний контроль (закон 1): рядок прогнозу з offer.weather замість
// offer.forecast — тест зерна 4 червоніє на data-forecast і на тексті (звіт картки).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { dayOf, forecastOf, weatherOf, type Weather } from '../../src/core/weather';
import { waitGameReady } from './ready';

interface Core { worldSeed: number; clock: { minutes: number } }
const core = (page: Page): Promise<Core> => page.evaluate(() => (window as unknown as { __game: { read: () => Core } }).__game.read());
const panel = (page: Page) => page.locator('[data-ui="story"]');
const LABEL: Readonly<Record<Weather, string>> = { sunny: 'сонячно', cloudy: 'хмарно', rain: 'дощ' };

async function open(page: Page, seed: number): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/?seed=${seed}`);
  await waitGameReady(page);
  await page.locator('[data-touch="story"]').click();
  await expect(panel(page)).toBeVisible();
  // До вибору персонажа ні погоди, ні прогнозу немає (рядок стану — лише в грі).
  await expect(panel(page).locator('[data-ui="forecast"]')).toHaveCount(0);
  await panel(page).locator('[data-act="create"]', { hasText: 'Велосипед' }).first().click();
  await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії
  return errors;
}

for (const vp of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) test.describe(`${vp.width}×${vp.height}`, () => {
test.use({ viewport: vp, hasTouch: true, isMobile: true });

for (const [seed, hit] of [[4, 'no'], [2, 'yes']] as const) {
  test(`зерно ${seed}: прогноз видно окремо від погоди, зі словом «прогноз», і він = forecastOf ядра (збіг із фактом: ${hit})`, async ({ page }) => {
    const errors = await open(page, seed);
    const c = await core(page);
    expect(c.worldSeed).toBe(seed);
    const day = dayOf(c.clock);
    const forecast = forecastOf(c.worldSeed, day);
    const actual = weatherOf(c.worldSeed, day);
    expect(forecast === actual ? 'yes' : 'no').toBe(hit);   // зерно обране саме за цим — інакше тест нічого не розрізняє

    const fc = panel(page).locator('[data-ui="forecast"]');
    await expect(fc).toBeVisible();
    await expect(fc).toHaveAttribute('data-forecast', forecast);
    await expect(fc).toHaveAttribute('data-hit', hit);
    await expect(fc).toContainText(/прогноз/i);
    await expect(fc).toContainText(`: ${LABEL[forecast]}`);
    // Факт — своїм рядком, без слова «прогноз»; прогноз — без «Погода:».
    const where = panel(page).locator('[data-ui="where"]');
    await expect(where).toHaveAttribute('data-weather', actual);
    await expect(where).toContainText(`Погода: ${LABEL[actual]}`);
    await expect(where).not.toContainText(/прогноз/i);
    await expect(fc).not.toContainText('Погода:');
    if (hit === 'no') await expect(fc).not.toContainText(LABEL[actual]);   // саме тут мутація «показати факт» червоніє
    expect(errors).toEqual([]);
    // Якір незалежно від ядра (рецензія Fable): для зерна 4 день 0 — прогноз «хмарно» буквально.
    if (seed === 4) await expect(fc).toContainText('Прогноз на сьогодні: хмарно');
    await page.screenshot({ path: `test-results/game-169-seed${seed}-${vp.width}.png` });
  });
}
});

// Контраст рядка прогнозу ≥ 4.5:1 — тим самим способом, що a11y.spec.ts (найгірше тло: білий під оверлеєм = #333).
// Не кнопка — цілі 44 px не вимагаємо. «Пройдено» рахується лише коли axe справді зміряв (passes), а не «не вдалося».
test('рядок прогнозу читається над найсвітлішим пікселем гри: axe color-contrast зміряно й ≥ 4.5:1', async ({ page }) => {
  await open(page, 4);
  await page.addStyleTag({ content: '#stage canvas { visibility: hidden !important; } #stage { background: #fff !important; }' });
  await page.locator('[data-ui="forecast"]').scrollIntoViewIfNeeded();
  const r = await new AxeBuilder({ page }).include('[data-ui="forecast"]').withRules(['color-contrast']).analyze();
  expect(r.violations.map((v) => v.id)).toEqual([]);
  const pass = r.passes.find((v) => v.id === 'color-contrast');
  expect(pass).toBeTruthy();
  const data = pass?.nodes[0]?.any[0]?.data as { fgColor?: string; bgColor?: string; contrastRatio?: number } | undefined;
  console.log(`GAME-169 contrast: ${data?.fgColor} on ${data?.bgColor} = ${data?.contrastRatio}:1`);
  expect(data?.contrastRatio ?? 0).toBeGreaterThanOrEqual(4.5);
});
