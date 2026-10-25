// GAME-73 · Спосіб перевірки №4: «бот від дешевого старту доходить до тиру 2 за ≤ N місяців для КОЖНОГО профілю».
// Раніше NOT RUN: доходу не було. Тепер є календар життя (GAME-71, зарплата − рахунки в день виплати), тож бот живе
// справжнім циклом: день за днем (sim.step advance) → гроші ≥ ціни найдешевшого тиру 2 → іде до крамниці (Visit, GAME-81:
// купувати можна лише там, де продають) → BuyItem. Лише дійсні команди через sim/dispatch, без підміни стану.
import { describe, expect, it } from 'vitest';
import type { CoreDefs, ItemDef } from './defs';
import { dateOf } from './life';
import { newSim, step, type SimState } from './sim';
import { DAY_MINUTES, dayOf } from './weather';
import { GAME_DEFS, SHOP } from '../content/slice-defs';
import { CONTENT } from '../content/story';

const SEED = 20261023;
const START_MONEY = 5_000; // як у createBridge
const MAX_DAYS = 800; // стеля бота: ~26 місяців; далі — «не дійшов»
/**
 * N = 3 місяці (стеля тесту). Виміряно (seed 20261023, старт 50 €, календар від 2027-06-01, виплата 25-го):
 *   profile.family-teen   — день 24 (перша виплата), місяць 1, купує item.sleeping-bag-synthetic (89 €)
 *   profile.solo-explorer — день 24 (перша виплата), місяць 1, купує item.sleeping-bag-synthetic (89 €)
 * Максимум 1 місяць; N = 3 — запас на зміну календаря/цін. Виміряне закріплене в тесті точно (MEASURED).
 */
const MEASURED = {
  'profile.family-teen': { day: 24, item: 'item.sleeping-bag-synthetic', months: 1 },
  'profile.solo-explorer': { day: 24, item: 'item.sleeping-bag-synthetic', months: 1 },
};
const N_MONTHS = 3;

const LIFE_DEFS = GAME_DEFS.life as NonNullable<CoreDefs['life']>;
const profiles = CONTENT.profiles.map((p) => ({ id: p.id as string, transport: (p.transports as string[])[0] as string }));

const cheapestTier2 = (defs: CoreDefs): [string, ItemDef] => {
  const all = Object.entries(defs.items).filter(([, d]) => d.gear?.tier === 2 && d.buyCents !== undefined);
  return all.sort((a, b) => (a[1].buyCents as number) - (b[1].buyCents as number))[0] as [string, ItemDef];
};

/** Дійсна команда через симуляцію; повертає новий стан і результат. */
function cmd(s: SimState, defs: CoreDefs, n: { v: number }, command: Record<string, unknown>): { s: SimState; ok: boolean; code?: string } {
  const commandId = `b${n.v++}`;
  const next = step(s, { kind: 'command', command: { ...command, commandId } as never }, { defs });
  const rec = next.game.processed[commandId];
  return { s: next, ok: rec?.ok === true, ...(rec?.code ? { code: rec.code } : {}) };
}

/** Прохід Прологу до ST-002 (відкриває крамницю) — лише дійсними командами, як у gear.test (atShop). */
const PROLOGUE: Record<string, unknown>[] = [
  { type: 'Visit', locationId: 'loc.home' }, { type: 'CompleteQuest', questId: 'PROLOGUE-HOME-001' }, { type: 'CompleteQuest', questId: 'ST-001' },
  { type: 'Visit', locationId: 'loc.home' }, { type: 'CompleteQuest', questId: 'ST-002' },
];

