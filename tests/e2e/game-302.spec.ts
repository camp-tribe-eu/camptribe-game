// GAME-302 · вступ доходить до кінця (власник: «не скіпав — інтро не пройшло, натиснув на хлопця і лампу і далі на хлопця — і тут же мама питає, куди їдемо»).
// Причина: кіно холодного початку (ColdOpen) закінчувалось від ЛЮБОГО дотику по сцені чи клавіші — перший ж випадковий дотик «на хлопця» віддавав гравця у вступ,
// а там пошук зарядки → лист → вибір «Хто вирушає в дорогу?» (3 дотики) — історія дідуся (листівка «H+E») не звучала. Тепер кіно пропускає лише кнопка «Пропустити вступ» чи Escape.
// Час кіно — від кадрів: годинник сторінки (page.clock) крутить requestAnimationFrame без реального очікування. Закон 1: мутація «будь-який дотик/клавіша обриває кіно»
// або «кіно скорочено» → червоне (тексти червоного — у PR).
import { expect, test, type Page } from '@playwright/test';
import { waitGameReady } from './ready';

const cold = (page: Page) => page.locator('[data-ui="cold-open"]');
const URL = '/?intro=1&coldOpen=1&seed=1';
const VIEWS = [{ side: 'landscape', w: 844, h: 390 }, { side: 'portrait', w: 390, h: 844 }] as const;
const SHOTS = process.env.GAME302_SHOTS;   // знімки лише за змінною середовища (бриф §2.5)

for (const v of VIEWS) {
  test(`${v.side}: без «Пропустити» кіно доходить до листівки й затемнення, потім пошук → лист; вибір героя — лише після листа`, async ({ page }) => {
    await page.setViewportSize({ width: v.w, height: v.h });
    await page.clock.install();
    await page.goto(URL);
    await waitGameReady(page);
    await expect(cold(page)).toBeVisible();
    await cold(page).locator('[data-ui="cold-open-start"]').click();
    await expect(cold(page)).toHaveAttribute('data-state', 'play');
    const caption = page.locator('[data-ui="cold-caption"]');
    const seen: string[] = [];
    let strays = 0;
    for (let ms = 0; ms < 60_000 && (await cold(page).count()) > 0; ms += 500) {
      await page.clock.runFor(500);
      const b = await caption.getAttribute('data-beat', { timeout: 200 }).catch(() => null);
      if (b && seen.at(-1) !== b) seen.push(b);
      // Випадкові дотики по сцені й клавіші (те, що робив власник) кіно не обривають — ні на початку, ні всередині, ні на листівці.
      if (ms === 1_000 || ms === 12_000 || ms === 30_000) {
        strays++;
        await page.mouse.click(Math.round(v.w * 0.3), Math.round(v.h * 0.6));
        await page.keyboard.press('Space');
        await page.keyboard.press('Enter');
        await expect(cold(page), `випадковий дотик/клавіша на ${ms} мс обірвав кіно`).toHaveCount(1);
        if (SHOTS && ms === 30_000) await page.screenshot({ path: `${SHOTS}/intro-${v.side}-1-postcard.png` });
      }
    }
    expect(strays).toBe(3);
    expect(seen, 'кіно мало пройти всі біти до листівки дідуся').toEqual(['window', 'family', 'atlas', 'postcard']);
    // Кіно закінчилось само: вступ на першому кроці (пошук зарядки), вибору героя ще немає.
    await expect(cold(page)).toHaveCount(0);
    await expect(page.locator('[data-ui="intro"]')).toHaveAttribute('data-kind', 'search');
    await expect(page.locator('[data-act="create"]')).toHaveCount(0);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/intro-${v.side}-2-search.png` });
    await page.clock.runFor(400);   // пауза між дотиками вступу — за event.timeStamp
    await page.locator('[data-ui="intro-spot"][data-spot="lamp"]').click();
    await expect(page.locator('[data-ui="intro"]')).toHaveAttribute('data-kind', 'search');
    await expect(page.locator('[data-act="create"]')).toHaveCount(0);
    await page.clock.runFor(400);
    await page.locator('[data-ui="intro-spot"][data-spot="shelf"]').click();
    // Лист дідуся — останній сюжетний вузол ДО вибору родини.
    await expect(page.locator('[data-ui="intro"]')).toHaveAttribute('data-kind', 'letter');
    await expect(page.locator('[data-ui="letter-quote"]')).toBeVisible();
    await expect(page.locator('[data-act="create"]')).toHaveCount(0);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/intro-${v.side}-3-letter.png` });
    await page.clock.runFor(400);
    await page.locator('[data-ui="intro-next"]').click();
    await expect(page.locator('[data-ui="intro"]')).toHaveAttribute('data-kind', 'pick');
    await expect(page.locator('[data-act="create"]').first()).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/intro-${v.side}-4-pick.png` });
  });
}

test('«Пропустити вступ» на кіно усе ще веде одразу до пошуку, а звідти — до вибору родини', async ({ page }) => {
  await page.goto(URL);
  await waitGameReady(page);
  await cold(page).locator('[data-ui="cold-open-start"]').click();
  await expect(cold(page)).toHaveAttribute('data-state', 'play');
  await page.locator('[data-ui="cold-open-skip"]').click();
  await expect(cold(page)).toHaveCount(0);
  await expect(page.locator('[data-ui="intro"]')).toHaveAttribute('data-kind', 'search');
  await page.locator('[data-ui="intro-skip"]').click();
  await expect(page.locator('[data-ui="intro"]')).toHaveAttribute('data-kind', 'pick');
  await expect(page.locator('[data-act="create"]').first()).toBeVisible();
});

// «Збирати кружки якість для HP XP — не розумію»: у грі немає HP, а XP — лише наклейка нагороди. Перша наклейка з XP несе одну пояснювальну строку (uk; en — у i18n-парі); наклейка без XP — ні.
test('перша наклейка з XP пояснює XP одним рядком; наклейка без XP — без пояснення', async ({ page }) => {
  await page.goto('/?seed=1');
  await waitGameReady(page);
  const give = (r: { cents: number; xp: number; om: number; skills: Record<string, number> }) =>
    page.evaluate((x) => (window as unknown as { __game: { rewardSum: (r: unknown) => void } }).__game.rewardSum(x), r);
  const explain = page.locator('[data-ui="xp-explain"]');
  await give({ cents: 100, xp: 0, om: 0, skills: {} });
  await expect(page.locator('[data-ui="reward-sticker"]')).toBeVisible();
  await expect(explain, 'наклейка без XP не пояснює XP').toHaveCount(0);
  await give({ cents: 0, xp: 15, om: 0, skills: {} });
  await expect(explain).toBeVisible();
  await expect(explain).toContainText('XP');
  await expect(explain).toContainText('HP');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/xp-explain.png` });
});
