// GAME-260 · Fable QA 05.11: а) подія в дорозі («Яблука біля дороги») відкривалась, поки на екрані ще мапа дому (сцена на паузі не перемикала мапу);
// б) банер «Нове звання» лягав на рамку розмови. Обидві орієнтації: 390×844 і 932×430. Усе за кадрами й станом — таймерів реального часу немає.
// GAME-275 · справжній шлях (а): виїзд із рамки вибору «Куди їдемо?» — сцена ВЖЕ на паузі, ядро кидає подію в тому ж кроці, що й Visit (sim.ts: roadEvent),
// тож рамка події заступала рамку вибору на старій мапі, і сцена на паузі мапу не перемикала. Стара версія цього тесту «бачила» рамку вибору
// на дорозі (ядро: dialogue === null) і була зеленою за будь-якого коду. Тепер подія — лише коли ядро тримає розмову (dialogue !== null) на loc.road.
// Мутації (перевірено, див. PR): openGate завжди 'now' → (а) червоніє «мапа дороги»; bannersOpen ігнорує talk → (б) червоніє «банера нема під рамкою».
// Знімки до/після — лише G260_SHOTS=1 G260_DIR=research/game-260/{before,after}, не на критичному шляху.
import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { answerOne, core, probe, route, talk, walk } from './chapter-driver';
import { seedDay1 } from './day1-fixture';

test.use({ hasTouch: true, isMobile: true });

const VIEWS = [{ side: 'portrait', w: 390, h: 844 }, { side: 'landscape', w: 932, h: 430 }] as const;
const SHOTS = process.env.G260_SHOTS === '1' ? process.env.G260_DIR ?? 'research/game-260' : null;
const titleUp = (page: Page) => page.locator('[data-ui="title-up"]');
/** map/loc — перший кадр, у якому рамка розмови показує РОЗМОВУ ЯДРА (dialogue !== null) на дорозі; frames — скільки кадрів до того рамка події висіла на іншій мапі. */
interface Seen { map: string | null; loc: string | null; overlap: number; wrongMapFrames: number; errors: string[] }
declare global { interface Window { __g260?: Seen } }

async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

/** Спостерігач кадрів: коли рамка розмови вперше показує розмову ядра вже на дорозі — яка мапа в сцені; і скільки кадрів банер і рамка перекривались. */
async function installWatch(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: Seen = { map: null, loc: null, overlap: 0, wrongMapFrames: 0, errors: [] };
    window.__g260 = seen;
    const tick = (): void => { try { tickBody(); } catch (e) { seen.errors.push(String(e)); } requestAnimationFrame(tick); };   // виняток у спостерігачі — не мовчазна смерть циклу (Закон 4)
    const tickBody = (): void => {
      const g = (window as unknown as { __game?: { probe: { map: string | null }; read: () => { game: { player: { locationId: string } | null; dialogue: unknown } } } }).__game;
      const frame = document.querySelector('.ui-talk [data-ui="dialogue"]');
      if (g && frame) {
        const st = g.read().game;
        const loc = st.player?.locationId ?? null;
        // Рамка вибору «Куди їдемо?» — не розмова ядра (dialogue === null): її не лічимо, лише справжню подію.
        if (loc === 'loc.road' && st.dialogue !== null) {
          if (seen.map === null) { seen.map = g.probe.map; seen.loc = loc; }
          if (g.probe.map !== 'road') seen.wrongMapFrames++;
        }
      }
      const banner = document.querySelector('[data-ui="title-up"]');
      const talkBox = document.querySelector('.ui-talk');
      if (banner && talkBox) {
        const a = banner.getBoundingClientRect(); const b = talkBox.getBoundingClientRect();
        if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) seen.overlap++;
      }
    };
    requestAnimationFrame(tick);
  });
}

