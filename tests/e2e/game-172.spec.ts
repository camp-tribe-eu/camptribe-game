// GAME-172 «Живий кемпінг» · у справжньому браузері: (1) герой клавішами доходить до КОЖНОЇ зони табору; (2) 60 с: мешканці стоять лише на
// прохідних клітинках і не на цілях взаємодії, і справді ходять; (3) підійшов — почув репліку.
// Мутації (перевірено, див. PR): ворота східної стіни замуровані в build_camp_lake.py → тест (1) червоний; стоянка мешканця на тригері / стіні → (2) червоний;
// BARK_RANGE = 0 → (3) червоний.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { tileCenter, walkInPage } from './walk.helpers';

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

async function open(page: Page): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?seed=2');
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: { ready: boolean } } }).__game?.probe.ready === true, null, { timeout: 30_000 });
  expect(errors).toEqual([]);
}

test.describe('GAME-172 живий кемпінг', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('герой клавішами доходить до кожної зони табору (мапа більша, жодного замурованого виходу)', async ({ page }) => {
    test.setTimeout(240_000);
    await open(page);
    expect(MAP.width * MAP.height, 'мапа не в 2× більша за 20×12').toBeGreaterThanOrEqual(2 * 20 * 12);
    for (const [zone, anchor] of Object.entries(ZONE_ANCHORS)) {
      // GAME-313: ходьба — у сторінці по кадрах (walk.helpers.ts); при спливі страховки 45 с кидає помилку з назвою зони.
      await walkInPage(page, { label: `зона ${zone}: герой не дійшов до (${anchor.c},${anchor.r})`, to: tileCenter(anchor), until: [{ within: 5 }], maxMs: 45_000 });
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
    // GAME-313: іде до найближчого мешканця (ціль перераховується щокадру в сторінці), поки той не озветься; страховка 60 с — помилка, а не очікування.
    const heard = (await walkInPage<Probe>(page, { label: 'за 60 с жоден мешканець не озвався', toNearest: 'residents', until: [{ bark: true }], settle: false, maxMs: 60_000 })).at;
    expect(heard.bark).toMatch(/^amb\.[a-z]+\.\d$/);
    expect(heard.barkCount).toBeGreaterThanOrEqual(1);
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
        await walkInPage(page, { label: `знімок ${name}`, to: tileCenter(to), until: [{ within: 5 }], maxMs: 40_000 });
        await page.waitForTimeout(600);
        await page.screenshot({ path: `research/visual-audit/camp-${name}-${orient}.png` });
      }
    });
  });
}

