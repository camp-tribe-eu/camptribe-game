// GAME-106 · модель часу: скільки хвилин людини займає розділ 1 за ходами бота (src/content/time-model.ts).
// Ціль контенту S0 — 15–18 хв на розділ. Цей тест ЦІЛІ НЕ ПЕРЕВІРЯЄ: контенту поки лише Пролог (день 1 без днів 2–3),
// тож число свідомо менше. Тест перевіряє, що число рахується з справжніх ходів і > 0, і ДРУКУЄ його проти цілі.
import { describe, expect, it } from 'vitest';
import { dispatch } from '../core/commands';
import { initialState } from '../core/state';
import { nextInt, seedRng } from '../core/rng';
import { enumerateCombos } from '../../scripts/validator/combos.mjs';
import { runBot, variantsFor, type EndMemo, type Variant } from './bot';
import type { Move } from './moves';
import { GAME_DEFS } from './slice-defs';
import { CONTENT } from './story';
import { DAY_FIXED_SECONDS, fastestPath, minutesOf, moveSeconds } from './time-model';

const N = 300;
const SEED = 20261023;   // те саме зерно, що й бот GAME-37

/** Прогони бота, що ДІЙШЛИ до кінця розділу, — їхні ходи по порядку. */
function endedTraces(): { variant: Variant; moves: Move[] }[] {
  const variants = variantsFor(enumerateCombos(CONTENT));
  const memo: EndMemo = new Map();
  let rng = seedRng(SEED);
  const out: { variant: Variant; moves: Move[] }[] = [];
  for (let i = 0; i < N; i++) {
    const r = nextInt(rng, variants.length);
    rng = r.state;
    const variant = variants[r.value] as Variant;
    const ms: Move[] = [];
    const run = runBot(GAME_DEFS, variant, SEED + i, memo, { maxSteps: 80, cap: 20_000, trace: (m) => ms.push(m) });
    if (run.verdict === 'ended') out.push({ variant, moves: ms });
  }
  return out;
}

const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};

describe('GAME-106 · модель часу розділу 1 (ціль контенту S0: 15–18 хв)', () => {
  const traces = endedTraces();
  const minutes = traces.map((t) => minutesOf(t.moves));
  const start = (transport: string) => {
    const r = dispatch(initialState(10_000), { type: 'CreateCharacter', commandId: 'b0', profileId: 'profile.solo-explorer', transportId: transport }, GAME_DEFS);
    if (!r.ok) throw new Error(r.code);
    return r.state;
  };

  it('бот справді доходить до кінця, і кожен дійшлий прогін має ходи (рахуємо не порожнечу)', () => {
    expect(traces.length).toBeGreaterThan(N / 10);
    expect(traces.every((t) => t.moves.length > 0)).toBe(true);
  });

  it('число хвилин рахується з ходів і > 0; друкується проти цілі 15–18 (ціль НЕ перевіряється — контенту мало)', () => {
    const med = median(minutes);
    const fast = { car: fastestPath(start('transport.car'), GAME_DEFS), bike: fastestPath(start('transport.bike'), GAME_DEFS) };
    const fastMin = { car: fast.car ? minutesOf(fast.car) : NaN, bike: fast.bike ? minutesOf(fast.bike) : NaN };
    console.info(`GAME-106 розділ 1: ${med.toFixed(1)} хв гри (ціль 15–18)`);
    console.info(`GAME-106 деталі: медіана бота ${med.toFixed(1)} хв за ${traces.length} дійшлими прогонами з ${N} (мін ${Math.min(...minutes).toFixed(1)}, макс ${Math.max(...minutes).toFixed(1)}); `
      + `найшвидший шлях до мети: авто ${fastMin.car.toFixed(1)} хв (${fast.car?.length ?? '—'} ходів), велосипед ${fastMin.bike.toFixed(1)} хв (${fast.bike?.length ?? '—'} ходів); разові статті ${DAY_FIXED_SECONDS} с`);
    expect(Number.isFinite(med)).toBe(true);
    expect(med).toBeGreaterThan(0);
    expect(fastMin.car).toBeGreaterThan(0);
    expect(fastMin.bike).toBeGreaterThan(0);
    // Найшвидший шлях — справді нижня межа: жоден дійшлий прогін бота не швидший (інакше пошук шляху бреше).
    expect(Math.min(...minutes)).toBeGreaterThanOrEqual(Math.min(fastMin.car, fastMin.bike));
  });

  it('негативний контроль: модель, що нічого не коштує, дає 0 — перевірка «> 0» на ній червоніє', () => {
    const zero = traces.map((t) => minutesOf(t.moves, () => 0, 0));
    expect(median(zero) > 0).toBe(false);
  });

  it('негативний контроль: розмови без ціни рядка — число падає (рядки діалогу справді в ньому)', () => {
    const noLines = traces.map((t) => minutesOf(t.moves, (m) => (m.type === 'Continue' || m.type === 'Choose' ? 0 : moveSeconds(m))));
    expect(median(noLines)).toBeLessThan(median(minutes));
  });
});
