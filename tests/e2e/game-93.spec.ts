// GAME-93 · графіка LPC на живій сцені: ходьба в чотири боки (кадр змінюється, стоїть — кадр спокою), 3/4-глибина
// (позаду намету — дах закриває персонажа, перед наметом — ні), мапа з тайлами 32 px.
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
/** Розмір мапи кемпінгу, px (GAME-172: 40×24 клітинки по 32 — було 640×384); з файлу мапи, а не числом у тесті. */
const CAMP = JSON.parse(readFileSync(new URL('../../public/maps/camp-lake.tmj', import.meta.url), 'utf8')) as { width: number; height: number; tilewidth: number; tileheight: number };
const CAMP_WALLS = (JSON.parse(readFileSync(new URL('../../public/maps/camp-lake.tmj', import.meta.url), 'utf8')) as { layers: { name: string; data?: number[] }[] }).layers.find((l) => l.name === 'walls')?.data ?? [];
/** Скільки пікселів герой пройде з (x, y) у бік dir до першої стіни — рахується з шару walls самої мапи (по осі центра героя: вгору/вниз — стовпцем, вліво/вправо — рядком). */
function freeRun(dir: 'up' | 'left' | 'down' | 'right', x: number, y: number): number {
  const T = CAMP.tilewidth;
  const horizontal = dir === 'left' || dir === 'right';
  const step = dir === 'down' || dir === 'right' ? 1 : -1;
  let c = Math.floor(x / T);
  let r = Math.floor(y / T);
  const wall = (cc: number, rr: number): boolean => CAMP_WALLS[rr * CAMP.width + cc] !== 0;
  let tiles = 0;
  if (horizontal) while (c + step >= 0 && c + step < CAMP.width && !wall(c + step, r)) { c += step; tiles++; }
  else while (r + step >= 0 && r + step < CAMP.height && !wall(c, r + step)) { r += step; tiles++; }
  const off = (horizontal ? x : y) % T;
  return tiles * T + (step === 1 ? T - off : off);
}
const MAP_W = CAMP.width * CAMP.tilewidth;
const MAP_H = CAMP.height * CAMP.tileheight;

type Dir = 'up' | 'left' | 'down' | 'right';
interface Probe {
  ready: boolean; playerX: number; playerY: number; playerFrame: number; playerDir: Dir; playerMoving: boolean;
  playerDepth: number; coveredTiles: number; behindTiles: number; cameraScrollX: number; cameraScrollY: number;
}
const ROW: Record<Dir, number> = { up: 0, left: 1, down: 2, right: 3 };   // рядки листа LPC
const COLS = 9;

const probe = (page: Page): Promise<Probe> => page.evaluate(() => ({ ...(window as unknown as { __game: { probe: Probe } }).__game.probe }));

async function open(page: Page): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { __game?: { probe: Probe } }).__game?.probe.ready === true, null, { timeout: 30_000 });
  expect(errors).toEqual([]);
}

/** Тримає клавішу, доки умова не справдиться (межа maxMs), і повертає всі кадри, що пройшли за цей час. */
async function hold(page: Page, key: string, until: (p: Probe) => boolean, maxMs = 10_000): Promise<{ end: Probe; seen: Probe[] }> {
  const seen: Probe[] = [];
  await page.keyboard.down(key);
  const start = Date.now();
  let p = await probe(page);
  seen.push(p);
  while (!until(p) && Date.now() - start < maxMs) { await page.waitForTimeout(16); p = await probe(page); seen.push(p); }
  await page.keyboard.up(key);
  await page.waitForTimeout(250);   // гасіння швидкості й зупинка анімації
  return { end: await probe(page), seen };
}

/** GAME-313: хід до координати ВСЕРЕДИНІ сторінки (rAF): клавіша тримається, поки герой по осі не в межах tol від мети, і відпускається в тому самому кадрі; якщо інерція
 *  занесла далі — тиснемо назад. Кінець — коли герой завмер (x, y не змінюються 10 кадрів поспіль, анімації нема) і стоїть у межах tol; повертає той самий кадр. Межа 10 с — страховка. */
