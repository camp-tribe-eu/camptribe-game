// GAME-180 · прохання сусідів: «!» над мешканцем → розмова з портретом → картка прохання («Беруся» / «Пізніше») → трекер у HUD і стрілка до цілі →
// цілі на мапі (кільце наближення) → повернутись до просильника → подяка, «+», запис у журналі. Усе ЛИШЕ ногами й дією на мапі: після вибору героя й дня 1 жодної
// кнопки ☰. Дві орієнтації телефона. Мутації (перевірено, див. PR): ?breakSpot=<ціль> (об'єкт німий) → прохання не виконується, тест червоніє; ?hideUi=requests (трекера
// нема) → «трекер є» червоніє; прибрати ціль з мапи → валідатор REQUEST_TARGET_NO_MAP (scripts/validator/fixtures.mjs).
// Знімки для research/visual-audit (SHOTS=1): картка прохання і трекер зі стрілкою у двох орієнтаціях. У звичайному прогоні — пропуск.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { walkInPage } from './walk.helpers';
import { waitGameReady } from './ready';

interface Pt { x: number; y: number }
interface Probe { saveLoaded: boolean; playerX: number; playerY: number; nearObject: string | null; playerMoving: boolean; residents: { id: string; x: number; y: number }[]; npcMarks: Record<string, string>; bark: string | null; barkBy: string | null; fx: { target: string | null; guide: string; pops: number } }
interface Core { game: { flags: string[]; dialogue: unknown }; journal: { type: string; ref?: string }[] }
const probe = (page: Page): Promise<Probe> => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __game: { probe: Probe } }).__game.probe)) as Probe);
const core = (page: Page): Promise<Core> => page.evaluate(() => (window as unknown as { __game: { read: () => Core } }).__game.read());
const SHOTS = process.env.SHOTS === '1';

interface TiledMap { width: number; height: number; layers: { name: string; data?: number[]; objects?: { name: string; x: number; y: number }[] }[] }
const MAP = JSON.parse(readFileSync(new URL('../../public/maps/camp-lake.tmj', import.meta.url), 'utf8')) as TiledMap;
const OBJ = new Map((MAP.layers.find((l) => l.name === 'objects')?.objects ?? []).map((o) => [o.name, { x: o.x, y: o.y }] as const));

const panel = (page: Page) => page.locator('[data-ui="story"]');
async function act(page: Page, kind: string, key = ''): Promise<void> {
  await panel(page).locator(`[data-act="${kind}"][data-key="${key}"]`).click({ timeout: 8_000 });
  await page.waitForTimeout(400);
  if (kind === 'visit' && key === 'loc.road') {
    for (let i = 0; i < 6 && await panel(page).locator('[data-ui="dialogue"]').isVisible({ timeout: 400 }).catch(() => false); i++) {
      await panel(page).locator('[data-ui="dialogue"] [data-act]').last().click();
      await page.waitForTimeout(400);
    }
  }
}

/** Старт: герой, день 1 кнопками панелі (як game-179.spec), зачинити ☰ — далі лише ноги. */
async function toCamp(page: Page, query = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`/?seed=7${query}`);
  await waitGameReady(page);
  await page.locator('[data-touch="story"]').click();
  await panel(page).locator('[data-act="create"]', { hasText: 'Велосипед' }).first().click();
  await page.waitForTimeout(400);
  for (const [k, key] of [['complete', 'q.prologue-home-001'], ['complete', 'q.st-001'], ['complete', 'q.st-002'], ['visit', 'loc.shop'], ['pickup', 'item.tent'], ['pickup', 'item.sleeping-bag'], ['checkout', 'basket.all'],
    ['complete', 'q.st-003'], ['visit', 'loc.home'], ['complete', 'q.ch1-home-001'], ['visit', 'loc.road'], ['complete', 'q.st-004'], ['visit', 'loc.camp.lake']] as const) await act(page, k, key);
  await page.locator('[data-ui="story-close"]').click();
  await page.locator('[data-ui="recovery-reminder"] button', { hasText: 'Закрити' }).click({ timeout: 2_000 }).catch(() => undefined);   // нагадування про код відновлення — одноразове, не про прохання
  await expect.poll(async () => (await probe(page)).residents.length, { message: 'мешканці табору на мапі', timeout: 15_000 }).toBeGreaterThan(0);
  return errors;
}

