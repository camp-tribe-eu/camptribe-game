// GAME-303 · гібрид подачі вступу (рішення власника): розмова родини «з різних кімнат» — комікс-панелі; ніч (родина спить → сон про дорогу) і ранок (будильник) — повні кадри.
// Проходиться дотиками до кінця в обох орієнтаціях; «Пропустити вступ» спрацьовує одразу (і з комікса, і з нічного кадру); ?introClassic=1 лишає старий вступ.
// Знімки — лише за GAME303_SHOTS=1 (research/game-303/hybrid-{portrait,landscape}-NN.png), не на критичному шляху тесту.
// Закон 1: контроль — зламаний перехід панелі (shown не росте) мусить зробити тест червоним; розстановку меблів стереже src/view/intro-plan.test.ts.
import { expect, test, type Page } from '@playwright/test';
import { introTo, stepIntro, walkIntro } from './intro-walk';
import { waitGameReady } from './ready';

const VIEWS = [{ name: 'portrait', w: 390, h: 844 }, { name: 'landscape', w: 932, h: 430 }] as const;
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

const start = async (page: Page, query: string, w: number, h: number): Promise<void> => {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`/?intro=1&soloHero=1&seed=1${query}`);
  await waitGameReady(page);
};

for (const v of VIEWS) {
  test(`гібрид ${v.w}×${v.h}: комікс для розмови, повний кадр для ночі й ранку, до кінця дотиками, рамки не накладаються`, async ({ page }) => {
    await start(page, '', v.w, v.h);
    const vp: Box = { x: 0, y: 0, w: v.w, h: v.h };
    const shot = async (n: string): Promise<void> => {
      if (!SHOTS) return;
      await sceneReady(page);
      await page.screenshot({ path: `research/game-303/hybrid-${v.name}-${n}.png`, animations: 'disabled' });
    };
    // Нічний ролик: показати шари до k (шари — один на одному, зверху останній) без анімації — для знімка однієї миті.
    const onlyLayer = (k: number): Promise<void> => page.evaluate((n) => {
      document.querySelectorAll<HTMLElement>('[data-ui="cine-layer"]').forEach((el, i) => { el.style.animation = 'none'; el.style.opacity = i <= n ? '1' : '0'; });
      const dc = document.querySelector<HTMLElement>('[data-ui="intro-dream-caption"]');
      if (dc) { dc.style.animation = 'none'; dc.style.opacity = n >= 3 ? '1' : '0'; }
    }, k);
    const line = page.locator('[data-ui="line"]');
    const kindOf = (): Promise<string | null> => page.locator('[data-ui="intro"]').getAttribute('data-kind');
    const scene = page.locator('[data-ui="intro-scene"]');

    // До першої репліки: пошук, лист, вибір героя й Атлас — як були (гібрид їх не чіпає).
    await introTo(page, 'line');
    await expect(scene).toHaveCount(1);
    await expect(scene).toHaveAttribute('data-style', 'comic');
    await expect(page.locator('[data-ui="intro-skip"]')).toHaveText('Пропустити вступ');
    await expect(line).toContainText('сімейний скарб');
    await sceneReady(page);
    const skipBox = await box(page, '[data-ui="intro-skip"]');
    const nextBox = async (): Promise<Box> => box(page, '[data-ui="intro-next"]');

    // --- Комікс: розмова з різних кімнат ---
    const shown = page.locator('[data-ui="comic-panel"][data-state="shown"]');
    await expect(shown, 'панель 1 з’являється разом із першою реплікою').toHaveCount(1);
    await expect(page.locator('[data-ui="comic-panel"]')).toHaveCount(3);
    await expect(page.locator('[data-ui="comic-panel"][data-panel="0"] [data-ui="line"]')).toContainText('сімейний скарб');
    await expect(page.locator('[data-ui="comic-panel"][data-panel="0"]')).toHaveAttribute('data-room', 'matthew');
    await stepIntro(page);
    await expect(shown, 'панель 2 — після дотику').toHaveCount(2);
    await expect(page.locator('[data-ui="comic-panel"][data-panel="1"] [data-ui="line"]')).toContainText('пилососа');
    await expect(page.locator('[data-ui="comic-panel"][data-panel="1"]')).toHaveAttribute('data-room', 'george');
    await expect(page.locator('[data-ui="comic-panel"][data-panel="0"] [data-ui="line-past"]')).toContainText('сімейний скарб');   // перша репліка лишилась у своїй панелі
    await shot('01');
    await stepIntro(page);
    await expect(shown, 'панель 3 — після ще одного дотику').toHaveCount(3);
    await expect(page.locator('[data-ui="comic-panel"][data-panel="2"] [data-ui="line"]')).toContainText('шкарпеток');
    await expect(page.locator('[data-ui="comic-panel"][data-panel="2"]')).toHaveAttribute('data-room', 'victoria');
    await shot('02');
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
    await shot('03');

    // --- Кіно: ніч — родина спить → сон про дорогу, один крок ---
    await stepIntro(page);
    await expect(page.locator('[data-ui="intro"]')).toHaveAttribute('data-kind', 'night');
    await expect(scene).toHaveAttribute('data-style', 'cinema');
    await expect(page.locator('[data-ui="intro-caption"]')).toHaveText('Ніч');
    await expect(page.locator('[data-ui="cine-layer"]'), 'три шоти сну + сон про дорогу').toHaveCount(4);
    await expect(page.locator('[data-ui="cine-layer"][data-pose="sleep"]')).toHaveCount(3);
    await expect(page.locator('[data-ui="cine-layer"][data-room="dream"]')).toHaveCount(1);
    await expect(page.locator('[data-ui="intro-dream-caption"]')).toHaveText('Їм сниться дорога…');
    await sceneReady(page);
    const cineShot = await box(page, '[data-ui="cine-shot"]');
    const title = await box(page, '.ui-cine-title');
    expect(inside(cineShot, vp), 'кадр у межах екрана').toBe(true);
    expect(meets(cineShot, skipBox), 'кадр не під «Пропустити вступ»').toBe(false);
    expect(meets(cineShot, title), 'титри не накривають кадр').toBe(false);
    expect(inside(title, vp), 'титри в межах екрана').toBe(true);
    if (SHOTS) {
      await onlyLayer(0); await shot('04');
      await onlyLayer(1); await shot('05');
      await onlyLayer(2); await shot('06');
      await onlyLayer(3); await shot('07');
    }
    // --- Кіно: ранок ---
    await stepIntro(page);
    await expect(page.locator('[data-ui="intro"]')).toHaveAttribute('data-kind', 'morning');
    await expect(scene).toHaveAttribute('data-style', 'cinema');
    await expect(page.locator('[data-ui="intro-caption"]')).toHaveText('Субота, 08:00');
    await expect(page.locator('[data-ui="intro-alarm"]')).toBeVisible();
    await expect(page.locator('[data-ui="cine-layer"]')).toHaveCount(1);
    await shot('08');
    // --- Комікс: метушня ---
    await stepIntro(page);
    await expect(scene).toHaveAttribute('data-style', 'comic');
    await expect(line).toHaveText('Хто бачив документи?!');
    await stepIntro(page);
    await expect(line).toHaveText('Я ще сплю…');
    await stepIntro(page);
    await expect(line).toHaveText('План простий: нічого не забути.');
    await expect(shown).toHaveCount(3);
    await shot('09');
    // Далі — мета (лишається класичною) і кінець вступу тими самими дотиками.
    await introTo(page, 'goal');
    expect(await kindOf()).toBe('goal');
    await walkIntro(page);
    await expect(page.locator('[data-ui="intro"]')).toHaveCount(0);
  });

  test(`гібрид ${v.w}×${v.h}: «Пропустити вступ» — одразу на ранок (з комікса), вдруге — одразу у світ`, async ({ page }) => {
    await start(page, '', v.w, v.h);
    await introTo(page, 'line');
    await expect(page.locator('[data-ui="intro-scene"][data-style="comic"]')).toHaveCount(1);
    await page.locator('[data-ui="intro-skip"]').click();
    await expect(page.locator('[data-ui="intro"]')).toHaveAttribute('data-kind', 'morning');
    await expect(page.locator('[data-ui="intro-caption"]')).toHaveText('Субота, 08:00');
    await page.waitForTimeout(320);   // пауза між дотиками вступу — 250 мс
    await page.locator('[data-ui="intro-skip"]').click();
    await expect(page.locator('[data-ui="intro"]')).toHaveCount(0);
  });

  test(`гібрид ${v.w}×${v.h}: пропуск із нічного кадру веде одразу на ранок`, async ({ page }) => {
    await start(page, '', v.w, v.h);
    await introTo(page, 'night');
    await expect(page.locator('[data-ui="intro-scene"][data-style="cinema"]')).toHaveCount(1);
    await page.locator('[data-ui="intro-skip"]').click();
    await expect(page.locator('[data-ui="intro"]')).toHaveAttribute('data-kind', 'morning');
  });
}

test('?introClassic=1 — старий вступ: родина в одній кімнаті, без гібрида', async ({ page }) => {
  await start(page, '&introClassic=1', 390, 844);
  await introTo(page, 'line');
  await expect(page.locator('[data-ui="intro-scene"]')).toHaveCount(0);
  await expect(page.locator('[data-ui="intro-room"]')).toHaveCount(1);
  await expect(page.locator('[data-ui="line"]')).toContainText('сімейний скарб');
});
