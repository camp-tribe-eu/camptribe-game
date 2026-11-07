// GAME-263 · іконки речей впізнавані (≥ 2× тайла = 64 px) і крамниця без «газону» / «напівпрозорого» намету.
// 1) рюкзак і картка: піктограма ≥ 64 px, береться з нового атласу item_icons.png (хеш клітинки ≠ старій 16-px заглушці), 2) намет на полиці: його смуга не з крон —
// fadeBands у крамниці = 0 (в таборі > 0: крони дерев лишились), 3) підлога під наметом — дубова (тайл 13), не трава: піксель із мапи й тайлсету.
// Мутації: старий атлас у PackItemIcon (хеш збігається → червоніє), fade=true для всіх смуг (fadeBands у крамниці > 0), 1206 назад у ground (піксель зелений).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { g, readPng } from './png-read';
import { seedDay1 } from './day1-fixture';
import { stateHash } from '../../src/core/hash';

const SIZES = [{ name: 'portrait', width: 390, height: 844 }, { name: 'landscape', width: 932, height: 430 }] as const;
const SHOTS = process.env.SHOTS === '1';
const QUERY = '?seed=7&mapFirst=1';

/** Фікстура дня 1 + речі, що мають іконки в новому атласі (намет, спальник — із фікстури; ліхтар, документи, гаманець — додаємо). */
const WITH_ITEMS = (save: string): string => {
  const s = JSON.parse(save) as { sim: { game: { inventory: Record<string, number> } }; checksum: string };
  for (const id of ['item.lantern', 'item.documents', 'item.wallet', 'item.tent-trek']) s.sim.game.inventory[id] = 1;
  s.checksum = stateHash(s.sim as never);
  return JSON.stringify(s);
};

/** Хеш клітинки (w×h) PNG-аркуша з диска — незалежно від того, що малює сторінка. */
function cellHash(file: string, size: number, index: number): string {
  const png = readPng(file);
  const px: number[] = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const o = ((y * png.width) + index * size + x) * 4; px.push(g(png.rgba, o), g(png.rgba, o + 1), g(png.rgba, o + 2), g(png.rgba, o + 3)); }
  return createHash('sha1').update(Buffer.from(px)).digest('hex');
}

const OLD_ATLAS = JSON.parse(readFileSync('src/content/objective-icon-atlas.json', 'utf8')) as { size: number; cells: Record<string, number> };
const NEW_ATLAS = JSON.parse(readFileSync('src/content/item-icon-atlas.json', 'utf8')) as { size: number; cells: Record<string, number> };
const OLD_HASH: Record<string, string> = { tent: cellHash('assets/icons/objective_icons.png', 16, 0) };   // сіра зелена «грудка» 16×16 (клітинка 0 старого атласу)
void OLD_ATLAS;

for (const size of SIZES) {
  test(`рюкзак: іконки ≥ 64 px і не старі заглушки — ${size.name} ${size.width}×${size.height}`, async ({ browser }) => {
    test.setTimeout(240_000);
    const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    const page: Page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => { try { localStorage.setItem('camplife.settings.v1', JSON.stringify({ textScale: 100, language: 'uk', hintSeen: true })); } catch { /* сховища немає */ } });
    await seedDay1(page, QUERY, WITH_ITEMS);
    await page.locator('[data-ui="backpack-open"]').click();
    const panel = page.locator('[data-ui="backpack-panel"]');
    await expect(panel).toBeVisible();
    const icons = panel.locator('[data-ui="backpack-item"] [data-ui="bp-icon"]');
    const n = await icons.count();
    expect(n, 'у рюкзаку є речі').toBeGreaterThan(3);
    for (let i = 0; i < n; i++) {
      const b = await icons.nth(i).boundingBox();
      expect(b?.width ?? 0, `іконка ${i} ≥ 64 px`).toBeGreaterThanOrEqual(64);
      expect(b?.height ?? 0, `іконка ${i} ≥ 64 px заввишки`).toBeGreaterThanOrEqual(64);
    }
    // Нові іконки: намет, ліхтар, документи, гаманець — з атласу речей (клітинка існує, хеш ≠ старої 16-px «грудки»).
    for (const [id, key] of [['item.tent-trek', 'tent'], ['item.lantern', 'lantern'], ['item.documents', 'documents'], ['item.wallet', 'wallet']] as const) {
      const icon = panel.locator(`[data-ui="backpack-item"][data-id="${id}"] [data-ui="bp-icon"]`);
      await expect(icon, `${id}: іконка з нового атласу`).toHaveAttribute('data-icon', key);
      expect(await icon.evaluate((e) => getComputedStyle(e).backgroundImage), `${id}: тло — аркуш речей`).toContain('item_icons');
      const h = cellHash('assets/icons/item_icons.png', NEW_ATLAS.size, (NEW_ATLAS.cells[key] ?? -1));
      expect(h, `${key}: не старий малюнок`).not.toBe(OLD_HASH.tent);
      expect(h).not.toBe(cellHash('assets/icons/objective_icons.png', 16, OLD_ATLAS.cells[key] ?? 0));
    }
    if (SHOTS) await page.screenshot({ path: `research/game-263/after-backpack-${size.name}.png` });
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

test('крамниця: намет на полиці не з крон (fadeBands = 0), у таборі крони лишились', async ({ page }) => {
  const open = async (q: string): Promise<{ bands: number; fadeBands: number }> => {
    await page.goto(`/?${q}`);
    await page.waitForFunction(() => (window as unknown as { __game?: { probe: { ready: boolean } } }).__game?.probe.ready === true, null, { timeout: 30_000 });
    return page.evaluate(() => ({ ...(window as unknown as { __game: { probe: { canopy: { bands: number; fadeBands: number } } } }).__game.probe.canopy }));
  };
  const shop = await open('map=shop&noReveal=1');
  expect(shop.bands, 'у крамниці є смуги above (верх намету, полиць)').toBeGreaterThan(0);
  expect(shop.fadeBands, 'жодна смуга крамниці не тане над героєм').toBe(0);
  const camp = await open('');
  expect(camp.fadeBands, 'у таборі крони дерев лишились напівпрозорими над героєм').toBeGreaterThan(0);
});

test('крамниця: під наметом дубова підлога, а не трава (піксель)', async () => {
  const map = JSON.parse(readFileSync('public/maps/shop.tmj', 'utf8')) as { width: number; layers: { name: string; data?: number[] }[]; tilesets: { name: string; firstgid: number; image: string }[] };
  const ground = map.layers.find((l) => l.name === 'ground')?.data ?? [];
  const floor = map.tilesets.find((t) => t.name === 'home-floor') ?? { firstgid: -99, name: '', image: '' };
  const png = readPng('assets/tiles/home_floor.png');
  const floorPx = (gid: number): [number, number, number] => { const i = gid - floor.firstgid; const o = (16 * png.width + i * 32 + 16) * 4; return [g(png.rgba, o), g(png.rgba, o + 1), g(png.rgba, o + 2)]; };
  for (const r of [8, 9]) for (const c of [1, 2, 3]) {
    const gid = g(ground, r * map.width + c);
    expect(gid, `ground[${c},${r}] — тайл підлоги крамниці, не terrain`).toBeGreaterThanOrEqual(floor.firstgid);
    expect(gid).toBeLessThan(floor.firstgid + 2);
    const [R, G, B] = floorPx(gid);
    expect(G > R + 20 && G > B + 20, `піксель підлоги (${R},${G},${B}) не зелений`).toBe(false);
  }
});
