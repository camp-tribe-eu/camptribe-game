// GAME-335 · місця справ на мапі табору (зразковий день): дійти до свого місця пішки й натиснути дію — відкривається ТА САМА панель рутини, що й з дошки;
// виконавець (родина, не герой-тато) стоїть біля місця й працює, поки справа в роботі; перший кадр табору каже, де шукати справи. Обидві орієнтації.
// Початок — справжній сейв «табір, день ще не почався» (fixtures/sample-camp.json, його записала ГРА: G335_WRITE=1 npx playwright test game-314 -g portrait).
// Мутації, що червонять цей файл: місце справи не підключене до дії (main.ts actOnMap: гілка station) · виконавці не стають на місця (posts → []).
// Знімки — research/game-335/ за G335_SHOTS=1.
import { mkdirSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { waitGameReady } from './ready';
import { walkInPage } from './walk.helpers';
import { STATIONS } from '../../src/content/camp-stations';
import { ROUTINE_IDS, ROUTINES } from '../../src/content/camp-day';

interface Pt { x: number; y: number }
interface Probe { playerX: number; playerY: number; nearObject: string | null; followers: Pt[]; jobs: ({ kind: string; phase: string } | null)[]; markerIcons: Record<string, string> }
const probe = (page: Page): Promise<Probe> => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __game: { probe: Probe } }).__game.probe)) as Probe);
const SHOTS = process.env.G335_SHOTS === '1';
const SHOT_DIR = 'research/game-335';
if (SHOTS) mkdirSync(SHOT_DIR, { recursive: true });
const shot = async (page: Page, name: string): Promise<void> => { if (SHOTS) await page.screenshot({ path: `${SHOT_DIR}/${name}-${(page.viewportSize()?.width ?? 0) < (page.viewportSize()?.height ?? 0) ? 'portrait' : 'landscape'}.png` }); };
const SAVE = (JSON.parse(readFileSync(new URL('./fixtures/sample-camp.json', import.meta.url), 'utf8')) as { save: string }).save;
const TILE = 32;
interface TiledMap { width: number; layers: { name: string; data?: number[] }[] }
const MAP = JSON.parse(readFileSync(new URL('../../public/maps/camp-lake.tmj', import.meta.url), 'utf8')) as TiledMap;
const WALLS = MAP.layers.find((l) => l.name === 'walls')?.data ?? [];
/** Ходьба в зоні дії (INTERACT_RANGE = 1,5 клітинки), але виконавець стає на сусідню клітинку. */
const NEAR = TILE * 2.2;

