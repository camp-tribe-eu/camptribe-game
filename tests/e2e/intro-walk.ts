// Проходження вступу в e2e (GAME-250): за станом, не за таймерами. На кожному кроці має бути одна з очікуваних кнопок — «Далі», вибір героя чи головна
// кнопка Атласу («Спланувати першу поїздку»); якщо жодної немає, а вступ ще відкритий, тест падає одразу з чітким повідомленням (без нескінченного циклу).
import { expect, type Page } from '@playwright/test';

export async function walkIntro(page: Page, hero: RegExp = /Велосипед|Bike/, maxSteps = 30): Promise<void> {
  const intro = page.locator('[data-ui="intro"]');
  const pick = page.locator('[data-act="create"]', { hasText: hero });
  const next = page.locator('[data-ui="intro-next"]');
  const cta = page.locator('[data-ui="atlas-cta"]');
  for (let i = 0; i < maxSteps; i++) {
    if ((await intro.count()) === 0) return;
    await expect(pick.or(next).or(cta), `вступ, крок ${i}: немає ні «Далі», ні вибору героя, ні кнопки Атласу (data-ui=atlas-cta)`).toBeVisible();
    if (await pick.count()) await pick.first().click();
    else if (await cta.count()) await cta.click();
    else await next.click();
    await page.waitForTimeout(320);   // пауза між кроками вступу — 250 мс від попереднього дотику
  }
  await expect(intro, `вступ не завершився за ${maxSteps} кроків`).toHaveCount(0);
}
