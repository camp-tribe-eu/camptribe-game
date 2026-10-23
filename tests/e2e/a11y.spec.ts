// GAME-39 · доступність: axe-core на кожному екрані UI, текст 200 %, prefers-reduced-motion.
// Кожна перевірка має свій негативний контроль поруч: зелений результат без нього нічого не доводить (закон 1).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const story = (page: Page) => page.locator('[data-ui="story"]');

async function openGame(page: Page, query = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/${query}`);
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { ready: boolean; saveLoaded: boolean } } }).__game?.probe.saveLoaded === true, null, { timeout: 30_000 });
  return errors;
}

/**
 * Порушення axe з впливом serious/critical: «правило: вузол» — щоб у червоному звіті було видно, що саме.
 * Контраст axe міряє лише на видимому: діалог, вищий за екран, проганяємо на кожній висоті прокрутки
 * (натиснута кнопка 4.0:1 ховалась саме так — поза екраном axe кладе її в «incomplete», а не в порушення).
 */
async function seriousViolations(page: Page): Promise<string[]> {
  const found = new Set<string>();
  const stops = await page.evaluate(() => {
    const d = document.querySelector<HTMLElement>('[role="dialog"]');
    if (!d) return 1;
    d.scrollTop = 0;
    return Math.max(1, Math.ceil(d.scrollHeight / d.clientHeight));
  });
  for (let i = 0; i < stops; i++) {
    await page.evaluate((k) => {
      const d = document.querySelector<HTMLElement>('[role="dialog"]');
      if (d) d.scrollTop = k * d.clientHeight;
    }, i);
    const r = await new AxeBuilder({ page }).analyze();
    for (const v of r.violations) {
      if (v.impact !== 'serious' && v.impact !== 'critical') continue;
      for (const n of v.nodes) found.add(`${v.id} (${v.impact}): ${n.target.join(' ')}`);
    }
  }
  return [...found];
}

/** Скільки правил axe справді відпрацювало: «0 порушень» на порожній сторінці нічого не доводить. */
async function passedRules(page: Page): Promise<number> {
  return (await new AxeBuilder({ page }).analyze()).passes.length;
}

async function openPause(page: Page): Promise<void> {
  await page.locator('[data-touch="pause"]').click();
  await expect(page.locator('[data-ui="pause"]')).toBeVisible();
}

/** Персонаж біля Елізи й розмова відкрита — лише кліками (той самий шлях, що в story.spec.ts). */
async function openDialogue(page: Page): Promise<void> {
  await page.locator('[data-touch="story"]').click();
  await story(page).locator('[data-act="create"]', { hasText: /Велосипед|Bike/ }).first().click();
  for (const [kind, key] of [['visit', 'loc.home'], ['complete', 'q.st-001'], ['visit', 'loc.home'], ['complete', 'q.st-002'], ['visit', 'loc.shop'],
    ['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'], ['complete', 'q.st-003'], ['visit', 'loc.road'], ['complete', 'q.elise-bike-area.choice'],
    ['visit', 'loc.camp.lake'], ['talk', 'npc.elise']] as const) {
    await story(page).locator(`[data-act="${kind}"][data-key="${key}"]`).click();
    // На дорозі з шансом 50 % — подія (GAME-31): відповідаємо, як гравець.
    if (key === 'loc.road' && await story(page).locator('[data-key="dlg.road-apples.box.c2"]').isVisible({ timeout: 400 }).catch(() => false)) {
      await story(page).locator('[data-key="dlg.road-apples.box.c2"]').click();
      await story(page).locator('[data-act="continue"]').click();
    }
  }
  await expect(story(page).locator('[data-ui="dialogue"]')).toBeVisible();
}

test.describe('axe-core: 0 порушень serious/critical на кожному екрані (GAME-39 #1)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('світ із дотиковими кнопками', async ({ page }) => {
    const errors = await openGame(page);
    await expect(page.locator('[data-touch="up"]')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
    expect(await passedRules(page)).toBeGreaterThan(5);
    expect(errors).toEqual([]);
  });

  test('діалог паузи з відкритими титрами', async ({ page }) => {
    await openGame(page);
    await openPause(page);
    await page.locator('[data-ui="credits"] summary').click();
    expect(await page.locator('[data-ui="credits"] li').count()).toBeGreaterThan(0);
    expect(await seriousViolations(page)).toEqual([]);
  });

  test('екран подорожі: вибір персонажа', async ({ page }) => {
    await openGame(page);
    await page.locator('[data-touch="story"]').click();
    await expect(story(page).locator('[data-ui="create"]')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });

  test('екран подорожі: гра, відкрита розмова й журнал', async ({ page }) => {
    await openGame(page);
    await openDialogue(page);
    await story(page).locator('[data-ui="journal"] summary').click();
    expect(await seriousViolations(page)).toEqual([]);
  });

  for (const scale of [150, 200] as const) {
    test(`налаштування при тексті ${scale} %`, async ({ page }) => {
      await openGame(page);
      await openPause(page);
      await page.locator(`[data-ui="text-${scale}"]`).click();
      expect(await page.evaluate(() => document.documentElement.style.fontSize)).toBe(`${scale}%`);
      await page.locator('[data-ui="credits"] summary').click();
      expect(await seriousViolations(page)).toEqual([]);
    });
  }

  test('негативний контроль: блідий текст у діалозі паузи — axe червоніє на color-contrast', async ({ page }) => {
    await openGame(page);
    await openPause(page);
    await page.evaluate(() => {
      const p = document.createElement('p');
      p.dataset.probe = 'low-contrast';
      p.textContent = 'low contrast probe';
      p.style.cssText = 'color:#333;background:#2a2f35';
      document.querySelector('[data-ui="pause"]')?.append(p);
    });
    expect((await seriousViolations(page)).some((v) => v.startsWith('color-contrast') && v.includes('low-contrast'))).toBe(true);
  });
});

/**
 * Обрізаний текст (ідея — i18n.spec.ts): вміст ширший за видиму область чи елемент вилазить за край екрана.
 * Плюс вертикаль: діалог прокручено догори, і жоден елемент не лежить вище за його верх — інакше до нього
 * не докрутити (центрована сітка, вища за екран, ховала «Продовжити» при 200 % — знайдено цим тестом).
 */
const clipped = (page: Page, scope: string): Promise<string[]> => page.evaluate((sel) => {
  const out: string[] = [];
  const vw = window.innerWidth;
  const root = document.querySelector<HTMLElement>(sel);
  if (!root) return [`${sel}: немає на екрані`];
  root.scrollTop = 0;
  const top = root.getBoundingClientRect().top;
  for (const el of [root, ...root.querySelectorAll<HTMLElement>('*')]) {
    const r = el.getBoundingClientRect();
    const id = `${el.tagName}.${el.className}[${el.dataset.ui ?? el.dataset.act ?? ''}]`;
    if (el.scrollWidth > el.clientWidth + 1 || r.left < -1 || r.right > vw + 1) out.push(`${id} sw=${el.scrollWidth} cw=${el.clientWidth} r=${Math.round(r.right)}/${vw}`);
    if (r.height > 0 && r.top < top - 1) out.push(`${id} над верхом діалогу: top=${Math.round(r.top)} < ${Math.round(top)}`);
  }
  return out;
}, scope);

/** Цілі дотику менші за 44×44 CSS px. */
const small = (page: Page, scope: string): Promise<string[]> => page.evaluate((sel) =>
  [...document.querySelectorAll<HTMLElement>(`${sel} :is(button, summary, a, textarea, input)`)]
    .map((e) => ({ e: `${e.tagName}[${e.dataset.ui ?? e.dataset.act ?? ''}]`, r: e.getBoundingClientRect() }))
    .filter(({ r }) => r.width < 44 || r.height < 44).map(({ e, r }) => `${e} ${Math.round(r.width)}×${Math.round(r.height)}`), scope);

for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  test.describe(`текст 200 % · ${vp.width}×${vp.height} (GAME-39 #2)`, () => {
    test.use({ viewport: vp });

    test('діалог паузи з титрами: нічого не обрізано, цілі ≥ 44 px', async ({ page }) => {
      await openGame(page);
      await openPause(page);
      await page.locator('[data-ui="text-200"]').click();
      await expect(page.locator('[data-ui="text-200"]')).toHaveAttribute('aria-pressed', 'true');
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('32px');
      await page.locator('[data-ui="credits"] summary').click();
      expect(await page.locator('[data-ui="pause"] *').count()).toBeGreaterThan(30);
      expect(await clipped(page, '[data-ui="pause"]')).toEqual([]);
      expect(await small(page, '[data-ui="pause"]')).toEqual([]);
    });

    test('екран подорожі (розмова, журнал): нічого не обрізано, цілі ≥ 44 px', async ({ page }) => {
      await openGame(page);
      await openPause(page);
      await page.locator('[data-ui="text-200"]').click();
      await page.keyboard.press('Escape');                       // не клік «Продовжити»: її досяжність міряє детектор
      await expect(page.locator('[data-ui="pause"]')).toHaveCount(0);
      await openDialogue(page);
      await story(page).locator('[data-ui="journal"] summary').click();
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('32px');
      expect(await clipped(page, '[data-ui="story"]')).toEqual([]);
      expect(await small(page, '[data-ui="story"]')).toEqual([]);
    });

    test('негативний контроль: обрізаний текст і мала ціль — детектори червоніють', async ({ page }) => {
      await openGame(page);
      await openPause(page);
      await page.locator('[data-ui="text-200"]').click();
      await page.evaluate(() => {
        const b = document.querySelector<HTMLElement>('[data-ui="resume"]');
        if (b) { b.style.whiteSpace = 'nowrap'; b.style.overflow = 'hidden'; b.textContent = 'W'.repeat(400); }
        const s = document.querySelector<HTMLElement>('[data-ui="reset"]');
        if (s) s.style.cssText = 'min-width:0;min-height:0;width:20px;height:20px;padding:0';
      });
      expect((await clipped(page, '[data-ui="pause"]')).some((x) => x.includes('[resume]'))).toBe(true);
      expect((await small(page, '[data-ui="pause"]')).some((x) => x.includes('[reset]'))).toBe(true);
    });

    test('негативний контроль: стара центрована сітка (без safe) — детектор бачить недосяжне над верхом', async ({ page }) => {
      await openGame(page);
      await openPause(page);
      await page.locator('[data-ui="text-200"]').click();
      await page.locator('[data-ui="credits"] summary').click();
      await page.evaluate(() => { document.querySelector<HTMLElement>('[data-ui="pause"]')?.style.setProperty('place-content', 'center'); });
      expect((await clipped(page, '[data-ui="pause"]')).some((x) => x.includes('[resume]') && x.includes('над верхом'))).toBe(true);
    });
  });
}

