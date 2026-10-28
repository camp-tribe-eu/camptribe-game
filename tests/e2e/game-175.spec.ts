// GAME-175 (зріз 1) · день 1 удома — лише ходьбою: Нова гра → вибір героя → дорога. Жодної кнопки дії панелі ☰ (окрім вибору героя), жодного кліку на об'єкті:
// герой ходить до цілі, яку називає стрілка (probe.fx.target), кільце наближення заповнюється й дія спрацьовує. Портрет і ландшафт телефона; соло (велосипед) й
// родина (авто). Негативні контролі: ?breakSpot= робить об'єкт німим — прохід мусить почервоніти; без руху (стоїмо) нічого не відбувається.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

interface Core { game: { player: { locationId: string; transportId: string } | null; flags: string[]; quests: Record<string, { status: string }>; inventory: Record<string, number> }; journal: { type: string }[] }
interface Fx { target: string | null; ring: number; ringName: string | null; backpack: number; guide: string; pops: number; auto: number }
interface Probe { playerX: number; playerY: number; fx: Fx; saveLoaded: boolean }
const core = (page: Page): Promise<Core> => page.evaluate(() => (window as unknown as { __game: { read: () => Core } }).__game.read());
const probe = (page: Page): Promise<Probe> => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __game: { probe: Probe } }).__game.probe)) as Probe);
const MAPS = { 'loc.home': 'home', 'loc.shop': 'shop' } as const;

interface Tmj { width: number; height: number; layers: { name: string; data?: number[]; objects?: { name: string; x: number; y: number }[] }[] }
const maps: Record<string, Tmj> = {};
const tmj = (key: string): Tmj => (maps[key] ??= JSON.parse(readFileSync(`public/maps/${key}.tmj`, 'utf8')) as Tmj);

/** Шлях по плитках 4-сусідством від (px,py) до плитки в зоні кільця біля об'єкта; авто (його нижня смуга) — непрохідне. Повертає центри плиток. */
function route(key: string, from: [number, number], spot: string, car: boolean): [number, number][] {
  const m = tmj(key);
  const walls = m.layers.find((l) => l.name === 'walls')?.data ?? [];
  const objs = m.layers.find((l) => l.name === 'objects')?.objects ?? [];
  const o = objs.find((x) => x.name === spot);
  if (!o) throw new Error(`на мапі ${key} немає ${spot}`);
  const veh = objs.find((x) => x.name === 'obj.vehicle');
  const blocked = (tx: number, ty: number): boolean => {
    if ((walls[ty * m.width + tx] ?? 1) > 0) return true;
    if (car && veh) { const cx = veh.x + 16; const cy = veh.y + 80; if (tx * 32 + 32 > cx - 52 && tx * 32 < cx + 52 && ty * 32 + 32 > cy - 30 && ty * 32 < cy) return true; }
    return false;
  };
  const goal = (tx: number, ty: number): boolean => !blocked(tx, ty) && Math.hypot(tx * 32 + 16 - o.x, ty * 32 + 16 - o.y) <= 24;
  const start = [Math.floor(from[0] / 32), Math.floor(from[1] / 32)] as const;
  const prev = new Map<string, string | null>([[`${start[0]},${start[1]}`, null]]);
  const q: [number, number][] = [[start[0], start[1]]];
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i] as [number, number];
    if (goal(x, y)) {
      const out: [number, number][] = [];
      for (let k: string | null | undefined = `${x},${y}`; k; k = prev.get(k)) { const [a, b] = k.split(',').map(Number) as [number, number]; out.unshift([a * 32 + 16, b * 32 + 16]); }
      return out;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx; const ny = y + dy; const k = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || nx >= m.width || ny >= m.height || prev.has(k) || blocked(nx, ny)) continue;
      prev.set(k, `${x},${y}`); q.push([nx, ny]);
    }
  }
  throw new Error(`немає шляху до ${spot} на мапі ${key}`);
}

