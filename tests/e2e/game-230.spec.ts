// GAME-230 · дружба й подарунки: героєві дають дар → у розмові з Норою «Подарувати» → ♥ над нею, дзвіночок, поза «вручаю» рівно 30 кадрів →
// очки → о 15:00–18:00 у таборі сама відкривається сцена серця, і вдруге вона не з'являється; другий подарунок того ж дня неможливий.
// Обидві орієнтації (390×844, 844×390) + знімки 9:16, 1:1, 16:9 (каталог — змінна G230_SHOTS, за замовчуванням test-results/g230).
// Стан «є ягоди, Нора на 1 серці» готуємо в сейві (inventory + friend), а не вигадуємо кнопку: шлях гри — приїзд у табір кнопками день 1, далі лише ноги й кнопки рамки розмови.
// Мутації (перевірено, див. PR): прибрати «Подарувати» з рамки → «кнопка є» червоніє; heart-хук не шле HeartEvent → «сцена серця відкрилась» червоніє.
import { readFileSync, mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { stateHash } from '../../src/core/hash';
import { arriveInCamp } from './camp-arrival';
import { core, probe as baseProbe } from './chapter-driver';
import { waitGameReady } from './ready';

const SHOTS = process.env.G230_SHOTS ?? 'test-results/g230';
const VIEWS = [{ side: 'portrait', w: 390, h: 844 }, { side: 'landscape', w: 844, h: 390 }] as const;
const RATIOS = [{ side: '9x16', w: 360, h: 640 }, { side: '1x1', w: 600, h: 600 }, { side: '16x9', w: 800, h: 450 }] as const;
const TILE = 32;
interface Pt { x: number; y: number }
interface GiftP { count: number; npc: string | null; reaction: string | null; emote: string | null; poseAge: number; poseColumn: number | null; poseFrames: number; sounds: string[] }
interface P { playerX: number; playerY: number; nearObject: string | null; saveLoaded: boolean; residents: { id: string; x: number; y: number }[]; neighbours: { id: string; emote: string | null; emoteAge: number }[]; gift: GiftP }
const probe = (page: Page): Promise<P> => baseProbe(page) as unknown as Promise<P>;
interface Friend { pts: Record<string, number>; gift: Record<string, number>; seen: string[] }
interface Sim { game: { friend?: Friend; inventory: Record<string, number>; dialogue: { id: string } | null }; clock: { minutes: number; accMs: number; paused: boolean } }
const sim = (page: Page): Promise<Sim> => core(page) as unknown as Promise<Sim>;
const shot = async (page: Page, name: string): Promise<void> => { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

interface TiledMap { width: number; height: number; layers: { name: string; data?: number[] }[] }
const MAP = JSON.parse(readFileSync(new URL('../../public/maps/camp-lake.tmj', import.meta.url), 'utf8')) as TiledMap;
const WALLS = MAP.layers.find((l) => l.name === 'walls')?.data ?? [];
const solid = (c: number, r: number): boolean => c < 0 || r < 0 || c >= MAP.width || r >= MAP.height || (WALLS[r * MAP.width + c] ?? 0) > 0;
const tile = (p: Pt): { c: number; r: number } => ({ c: Math.floor(p.x / TILE), r: Math.floor(p.y / TILE) });
function nextStep(from: { c: number; r: number }, to: { c: number; r: number }): { c: number; r: number } | null {
  const key = (c: number, r: number): number => r * MAP.width + c;
  const prev = new Map<number, number>([[key(from.c, from.r), -1]]);
  const q = [from];
  for (let i = 0; i < q.length; i++) {
    const t = q[i] as { c: number; r: number };
    if (t.c === to.c && t.r === to.r) {
      const path: number[] = [];
      for (let k = key(t.c, t.r); k >= 0; k = prev.get(k) ?? -1) path.unshift(k);
      const n = path[1];
      return n === undefined ? null : { c: n % MAP.width, r: Math.floor(n / MAP.width) };
    }
    for (const [dc, dr] of [[0, -1], [-1, 0], [0, 1], [1, 0]] as const) {
      const c = t.c + dc; const r = t.r + dr;
      if (solid(c, r) || prev.has(key(c, r))) continue;
      prev.set(key(c, r), key(t.c, t.r)); q.push({ c, r });
    }
  }
  return null;
}
async function walk(page: Page, where: (p: P) => Pt, done: (p: P) => boolean, label: string, maxMs = 70_000): Promise<P> {
  const keys = { ArrowLeft: false, ArrowRight: false, ArrowUp: false, ArrowDown: false };
  const set = async (want: Partial<typeof keys>): Promise<void> => {
    for (const k of Object.keys(keys) as (keyof typeof keys)[]) { const on = want[k] === true; if (on !== keys[k]) { keys[k] = on; await (on ? page.keyboard.down(k) : page.keyboard.up(k)); } }
  };
  const start = Date.now();
  try {
    while (Date.now() - start < maxMs) {
      const p = await probe(page);
      if (done(p)) return p;
      const here = tile({ x: p.playerX, y: p.playerY });
      const next = nextStep(here, tile(where(p))) ?? tile(where(p));
      const dx = (next.c + 0.5) * TILE - p.playerX; const dy = (next.r + 0.5) * TILE - p.playerY;
      const vertical = next.c === here.c;
      const across = vertical ? dx : dy; const along = vertical ? dy : dx;
      const axis = Math.abs(across) > 3 ? across : along;
      const horizontal = Math.abs(across) > 3 ? vertical : !vertical;
      await set(horizontal ? { ArrowLeft: axis < 0, ArrowRight: axis > 0 } : { ArrowUp: axis < 0, ArrowDown: axis > 0 });
      await page.waitForTimeout(20);
    }
  } finally { await set({}); }
  throw new Error(`${label}: не дійшов: ${JSON.stringify(await probe(page))}`);
}

/** Записати сейв (основний слот IndexedDB) зі зміненим станом і перезавантажити гру з нього. */
async function reloadWith(page: Page, patch: (s: Sim) => void): Promise<void> {
  const s = JSON.parse(JSON.stringify(await sim(page))) as Sim & Record<string, unknown>;
  patch(s);
  const text = JSON.stringify({ format: 'camplife-save', schemaVersion: 3, checksum: stateHash(s as never), accountId: null, contentRev: null, sim: s });
  await page.evaluate((json) => new Promise<void>((resolve, reject) => {
    const req = indexedDB.open('camplife', 1);
    req.onsuccess = () => { const tx = req.result.transaction('saves', 'readwrite'); tx.objectStore('saves').put(json, 'main'); tx.oncomplete = () => { req.result.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
    req.onerror = () => reject(req.error);
  }), text);
  await page.goto('/?seed=7&mapFirst=1&noAutosave=1');
  await waitGameReady(page);
  await page.locator('[data-ui="recovery-close"]').click({ timeout: 800 }).catch(() => undefined);
}

const panel = (page: Page) => page.locator('[data-ui="story"]');
const box = (page: Page) => panel(page).locator('[data-ui="dialogue"]');
async function closeTalk(page: Page): Promise<void> {
  for (let i = 0; i < 12 && await box(page).isVisible(); i++) {
    const last = panel(page).locator('[data-act]:not([data-act="gift-open"]):not([data-act="gift"])').last();
    await last.click(); await page.waitForTimeout(420);
  }
  await expect(box(page)).toBeHidden({ timeout: 5_000 });
}
async function talkTo(page: Page, id: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    await walk(page, (p) => p.residents.find((x) => x.id === id) as Pt, (p) => p.nearObject === id, id);
    if ((await probe(page)).nearObject === id) await page.keyboard.press('Space');
    await expect(box(page)).toBeVisible({ timeout: 8_000 }).catch(() => undefined);
    const who = (await box(page).isVisible()) ? await panel(page).locator('[data-ui="speaker"]').getAttribute('data-npc') : null;
    if (who === id) return;
    expect(attempt, `${id}: говорили з ${who}`).toBeLessThan(4);
    if (await box(page).isVisible()) await closeTalk(page);
  }
}

for (const v of VIEWS) {
  test(`дар ягід Норі: «Подарувати» → ♥, дзвіночок, 30 кадрів пози → сцена серця раз; вдруге того ж дня — без кнопки — ${v.side}`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: v.w, height: v.h });
    const errors = await arriveInCamp(page);
    // 15:30 за годинником гри (хвилина доби 450 від 8:00), у герої 2 ягоди й шишка, Нора на 3 очках (одне серце: сцена з двох — після подарунка).
    await reloadWith(page, (s) => {
      const day = Math.floor(s.clock.minutes / 1440) + (s.clock.minutes % 1440 > 450 ? 1 : 0);
      s.clock.minutes = day * 1440 + 450; s.clock.accMs = 0;
      s.game.inventory = { ...s.game.inventory, 'item.berries': 2, 'item.pine-cone': 1 };
      s.game.friend = { pts: { 'npc.nora': 3 }, gift: {}, seen: [] };
    });
    expect((await sim(page)).game.friend?.pts['npc.nora']).toBe(3);
    await talkTo(page, 'npc.nora');
    await shot(page, `talk-${v.side}`);
    // Кнопка «Подарувати» є; розгортає список (ягоди, шишка); дрова не пропонуються (їх у герої нема).
    const open = panel(page).locator('[data-act="gift-open"]');
    await expect(open, 'кнопка «Подарувати» в рамці розмови').toBeVisible();
    await page.waitForTimeout(500);   // глухота ~350 мс після появи рамки (щоб «дія» з мапи не влучила в кнопку)
    await open.click();
    await expect(panel(page).locator('[data-act="gift"]')).toHaveCount(2);
    await shot(page, `gift-list-${v.side}`);
    await panel(page).locator('[data-act="gift"][data-key="item.berries"]').click();
    // Дар закінчує розмову: рамка зникає, світ іде далі — і видно реакцію, а не рамку поверх мапи.
    await expect(box(page)).toBeHidden({ timeout: 5_000 });
    // Реакція: ♥ над Норою, дзвіночок, поза героя 30 кадрів (лічильник кадрів, а не годинник).
    await expect.poll(async () => (await probe(page)).gift.count, { timeout: 5_000 }).toBe(1);
    const g = (await probe(page)).gift;
    expect([g.npc, g.reaction, g.emote]).toEqual(['npc.nora', 'liked', 'heart']);
    expect(g.sounds, 'дзвіночок').toContain('bell');
    await expect.poll(async () => (await probe(page)).neighbours.find((n) => n.id === 'npc.nora')?.emote, { timeout: 3_000 }).toBe('heart');
    await shot(page, `reaction-${v.side}`);
    await expect.poll(async () => (await probe(page)).gift.poseAge, { timeout: 5_000 }).toBe(-1);
    expect((await probe(page)).gift.poseFrames, 'поза «вручаю» рівно 30 кадрів').toBe(30);
    const afterGift = await sim(page);
    expect(afterGift.game.friend?.pts['npc.nora']).toBe(5);
    expect(afterGift.game.inventory['item.berries']).toBe(1);
    // Другий подарунок того ж дня — неможливо: заговорили знову, а кнопки «Подарувати» вже немає (ядро відмовило б GRANT_ALREADY_GIVEN).
    if (v.side === 'portrait') for (const r of RATIOS) { await page.setViewportSize({ width: r.w, height: r.h }); await page.waitForTimeout(500); await shot(page, `reaction-${r.side}`); }
    await page.setViewportSize({ width: v.w, height: v.h });
    // Година 15:30 і два серця: щойно догорить реакція, сцена Нори відкривається сама.
    await expect.poll(async () => (await sim(page)).game.dialogue?.id ?? null, { message: 'сцена серця відкрилась', timeout: 15_000 }).toBe('dlg.heart-nora');
    await expect(panel(page).locator('[data-ui="line"]')).toContainText('Нора');
    await shot(page, `heart-${v.side}`);
    for (let i = 0; i < 14 && (await sim(page)).game.dialogue !== null; i++) {
      await panel(page).locator('[data-act]').first().click(); await page.waitForTimeout(450);
    }
    expect((await sim(page)).game.dialogue).toBeNull();
    expect((await sim(page)).game.friend?.seen).toEqual(['npc.nora']);
    await talkTo(page, 'npc.nora');
    await page.waitForTimeout(500);
    await expect(panel(page).locator('[data-act="gift-open"]'), 'сьогодні Нора вже отримала подарунок').toHaveCount(0);
    await closeTalk(page);
    // Вдруге не відкривається, скільки б ми не стояли в таборі.
    await page.waitForTimeout(3_000);
    expect((await sim(page)).game.dialogue, 'сцена серця не повторилась').toBeNull();
    expect(errors).toEqual([]);
  });
}
