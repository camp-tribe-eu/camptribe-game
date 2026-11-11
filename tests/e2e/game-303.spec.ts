// GAME-303 · проба подачі вступу: комікс-панелі (А, ?introStyle=comic) і кінокадри (Б, ?introStyle=cinema) для сцени «родина кличе з різних кімнат → ніч і сон про дорогу → ранок».
// Кожен варіант проходиться дотиками до кінця в обох орієнтаціях; «Пропустити вступ» спрацьовує одразу; без перемикача вступ той самий (його стережуть game-249/game-265).
// Знімки для вибору власника — лише за GAME303_SHOTS=1 (research/game-303/variant-{a,b}-{portrait,landscape}-NN.png), не на критичному шляху тесту.
// Закон 1: контроль — зламаний перехід панелі (shown не росте) мусить зробити тест червоним; результат мутації — у research/game-303/README.md.
import { expect, test, type Page } from '@playwright/test';
import { introTo, stepIntro, walkIntro } from './intro-walk';
import { waitGameReady } from './ready';

const VIEWS = [{ name: 'portrait', w: 390, h: 844 }, { name: 'landscape', w: 932, h: 430 }] as const;
const VARIANTS = [{ style: 'comic', tag: 'a' }, { style: 'cinema', tag: 'b' }] as const;
const SHOTS = process.env.GAME303_SHOTS === '1';

interface Box { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
const box = async (page: Page, sel: string): Promise<Box> => {
  const b = await page.locator(sel).first().boundingBox();
  if (!b) throw new Error(`немає рамки: ${sel}`);
  return { x: b.x, y: b.y, w: b.width, h: b.height };
};
const meets = (a: Box, b: Box): boolean => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
const inside = (a: Box, o: Box): boolean => a.x >= o.x - 0.5 && a.y >= o.y - 0.5 && a.x + a.w <= o.x + o.w + 0.5 && a.y + a.h <= o.y + o.h + 0.5;

const sceneReady = async (page: Page): Promise<void> => {
  await expect(page.locator('[data-ui="scene-canvas"]').first()).toBeVisible();
  await expect.poll(() => page.locator('[data-ui="scene-canvas"]:not([data-painted="yes"])').count(), 'кадри ще не намальовано').toBe(0);
};

const start = async (page: Page, style: string, w: number, h: number): Promise<void> => {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`/?intro=1&soloHero=1&seed=1&introStyle=${style}`);
  await waitGameReady(page);
};

