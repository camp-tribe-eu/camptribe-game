// GAME-113 · економіка розділу 1: без позик, а коли грошей бракує — дешевший вихід. Кожна перевірка має негативний
// контроль (закон 1): той самий предикат на зламаних даних мусить почервоніти.
import { describe, expect, it } from 'vitest';
import { dispatch } from '../core/commands';
import type { CoreDefs, ItemDef } from '../core/defs';
import { cheaperAlternatives } from '../core/gear';
import { initialState, type GameState } from '../core/state';
import { play } from '../core/story.fixture';
import { enumerateCombos } from '../../scripts/validator/combos.mjs';
import { CHECKS, validate } from '../../scripts/validator/checks.mjs';
import { ECON_FLOOR_CENTS } from '../../scripts/validator/codes.mjs';
import { loadContent } from '../../scripts/validator/load.mjs';
import commandsSrc from '../core/commands.ts?raw';
import storySrc from '../core/story.ts?raw';
import bridgeSrc from '../view/world/bridge.ts?raw';
import { unaffordableBuys } from '../view/story-offer';
import { runBot, variantsFor, type BotRun, type EndMemo, type Variant } from './bot';
import { GAME_DEFS, RAW_ITEMS } from './slice-defs';
import { CONTENT } from './story';

const TODAY = '2026-10-23';
const START_MONEY = 5_000; // як у createBridge
const econ = CHECKS.find((c) => c.id === 'economy') as (typeof CHECKS)[number];
const codes = (items: unknown[], extra: Record<string, unknown> = {}) => econ.run({ content: { items, ...extra } }).map((i) => i.code);
/** Імена команд — camelCase; `ShowCredits` (титри) не позика. */
const LOAN_TYPE_RE = /(?:^|[a-z])(?:Loan|Debt|Credit|Borrow|Mortgage|Overdraft)(?![a-z])/;
const combos = enumerateCombos(CONTENT) as { profile: string; transport: string; animal: string }[];

describe('GAME-113 №3 · позик у розділі 1 немає', () => {
  it('справжній контент чистий від ECON_*; сторож здатен спрацювати на позиці в id, типі й ефекті', () => {
    const loaded = loadContent('content');
    expect(loaded.status).toBe('OK');
    expect(validate(loaded.content, { today: TODAY }).filter((i: { code: string }) => i.code.startsWith('ECON_'))).toEqual([]);
    // негативні контролі: той самий сторож на зламаних даних
    expect(codes([], { items2: 1, quests: [{ id: 'q.loan-office' }] })).toEqual(['ECON_LOAN_FORBIDDEN']);
    expect(codes([], { dialogues: [{ id: 'dlg.x', nodes: [{ choices: [{ effects: [{ setFlag: 'f.credit-taken' }] }] }] }] })).toEqual(['ECON_LOAN_FORBIDDEN']);
    expect(codes([{ id: 'item.debt-note' }])).toEqual(['ECON_LOAN_FORBIDDEN']);
    expect(codes([{ id: 'item.credit-note' }])).toEqual(['ECON_LOAN_FORBIDDEN']);
    expect(codes([{ id: 'q.credits' }, { id: 'scene.credits' }])).toEqual([]); // титри — не позика (закон 5)
  });

  const commandTypes = (src: string): string[] => [...src.matchAll(/type: '([A-Za-z]+)'/g)].map((m) => m[1] as string);
  const SRC = commandsSrc + storySrc;
  it('у ядрі немає команди позики; невідома команда TakeLoan відхиляється без зміни грошей', () => {
    const types = commandTypes(SRC);
    expect(types.length).toBeGreaterThan(15); // сторож бачить команди (закон 4: порожнє — не «чисто»)
    expect(types.filter((t) => LOAN_TYPE_RE.test(t))).toEqual([]);
    expect(commandTypes(`${SRC}\n| { readonly type: 'TakeLoan' }`).filter((t) => LOAN_TYPE_RE.test(t))).toEqual(['TakeLoan']); // контроль
    const s = initialState(START_MONEY);
    const r = dispatch(s, { type: 'TakeLoan', commandId: 'l1', cents: 100_000 } as never, GAME_DEFS);
    expect(r.ok).toBe(false);
    expect(s.moneyCents).toBe(START_MONEY);
  });
});

