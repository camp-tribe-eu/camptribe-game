// GAME-111 · сторож DOM для кішки Mia: у панелі Mia рівно два текстові стани й жодного числа, відсотка чи шкали.
//  (a) сторч 390×844 і вбік 844×390: сім'я · авто · кішка. Удома хвиля виїзду відкриває справу «Мія в переноску» → «Потрібна пауза»;
//      тап по справі → «Місце облаштоване». За весь прохід панель показала РІВНО ці два рядки, і в жодному — цифр/шкал;
//  (b) негативний контроль (закон 1): сторож, який не бачить підкинутої цифри чи шкали, — не сторож. Вставляємо «3/5», <progress>
//      і role=meter у ту саму панель — детектор мусить їх знайти;
//  (c) велосипедист без кішки панелі Mia не має зовсім (Mia не їде велосипедом).
import { expect, test, type Page } from '@playwright/test';
import { waitGameReady } from './ready';

interface Core { game: { wave?: { active: { tasks: Record<string, { outcome: string }> } | null } } }
const core = (page: Page): Promise<Core> => page.evaluate(() => (window as unknown as { __game: { read: () => Core } }).__game.read());
const panel = (page: Page) => page.locator('[data-ui="story"]');
const mia = (page: Page) => page.locator('[data-ui="mia"]');
const SETTINGS_KEY = 'camplife.settings.v1';
const PAUSE = 'Потрібна пауза';
const SETTLED = 'Місце облаштоване';

async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(([k]) => { try { localStorage.setItem(k, JSON.stringify({ textScale: 100, language: 'uk', hintSeen: true })); } catch { /* сховища немає */ } }, [SETTINGS_KEY] as const);
  await page.goto('/?seed=5');
  await waitGameReady(page);
  await page.locator('[data-touch="story"]').click();
  await expect(panel(page)).toBeVisible();
  return errors;
}
async function act(page: Page, kind: string, key = ''): Promise<void> {
  try { await panel(page).locator(`[data-act="${kind}"][data-key="${key}"]`).click({ timeout: 5_000 }); } catch { throw new Error(`крок «${kind} ${key}»: кнопки немає на екрані подорожі`); }
  await page.waitForTimeout(400);   // GAME-80: панель глуха ~350 мс після дії
}
/** Прологом до повернення додому з крамниці: CH1-HOME-001 активний, гравець удома → режисер відкрив хвилю виїзду. */
async function toHome(page: Page, pick: string): Promise<void> {
  await panel(page).locator('[data-act="create"]', { hasText: pick }).first().click();
  await page.waitForTimeout(400);
  for (const [k, key] of [['complete', 'q.prologue-home-001'], ['complete', 'q.st-001'], ['complete', 'q.st-002'], ['visit', 'loc.shop'], ['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'],
    ['complete', 'q.st-003'], ['visit', 'loc.home']] as const) await act(page, k, key);
}

/** Що в панелі Mia не так: цифри, відсотки, шкали й числа в доступних іменах. Порожньо — панель чиста. */
async function miaViolations(page: Page): Promise<string[]> {
  return mia(page).evaluate((el) => {
    const out: string[] = [];
    const text = el.textContent ?? '';
    if (/[0-9%/]/.test(text)) out.push(`цифра, % чи дріб у тексті: «${text}»`);
    if (el.querySelector('meter, progress, svg, canvas, img, input, [role="progressbar"], [role="meter"], [role="slider"], [aria-valuenow], [aria-valuetext], [style*="width"]')) out.push('шкала (meter / progress / valuenow / ширина)');
    for (const n of [el, ...Array.from(el.querySelectorAll('*'))]) {
      for (const a of Array.from(n.attributes)) if ((a.name.startsWith('aria-') || a.name === 'title' || a.name === 'data-state') && /[0-9%]/.test(a.value)) out.push(`число в атрибуті ${a.name}="${a.value}"`);
    }
    return out;
  });
}