const KEY: Readonly<Record<string, string>> = { 'loc.home': 'home', 'loc.shop': 'shop', 'loc.road': 'road', 'loc.camp.lake': 'camp-lake' };
/** До авто на поточній мапі; відкрита рамка вибору «Куди їдемо?». */
async function toVehicle(page: Page): Promise<void> {
  const p = await probe(page);
  const loc = (await core(page)).game.player?.locationId ?? 'loc.home';
  await walk(page, route(KEY[loc] as string, [p.playerX, p.playerY], 'obj.vehicle'));
  await expect.poll(async () => (await probe(page)).nearObject, { timeout: 5_000 }).toBe('obj.vehicle');
  await page.locator('[data-touch="interact"]').tap();
  await expect(talk(page)).toBeVisible({ timeout: 5_000 });
}
/** Обрати в рамці вибору напрям (data-key). */
async function chooseDest(page: Page, dest: string): Promise<void> {
  const from = (await core(page)).game.player?.locationId;
  await expect(page.locator('.ui-talk [data-ui="dialogue"][data-typing="no"]'), 'текст рамки вибору дописано — кнопки живі').toBeVisible({ timeout: 5_000 });
  await page.waitForTimeout(450);   // «глухота» рамки ~350 мс після появи (як у game-175: ACT_COOLDOWN рамки, не таймер гри)
  await talk(page).locator(`[data-act][data-key="${dest}"]`).first().click({ timeout: 5_000 });
  await expect.poll(async () => (await core(page)).game.player?.locationId, { timeout: 5_000 }).not.toBe(from);   // Visit прийнято ядром (GAME-275: клік під час друку тексту рамка ковтає)
  await page.waitForTimeout(600);
}
/** Закрити все, що ядро зараз тримає як розмову (подія в таборі, інша розмова), і рамки вибору, що лишились. */
async function closeTalk(page: Page): Promise<void> {
  for (let i = 0; i < 8 && (await talk(page).count()) > 0; i++) {
    const cancel = talk(page).locator('[data-act="cancel"]');
    if ((await cancel.count()) > 0 && (await core(page)).game.dialogue === null) { await cancel.first().click({ timeout: 5_000 }); await page.waitForTimeout(300); continue; }
    await answerOne(page);
  }
}
/** Їздимо з рамки вибору (сцена на паузі — шлях QA 05.11), поки ядро не кине подію в дорозі: Visit → loc.road і dialogue !== null у тому ж кроці.
 *  Кожен приїзд на дорогу — один кидок RNG зі збереження, тож за кілька поїздок подія трапляється детерміновано. */
async function driveUntilRoadEvent(page: Page): Promise<number> {
  for (let trip = 0; trip < 16; trip++) {
    await closeTalk(page);
    const loc = (await core(page)).game.player?.locationId;
    await toVehicle(page);
    await chooseDest(page, loc === 'loc.road' ? 'loc.home' : 'loc.road');
    const c = (await core(page)).game;
    if (c.player?.locationId === 'loc.road' && c.dialogue !== null) return trip + 1;
  }
  return 0;
}

for (const v of VIEWS) {
  test(`подія в дорозі відкривається вже на мапі дороги — ${v.side}`, async ({ browser }) => {
    test.setTimeout(300_000);
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await installWatch(page);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await seedDay1(page, '?mapFirst=1&seed=1');
    const trips = await driveUntilRoadEvent(page);
    expect(trips, 'за 16 приїздів на дорогу ядро не кинуло жодної події (dialogue на loc.road)').toBeGreaterThan(0);
    await expect(talk(page), 'рамка події відкрилась').toBeVisible({ timeout: 5_000 });
    await shot(page, `event-${v.side}`);
    const seen = await page.evaluate(() => window.__g260 as Seen);
    expect(seen.loc, 'рамка розмови ядра відкрита на дорозі').toBe('loc.road');
    expect(seen.map, 'у першому кадрі рамки події сцена вже показує мапу дороги, а не ту, з якої виїхали').toBe('road');
    expect(seen.wrongMapFrames, 'кадрів, де рамка події висіла не на мапі дороги').toBe(0);
    expect((await page.evaluate(() => (window as unknown as { __game: { probe: { map: string | null } } }).__game.probe.map)), 'сцена на мапі дороги, поки подія відкрита').toBe('road');
    expect(seen.errors, 'спостерігач кадрів не падав').toEqual([]);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  test(`банер звання чекає, поки рамка розмови відкрита, і не перекриває її — ${v.side}`, async ({ browser }) => {
    test.setTimeout(120_000);
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await installWatch(page);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await seedDay1(page, '?mapFirst=1&seed=1');
    await toVehicle(page);   // рамка розмови (вибір «Куди їдемо?») відкрита
    await page.evaluate(() => (window as unknown as { __game: { rewardTitle: (t: number) => void } }).__game.rewardTitle(2));   // звання «заробили» в розмові
    await page.waitForTimeout(500);
    await expect(talk(page)).toBeVisible();
    await shot(page, `banner-while-talk-${v.side}`);
    await expect(titleUp(page), 'банера нема під рамкою розмови').toHaveCount(0);
    await talk(page).locator('[data-act="cancel"]').first().click({ timeout: 5_000 });
    await expect(talk(page)).toHaveCount(0);
    await expect(titleUp(page), 'рамку закрито — банер вийшов із черги').toBeVisible({ timeout: 5_000 });
    await shot(page, `banner-after-talk-${v.side}`);
    expect((await page.evaluate(() => window.__g260 as Seen)).overlap, 'кадрів, де банер перекривав рамку розмови').toBe(0);
    expect(errors).toEqual([]);
    await ctx.close();
  });
}