interface Req { pics: number; id: string; giver: string; name: string; targets: string[]; track: string; goal: string; hubChoice?: string }
const REQS: Record<string, Req> = {
  nora: { pics: 1, id: 'req.nora-shore', giver: 'npc.nora', name: 'Нора', targets: ['req.nora-shore.t1', 'req.nora-shore.t2', 'req.nora-shore.t3'], track: 'Сміття', goal: 'Збери три шматки сміття на березі.' },
  luc: { pics: 1, id: 'req.luc-chain', giver: 'npc.luc', name: 'Люк', targets: ['req.luc-chain.t1'], track: 'Ланцюг', goal: 'Огляни ланцюг на велосипеді Люка.' },
  ingrid: { pics: 1, id: 'req.ingrid-birds', giver: 'npc.ingrid', name: 'Інгрід', targets: ['req.ingrid-birds.t1'], track: 'Птахи', goal: 'Постій тихо на причалі й подивись на птахів.' },
  sarah: { pics: 2, id: 'req.sarah-snack', giver: 'npc.sarah', name: 'Сара', targets: ['req.sarah-snack.t1', 'req.sarah-snack.t2'], track: 'Перекус', goal: 'Знайди печиво й яблуко — перекус у межах бюджету.' },
  elise: { pics: 1, id: 'req.elise-lantern', giver: 'npc.elise', name: 'Еліза', targets: ['req.elise-lantern.t1'], track: 'Ліхтар', goal: 'Знайди запасний ліхтар Елізи між наметами.', hubChoice: 'Є щось, із чим допомогти?' },
};
const flag = (id: string, part: string): string => `f.${id.replace(/\./g, '-')}-${part}`;
/** Ціль ходьби до просильника: Еліза стоїть у таборі (точка з мапи), решта ходять — за id щокадру (walk.helpers.ts). */
const giverAt = (r: Req): { to: Pt } | { toId: string } => (r.giver === 'npc.elise' ? { to: OBJ.get('npc.elise') as Pt } : { toId: r.giver });

const box = (page: Page) => panel(page).locator('[data-ui="dialogue"]');
async function closeTalk(page: Page): Promise<void> {
  for (let i = 0; i < 12 && await box(page).isVisible(); i++) { await panel(page).locator('[data-act]').last().click(); await page.waitForTimeout(420); }
  await expect(box(page)).toBeHidden({ timeout: 5_000 });
}

/** Підійти до просильника й заговорити (Space на мапі). Над ним мусить бути «!» (request). */
async function openTalk(page: Page, r: Req, marker = 'request'): Promise<void> {
  // Слідувачі (родина) тупцюють коло героя, а мешканець ходить: «найближчий» міг змінитись між кроком і дією — тоді розмова не з тим; закриваємо її й пробуємо ще.
  for (let attempt = 0; ; attempt++) {
    // GAME-313: підхід і Space — одним rAF-циклом у сторінці: Space іде в тому самому кадрі, де nearObject === просильник і над ним потрібна позначка, тож «найближчий» не встигає змінитись.
    const near = (await walkInPage<Probe>(page, { label: r.giver, ...giverAt(r), act: { id: r.giver, key: 'Space', marks: [marker], markWaitMs: 5_000, markMessage: `${r.giver}: над головою нема «!»` } })).at;
    expect(near.nearObject).toBe(r.giver);
    await expect(box(page), `${r.giver}: рамка розмови не відкрилась`).toBeVisible({ timeout: 8_000 }).catch(() => undefined);
    const who = (await box(page).isVisible()) ? await panel(page).locator('[data-ui="speaker"]').getAttribute('data-npc') : null;
    if (who === r.giver) break;
    expect(attempt, `${r.giver}: говорили з ${who} замість нього`).toBeLessThan(4);
    await closeTalk(page);
  }
  await expect(panel(page).locator('[data-ui="speaker"]')).toHaveText(r.name);
}

/** Розмова до картки: «Далі» крізь привітання (Еліза — вибір у хабі), поки не з'явиться картка прохання. */
async function toCard(page: Page, r: Req): Promise<void> {
  for (let i = 0; i < 8; i++) {
    if (await panel(page).locator('[data-ui="req-card"]').isVisible()) return;
    const hub = r.hubChoice ? panel(page).locator('[data-act="choose"]', { hasText: r.hubChoice }) : null;
    if (hub && await hub.isVisible()) await hub.click();
    else await panel(page).locator('[data-act="continue"]').click();
    await page.waitForTimeout(450);
  }
  await expect(panel(page).locator('[data-ui="req-card"]')).toBeVisible();
}