for (const v of VIEWS) {
  for (const va of VARIANTS) {
    test(`${va.tag.toUpperCase()} ${va.style} ${v.w}×${v.h}: сцена доходить до кінця дотиками, рамки не накладаються`, async ({ page }) => {
      await start(page, va.style, v.w, v.h);
      const vp: Box = { x: 0, y: 0, w: v.w, h: v.h };
      const shot = async (n: string): Promise<void> => {
        if (!SHOTS) return;
        await sceneReady(page);
        await page.screenshot({ path: `research/game-303/variant-${va.tag}-${v.name}-${n}.png`, animations: 'disabled' });
      };
      const scene = page.locator(`[data-ui="intro-scene"][data-style="${va.style}"]`);
      const line = page.locator('[data-ui="line"]');
      const kindOf = (): Promise<string | null> => page.locator('[data-ui="intro"]').getAttribute('data-kind');

      // До першої репліки: пошук, лист, вибір героя й Атлас — як були (перемикач їх не чіпає).
      await introTo(page, 'line');
      await expect(scene).toHaveCount(1);
      await expect(page.locator('[data-ui="intro-skip"]')).toHaveText('Пропустити вступ');
      await expect(line).toContainText('сімейний скарб');
      await sceneReady(page);
      const next = '[data-ui="intro-next"]';
      const skipBox = await box(page, '[data-ui="intro-skip"]');
      const nextBox = async (): Promise<Box> => box(page, next);

      if (va.style === 'comic') {
        const shown = page.locator('[data-ui="comic-panel"][data-state="shown"]');
        await expect(shown, 'панель 1 з’являється разом із першою реплікою').toHaveCount(1);
        await expect(page.locator('[data-ui="comic-panel"]')).toHaveCount(3);
        await expect(page.locator('[data-ui="comic-panel"][data-panel="0"] [data-ui="line"]')).toContainText('сімейний скарб');
        await expect(page.locator('[data-ui="comic-panel"][data-panel="0"]')).toHaveAttribute('data-room', 'matthew');
        await stepIntro(page);
        await expect(shown, 'панель 2 — після дотику').toHaveCount(2);
        await expect(page.locator('[data-ui="comic-panel"][data-panel="1"] [data-ui="line"]')).toContainText('пилососа');
        await expect(page.locator('[data-ui="comic-panel"][data-panel="1"]')).toHaveAttribute('data-room', 'george');
        // перша репліка лишилась у своїй панелі, а не зникла
        await expect(page.locator('[data-ui="comic-panel"][data-panel="0"] [data-ui="line-past"]')).toContainText('сімейний скарб');
        await shot('01');
        await stepIntro(page);
        await expect(shown, 'панель 3 — після ще одного дотику').toHaveCount(3);
        await expect(page.locator('[data-ui="comic-panel"][data-panel="2"] [data-ui="line"]')).toContainText('шкарпеток');
        await expect(page.locator('[data-ui="comic-panel"][data-panel="2"]')).toHaveAttribute('data-room', 'victoria');
        await shot('02');
        // Усі три панелі: у екрані, не накладаються одна на одну й на кнопки «Пропустити вступ» / «Далі»; кожна бульбашка — всередині своєї панелі.
        const panels: Box[] = [];
        for (let k = 0; k < 3; k++) panels.push(await box(page, `[data-ui="comic-panel"][data-panel="${k}"]`));
        for (let k = 0; k < 3; k++) {
          expect(inside(panels[k] as Box, vp), `панель ${k} у межах екрана`).toBe(true);
          expect(meets(panels[k] as Box, skipBox), `панель ${k} не під «Пропустити вступ»`).toBe(false);
          expect(meets(panels[k] as Box, await nextBox()), `панель ${k} не під «Далі»`).toBe(false);
          const bub = await box(page, `[data-ui="comic-panel"][data-panel="${k}"] .ui-bubble`);
          expect(inside(bub, panels[k] as Box), `бульбашка ${k} вміщається в свою панель`).toBe(true);
          for (let j = k + 1; j < 3; j++) expect(meets(panels[k] as Box, panels[j] as Box), `панелі ${k} і ${j} не накладаються`).toBe(false);
        }
        await stepIntro(page);   // victoria.bed — нова сторінка, лише перша панель
        await expect(page.locator('[data-ui="comic-panel"][data-state="shown"]')).toHaveCount(1);
        await expect(line).toContainText('Спати');
        await stepIntro(page);   // ніч: сплять
        await expect(page.locator('[data-ui="intro"]')).toHaveAttribute('data-kind', 'night');
        await expect(page.locator('[data-ui="intro-caption"]')).toHaveText('Ніч');
        await expect(page.locator('[data-ui="comic-panel"][data-pose="sleep"]')).toHaveCount(3);
        await shot('03');
        await stepIntro(page);   // ніч: сниться дорога (той самий крок, другий вигляд)
        await expect(page.locator('[data-ui="intro"]')).toHaveAttribute('data-kind', 'night');
        await expect(page.locator('[data-ui="intro-caption"]')).toHaveText('Їм сниться дорога…');
        await expect(page.locator('[data-ui="comic-panel"][data-room="dream"]')).toHaveCount(1);
        await shot('04');
        await stepIntro(page);   // ранок
        await expect(page.locator('[data-ui="intro"]')).toHaveAttribute('data-kind', 'morning');
        await expect(page.locator('[data-ui="intro-caption"]')).toHaveText('Субота, 08:00');
        await expect(page.locator('[data-ui="intro-alarm"]')).toBeVisible();
        await stepIntro(page);
        await expect(line).toHaveText('Хто бачив документи?!');
        await stepIntro(page);
        await expect(line).toHaveText('Я ще сплю…');
        await stepIntro(page);
        await expect(line).toHaveText('План простий: нічого не забути.');
        await expect(shown).toHaveCount(3);
        await shot('05');
      } else {
        const cine = page.locator('[data-ui="cine-shot"]');
        await expect(cine, 'кадр: одна кімната, а не вся родина').toHaveCount(1);
        await expect(cine).toHaveAttribute('data-room', 'matthew');
        await stepIntro(page);
        await expect(line).toContainText('пилососа');
        await expect(cine).toHaveAttribute('data-room', 'george');
        await shot('01');
        await stepIntro(page);
        await expect(line).toContainText('шкарпеток');
        await expect(cine).toHaveAttribute('data-room', 'victoria');
        await shot('02');
        const shotBox = await box(page, '[data-ui="cine-shot"]');
        const talkBox = await box(page, '[data-ui="dialogue"]');
        expect(inside(shotBox, vp), 'кадр у межах екрана').toBe(true);
        expect(meets(shotBox, talkBox), 'рамка розмови не накриває кадр').toBe(false);
        expect(meets(talkBox, skipBox), 'рамка розмови не під «Пропустити вступ»').toBe(false);
        expect(inside(talkBox, vp), 'рамка розмови в межах екрана').toBe(true);
        await stepIntro(page);   // victoria.bed
        await expect(line).toContainText('Спати');
        await stepIntro(page);   // ніч: спить
        await expect(page.locator('[data-ui="intro"]')).toHaveAttribute('data-kind', 'night');
        await expect(page.locator('[data-ui="intro-caption"]')).toHaveText('Ніч');
        await expect(cine).toHaveAttribute('data-pose', 'sleep');
        await shot('03');
        await stepIntro(page);   // ніч: сон про дорогу
        await expect(page.locator('[data-ui="intro"]')).toHaveAttribute('data-kind', 'night');
        await expect(page.locator('[data-ui="intro-caption"]')).toHaveText('Їм сниться дорога…');
        await expect(cine).toHaveAttribute('data-room', 'dream');
        await shot('04');
        await stepIntro(page);   // ранок
        await expect(page.locator('[data-ui="intro"]')).toHaveAttribute('data-kind', 'morning');
        await expect(page.locator('[data-ui="intro-caption"]')).toHaveText('Субота, 08:00');
        await expect(page.locator('[data-ui="intro-alarm"]')).toBeVisible();
        await stepIntro(page);
        await expect(line).toHaveText('Хто бачив документи?!');
        await expect(cine).toHaveAttribute('data-room', 'victoria');
        await stepIntro(page);
        await expect(line).toHaveText('Я ще сплю…');
        await expect(cine).toHaveAttribute('data-room', 'matthew');
        await stepIntro(page);
        await expect(line).toHaveText('План простий: нічого не забути.');
        await expect(cine).toHaveAttribute('data-room', 'george');
        await shot('05');
      }
      // Далі — мета (лишається класичною) і кінець вступу тими самими дотиками.
      await introTo(page, 'goal');
      expect(await kindOf()).toBe('goal');
      await walkIntro(page);
      await expect(page.locator('[data-ui="intro"]')).toHaveCount(0);
    });

    test(`${va.tag.toUpperCase()} ${va.style} ${v.w}×${v.h}: «Пропустити вступ» — одразу на ранок, вдруге — одразу у світ`, async ({ page }) => {
      await start(page, va.style, v.w, v.h);
      await introTo(page, 'line');
      await expect(page.locator(`[data-ui="intro-scene"][data-style="${va.style}"]`)).toHaveCount(1);
      await page.locator('[data-ui="intro-skip"]').click();
      // без очікувань на час: ранок видно в тому ж кадрі, що й дотик
      await expect(page.locator('[data-ui="intro"]')).toHaveAttribute('data-kind', 'morning');
      await expect(page.locator('[data-ui="intro-caption"]')).toHaveText('Субота, 08:00');
      await page.waitForTimeout(320);   // пауза між дотиками вступу — 250 мс
      await page.locator('[data-ui="intro-skip"]').click();
      await expect(page.locator('[data-ui="intro"]')).toHaveCount(0);
    });
  }
}

test('без перемикача вступ — нинішній: родина на одній кімнаті, без сцени проби', async ({ page }) => {
  await start(page, 'classic', 390, 844);
  await introTo(page, 'line');
  await expect(page.locator('[data-ui="intro-scene"]')).toHaveCount(0);
  await expect(page.locator('[data-ui="intro-room"]')).toHaveCount(1);
  await expect(page.locator('[data-ui="line"]')).toContainText('сімейний скарб');
});
