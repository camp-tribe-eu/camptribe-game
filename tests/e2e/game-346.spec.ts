// GAME-346 · полірування за сьомим прийманням. Тут — екранні перевірки (розкладка, підтвердження пропуску дороги).
// Мутація (перевірено): у index.html прибрати правило `#app:has(.ui-strip .ui-next) .sd-hint { display: none; }` → «чипи не лягають одне на одне» червоніє на 390×844.
// Мутація (перевірено): у index.html прибрати правило `.mg-sure { … gap: 10px }` → «між «Так» і «Ні» є проміжок» червоніє на 360 і 932.
// Мутація (перевірено): у MinigameHost.tsx зняти перепитування (`view.id === 'mg.drive' ? setSure(true) : …` → завжди `session.moveOn()`) → «один дотик не пропускає дорогу» червоніє.
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { expect, test } from '@playwright/test';

test.use({ hasTouch: true });
let bundle = '';
test.beforeAll(async () => {
  const r = await build({ configFile: false, logLevel: 'silent', define: { __GAME_VERSION__: '"t"', __GAME_COMMIT__: '"t"' }, oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } }, esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
    build: { write: false, minify: false, lib: { entry: fileURLToPath(new URL('./routines-harness.tsx', import.meta.url)), formats: ['iife'], name: 'H' } } } as never) as unknown as { output: { code: string }[] } | { output: { code: string }[] }[];
  bundle = (Array.isArray(r) ? r[0] : r)?.output[0]?.code ?? '';
});

for (const lang of ['uk', 'en'] as const) {
  test(`GAME-346 · дорога: «Далі без цього» з одного дотику не пропускає її, потрібне «Так» — ${lang}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.addScriptTag({ content: bundle });
    await page.evaluate((l) => (window as unknown as { __mountMission: (i: string, l: string) => void }).__mountMission('mg.drive', l), lang);
    const mg = page.locator('[data-ui="minigame"]');
    await expect(mg).toHaveAttribute('data-phase', 'play');
    await page.locator('[data-ui="mg-pause"]').tap();
    await page.locator('[data-ui="mg-move-on"]').tap();
    await expect(page.locator('[data-ui="mg-sure"]'), 'з’явилось перепитування').toBeVisible();
    await expect(mg, 'один дотик дорогу не пропустив').toHaveAttribute('data-phase', 'play');
    await page.locator('[data-ui="mg-sure-no"]').tap();
    await expect(page.locator('[data-ui="mg-sure"]')).toHaveCount(0);
    await expect(mg).toHaveAttribute('data-phase', 'play');
    await page.locator('[data-ui="mg-move-on"]').tap();
    await page.locator('[data-ui="mg-sure-yes"]').tap();
    await expect(mg, 'після «Так» дорога закінчена').toHaveAttribute('data-phase', 'result');
  });
}

for (const vp of [{ n: 'portrait', w: 390, h: 844 }, { n: 'landscape', w: 932, h: 430 }, { n: 'narrow', w: 360, h: 740 }]) {
  test(`GAME-346 · чипи «Ціль», «Далі:» і підказка про місця справ не перетинаються — ${vp.n}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.goto('/');
    await page.addScriptTag({ content: bundle });
    await page.evaluate(() => (window as unknown as { __mountChips: () => void }).__mountChips());
    const boxes = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-ui="goal"], [data-ui="next-hint"], [data-ui="sd-station-hint"]')]
      .filter((e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0)
      .map((e) => { const r = e.getBoundingClientRect(); return { ui: e.dataset.ui ?? '', x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; }));
    expect(boxes.map((b) => b.ui), 'обидва чипи видно').toEqual(expect.arrayContaining(['goal', 'next-hint']));
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]; const b = boxes[j];
      if (!a || !b) continue;
      expect(a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0, `${a.ui} лягає на ${b.ui}`).toBe(false);
    }
  });
}

for (const vp of [{ n: 'narrow', w: 360, h: 740 }, { n: 'landscape', w: 932, h: 430 }]) {
  test(`GAME-346 · «Так» і «Ні» перепитування: проміжок ≥ 8 px, висота ≥ 44 px, по центру — ${vp.n}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.goto('/');
    await page.addScriptTag({ content: bundle });
    await page.evaluate(() => (window as unknown as { __mountMission: (i: string, l: string) => void }).__mountMission('mg.drive', 'uk'));
    await page.locator('[data-ui="mg-pause"]').tap();
    await page.locator('[data-ui="mg-move-on"]').tap();
    const r = await page.evaluate(() => {
      const b = (u: string): DOMRect => (document.querySelector(`[data-ui="${u}"]`) as HTMLElement).getBoundingClientRect();
      const y = b('mg-sure-yes'); const n = b('mg-sure-no'); const g = b('mg-sure');
      return { yes: { x0: y.left, y0: y.top, x1: y.right, y1: y.bottom }, no: { x0: n.left, y0: n.top, x1: n.right, y1: n.bottom }, group: { left: g.left, right: g.right }, w: innerWidth };
    });
    const gap = Math.max(r.no.x0 - r.yes.x1, r.yes.x0 - r.no.x1, r.no.y0 - r.yes.y1, r.yes.y0 - r.no.y1);
    expect(gap, 'проміжок між «Так» і «Ні»').toBeGreaterThanOrEqual(8);
    expect(r.yes.y1 - r.yes.y0, 'висота «Так»').toBeGreaterThanOrEqual(44);
    expect(r.no.y1 - r.no.y0, 'висота «Ні»').toBeGreaterThanOrEqual(44);
    expect(Math.abs((r.group.left + r.group.right) / 2 - r.w / 2), 'блок по центру').toBeLessThanOrEqual(2);
  });
}
