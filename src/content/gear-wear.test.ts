// GAME-107 · зношування спорядження — м'який модифікатор: ніколи не провал і не втрата прогресу (рішення власника 24.10).
// Спосіб перевірки 1: перебір «стан спорядження × комбінація профіль × транспорт × тварина» на справжньому контенті. Стани: нове сухе
//   (контроль), мокре, зношене, зламане (стан 0, сухе) і зламане мокре. «Зламане» в ядрі — стан 0: окремої «поломки» немає, і це
//   теж доводиться (жодна дія не робить річ непридатною — лише знижує ціну викупу). Для кожної клітинки: кінець розділу досяжний
//   (вичерпний пошук endReachable), сценарій дня 3 доходить до кінця, і порівняно з контролем жоден прогрес не зменшився.
// Спосіб перевірки 2: витрати від зношування (втрачена ціна викупу — єдина грошова ціна зносу, SIM-GEAR-004) за дорогу й за повну втрату
//   стану стартового набору ≤ X % денного бюджету профілю. Мутація «зношення = провал» (знос, що забирає річ повністю) → червоніє.
// Закон 1: кожна перевірка має мутант, на якому той самий предикат червоніє.
import { describe, expect, it } from 'vitest';
import { dispatch, type Command } from '../core/commands';
import type { CoreDefs } from '../core/defs';
import { CONDITION_MAX, WET_WEAR, gearOf, pruneGear, salePrice, wearAfterTrip } from '../core/gear';
import { initialState, type GameState } from '../core/state';
import { chapterComplete } from '../core/story';
import { enumerateCombos } from '../../scripts/validator/combos.mjs';
import { endReachable, type EndMemo } from './bot';
import type { Move } from './moves';
import { GAME_DEFS, RAW_ITEMS } from './slice-defs';
import { CONTENT, STORY } from './story';

const END = 'CH1-D3-HOME-001';
const ELISE = 'npc.elise';
const CAP = 20_000;

interface Combo { profile: string; transport: string; animal: string }
const COMBOS = (enumerateCombos(CONTENT) as { profile: string | null; transport: string | null; animal: string }[]).filter((c): c is Combo => c.profile !== null && c.transport !== null);

let n = 0;
const talk: Move = { type: 'Talk', npcId: ELISE };
const choose = (choice: number): Move => ({ type: 'Choose', choice });
const next: Move = { type: 'Continue' };
const done = (questId: string): Move => ({ type: 'CompleteQuest', questId });
const visit = (locationId: string): Move => ({ type: 'Visit', locationId });
function play(ms: readonly Move[], from: GameState, defs: CoreDefs = GAME_DEFS): GameState {
  let s = from;
  for (const m of ms) {
    const r = dispatch(s, { ...m, commandId: `gw-${n++}` } as Command, defs);
    if (!r.ok) throw new Error(`${JSON.stringify(m)} → ${r.code}`);
    s = r.state;
  }
  return s;
}

/** Дні 1–2 (намет і спальник у руках): межа дня 2, CH1-D3-001 активний. Той самий сценарій, що в day3.test / roles-bot.test. */
function afterDay2(c: Combo): GameState {
  const meet: Move[] = c.transport === 'transport.bike' ? [talk, choose(0), next, next, choose(0), next] : [talk, choose(1), next, choose(0), next];
  const create = { type: 'CreateCharacter', profileId: c.profile, transportId: c.transport, ...(c.animal === 'animal.none' ? {} : { animalId: c.animal }) } as Move;
  return play([
    create, done('PROLOGUE-HOME-001'), done('ST-001'), done('ST-002'),
    visit('loc.shop'), { type: 'Pickup', itemId: 'item.tent' }, { type: 'Pickup', itemId: 'item.sleeping-bag' }, done('ST-003'),
    visit('loc.home'), done('CH1-HOME-001'), visit('loc.road'), done('ST-004'), visit('loc.camp.lake'),
    ...meet, { type: 'Pickup', itemId: 'item.firewood' }, done('ST-005'),
    done('CH1-D2-001'), talk, choose(10), choose(1), next, done('CH1-D2-ELISE-001'),
    talk, choose(13), choose(0), next, next, done('CH1-D2-CAMP-001'), done('CH1-D2-FIRE-001'),
  ], initialState(5_000));
}
const DAY3: Move[] = [done('CH1-D3-001'), done('CH1-D3-GEAR-001'), talk, choose(14), next, choose(0), next, next, done('CH1-D3-ELISE-001'), visit('loc.road'), done('CH1-D3-RETURN-001'), visit('loc.home'), done(END)];

