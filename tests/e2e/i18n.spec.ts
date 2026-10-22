// GAME-26 · псевдолокаль (+40 % довжини): жоден елемент інтерфейсу не переповнюється; шрифт із кирилицею.
import { expect, test, type Page } from '@playwright/test';

async function openPause(page: Page, query: string): Promise<void> {
  await page.goto(`/${query}`);
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { ready: boolean } } }).__game?.probe.ready === true, null, { timeout: 30_000 });
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-ui="pause"]')).toBeVisible();
}

/** Елементи, у яких вміст ширший/вищий за видиму область, або які вилазять за край екрана. */
const overflowing = (page: Page): Promise<string[]> => page.evaluate(() => {
  const out: string[] = [];
  const vw = window.innerWidth;
  for (const el of document.querySelectorAll<HTMLElement>('[data-ui="pause"], [data-ui="pause"] *')) {
    const r = el.getBoundingClientRect();
    if (el.scrollWidth > el.clientWidth + 1 || r.left < -1 || r.right > vw + 1) out.push(`${el.tagName}.${el.className}[${el.dataset.ui ?? ''}] sw=${el.scrollWidth} cw=${el.clientWidth} r=${Math.round(r.right)}/${vw}`);
  }
  return out;
});

for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  test.describe(`псевдолокаль · ${vp.width}×${vp.height}`, () => {
    test.use({ viewport: vp });

    test('псевдолокаль справді ввімкнена (інакше тест нічого не доводить)', async ({ page }) => {
      await openPause(page, '?lang=pseudo');
      await expect(page.locator('[data-ui="pause"] h2')).toHaveText(/^\[.*~+\]$/);
    });

    test('жоден елемент паузи не переповнюється — і при тексті 150 %', async ({ page }) => {
      await openPause(page, '?lang=pseudo');
      expect(await overflowing(page)).toEqual([]);
      await page.locator('[data-ui="text-150"]').click();
      expect(await overflowing(page)).toEqual([]);
    });
  });
}

test('шрифт CampPixel завантажився й малює українську абетку', async ({ page }) => {
  await openPause(page, '');
  const ok = await page.evaluate(async () => {
    await document.fonts.load("16px 'CampPixel'", 'ҐґЄєІіЇї');
    return document.fonts.check("16px 'CampPixel'", 'ҐґЄєІіЇї');
  });
  expect(ok).toBe(true);
});
