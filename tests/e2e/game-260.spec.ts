// GAME-260 · Fable QA 05.11: а) подія в дорозі («Яблука біля дороги») відкривалась, поки на екрані ще мапа дому (сцена на паузі не перемикала мапу);
// б) банер «Нове звання» лягав на рамку розмови. Обидві орієнтації: 390×844 і 932×430. Усе за кадрами й станом — таймерів реального часу немає.
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
interface Seen { map: string | null; loc: string | null; overlap: number }
declare global { interface Window { __g260?: Seen } }

async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

/** Спостерігач кадрів: коли рамка розмови вперше з'являється вже на дорозі — яка мапа в сцені; і скільки кадрів банер і рамка перекривались. */
async function installWatch(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: Seen = { map: null, loc: null, overlap: 0 };
    window.__g260 = seen;
    const tick = (): void => {
      const g = (window as unknown as { __game?: { probe: { map: string | null }; read: () => { game: { player: { locationId: string } | null } } } }).__game;
      const frame = document.querySelector('.ui-talk [data-ui="dialogue"]');
      if (g && frame && seen.map === null) {
        const loc = g.read().game.player?.locationId ?? null;
        if (loc === 'loc.road') { seen.map = g.probe.map; seen.loc = loc; }
      }
      const banner = document.querySelector('[data-ui="title-up"]');
      const talkBox = document.querySelector('.ui-talk');
      if (banner && talkBox) {
        const a = banner.getBoundingClientRect(); const b = talkBox.getBoundingClientRect();
        if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) seen.overlap++;
      }
      requestAnimationFrame(tick);
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
  await talk(page).locator(`[data-act][data-key="${dest}"]`).first().click({ timeout: 5_000 });
  await page.waitForTimeout(600);
}
/** Їздимо дім ⇄ дорога (як у QA: виїзд із кухні), поки на дорозі не відкриється подія (кожен приїзд на дорогу — один кидок RNG зі збереження). */
async function driveUntilRoadEvent(page: Page): Promise<boolean> {
  for (let trip = 0; trip < 12; trip++) {
    const loc = (await core(page)).game.player?.locationId;
    await toVehicle(page);
    await chooseDest(page, loc === 'loc.home' ? 'loc.road' : 'loc.home');
    const at = (await core(page)).game.player?.locationId;
    if (at === 'loc.road' && (await talk(page).count()) > 0) return true;
    for (let i = 0; i < 8 && (await talk(page).count()) > 0; i++) await answerOne(page);   // подія в таборі чи інша розмова — закриваємо й їдемо далі
  }
  return false;
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
    expect(await driveUntilRoadEvent(page), 'за 12 приїздів на дорогу подія не трапилась').toBe(true);
    await shot(page, `event-${v.side}`);
    const seen = await page.evaluate(() => window.__g260 as Seen);
    expect(seen.loc, 'рамка відкрита на дорозі').toBe('loc.road');
    expect(seen.map, 'у першому кадрі рамки події сцена вже показує мапу дороги, а не дому').toBe('road');
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
