// GAME-179 · розмова з NPC на мапі: підійшов — над головою «…» — дія — рамка внизу з портретом, іменем і текстом; кожен NPC табору.
// Мутації (перевірено, див. PR): ?hideUi=portrait (портрет не дають) → «портрет є» червоніє; прибрати dialogue/luc-chat.json → Люк мовчить, тест Люка червоніє;
// markerFor завжди null → «…» не видно, тест червоніє.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { waitGameReady } from './ready';

interface Pt { x: number; y: number }
interface Probe { ready: boolean; playerX: number; playerY: number; nearObject: string | null; residents: { id: string; x: number; y: number }[]; followers: Pt[]; npcMarks: Record<string, string> }
const probe = (page: Page): Promise<Probe> => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __game: { probe: Probe } }).__game.probe)) as Probe);
const core = (page: Page): Promise<{ game: { dialogue: unknown }; clock: { paused: boolean } }> => page.evaluate(() => (window as unknown as { __game: { read: () => never } }).__game.read());

const TILE = 32;
interface TiledMap { width: number; height: number; layers: { name: string; data?: number[]; objects?: { name: string; type?: string; x: number; y: number }[] }[] }
const MAP = JSON.parse(readFileSync(new URL('../../public/maps/camp-lake.tmj', import.meta.url), 'utf8')) as TiledMap;
const WALLS = MAP.layers.find((l) => l.name === 'walls')?.data ?? [];
const solid = (c: number, r: number): boolean => c < 0 || r < 0 || c >= MAP.width || r >= MAP.height || (WALLS[r * MAP.width + c] ?? 0) > 0;
const ELISE = (MAP.layers.find((l) => l.name === 'objects')?.objects ?? []).find((o) => o.name === 'npc.elise') as Pt;

/** GAME-282: відкриті місця табору (5×5 вільних тайлів, досяжні від старту героя) і вибір того, що зараз найдалі від мешканців та предметів мапи. */
const OBJECTS = (MAP.layers.find((l) => l.name === 'objects')?.objects ?? []) as Pt[];
const OPEN: Pt[] = (() => {
  const seen = new Set<number>();
  const start = { c: 18, r: 13 }; const key = (c: number, r: number): number => r * MAP.width + c;
  seen.add(key(start.c, start.r)); const q = [start];
  for (let i = 0; i < q.length; i++) {
    const t = q[i] as { c: number; r: number };
    for (const [dc, dr] of [[0, -1], [-1, 0], [0, 1], [1, 0]] as const) { const c = t.c + dc; const r = t.r + dr; if (!solid(c, r) && !seen.has(key(c, r))) { seen.add(key(c, r)); q.push({ c, r }); } }
  }
  return q.filter((t) => t.c % 2 === 0 && t.r % 2 === 0 && [-2, -1, 0, 1, 2].every((a) => [-2, -1, 0, 1, 2].every((b) => !solid(t.c + a, t.r + b)))).map((t) => ({ x: (t.c + 0.5) * TILE, y: (t.r + 0.5) * TILE }));
})();
function clearSpot(p: Probe): Pt {
  const others = [...p.residents, ...OBJECTS];
  const far = (o: Pt): number => Math.min(...others.map((r) => Math.hypot(r.x - o.x, r.y - o.y)));
  const hero = (o: Pt): number => Math.hypot(p.playerX - o.x, p.playerY - o.y);
  // не ближче 5 тайлів до будь-кого; з таких — найближче до героя (коротша дорога, менше часу, поки мешканці рухаються)
  const good = OPEN.filter((o) => far(o) >= 5 * TILE);
  const pool = good.length > 0 ? good : [...OPEN].sort((x, y) => far(y) - far(x)).slice(0, 5);
  return pool.reduce((m, o) => (hero(o) < hero(m) ? o : m));
}

/** Усі, з ким говоримо на мапі табору, і як їх звати (uk). Джордж — на мапі дому: покритий сторожем npc-talk.test (мапа ⇄ контент). */
const CAST: [string, string][] = [
  ['npc.elise', 'Еліза'], ['npc.amina', 'Аміна'], ['npc.luc', 'Люк'], ['npc.nora', 'Нора'], ['npc.ingrid', 'Інгрід'], ['npc.sarah', 'Сара'], ['npc.claire', 'Клер'],
  ['npc.victoria', 'Вікторія'], ['npc.matthew', 'Метью'],
];

