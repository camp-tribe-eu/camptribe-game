// GAME-32 / GAME-36 · пролог проходиться в браузері через екран «Подорож»: вибір персонажа, квести,
// розмова з Елізою, журнал — до кінця розділу. Кожна дія — справжній клік по кнопці, команда йде в ядро.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

interface Core { game: { campaignEnded: boolean; grants: string[]; player: { transportId: string } | null }; clock: { paused: boolean; minutes: number }; journal: { type: string }[] }
const core = (page: Page): Promise<Core> => page.evaluate(() => (window as unknown as { __game: { read: () => Core } }).__game.read());

async function open(page: Page, query = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/${query}`);
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { ready: boolean; saveLoaded: boolean } } }).__game?.probe.saveLoaded === true, null, { timeout: 30_000 });
  await page.locator('[data-touch="story"]').click();
  await expect(page.locator('[data-ui="story"]')).toBeVisible();
  return errors;
}

const panel = (page: Page) => page.locator('[data-ui="story"]');
/** Один крок проходу — лише клік. Немає кнопки — падіння з назвою кроку (GAME-36, негативний контроль). */
async function act(page: Page, kind: string, key = '', timeout = 5_000): Promise<void> {
  try {
    await panel(page).locator(`[data-act="${kind}"][data-key="${key}"]`).click({ timeout });
  } catch {
    throw new Error(`крок «${kind} ${key}»: кнопки немає на екрані подорожі`);
  }
}

/** Пролог велосипедистом із бічним квестом Елізи. Порядок — як гравець читає завдання. */
// ПРОХІД-START — між цими позначками лише кліки й клавіші, без тестового хука гри (перевіряє тест нижче).
async function playBikeProlog(page: Page): Promise<void> {
  await panel(page).locator('[data-act="create"]', { hasText: 'Велосипед' }).first().click();
  await act(page, 'visit', 'loc.home');
  await act(page, 'complete', 'q.st-001');
  await act(page, 'visit', 'loc.home');
  await act(page, 'complete', 'q.st-002');
  await act(page, 'visit', 'loc.shop');
  await act(page, 'pickup', 'item.tent');
  await act(page, 'pickup', 'item.sleeping-bag');
  await act(page, 'complete', 'q.st-003');
  await act(page, 'visit', 'loc.road');
  await act(page, 'complete', 'q.elise-bike-area.choice');
  await act(page, 'visit', 'loc.camp.lake');
  await act(page, 'talk', 'npc.elise');
  await expect(panel(page).locator('[data-ui="dialogue"]')).toBeVisible();
  await expect(panel(page).locator('[data-ui="actions"]')).toHaveCount(0);   // у розмові — лише відповіді
  await act(page, 'choose', 'dlg.elise-greeting.hello.c1');
  await act(page, 'continue');
  await act(page, 'choose', 'dlg.elise-greeting.spot.c1');
  await act(page, 'continue');
  await act(page, 'complete', 'q.elise-bike-area');
  await act(page, 'talk', 'npc.elise');
  await act(page, 'choose', 'dlg.elise-greeting.hello.c2');
  await act(page, 'choose', 'dlg.elise-greeting.spot.c1');
  await act(page, 'continue');
  await act(page, 'visit', 'loc.camp.lake');
  await act(page, 'pickup', 'item.firewood');
  await act(page, 'complete', 'q.st-005');
}
// ПРОХІД-END

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('пролог від вибору персонажа до кінця розділу — кліками, кожна дія доходить до ядра', async ({ page }) => {
  const errors = await open(page);
  await expect(panel(page).locator('[data-ui="create"]')).toBeVisible();
  expect((await core(page)).game.player).toBeNull();
  await playBikeProlog(page);
  await expect(panel(page).locator('[data-ui="ended"]')).toBeVisible();
  const c = await core(page);
  expect(c.game.campaignEnded).toBe(true);
  expect(c.game.player?.transportId).toBe('transport.bike');
  expect(c.game.grants).toEqual(expect.arrayContaining(['rw.q-elise-bike-area', 'rw.st-005']));
  // Журнал на екрані = журнал ядра, запис у запис.
  await panel(page).locator('[data-ui="journal"] summary').click();
  expect(await panel(page).locator('[data-ui="journal"] li').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.type)))
    .toEqual(c.journal.map((e) => e.type));
  expect(c.journal.length).toBeGreaterThan(15);
  expect(await panel(page).textContent()).not.toContain('⟦');      // жодного ключа без тексту
  expect(errors).toEqual([]);
});

test('на екрані подорожі світ на паузі; Escape і «Назад до мапи» закривають його й пускають час', async ({ page }) => {
  await open(page);
  expect((await core(page)).clock.paused).toBe(true);
  const m0 = (await core(page)).clock.minutes;
  await page.waitForTimeout(1500);
  expect((await core(page)).clock.minutes).toBe(m0);
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  expect((await core(page)).clock.paused).toBe(false);
  await page.locator('[data-touch="story"]').click();
  await page.locator('[data-ui="story-close"]').click();
  await expect(panel(page)).toHaveCount(0);
  await expect(page.locator('[data-ui="pause"]')).toHaveCount(0);   // не плутається з меню паузи
});

test('автівкою — без бічного квесту й без відповіді про велосипед, і так само до кінця розділу', async ({ page }) => {
  await open(page);
  await panel(page).locator('[data-act="create"]', { hasText: 'Авто' }).first().click();
  for (const [k, key] of [['visit', 'loc.home'], ['complete', 'q.st-001'], ['visit', 'loc.home'], ['complete', 'q.st-002'], ['visit', 'loc.shop'],
    ['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'], ['complete', 'q.st-003'], ['visit', 'loc.road']] as const) await act(page, k, key);
  await expect(panel(page).locator('[data-key="q.elise-bike-area.choice"]')).toHaveCount(0);
  await act(page, 'complete', 'q.st-004');
  await act(page, 'visit', 'loc.camp.lake');
  await act(page, 'talk', 'npc.elise');
  await expect(panel(page).locator('[data-key="dlg.elise-greeting.hello.c2"]')).toBeVisible();   // позитивний контроль
  await expect(panel(page).locator('[data-key="dlg.elise-greeting.hello.c1"]')).toHaveCount(0);
  await act(page, 'choose', 'dlg.elise-greeting.hello.c2');
  await act(page, 'choose', 'dlg.elise-greeting.spot.c1');
  await act(page, 'continue');
  // «Поставити намет» зарахувалось ще на прибутті (ST-005 уже був активний): повторне «Піти» — порожнє, його немає.
  await expect(panel(page).locator('[data-act="visit"][data-key="loc.camp.lake"]')).toHaveCount(0);
  await act(page, 'pickup', 'item.firewood');
  await act(page, 'complete', 'q.st-005');
  await expect(panel(page).locator('[data-ui="ended"]')).toBeVisible();
  const c = await core(page);
  expect(c.game.campaignEnded).toBe(true);
  expect(c.game.grants).not.toContain('rw.q-elise-bike-area');
  expect(await panel(page).textContent()).not.toContain('⟦');
});

test('затиснутий Enter не пробігає кроки: одне натискання — одна дія', async ({ page }) => {
  await open(page);
  await panel(page).locator('[data-act="create"]').first().focus();
  // Повторний down тієї самої клавіші Playwright шле з repeat: true — як автоповтор затиснутої клавіші.
  for (let i = 0; i < 4; i++) { await page.keyboard.down('Enter'); await page.waitForTimeout(30); }
  await page.keyboard.up('Enter');
  await page.waitForTimeout(50);
  expect((await core(page)).journal.length).toBe(1);   // лише «Початок подорожі»
});

test('закриття екрана подорожі повертає фокус на ☰', async ({ page }) => {
  await open(page);
  await page.locator('[data-ui="story-close"]').click();
  await expect(page.locator('[data-touch="story"]')).toBeFocused();
});

test('сейв після прологу: перезавантаження — і кінець розділу на місці', async ({ page }) => {
  await open(page);
  await playBikeProlog(page);
  await page.locator('[data-ui="story-close"]').click();
  await page.locator('[data-touch="pause"]').click();
  await page.locator('[data-ui="save"]').click();
  await expect(page.locator('[data-ui="status"]')).toBeVisible();
  await page.reload();
  await open(page);
  await expect(panel(page).locator('[data-ui="ended"]')).toBeVisible();
});

test('кожна ціль екрана подорожі ≥ 44×44 CSS px і нічого не вилазить за екран (псевдолокаль)', async ({ page }) => {
  await open(page, '?lang=pseudo');
  await panel(page).locator('[data-act="create"]').first().click();
  await act(page, 'visit', 'loc.home');
  await panel(page).locator('[data-ui="journal"] summary').click();
  const bad = await page.evaluate(() => {
    const out: string[] = [];
    const vw = window.innerWidth;
    for (const el of document.querySelectorAll<HTMLElement>('[data-ui="story"] *')) {
      const r = el.getBoundingClientRect();
      if (el.scrollWidth > el.clientWidth + 1 || r.left < -1 || r.right > vw + 1) out.push(`overflow ${el.tagName}.${el.className}`);
      if (el.matches('button, summary') && (r.width < 44 || r.height < 44)) out.push(`small ${el.tagName}[${el.dataset.act ?? el.dataset.ui ?? ''}] ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    return out;
  });
  expect(await panel(page).locator('button').count()).toBeGreaterThan(3);
  expect(bad).toEqual([]);
});

test('негативний контроль: прихована кнопка «Завершити» — прохід червоніє з назвою кроку', async ({ page }) => {
  await open(page, '?hideAct=complete');
  await expect(panel(page).locator('[data-act="create"]').first()).toBeVisible();  // екран живий, сховано лише «Завершити»
  await expect(playBikeProlog(page)).rejects.toThrow('крок «complete q.st-001»');
});

test('прохід керується лише кліками й клавішами: без приватного API гри та без імпортів ядра', () => {
  const src = readFileSync(new URL(import.meta.url), 'utf8');
  const imports = [...src.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
  expect(imports.sort()).toEqual(['@playwright/test', 'node:fs']);
  const flow = src.slice(src.indexOf('// ПРОХІД-START'), src.indexOf('// ПРОХІД-END'));
  expect(flow.length).toBeGreaterThan(500);                                      // позначки на місці, прохід між ними
  expect(flow).not.toMatch(/__game|evaluate\(|dispatch|bridge/);
  expect(src.slice(src.indexOf('async function act('), src.indexOf('// ПРОХІД-START'))).not.toMatch(/__game|evaluate\(/);
});