/** Прохід Прологу до крамниці (купувати лише там, GAME-81) справжніми командами для будь-якої комбінації. */
const atShop = (c: { profile: string; transport: string; animal: string }, money: number): GameState => play([
  { type: 'CreateCharacter', profileId: c.profile, transportId: c.transport, ...(c.animal === 'animal.none' ? {} : { animalId: c.animal }) },
  { type: 'Visit', locationId: 'loc.home' }, { type: 'CompleteQuest', questId: 'PROLOGUE-HOME-001' }, { type: 'CompleteQuest', questId: 'ST-001' },
  { type: 'Visit', locationId: 'loc.home' }, { type: 'CompleteQuest', questId: 'ST-002' }, { type: 'Visit', locationId: 'loc.shop' },
], initialState(money), GAME_DEFS);

/** Для кожної купівлі, на яку бракує грошей (0 і «на цент менше»), є дешевша річ того ж виду; повертає порушників. */
function withoutAlternative(defs: CoreDefs, c: { profile: string; transport: string; animal: string }): string[] {
  const bad: string[] = [];
  const prices = Object.values(defs.items).flatMap((d) => (d.buyCents !== undefined ? [d.buyCents] : []));
  for (const money of [0, ...prices.map((p) => p - 1)]) {
    const s = { ...atShop(c, 0), moneyCents: money };
    for (const { move } of unaffordableBuys(s, defs)) {
      const id = (move as { itemId: string }).itemId;
      if (cheaperAlternatives(defs.items, s.inventory, id).length === 0) bad.push(`${c.profile}|${c.transport}|${c.animal}|${money}|${id}`);
    }
  }
  return bad;
}

describe('GAME-113 №2 · брак грошей → дешевша альтернатива (кожен профіль × транспорт × тварина)', () => {
  it('комбінації перелічено, у крамниці є що не вистачає, а альтернатива — завжди', () => {
    expect(combos.length).toBeGreaterThanOrEqual(5);
    let checked = 0;
    for (const c of combos) {
      expect(withoutAlternative(GAME_DEFS, c), JSON.stringify(c)).toEqual([]);
      checked += unaffordableBuys({ ...atShop(c, 0), moneyCents: 0 }, GAME_DEFS).length;
    }
    expect(checked).toBeGreaterThan(0); // контроль: предикат не порожній
  });

  it('мутація «альтернативи немає»: спорядження без речей нижчого тиру → предикат червоніє', () => {
    const noBase: Record<string, ItemDef> = Object.fromEntries(Object.entries(GAME_DEFS.items).map(([id, d]) => [id, d.gear && d.buyCents !== undefined ? { ...d, gear: { ...d.gear, tier: 2 } } : d]));
    const c = combos[0] as (typeof combos)[number];
    // тир 1 стартових речей прибрано з каталогу: нічого дешевшого й нижчого немає
    const stripped = { ...GAME_DEFS, items: Object.fromEntries(Object.entries(noBase).filter(([id]) => id !== 'item.tent' && id !== 'item.sleeping-bag')) };
    expect(withoutAlternative(stripped, c).length).toBeGreaterThan(0);
  });

  it('валідатор: тир 2+ без дешевшого і вид без бази за стартові гроші → ECON_*; справжній каталог — чисто', () => {
    expect(ECON_FLOOR_CENTS).toBe(START_MONEY);
    expect(/START_MONEY_CENTS = (\d[\d_]*)/.exec(bridgeSrc)?.[1]?.replace(/_/g, '')).toBe(String(ECON_FLOOR_CENTS));
    const base = RAW_ITEMS.filter((i) => i.kind !== undefined);
    expect(codes(base)).toEqual([]);
    expect(codes(base.filter((i) => i.id !== 'item.tent')).sort()).toEqual(['ECON_NO_BASELINE', 'ECON_NO_CHEAPER_ALTERNATIVE', 'ECON_NO_CHEAPER_ALTERNATIVE']); // без бази: тир 2 намети лишились без дешевшого
    expect(codes(base.map((i) => (i.id === 'item.tent' ? { ...i, priceCents: ECON_FLOOR_CENTS + 1 } : i)))).toEqual(['ECON_NO_BASELINE']);
  });
});

