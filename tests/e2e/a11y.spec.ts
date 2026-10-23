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
 * Найгірше тло під діалогом. Фон .ui-overlay — #000000cc (80 % чорного) поверх полотна Phaser, і axe не
 * бачить пікселів полотна: без підміни текст діалогу йде в «incomplete» (imgNode), тобто не міряється.
 * Під час сканування полотно ховаємо, а #stage робимо білим: 20 % білого крізь оверлей = #333333 — найсвітліше,
 * що може дати будь-який піксель гри. Це найгірший випадок для КОЖНОГО кольору тексту: світлий текст, що
 * тримає 4.5:1 на #333, тримає його й на темнішому; темний текст на #333 не дотягує навіть до 1.7:1.
 */
const WORST_BACKDROP = '#stage canvas { visibility: hidden !important; } #stage { background: #fff !important; }';

/**
 * Контраст усередині діалогу, який axe так і не зміряв (incomplete на всіх висотах прокрутки), — з причиною.
 * Порожньо: рядок сюди — лише з назвою вузла, причиною axe (messageKey) і чому це не текст для читання.
 */
const UNMEASURED_OK: Readonly<Record<string, string>> = {};

/**
 * Порушення axe з впливом serious/critical: «правило: вузол» — щоб у червоному звіті було видно, що саме.
 * Плюс незміряний контраст у діалозі: «incomplete» — це не «пройдено» (закон 4), тож він теж червоний.
 * Контраст axe міряє лише на видимому: діалог, вищий за екран, проганяємо на кожній висоті прокрутки —
 * один analyze() вузол нижче екрана не кладе ні в порушення, ні в incomplete, а просто пропускає
 * (доведено контролем «нижче згину» нижче). `scroll: false` — лише для цього контролю.
 */
