// GAME-226 · «Живі сусіди»: вранці сусіди за справами, о 19:00 сидять біля своїх наметів, вночі сплять із «Z»; махають раз на добу при першому наближенні;
// герой, що довго стоїть на шляху, дістає «?» і м'який обхід. Обидві орієнтації (390×844, 844×390) + пропорції 9:16, 1:1, 16:9 (знімки — G226_SHOTS).
// Час: ?atMinute=N — хвилини ядра від 8:00 (на екрані 8:00 + N): 180 → 11:00, 660 → 19:00, 900 → 23:00. Мапа табору без сюжету: ?map=camp.
import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { probe } from './chapter-driver';
import { waitGameReady } from './ready';

const SHOTS = process.env.G226_SHOTS;
const SETTINGS_KEY = 'camplife.settings.v1';
const VIEWS = [{ side: 'portrait', w: 390, h: 844 }, { side: 'landscape', w: 844, h: 390 }] as const;
const RATIOS = [{ side: '9x16', w: 360, h: 640 }, { side: '1x1', w: 600, h: 600 }, { side: '16x9', w: 800, h: 450 }] as const;
interface N { id: string; state: string; phase: string; x: number; y: number; emote: string | null; emoteAge: number; waveDay: number; waves: number; pages: number; off: { x: number; y: number }; sitting: boolean }
const nb = (page: Page): Promise<N[]> => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __game: { probe: { neighbours: unknown } } }).__game.probe.neighbours)) as N[]);
const one = async (page: Page, id: string): Promise<N> => { const n = (await nb(page)).find((x) => x.id === id); if (!n) throw new Error(id); return n; };
const shot = async (page: Page, name: string, side: string): Promise<void> => { if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${name}-${side}.png` }); } };

async function open(page: Page, atMinute: number, w: number, h: number): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(([k]) => { try { localStorage.setItem(k as string, JSON.stringify({ textScale: 100, language: 'uk', hintSeen: true })); } catch { /* сховища немає */ } }, [SETTINGS_KEY] as const);
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`/?seed=2&map=camp&noAutosave=1&atMinute=${atMinute}`);
  await waitGameReady(page);
  await page.waitForTimeout(600);
  return errors;
}
const MORNING = 180;   // 11:00
const EVENING = 660;   // 19:00
const NIGHT = 900;     // 23:00

for (const v of VIEWS) {
  test(`вранці й о 19:00 сусід — в іншому стані й місці: удень за справою, ввечері сидить біля намету — ${v.side}`, async ({ page }) => {
    test.setTimeout(90_000);
    const errors = await open(page, MORNING, v.w, v.h);
    const day = await nb(page);
    expect(day.length, 'сусідів нема — тест нічого не доводить').toBe(6);
    expect(day.every((n) => n.phase === 'out'), `удень усі за розкладом: ${day.map((n) => n.state).join(',')}`).toBe(true);
    expect(day.some((n) => ['look', 'read', 'work', 'sit', 'stand', 'wave'].includes(n.state)), 'хтось робить справу').toBe(true);
    await shot(page, 'morning-11h', v.side);
    await page.goto(`/?seed=2&map=camp&noAutosave=1&atMinute=${EVENING}`);
    await waitGameReady(page);
    await page.waitForTimeout(600);
    const eve = await nb(page);
    expect(eve.every((n) => n.phase === 'home' && n.state === 'sit'), `о 19:00 усі біля наметів: ${eve.map((n) => `${n.state}/${n.phase}`).join(',')}`).toBe(true);
    for (const d of day) {
      const e = eve.find((n) => n.id === d.id) as N;
      expect(Math.hypot(e.x - d.x, e.y - d.y) / 32, `${d.id}: удень і ввечері в різних місцях`).toBeGreaterThanOrEqual(3);
    }
    expect(eve.every((n) => n.sitting), 'сидять (ноги сховані)').toBe(true);
    // Герой на старті поруч із наметами Аміни й Нори (3,2) і (4,3) — на знімку їх видно.
    await shot(page, 'evening-19h', v.side);
    expect(errors).toEqual([]);
  });

  test(`вночі (23:00) сусіди сплять із «Z», а дихання — 1 px — ${v.side}`, async ({ page }) => {
    test.setTimeout(60_000);
    const errors = await open(page, NIGHT, v.w, v.h);
    const ns = await nb(page);
    expect(ns.every((n) => n.state === 'sleep' && n.phase === 'home'), ns.map((n) => n.state).join(',')).toBe(true);
    await expect.poll(async () => (await nb(page)).filter((n) => n.emote === 'zzz').length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    const ys = new Set<number>();
    for (let i = 0; i < 14; i++) { ys.add(Math.round((await one(page, 'npc.amina')).y)); await page.waitForTimeout(300); }
    expect(ys.size, 'дихання: спрайт піднімається й опускається на 1 px').toBe(2);
    await shot(page, 'night-23h', v.side);
    expect(errors).toEqual([]);
  });

  test(`махає раз на добу при першому наближенні; герой на шляху надовго — «?» і обхід — ${v.side}`, async ({ page }) => {
    test.setTimeout(90_000);
    const errors = await open(page, 78, v.w, v.h);   // Сара стоїть біля лавки під вогнищем (клітинка 3,5) з хвилини 78 до 118; герой на старті за ~80 px
    await expect.poll(async () => (await one(page, 'npc.sarah')).state, { timeout: 4_000 }).toBe('wave');
    await expect.poll(async () => (await one(page, 'npc.sarah')).emote, { timeout: 2_000 }).toBe('heart');
    await shot(page, 'wave', v.side);
    await page.waitForTimeout(2_500);
    const after = await one(page, 'npc.sarah');
    expect(after.waves, 'махнула один раз, хоч герой поруч').toBe(1);
    expect(after.state).not.toBe('wave');
    // Герой підходить упритул і стоїть.
    await page.keyboard.down('ArrowLeft');
    await expect.poll(async () => (await probe(page)).playerX, { timeout: 4_000 }).toBeLessThan(128);
    await page.keyboard.up('ArrowLeft');
    await expect.poll(async () => (await one(page, 'npc.sarah')).state, { timeout: 20_000 }).toBe('around');
    await expect.poll(async () => (await one(page, 'npc.sarah')).emote, { timeout: 2_000 }).toBe('ask');
    await page.waitForTimeout(1_200);
    const around = await one(page, 'npc.sarah');
    expect(Math.hypot(around.off.x, around.off.y), 'відступила вбік').toBeGreaterThan(8);
    await shot(page, 'around', v.side);
    expect(errors).toEqual([]);
  });
}

for (const r of RATIOS) {
  test(`знімки в пропорції ${r.side}: удень, ввечері, вночі`, async ({ page }) => {
    test.setTimeout(90_000);
    const errors = await open(page, MORNING, r.w, r.h);
    await shot(page, 'morning-11h', r.side);
    for (const [m, name] of [[EVENING, 'evening-19h'], [NIGHT, 'night-23h']] as const) {
      await page.goto(`/?seed=2&map=camp&noAutosave=1&atMinute=${m}`);
      await waitGameReady(page);
      await page.waitForTimeout(900);
      await shot(page, name, r.side);
    }
    expect(errors).toEqual([]);
  });
}
