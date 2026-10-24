// GAME-37 · бот-гравець: N прогонів ядра з фіксованим зерном (TD-012).
import { beforeAll, describe, expect, it } from 'vitest';
import type { CoreDefs } from '../core/defs';
import { enumerateCombos } from '../../scripts/validator/combos.mjs';
import { endReachable, runBot, uncoveredPairs, variantsFor, type BotRun, type Variant } from './bot';
import { BOT_N as N, BOT_SEED as SEED, campaign } from './bot-campaign.test.helpers';
import { dispatch } from '../core/commands';
import { initialState } from '../core/state';
import { GAME_DEFS } from './slice-defs';
import { CONTENT, compileStory } from './story';

const tally = (runs: readonly BotRun[]) => runs.reduce<Record<string, number>>((m, r) => ({ ...m, [r.verdict]: (m[r.verdict] ?? 0) + 1 }), {});

describe(`бот: ${N} прогонів, зерно ${SEED} (GAME-37)`, () => {
  // У beforeAll, а не під час збору тестів: тайм-аути діють, виняток — провал тесту, а не збою збирання.
  let runs: BotRun[] = [];
  // GAME-141: з днем 2 прогін довший (~70 мс замість ~40) — 2000 прогонів не вміщались у 120 с.
  beforeAll(() => { runs = campaign(GAME_DEFS, N, SEED); }, 300_000);

  it('кожен прогін доходить до фіналу або фінал досяжний з місця зупинки; тупиків і «не знаю» — 0', () => {
    const t = tally(runs);
    const bad = runs.filter((r) => r.verdict === 'softlock' || r.verdict === 'unknown');
    expect(bad.slice(0, 3), JSON.stringify(t)).toEqual([]);
    expect(runs).toHaveLength(N);
    expect(t.ended ?? 0).toBeGreaterThan(0);        // бот справді доходить до кінця, а не лише «досяжно»
  });

  it('вісь «гроші» змінює поведінку: без грошей покупок 0, з грошима — бувають', () => {
    expect(runs.filter((r) => r.variant.money === 'none').every((r) => r.purchases === 0)).toBe(true);
    expect(runs.some((r) => r.variant.money === 'some' && r.purchases > 0)).toBe(true);
  });

  it('попарне покриття осей (профіль, транспорт, тварина, бічна гілка, гроші): кожна дозволена пара ≥ 1 раз', () => {
    const allowed = variantsFor(enumerateCombos(CONTENT));
    expect(uncoveredPairs(allowed, runs)).toEqual([]);
    // негативний контроль: прибрали всі прогони без грошей для одного профілю — пари мусять бракувати
    const cut = runs.filter((r) => !(r.variant.money === 'none' && r.variant.profile === 'profile.solo-explorer'));
    expect(uncoveredPairs(allowed, cut)).toContain('profile=profile.solo-explorer × money=none');
  });
});

// GAME-141: велозона тепер — вибір із CH1-D2-ELISE-001 (день 2), тож обхідна бічна гілка є саме там. Ламаємо перехід за
// замовчуванням CH1-D2-ELISE-001 → CH1-D2-CAMP-001: водій застряє, велосипедист доходить через велозону.
// GAME-141: розділ дводенний — за 80 ходів основної кампанії прогулянка майже ніколи не доходить до кінця (лише «досяжно»).
// Окрема кампанія з довшою прогулянкою доводить, що бот справді проходить день 2 до кінця розділу, а не лише бачить його пошуком.
describe('бот справді проходить день 2 (300 прогонів × 200 ходів)', () => {
  let runs: BotRun[] = [];
  beforeAll(() => { runs = campaign(GAME_DEFS, 300, SEED, { maxSteps: 200, cap: 20_000 }); }, 300_000);

  it('кінець розділу — щонайменше в 5 % прогонів; тупиків і «не знаю» 0; день 2 пройдено й велосипедом із велозоною, і авто', () => {
    const ended = runs.filter((r) => r.verdict === 'ended');
    expect(ended.length, JSON.stringify(tally(runs))).toBeGreaterThanOrEqual(runs.length / 20);
    expect(runs.filter((r) => r.verdict === 'softlock' || r.verdict === 'unknown')).toEqual([]);
    expect(ended.every((r) => r.final.quests['CH1-D2-FIRE-001']?.status === 'completed')).toBe(true);
    expect(ended.some((r) => r.final.quests['q.elise-bike-area'] !== undefined)).toBe(true);
    expect(ended.some((r) => r.variant.transport === 'transport.car')).toBe(true);
  });
});

