// GAME-211 · картки персонажів (content/npcs.json → card) ↔ розклад руху мешканців (ambient.ts). Одне джерело правди про «де мешканець»:
// функція часу placeAt; картка називає зону на ранок/день/вечір, і цей тест звіряє її з тим, де мешканець справді стоїть о SCHEDULE_MINUTES.
// Мутації (перевірено, див. PR): змінити стоянку мешканця в RESIDENTS → «зона картки = зона розкладу» червоніє; видалити schedule з картки в
// content/npcs.json → «усі NPC із повною карткою» червоніє (і validate: NPC_CARD_NO_SCHEDULE); приховати мову en → locale червоніє.
import { describe, expect, it } from 'vitest';
import npcs from '../../../content/npcs.json';
import uk from '../../../content/locales/uk.json';
import en from '../../../content/locales/en.json';
import { loadContent } from '../../../scripts/validator/load.mjs';
import { validate } from '../../../scripts/validator/checks.mjs';
import { RESIDENTS, SCHEDULE_MINUTES, ZONES, buildTimeline, placeAt, residentGrid, zoneAt } from './ambient';
import { gridFromWalls, tileOf, type Pt } from './follow';

const RAW = import.meta.glob<string>('../../../public/maps/camp-lake.tmj', { query: '?raw', import: 'default', eager: true });
const map = JSON.parse(Object.values(RAW)[0] ?? '') as { width: number; height: number; layers: { name: string; data?: number[]; objects?: { type?: string; class?: string; x: number; y: number }[] }[] };
const objs = map.layers.find((l) => l.name === 'objects')?.objects ?? [];
const spots: Pt[] = objs.filter((o) => ['trigger', 'npc', 'anchor'].includes(String(o.type || o.class))).map((o) => ({ x: o.x, y: o.y }));
const grid = gridFromWalls(map.width, map.height, 32, map.layers.find((l) => l.name === 'walls')?.data ?? []);
const walk = residentGrid(grid, spots);

interface Card { habit: string; likes: string; dislikes: string; dream: string; phrases: string[]; schedule: Record<'morning' | 'day' | 'evening', { textKey: string; zone?: string }> }
const NPCS = npcs as unknown as { id: string; card?: Card }[];
const PERIODS = ['morning', 'day', 'evening'] as const;
const LOC = { uk: uk as Record<string, string>, en: en as Record<string, string> };

describe('картки персонажів', () => {
  it('усі NPC із повною карткою: звичка, любить, не любить, 2–3 фрази, розклад на ранок/день/вечір, страх або мрія — у двох мовах', () => {
    expect(NPCS.length).toBeGreaterThanOrEqual(11);
    for (const n of NPCS) {
      const c = n.card;
      expect(c, `${n.id}: картка`).toBeDefined();
      if (!c) continue;
      const keys = [c.habit, c.likes, c.dislikes, c.dream, ...c.phrases, ...PERIODS.map((p) => c.schedule[p]?.textKey)];
      expect(c.phrases.length, `${n.id}: фраз`).toBeGreaterThanOrEqual(2);
      expect(c.phrases.length, `${n.id}: фраз`).toBeLessThanOrEqual(3);
      for (const k of keys) for (const lang of ['uk', 'en'] as const) expect((LOC[lang][k] ?? '').trim(), `${n.id}: ${k} [${lang}]`).not.toBe('');
      expect(new Set(keys).size, `${n.id}: ключі картки різні`).toBe(keys.length);
    }
  });

  it('сім’я (Джордж, Вікторія, Метью) і кожен сусід табору з розділу I мають картку', () => {
    for (const id of ['npc.george', 'npc.victoria', 'npc.matthew', 'npc.elise', ...RESIDENTS.map((r) => r.id)]) expect(NPCS.find((n) => n.id === id)?.card, id).toBeDefined();
  });

  it('валідатор на справжньому контенті мовчить про картки; без розкладу — NPC_CARD_NO_SCHEDULE (негативний контроль на справжніх даних)', () => {
    const loaded = loadContent('content') as unknown as { status: string; content: { npcs: { id: string; card: { schedule?: unknown } }[] } };
    expect(loaded.status).toBe('OK');
    const codes = (): string[] => validate(loaded.content, { today: '2026-11-02' }).map((i: { code: string }) => i.code).filter((c: string) => c.startsWith('NPC_CARD'));
    expect(codes()).toEqual([]);
    const luc = loaded.content.npcs.find((n) => n.id === 'npc.luc');
    if (!luc) throw new Error('no luc');
    const saved = luc.card.schedule;
    delete luc.card.schedule;
    try { expect(codes()).toContain('NPC_CARD_NO_SCHEDULE'); } finally { luc.card.schedule = saved; }
    expect(codes()).toEqual([]);
  });

  it('зона в розкладі картки мешканця = зона, де його ставить розклад руху (ambient) о SCHEDULE_MINUTES; він стоїть, а не йде', () => {
    const zoneIds = new Set(ZONES.map((z) => z.id));
    for (const r of RESIDENTS) {
      const card = NPCS.find((n) => n.id === r.id)?.card as Card;
      const tl = buildTimeline(walk, r);
      if (!tl) throw new Error(`${r.id}: no timeline`);
      for (const p of PERIODS) {
        const zone = card.schedule[p].zone;
        expect(zone, `${r.id}.${p}: у мешканця зона обов’язкова`).toBeDefined();
        expect(zoneIds.has(zone ?? ''), `${r.id}.${p}: зона ${zone} існує в ZONES`).toBe(true);
        const at = placeAt(walk, tl, SCHEDULE_MINUTES[p]);
        expect(at.moving, `${r.id}.${p}: о ${SCHEDULE_MINUTES[p]} хв іде, а не стоїть`).toBe(false);
        expect(zone, `${r.id}.${p}: зона картки = зона розкладу`).toBe(zoneAt(tileOf(grid, at)));
      }
      expect(card.schedule.morning.zone, `${r.id}: вранці й увечері в різних зонах`).not.toBe(card.schedule.evening.zone);
    }
  });

  it('NPC поза розкладом руху (родина, Еліза, продавчиня) зони в розкладі не мають — картка не вигадує, де вони ходять', () => {
    const walkers = new Set(RESIDENTS.map((r) => r.id));
    for (const n of NPCS) if (!walkers.has(n.id)) for (const p of PERIODS) expect(n.card?.schedule[p].zone, `${n.id}.${p}`).toBeUndefined();
  });

  it('негативний контроль звірки: інша стоянка мешканця дала б іншу зону', () => {
    const r = RESIDENTS[0];
    if (!r) throw new Error('no residents');
    const moved = { ...r, stops: r.stops.map((s) => ({ ...s, c: 4, r: 16 })) };
    const tl = buildTimeline(walk, moved);
    if (!tl) throw new Error('no timeline');
    const card = NPCS.find((n) => n.id === r.id)?.card as Card;
    const zones = PERIODS.map((p) => zoneAt(tileOf(grid, placeAt(walk, tl, SCHEDULE_MINUTES[p]))));
    expect(zones.every((z, i) => z === card.schedule[PERIODS[i] as (typeof PERIODS)[number]].zone), 'з перенесеними стоянками картка розійшлась би з розкладом').toBe(false);
  });
});
