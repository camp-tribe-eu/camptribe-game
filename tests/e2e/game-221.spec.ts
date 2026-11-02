// GAME-221 · балачка мешканців над головою НЕ зупиняє гру: бульбашка видна, герой далі рухається (позиція міняється під утримуваною клавішею),
// рамка розмови не відкривається. Обидві орієнтації телефона. Мутація (див. PR): updateBark ставить паузу/відкриває діалог → тест червоний.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

interface Pt { x: number; y: number }
interface Resident { id: string; x: number; y: number; moving: boolean }
interface Probe { ready: boolean; playerX: number; playerY: number; residents: Resident[]; bark: string | null; barkCount: number }
const probe = (page: Page): Promise<Probe> => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __game: { probe: Probe } }).__game.probe)) as Probe);

const TILE = 32;
interface TiledMap { width: number; height: number; layers: { name: string; data?: number[]; objects?: { name: string; type?: string; x: number; y: number }[] }[] }
const MAP = JSON.parse(readFileSync(new URL('../../public/maps/camp-lake.tmj', import.meta.url), 'utf8')) as TiledMap;
const WALLS = MAP.layers.find((l) => l.name === 'walls')?.data ?? [];
const solid = (c: number, r: number): boolean => c < 0 || r < 0 || c >= MAP.width || r >= MAP.height || (WALLS[r * MAP.width + c] ?? 0) > 0;
const tile = (p: Pt): { c: number; r: number } => ({ c: Math.floor(p.x / TILE), r: Math.floor(p.y / TILE) });


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

/** Повести героя клавішами до центру тайла `to`; `stop` — зупинитись раніше (напр. почув репліку). true — дійшов (або stop). */
async function walkTo(page: Page, to: { c: number; r: number }, maxMs: number, stop?: (p: Probe) => boolean): Promise<boolean> {
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
      if (stop?.(p)) return true;
      const { next } = nextStep(tile({ x: p.playerX, y: p.playerY }), to);
      const goal = next ?? to;
      const gx = (goal.c + 0.5) * TILE; const gy = (goal.r + 0.5) * TILE;
      const dx = gx - p.playerX; const dy = gy - p.playerY;
      if (!next && Math.abs(dx) < 4 && Math.abs(dy) < 4) return true;
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

const dialogueOpen = (page: Page): Promise<number> => page.locator('.ui-talk [data-ui="dialogue"]').count();

for (const [orient, viewport] of [['portrait', { width: 390, height: 844 }], ['landscape', { width: 844, height: 390 }]] as const) {
  test.describe(`GAME-221 балачка не зупиняє гру · ${orient}`, () => {
    test.use({ viewport });
    test('бульбашка видна — герой рухається, діалогу нема', async ({ page }) => {
      test.setTimeout(120_000);
      await open(page);
      const deadline = Date.now() + 70_000;
      let heard: Probe | null = null;
      while (Date.now() < deadline && !heard) {
        const p = await probe(page);
        const near = [...p.residents].sort((a, b) => Math.hypot(a.x - p.playerX, a.y - p.playerY) - Math.hypot(b.x - p.playerX, b.y - p.playerY))[0];
        if (!near) throw new Error('немає мешканців');
        const to = tile(near);
        if (!(await walkTo(page, solid(to.c, to.r) ? { c: 15, r: 6 } : to, 6_000, (q) => q.bark !== null))) continue;
        const q = await probe(page);
        if (q.bark !== null) heard = q;
      }
      expect(heard, 'жоден мешканець не озвався').not.toBeNull();
      // Бульбашка висить ~4 с: одразу тримаємо клавішу й міряємо зсув, поки вона ще видима.
      const before = await probe(page);
      expect(before.bark, 'бульбашки вже нема').not.toBeNull();
      if (process.env.G221_SHOT) await page.screenshot({ path: `${process.env.G221_SHOT}/chatter-${orient}.png` });
      let moved = 0;
      let bubbleSeen = true;
      for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp']) {
        await page.keyboard.down(key);
        await page.waitForTimeout(350);
        const mid = await probe(page);
        await page.keyboard.up(key);
        bubbleSeen = bubbleSeen && mid.bark !== null;
        moved = Math.max(moved, Math.hypot(mid.playerX - before.playerX, mid.playerY - before.playerY));
        if (moved >= 6) break;
      }
      expect(moved, `герой не зрушив (${moved.toFixed(1)} px) під час балачки`).toBeGreaterThanOrEqual(6);
      expect(bubbleSeen, 'бульбашка зникла до зсуву — тест не про те').toBe(true);
      expect(await dialogueOpen(page), 'відкрилась рамка розмови').toBe(0);
    });
  });
}