async function seriousViolations(page: Page, { scroll = true }: { scroll?: boolean } = {}): Promise<string[]> {
  const found = new Set<string>();
  const unmeasured = new Map<string, string>();
  const measured = new Set<string>();
  // Крок — пів екрана: вузол на межі двох зупинок (axe: elmPartiallyObscured) цілком видно на проміжній.
  const stops = await page.evaluate(() => {
    const d = document.querySelector<HTMLElement>('[role="dialog"]');
    if (!d) return 0;
    d.scrollTop = 0;
    return Math.max(1, Math.ceil((2 * d.scrollHeight) / d.clientHeight));
  });
  // Найгірше тло — лише під діалогом: HUD світу лежить просто на полотні, і його тло — сама гра.
  const backdrop = stops > 0 ? await page.addStyleTag({ content: WORST_BACKDROP }) : null;
  const collect = async (r: Awaited<ReturnType<AxeBuilder['analyze']>>): Promise<void> => {
    for (const v of r.violations) {
      if (v.id === 'color-contrast') for (const n of v.nodes) measured.add(n.target.join(' '));
      if (v.impact !== 'serious' && v.impact !== 'critical') continue;
      for (const n of v.nodes) {
        const c = n.any[0]?.data as { fgColor?: string; bgColor?: string; contrastRatio?: number } | null;
        const colours = v.id === 'color-contrast' && c?.fgColor ? ` — ${c.fgColor} на ${c.bgColor}, ${c.contrastRatio}:1` : '';
        found.add(`${v.id} (${v.impact}): ${n.target.join(' ')}${colours}`);
      }
    }
    for (const v of r.passes) if (v.id === 'color-contrast') for (const n of v.nodes) measured.add(n.target.join(' '));
    for (const v of r.incomplete) {
      if (v.id !== 'color-contrast') continue;
      for (const n of v.nodes) {
        const sel = n.target.join(' ');
        const inDialog = await page.evaluate((q) => document.querySelector(q)?.closest('[role="dialog"]') != null, sel);
        if (inDialog) unmeasured.set(sel, String((n.any[0]?.data as { messageKey?: string } | null)?.messageKey ?? n.any[0]?.message ?? '?'));
      }
    }
  };
  for (let i = 0; i < (scroll ? Math.max(1, stops) : 1); i++) {
    await page.evaluate((k) => {
      const d = document.querySelector<HTMLElement>('[role="dialog"]');
      if (d) d.scrollTop = (k * d.clientHeight) / 2;
    }, i);
    await collect(await new AxeBuilder({ page }).analyze());
  }
  // Вузол, вищий за пів екрана (довгий перелік авторів у титрах при 200 %), не влазить у жодну зупинку.
  // Його міряємо окремо у вікні, вищому за нього: ширина та сама, тож перенос рядків і кольори ті самі.
  const tall = scroll ? [...unmeasured.keys()].filter((q) => !measured.has(q)) : [];
  const vp = page.viewportSize();
  if (tall.length > 0 && vp) {
    const h = await page.evaluate((qs) => Math.max(...qs.map((q) => document.querySelector(q)?.getBoundingClientRect().height ?? 0)), tall);
    await page.setViewportSize({ width: vp.width, height: Math.max(vp.height, Math.ceil(h) + 200) });
    for (const q of tall) {
      await page.evaluate((x) => document.querySelector(x)?.scrollIntoView({ block: 'center' }), q);
      await collect(await new AxeBuilder({ page }).include(q).analyze());
    }
    await page.setViewportSize(vp);
  }
  await backdrop?.evaluate((el) => (el as Element).remove());
  for (const [sel, why] of unmeasured) if (!measured.has(sel) && !UNMEASURED_OK[sel]) found.add(`color-contrast (не зміряно: ${why}): ${sel}`);
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
  await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії
  for (const [kind, key] of [['complete', 'q.st-001'], ['complete', 'q.st-002'], ['visit', 'loc.shop'],
    ['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'], ['complete', 'q.st-003'], ['visit', 'loc.road'], ['complete', 'q.elise-bike-area.choice'],
    ['visit', 'loc.camp.lake'], ['talk', 'npc.elise']] as const) {
    await story(page).locator(`[data-act="${kind}"][data-key="${key}"]`).click();
    await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії
    // На дорозі з шансом 50 % — подія (GAME-31): відповідаємо, як гравець.
    if (key === 'loc.road' && await story(page).locator('[data-key="dlg.road-apples.box.c2"]').isVisible({ timeout: 400 }).catch(() => false)) {
      await story(page).locator('[data-key="dlg.road-apples.box.c2"]').click();
      await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії
      await story(page).locator('[data-act="continue"]').click();
      await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії
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

  test('підпис збірки на канві читається й над найсвітлішим пікселем гри (білий під канвою)', async ({ page }) => {
    await openGame(page);
    await page.addStyleTag({ content: WORST_BACKDROP });
    const r = await new AxeBuilder({ page }).include('.build').withRules(['color-contrast']).analyze();
    expect(r.violations.map((v) => v.id)).toEqual([]);
    expect(r.passes.map((v) => v.id)).toContain('color-contrast');   // справді зміряно, а не «не вдалося»
  });

  test('діалог паузи з відкритими титрами', async ({ page }) => {
    await openGame(page);
    await openPause(page);
    await page.locator('[data-ui="credits"] summary').click();
    expect(await page.locator('[data-ui="credits"] li').count()).toBeGreaterThan(0);
    expect(await seriousViolations(page)).toEqual([]);
  });

  test('підтвердження «Нова гра» (GAME-82): діалог із фокусом на «Ні», підписи, цілі ≥ 44 px', async ({ page }) => {
    await openGame(page);
    await openPause(page);
    await page.locator('[data-ui="new-game"]').click();
    const d = page.locator('[data-ui="confirm-new"]');
    await expect(d).toBeVisible();
    await expect(d).toHaveAttribute('role', 'dialog');
    await expect(d).toHaveAttribute('aria-modal', 'true');
    expect(await d.getAttribute('aria-label')).toBeTruthy();
    await expect(page.locator('[data-ui="confirm-new-no"]')).toBeFocused();
    expect(await small(page, '[data-ui="confirm-new"]')).toEqual([]);
    expect(await seriousViolations(page)).toEqual([]);
    expect(await passedRules(page)).toBeGreaterThan(5);
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

  // Блідий текст БЕЗ власного тла: його тло — оверлей над полотном. Без найгіршого тла й перевірки
  // «incomplete» цей вузол лишався незміряним, а перевірка — зеленою (знахідка рецензента c92d93b).
  test('негативний контроль: блідий текст без власного тла — червоніє (тло під оверлеєм не вгадується)', async ({ page }) => {
    await openGame(page);
    await openPause(page);
    await page.evaluate(() => {
      const p = document.createElement('p');
      p.dataset.probe = 'no-bg';
      p.textContent = 'low contrast probe';
      p.style.color = '#333';
      document.querySelector('[data-ui="pause"]')?.prepend(p);
    });
    expect((await seriousViolations(page)).filter((v) => v.includes('no-bg'))).toEqual(['color-contrast (не зміряно: equalRatio): p[data-probe="no-bg"]']);
  });

  // Нижче згину високого діалогу: один analyze() не бачить вузол зовсім, прокрутка — бачить.
  test('негативний контроль: блідий вузол нижче згину — пропущений одним скануванням, спійманий прокруткою', async ({ page }) => {
    await openGame(page);
    await openPause(page);
    await page.evaluate(() => {
      const d = document.querySelector<HTMLElement>('[data-ui="pause"]');
      const spacer = document.createElement('div');
      spacer.style.height = '3000px';
      const p = document.createElement('p');
      p.dataset.probe = 'below-fold';
      p.textContent = 'low contrast probe';
      p.style.cssText = 'color:#333;background:#2a2f35';
      d?.append(spacer, p);
    });
    expect((await seriousViolations(page, { scroll: false })).filter((v) => v.includes('below-fold'))).toEqual([]);
    expect((await seriousViolations(page)).filter((v) => v.includes('below-fold'))).toEqual(['color-contrast (serious): p[data-probe="below-fold"] — #333333 на #2a2f35, 1.06:1']);
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