async function checkCard(page: Page, r: Req): Promise<void> {
  const card = panel(page).locator('[data-ui="req-card"]');
  await expect(card.locator('[data-ui="req-goal"]')).toHaveText(r.goal);
  await expect(card.locator('[data-ui="req-goal-pic"]'), 'цілі — картинки (однакові згруповано ×N)').toHaveCount(r.pics);
  expect(await card.locator('svg[data-ui="req-icon"]').count()).toBe(r.pics);
  if (r.targets.length > r.pics) await expect(card.locator('[data-ui="req-goal-pic"]').first()).toContainText(`×${r.targets.length}`);
  await expect(card.locator('[data-ui="req-reward"]')).toContainText('Нагорода: +15 досвіду · +10 ОМ');
  // Картка й обидві кнопки — у межах екрана, кнопки ≥ 44 px.
  const geo = await page.evaluate(() => {
    const q = (s: string): DOMRect | undefined => document.querySelector(s)?.getBoundingClientRect();
    const btns = [...document.querySelectorAll('[data-ui="dialogue"] [data-act]')].map((b) => b.getBoundingClientRect());
    const main = q('.ui-talk-main');
    return { card: q('[data-ui="req-card"]'), btns, main, vw: innerWidth, vh: innerHeight, scrollW: document.documentElement.scrollWidth };
  });
  expect(geo.scrollW, 'без горизонтальної прокрутки').toBeLessThanOrEqual(geo.vw);
  expect(geo.card && geo.card.right <= geo.vw + 1 && geo.card.left >= -1, 'картка в межах екрана').toBe(true);
  for (const b of geo.btns) {
    expect(b.height, 'кнопка ≥ 44 px').toBeGreaterThanOrEqual(43.5);
    expect(b.right <= geo.vw + 1 && b.bottom <= geo.vh + 1, 'кнопка на екрані').toBe(true);
    expect(geo.main && b.bottom <= geo.main.bottom + 1 && b.top >= geo.main.top - 1, 'кнопка не обрізана прокруткою рамки: «Беруся» і «Пізніше» видно одразу').toBe(true);
  }
  await expect(panel(page).locator('[data-act="choose"]', { hasText: 'Беруся' })).toBeVisible();
  await expect(panel(page).locator('[data-act="choose"]', { hasText: 'Пізніше' })).toBeVisible();
}

/** Ціль ногами: ідемо до об'єкта, кільце наближення саме ставить прапорець; стрілка вказує на неї. */
async function doTarget(page: Page, r: Req, spot: string, i: number): Promise<void> {
  const target = OBJ.get(spot) as Pt;
  expect((await probe(page)).fx.target, 'стрілка веде до наступної цілі').toBe(spot);
  // GAME-186 (2/2): корінь — у ходьбі тесту, не в грі. walk() відпускає клавішу окремим CDP-викликом; під навантаженням (4 воркери, кадр 60–120 мс) той виклик
  // запізнюється на сотні мс, і герой за цей час проскакує ціль на 30–80 px — за AUTO_RANGE (35) кільце не стартує (виміряно: зупинка за 41–49 px від цілі).
  // Тому до цілі — грубо (шлях по тайлах), а ПІДСТУП і зупинка — всередині сторінки (rAF, без CDP), як у chapter-driver.walk; далі перевіряємо, що герой стоїть упритул.
  // Саму перевірку прапорця (6 с) не ослаблено.
  for (let attempt = 0; attempt < 4; attempt++) {
    await walkInPage(page, { label: spot, to: target, until: [{ within: 12 }] });   // підступ і зупинка — у сторінці по кадрах, завмерли
    const p = await probe(page);
    if (!p.playerMoving && Math.hypot(p.playerX - target.x, p.playerY - target.y) < 28) break;
  }
  const at = await probe(page);
  await expect.poll(async () => (await core(page)).game.flags.includes(flag(r.id, r.targets.length > 0 ? `t${i + 1}` : '')), { message: `${spot}: прапорець цілі не став (герой за ${Math.round(Math.hypot(at.playerX - target.x, at.playerY - target.y))} px, поруч ${at.nearObject})`, timeout: 6_000 }).toBe(true);
  await expect(page.locator(`[data-ui="req-row"][data-request="${r.id}"]`)).toHaveAttribute('data-done', String(i + 1));
}

