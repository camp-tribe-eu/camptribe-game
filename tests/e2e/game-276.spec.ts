// GAME-276 · рюкзак: обмін із сусідом (Клер: 3 шишки → 1 ягода). Є речі поруч із нею → «Обміняти» → рюкзак змінився рівно так, як каже контент/ядро;
// речей замало → кнопки немає; вдруге того ж дня → кнопки немає. Обидві орієнтації: 390×844 і 932×430.
// Шишок вдвічі більше, ніж треба: друга кнопка зникає лише через «раз на день» у ядрі, а не через брак речей.
// Закон 1 (мутації з PR): ядро без перевірки «раз на день» → вдруге кнопка є → тест червоніє.
import { expect, test, type Page } from '@playwright/test';
import { core, probe, routeXY, walk } from './chapter-driver';
import { stateHash } from '../../src/core/hash';
import { seedDay1 } from './day1-fixture';
import { readFileSync } from 'node:fs';

interface Line { itemId: string; qty: number }
interface Offer { id: string; give: Line[]; get: Line[] }
const NPC = 'npc.claire';
const OFFER = ((JSON.parse(readFileSync(new URL('../../content/npcs.json', import.meta.url), 'utf8')) as { id: string; trades?: Offer[] }[]).find((n) => n.id === NPC)?.trades?.[0]) as Offer;
const GIVE = OFFER.give[0] as Line;
const GET = OFFER.get[0] as Line;
const WITH = (cones: number) => (save: string): string => {
  const s = JSON.parse(save) as { sim: { game: { inventory: Record<string, number> } }; checksum: string };
  s.sim.game.inventory = { ...Object.fromEntries(Object.entries(s.sim.game.inventory).filter(([k]) => k !== GET.itemId)), [GIVE.itemId]: cones };
  s.checksum = stateHash(s.sim as never);
  return JSON.stringify(s);
};
interface G { moneyCents: number; inventory: Record<string, number> }
const game = async (page: Page): Promise<G> => (await core(page)).game as unknown as G;
const SIZES = [{ name: 'portrait', width: 390, height: 844 }, { name: 'landscape', width: 932, height: 430 }] as const;

async function toNeighbour(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 6 && (await probe(page)).nearObject !== NPC; attempt++) {
    const p = await probe(page) as unknown as { playerX: number; playerY: number; residents: { id: string; x: number; y: number }[] };
    const r = p.residents.find((x) => x.id === NPC) as { x: number; y: number };
    await walk(page, routeXY('camp-lake', [p.playerX, p.playerY], r, false, NPC));
  }
  await expect.poll(async () => (await probe(page)).nearObject, { timeout: 8_000, message: `біля ${NPC}` }).toBe(NPC);
}

for (const size of SIZES) {
  for (const mode of ['with-items', 'no-items'] as const) {
    test(`рюкзак ч.3: обмін із сусідом (${mode}) — ${size.name} ${size.width}×${size.height}`, async ({ browser }) => {
      test.setTimeout(240_000);
      const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.addInitScript(() => { try { localStorage.setItem('camplife.settings.v1', JSON.stringify({ textScale: 100, language: 'uk', hintSeen: true })); } catch { /* сховища немає */ } });
      await seedDay1(page, '?seed=7&mapFirst=1', WITH(mode === 'with-items' ? GIVE.qty * 2 : GIVE.qty - 1));
      const panel = page.locator('[data-ui="backpack-panel"]');
      await toNeighbour(page);
      await page.locator('[data-ui="backpack-open"]').click();
      await expect(panel).toBeVisible();
      const offer = panel.locator(`[data-ui="backpack-trade"][data-id="${OFFER.id}"]`);
      await expect(offer, 'пропозицію сусіда видно').toHaveCount(1);
      const doBtn = panel.locator('[data-ui="backpack-trade-do"]');
      if (mode === 'no-items') {
        await expect(offer).toHaveAttribute('data-can', 'no');
        await expect(doBtn, 'речей замало — кнопки немає').toHaveCount(0);
      } else {
        await expect(offer).toHaveAttribute('data-can', 'yes');
        const before = await game(page);
        await doBtn.click();
        await expect.poll(async () => (await game(page)).inventory[GET.itemId] ?? 0, { message: 'отримано' }).toBe((before.inventory[GET.itemId] ?? 0) + GET.qty);
        const after = await game(page);
        expect(after.inventory[GIVE.itemId] ?? 0, 'віддане пішло з рюкзака').toBe((before.inventory[GIVE.itemId] ?? 0) - GIVE.qty);
        expect(after.moneyCents, 'обмін грошей не дає').toBe(before.moneyCents);
        await expect(offer).toHaveAttribute('data-can', 'no');
        await expect(doBtn, 'раз на день: кнопки немає').toHaveCount(0);
      }
      expect(errors).toEqual([]);
      await ctx.close();
    });
  }
}
