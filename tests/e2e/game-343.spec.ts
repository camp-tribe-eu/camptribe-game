// GAME-343 · підпис зміни темпу в чотирьох міні-іграх місій: він справді показується в грі, а кнопка/повзунок не зсуваються з-під пальця, коли він з'являється й зникає.
// Мутації, що роблять цей файл червоним (перевірено): у index.html `.mg-twist` min-height 4.8em→3.2em (GAME-346) → червоніє на 360 px; у MissionSurfaces.tsx знову рендерити <p class="mg-twist"> лише за умови s.twist → червоніє «місце під підпис є ще до зміни темпу» (і кнопка їде на 11–31 px);
// у MissionSurfaces.tsx не виводити текст підпису (завжди '') → тест «підпис видно й не порожній».
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { expect, test, type Page } from '@playwright/test';

test.use({ hasTouch: true });
const VIEWPORTS = [{ name: 'portrait-360', w: 360, h: 780 }, { name: 'portrait', w: 390, h: 844 }, { name: 'landscape', w: 932, h: 430 }];
const LANGS = ['uk', 'en'] as const;   // GAME-346: найдовший підпис залежить від мови
// Що саме не має зсунутись: кнопка дотику (ритм) чи повзунок (шкала).
const GAMES = [
  { id: 'mg.lantern-crank', anchor: 'mg-crank-tap' }, { id: 'mg.trap-weave', anchor: 'mg-crank-tap' },
  { id: 'mg.aerial-tune', anchor: 'mg-tune-dial' }, { id: 'mg.tarp-tie', anchor: 'mg-tune-dial' },
];
let bundle = '';
test.beforeAll(async () => {
  const r = await build({ configFile: false, logLevel: 'silent', define: { __GAME_VERSION__: '"t"', __GAME_COMMIT__: '"t"' }, oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } }, esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
    build: { write: false, minify: false, lib: { entry: fileURLToPath(new URL('./routines-harness.tsx', import.meta.url)), formats: ['iife'], name: 'H' } } } as never) as unknown as { output: { code: string }[] } | { output: { code: string }[] }[];
  bundle = (Array.isArray(r) ? r[0] : r)?.output[0]?.code ?? '';
});

const rect = (page: Page, anchor: string): Promise<{ x: number; y: number; width: number; height: number }> =>
  page.evaluate((a) => { const r = (document.querySelector(`[data-ui="${a}"]`) as HTMLElement).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }, anchor);
const play = (page: Page, frames: number, untilCue: boolean): Promise<boolean> => page.evaluate(([f, u]) => (window as unknown as { __mgPlay: (n: number, c: boolean) => boolean }).__mgPlay(f as number, u as boolean), [frames, untilCue]);

for (const vp of VIEWPORTS) {
  for (const g of GAMES) for (const lang of LANGS) {
    test(`GAME-343/346 · ${g.id}: підпис зміни темпу видно, а ${g.anchor} не зсувається — ${vp.name}, ${lang}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await page.goto('/');
      await page.addScriptTag({ content: bundle });
      await page.evaluate(([id, l]) => (window as unknown as { __mountMission: (i: string, l: string) => void }).__mountMission(id, l), [g.id, lang] as [string, string]);
      const cue = page.locator('[data-ui="mg-twist"]');
      await expect(cue, 'місце під підпис є ще до зміни темпу').toHaveCount(1);
      await expect(cue).toHaveAttribute('data-on', 'no');
      await play(page, 20, false);
      const before = await rect(page, g.anchor);
      expect(await play(page, 4000, true), 'зміна темпу настала').toBe(true);
      await expect(cue).toHaveAttribute('data-on', 'yes');
      await expect(cue, 'підпис видно й не порожній').toBeVisible();
      expect(((await cue.textContent()) ?? '').trim().length, 'текст підпису').toBeGreaterThan(8);
      // GAME-346: найдовший підпис вміщується в зарезервоване місце (інакше рядок лишній і кнопка їде).
      expect(await cue.evaluate((e) => e.scrollHeight - e.clientHeight), 'підпис вміщується в зарезервоване місце').toBeLessThanOrEqual(0);
      expect(await rect(page, g.anchor), 'під час підпису').toEqual(before);
      await play(page, 240, false);   // 4 с: підпис (3 с) вже зник
      await expect(cue).toHaveAttribute('data-on', 'no');
      expect(await rect(page, g.anchor), 'після підпису').toEqual(before);
    });
  }
}
