// GAME-308 · каркас міні-ігор у справжньому браузері, обидві орієнтації, один палець (дотик): еталонна гра проходиться до КОЖНОГО з трьох результатів справжніми кнопками.
// Кадри дає тест (стенд minigame-harness.tsx), годинників і очікувань за часом немає. Мутації (перелік — у PR): .mg-btn без min-height 48 → «ціль < 48 px» червоніє; кнопка «Стоп» без обробника → good не виходить;
// пауза не заморожує кадри → «кадри на паузі» червоніє; «далі без цього» не веде в результат → scrappy-через-паузу червоніє.
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { expect, test, type Page } from '@playwright/test';

test.use({ hasTouch: true });

const VIEWPORTS = [{ name: 'portrait', w: 390, h: 844 }, { name: 'landscape', w: 932, h: 430 }];
const LANGS = ['uk', 'en'] as const;

let bundle = '';
test.beforeAll(async () => {
  const r = await build({ configFile: false, logLevel: 'silent', define: { __GAME_VERSION__: '"t"', __GAME_COMMIT__: '"t"' }, oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } }, esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
    build: { write: false, minify: false, lib: { entry: fileURLToPath(new URL('./minigame-harness.tsx', import.meta.url)), formats: ['iife'], name: 'MG' } } } as never) as unknown as { output: { code: string }[] } | { output: { code: string }[] }[];
  bundle = (Array.isArray(r) ? r[0] : r)?.output[0]?.code ?? '';
});

interface St { phase: string; paused: boolean; frame: number; limit: number; helped: boolean; outcome: string | null; reported: { outcome: string; consequence: string }[] }
type Mg = { open(o: { lang: string; scrappyStreak: number }): void; frame(n: number): void; toCenter(): number; state(): St };
const state = (page: Page): Promise<St> => page.evaluate(() => (window as unknown as { __mg: Mg }).__mg.state());
const call = (page: Page, m: 'frame' | 'toCenter', n = 0): Promise<number> => page.evaluate(([name, k]) => { const api = (window as unknown as { __mg: Mg }).__mg; return name === 'frame' ? (api.frame(k as number), 0) : api.toCenter(); }, [m, n] as const);

async function openGame(page: Page, vp: { w: number; h: number }, lang: string, scrappyStreak = 0): Promise<void> {
  await page.setViewportSize({ width: vp.w, height: vp.h });
  await page.goto('/');
  await page.addScriptTag({ content: bundle });
  await page.evaluate(([l, s]) => (window as unknown as { __mg: Mg }).__mg.open({ lang: l as string, scrappyStreak: s as number }), [lang, scrappyStreak] as const);
  await expect(page.locator('[data-ui="minigame"]')).toBeVisible();
}

/** Кожна видима кнопка каркаса: ≥ 48×48 і повністю в екрані; сторінка не прокручується вбік. */
async function checkTargets(page: Page, label: string): Promise<void> {
  const r = await page.evaluate(() => {
    const out: string[] = [];
    const root = document.querySelector('.mg') as HTMLElement;
    for (const b of Array.from(root.querySelectorAll<HTMLElement>('button'))) {
      const bb = b.getBoundingClientRect();
      if (bb.width === 0 && bb.height === 0) continue;
      if (bb.width < 48 || bb.height < 48) out.push(`${b.dataset.ui}: ${bb.width.toFixed(1)}×${bb.height.toFixed(1)} < 48`);
      if (bb.left < -0.5 || bb.top < -0.5 || bb.right > innerWidth + 0.5 || bb.bottom > innerHeight + 0.5) out.push(`${b.dataset.ui}: поза екраном ${JSON.stringify([bb.left, bb.top, bb.right, bb.bottom])}`);
    }
    if (root.scrollWidth > root.clientWidth + 1) out.push(`горизонтальна прокрутка ${root.scrollWidth} > ${root.clientWidth}`);
    return out;
  });
  expect(r, label).toEqual([]);
}