/** Стани спорядження: усі речі спорядження в руках одночасно. `control` — нове сухе (запис не зберігається). */
const STATES = {
  control: { condition: CONDITION_MAX, wet: false },
  wet: { condition: CONDITION_MAX, wet: true },
  worn: { condition: 60, wet: false },
  broken: { condition: 0, wet: false },
  'broken-wet': { condition: 0, wet: true },
} as const;
type StateName = keyof typeof STATES;
const withAllGear = (s: GameState, name: StateName): GameState => {
  const gear = Object.fromEntries(Object.keys(s.inventory).filter((id) => GAME_DEFS.items[id]?.gear && (s.inventory[id] ?? 0) > 0).map((id) => [id, STATES[name]]));
  return { ...s, gear: pruneGear(gear, s.inventory) };
};

/** Що зменшилось відносно контролю. Порожньо — жодного прогресу не втрачено (квести, нагороди, прапорці, пам'ять, навички, практика, гроші). */
export function regressions(base: GameState, got: GameState): string[] {
  const out: string[] = [];
  for (const [id, q] of Object.entries(base.quests)) if (q.status === 'completed' && got.quests[id]?.status !== 'completed') out.push(`квест ${id}`);
  for (const g of base.grants) if (!got.grants.includes(g)) out.push(`нагорода ${g}`);
  for (const f of base.flags) if (!got.flags.includes(f)) out.push(`прапорець ${f}`);
  for (const [npc, ms] of Object.entries(base.npcMemory)) for (const m of ms) if (!(got.npcMemory[npc] ?? []).includes(m)) out.push(`пам'ять ${npc}/${m}`);
  for (const [k, v] of Object.entries(base.skills)) if ((got.skills[k] ?? 0) < v) out.push(`навичка ${k}`);
  for (const [k, v] of Object.entries(base.practice)) if ((got.practice[k] ?? 0) < v) out.push(`практика ${k}`);
  // Зношена чи зламана річ лишається у гравця (не зникає зі спорядження) — рецензія Fable до #87.
  for (const id of Object.keys(base.gear)) if (!(id in got.gear)) out.push(`річ ${id}`);
  if (got.moneyCents < base.moneyCents) out.push('гроші');
  if (base.campaignEnded && !got.campaignEnded) out.push('кінець розділу');
  return out;
}

/** Вердикт клітинки: null — усе гаразд. `perturb` — спосіб застосувати стан (мутант підміняє його «покаранням»). */
function verdict(c: Combo, name: StateName, memo: EndMemo, base: GameState, perturb: (s: GameState, n: StateName) => GameState = withAllGear): string | null {
  const tag = `${c.profile}/${c.transport}/${c.animal} × ${name}`;
  const start = perturb(afterDay2(c), name);
  const r = endReachable(start, GAME_DEFS, memo, CAP);
  if (r !== true) return `${tag}: кінець ${r === false ? 'НЕдосяжний (тупик)' : 'не доведено (ліміт)'}`;
  let end: GameState;
  try { end = play(DAY3, start); } catch (e) { return `${tag}: сценарій застряг: ${(e as Error).message}`; }
  if (!end.campaignEnded || !chapterComplete(end, STORY)) return `${tag}: день 3 пройдено, а розділ не закінчено`;
  const lost = regressions(base, end);
  return lost.length ? `${tag}: прогрес зменшився: ${lost.join(', ')}` : null;
}