describe('GAME-113 №2 · бот проходить розділ 1 без позик і без мінуса', () => {
  const MAX = { maxSteps: 260, cap: 20_000 };
  const memo: EndMemo = new Map();
  type Step = { type: string; before: number; after: number };
  /** Порушення на трасі: хід, схожий на позику, або гроші < 0 до/після ходу. Одна функція і для справжньої траси, і для контролю. */
  const violations = (trace: readonly Step[]): string[] => trace.flatMap((t) => [
    ...(LOAN_TYPE_RE.test(t.type) ? [`позика: ${t.type}`] : []),
    ...(t.before < 0 || t.after < 0 ? [`мінус: ${t.type} ${t.before}→${t.after}`] : []),
  ]);
  /** Прогін з трасою: кожен зроблений ботом хід із грошима до й після. */
  function run(v: Variant, seed: number): { r: BotRun; trace: Step[] } {
    const trace: Step[] = [];
    const r = runBot(GAME_DEFS, v, seed, memo, { ...MAX, trace: (m, before, after) => { trace.push({ type: m.type, before: before.moneyCents, after: after.moneyCents }); } });
    return { r, trace };
  }

  it('кожен варіант (профіль × транспорт × тварина × гілка × гроші): тупика 0, гроші ≥ 0, позик 0; з нуля розділ доходить до кінця', () => {
    const variants = variantsFor(combos);
    let ended = 0;
    for (const v of variants) {
      for (let seed = 1; seed <= 3; seed++) {
        const { r, trace } = run(v, 20261113 + seed);
        expect(['softlock', 'unknown'], JSON.stringify(v)).not.toContain(r.verdict);
        expect(trace.length, JSON.stringify(v)).toBeGreaterThan(0); // траса справжня, не порожня (закон 4)
        expect(violations(trace), JSON.stringify(v)).toEqual([]);
        if (r.verdict === 'ended') ended++;
      }
    }
    expect(ended).toBeGreaterThan(0);
    // кожна комбінація без стартових грошей (брак грошей на максимумі) доходить до справжнього кінця розділу
    for (const c of combos) {
      const v: Variant = { profile: c.profile, transport: c.transport, animal: c.animal, side: 'take', money: 'none' };
      let done: BotRun | null = null;
      for (let seed = 1; seed <= 80 && !done; seed++) { const x = run(v, 20261113 + seed); if (x.r.verdict === 'ended') done = x.r; }
      expect(done, `без грошей кінець розділу недосяжний: ${JSON.stringify(v)}`).not.toBeNull();
      expect(done?.final.moneyCents).toBeGreaterThanOrEqual(0);
    }
  }, 600_000);

  it('негативний контроль: та сама перевірка на СПРАВЖНІЙ трасі бота червоніє, коли в ній з\u2019являється позика чи мінус', () => {
    const v: Variant = { profile: (combos[0] as (typeof combos)[number]).profile, transport: (combos[0] as (typeof combos)[number]).transport, animal: 'animal.none', side: 'take', money: 'some' };
    const { trace } = run(v, 20261114);
    expect(trace.length).toBeGreaterThan(5);
    expect(violations(trace)).toEqual([]);
    const last = trace.length - 1;
    expect(violations(trace.map((t, i) => (i === last ? { ...t, type: 'TakeLoan' } : t)))).toEqual(['позика: TakeLoan']);
    expect(violations(trace.map((t, i) => (i === 2 ? { ...t, after: -1 } : t))).length).toBe(1);
  });
});
