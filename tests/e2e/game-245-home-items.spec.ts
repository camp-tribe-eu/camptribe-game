// GAME-245 (GAME-304: речі лежать у контейнерах — холодильник, комора, шафа, тумба: дотик відкриває вікно «всередині», річ береться там) · речі на своїх місцях удома: взяв — річ зникла з полиці, велика картка щойно взятої речі, прогрес у ☰ «Взято N/M · ще: …» без тумблерів;
// «Завантажити речі» біля авто; не влізло — один екран «що лишимо вдома»; після нього виїзд доступний (захист від тупика «спакував — не сісти в авто»).
// Негативний контроль (закон 1): без TakeItem-гілки в actOnMap (старий PackItem у сумку) f.take-* не з'являється й тест червоніє; без LeaveItem (кнопки «Лишити вдома») рамка «Куди їдемо?» не з'являється.
import { expect, test, type Page } from '@playwright/test';
import { walkIntro } from './intro-walk';
import { closeBox, core, installMenuObserver, loaded, menuSeen, playUntil, pressInteract, probe, route, takeFromOpenBox, walk } from './chapter-driver';

const SETTINGS_KEY = 'camplife.settings.v1';
const SHOTS = 'research/home-items';
// GAME-267: знімки картки речі — лише за HOME_SHOTS=1: картка живе ≈ 1,5 с покадрово, на повільному CI вона зникала до знімка (Element is not attached). Перевірки картки лишились.
const SHOT_CARD = process.env.HOME_SHOTS === '1';

async function startHome(page: Page, landscape: boolean): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(([k]) => { try { localStorage.setItem(k as string, JSON.stringify({ textScale: 100, language: 'uk', hintSeen: true })); } catch { /* сховища немає */ } }, [SETTINGS_KEY] as const);
  await installMenuObserver(page);
  await page.goto('/?seed=7&mapFirst=1&intro=1&soloHero=1');
  await loaded(page);
  await walkIntro(page);   // GAME-250: спільний прохід вступу за станом (Атлас — atlas-cta), падає одразу, а не по колу
  await playUntil(page, !landscape, [], (c) => c.game.quests['CH1-HOME-001']?.status === 'active' && c.game.player?.locationId === 'loc.home', () => menuSeen(page), 80);
  expect(errors).toEqual([]);
}

/** Підійти до контейнера й торкнутись (E/тап): вікно «всередині» відкрите. */
async function openBox(page: Page, landscape: boolean, spot: string): Promise<void> {
  const at = await probe(page);
  await walk(page, route('home', [at.playerX, at.playerY], spot));
  await expect.poll(async () => (await probe(page)).nearObject, { timeout: 5_000, message: `біля ${spot}` }).toBe(spot);
  await pressInteract(page, !landscape);
  await expect(page.locator('[data-ui="box-panel"]'), `${spot}: вікно відкрилось`).toBeVisible({ timeout: 5_000 });
}