describe('GAME-107 №1 · стан спорядження × профіль × транспорт × тварина: тупиків 0, прогрес не зменшується', () => {
  const baseOf = new Map<Combo, GameState>(COMBOS.map((c) => [c, play(DAY3, afterDay2(c))]));

  it('комбінацій більше однієї, транспортів — усі з контенту; стани — мокре, зношене, зламане', () => {
    expect(new Set(COMBOS.map((c) => c.transport))).toEqual(new Set(CONTENT.transports.map((t) => t.id)));
    expect(Object.keys(STATES)).toEqual(['control', 'wet', 'worn', 'broken', 'broken-wet']);
    for (const c of COMBOS) expect(baseOf.get(c)?.campaignEnded, JSON.stringify(c)).toBe(true); // контроль сам доходить до кінця
  });

  it(`усі ${COMBOS.length} комбінацій × ${Object.keys(STATES).length} станів: кінець досяжний, день 3 пройдено, жодна втрата прогресу`, () => {
    const memo: EndMemo = new Map();
    const bad = COMBOS.flatMap((c) => (Object.keys(STATES) as StateName[]).map((s) => verdict(c, s, memo, baseOf.get(c) as GameState))).filter((v) => v !== null);
    expect(bad).toEqual([]);
  }, 300_000);

  it('стан справді застосовано: мокре/зношене/зламане лежить у gear і не зникає після дня 3 (інакше перебір порожній)', () => {
    const c = COMBOS[0] as Combo;
    for (const name of ['wet', 'worn', 'broken', 'broken-wet'] as const) {
      const s = withAllGear(afterDay2(c), name);
      expect(gearOf(s.gear, 'item.tent'), name).toEqual(STATES[name]);
      expect(gearOf(s.gear, 'item.sleeping-bag'), name).toEqual(STATES[name]);
    }
  });

  it('МУТАЦІЯ «зламане = провал»: стан зламаного знімає обов\'язковий квест із шляху → перебір червоніє (і контроль зелений)', () => {
    const c = COMBOS.find((x) => x.transport === 'transport.car') as Combo;
    const memo: EndMemo = new Map();
    const base = baseOf.get(c) as GameState;
    const fail = (s: GameState, name: StateName): GameState => {
      const g = withAllGear(s, name);
      return name === 'broken' ? { ...g, quests: { ...g.quests, 'CH1-D3-001': { status: 'declined', done: [] } } } : g;
    };
    expect(verdict(c, 'broken', memo, base)).toBeNull();
    expect(verdict(c, 'control', memo, base, fail)).toBeNull();
    expect(verdict(c, 'broken', memo, base, fail)).toMatch(/тупик|застряг/);
  });

  it('МУТАЦІЯ «зношення забирає прогрес»: предикат regressions ловить кожен вид втрати', () => {
    const base = baseOf.get(COMBOS[0] as Combo) as GameState;
    expect(regressions(base, base)).toEqual([]);
    const skill = Object.keys(base.skills).find((k) => (base.skills[k] ?? 0) > 0) as string;
    const mutants: [string, GameState][] = [
      ['квест', { ...base, quests: { ...base.quests, [END]: { status: 'active', done: [] } } }],
      ['нагорода', { ...base, grants: base.grants.slice(1) }],
      ['прапорець', { ...base, flags: base.flags.slice(1) }],
      ['навичка', { ...base, skills: { ...base.skills, [skill]: 0 } }],
      ['гроші', { ...base, moneyCents: base.moneyCents - 1 }],
      ['кінець розділу', { ...base, campaignEnded: false }],
    ];
    expect(base.grants.length).toBeGreaterThan(0);
    expect(base.flags.length).toBeGreaterThan(0);
    for (const [what, m] of mutants) expect(regressions(base, m).join(), what).toContain(what.split(' ')[0] as string);
    // Річ зі спорядження зникла (не лише зносилась) — теж втрата прогресу.
    const worn = withAllGear(base, 'worn');
    const gearId = Object.keys(worn.gear)[0] as string;
    expect(gearId, 'стан «зношене» має спорядження').toBeDefined();
    const lostItem = { ...worn, gear: Object.fromEntries(Object.entries(worn.gear).filter(([k]) => k !== gearId)) };
    expect(regressions(worn, lostItem).join()).toContain(`річ ${gearId}`);
  });
});