for (const vp of VIEWPORTS) {
  for (const lang of LANGS) {
    test.describe(`GAME-308 · ${vp.name} ${vp.w}×${vp.h} · ${lang}`, () => {
      test('good: три влучні дотики → результат good, записаний рівно раз', async ({ page }) => {
        await openGame(page, vp, lang);
        await expect(page.locator('[data-ui="mg-intro"]')).toBeVisible();
        await checkTargets(page, 'вступ');
        await page.locator('[data-ui="mg-start"]').tap();
        expect((await state(page)).phase).toBe('play');
        await expect(page.locator('[data-ui="mg-ref"]')).toBeVisible();
        await checkTargets(page, 'гра');
        for (let i = 0; i < 3; i++) {
          await call(page, 'toCenter');
          await page.locator('[data-ui="mg-ref-stop"]').tap();
          await call(page, 'frame', 1);
          if (i < 2) await call(page, 'frame', 40);   // маркер відходить від центру до наступної зупинки
        }
        const st = await state(page);
        expect(st.phase).toBe('result');
        expect(st.outcome).toBe('good');
        await expect(page.locator('[data-ui="mg-result"]')).toHaveAttribute('data-outcome', 'good');
        await checkTargets(page, 'результат');
        await page.locator('[data-ui="mg-close"]').tap();
        await expect(page.locator('[data-ui="minigame"]')).toHaveCount(0);
        expect((await state(page)).reported).toEqual([{ outcome: 'good', consequence: 'ref.tidy' }]);
      });

      test('fine: два влучні дотики, далі час виходить → fine', async ({ page }) => {
        await openGame(page, vp, lang);
        await page.locator('[data-ui="mg-start"]').tap();
        for (let i = 0; i < 2; i++) {
          await call(page, 'toCenter');
          await page.locator('[data-ui="mg-ref-stop"]').tap();
          await call(page, 'frame', 1);
          await call(page, 'frame', 40);
        }
        expect((await state(page)).phase).toBe('play');
        await call(page, 'frame', 100_000);   // кадрів до межі — без очікування
        const st = await state(page);
        expect(st.phase).toBe('result');
        expect(st.outcome).toBe('fine');
        await expect(page.locator('[data-ui="mg-result"]')).toHaveAttribute('data-outcome', 'fine');
        await page.locator('[data-ui="mg-close"]').tap();
        expect((await state(page)).reported).toEqual([{ outcome: 'fine', consequence: 'ref.ok' }]);
      });

      test('scrappy: без жодного дотику час виходить → scrappy, і «Далі» пускає', async ({ page }) => {
        await openGame(page, vp, lang);
        await page.locator('[data-ui="mg-start"]').tap();
        await call(page, 'frame', 100_000);
        const st = await state(page);
        expect(st.phase).toBe('result');
        expect(st.outcome).toBe('scrappy');
        expect(st.frame).toBe(st.limit);
        await expect(page.locator('[data-ui="mg-result"]')).toHaveAttribute('data-outcome', 'scrappy');
        await page.locator('[data-ui="mg-close"]').tap();   // не блок: закривається так само
        await expect(page.locator('[data-ui="minigame"]')).toHaveCount(0);
        expect((await state(page)).reported).toEqual([{ outcome: 'scrappy', consequence: 'ref.messy' }]);
      });

      test('пауза завжди під пальцем: заморожує кадри; «далі без цього» веде в scrappy', async ({ page }) => {
        await openGame(page, vp, lang);
        await expect(page.locator('[data-ui="mg-pause"]')).toBeVisible();   // уже у вступі
        await page.locator('[data-ui="mg-start"]').tap();
        await call(page, 'frame', 30);
        const before = await state(page);
        await page.locator('[data-ui="mg-pause"]').tap();
        await expect(page.locator('[data-ui="mg-paused"]')).toBeVisible();
        await checkTargets(page, 'пауза');
        await call(page, 'frame', 500);
        const during = await state(page);
        expect(during.paused).toBe(true);
        expect(during.frame).toBe(before.frame);   // на паузі кадри не рахуються
        await page.locator('[data-ui="mg-resume"]').tap();
        await call(page, 'frame', 10);
        expect((await state(page)).frame).toBe(before.frame + 10);
        await page.locator('[data-ui="mg-pause"]').tap();
        await page.locator('[data-ui="mg-move-on"]').tap();
        const st = await state(page);
        expect(st.phase).toBe('result');
        expect(st.outcome).toBe('scrappy');
        await page.locator('[data-ui="mg-close"]').tap();
        expect((await state(page)).reported.map((r) => r.outcome)).toEqual(['scrappy']);
      });

      test('допомога: після двох «сяк-так» поспіль — підказка, ширша смуга, більше часу; після одного — ні', async ({ page }) => {
        await openGame(page, vp, lang, 1);
        await expect(page.locator('[data-ui="minigame"]')).toHaveAttribute('data-helped', 'no');
        await expect(page.locator('[data-ui="mg-help"]')).toHaveCount(0);
        const plainLimit = (await state(page)).limit;
        await page.evaluate(() => (window as unknown as { __mg: Mg }).__mg.open({ lang: 'uk', scrappyStreak: 2 }));
        await expect(page.locator('[data-ui="minigame"]')).toHaveAttribute('data-helped', 'yes');
        await expect(page.locator('[data-ui="mg-help"]')).toBeVisible();
        await expect(page.locator('[data-ui="mg-hint"]')).toBeVisible();
        expect((await state(page)).limit).toBeGreaterThan(plainLimit);
        await page.locator('[data-ui="mg-start"]').tap();
        await expect(page.locator('[data-ui="mg-ref"]')).toHaveAttribute('data-hint', 'yes');
        await checkTargets(page, 'гра з допомогою');
      });
    });
  }
}