/**
 * Куди йти: нерухома точка, слідувач за номером у ланцюжку або мешканець за id. Ціль перечитується КОЖЕН кадр сцени — всередині сторінки (не з Node).
 * GAME-298: раніше крок керування — «probe → рішення → keyboard.down/up» — ішов із Node: кожен обмін із браузером під навантаженням 0,5–2 с, а герой проходить тайл за 0,25 с,
 * тож рішення приймались за позицією, давно застарілою, герой перелітав ціль і ходив колами до кінця 80 с («не дійшов до npc.matthew»: у трасі ≈ 40 рішень за 80 с, герой тинявся
 * по всьому табору). Тут — як у chapter-driver.walk (GAME-238): рішення й клавіші — в requestAnimationFrame, тобто одне рішення на показаний кадр, скільки б часу він не забрав.
 */
type Goal = { at: Pt } | { follower: number } | { resident: string };

/** Пішки до цілі: зупинка, коли найближчий співрозмовник — `id` (або, якщо задано `spot`, коли герой ближче 12 px до точки). Межа `maxMs` — страховка від вічного циклу, не очікування. */
async function walkToNpc(page: Page, id: string, goal: Goal, maxMs = 80_000, spot?: Pt, act = false): Promise<Probe & { pressed: boolean }> {
  const done = await page.evaluate(({ id, goal, maxMs, spot, act, open, objects, walls, cols, rows, tileSize }) => new Promise<(Probe & { pressed: boolean }) | null>((resolve) => {
    const g = (window as unknown as { __game: { probe: Probe } }).__game;
    const snap = (pressed: boolean): Probe & { pressed: boolean } => ({ ...(JSON.parse(JSON.stringify(g.probe)) as Probe), pressed });   // знімок кадру прибуття: поки він летить у Node, родина вже йде далі
    const solid = (c: number, r: number): boolean => c < 0 || r < 0 || c >= cols || r >= rows || (walls[r * cols + c] ?? 0) > 0;
    const nextStep = (from: { c: number; r: number }, to: { c: number; r: number }): { c: number; r: number } | null => {
      const key = (c: number, r: number): number => r * cols + c;
      const prev = new Map<number, number>([[key(from.c, from.r), -1]]);
      const q = [from];
      for (let i = 0; i < q.length; i++) {
        const t = q[i] as { c: number; r: number };
        if (t.c === to.c && t.r === to.r) {
          const path: number[] = [];
          for (let k = key(t.c, t.r); k >= 0; k = prev.get(k) ?? -1) path.unshift(k);
          const n = path[1];
          return n === undefined ? null : { c: n % cols, r: Math.floor(n / cols) };
        }
        for (const [dc, dr] of [[0, -1], [-1, 0], [0, 1], [1, 0]] as const) {
          const c = t.c + dc; const r = t.r + dr;
          if (solid(c, r) || prev.has(key(c, r))) continue;
          prev.set(key(c, r), key(t.c, t.r)); q.push({ c, r });
        }
      }
      return null;
    };
    const codes: Record<string, number> = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Space: 32 };
    const down = new Set<string>();
    const fire = (type: string, k: string): void => {
      const e = new KeyboardEvent(type, { key: k === 'Space' ? ' ' : k, code: k, bubbles: true, cancelable: true });
      Object.defineProperty(e, 'keyCode', { get: () => codes[k] });
      window.dispatchEvent(e);
    };
    const set = (want: string | null): void => {
      for (const k of [...down]) if (k !== want) { fire('keyup', k); down.delete(k); }
      if (want && !down.has(want)) { fire('keydown', want); down.add(want); }
    };
    const t0 = performance.now();
    let waited = 0;
    // Родина тупцює коло героя, і поки в зоні дії ще хтось (вогнище, мешканець, предмет) — співрозмовником обирають не її. Дійшли до слідувача впритул, а зона чужа
    // (20 кадрів поспіль) — ідемо на чисте місце (те саме правило, що clearSpot у Node, але за кадром, а не за обміном із браузером) і знову до слідувача.
    const pickClear = (p: Probe): Pt => {
      const others = [...p.residents, ...objects];
      const far = (o: Pt): number => Math.min(...others.map((r) => Math.hypot(r.x - o.x, r.y - o.y)));
      const hero = (o: Pt): number => Math.hypot(p.playerX - o.x, p.playerY - o.y);
      const good = open.filter((o) => far(o) >= 5 * tileSize);
      const pool = good.length > 0 ? good : [...open].sort((x, y) => far(y) - far(x)).slice(0, 5);
      return pool.reduce((m, o) => (hero(o) < hero(m) ? o : m));
    };
    let relocate: Pt | null = null;
    let crowded = 0;
    let last = { x: g.probe.playerX, y: g.probe.playerY };
    const tick = (): void => {
      const p = g.probe;
      if (spot && Math.hypot(p.playerX - spot.x, p.playerY - spot.y) < 12) { set(null); resolve(snap(false)); return; }
      if (p.nearObject === id) {
        set(null);
        if (!act) { resolve(snap(false)); return; }
        // GAME-298: «в зоні й є «…»/«!»» і Space — в ОДНОМУ кадрі сцени, а не через два обміни Node↔браузер (за той час родина встигала зсунутись, і зона вже була чужа).
        // Немає позначки понад 300 кадрів (її й справді нема) — віддаємо знімок без натиску: тест скаже, чого саме не видно над головою.
        if (/^(chat|request)$/.test(p.npcMarks[id] ?? '')) {
          const shot = snap(true);
          fire('keydown', 'Space');
          requestAnimationFrame(() => { fire('keyup', 'Space'); resolve(shot); });
          return;
        }
        if (++waited > 300) { resolve(snap(false)); return; }
        requestAnimationFrame(tick);
        return;
      }
      if (performance.now() - t0 > maxMs) { set(null); resolve(null); return; }
      const chased = 'at' in goal ? goal.at : 'follower' in goal ? p.followers[goal.follower] as Pt : p.residents.find((r) => r.id === goal.resident) as Pt;
      if ('follower' in goal && !relocate) {
        crowded = Math.hypot(chased.x - p.playerX, chased.y - p.playerY) < 48 ? crowded + 1 : 0;
        if (crowded > 20) { relocate = pickClear(p); crowded = 0; }
      }
      if (relocate && Math.hypot(p.playerX - relocate.x, p.playerY - relocate.y) < 12) relocate = null;
      const target = relocate ?? chased;
      const here = { c: Math.floor(p.playerX / tileSize), r: Math.floor(p.playerY / tileSize) };
      const to = { c: Math.floor(target.x / tileSize), r: Math.floor(target.y / tileSize) };
      const next = nextStep(here, to) ?? to;
      const dx = (next.c + 0.5) * tileSize - p.playerX; const dy = (next.r + 0.5) * tileSize - p.playerY;
      // Допуск «на осі» — не менше 3 px і не менше 0,55 кроку минулого кадру (крок героя до 8,5 px, GAME-238): інакше на повільних кадрах герой вічно перелітає вісь.
      const tol = Math.max(3, Math.hypot(p.playerX - last.x, p.playerY - last.y) * 0.55);
      last = { x: p.playerX, y: p.playerY };
      const vertical = next.c === here.c;
      const across = vertical ? dx : dy;
      const along = vertical ? dy : dx;
      const axis = Math.abs(across) > tol ? across : along;
      const horizontal = Math.abs(across) > tol ? vertical : !vertical;
      set(horizontal ? (axis < 0 ? 'ArrowLeft' : 'ArrowRight') : (axis < 0 ? 'ArrowUp' : 'ArrowDown'));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), { id, goal, maxMs, spot: spot ?? null, act, open: OPEN, objects: OBJECTS, walls: WALLS, cols: MAP.width, rows: MAP.height, tileSize: TILE });
  if (!done) throw new Error(`не дійшов до ${id}: ${JSON.stringify(await probe(page))}`);
  return done;
}

const panel = (page: Page) => page.locator('[data-ui="story"]');
async function act(page: Page, kind: string, key = ''): Promise<void> {
  await panel(page).locator(`[data-act="${kind}"][data-key="${key}"]`).click({ timeout: 8_000 });
  await page.waitForTimeout(400);   // панель глуха ~350 мс після дії
  if (kind === 'visit' && key === 'loc.road') {   // подія в дорозі (з шансом): остання відповідь до кінця розмови
    for (let i = 0; i < 6 && await panel(page).locator('[data-ui="dialogue"]').isVisible({ timeout: 400 }).catch(() => false); i++) {
      await panel(page).locator('[data-ui="dialogue"] [data-act]').last().click();
      await page.waitForTimeout(400);
    }
  }
}

/** Старт у таборі: створити героя, пройти день 1 кнопками панелі (як story.spec), зачинити ☰ — далі лише ноги. */
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
  await page.waitForTimeout(300);
  return errors;
}

