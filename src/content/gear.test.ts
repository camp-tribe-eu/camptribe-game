// GAME-73 · каталог спорядження v1 (content/items.json) і як він доходить до гри.
// Спосіб перевірки №1: ≥ 3 тири наметів і спальників із вагою, об'ємом, вологостійкістю, теплом, ціною й викупом;
// валідатор червоніє на предметі без БУДЬ-ЯКОГО з цих полів — доведено на кожному полі кожного предмета.
// №4 (бот: від дешевого старту до тиру 2 за ≤ N місяців) — NOT RUN: доходу в грі ще немає (GAME-71). Тут лише
// «тир 2 купується, якщо грошей ≥ ціни», і закріплено, що в нинішньому Пролозі тир 2 недосяжний.
import { describe, expect, it } from 'vitest';
import { dispatch } from '../core/commands';
import { checkDefs, storyItems } from '../core/defs';
import { initialState } from '../core/state';
import { loadContent } from '../../scripts/validator/load.mjs';
import { validate } from '../../scripts/validator/checks.mjs';
import { GEAR_FIELDS } from '../../scripts/validator/codes.mjs';
import { GAME_DEFS, GEAR_ITEMS, RAW_ITEMS } from './slice-defs';
import { STORY } from './story';
import uk from '../../content/locales/uk.json';
import en from '../../content/locales/en.json';

const TODAY = '2026-10-23';
const loaded = loadContent('content');
const gear = RAW_ITEMS.filter((i) => i.kind !== undefined);
const START_MONEY = 5_000; // як у createBridge

describe('каталог v1 (Спосіб перевірки №1)', () => {
  it('контент завантажився й чистий для перевірки gear', () => {
    expect(loaded.status).toBe('OK');
    expect(validate(loaded.content, { today: TODAY }).filter((i) => i.code.startsWith('GEAR_'))).toEqual([]);
  });

  for (const kind of ['tent', 'sleeping-bag'] as const) {
    it(`${kind}: щонайменше 3 тири, у кожного предмета — всі поля картки`, () => {
      const items = gear.filter((i) => i.kind === kind);
      expect(new Set(items.map((i) => i.tier)).size).toBeGreaterThanOrEqual(3);
      for (const i of items) for (const f of GEAR_FIELDS) expect((i as unknown as Record<string, unknown>)[f], `${i.id}.${f}`).toBeTypeOf('number');
    });
  }

  it('реєстр полів — саме ті, що вимагає картка: вага, об\'єм, вологостійкість, тепло, ціна, викуп (+ тир і місця)', () => {
    expect([...GEAR_FIELDS].sort()).toEqual(['comfortC', 'priceCents', 'resaleCents', 'sleeps', 'tier', 'volumeL', 'waterproofMm', 'weightG']);
  });

  it('валідатор червоніє на КОЖНОМУ предметі без КОЖНОГО поля (і на предметі без виду) — GEAR_FIELD_MISSING рівно там', () => {
    let runs = 0;
    for (const i of gear) for (const f of ['kind', ...GEAR_FIELDS]) {
      const c = structuredClone(loaded.content) as { items: Record<string, unknown>[] };
      c.items = c.items.map((x) => (x.id === i.id ? Object.fromEntries(Object.entries(x).filter(([k]) => k !== f)) : x));
      const found = validate(c, { today: TODAY }).filter((x) => x.code === 'GEAR_FIELD_MISSING');
      expect(found.map((x) => x.where), `${i.id} без ${f}`).toEqual([i.id]);
      runs++;
    }
    expect(runs).toBe(gear.length * (GEAR_FIELDS.length + 1));
  });

  it('кожна річ — компроміс: дешевший тир дешевший, легкий — легший, сімейний — на більше місць (SIM-INV-005)', () => {
    const by = (id: string) => gear.find((i) => i.id === id) as (typeof gear)[number];
    const all = gear.filter((i) => i.kind === 'tent');
    const min = (k: 'priceCents' | 'weightG') => Math.min(...all.map((i) => i[k] as number));
    expect(by('item.tent').priceCents).toBe(min('priceCents'));
    expect(by('item.tent-trek').weightG).toBe(min('weightG'));
    expect(by('item.tent-family').sleeps).toBe(Math.max(...all.map((i) => i.sleeps as number)));
    for (const i of gear) expect(i.resaleCents as number, i.id).toBeLessThanOrEqual(i.priceCents as number);
  });

  it('назва кожного предмета — в обох мовах', () => {
    for (const i of RAW_ITEMS) { expect(uk, i.id).toHaveProperty([i.nameKey]); expect(en, i.id).toHaveProperty([i.nameKey]); }
  });
});

describe('каталог у грі (GAME_DEFS)', () => {
  it('спорядження зі стану: вид і тир; стартові намет і спальник Прологу — без ціни в грі, решта — ціна й викуп із картки', () => {
    const story = storyItems(STORY);
    expect(story.has('item.tent') && story.has('item.sleeping-bag')).toBe(true);
    for (const i of gear) {
      const def = GEAR_ITEMS[i.id];
      expect(def?.gear, i.id).toEqual({ kind: i.kind, tier: i.tier });
      if (story.has(i.id)) expect([def?.buyCents, def?.sellCents], i.id).toEqual([undefined, undefined]);
      else expect([def?.buyCents, def?.sellCents], i.id).toEqual([i.priceCents, i.resaleCents]);
    }
    expect(checkDefs(GAME_DEFS)).toEqual([]);
  });

  it('тир 2 купується, якщо грошей ≥ ціни, і ні — на цент менше (Спосіб перевірки №4, частково)', () => {
    const tier2 = gear.filter((i) => i.tier === 2);
    expect(tier2.length).toBeGreaterThanOrEqual(2);
    for (const i of tier2) {
      const price = i.priceCents as number;
      const ok = dispatch(initialState(price), { type: 'BuyItem', commandId: 'b1', itemId: i.id }, GAME_DEFS);
      expect(ok.ok && { money: ok.state.moneyCents, qty: ok.state.inventory[i.id] }, i.id).toEqual({ money: 0, qty: 1 });
      expect(dispatch(initialState(price - 1), { type: 'BuyItem', commandId: 'b2', itemId: i.id }, GAME_DEFS), i.id).toMatchObject({ ok: false, code: 'INSUFFICIENT_FUNDS' });
    }
  });

  it('NOT RUN-закріпа: у нинішньому Пролозі тир 2 недосяжний — усі гроші гри менші за найдешевший тир 2', () => {
    // Верхня межа грошей Прологу: старт + усі грошові нагороди квестів і взаємодій (продати в грі нічого з того, що
    // дається задарма, не можна — DEFS_STORY_ITEM_SELLABLE). Коли з'явиться дохід (GAME-71), цей тест почервоніє —
    // і тоді пишеться бот «від дешевого старту до тиру 2 за ≤ N місяців для кожного профілю».
    const rewards = Object.values(STORY.quests).reduce((a, q) => a + (q.reward?.moneyCents ?? 0), 0)
      + Object.values(GAME_DEFS.interactions).reduce((a, x) => a + x.moneyCents, 0);
    const cheapestTier2 = Math.min(...gear.filter((i) => i.tier === 2).map((i) => i.priceCents as number));
    expect({ maxMoney: START_MONEY + rewards, cheapestTier2 }).toEqual({ maxMoney: 6_500, cheapestTier2: 8_900 });
    expect(START_MONEY + rewards).toBeLessThan(cheapestTier2);
  });
});