test('взяти три речі: з місць зникли, картка речі, прогрес у ☰ без тумблерів — портрет 390×844', async ({ browser }) => {
  test.setTimeout(600_000);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await startHome(page, false);
  await page.screenshot({ path: `${SHOTS}/after-home-390x844.png` });
  const picks: [string, string][] = [['box.wardrobe', 'item.documents'], ['box.nightstand', 'item.wallet'], ['box.storeroom', 'item.lantern']];
  for (const [n, [spot, item]] of picks.entries()) {
    const commands = (await probe(page)).commandsSent;
    await openBox(page, false, spot);
    const panel = page.locator('[data-ui="box-panel"]');
    await panel.locator(`[data-ui="box-take"][data-id="${item}"]`).tap();
    await expect(panel.locator(`[data-ui="box-slot"][data-id="${item}"]`)).toHaveAttribute('data-state', 'taken');   // річ зникла з полиці
    const card = panel.locator('[data-ui="box-card"]');   // велика картка щойно взятої речі — у вікні (світ на паузі, її не з'їдає годинник)
    await expect(card.locator('[data-ui="box-card-name"]')).not.toHaveText('');
    await expect(card.locator('[data-ui="box-card-line"]')).toContainText(/[«"]/);
    if (n === 0) await expect(card.locator('[data-ui="box-card-xp"]')).toHaveText('+2 досвіду');   // видима нагорода за дію (needed/useful)
    const icon = await panel.locator('[data-ui="bp-icon"]').first().boundingBox();
    expect(icon?.width ?? 0, 'піктограма ≥ 64 px').toBeGreaterThanOrEqual(64);
    if (n === 0 && SHOT_CARD) await card.screenshot({ path: `${SHOTS}/item-card-closeup.png` });
    if (SHOT_CARD) await page.screenshot({ path: `${SHOTS}/after-take-${n + 1}-390x844.png` });
    expect((await probe(page)).commandsSent).toBeGreaterThan(commands);
    await closeBox(page, true);
  }
  const flags = (await core(page)).game.flags;
  for (const f of ['f.take-documents', 'f.take-wallet', 'f.take-lantern']) expect(flags).toContain(f);
  await page.locator('[data-touch="story"]').tap();
  await page.locator('button[data-ui="journal"]').tap();   // ☰ → «Журнал»: там і «Речі в дорогу»
  const prog = page.locator('[data-ui="pack-progress"]');
  await expect(prog).toContainText('Взято 3/');
  await expect(prog).toContainText('ще:');
  // Жодного тумблера речей: ні ✓/○, ні aria-pressed, ні «Укласти автоматично».
  await expect(page.locator('[data-ui="packing"] [aria-pressed]')).toHaveCount(0);
  await expect(page.locator('[data-ui="packing"] [data-act="pack"], [data-ui="packing"] [data-act="unpack"], [data-ui="packing"] [data-act="autopack"]')).toHaveCount(0);
  await expect(page.locator('[data-ui="pack-item"][data-state="bag"]')).toHaveCount(3);
  await ctx.close();
});

test('усе взяте вдома → авто: не влізло → «що лишимо вдома» → виїзд доступний (без тупика) — ландшафт 932×430', async ({ browser }) => {
  test.setTimeout(900_000);
  const ctx = await browser.newContext({ viewport: { width: 932, height: 430 } });
  const page = await ctx.newPage();
  await startHome(page, true);
  await page.screenshot({ path: `${SHOTS}/after-home-932x430.png` });
  // Усе, що живе вдома для велосипедиста без кішки (14 речей, 21 од. на 12).
  // Усе, що вдома для велосипедиста без кішки: чотири контейнери (14 речей, 21 од. на 12) — торкнутись, узяти все, закрити.
  for (const spot of ['box.nightstand', 'box.wardrobe', 'box.fridge', 'box.storeroom']) { await openBox(page, true, spot); await takeFromOpenBox(page, false, 'all'); }
  const taken = (await core(page)).game.flags.filter((f) => f.startsWith('f.take-'));
  expect(taken.length, 'узято все').toBe(14);
  // До авто: «Завантажити» (само) і, бо не влізло, — екран вибору.
  const at = await probe(page);
  await walk(page, route('home', [at.playerX, at.playerY], 'obj.vehicle'));
  const overflow = page.locator('[data-ui="pack-overflow"]');
  await expect(overflow).toBeVisible({ timeout: 10_000 });
  await expect(overflow.locator('h4')).toHaveText('Не влазить: що лишимо вдома?');
  await page.screenshot({ path: `${SHOTS}/after-overflow-932x430.png` });
  const buttons = overflow.locator('[data-act="leave"]');
  expect(await buttons.first().getAttribute('data-key'), 'спершу «можна лишити»').toMatch(/cushion|lantern/);
  for (let i = 0; i < 20 && (await buttons.count()) > 0; i++) { await buttons.first().click(); await page.waitForTimeout(450); }
  const after = (await core(page)).game.flags;
  expect(after.filter((f) => f.startsWith('f.take-')), 'сумка порожня').toEqual([]);
  expect(['f.pack-tent', 'f.pack-sleeping-bag', 'f.pack-water', 'f.pack-simple-dinner', 'f.pack-documents', 'f.pack-wallet'].filter((f) => !after.includes(f)), 'потрібне в авто').toEqual([]);
  // Закрити панель, відійти й підійти до авто: пропозиція «Куди їдемо?» з'являється (ГАРД: «спакував — не сісти в авто» неможливий).
  await page.keyboard.press('Escape');
  const q = await probe(page);
  await walk(page, route('home', [q.playerX, q.playerY], 'step.ST-004'));
  const q2 = await probe(page);
  await walk(page, route('home', [q2.playerX, q2.playerY], 'obj.vehicle'));
  await expect(page.locator('.ui-talk')).toBeVisible({ timeout: 10_000 });
  await ctx.close();
});