/** Портрет у рамці справжній: <img> з даними, що завантажились, і джерелом file | sprite (не іконка оповідача). */
async function portraitOk(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const img = document.querySelector<HTMLImageElement>('[data-ui="story"][data-mode="talk"] img[data-ui="portrait"]');
    return !!img && img.complete && img.naturalWidth > 0 && (img.dataset.source === 'file' || img.dataset.source === 'sprite');
  });
}

async function talkTo(page: Page, id: string, name: string): Promise<void> {
  const where: Goal = id === 'npc.elise' ? { at: ELISE } : id === 'npc.victoria' ? { follower: 0 } : id === 'npc.matthew' ? { follower: 1 } : { resident: id };
  const box = panel(page).locator('[data-ui="dialogue"]');
  // Родина тупцює коло героя, тому в грі розмова з нею — лише коли в зоні дії нікого іншого (вогнище, Еліза, предмет, МЕШКАНЕЦЬ): ідемо на чисте місце.
  // GAME-282: мешканці ходять по всьому табору (Інгрід стоїть саме на колишній фіксованій галявині 21,5×18,5, Нора й Аміна заходять і на інші), тож «чисте місце» — те,
  // що ЗАРАЗ найдалі від усіх мешканців (і від предметів мапи); його обирають за станом, а не раз і назавжди, і заново — якщо до героя хтось підійшов.
  const toClear = async (): Promise<void> => {
    const p = await probe(page);
    const spot = clearSpot(p);
    await walkToNpc(page, '', { at: spot }, 80_000, spot);
  };
  if (id === 'npc.victoria' || id === 'npc.matthew') await toClear();
  for (let attempt = 0; ; attempt++) {
    const near = await walkToNpc(page, id, where, 80_000, undefined, true);
    expect(near.nearObject).toBe(id);
    // GAME-282/298: «хто в зоні», «що над головою» і Space — один кадр сцени (усередині walkToNpc). Позначки нема — Space не тисне, і тест червоніє тут.
    expect(near.npcMarks[id] ?? 'немає', `${id}: над головою нема «…» чи «!»`).toMatch(/^(chat|request)$/);   // GAME-180: у просильників «!»
    expect(near.pressed, `${id}: Space не натиснуто`).toBe(true);
    await expect(box, `${id}: рамка розмови не відкрилась`).toBeVisible({ timeout: 8_000 }).catch(() => undefined);
    const who = (await box.isVisible()) ? await panel(page).locator('[data-ui="speaker"]').getAttribute('data-npc') : null;
    if (who === id) break;
    expect(attempt, `${id}: говорили з ${who} замість нього`).toBeLessThan(3);
    for (let i = 0; i < 12 && await box.isVisible(); i++) { await panel(page).locator('[data-act]').last().click(); await page.waitForTimeout(420); }
  }
  await expect(panel(page)).toHaveAttribute('data-mode', 'talk');
  expect(await portraitOk(page), `${id}: портрета в рамці нема`).toBe(true);
  await expect(panel(page).locator('[data-ui="speaker"]')).toHaveText(name);
  const text = (await panel(page).locator('[data-ui="line"]').textContent()) ?? '';
  expect(text.length, `${id}: порожній текст`).toBeGreaterThan(8);
  expect(text).not.toContain('⟦');
  expect((await core(page)).clock.paused, 'світ на паузі, поки говорять').toBe(true);
  // До кінця: остання відповідь у кожному вузлі.
  for (let i = 0; i < 12 && await box.isVisible(); i++) {
    await panel(page).locator('[data-act]').last().click();
    await page.waitForTimeout(420);
  }
  await expect(box, `${id}: розмова не закінчилась`).toBeHidden({ timeout: 5_000 });
  const c = await core(page);
  expect(c.game.dialogue).toBeNull();
  expect(c.clock.paused, 'після розмови світ іде далі').toBe(false);
}