/** Тривалості анімацій і переходів усіх елементів UI, що не дорівнюють 0. */
const moving = (page: Page): Promise<string[]> => page.evaluate(() => {
  const out: string[] = [];
  const zero = (v: string): boolean => v.split(',').every((x) => parseFloat(x) === 0);
  for (const el of document.querySelectorAll<HTMLElement>('#app, #app *')) {
    const s = getComputedStyle(el);
    if (!zero(s.transitionDuration) || !zero(s.animationDuration) || !zero(s.transitionDelay) || !zero(s.animationDelay)) {
      out.push(`${el.tagName}[${el.dataset.ui ?? el.dataset.probe ?? ''}] t=${s.transitionDuration} a=${s.animationDuration}`);
    }
  }
  return out;
});

/** Пробний елемент із переходом і анімацією — саме те, що мусить погасити правило reduced-motion. */
async function injectMotion(page: Page): Promise<void> {
  await page.evaluate(() => {
    const st = document.createElement('style');
    st.textContent = '@keyframes probe-spin { to { transform: rotate(1turn); } }';
    document.head.append(st);
    const d = document.createElement('div');
    d.dataset.probe = 'motion';
    d.style.cssText = 'transition: opacity 300ms ease 50ms; animation: probe-spin 2s infinite';
    document.querySelector('[data-ui="pause"]')?.append(d);
  });
}

test.describe('prefers-reduced-motion (GAME-39 #3)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('reduce: жоден елемент UI не анімується, навіть із власним переходом; камера без згладжування', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openGame(page);
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
    await openPause(page);
    await page.locator('[data-ui="credits"] summary').click();
    await injectMotion(page);
    expect(await page.locator('#app *').count()).toBeGreaterThan(30);
    expect(await moving(page)).toEqual([]);
    // Камера слідує без lerp (1 = миттєво): плавного «доїзду» немає ні з reduce, ні без нього.
    expect(await page.evaluate(() => (window as unknown as { __game: { probe: { cameraLerp: number[] } } }).__game.probe.cameraLerp)).toEqual([1, 1]);
  });

  test('негативний контроль: без reduce той самий пробний елемент анімується — детектор це бачить', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await openGame(page);
    await openPause(page);
    await injectMotion(page);
    expect((await moving(page)).some((x) => x.includes('[motion]') && x.includes('t=0.3s'))).toBe(true);
    expect(await page.evaluate(() => (window as unknown as { __game: { probe: { cameraLerp: number[] } } }).__game.probe.cameraLerp)).toEqual([1, 1]);
  });
});
