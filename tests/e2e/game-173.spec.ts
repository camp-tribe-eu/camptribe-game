// GAME-173 · родина живе, а не марширує. Герой керується СПРАВЖНІМИ натисканнями клавіш (як гравець); перевіряємо те, що бачить гравець:
// 1) у русі — вільний стрій: двоє слідувачів по різні боки від лінії руху, а не гуськом;
// 2) герой стоїть 10 с → кожен на СВОЇЙ точці дозвілля (незалежний список тайлів нижче, не з коду гри), жодних двох на одному тайлі;
// 3) не в стінах, не на цілях взаємодії; 4) герой рушає — родина вертається до героя.
// Мутації (кожна — червоний тест, перевірено; див. PR): «завжди слідувати» (немає розкладу по точках); слот без напрямку (знов гуськом).
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

interface Pt { x: number; y: number }
interface Probe { ready: boolean; playerX: number; playerY: number; followers: Pt[]; leisure: ({ kind: string; c: number; r: number } | null)[] }
const probe = (page: Page): Promise<Probe> => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __game: { probe: Probe } }).__game.probe)) as Probe);

const TILE = 32;
/** Незалежний від коду гри список точок дозвілля мапи кемпінгу (c,r): вогнище ×3, берег, намет, лавка (стара галявина). */
const LEISURE_TILES = new Set(['2,4', '4,4', '3,5', '8,9', '6,4', '8,6', '14,7', '26,8', '20,18']);   // GAME-172: + лавка біля рецепції, берег біля води, лавка на лісовій галявині
interface TiledMap { width: number; height: number; layers: { name: string; data?: number[]; objects?: { name: string; type?: string; x: number; y: number }[] }[] }
const MAP = JSON.parse(readFileSync(new URL('../../public/maps/camp-lake.tmj', import.meta.url), 'utf8')) as TiledMap;
const WALLS = MAP.layers.find((l) => l.name === 'walls')?.data ?? [];
const TARGETS = new Set((MAP.layers.find((l) => l.name === 'objects')?.objects ?? []).filter((o) => !o.name.startsWith('s') && o.type !== 'leisure').map((o) => `${Math.floor(o.x / TILE)},${Math.floor(o.y / TILE)}`));
const inWall = (p: Pt): boolean => { const c = Math.floor(p.x / TILE); const r = Math.floor(p.y / TILE); return c < 0 || r < 0 || c >= MAP.width || r >= MAP.height || (WALLS[r * MAP.width + c] ?? 0) > 0; };
const key = (p: Pt): string => `${Math.floor(p.x / TILE)},${Math.floor(p.y / TILE)}`;
const SHOTS = process.env.SHOTS === '1';

async function open(page: Page): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?seed=2');
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { ready: boolean } } }).__game?.probe.ready === true, null, { timeout: 30_000 });
  expect(errors).toEqual([]);
}

/** Тримати клавішу `ms` мс, збираючи виміри кожні ~50 мс. */
async function hold(page: Page, k: string, ms: number, each: (p: Probe) => void): Promise<void> {
  await page.keyboard.down(k);
  try {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { each(await probe(page)); await page.waitForTimeout(50); }
  } finally { await page.keyboard.up(k); }
}

test.describe('GAME-173 родина живе, а не марширує', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('у русі — вільний стрій: слідувачі по різні боки від лінії руху, а не гуськом', async ({ page }) => {
    test.setTimeout(60_000);
    await open(page);
    await hold(page, 'ArrowRight', 800, () => {});
    // Біля цілей взаємодії слот зсувається (слідувач не стає на ціль), тож вимірюємо ВЕСЬ перехід: чи був момент строю клином — по різні боки від лінії руху.
    let wedges = 0;
    let samples = 0;
    let wall = 0;
    await hold(page, 'ArrowLeft', 2000, (p) => {   // 2 с ≈ 8 тайлів уздовж рядка 5
      samples++;
      for (const f of p.followers) if (inWall(f)) wall++;
      const l = p.followers.map((f) => f.y - p.playerY);
      if (l.length === 2 && l.every((v) => Math.abs(v) >= 20) && Math.sign(l[0] as number) * Math.sign(l[1] as number) < 0) wedges++;
    });
    console.log(`GAME-173 стрій у русі: ${samples} вимірів, клин у ${wedges} вимірах`);
    expect(wedges, 'слідувачі весь час гуськом: ні разу по різні боки від лінії руху').toBeGreaterThan(0);
    expect(wall, 'слідувач у стіні').toBe(0);
  });

  test('герой стоїть 10 с: кожен на своїй точці дозвілля, не на цілях і не в стінах; рушив — родина вертається', async ({ page }) => {
    test.setTimeout(90_000);
    await open(page);
    const bad = { wall: 0, target: 0 };
    let shot = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 10_000) {
      const p = await probe(page);
      for (const f of p.followers) if (inWall(f)) bad.wall++;
      if (SHOTS && !shot && Date.now() - t0 > 4800) { shot = true; await page.screenshot({ path: 'research/visual-audit/family-walking-to-spots.png' }); }
      await page.waitForTimeout(100);
    }
    const p = await probe(page);
    const tiles = p.followers.map(key);
    console.log(`GAME-173 10 с стоянки: слідувачі на тайлах ${tiles.join(' | ')}, вид ${p.leisure.map((l) => l?.kind ?? '-').join(', ')}`);
    expect(p.followers.length, 'слідувачів нема — тест нічого не доводить').toBe(2);
    for (const t of tiles) expect(LEISURE_TILES.has(t), `тайл ${t} — не точка дозвілля`).toBe(true);
    expect(new Set(tiles).size, 'двоє на одному тайлі').toBe(tiles.length);
    for (const l of p.leisure) expect(l, 'слідувач не дійшов до своєї точки').not.toBeNull();
    // Стоять рівно на центрі своєї точки (розклад завершено, а не «мимохідь»).
    for (const f of p.followers) { expect(Math.abs(((f.x / TILE) % 1) - 0.5)).toBeLessThan(0.05); expect(Math.abs(((f.y / TILE) % 1) - 0.5)).toBeLessThan(0.05); }
    for (const t of tiles) if (TARGETS.has(t)) bad.target++;
    expect(bad.wall, 'слідувач у стіні').toBe(0);
    expect(bad.target, 'слідувач на цілі взаємодії').toBe(0);
    if (SHOTS) await page.screenshot({ path: 'research/visual-audit/family-idle.png' });
    // Герой рушає: за 3 с родина вже не на точках дозвілля і поруч із героєм.
    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(400);
    await page.keyboard.up('ArrowDown');
    await page.waitForTimeout(3000);
    const e = await probe(page);
    for (const l of e.leisure) expect(l, 'слідувач лишився на точці, хоч герой рушив').toBeNull();
    for (const f of e.followers) { expect(Math.hypot(f.x - e.playerX, f.y - e.playerY) / TILE, 'родина не повернулась до героя').toBeLessThanOrEqual(4); expect(inWall(f)).toBe(false); }
  });
});