test.describe('GAME-179 розмова з NPC на мапі', () => {
  test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });
  test.setTimeout(240_000);

  for (const [id, name] of CAST) {
    test(`${id}: підійшов — «…» — дія — рамка з портретом, ім'ям і текстом; розмова закінчується`, async ({ page }) => {
      const errors = await toCamp(page);
      await talkTo(page, id, name);
      expect(errors).toEqual([]);
    });
  }

  test('негативний контроль: ?hideUi=portrait — портрета нема, і перевірка це бачить', async ({ page }) => {
    await toCamp(page, '&hideUi=portrait');
    await walkToNpc(page, 'npc.elise', { at: ELISE });
    await page.keyboard.press('Space');
    await expect(panel(page).locator('[data-ui="dialogue"]')).toBeVisible({ timeout: 8_000 });
    expect(await portraitOk(page)).toBe(false);
    await expect(panel(page).locator('img[data-ui="portrait"], svg[data-ui="portrait"]')).toHaveAttribute('data-source', 'icon');
  });

  test('екран подорожі (☰): завдання від Елізи — з портретом і ім\'ям; оповідач — нейтральна іконка', async ({ page }) => {
    await toCamp(page);
    await page.locator('[data-touch="story"]').click();
    const giver = panel(page).locator('[data-ui="giver"]');
    await expect(giver.first()).toBeVisible();
    const kinds = await giver.evaluateAll((els) => els.map((e) => `${(e as HTMLElement).dataset.npc}:${e.querySelector('[data-ui="portrait"]')?.getAttribute('data-source')}`));
    expect(kinds.length).toBeGreaterThan(0);
    for (const k of kinds) expect(/^(npc\.elise:(sprite|file)|narrator:icon)$/.test(k), k).toBe(true);
  });
});

