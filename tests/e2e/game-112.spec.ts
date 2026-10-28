// GAME-112 · родина йде за героєм ланцюжком (Victoria, потім Matthew), гравець керує одним героєм (George).
// Герой ходить СПРАВЖНІМИ натисканнями клавіш (як гравець); маршрут — по тайлах мапи (BFS по шару walls з public/maps/camp-lake.tmj).
// Мутації (кожна — червоний тест, перевірено; див. PR): findPath без стін; restTile без `avoid`; слідувачі не рухаються.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

interface Pt { x: number; y: number }
interface Probe { ready: boolean; playerX: number; playerY: number; nearObject: string | null; commandsSent: number; cameraScrollX: number; cameraScrollY: number; followers: Pt[] }
const probe = (page: Page): Promise<Probe> => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __game: { probe: Probe } }).__game.probe)) as Probe);

const TILE = 32;
/** N з картки: кожен із двох слідувачів на кінці 60 с ходьби — не далі стількох тайлів від героя (унітест на 3 слідувачах: ≤ 4,7; тут заміряно ≈ 3). */
const N_TILES = 4;
interface TiledMap { width: number; height: number; layers: { name: string; data?: number[]; objects?: { name: string; x: number; y: number }[] }[] }
const MAP = JSON.parse(readFileSync(new URL('../../public/maps/camp-lake.tmj', import.meta.url), 'utf8')) as TiledMap;
const WALLS = MAP.layers.find((l) => l.name === 'walls')?.data ?? [];
const SPOTS = MAP.layers.find((l) => l.name === 'objects')?.objects ?? [];
const solid = (c: number, r: number): boolean => c < 0 || r < 0 || c >= MAP.width || r >= MAP.height || (WALLS[r * MAP.width + c] ?? 0) > 0;
const tile = (p: Pt): { c: number; r: number } => ({ c: Math.floor(p.x / TILE), r: Math.floor(p.y / TILE) });

/** BFS по вільних тайлах: наступний тайл на шляху від `from` до `to` (null — вже там чи шляху немає); `len` — довжина шляху. */
function nextStep(from: { c: number; r: number }, to: { c: number; r: number }): { next: { c: number; r: number } | null; len: number } {
  const key = (c: number, r: number): number => r * MAP.width + c;
  const prev = new Map<number, number>([[key(from.c, from.r), -1]]);
  const q = [from];
  for (let i = 0; i < q.length; i++) {
    const t = q[i] as { c: number; r: number };
    if (t.c === to.c && t.r === to.r) {
      const path: number[] = [];
      for (let k = key(t.c, t.r); k >= 0; k = prev.get(k) ?? -1) path.unshift(k);
      const n = path[1];
      return { next: n === undefined ? null : { c: n % MAP.width, r: Math.floor(n / MAP.width) }, len: path.length - 1 };
    }
    for (const [dc, dr] of [[0, -1], [-1, 0], [0, 1], [1, 0]] as const) {
      const c = t.c + dc; const r = t.r + dr;
      if (solid(c, r) || prev.has(key(c, r))) continue;
      prev.set(key(c, r), key(t.c, t.r)); q.push({ c, r });
    }
  }
  return { next: null, len: -1 };
}

async function open(page: Page): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?seed=2');
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { ready: boolean } } }).__game?.probe.ready === true, null, { timeout: 30_000 });
  expect(errors).toEqual([]);
}

/** Повести героя клавішами до центру тайла `to` (по одній осі за раз — по центрах тайлів шляху). true — дійшов у межах `maxMs`. */
async function walkTo(page: Page, to: { c: number; r: number }, maxMs: number, onTick?: (p: Probe) => void): Promise<boolean> {
  const keys = { ArrowLeft: false, ArrowRight: false, ArrowUp: false, ArrowDown: false };
  const set = async (want: Partial<typeof keys>): Promise<void> => {
    for (const k of Object.keys(keys) as (keyof typeof keys)[]) {
      const on = want[k] === true;
      if (on !== keys[k]) { keys[k] = on; await (on ? page.keyboard.down(k) : page.keyboard.up(k)); }
    }
  };
  const start = Date.now();
  try {
    while (Date.now() - start < maxMs) {
      const p = await probe(page);
      onTick?.(p);
      const { next } = nextStep(tile({ x: p.playerX, y: p.playerY }), to);
      const goal = next ?? to;
      const gx = (goal.c + 0.5) * TILE; const gy = (goal.r + 0.5) * TILE;
      const dx = gx - p.playerX; const dy = gy - p.playerY;
      if (!next && Math.abs(dx) < 4 && Math.abs(dy) < 4) return true;
      // Крок у сусідній тайл: спершу вирівнюємо вісь ПОПЕРЕК руху по центру коридору (тіло 16 px не чіпляє кутів стін), потім ідемо вздовж.
      const vertical = next !== null && next.c === tile({ x: p.playerX, y: p.playerY }).c;
      const across = vertical ? dx : dy;
      const along = vertical ? dy : dx;
      const axis = Math.abs(across) > 3 ? across : along;
      const horizontalAxis = Math.abs(across) > 3 ? vertical : !vertical;
      await set(horizontalAxis ? { ArrowLeft: axis < 0, ArrowRight: axis > 0 } : { ArrowUp: axis < 0, ArrowDown: axis > 0 });
      await page.waitForTimeout(20);
    }
    return false;
  } finally { await set({}); }
}