/** День (від старту гри), у який бот уперше купив річ тиру 2; null — не дійшов за MAX_DAYS. */
function firstTier2(defs: CoreDefs, profile: string, transport: string): { day: number; item: string } | null {
  const n = { v: 0 };
  let s = newSim(SEED, START_MONEY);
  const first = cmd(s, defs, n, { type: 'CreateCharacter', profileId: profile, transportId: transport });
  if (!first.ok) throw new Error(`CreateCharacter ${profile} × ${transport} → ${first.code}`);
  s = first.s;
  for (const c of PROLOGUE) {
    const r = cmd(s, defs, n, c);
    if (!r.ok) throw new Error(`Пролог ${JSON.stringify(c)} → ${r.code}`);
    s = r.s;
  }
  const [id, def] = cheapestTier2(defs);
  for (let day = dayOf(s.clock); day < MAX_DAYS; day++) {
    if (dayOf(s.clock) !== day) s = step(s, { kind: 'advance', minutes: day * DAY_MINUTES - s.clock.minutes }, { defs });
    if (s.game.moneyCents < (def.buyCents as number)) continue;
    // Гроші є — іти до крамниці (Visit, якщо ще не там) і купувати саме там, де продають (GAME-81).
    if (s.game.player?.locationId !== SHOP) {
      const v = cmd(s, defs, n, { type: 'Visit', locationId: SHOP });
      if (!v.ok) throw new Error(`Visit ${SHOP} → ${v.code}`);
      s = v.s;
    }
    const b = cmd(s, defs, n, { type: 'BuyItem', itemId: id });
    s = b.s;
    if (b.ok) return { day: dayOf(s.clock), item: id };
    throw new Error(`BuyItem ${id} відмовлено: ${b.code}`); // гроші були, крамниця під рукою — відмова це збій бота, не «не дійшов»
  }
  return null;
}

const monthsOf = (day: number): number => {
  const a = dateOf(LIFE_DEFS.calendar, 0); const b = dateOf(LIFE_DEFS.calendar, day);
  return (b.y - a.y) * 12 + (b.m - a.m) + 1; // місяць гри: 1 = місяць старту
};

const withSalary = (cents: number): CoreDefs => ({
  ...GAME_DEFS,
  life: { ...LIFE_DEFS, jobs: Object.fromEntries(Object.entries(LIFE_DEFS.jobs).map(([k, j]) => [k, { ...j, salaryCents: cents, billsCents: 0 }])) },
});
const withPriceX = (k: number): CoreDefs => ({
  ...GAME_DEFS,
  items: Object.fromEntries(Object.entries(GAME_DEFS.items).map(([k2, d]) => [k2, d.gear?.tier === 2 && d.buyCents !== undefined ? { ...d, buyCents: d.buyCents * k } : d])),
});
/** Той самий предикат, що й у позитивному тесті: усі профілі мають тир 2 за ≤ N місяців. */
const everyoneWithin = (defs: CoreDefs): boolean =>
  profiles.every((p) => { const r = firstTier2(defs, p.id, p.transport); return r !== null && monthsOf(r.day) <= N_MONTHS; });

describe('GAME-73 №4 · бот доходить до тиру 2 за ≤ N місяців (кожен профіль, справжній календар)', () => {
  it('профілі контенту перелічені (не порожньо)', () => {
    expect(profiles.length).toBeGreaterThanOrEqual(2);
  });

  it(`кожен профіль купує тир 2 не пізніше ${N_MONTHS}-го місяця гри; виміряне закріплено`, () => {
    const got: Record<string, { day: number; item: string; months: number }> = {};
    for (const p of profiles) {
      const r = firstTier2(GAME_DEFS, p.id, p.transport);
      expect(r, `${p.id} не дійшов до тиру 2 за ${MAX_DAYS} днів`).not.toBeNull();
      got[p.id] = { ...(r as { day: number; item: string }), months: monthsOf((r as { day: number }).day) };
      expect(got[p.id]?.months, p.id).toBeLessThanOrEqual(N_MONTHS);
    }
    console.info('GAME-73 №4 виміряно:', JSON.stringify(got));
    expect(got).toEqual(MEASURED);
  });

  it('негативний контроль: дохід 0 (зарплата 0, рахунків 0) → той самий предикат червоніє', () => {
    expect(everyoneWithin(GAME_DEFS)).toBe(true); // контроль не порожній: на справжніх визначеннях предикат зелений
    expect(everyoneWithin(withSalary(0))).toBe(false);
  });

  it('негативний контроль: ціна тиру 2 ×100 → той самий предикат червоніє', () => {
    expect(everyoneWithin(withPriceX(100))).toBe(false);
  });
});