for (const [label, viewport] of [['portrait', { width: 390, height: 844 }], ['landscape', { width: 844, height: 390 }]] as const) {
  test.describe(`GAME-179 телефон ${label}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });
    test.setTimeout(240_000);

    test(`Еліза й мешканець: рамка не виходить за екран, кнопки ≥ 44 px, дотик по кнопці дії відкриває розмову (${label})`, async ({ page }) => {
      await toCamp(page);
      await walkToNpc(page, 'npc.elise', { at: ELISE });
      await page.locator('[data-touch="interact"]').tap();
      const box = page.locator('[data-ui="dialogue"]');
      await expect(box).toBeVisible({ timeout: 8_000 });
      expect(await portraitOk(page)).toBe(true);
      const geo = await page.evaluate(() => {
        const r = (sel: string): { x: number; y: number; w: number; h: number } | null => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
        return { box: r('[data-ui="dialogue"]'), btns: [...document.querySelectorAll('[data-ui="dialogue"] [data-act]')].map((b) => { const q = b.getBoundingClientRect(); return { w: q.width, h: q.height, bottom: q.bottom, right: q.right }; }), vw: innerWidth, vh: innerHeight, scrollW: document.documentElement.scrollWidth };
      });
      expect(geo.box && geo.box.x >= 0 && geo.box.x + geo.box.w <= geo.vw && geo.box.y >= 0 && geo.box.y + geo.box.h <= geo.vh, JSON.stringify(geo.box)).toBe(true);
      expect(geo.scrollW).toBeLessThanOrEqual(geo.vw);
      for (const b of geo.btns) expect(b.h, 'кнопка відповіді ≥ 44 px').toBeGreaterThanOrEqual(44);
      if (process.env.GAME179_SHOTS) { await page.waitForTimeout(1_500); await page.screenshot({ path: `research/visual-audit/talk-elise-${label}.png` }); }
      for (let i = 0; i < 12 && await box.isVisible(); i++) { await page.locator('[data-ui="dialogue"] [data-act]').last().tap(); await page.waitForTimeout(420); }
      await expect(box).toBeHidden({ timeout: 5_000 });
      // Мешканець табору — той самий рамок.
      await walkToNpc(page, 'npc.luc', { resident: 'npc.luc' });
      await page.locator('[data-touch="interact"]').tap();
      await expect(box).toBeVisible({ timeout: 8_000 });
      expect(await portraitOk(page)).toBe(true);
      if (process.env.GAME179_SHOTS) { await page.waitForTimeout(1_500); await page.screenshot({ path: `research/visual-audit/talk-luc-${label}.png` }); }
    });
  });
}