async function steer(page: Page, axis: 'x' | 'y', target: number, tol = 6): Promise<Probe> {
  const r = await page.evaluate(({ axis, target, tol }) => new Promise<Probe | null>((resolve) => {
    const g = (window as unknown as { __game: { probe: Probe } }).__game.probe;
    const codes: Record<string, number> = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40 };
    let held: string | null = null;
    const fire = (type: string, k: string): void => {
      const e = new KeyboardEvent(type, { key: k, code: k, bubbles: true, cancelable: true });
      Object.defineProperty(e, 'keyCode', { get: () => codes[k] });
      window.dispatchEvent(e);
    };
    const set = (want: string | null): void => {
      if (held === want) return;
      if (held) fire('keyup', held);
      held = want;
      if (want) fire('keydown', want);
    };
    const deadline = performance.now() + 10_000;
    let lastX = Number.NaN; let lastY = Number.NaN; let same = 0;
    const tick = (): void => {
      const err = target - (axis === 'x' ? g.playerX : g.playerY);
      set(Math.abs(err) <= tol ? null : axis === 'x' ? (err < 0 ? 'ArrowLeft' : 'ArrowRight') : (err < 0 ? 'ArrowUp' : 'ArrowDown'));
      same = held === null && g.playerX === lastX && g.playerY === lastY && !g.playerMoving ? same + 1 : 0;
      lastX = g.playerX; lastY = g.playerY;
      if (same >= 10) return resolve({ ...g });
      if (performance.now() > deadline) { set(null); return resolve(null); }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), { axis, target, tol });
  if (!r) throw new Error(`герой не дійшов до ${axis}=${target} за 10 с: ${JSON.stringify(await probe(page))}`);
  return r;
}

test.describe('LPC на сцені (десктоп 1280×800)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('на старті персонаж стоїть обличчям до гравця: кадр спокою вниз, анімація не грає', async ({ page }) => {
    await open(page);
    const p = await probe(page);
    expect(p.playerDir).toBe('down');
    expect(p.playerFrame).toBe(ROW.down * COLS);
    expect(p.playerMoving).toBe(false);
  });

  for (const [key, dir, axis, sign] of [['ArrowDown', 'down', 'y', 1], ['ArrowUp', 'up', 'y', -1], ['ArrowLeft', 'left', 'x', -1], ['ArrowRight', 'right', 'x', 1]] as const) {
    test(`ходьба ${dir}: кадр змінюється в рядку свого напрямку, відпустив — кадр спокою`, async ({ page }) => {
      await open(page);
      let a = await probe(page);
      // GAME-313: вертикальна ходьба — з вільного місця з довгим ходом (довжину міряємо з шару walls мапи). Раніше `down` ішов від спавну (≈170 px до стіни) і на
      // завантаженому CI анімація не встигала зіграти 3 кадри до упору в стіну («2 кадри»), а `up` починав де закінчив `down`.
      // Тепер: стаємо в коридор стовпців 8–9 (x 275–305 з 256–320, рядки 1–10, 10 клітинок завширшки 2 — інерція зупинки ≈40 px його не псує), йдемо в його кінець
      // і лише потім — у бік, що перевіряється: ≥ 250 px ходу до стіни.
      if (axis === 'y') {
        const need = 250;
        const to = dir as 'up' | 'down';
        const inLane = (p: Probe): boolean => p.playerX >= 275 && p.playerX <= 305;
        // Умова, а не час: повторюємо, доки герой не стане де треба (завантажена машина може не дійти за одну спробу).
        for (let i = 0; i < 6; i++) {
          a = await probe(page);
          if (inLane(a) && freeRun(to, a.playerX, a.playerY) >= need + 20) break;
          if (!inLane(a)) await hold(page, a.playerX < 275 ? 'ArrowRight' : 'ArrowLeft', (p) => (a.playerX < 275 ? p.playerX >= 275 : p.playerX <= 305), 5_000);
          else await hold(page, to === 'down' ? 'ArrowUp' : 'ArrowDown', (p) => freeRun(to, p.playerX, p.playerY) >= need + 20, 5_000);
        }
        a = await probe(page);
        expect(inLane(a), `${dir}: герой у коридорі ${a.playerX},${a.playerY}`).toBe(true);
        expect(freeRun(to, a.playerX, a.playerY), `${dir}: є куди йти (з мапи) ${a.playerX},${a.playerY}`).toBeGreaterThanOrEqual(need);
      }
      // Так само для горизонталі: ряд 7 і сусідні 6–8 (x 0–350, y 200–280) вільні без стін; стаємо туди зі спавну (вниз — у смугу рядків 6–8), потім зсуваємося в бік, ПРОТИЛЕЖНИЙ
      // до перевіреного, доки з карти не буде ≥ 250 px ходу (+20 на інерцію) — інакше герой міг упертись у стіну раніше, ніж зіграє 3 кадри.
      if (axis === 'x') {
        const need = 250;
        const to = dir as 'left' | 'right';
        const inBand = (p: Probe): boolean => p.playerY >= 200 && p.playerY <= 280;
        // Умова, а не час: повторюємо, доки герой не стане де треба.
        for (let i = 0; i < 8; i++) {
          a = await probe(page);
          if (inBand(a) && freeRun(to, a.playerX, a.playerY) >= need + 20) break;
          if (!inBand(a)) await hold(page, a.playerY < 200 ? 'ArrowDown' : 'ArrowUp', (p) => (a.playerY < 200 ? p.playerY >= 215 : p.playerY <= 265), 5_000);
          else await hold(page, to === 'left' ? 'ArrowRight' : 'ArrowLeft', (p) => freeRun(to, p.playerX, p.playerY) >= need + 20, 5_000);
        }
        a = await probe(page);
        expect(inBand(a), `${dir}: герой у смузі вільних рядків ${a.playerX},${a.playerY}`).toBe(true);
        expect(freeRun(to, a.playerX, a.playerY), `${dir}: є куди йти (з мапи) ${a.playerX},${a.playerY}`).toBeGreaterThanOrEqual(need);
      }
      // GAME-298: раніше кадри збирались опитуванням probe із Node (кожен виклик — окремий обмін із браузером, під навантаженням 100+ мс), тож за ті самі «три кадри ходьби»
      // набиралось 3 зрізи, а не кадрів гри: «анімація грала» червоніла (14 з 20 при --repeat-each 20 --workers 4). Тепер зрізи — події кадру (rAF) всередині сторінки:
      // кожен показаний кадр сцени — рівно один зріз, скільки б часу це не забрало; межа 10 с — страховка від вічного циклу, не очікування.
      await page.keyboard.down(key);
      const seen = await page.evaluate(({ axis, sign, startAt }) => new Promise<Probe[]>((resolve) => {
        const g = (window as unknown as { __game: { probe: Probe } }).__game.probe;
        const out: Probe[] = [];
        const frames = new Set<number>();
        const deadline = performance.now() + 10_000;
        const tick = (): void => {
          const p = { ...g };
          out.push(p);
          if (p.playerMoving) frames.add(p.playerFrame);
          const moved = ((axis === 'y' ? p.playerY : p.playerX) - startAt) * sign;
          if ((frames.size >= 3 && moved > 40 && out.filter((q) => q.playerMoving).length > 3) || performance.now() > deadline) return resolve(out);
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }), { axis, sign, startAt: axis === 'y' ? a.playerY : a.playerX });
      await page.keyboard.up(key);
      const walking = seen.filter((p) => p.playerMoving);
      expect(walking.length, `${dir}: анімація грала`).toBeGreaterThan(3);
      for (const p of walking) {
        expect(Math.floor(p.playerFrame / COLS), `${dir}: рядок листа`).toBe(ROW[dir]);
        expect(p.playerFrame % COLS, `${dir}: у ході — не кадр спокою`).toBeGreaterThan(0);
      }
      expect(new Set(walking.map((p) => p.playerFrame)).size, `${dir}: кадри міняються`).toBeGreaterThanOrEqual(3);
      // Зупинка — за подією, а не за фіксованою паузою: на завантаженій машині кадр сцени приходить із запізненням.
      await expect.poll(async () => (await probe(page)).playerMoving, { timeout: 5_000, message: `${dir}: стоїть` }).toBe(false);
      await expect.poll(async () => (await probe(page)).playerFrame, { timeout: 5_000, message: `${dir}: кадр спокою` }).toBe(ROW[dir] * COLS);
      // Кадр не «залипає»: ще за 300 мс той самий.
      await page.waitForTimeout(300);
      expect((await probe(page)).playerFrame).toBe(ROW[dir] * COLS);
    });
  }

  test('упертий у стіну персонаж не «йде на місці»: кадр спокою, напрямок до стіни зберігається', async ({ page }) => {
    await open(page);
    // GAME-97: до стіни — за умовою (крок фізики йде від згладженої дельти, під навантаженням CI повільніше), далі тиснемо.
    await hold(page, 'ArrowRight', (q) => q.playerX > 390, 10_000);   // GAME-172: стіна старого табору (стовпець 13) — на x ≈ 408; було 280 у мапі 20×12
    const { end } = await hold(page, 'ArrowRight', () => false, 1000);
    expect(end.playerX).toBeGreaterThan(390);
    // GAME-234: раніше — фіксована пауза 400 мс і один зріз: під навантаженням CI герой ще міг доповзати до стіни (playerMoving = зсув за кадр > 0.25 px).
    // Тепер: тримаємо клавішу й чекаємо за подією — playerX не змінюється десять кадрів поспіль (rAF); тоді збираємо ще 30 кадрів упору й вимагаємо, що в КОЖНОМУ — спокій.
    await page.keyboard.down('ArrowRight');
    const run = await page.evaluate(() => new Promise<{ stable: boolean; xs: number[]; moving: boolean[]; frames: number[]; dirs: string[] }>((resolve) => {
      const g = (window as unknown as { __game: { probe: Probe } }).__game.probe;
      const deadline = performance.now() + 10_000;   // та сама межа, що й в hold(): не збільшення, а страховка від вічного циклу
      let lastX = Number.NaN;
      let same = 0;
      const out = { xs: [] as number[], moving: [] as boolean[], frames: [] as number[], dirs: [] as string[] };
      const tick = (): void => {
        if (same < 10) {
          same = g.playerX === lastX ? same + 1 : 0;
          lastX = g.playerX;
          if (performance.now() > deadline) return resolve({ stable: false, ...out });
        } else {
          out.xs.push(g.playerX); out.moving.push(g.playerMoving); out.frames.push(g.playerFrame); out.dirs.push(g.playerDir);
          if (out.xs.length >= 30) return resolve({ stable: true, ...out });
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }));
    await page.keyboard.up('ArrowRight');
    expect(run.stable, 'герой уперся в стіну: playerX не змінюється десять кадрів поспіль').toBe(true);
    expect(run.xs.every((x) => x === run.xs[0]), 'у упорі координата не пливе').toBe(true);
    expect(run.moving.every((m) => m === false), 'упертий у стіну: анімація ходьби не грає в жодному з 30 кадрів').toBe(true);
    expect(run.frames.every((f) => f === ROW.right * COLS), 'у кожному кадрі — кадр спокою обличчям до стіни').toBe(true);
    expect(run.dirs.every((d) => d === 'right'), 'напрямок до стіни зберігається').toBe(true);
  });

  // 3/4-глибина: два намети в рядках 2–3 (дах — шар above, низ — walls), між ними прохід у стовпцях 3–4 (x 96–160).
  test('глибина: перед наметом дах НЕ закриває персонажа, позаду — закриває; глибина персонажа = y ніг', async ({ page }) => {
    await open(page);
    const front = (await hold(page, 'ArrowUp', (p) => p.playerY <= 136, 10_000)).end;   // впирається в низ намету B: ноги ≈ 133
    expect(front.playerDepth).toBeCloseTo(front.playerY, 5);
    expect(front.behindTiles, 'дах намету лежить позаду персонажа, що стоїть перед наметом').toBeGreaterThan(0);
    expect(front.coveredTiles, 'перед наметом дах не перекриває').toBe(0);

    // GAME-313: раніше «позаду» — вліво до x ≤ 140, вгору до y ≤ 100 і зріз через 250 мс, а умову перевіряв Node опитуванням. Під навантаженням опитування запізнюється на 100+ мс,
    // тож герой вилітав за поріг: у 4 із 8 прогонів вгору аж до y ≈ 37 (над дахом — рядок 2, y 64–96 — coveredTiles = 0), а в одному зупинявся в проході без даху.
    // Тепер три ходи до точок (як було: прохід між наметами, потім позад) ведуться в сторінці по кадрах з відпусканням у тому самому кадрі, і зріз — коли герой завмер:
    // (130, 133) — прохід x 96–160; (130, 84) — рядок 2, позад намету; (196, 84) — над дахом намету B (стовпці 5–7 = x 160–256).
    await steer(page, 'x', 130);
    await steer(page, 'y', 84);
    const back = await steer(page, 'x', 196);
    expect(back.playerX, 'герой стоїть над дахом намету B (стовпці 5–7)').toBeGreaterThan(160);
    expect(back.playerY).toBeLessThan(128);
    expect(back.playerDepth).toBeLessThan(128);                                          // глибина лінії основи намету — 128
    expect(back.coveredTiles, 'позаду намету дах закриває кадр персонажа').toBeGreaterThan(0);
  });

  test('мапа 32 px: камера їде за персонажем у межах мапи (GAME-172: 1280×768 із файлу; було 640×384) (OD-030: кадр 640×400 на 1280×800, раніше 427×267 — по обох осях, порожнечі немає)', async ({ page }) => {
    await open(page);
    // GAME-97: за умовою, а не за часом; далі ще тиснемо, щоб камера дійшла до краю мапи (MAP_H = 768, кадр 400) і межа ≤ MAP_H − 400 щось доводила.
    await hold(page, 'ArrowDown', (q) => q.cameraScrollY > 0, 10_000);
    const p = (await hold(page, 'ArrowDown', (q) => q.cameraScrollY >= MAP_H - 400, 10_000)).end;
    expect(p.cameraScrollY).toBeGreaterThan(0);
    expect(p.cameraScrollY).toBeLessThanOrEqual(MAP_H - 400);
    const r = (await hold(page, 'ArrowRight', (q) => q.cameraScrollX >= MAP_W - 640, 10_000)).end;
    expect(r.cameraScrollX).toBeGreaterThanOrEqual(0);
    expect(r.cameraScrollX).toBeLessThanOrEqual(MAP_W - 640);
  });
});
