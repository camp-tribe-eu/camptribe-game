// GAME-202/203 · спільний приїзд у табір для e2e родини: день 1 кнопками панелі (не цей зріз), далі перезавантаження з ?mapFirst=1 — справжня гра на мапі
// (автозбереження підхоплює табір). Той самий шлях, що в game-189.spec (там — своя копія).
import { expect, type Page } from '@playwright/test';
import { core } from './chapter-driver';
import { waitGameReady } from './ready';

export const CAMP = 'loc.camp.lake';
const SETTINGS_KEY = 'camplife.settings.v1';
const panel = (page: Page) => page.locator('.ui-story');
async function act(page: Page, kind: string, key = ''): Promise<void> {
  await panel(page).locator(`[data-act="${kind}"][data-key="${key}"]`).click({ timeout: 5_000 });
  await page.waitForTimeout(400);
  if (kind === 'visit' && (key === 'loc.road' || key === 'loc.camp.lake')) {
    const dlg = panel(page).locator('[data-ui="dialogue"]');
    for (let i = 0; i < 6 && await dlg.isVisible({ timeout: 400 }).catch(() => false); i++) { await dlg.locator('[data-act]').last().click(); await page.waitForTimeout(400); }
  }
}
/** Приїхати в табір (день 1, велосипед, seed 7) і перезавантажитись у справжню гру на мапі (`extra` — додаткові перемикачі e2e, напр. `&tentAlone=1`). */
export async function arriveInCamp(page: Page, extra = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(([k]) => { try { localStorage.setItem(k as string, JSON.stringify({ textScale: 100, language: 'uk', hintSeen: true })); } catch { /* сховища немає */ } }, [SETTINGS_KEY] as const);
  await page.goto('/?seed=7');
  await waitGameReady(page);
  await page.locator('[data-touch="story"]').click();
  await panel(page).locator('[data-act="create"]', { hasText: /Велосипед|Bike/ }).first().click();
  await page.waitForTimeout(400);
  for (const [k, key] of [['complete', 'q.prologue-home-001'], ['complete', 'q.st-001'], ['complete', 'q.st-002'], ['visit', 'loc.shop'], ['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'], ['complete', 'q.st-003'],
    ['visit', 'loc.home'], ['complete', 'q.ch1-home-001'], ['visit', 'loc.road'], ['complete', 'q.st-004'], ['visit', 'loc.camp.lake']] as const) await act(page, k, key);
  expect((await core(page)).game.player?.locationId).toBe(CAMP);
  await page.waitForTimeout(600);
  await page.goto(`/?seed=7&mapFirst=1${extra}`);
  await waitGameReady(page);
  await page.locator('[data-ui="recovery-close"]').click({ timeout: 800 }).catch(() => undefined);
  expect((await core(page)).game.player?.locationId, 'сейв підхопився: гравець у таборі').toBe(CAMP);
  return errors;
}
/** Наслідок справи живої чи минулої хвилі приїзду. */
export async function taskOutcome(page: Page, task: string): Promise<string> {
  const w = (await core(page)).game.wave as { active: { tasks: Record<string, { outcome: string }> } | null; past: Record<string, Record<string, string>> } | undefined;
  return w?.active?.tasks[task]?.outcome ?? w?.past['wave.ch1-day1-arrival']?.[task] ?? 'none';
}