describe('GAME-107 №2 · витрати від зношування ≤ X % денного бюджету профілю', () => {
  /**
   * Витрата зношування — втрачена ціна викупу (SIM-GEAR-004: стан знижує лише її). Бюджет дня профілю = (зарплата − рахунки) / 30
   * з content/profiles.json: найменший серед профілів. Виміряно (стартовий набір — item.tent 15 € + item.sleeping-bag 8 € викупу):
   * дорога з мокрим набором 2,30 € при бюджеті 26,67 € = 8,6 %; повна втрата стану 23,00 € = 86 %.
   * X = 10 % за дорогу: близько до виміряного (запас 1,4 в.п.), тож подвоєння WET_WEAR (17 %) уже червоніє; повна втрата набору — ≤ 100 %
   * дня (один день заробітку покриває, «незатишно й невеликі витрати»).
   */
  const X_TRIP_PCT = 10;
  const X_TOTAL_PCT = 100;
  const profiles = CONTENT.profiles as unknown as { id: string; job: { salaryCents: number; billsCents: number } }[];
  const dailyBudget = Math.min(...profiles.map((p) => (p.job.salaryCents - p.job.billsCents) / 30));
  const kit = (g: { condition: number; wet: boolean }): GameState => ({
    ...initialState(0), inventory: { 'item.tent': 1, 'item.sleeping-bag': 1 },
    gear: { 'item.tent': g, 'item.sleeping-bag': g },
  });
  const lost = (before: GameState, after: GameState): number =>
    ['item.tent', 'item.sleeping-bag'].reduce((sum, id) => {
      const sell = RAW_ITEMS.find((i) => i.id === id)?.resaleCents ?? 0;
      return sum + salePrice(sell, gearOf(before.gear, id).condition) - salePrice(sell, gearOf(after.gear, id).condition);
    }, 0);
  type Wear = typeof wearAfterTrip;
  /** Найгірша дорога: набір уже мокрий (стан 100) і знову дощ. */
  const tripCost = (wear: Wear): number => { const s = kit({ condition: CONDITION_MAX, wet: true }); return lost(s, wear(s, GAME_DEFS.items, 'rain')); };
  const totalCost = (wear: Wear): number => { const s = kit({ condition: CONDITION_MAX, wet: true }); let g = s; for (let i = 0; i < 50; i++) g = wear(g, GAME_DEFS.items, 'rain'); return lost(s, g); };
  const within = (wear: Wear): boolean => tripCost(wear) <= (dailyBudget * X_TRIP_PCT) / 100 && totalCost(wear) <= (dailyBudget * X_TOTAL_PCT) / 100;

  it('виміряне закріплено: бюджет дня, ціна дороги й повної втрати стартового набору (в центах)', () => {
    expect(dailyBudget).toBeCloseTo(2666.67, 1);
    expect(WET_WEAR).toBe(10);
    expect(tripCost(wearAfterTrip)).toBe(230);
    expect(totalCost(wearAfterTrip)).toBe(2300);
    expect(within(wearAfterTrip)).toBe(true);
  });

  it('МУТАЦІЯ «зношення = провал»: знос, що забирає річ повністю за першу дорогу → ціна понад стелю, предикат червоніє', () => {
    const failure: Wear = (g, items, w) => { const r = wearAfterTrip(g, items, w); return { ...r, gear: Object.fromEntries(Object.keys(g.gear).map((k) => [k, { condition: 0, wet: true }])) }; };
    expect(tripCost(failure)).toBeGreaterThan((dailyBudget * X_TRIP_PCT) / 100);
    expect(within(failure)).toBe(false);
  });

  it('МУТАЦІЯ «знос удвічі різкіший» (WET_WEAR ×2) теж виходить за стелю дороги', () => {
    const double: Wear = (g, items, w) => wearAfterTrip(wearAfterTrip(g, items, w), items, w);
    expect(within(double)).toBe(false);
  });
});