/** Повний шлях одного прохання: «!» → розмова → картка → «Беруся» → трекер → цілі → просильник → подяка → журнал. */
async function playRequest(page: Page, r: Req, opts: { later?: boolean; shot?: string } = {}): Promise<void> {
  await openTalk(page, r);
  await toCard(page, r);
  await checkCard(page, r);
  // Друк рядка — лише краса (машинка): знімок після дописування, інакше в кадр потрапляє обірваний текст.
  if (opts.shot) { await expect(box(page)).toHaveAttribute('data-typing', 'no', { timeout: 8_000 }); await page.screenshot({ path: `research/visual-audit/request-card-${opts.shot}.png` }); }
  if (opts.later) {
    // Відмова не коштує нічого: жодного прапорця, «!» лишається, прохання можна взяти пізніше.
    const before = (await core(page)).game.flags.filter((f) => f.startsWith('f.req-'));
    await panel(page).locator('[data-act="choose"]', { hasText: 'Пізніше' }).click();
    await page.waitForTimeout(450);
    await closeTalk(page);
    expect((await core(page)).game.flags.filter((f) => f.startsWith('f.req-')), 'відмова нічого не ставить').toEqual(before);
    // GAME-208: справи за погодою (без просильника) теж стоять у трекері — відмова не додає саме ЦЬОГО прохання.
    await expect(page.locator(`[data-ui="req-row"][data-request="${r.id}"]`)).toHaveCount(0);
    await expect.poll(async () => (await probe(page)).npcMarks[r.giver], { timeout: 5_000 }).toBe('request');
    await openTalk(page, r);   // пропозиція повертається: «!» лишився, до просильника (він ходить за розкладом) — знову ногами
    await toCard(page, r);
  }
  await panel(page).locator('[data-act="choose"]', { hasText: 'Беруся' }).click();
  await page.waitForTimeout(450);
  await closeTalk(page);
  expect((await core(page)).game.flags).toContain(flag(r.id, 'taken'));
  // Трекер в HUD: «Сміття 0/3».
  const row = page.locator(`[data-ui="req-row"][data-request="${r.id}"]`);
  await expect(row, 'трекер є').toHaveText(`${r.track} 0/${r.targets.length}`);
  const tb = await row.boundingBox();
  const vp = page.viewportSize() as { width: number; height: number };
  expect(tb && tb.y >= 0 && tb.y + tb.height <= vp.height && tb.x >= 0 && tb.x + tb.width <= vp.width, `трекер у межах екрана: ${JSON.stringify(tb)}`).toBe(true);
  // Стрілка вказує на наступну ціль; а коли герой уже стоїть біля неї (просильник стоїть поруч із ціллю — розклад мешканців), стрілку навмисно сховано (відстань < 1,8 клітинки).
  const first = OBJ.get(r.targets[0] as string) as Pt;
  await expect.poll(async () => {
    const p = await probe(page);
    return p.fx.target === r.targets[0] && (p.fx.guide !== 'none' || Math.hypot(p.playerX - first.x, p.playerY - first.y) < 60);
  }, { message: 'стрілка до першої цілі' }).toBe(true);
  for (const [i, spot] of r.targets.entries()) {
    await doTarget(page, r, spot, i);
    if (i === 0 && opts.shot) await page.screenshot({ path: `research/visual-audit/request-tracker-${opts.shot}.png` });
  }
  await expect(row).toHaveAttribute('data-ready', 'yes');
  expect((await probe(page)).fx.target, 'усе зроблено — стрілка веде до просильника').toBe(r.giver);
  // Повернутись до просильника: «!» (здати) → подяка → журнал.
  const pops = (await probe(page)).fx.pops;
  await openTalk(page, r);
  const line = async (): Promise<string> => (await panel(page).locator('[data-ui="line"]').textContent()) ?? '';
  for (let i = 0; i < 6 && !(await panel(page).locator('[data-act="choose"]', { hasText: /Нема за що|Дрібниця|Було тихо|Смачного|Ось твій ліхтар/ }).isVisible()); i++) {
    const hub = r.hubChoice ? panel(page).locator('[data-act="choose"]', { hasText: r.hubChoice }) : null;
    if (hub && await hub.isVisible()) await hub.click();
    else await panel(page).locator('[data-act="continue"]').click();
    await page.waitForTimeout(450);
  }
  expect((await line()).length).toBeGreaterThan(8);
  await panel(page).locator('[data-act="choose"]', { hasText: /Нема за що|Дрібниця|Було тихо|Смачного|Ось твій ліхтар/ }).click();
  await page.waitForTimeout(450);
  expect((await line()).length, 'жартівливий завершальний рядок').toBeGreaterThan(8);
  await closeTalk(page);
  const c = await core(page);
  expect(c.game.flags).toContain(flag(r.id, 'done'));
  expect(c.journal.some((e) => e.type === 'Memory' && e.ref === flag(r.id, 'done')), 'запис у журналі').toBe(true);
  await expect.poll(async () => (await probe(page)).fx.pops, { message: '«+» над героєм' }).toBeGreaterThan(pops);
  await expect(page.locator(`[data-ui="req-row"][data-request="${r.id}"]`)).toHaveCount(0);
  await page.waitForTimeout(300);
  // GAME-184: у Нори, Інгрід і Люка після першого прохання відкривається продовження (game-184.spec) — «!» повертається; в Елізи й Сари його нема, «!» зникає.
  if (['npc.nora', 'npc.ingrid', 'npc.luc'].includes(r.giver)) await expect.poll(async () => (await probe(page)).npcMarks[r.giver], { message: 'після здачі першого прохання «!» веде до продовження', timeout: 5_000 }).toBe('request');
  else expect((await probe(page)).npcMarks[r.giver], 'після здачі «!» зникає').not.toBe('request');
}

