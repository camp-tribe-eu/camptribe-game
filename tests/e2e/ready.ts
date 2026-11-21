import type { Page } from '@playwright/test';

/**
 * GAME-223: єдине очікування «ігровий світ готовий» для всіх e2e.
 * `saveLoaded` — збереження прочитано; `ready` — сцена закінчила create() і поставила героя (src/view/world/scene.ts).
 * Лише `saveLoaded` дозволяв діяти до того, як сцена розмістила героя: звідси хибні червоні в CI.
 */
export const waitGameReady = (page: Page, timeout = 30_000): Promise<unknown> =>
  page.waitForFunction(
    () => {
      const g = (window as unknown as { __game?: { probe: { saveLoaded: boolean; ready: boolean } } }).__game;
      return g?.probe.saveLoaded === true && g.probe.ready === true;
    },
    null,
    { timeout },
  );

/** GAME-346: свіжий зразок спершу показує кадр «хто ми й куди їдемо»; тести, що йдуть далі, закривають його одним дотиком (його наявність доводить game-342). */
export const skipSampleIntro = async (page: Page): Promise<void> => {
  const go = page.locator('[data-ui="sample-intro-go"]');
  await go.waitFor({ state: 'visible', timeout: 15_000 });
  await go.click();
  await go.waitFor({ state: 'hidden' });
};
