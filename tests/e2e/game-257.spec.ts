// GAME-257 · після вступу гра починається зі зборів (ST-003), а не з повтору прологу: вступ сам закрив PROLOGUE-HOME-001 / ST-001 / ST-002.
// Закон 1: контроль — без виклику біта вступу (introBeat) ці квести лишаються активними й тест червоніє.
import { expect, test } from '@playwright/test';
import { core } from './chapter-driver';
import { skipIntroToMorning, walkIntro } from './intro-walk';
import { waitGameReady } from './ready';

const PROLOGUE = ['PROLOGUE-HOME-001', 'ST-001', 'ST-002'] as const;

for (const how of ['повний вступ', 'пропуск вступу'] as const) {
  test(`${how}: світ починається зі ST-003, пролог закрито самим вступом, підказки про пролог немає`, async ({ page }) => {
    await page.goto('/?intro=1&seed=1');
    await waitGameReady(page);
    if (how === 'повний вступ') await walkIntro(page); else { await skipIntroToMorning(page); await page.locator('[data-ui="intro-skip"]').click(); }
    await expect(page.locator('[data-ui="intro"]')).toHaveCount(0);
    const c = await core(page);
    for (const q of PROLOGUE) expect(c.game.quests[q]?.status, `${q} має бути закрито вступом`).toBe('completed');
    expect(c.game.quests['ST-003']?.status, 'ST-003 (збори) активний').toBe('active');
    const active = Object.entries(c.game.quests).filter(([, v]) => v.status === 'active').map(([k]) => k);
    expect(active).toEqual(['ST-003']);
    // жодна підказка/панель не веде в «Вечір удома», «Одну вільну ніч», «План на одну ніч»
    const body = await page.locator('body').innerText();
    for (const t of ['Вечір удома', 'Одна вільна ніч', 'План на одну ніч', 'кухня — стіл з картою']) expect(body, `на екрані «${t}»`).not.toContain(t);
  });
}