const ORIENTATIONS = [
  { name: 'portrait', viewport: { width: 390, height: 844 } },
  { name: 'landscape', viewport: { width: 844, height: 390 } },
] as const;
// Усі 5 прохань у КОЖНІЙ орієнтації (картка GAME-180), розбито на дві групи, щоб шарди балансувались; кожна група — свіжа гра.
const GROUPS = [['nora', 'ingrid', 'luc'], ['sarah', 'elise']] as const;
/** Стеля «5–10 хв на перші два прохання» (реальний час ходьби ≈ ігровий). Щедра: вимір друкується в звіті. */
const FIRST_TWO_MAX_MS = 300_000;

for (const o of ORIENTATIONS) {
  test.describe(`GAME-180 прохання — ${o.name} ${o.viewport.width}×${o.viewport.height}`, () => {
    test.use({ viewport: o.viewport, hasTouch: false, isMobile: false });
    test.setTimeout(600_000);

    for (const [gi, group] of GROUPS.entries()) {
      test(`«!» → картка → ціль → здача, лише ногами: ${group.join(' + ')}`, async ({ page }) => {
        const errors = await toCamp(page);
        const t0 = Date.now();
        for (const [i, key] of group.entries()) {
          const r = REQS[key] as Req;
          await playRequest(page, r, { later: key === 'nora' || key === 'luc', ...(gi === 0 && i === 0 && SHOTS ? { shot: o.name } : {}) });
          if (gi === 0 && i === 1) {
            const ms = Date.now() - t0;
            console.log(`GAME-180 TIMING ${o.name}: перші 2 прохання (${group.slice(0, 2).join('+')}) ногами, від виходу на мапу табору до здачі: ${ms} мс (${(ms / 60000).toFixed(2)} хв); стеля ${FIRST_TWO_MAX_MS} мс`);
            expect(ms, 'перші 2 прохання — у межах відчуття 5–10 хв').toBeLessThan(FIRST_TWO_MAX_MS);
          }
        }
        expect(errors, 'без помилок у консолі').toEqual([]);
      });
    }
  });
}