/** Зразковий день із сейву: табір, заїзд зроблено, день ще не почався. Сейв кладе слот зразка (camplife-sample) — звичайний не чіпаємо. */
async function openCamp(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?seed=7&sampleDay=1');
  await waitGameReady(page);
  await page.evaluate((json) => new Promise<void>((resolve, reject) => {
    const req = indexedDB.open('camplife-sample', 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => { const tx = req.result.transaction('saves', 'readwrite'); tx.objectStore('saves').put(json, 'main'); tx.oncomplete = () => { req.result.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
  }), SAVE);
  await page.goto('/?seed=7&sampleDay=1');
  await waitGameReady(page);
  await expect(page.locator('[data-ui="sd-board"]'), 'сейв відкрив день у таборі').toBeVisible({ timeout: 10_000 });
  return errors;
}

const ORIENTATIONS = [
  { name: 'portrait', viewport: { width: 390, height: 844 } },
  { name: 'landscape', viewport: { width: 932, height: 430 } },
] as const;

for (const o of ORIENTATIONS) {
  test.describe(`GAME-335 місця справ — ${o.name} ${o.viewport.width}×${o.viewport.height}`, () => {
    test.use({ viewport: o.viewport, hasTouch: true, isMobile: false });
    test.setTimeout(240_000);

    test('підказка → дійти до місця «Вогонь» → дія відкриває панель рутини; мама стоїть біля вогнища й працює; дошка теж працює', async ({ page }) => {
      const errors = await openCamp(page);
      // 3. Підказка на першому кадрі табору — лаконічна, не накриває кнопок.
      const hint = page.locator('[data-ui="sd-station-hint"]');
      await expect(hint).toBeVisible();
      await expect(hint).toHaveText('Справи — біля своїх місць у таборі');
      const hb = await hint.boundingBox();
      for (const sel of ['[data-ui="sd-board"]', '.touch-stick', '.touch-interact', '[data-ui="goal"]', '[data-ui="hud-time"]']) {
        const b = await page.locator(sel).first().boundingBox().catch(() => null);
        if (hb && b) expect(hb.x + hb.width <= b.x || b.x + b.width <= hb.x || hb.y + hb.height <= b.y || b.y + b.height <= hb.y, `підказка не лягає на ${sel}`).toBe(true);
      }
      await shot(page, 'hint');
      // 1. Кожна ручна рутина має місце з власною піктограмою на мапі табору.
      const icons = (await probe(page)).markerIcons;
      for (const id of ROUTINE_IDS.filter((r) => STATIONS[r].spot.startsWith('station.'))) expect(icons[STATIONS[id].spot], `піктограма місця «${id}»`).toBe(STATIONS[id].icon);
      expect(await page.locator('[data-ui="camp-work"], [data-ui="camp-board"]').count(), 'до дії панелі рутин не відкриті').toBe(0);
      // Мама — власниця «Вогню»: у строю, не на посту.
      expect((await probe(page)).jobs.every((j) => j === null), 'до справи ніхто не стоїть на посту').toBe(true);

      // 2. Пішки до місця «Вогонь» і дія (Space) у кадрі, де воно — найближча ціль.
      const fire = STATIONS.fire;
      await walkInPage(page, { label: 'до місця «Вогонь»', to: fire.at, act: { id: fire.spot, key: 'Space' } });
      await expect(page.locator('[data-ui="camp-work"][data-kind="fire"]'), 'дія біля місця відкрила панель «Вогонь»').toBeVisible({ timeout: 5_000 });
      await expect(page.locator('[data-ui="camp-work"]'), 'одна панель, а не дві').toHaveCount(1);
      await expect(hint, 'після першої справи підказки нема').toHaveCount(0);
      await shot(page, 'fire-panel');

      // Виконавиця (мама) іде до вогнища й працює там, поки справа в роботі.
      const owner = ROUTINES.fire.owner;
      expect(owner).toBe('victoria');
      await expect.poll(async () => { const p = await probe(page); const f = p.followers[0]; return { phase: p.jobs[0]?.phase ?? null, kind: p.jobs[0]?.kind ?? null, near: f ? Math.hypot(f.x - fire.at.x, f.y - fire.at.y) <= NEAR : false }; }, { timeout: 45_000, message: 'мама стоїть біля місця справи й працює' }).toEqual({ phase: 'work', kind: 'post', near: true });
      expect((await probe(page)).jobs[1], 'син вільний, у строю').toBeNull();

      // Дошка лишається оглядом: закрити панель, світ видно — мама на місці; кнопка дошки повертає ту саму роботу, а не другу.
      await page.locator('[data-ui="sd-board-close"]').tap();
      await expect(page.locator('[data-ui="sd-board-wrap"]')).toBeHidden();
      await shot(page, 'fire-at-station');
      const p2 = await probe(page);
      expect(p2.jobs[0]?.kind, 'справа в роботі — мама лишається на посту').toBe('post');
      await page.locator('[data-ui="sd-board"]').tap();
      await expect(page.locator('[data-ui="camp-work"][data-kind="fire"]')).toHaveCount(1);
      expect(errors, 'помилок сторінки нема').toEqual([]);
    });

    test('на кожному місці найближча ціль — саме воно (серед УСІХ живих об\'єктів табору); на березі риболовля руками не заглушена', async ({ page }) => {
      const errors = await openCamp(page);
      // Стоїмо НА місці й поруч (колом 24 px, лише прохідні клітинки): найближчою ціллю має бути місце, а не чужий живий об'єкт (сміття, намет, сусід-ціль…).
      // Мешканець (npc.*) ходить сам — його випадкову появу поруч не рахуємо збоєм місця.
      for (const id of ROUTINE_IDS) {
        const st = STATIONS[id];
        for (const [dx, dy] of [[0, 0], [24, 0], [-24, 0], [0, 24], [0, -24]] as const) {
          const to = { x: st.at.x + dx, y: st.at.y + dy };
          if ((WALLS[Math.floor(to.y / TILE) * MAP.width + Math.floor(to.x / TILE)] ?? 0) > 0) continue;
          await walkInPage(page, { label: `біля місця «${id}» (${dx},${dy})`, to, until: [{ within: 3 }] });
          const near = (await probe(page)).nearObject;
          if (near?.startsWith('npc.')) continue;
          expect(near, `біля місця «${id}» (${dx},${dy}) дія — його, а не чужого об'єкта`).toBe(st.spot);
        }
      }
      await walkInPage(page, { label: 'на берег рибалки', to: { x: 880, y: 400 }, until: [{ within: 3 }] });
      expect((await probe(page)).nearObject ?? '', 'біля fish.shore місця справи нема — риболовля руками вільна (поруч може стояти лише родина)').not.toMatch(/^station\./);
      expect(errors).toEqual([]);
    });

    test('місце справи тата (він — герой): дія відкриває «Вузли», виконавців на мапі не додається', async ({ page }) => {
      const errors = await openCamp(page);
      const knots = STATIONS.knots;
      await walkInPage(page, { label: 'до місця «Вузли»', to: knots.at, act: { id: knots.spot, key: 'Space' } });
      await expect(page.locator('[data-ui="camp-work"][data-kind="knots"]')).toBeVisible({ timeout: 5_000 });
      await page.locator('[data-ui="sd-board-close"]').tap();
      await shot(page, 'knots-at-station');
      expect((await probe(page)).jobs, 'тато — це гравець: на пост нікого не ставимо').toEqual([null, null]);
      expect(errors).toEqual([]);
    });
  });
}
