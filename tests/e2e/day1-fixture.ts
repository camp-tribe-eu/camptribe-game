// GAME-255 · СПРАВЖНІЙ стан «кінець дня 1, велосипедист, ранок дня 2» для довгих e2e розділу (story.spec, world.spec).
// Фікстура — не вигаданий стан, а сейв, який ГРА записала сама, коли її пройшли кліками (частина A кожного тесту):
//   G255_WRITE=1 npx playwright test tests/e2e/story.spec.ts -g "день 1"   → переписує tests/e2e/fixtures/day1-bike.json.
// Щоб фікстура не застаріла мовчки, КОЖНА частина A після проходу звіряє зі своїм станом проекцію (projection): квести, нагороди,
// прапорці, місце, транспорт. Змінився контент дня 1 — частина A червоніє, частина B лишається на старому стані лише до перезапису.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import { waitGameReady } from './ready';

const FILE = new URL('./fixtures/day1-bike.json', import.meta.url);

interface Snap { game: { quests: Record<string, { status: string }>; grants: string[]; flags: string[]; campaignEnded: boolean; player: { locationId: string | null; transportId: string } | null }; journal: { type: string }[] }
const read = (page: Page): Promise<Snap> => page.evaluate(() => (window as unknown as { __game: { read: () => Snap } }).__game.read());

/** Що однакове в будь-якому проході дня 1 (без годинника, RNG і подій дороги — вони залежать від прожитих кадрів). */
export function projection(s: Snap): unknown {
  return {
    quests: Object.fromEntries(Object.entries(s.game.quests).map(([k, v]) => [k, v.status]).sort()),
    grants: [...s.game.grants].sort(),
    flags: s.game.flags.filter((f) => !/road/.test(f)).sort(),
    player: s.game.player,
    ended: s.game.campaignEnded,
    memory: s.journal.filter((e) => e.type === 'Memory').length,
  };
}

interface Fixture { projection: unknown; save: string }
const fixture = (): Fixture => JSON.parse(readFileSync(FILE, 'utf8')) as Fixture;

const mainSlot = (page: Page): Promise<string> => page.evaluate(() => new Promise<string>((resolve, reject) => {
  const req = indexedDB.open('camplife', 1);
  req.onerror = () => reject(req.error);
  req.onsuccess = () => { const r = req.result.transaction('saves').objectStore('saves').get('main'); r.onsuccess = () => { req.result.close(); resolve(String(r.result)); }; };
}));

/** Частина A: після проходу дня 1 — звірити стан із фікстурою (або, з G255_WRITE=1, переписати її з сейву гри). */
export async function checkOrWriteDay1(page: Page): Promise<void> {
  const now = projection(await read(page));
  if (process.env.G255_WRITE === '1' || !existsSync(FILE)) {
    await expect.poll(async () => (await mainSlot(page)).includes('"campaignEnded":false'), { timeout: 5_000 }).toBe(true);
    writeFileSync(FILE, `${JSON.stringify({ projection: now, save: await mainSlot(page) })}\n`);
    return;
  }
  expect(now, 'частина B стартує зі збереженого стану дня 1 — він розійшовся з проходом: перезапиши G255_WRITE=1').toEqual(fixture().projection);
}

/** Частина B: покласти фікстуру в основний слот сховища й завантажити гру з неї (як після F5). */
export async function seedDay1(page: Page, query = '', edit?: (save: string) => string): Promise<void> {
  await page.goto(`/${query}`);
  await waitGameReady(page);
  await page.evaluate((json) => new Promise<void>((resolve, reject) => {
    const req = indexedDB.open('camplife', 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => { const tx = req.result.transaction('saves', 'readwrite'); tx.objectStore('saves').put(json, 'main'); tx.oncomplete = () => { req.result.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
  }), edit ? edit(fixture().save) : fixture().save);
  await page.goto(`/${query}`);
  await waitGameReady(page);
}