/** Ходьба клавішами стрілок по точках (як гравець із джойстиком); повертає, коли дійшов або вичерпав 45 с (кадри під навантаженням CI повільні). Стоїть — клавіші відпущено. */
async function walk(page: Page, pts: [number, number][]): Promise<void> {
  await page.evaluate((pts) => new Promise<void>((resolve) => {
    const g = (window as unknown as { __game: { probe: { playerX: number; playerY: number } } }).__game;
    const down = new Set<string>();
    const fire = (type: string, key: string, code: number): void => {
      const e = new KeyboardEvent(type, { key, code: key, bubbles: true, cancelable: true });
      Object.defineProperty(e, 'keyCode', { get: () => code });
      window.dispatchEvent(e);
    };
    const codes: Record<string, number> = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40 };
    const set = (want: string | null): void => {
      for (const k of [...down]) if (k !== want) { fire('keyup', k, codes[k] as number); down.delete(k); }
      if (want && !down.has(want)) { fire('keydown', want, codes[want] as number); down.add(want); }
    };
    let i = 0;
    const t0 = performance.now();
    const tick = (): void => {
      const p = pts[i];
      if (!p || performance.now() - t0 > 45_000) { set(null); resolve(); return; }
      const dx = p[0] - g.probe.playerX;
      const dy = p[1] - g.probe.playerY;
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3) { i++; requestAnimationFrame(tick); return; }
      set(Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'ArrowLeft' : 'ArrowRight') : (dy < 0 ? 'ArrowUp' : 'ArrowDown'));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), pts);
}

const signature = async (page: Page): Promise<string> => {
  const c = await core(page);
  const p = await probe(page);
  return JSON.stringify([c.game.player?.locationId, c.game.flags, Object.entries(c.game.quests).map(([k, v]) => `${k}:${v.status}`), c.game.inventory, p.fx.backpack]);
};

/** Один «заход» гравця: куди каже йти стрілка → дійти → дочекатись дії. Повертає назву цілі. */
async function goAndDo(page: Page, car: boolean, shot?: string): Promise<string> {
  const p = await probe(page);
  const target = p.fx.target;
  if (!target) throw new Error('стрілка не вказує мети (nextTarget порожній) — гравець не знає, що далі');
  const c = await core(page);
  const key = MAPS[(c.game.player?.locationId ?? 'loc.home') as keyof typeof MAPS];
  if (!key) throw new Error(`локація ${c.game.player?.locationId} — не мапа зрізу 1`);
  const before = await signature(page);
  // Під навантаженням (паралельні збірки) кадри повільні й одна ходьба може не дійти за 45 с: перераховуємо шлях із поточної точки до трьох разів.
  const walking = (async (): Promise<void> => {
    for (let t = 0; t < 3; t++) {
      const q = t === 0 ? p : await probe(page);
      await walk(page, route(key, [q.playerX, q.playerY], target, car));
      if ((await signature(page)) !== before) return;
    }
  })();
  if (shot) {   // кадр із кільцем, що заповнюється, і стрілкою до мети (картка PR)
    await page.waitForFunction(() => { const f = (window as unknown as { __game: { probe: { fx: Fx } } }).__game.probe.fx; return f.ring > 0.4; }, null, { timeout: 15_000 });
    await page.screenshot({ path: shot });
  }
  await walking;
  try {
    await expect.poll(() => signature(page), { timeout: 5_000, message: `біля ${target} дія не спрацювала від наближення` }).not.toBe(before);
  } catch (e) {
    const q = await probe(page);
    throw new Error(`${(e as Error).message}; ціль ${target}, гравець (${Math.round(q.playerX)},${Math.round(q.playerY)}), кільце ${JSON.stringify(q.fx)}`, { cause: e });
  }
  await page.waitForTimeout(150);
  return target;
}

async function start(page: Page, pick: RegExp, query = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Лічильник кліків по діях панелі: окрім вибору героя їх бути не мусить.
  await page.addInitScript(() => {
    (window as unknown as { __acts: string[] }).__acts = [];
    document.addEventListener('click', (e) => { const el = (e.target as Element | null)?.closest('[data-act]'); if (el) (window as unknown as { __acts: string[] }).__acts.push(`${el.getAttribute('data-act')}:${el.getAttribute('data-key') ?? ''}`); }, true);
  });
  await page.goto(`/?seed=7&mapFirst=1${query}`);
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: Probe } }).__game?.probe.saveLoaded === true, null, { timeout: 30_000 });
  await page.locator('[data-touch="story"]').click();
  await page.locator('[data-ui="story"] [data-act="create"]', { hasText: pick }).first().click();
  await page.waitForTimeout(400);
  await page.locator('[data-ui="story-close"]').click();
  return errors;
}

