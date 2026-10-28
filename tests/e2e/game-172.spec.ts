// GAME-172 «Живий кемпінг» · у справжньому браузері: (1) герой клавішами доходить до КОЖНОЇ зони табору; (2) 60 с: мешканці стоять лише на
// прохідних клітинках і не на цілях взаємодії, і справді ходять; (3) підійшов — почув репліку.
// Мутації (перевірено, див. PR): ворота східної стіни замуровані в build_camp_lake.py → тест (1) червоний; стоянка мешканця на тригері / стіні → (2) червоний;
// BARK_RANGE = 0 → (3) червоний.
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
const SPOTS = (MAP.layers.find((l) => l.name === 'objects')?.objects ?? []).filter((o) => o.type === 'trigger' || o.type === 'npc' || o.type === 'anchor');
const solid = (c: number, r: number): boolean => c < 0 || r < 0 || c >= MAP.width || r >= MAP.height || (WALLS[r * MAP.width + c] ?? 0) > 0;
const tile = (p: Pt): { c: number; r: number } => ({ c: Math.floor(p.x / TILE), r: Math.floor(p.y / TILE) });
const SPOT_TILES = new Set(SPOTS.map((s) => { const t = tile(s); return `${t.c},${t.r}`; }));

/** Якорі зон — ті самі, що в ambient.ts (ZONES); тут числами, щоб тест не імпортував код гри. Узгодженість з ZONES стереже ambient.test. */
const ZONE_ANCHORS: Record<string, { c: number; r: number }> = {
  'tents-old': { c: 1, r: 5 }, campfire: { c: 3, r: 5 }, reception: { c: 15, r: 6 }, sanitary: { c: 23, r: 6 }, shore: { c: 27, r: 8 },
  pier: { c: 35, r: 7 }, 'tents-south': { c: 4, r: 16 }, 'forest-path': { c: 19, r: 13 }, clearing: { c: 21, r: 18 },
};

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

test.describe('GAME-172 живий кемпінг', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('герой клавішами доходить до кожної зони табору (мапа більша, жодного замурованого виходу)', async ({ page }) => {
    test.setTimeout(240_000);
    await open(page);
    expect(MAP.width * MAP.height, 'мапа не в 2× більша за 20×12').toBeGreaterThanOrEqual(2 * 20 * 12);
    for (const [zone, anchor] of Object.entries(ZONE_ANCHORS)) {
      expect(await walkTo(page, anchor, 45_000), `зона ${zone}: герой не дійшов до (${anchor.c},${anchor.r})`).toBe(true);
    }
  });

  test('60 с: мешканці — лише на прохідних клітинках, не на цілях взаємодії, і справді ходять', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    const first = await probe(page);
    expect(first.residents.length, 'мешканців нема — тест нічого не доводить').toBeGreaterThanOrEqual(4);
    expect(first.residents.length).toBeLessThanOrEqual(6);
    // Знімки в самій сторінці (кожні 100 мс), щоб затримка протоколу не рвала ряд.
    const samples = await page.evaluate(() => new Promise<Resident[][]>((resolve) => {
      const out: Resident[][] = [];
      const read = (): Resident[] => JSON.parse(JSON.stringify((window as unknown as { __game: { probe: { residents: Resident[] } } }).__game.probe.residents)) as Resident[];
      const t0 = performance.now();
      const id = setInterval(() => {
        out.push(read());
        if (performance.now() - t0 >= 60_000) { clearInterval(id); resolve(out); }
      }, 100);
    }));
    expect(samples.length).toBeGreaterThan(300);
    const travelled = new Map<string, number>();
    const bad: string[] = [];
    samples.forEach((snap, i) => snap.forEach((r, j) => {
      const t = tile(r);
      if (solid(t.c, t.r)) bad.push(`${r.id} у стіні (${t.c},${t.r}) знімок ${i}`);
      if (SPOT_TILES.has(`${t.c},${t.r}`)) bad.push(`${r.id} на цілі взаємодії (${t.c},${t.r}) знімок ${i}`);
      const prev = i > 0 ? samples[i - 1]?.[j] : undefined;
      if (prev) travelled.set(r.id, (travelled.get(r.id) ?? 0) + Math.hypot(r.x - prev.x, r.y - prev.y) / TILE);
    }));
    expect(bad.slice(0, 5)).toEqual([]);
    const walkers = [...travelled.values()].filter((d) => d >= 3).length;
    console.log(`GAME-172 за 60 с пройшли (клітинок): ${[...travelled].map(([id, d]) => `${id} ${d.toFixed(1)}`).join(', ')}`);
    expect(walkers, 'за 60 с ходили менше ніж четверо мешканців').toBeGreaterThanOrEqual(4);
  });

  test('підійшов до мешканця — почув репліку (над головою, ключ amb.*)', async ({ page }) => {
    test.setTimeout(90_000);
    await open(page);
    expect((await probe(page)).barkCount).toBe(0);
    // Іде до найближчого мешканця, перепрокладаючи шлях, поки той не озветься.
    const deadline = Date.now() + 60_000;
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
    expect(heard, 'за 60 с жоден мешканець не озвався').not.toBeNull();
    expect(heard?.bark).toMatch(/^amb\.[a-z]+\.\d$/);
    expect(heard?.barkCount).toBeGreaterThanOrEqual(1);
  });
});

// Знімки для research/visual-audit (SHOTS=1): п'ять місць табору в обох орієнтаціях телефона, героя ведуть клавіші. У звичайному прогоні — пропуск.
const SHOT_SPOTS: [string, { c: number; r: number }][] = [['spawn', { c: 6, r: 5 }], ['reception', { c: 15, r: 6 }], ['pier', { c: 35, r: 7 }], ['tents-south', { c: 4, r: 16 }], ['clearing', { c: 21, r: 18 }]];
for (const [orient, viewport] of [['portrait', { width: 390, height: 844 }], ['landscape', { width: 844, height: 390 }]] as const) {
  test.describe(`знімки ${orient}`, () => {
    test.use({ viewport, deviceScaleFactor: 2 });
    test(`camp-* ${orient}`, async ({ page }) => {
      test.skip(process.env.SHOTS !== '1', 'лише SHOTS=1');
      test.setTimeout(240_000);
      await open(page);
      for (const [name, to] of SHOT_SPOTS) {
        await walkTo(page, to, 40_000);
        await page.waitForTimeout(600);
        await page.screenshot({ path: `research/visual-audit/camp-${name}-${orient}.png` });
      }
    });
  });
}

