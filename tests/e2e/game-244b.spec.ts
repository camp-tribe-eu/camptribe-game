// GAME-244 (ч.2) · рюкзак: знахідка → продаж на рецепції (гроші +ціна), подарунок сусіду поруч (дружба — як каже ядро), далеко від сусіда кнопки «Подарувати» немає.
// Стан — фікстура дня 1 (seedDay1) + по 2 шишки й ягід у рюкзаку. Обидві орієнтації: 390×844 і 932×430.
// Закон 1 (мутації з PR): «подарунок і далеко від сусіда» — giftId завжди Some; ціна ягід ≠ 50 — «гроші +ціна» червоніє.
import { expect, test, type Page } from '@playwright/test';
import { core, probe, route, routeXY, walk } from './chapter-driver';
import { stateHash } from '../../src/core/hash';
import { seedDay1 } from './day1-fixture';
import { giveGift, reactionOf } from '../../src/core/friendship';
import { readFileSync } from 'node:fs';

/** Вподобання з content/npcs.json (JSON з src/content у Node-ESM Playwright не імпортується — читаємо файл, як game-230). */
const PREFS: Record<string, { likes: string[]; dislikes: string[] }> = Object.fromEntries((JSON.parse(readFileSync(new URL('../../content/npcs.json', import.meta.url), 'utf8')) as { id: string; gifts?: { likes: string[]; dislikes: string[] } }[]).filter((n) => n.gifts).map((n) => [n.id, n.gifts as { likes: string[]; dislikes: string[] }]));
const CONE = 'item.pine-cone';
const BERRY = 'item.berries';
const WITH_FINDS = (save: string): string => {
  const s = JSON.parse(save) as { sim: { game: { inventory: Record<string, number> } }; checksum: string };
  s.sim.game.inventory[CONE] = 2; s.sim.game.inventory[BERRY] = 2;
  s.checksum = stateHash(s.sim as never);
  return JSON.stringify(s);
};
interface Friend { pts: Record<string, number>; gift: Record<string, number>; seen: string[] }
interface G { moneyCents: number; inventory: Record<string, number>; friend?: Friend }
const game = async (page: Page): Promise<G> => (await core(page)).game as unknown as G;
const SIZES = [{ name: 'portrait', width: 390, height: 844 }, { name: 'landscape', width: 932, height: 430 }] as const;

for (const size of SIZES) {
  test(`рюкзак ч.2: продаж знахідки, подарунок сусіду, далеко — без «Подарувати» — ${size.name} ${size.width}×${size.height}`, async ({ browser }) => {
    test.setTimeout(240_000);
    const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => { try { localStorage.setItem('camplife.settings.v1', JSON.stringify({ textScale: 100, language: 'uk', hintSeen: true })); } catch { /* сховища немає */ } });
    await seedDay1(page, '?seed=7&mapFirst=1', WITH_FINDS);
    const panel = page.locator('[data-ui="backpack-panel"]');
    const openBag = async (): Promise<void> => { await page.locator('[data-ui="backpack-open"]').click(); await expect(panel).toBeVisible(); };
    const closeBag = async (): Promise<void> => { await page.keyboard.press('Escape'); await expect(panel).toHaveCount(0); };

    // 1. Біля сусіда (у фікстурі дня 1 герой стоїть біля нього; інакше підходимо), що приймає дари: «Подарувати» → ядро міняє дружбу так, як каже giveGift, річ іде з рюкзака.
    const receivers = Object.keys(PREFS);
    const here = await probe(page) as unknown as { residents: { id: string; x: number; y: number }[] };
    const startNear = (await probe(page)).nearObject ?? '';
    const npc = receivers.includes(startNear) ? startNear : here.residents.map((r) => r.id).find((id) => receivers.includes(id));
    expect(npc, 'у таборі є сусід, що приймає дари').toBeTruthy();
    const id = npc as string;
    for (let attempt = 0; attempt < 6 && (await probe(page)).nearObject !== id; attempt++) {
      const p = await probe(page) as unknown as { playerX: number; playerY: number; residents: { id: string; x: number; y: number }[] };
      const r = p.residents.find((x) => x.id === id) as { x: number; y: number };
      await walk(page, routeXY('camp-lake', [p.playerX, p.playerY], r, false, id));
    }
    await expect.poll(async () => (await probe(page)).nearObject, { timeout: 8_000, message: `біля ${id}` }).toBe(id);
    await openBag();
    await expect(panel).toHaveAttribute('data-gift-to', id);
    const prefs = PREFS[id];
    const item = [CONE, BERRY].sort((a, b) => Number(reactionOf(prefs, b) === 'liked') - Number(reactionOf(prefs, a) === 'liked'))[0] as string;
    const before = await game(page);
    await page.locator(`[data-ui="backpack-gift"][data-id="${item}"]`).click();
    await expect.poll(async () => (await game(page)).friend?.gift[id], { message: 'ядро записало дар на сьогодні' }).toBeDefined();
    const after = await game(page);
    const day = after.friend?.gift[id] as number;
    expect(after.friend?.pts[id] ?? 0, 'дружба — як рахує ядро').toBe(giveGift(before.friend, id, reactionOf(prefs, item), day).pts[id] ?? 0);
    expect(after.inventory[item] ?? 0, 'подарунок пішов з рюкзака').toBe((before.inventory[item] ?? 0) - 1);
    expect(after.moneyCents, 'подарунок грошей не дає').toBe(before.moneyCents);
    // вдруге того ж дня тому ж сусіду — кнопок немає (ядро відмовляє).
    await expect(panel.locator('[data-ui="backpack-gift"]'), 'раз на день: кнопок немає').toHaveCount(0);
    await closeBag();

    // 2. Рецепція — далеко від сусіда: ціна знахідок видна, «Подарувати» немає; продаж ягоди → гроші +50, на одну менше.
    const at = await probe(page);
    await walk(page, route('camp-lake', [at.playerX, at.playerY], 'obj.sell'));
    await expect.poll(async () => (await probe(page)).nearObject, { timeout: 8_000 }).toBe('obj.sell');
    await openBag();
    await expect(panel).toHaveAttribute('data-gift-to', '');
    await expect(panel.locator(`[data-ui="backpack-item"][data-id="${BERRY}"] [data-ui="backpack-price"]`)).toHaveAttribute('data-cents', '50');
    await expect(panel.locator(`[data-ui="backpack-item"][data-id="${CONE}"] [data-ui="backpack-price"]`)).toHaveAttribute('data-cents', '20');
    await expect(panel.locator('[data-ui="backpack-gift-to"]')).toHaveCount(0);
    const m0 = (await game(page)).moneyCents;
    const berries0 = (await game(page)).inventory[BERRY] ?? 0;
    await expect(panel.locator('[data-ui="backpack-gift"]')).toHaveCount(0);
    await panel.locator(`[data-ui="backpack-sell"][data-id="${BERRY}"]`).click();
    await expect.poll(async () => (await game(page)).moneyCents, { message: 'гроші +ціна ягоди' }).toBe(m0 + 50);
    expect((await game(page)).inventory[BERRY] ?? 0, 'на одну ягоду менше').toBe(berries0 - 1);
    await closeBag();

    expect(errors).toEqual([]);
    await ctx.close();
  });
}
