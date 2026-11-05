// GAME-253 · журнал-щоденник: мандрівник, навички, записи по днях — читабельно в обох орієнтаціях телефона.
// Закон 1: перевірка «шрифт ≥ 14 px» і «без горизонтального переповнення» червоніє, якщо зіпсувати CSS (мутація — у PR).
import { expect, test, type Page } from '@playwright/test';
import { core, loaded } from './chapter-driver';

const SETTINGS_KEY = 'camplife.settings.v1';
const VIEWS = [{ side: 'portrait', w: 390, h: 844 }, { side: 'landscape', w: 932, h: 430 }] as const;
const SHOT = process.env.JOURNAL_SHOT ?? '';
const panel = (page: Page) => page.locator('.ui-story');

async function act(page: Page, kind: string, key = ''): Promise<void> {
  await panel(page).locator(`[data-act="${kind}"][data-key="${key}"]`).click({ timeout: 5_000 });
  await page.waitForTimeout(400);
}

for (const v of VIEWS) {
  test.describe(`${v.side} ${v.w}×${v.h}`, () => {
    test.use({ viewport: { width: v.w, height: v.h }, hasTouch: true, isMobile: true });

    test('☰ → Журнал: «Мандрівник», «Навички», «Записи» видно, читабельні й без горизонтального скролу', async ({ page }) => {
      test.setTimeout(240_000);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.addInitScript(([k]) => { try { localStorage.setItem(k as string, JSON.stringify({ textScale: 100, language: 'uk', hintSeen: true })); } catch { /* сховища немає */ } }, [SETTINGS_KEY] as const);
      await page.goto('/?seed=7');
      await loaded(page);
      await page.locator('[data-touch="story"]').click();
      await panel(page).locator('[data-act="create"]', { hasText: /Велосипед|Bike/ }).first().click();
      await page.waitForTimeout(400);
      for (const [k, key] of [['complete', 'q.prologue-home-001'], ['complete', 'q.st-001'], ['complete', 'q.st-002'], ['visit', 'loc.shop'], ['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'], ['complete', 'q.st-003'], ['visit', 'loc.home'], ['complete', 'q.ch1-home-001'], ['visit', 'loc.road']] as const) await act(page, k, key);
      expect((await core(page)).journal.length).toBeGreaterThan(8);   // є що згортати
      await page.goto('/?seed=7&mapFirst=1');
      await loaded(page);
      await page.locator('[data-ui="recovery-close"]').click({ timeout: 800 }).catch(() => undefined);
      await page.locator('[data-touch="story"]').click();
      await panel(page).locator('[data-ui="journal"]').click();
      if (SHOT) await page.screenshot({ path: `research/journal/${SHOT}-${v.side}.png` });

      for (const ui of ['progress', 'skills', 'journal-log']) await expect(panel(page).locator(`[data-ui="${ui}"]`), ui).toBeVisible();
      await expect(panel(page).locator('[data-ui="skill"]')).toHaveCount(8);
      await expect(panel(page).locator('[data-ui="stat-stickers"]')).toBeVisible();
      // Дні — заголовками «День N», найновіший зверху; довгий список згорнуто, «Показати ще» розгортає.
      const heads = await panel(page).locator('.jb-day h4').allTextContents();
      expect(heads.length).toBeGreaterThan(0);
      expect(heads[0]).toMatch(/^День \d+$/);
      const nums = heads.map((h) => Number(h.replace(/\D/g, '')));
      expect(nums, 'дні за спаданням').toEqual([...nums].sort((a, b) => b - a));
      const folded = await panel(page).locator('.jb-day li').count();
      expect(folded).toBe(8);
      await panel(page).locator('[data-ui="journal-more"]').scrollIntoViewIfNeeded();
      await panel(page).locator('[data-ui="journal-more"]').click();
      expect(await panel(page).locator('.jb-day li').count()).toBeGreaterThan(folded);

      // Читабельність: кожен видимий текст у щоденнику ≥ 14 px, жодного горизонтального переповнення.
      const bad = await page.evaluate(() => {
        const out: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>('[data-ui="journal-book"] *')) {
          const own = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '');
          if (!own) continue;
          const fs = parseFloat(getComputedStyle(el).fontSize);
          if (fs < 14) out.push(`${el.tagName}.${el.className} ${fs}px «${(el.textContent ?? '').slice(0, 30)}»`);
        }
        const doc = document.documentElement;
        if (doc.scrollWidth > doc.clientWidth + 1) out.push(`сторінка ширша за екран: ${doc.scrollWidth} > ${doc.clientWidth}`);
        const book = document.querySelector<HTMLElement>('[data-ui="journal-book"]');
        if (book && book.scrollWidth > book.clientWidth + 1) out.push(`щоденник ширший: ${book.scrollWidth} > ${book.clientWidth}`);
        const panelEl = document.querySelector<HTMLElement>('.ui-story');
        if (panelEl && panelEl.scrollWidth > panelEl.clientWidth + 1) out.push(`панель ширша: ${panelEl.scrollWidth} > ${panelEl.clientWidth}`);
        return out;
      });
      expect(bad, bad.join('\n')).toEqual([]);
      const small = await panel(page).locator('[data-ui="journal-more"], [data-ui="journal-back"]').evaluateAll((els) => els.map((e) => (e as HTMLElement).getBoundingClientRect().height));
      for (const h of small) expect(h).toBeGreaterThanOrEqual(44);
      expect(await panel(page).textContent()).not.toContain('⟦');
      await panel(page).locator('[data-ui="skills"]').scrollIntoViewIfNeeded();
      if (SHOT) await page.screenshot({ path: `research/journal/${SHOT}-skills-${v.side}.png` });
      expect(errors).toEqual([]);
    });
  });
}
