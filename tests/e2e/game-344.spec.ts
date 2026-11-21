// GAME-344 · проводка фіксованого кроку: на екрані 120 і 30 Гц міні-гра живе рівно 60 кадрів гри за секунду.
// Віртуальний годинник: requestAnimationFrame віддає відмітку, що росте на 1000/HZ за кожен справжній показ, — тож частоту емулюємо детерміновано.
// Мутація (перевірено): у main.ts `missionSession.frame(missionStep.advance(dtMs))` → `frame(1)` — співвідношення 2,000 (120 Гц) і 0,500 (30 Гц), обидва тести червоні.
import { expect, test, type Page } from '@playwright/test';
import { DRIVE_LIMIT_FRAMES } from '../../src/content/minigames/drive';
import { skipSampleIntro, waitGameReady } from './ready';

const sample = (page: Page): Promise<{ vt: number; progress: number; phase: string }> => page.evaluate(() => {
  const w = window as unknown as { __vt: number };
  const bar = document.querySelector<HTMLElement>('.mg-time i');
  const root = document.querySelector<HTMLElement>('[data-ui="minigame"]');
  return { vt: w.__vt, progress: 1 - parseFloat(bar?.style.width ?? '100') / 100, phase: root?.dataset.phase ?? '' };
});

for (const hz of [120, 30]) {
  test(`GAME-344: на екрані ${hz} Гц дорога йде 60 кадрів гри за секунду`, async ({ page }) => {
    await page.addInitScript((rate) => {
      const w = window as unknown as { __vt: number };
      const raf = window.requestAnimationFrame.bind(window);
      let last = -1; w.__vt = 0;
      window.requestAnimationFrame = (cb) => raf((real) => { if (real !== last) { last = real; w.__vt += 1000 / rate; } cb(w.__vt); });
    }, hz);
    await page.goto('/?seed=7&sampleDay=1');
    await waitGameReady(page);
    await skipSampleIntro(page);
    const mg = page.locator('[data-ui="minigame"]');
    await expect(mg).toHaveAttribute('data-phase', 'open', { timeout: 15_000 });
    await page.locator('[data-ui="mg-start"]').click();
    await expect(mg).toHaveAttribute('data-phase', 'play');
    const a = await sample(page);
    await page.waitForFunction((t0) => (window as unknown as { __vt: number }).__vt >= t0 + 3000, a.vt, { timeout: 30_000 });
    const b = await sample(page);
    expect(b.phase).toBe('play');
    const ratio = ((b.progress - a.progress) * DRIVE_LIMIT_FRAMES) / ((b.vt - a.vt) * 60 / 1000);
    console.log(`GAME-344 ${hz} Hz: співвідношення кадрів гри до віртуального часу ${ratio.toFixed(3)}`);
    expect(ratio).toBeGreaterThan(0.9);
    expect(ratio).toBeLessThan(1.1);
  });
}