for (const vp of [{ name: 'сторч 390×844', width: 390, height: 844 }, { name: 'вбік 844×390', width: 844, height: 390 }]) {
  test.describe(`(a) ${vp.name}: два текстові стани Mia, жодного числа`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true });
    test('удома «Потрібна пауза», після справи «Місце облаштоване»; за весь прохід — лише ці два рядки без цифр і шкал', async ({ page }) => {
      test.setTimeout(120_000);
      const errors = await open(page);
      // До створення персонажа панелі Mia ще немає.
      await expect(mia(page)).toHaveCount(0);
      await toHome(page, 'Авто · Кішка');
      const seen = new Set<string>();
      const look = async (want: string, state: string): Promise<void> => {
        await expect(mia(page)).toHaveCount(1);
        await mia(page).scrollIntoViewIfNeeded();
        await expect(mia(page).locator('h3')).toHaveText('Мія');
        await expect(mia(page).locator('[data-ui="mia-state"]')).toHaveText(want);
        await expect(mia(page)).toHaveAttribute('data-state', state);
        seen.add((await mia(page).locator('[data-ui="mia-state"]').textContent()) ?? '');
        expect(await miaViolations(page), `панель Mia «${want}»`).toEqual([]);
        const r = await mia(page).evaluate((el) => { const b = el.getBoundingClientRect(); return { left: b.left, right: b.right, width: b.width }; });
        expect(r.left, 'панель в межах екрана').toBeGreaterThanOrEqual(0);
        expect(r.right, 'панель в межах екрана').toBeLessThanOrEqual(vp.width + 1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'без горизонтальної прокрутки').toBe(true);
      };
      expect((await core(page)).game.wave?.active?.tasks['mia-carrier']?.outcome, 'справа про Мію відкрита').toBe('open');
      await look(PAUSE, 'pause');
      await page.locator('[data-act="task"][data-key="wave.ch1-home-departure.mia-carrier"]').first().scrollIntoViewIfNeeded();
      await act(page, 'task', 'wave.ch1-home-departure.mia-carrier');
      expect((await core(page)).game.wave?.active?.tasks['mia-carrier']?.outcome, 'справу закрито').toBe('done');
      await look(SETTLED, 'settled');
      expect([...seen].sort(), 'рівно два стани').toEqual([PAUSE, SETTLED].sort());
      expect(errors).toEqual([]);
    });
  });
}

test.describe('(b) негативний контроль: сторож вміє червоніти', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('підкинута цифра, дріб, <progress> і role=meter у панелі Mia — детектор їх знаходить', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    await toHome(page, 'Авто · Кішка');
    await expect(mia(page)).toHaveCount(1);
    expect(await miaViolations(page), 'чиста панель').toEqual([]);
    const poisons: [string, (el: Element) => void][] = [
      ['цифра в тексті', (el) => { el.append(document.createTextNode(' 3')); }],
      ['дріб у тексті', (el) => { el.append(document.createTextNode(' 3/5')); }],
      ['відсоток у тексті', (el) => { el.append(document.createTextNode(' 60%')); }],
      ['<progress>', (el) => { el.append(document.createElement('progress')); }],
      ['role=meter', (el) => { const d = document.createElement('div'); d.setAttribute('role', 'meter'); el.append(d); }],
      ['aria-valuenow', (el) => { el.setAttribute('aria-valuenow', '3'); }],
    ];
    for (const [name, poison] of poisons) {
      // Отруюємо, міряємо ТІЄЮ САМОЮ функцією й одразу відновлюємо вузол (Preact перемалює панель сам).
      const before = await mia(page).evaluate((el) => el.outerHTML);
      await mia(page).evaluate(poison);
      expect((await miaViolations(page)).length, `детектор мусить спрацювати на «${name}»`).toBeGreaterThan(0);
      await mia(page).evaluate((el, html) => { const t = document.createElement('template'); t.innerHTML = html; el.replaceWith(t.content.firstElementChild as Element); }, before);
      expect(await miaViolations(page), `після відновлення «${name}»`).toEqual([]);
    }
  });
});

test.describe('(c) велосипедист без кішки: панелі Mia немає', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('Mia не їде велосипедом — жодної панелі Mia на екрані подорожі', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    await panel(page).locator('[data-act="create"]', { hasText: 'Велосипед' }).first().click();
    await page.waitForTimeout(400);
    // Жодна кнопка створення не пропонує велосипед із кішкою — це вже перевірено до кліку, тут лише панель.
    await expect(mia(page)).toHaveCount(0);
    await act(page, 'complete', 'q.prologue-home-001');
    await expect(mia(page)).toHaveCount(0);
  });
  test('на екрані створення немає комбінації «Велосипед · Кішка»', async ({ page }) => {
    await open(page);
    const labels = await panel(page).locator('[data-act="create"]').allTextContents();
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.filter((l) => l.includes('Велосипед') && l.includes('Кішка'))).toEqual([]);
    expect(labels.filter((l) => l.includes('Авто') && l.includes('Кішка')).length).toBeGreaterThan(0);
  });
});