test.describe('GAME-180 негативні контролі', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: false, isMobile: false });
  test.setTimeout(240_000);

  // GAME-236: репліка-«бурчання» не ховає «!» — стан, а не час: чекаємо, поки НАД САМИМ просильником звучить репліка, і в тому ж знімку «!» має бути.
  test('«!» видно й поки над просильником репліка (GAME-236)', async ({ page }) => {
    await toCamp(page);
    const r = REQS.sarah as Req;
    const p = (await walkInPage<Probe>(page, { label: `${r.giver}: репліки не діждались`, ...giverAt(r), until: [{ barkBy: r.giver }], settle: false })).at;
    expect(p.bark, 'репліка справді звучить').not.toBeNull();
    await expect.poll(async () => { const q = await probe(page); return q.barkBy === r.giver ? q.npcMarks[r.giver] : 'request'; }, { message: `${r.giver}: «!» зник під час репліки`, timeout: 2_000 }).toBe('request');
    expect(p.npcMarks[r.giver], `${r.giver}: «!» у кадрі першої репліки`).toBe('request');
  });

  // GAME-338 · ціль Люка (304,464) стоїть під сосною pine.camp (288,380, радіус 44): зверху «Дія» трусила дерево (+1 Шишка, ~1 хв) і ціль не відкривалась.
  // Точка (298,422) — у зоні дії обох (до сосни ≈43, до цілі ≈42), далі за кільце наближення (35): спрацювати може лише ручна «Дія».
  // Мутація (перевірено): у proximity.ts `lifeMayAct` прибрати `&& !nearName.startsWith('req.')` → тест червоніє (сосна перехоплює «Дію»).
  test('Люк: «Дія» зверху від цілі під сосною відкриває ціль, а не трусить сосну (GAME-338)', async ({ page }) => {
    await toCamp(page);
    const r = REQS.luc as Req;
    await openTalk(page, r);
    await toCard(page, r);
    await panel(page).locator('[data-act="choose"]', { hasText: 'Беруся' }).click();
    await page.waitForTimeout(450);
    await closeTalk(page);
    const spot: Pt = { x: 298, y: 422 };
    for (let attempt = 0; attempt < 4; attempt++) {
      await walkInPage(page, { label: 'зверху від цілі Люка', to: spot, until: [{ within: 4 }] });
      const p = await probe(page);
      if (!p.playerMoving && Math.hypot(p.playerX - spot.x, p.playerY - spot.y) < 8) break;
    }
    const at = await probe(page);
    expect(Math.hypot(at.playerX - 288, at.playerY - 380), 'герой у зоні сосни').toBeLessThan(44);
    expect(at.nearObject, 'найближчий об\'єкт — ціль Люка').toBe('req.luc-chain.t1');
    await page.keyboard.press('Space');
    await expect.poll(async () => (await core(page)).game.flags.includes(flag(r.id, 't1')), { message: 'ціль Люка відкрилась від «Дії»', timeout: 6_000 }).toBe(true);
    const camp = await page.evaluate(() => (window as unknown as { __game: { probe: { camp: { usedToday: string[] } } } }).__game.probe.camp.usedToday);
    expect(camp, 'сосну не трусили').not.toContain('pine.camp');
  });

  test('німий об\'єкт цілі (?breakSpot) → прохання не виконується: прохід червоніє', async ({ page }) => {
    await toCamp(page, '&breakSpot=req.luc-chain.t1');
    const r = REQS.luc as Req;
    await openTalk(page, r);
    await toCard(page, r);
    await panel(page).locator('[data-act="choose"]', { hasText: 'Беруся' }).click();
    await page.waitForTimeout(450);
    await closeTalk(page);
    await expect(doTarget(page, r, 'req.luc-chain.t1', 0), 'ціль німа — прапорець не стане').rejects.toThrow();
    expect((await core(page)).game.flags).not.toContain(flag(r.id, 't1'));
  });

  test('без трекера (?hideUi=requests) «трекер є» червоніє', async ({ page }) => {
    await toCamp(page, '&hideUi=requests');
    const r = REQS.luc as Req;
    await openTalk(page, r);
    await toCard(page, r);
    await panel(page).locator('[data-act="choose"]', { hasText: 'Беруся' }).click();
    await page.waitForTimeout(450);
    await closeTalk(page);
    await expect(page.locator(`[data-ui="req-row"][data-request="${r.id}"]`)).toHaveCount(0);
  });

  test('німий причал Інгрід (?breakSpot) → ціль «птахи» не береться: прохід червоніє', async ({ page }) => {
    await toCamp(page, '&breakSpot=req.ingrid-birds.t1');
    const r = REQS.ingrid as Req;
    await openTalk(page, r);
    await toCard(page, r);
    await panel(page).locator('[data-act="choose"]', { hasText: 'Беруся' }).click();
    await page.waitForTimeout(450);
    await closeTalk(page);
    await expect(doTarget(page, r, 'req.ingrid-birds.t1', 0), 'ціль німа — прапорець не стане').rejects.toThrow();
    expect((await core(page)).game.flags).not.toContain(flag(r.id, 't1'));
  });
});