test.describe('GAME-112 родина йде за героєм', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('60 с ходьби по мапі кемпінгу: слідувачі не в стінах і на кінці ≤ N тайлів від героя', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    const p0 = await probe(page);
    expect(p0.followers.length, 'слідувачів нема — тест нічого не доводить').toBe(2);
    // Маршрут: кути й далекі місця мапи, щоб ланцюжок обходив стіни (стіна x=10–11 між лівою й правою частинами, коридор рядка 5…).
    const legs = [{ c: 1, r: 1 }, { c: 8, r: 9 }, { c: 18, r: 1 }, { c: 18, r: 5 }, { c: 12, r: 5 }, { c: 1, r: 3 }, { c: 4, r: 8 }, { c: 17, r: 4 }];
    let inWall = 0;
    let maxGap = 0;
    let prev: Probe | null = null;
    const walked = { hero: 0, followers: [0, 0] };   // скільки пройшли (тайлів): без цього «стоїть на місці» теж проходило б
    const t0 = Date.now();
    for (let i = 0; Date.now() - t0 < 60_000; i++) {
      const to = legs[i % legs.length] as { c: number; r: number };
      await walkTo(page, to, 60_000 - (Date.now() - t0), (p) => {
        for (const f of p.followers) if (solid(tile(f).c, tile(f).r)) inWall++;
        if (prev) {
          walked.hero += Math.hypot(p.playerX - prev.playerX, p.playerY - prev.playerY) / TILE;
          p.followers.forEach((f, j) => { walked.followers[j] = (walked.followers[j] ?? 0) + Math.hypot(f.x - (prev?.followers[j]?.x ?? f.x), f.y - (prev?.followers[j]?.y ?? f.y)) / TILE; });
        }
        prev = p;
        maxGap = Math.max(maxGap, ...p.followers.map((f) => Math.hypot(f.x - p.playerX, f.y - p.playerY) / TILE));
      });
    }
    await page.waitForTimeout(3000);   // герой став: ланцюжок наздоганяє
    const end = await probe(page);
    const gaps = end.followers.map((f) => Math.hypot(f.x - end.playerX, f.y - end.playerY) / TILE);
    console.log(`GAME-112 60 с: відстані на кінці ${gaps.map((g) => g.toFixed(2)).join(', ')} тайлів (N=${N_TILES}), макс. за прохід ${maxGap.toFixed(2)}, у стіні ${inWall} вимірів`);
    expect(inWall, 'слідувач опинився в стіні').toBe(0);
    for (const g of gaps) expect(g).toBeLessThanOrEqual(N_TILES);
    console.log(`GAME-112 пройшли тайлів: герой ${walked.hero.toFixed(0)}, слідувачі ${walked.followers.map((w) => w.toFixed(0)).join(', ')}`);
    expect(walked.hero, 'герой майже не ходив — тест нічого не доводить').toBeGreaterThan(30);
    for (const w of walked.followers) expect(w, 'слідувач не ходив за героєм').toBeGreaterThan(walked.hero * 0.4);
  });

  test('цілі взаємодії поруч зі слідувачами: ніхто не стоїть на цілі, кнопка дії й тап працюють', async ({ page }) => {
    test.setTimeout(60_000);
    await open(page);
    const fire = SPOTS.find((s) => s.name === 'obj.campfire');
    if (!fire) throw new Error('obj.campfire is missing in the map');
    const spotTile = tile(fire);
    // Герой проходить ЧЕРЕЗ вогнище й стає за ним на 2 тайли (відстань, на якій слідувач зупиняється, — GAME-112 GAP): слідувач, що йде тим самим
    // шляхом, зупинився б саме на вогнищі — і не має цього робити. Потім герой вертається на тайл перед вогнищем (у зоні дії, 1,5 тайла).
    expect(await walkTo(page, { c: spotTile.c, r: spotTile.r - 1 }, 30_000), 'герой не дійшов над вогнище').toBe(true);
    expect(await walkTo(page, { c: spotTile.c, r: spotTile.r + 2 }, 30_000), 'герой не пройшов вогнище').toBe(true);
    await page.waitForTimeout(2500);
    for (const f of (await probe(page)).followers) expect(tile(f), 'слідувач став на ціль взаємодії').not.toEqual(spotTile);
    expect(await walkTo(page, { c: spotTile.c, r: spotTile.r + 1 }, 30_000), 'герой не дійшов до вогнища').toBe(true);
    await page.waitForTimeout(2500);   // слідувачі збираються навколо
    const p = await probe(page);
    expect(p.nearObject).toBe('obj.campfire');
    for (const f of p.followers) expect(tile(f), 'слідувач стоїть на цілі взаємодії').not.toEqual(spotTile);
    // Кнопка дії.
    const c0 = p.commandsSent;
    await page.keyboard.press('KeyE');
    await expect.poll(async () => (await probe(page)).commandsSent, { timeout: 5000, message: 'кнопка дії біля слідувачів не спрацювала' }).toBeGreaterThan(c0);
    // Тап по вогнищу на канві (не по DOM-кнопці): слідувачі не перехоплюють тап.
    await page.waitForTimeout(700);   // відкат засувки 400 мс
    const c1 = (await probe(page)).commandsSent;
    const cam = await probe(page);
    const k = await page.locator('#stage canvas').evaluate((el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, k: r.width / (el as HTMLCanvasElement).width }; });
    await page.mouse.click(k.left + (fire.x - cam.cameraScrollX) * k.k, k.top + (fire.y - 12 - cam.cameraScrollY) * k.k);
    await expect.poll(async () => (await probe(page)).commandsSent, { timeout: 5000, message: 'тап по цілі біля слідувачів не спрацював' }).toBeGreaterThan(c1);
  });
});