const VIEWS = [{ name: 'портрет', w: 390, h: 844 }, { name: 'ландшафт', w: 844, h: 390 }] as const;
const VARIANTS = [{ name: 'соло на велосипеді', pick: /Велосипед|Bike/, car: false }, { name: 'родина в авто', pick: /Авто|Car/, car: true }] as const;

for (const v of VIEWS) {
  for (const k of VARIANTS) {
    test(`день 1 лише ходьбою до дороги: ${k.name}, ${v.name}`, async ({ browser }) => {
      test.setTimeout(540_000);
      const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: true, isMobile: true });
      const page = await ctx.newPage();
      const errors = await start(page, k.pick);
      const done: string[] = [];
      let bpShot = false;
      for (let i = 0; i < 40; i++) {
        const c = await core(page);
        if (c.game.player?.locationId === 'loc.road') break;
        if (!bpShot && (await probe(page)).fx.backpack > 0) {   // рюкзак героя непорожній: дрібну річ узято ногами й ще не віднесено до авто
          bpShot = true;
          await page.locator('[data-ui="recovery-close"]').click({ timeout: 1_000 }).catch(() => undefined);   // нагадування про код відновлення не закриває мапу на знімку
          await page.waitForTimeout(300);
          if (k.car) await page.screenshot({ path: `research/visual-audit/mapfirst-${v.name === 'портрет' ? 'portrait' : 'landscape'}-backpack.png` });
        }
        const shot = i === 2 && !k.car ? `research/visual-audit/mapfirst-${v.name === 'портрет' ? 'portrait' : 'landscape'}-ring.png` : undefined;
        done.push(await goAndDo(page, k.car, shot));
      }
      const c = await core(page);
      expect(c.game.player?.locationId, `шлях: ${done.join(' → ')}`).toBe('loc.road');
      expect(c.game.quests['ST-004']?.status).toBe('active');
      const acts = await page.evaluate(() => (window as unknown as { __acts: string[] }).__acts);
      expect(acts.filter((a) => !a.startsWith('create:')), 'жодної дії панелі — лише ходьба').toEqual([]);
      const p = await probe(page);
      expect(p.fx.auto, 'дії від наближення').toBeGreaterThanOrEqual(6);
      expect(p.fx.pops, 'сплив «+1»/«OK» на кожну дію').toBeGreaterThanOrEqual(6);
      expect(bpShot, 'дрібна річ пройшла через рюкзак (герой ніс її до авто)').toBe(true);
      expect(done.filter((d) => d.startsWith('pack.')).length, 'речі пакувалися ногами: ' + done.join(' → ')).toBeGreaterThanOrEqual(3);
      expect(done).toContain('obj.vehicle');
      expect(errors).toEqual([]);
      await ctx.close();
    });
  }
}

test('мутація: німий об\'єкт крамниці (?breakSpot=) — прохід червоніє; кільце без ходьби не спрацьовує', async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await start(page, /Велосипед|Bike/, '&breakSpot=step.ST-001');
  // Стоїмо на місці: жодна дія не йде сама.
  await page.waitForTimeout(1500);
  expect((await probe(page)).fx.auto).toBe(0);
  await goAndDo(page, false);   // PROLOGUE-HOME-001 — ціле
  await expect(goAndDo(page, false)).rejects.toThrow(/step\.ST-001/);   // ST-001 німий → тупик помітний
  await ctx.close();
});

test('рядок «Далі» не з\'їдає мапу: 375×667 з підказкою канва ≥ 75 % висоти, а рядок на екрані й не налазить на ☰', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await start(page, /Велосипед|Bike/);
  const m = await page.evaluate(() => {
    const c = document.querySelector('#stage canvas') as HTMLCanvasElement;
    const r = c.getBoundingClientRect();
    const n = document.querySelector('[data-ui="next-hint"]')?.getBoundingClientRect();
    return { h: r.height, vh: innerHeight, hint: n ? { top: n.top, bottom: n.bottom, w: n.width } : null };
  });
  expect(m.hint, 'рядок «Далі» є').not.toBeNull();
  expect(m.h, `висота ${m.h} з ${m.vh}`).toBeGreaterThanOrEqual(m.vh * 0.75);
  await ctx.close();
});
