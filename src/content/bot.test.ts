// GAME-37 · бот-гравець: N прогонів ядра з фіксованим зерном (TD-012).
import { beforeAll, describe, expect, it } from 'vitest';
import type { CoreDefs } from '../core/defs';
import { nextInt, seedRng } from '../core/rng';
import { enumerateCombos } from '../../scripts/validator/combos.mjs';
import { runBot, uncoveredPairs, variantsFor, type BotRun, type EndMemo, type Variant } from './bot';
import { GAME_DEFS } from './slice-defs';
import { CONTENT, compileStory } from './story';

const N = 2000;
const SEED = 20261023;

function campaign(defs: CoreDefs, n: number, seed: number): BotRun[] {
  const variants = variantsFor(enumerateCombos(CONTENT));
  const memo: EndMemo = new Map();
  let rng = seedRng(seed);
  const runs: BotRun[] = [];
  for (let i = 0; i < n; i++) {
    const r = nextInt(rng, variants.length);
    rng = r.state;
    runs.push(runBot(defs, variants[r.value] as Variant, seed + i, memo));
  }
  return runs;
}

const tally = (runs: readonly BotRun[]) => runs.reduce<Record<string, number>>((m, r) => ({ ...m, [r.verdict]: (m[r.verdict] ?? 0) + 1 }), {});

describe(`бот: ${N} прогонів, зерно ${SEED} (GAME-37)`, () => {
  // У beforeAll, а не під час збору тестів: тайм-аути діють, виняток — провал тесту, а не збою збирання.
  let runs: BotRun[] = [];
  beforeAll(() => { runs = campaign(GAME_DEFS, N, SEED); }, 120_000);

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

describe('навмисно зламаний квест (вимкнений перехід ST-004 → ST-005)', () => {
  const broken = structuredClone(CONTENT);
  const st004 = broken.quests.find((q) => q.id === 'ST-004');
  if (st004) st004.transitions = st004.transitions.filter((t) => t.to !== 'ST-005');
  let runs: BotRun[] = [];
  beforeAll(() => { runs = campaign({ ...GAME_DEFS, story: compileStory(broken) }, 300, SEED); }, 120_000);

  it('бот ловить тупик і показує стан: ST-004 активний, виходу немає', () => {
    const locks = runs.filter((r) => r.verdict === 'softlock');
    expect(locks.length).toBeGreaterThan(0);
    expect(locks[0]?.stuck?.quests['ST-004']?.status).toBe('active');
    // тупик лише там, де немає бічної гілки Еліз — авто (пошук ігнорує звичку бота «skip», тож
    // велосипедист зі «skip» має досяжний кінець через Еліз) — рецензія GAME-37
    expect(locks.every((r) => r.variant.transport === 'transport.car')).toBe(true);
  });

  it('вісь «бічна гілка» змінює поведінку: велосипедист «take» доходить до кінця, «skip» — ніколи', () => {
    const bike = runs.filter((r) => r.variant.transport === 'transport.bike');
    expect(bike.some((r) => r.variant.side === 'take' && r.verdict === 'ended')).toBe(true);
    expect(bike.filter((r) => r.variant.side === 'skip').every((r) => r.verdict !== 'ended')).toBe(true);
  });

  it('ліміт пошуку вичерпано — чесне «unknown», а не «досяжно» (рецензія GAME-37)', () => {
    const v = variantsFor(enumerateCombos(CONTENT))[0] as Variant;
    expect(runBot(GAME_DEFS, v, SEED, new Map(), { maxSteps: 0, cap: 10 }).verdict).toBe('unknown');
  });

  it('виправлений (справжній) контент — тупиків 0 (той самий запуск зеленіє)', () => {
    expect(campaign(GAME_DEFS, 300, SEED).filter((r) => r.verdict === 'softlock')).toEqual([]);
  });
});
