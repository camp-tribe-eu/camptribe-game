// Проходження вступу в e2e (GAME-250, GAME-249): за станом, не за таймерами. Вступ — ніч (пошук зарядки: дотик по полиці → лист → вибір героя → Атлас → родинний план) →
// «Ніч» → «Субота, 08:00» (будильник) → метушня → мета. На кожному кроці має бути одна з очікуваних кнопок; якщо жодної немає, а вступ відкритий, тест падає одразу з чітким
// повідомленням (без нескінченного циклу).
import { expect, type Page } from '@playwright/test';

/** Один крок вступу: що натиснути зараз. Повертає data-kind кроку, який щойно пройдено, або null, якщо вступ уже закрито. */
export async function stepIntro(page: Page, hero: RegExp = /Велосипед|Bike/): Promise<string | null> {
  const intro = page.locator('[data-ui="intro"]');
  if ((await intro.count()) === 0) return null;
  // GAME-265: вступ пропонує лише родину (велосипед — тільки з ?soloHero=1): немає героя за `hero` — беремо першого, що є.
  const heroPick = page.locator('[data-act="create"]', { hasText: hero });
  const pick = (await heroPick.count()) > 0 ? heroPick.first() : page.locator('[data-act="create"]').first();
  const next = page.locator('[data-ui="intro-next"]');
  const cta = page.locator('[data-ui="atlas-cta"]');
  const shelf = page.locator('[data-ui="intro-spot"][data-spot="shelf"]');
  await expect(pick.or(next).or(cta).or(shelf), 'вступ: немає ні «Далі», ні полиці, ні вибору героя, ні кнопки Атласу (data-ui=atlas-cta)').toBeVisible();
  const kind = (await intro.getAttribute('data-kind')) ?? '';
  if (await pick.count()) await pick.first().click();
  else if (await cta.count()) await cta.click();
  else if (await shelf.count()) await shelf.click();
  else await next.click();
  await page.waitForTimeout(320);   // пауза між кроками вступу — 250 мс від попереднього дотику
  return kind;
}

/** Дійти до кроку з `data-kind=kind` (не натискаючи його). Падає, якщо вступ закрився раніше чи кроку немає за maxSteps. */
export async function introTo(page: Page, kind: string, hero: RegExp = /Велосипед|Bike/, maxSteps = 30): Promise<void> {
  const intro = page.locator('[data-ui="intro"]');
  for (let i = 0; i < maxSteps; i++) {
    await expect(intro, `вступ закрився, не дійшовши до кроку «${kind}»`).toHaveCount(1);
    if ((await intro.getAttribute('data-kind')) === kind) return;
    await stepIntro(page, hero);
  }
  throw new Error(`вступ: крок «${kind}» не настав за ${maxSteps} кроків`);
}

export async function walkIntro(page: Page, hero: RegExp = /Велосипед|Bike/, maxSteps = 40): Promise<void> {
  for (let i = 0; i < maxSteps; i++) if ((await stepIntro(page, hero)) === null) return;
  await expect(page.locator('[data-ui="intro"]'), `вступ не завершився за ${maxSteps} кроків`).toHaveCount(0);
}

/** «Пропустити вступ»: до вибору героя — на вибір; потім обираємо героя, і вступ веде просто на ранок (data-kind=morning). */
export async function skipIntroToMorning(page: Page, hero: RegExp = /Велосипед|Bike/): Promise<void> {
  await page.locator('[data-ui="intro-skip"]').click();
  await page.waitForTimeout(320);
  await page.locator('[data-act="create"]', { hasText: hero }).first().click();
  await expect(page.locator('[data-ui="intro"]')).toHaveAttribute('data-kind', 'morning');
}
