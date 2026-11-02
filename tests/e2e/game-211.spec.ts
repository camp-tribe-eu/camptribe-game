// GAME-211 «Характери» · у справжньому браузері: сусід табору о різний час доби стоїть у різних місцях, і ці місця — зони з його картки
// (content/npcs.json → card.schedule.<пора>.zone). Час доби задає ?atMinute (перемикач e2e): ранок 7:00, вечір 19:00.
// Мутації (перевірено, див. PR): у RESIDENTS зсунути стоянку мешканця в іншу зону (ambient.ts) → «у зоні з картки» червоніє; зробити розклад сталим
// (placeAt без часу) → «вранці й увечері в різних місцях» червоніє; видалити зону з картки в npcs.json → тест видає, що картки нема.
// Рядок «після допомоги ≠ без неї» доводить ядро на справжньому контенті — src/content/requests.test.ts (GAME-211): у браузері повний прохід прохання
// покриває game-180.spec; тут його не дублюємо.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { waitGameReady } from './ready';

interface Resident { id: string; x: number; y: number; moving: boolean }
const TILE = 32;
const MORNING = 420;   // 7:00 — SCHEDULE_MINUTES.morning у src/view/world/ambient.ts
const EVENING = 1140;  // 19:00 — SCHEDULE_MINUTES.evening
/** Зони табору: дзеркало ZONES з ambient.ts (прямокутник у клітинках і якір); узгодженість стереже npc-cards.test (картка ↔ розклад) і ambient.test. */
const ZONES: Record<string, { c0: number; r0: number; c1: number; r1: number; a: [number, number] }> = {
  'tents-old': { c0: 0, r0: 1, c1: 9, r1: 10, a: [1, 5] }, campfire: { c0: 1, r0: 3, c1: 5, r1: 6, a: [3, 5] }, reception: { c0: 13, r0: 3, c1: 17, r1: 6, a: [15, 6] },
  sanitary: { c0: 21, r0: 3, c1: 25, r1: 6, a: [23, 6] }, shore: { c0: 24, r0: 6, c1: 27, r1: 10, a: [27, 8] }, pier: { c0: 28, r0: 6, c1: 36, r1: 8, a: [35, 7] },
  'tents-south': { c0: 0, r0: 13, c1: 13, r1: 19, a: [4, 16] }, 'forest-path': { c0: 18, r0: 8, c1: 19, r1: 15, a: [19, 13] }, clearing: { c0: 14, r0: 16, c1: 25, r1: 20, a: [21, 18] },
};
const zoneOf = (p: { x: number; y: number }): string => {
  const c = Math.floor(p.x / TILE); const r = Math.floor(p.y / TILE);
  const inside = Object.entries(ZONES).find(([, z]) => c >= z.c0 && c <= z.c1 && r >= z.r0 && r <= z.r1);
  if (inside) return inside[0];
  return Object.entries(ZONES).sort(([, a], [, b]) => Math.hypot(a.a[0] - c, a.a[1] - r) - Math.hypot(b.a[0] - c, b.a[1] - r))[0]?.[0] ?? '';
};
const CARDS = new Map((JSON.parse(readFileSync(new URL('../../content/npcs.json', import.meta.url), 'utf8')) as { id: string; card?: { schedule: Record<string, { zone?: string }> } }[]).map((n) => [n.id, n.card] as const));

async function residentsAt(page: Page, minute: number): Promise<Resident[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/?seed=2&atMinute=${minute}`);
  await waitGameReady(page);
  const list = await page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __game: { probe: { residents: Resident[] } } }).__game.probe.residents)) as Resident[]);
  expect(errors).toEqual([]);
  return list;
}

test.describe('GAME-211 · сусід у різних місцях у різний час доби', () => {
  test('вранці (7:00) і ввечері (19:00) кожен мешканець табору — в іншому місці, і це зони з його картки', async ({ page }) => {
    test.setTimeout(90_000);
    const morning = await residentsAt(page, MORNING);
    const evening = await residentsAt(page, EVENING);
    expect(morning.length, 'мешканців нема — тест нічого не доводить').toBeGreaterThanOrEqual(4);
    const report: string[] = [];
    for (const m of morning) {
      const e = evening.find((x) => x.id === m.id);
      expect(e, `${m.id} є і ввечері`).toBeDefined();
      if (!e) continue;
      const dist = Math.hypot(e.x - m.x, e.y - m.y) / TILE;
      const card = CARDS.get(m.id);
      expect(card, `${m.id}: картка`).toBeDefined();
      report.push(`${m.id}: ${zoneOf(m)} → ${zoneOf(e)} (${dist.toFixed(0)} кл.)`);
      expect(dist, `${m.id}: вранці й увечері в різних місцях (${dist.toFixed(1)} клітинок)`).toBeGreaterThanOrEqual(4);
      expect(zoneOf(m), `${m.id}: вранці — у зоні з картки`).toBe(card?.schedule.morning?.zone);
      expect(zoneOf(e), `${m.id}: ввечері — у зоні з картки`).toBe(card?.schedule.evening?.zone);
    }
    console.log(`GAME-211 ранок → вечір: ${report.join('; ')}`);
  });
});