describe('навмисно зламаний квест (вимкнений перехід CH1-D2-ELISE-001 → CH1-D2-CAMP-001)', () => {
  const broken = structuredClone(CONTENT);
  const elise = broken.quests.find((q) => q.id === 'CH1-D2-ELISE-001');
  if (elise) elise.transitions = elise.transitions.filter((t) => t.to !== 'CH1-D2-CAMP-001');
  let runs: BotRun[] = [];
  beforeAll(() => { runs = campaign({ ...GAME_DEFS, story: compileStory(broken) }, 300, SEED); }, 300_000);

  it('бот ловить тупик і показує стан: CH1-D2-ELISE-001 активний, виходу немає', () => {
    const locks = runs.filter((r) => r.verdict === 'softlock');
    expect(locks.length).toBeGreaterThan(0);
    expect(locks.some((r) => r.stuck?.quests['CH1-D2-ELISE-001']?.status === 'active')).toBe(true);
    // тупик лише там, де немає бічної гілки Еліз — авто (пошук ігнорує звичку бота «skip», тож
    // велосипедист зі «skip» має досяжний кінець через Еліз) — рецензія GAME-37
    expect(locks.every((r) => r.variant.transport === 'transport.car')).toBe(true);
  });

  it('вісь «бічна гілка» змінює поведінку: велосипедист «take» доходить до кінця, «skip» — ніколи', () => {
    // GAME-141: розділ тепер дводенний — за 80 ходів прогулянка рідко доходить до кінця, тож вісь видно по самій гілці:
    // «take» заходить у велозону (і далі кінець досяжний), «skip» — ніколи не заходить і ніколи не закінчує розділ.
    const bike = runs.filter((r) => r.variant.transport === 'transport.bike');
    const entered = (r: BotRun): boolean => r.final.quests['q.elise-bike-area'] !== undefined;
    expect(bike.some((r) => r.variant.side === 'take' && entered(r) && (r.verdict === 'ended' || r.verdict === 'end-reachable'))).toBe(true);
    expect(bike.filter((r) => r.variant.side === 'skip').every((r) => !entered(r) && r.verdict !== 'ended')).toBe(true);
  });

  it('ліміт пошуку вичерпано — чесне «unknown», а не «досяжно» (рецензія GAME-37)', () => {
    const v = variantsFor(enumerateCombos(CONTENT))[0] as Variant;
    expect(runBot(GAME_DEFS, v, SEED, new Map(), { maxSteps: 0, cap: 10 }).verdict).toBe('unknown');
  });

  it('виправлений (справжній) контент — тупиків 0 (той самий запуск зеленіє)', () => {
    expect(campaign(GAME_DEFS, 300, SEED).filter((r) => r.verdict === 'softlock')).toEqual([]);
  }, 300_000);
});

// GAME-31 · SIM-EV-003: кінець розділу не сміє триматись на везінні. Подія в дорозі — хід середовища:
// у стан після неї пошук заходить, але «кінець досяжний» без неї, яким би не був шанс.
describe('кінець без удачі (SIM-EV-003)', () => {
  const luckOnly = (chance: number): CoreDefs => ({
    items: {}, interactions: {},
    story: {
      start: 'q.end', profiles: { 'profile.a': {} }, transports: ['transport.bike'], animals: {},
      locations: { 'loc.a': { items: [] }, 'loc.b': { items: [] } },
      npcs: { 'npc.far': { locationId: 'loc.b', unlockedBy: 'q.never' } },
      quests: {
        'q.end': { optional: false, end: true, locationId: 'loc.a', objectives: [{ id: 'luck', kind: 'talk', target: 'npc.far', required: true }], transitions: [] },
        'q.never': { optional: false, end: false, objectives: [{ id: 'x', kind: 'visit', target: 'loc.a', required: true }], transitions: [] },
      },
      dialogues: {
        'dlg.ev-luck': { trigger: { at: ['loc.b'], chance }, start: 'n', nodes: { n: { choices: [{ next: 'e', effects: [{ completeObjective: { quest: 'q.end', objective: 'luck' } }] }] }, e: { end: true } } },
      },
      roads: [
        { from: 'loc.a', to: 'loc.b', ways: { 'transport.bike': { minutes: 5, cents: 0 } } },
        { from: 'loc.b', to: 'loc.a', ways: { 'transport.bike': { minutes: 5, cents: 0 } } },
      ],
    },
  });
  const start = (defs: CoreDefs) => {
    const r = dispatch(initialState(0), { type: 'CreateCharacter', commandId: 'c0', profileId: 'profile.a', transportId: 'transport.bike' }, defs);
    if (!r.ok) throw new Error(r.code);
    return r.state;
  };
  it('кінець лише через подію з шансом 50 % — недосяжний (червоне, як і має бути)', () => {
    expect(endReachable(start(luckOnly(50)), luckOnly(50), new Map(), 10_000)).toBe(false);
  });
  it('навіть шанс 100 % — не гарантія (перший приїзд без кидка, кілька подій ділять шанс): кінець недосяжний', () => {
    expect(endReachable(start(luckOnly(100)), luckOnly(100), new Map(), 10_000)).toBe(false);
  });
  it('позитивний контроль: та сама ціль досяжна розмовою (NPC відкритий) — кінець досяжний, подія не заважає', () => {
    const d = luckOnly(50);
    const st = d.story as NonNullable<CoreDefs['story']>;
    const open: CoreDefs = { ...d, story: { ...st, npcs: { 'npc.far': { locationId: 'loc.b' } } } };
    expect(endReachable(start(open), open, new Map(), 10_000)).toBe(true);
  });
});
