// GAME-46 · «погода не блокує проходження» (SIM-WX-008): на справжньому контенті, з дощем ЩОДНЯ.
// Бот (bot.ts) ходить по GameState і часу не бачить, а погода змінює лише хвилини — тож чесний доказ
// іде через симуляцію (step): дороги, годинник, кидки подій. Негативний контроль — погода, що закрила
// б дорогу (нескінченна поїздка): той самий сторож мусить почервоніти.
import { describe, expect, it } from 'vitest';
import { dispatch, nextCommandId, type Command } from '../core/commands';
import { nextInt, seedRng } from '../core/rng';
import { newSim, step, type Input, type SimState, type StepCtx } from '../core/sim';
import type { Weather } from '../core/weather';
import { enumerateCombos } from '../../scripts/validator/combos.mjs';
import { endReachable, variantsFor, type EndMemo, type Variant } from './bot';
import { moves } from './moves';
import { GAME_DEFS } from './slice-defs';
import { CONTENT } from './story';
import { PROLOGUE_BIKE, SEED, START_MONEY } from './replay.scenario';

const always = (w: Weather): NonNullable<StepCtx['weather']> => ({ of: () => w });
const WORST: StepCtx = { defs: GAME_DEFS, weather: always('rain') };
const SUNNY: StepCtx = { defs: GAME_DEFS, weather: always('sunny') };
/** Контроль: дощ «закриває» дорогу велосипеду — поїздка без кінця. Справжня гра так не робить. */
const BLOCKED: StepCtx = { defs: GAME_DEFS, weather: { of: () => 'rain', tripMinutes: (m, t, w) => (w === 'rain' && t === 'transport.bike' && m > 0 ? Number.POSITIVE_INFINITY : m) } };

type Outcome = { readonly verdict: 'ended' | 'end-reachable' | 'softlock' | 'unknown' | 'blocked'; readonly minutes: number };

/** Журнал входів через симуляцію; виняток (дорога, якої не проїхати) — «blocked», а не «пройшов». */
function playLog(log: readonly Input[], ctx: StepCtx): Outcome & { readonly sim?: SimState } {
  let s = newSim(SEED, START_MONEY);
  try { for (const i of log) s = step(s, i, ctx); } catch { return { verdict: 'blocked', minutes: s.clock.minutes }; }
  return { verdict: s.game.campaignEnded ? 'ended' : 'softlock', minutes: s.clock.minutes, sim: s };
}

/** Бот-прогулянка, але кожен хід — через step() симуляції з погодою ctx (подія в дорозі — кидок симуляції). */
function simBot(v: Variant, seed: number, ctx: StepCtx, memo: EndMemo): Outcome {
  let rng = seedRng(seed);
  let s = newSim(seed, v.money === 'some' ? 5_000 : 0);
  const send = (m: object): void => { s = step(s, { kind: 'command', command: { ...m, commandId: nextCommandId(s.game) } as Command }, ctx); };
  try {
    send({ type: 'CreateCharacter', profileId: v.profile, transportId: v.transport, ...(v.animal === 'animal.none' ? {} : { animalId: v.animal }) });
    for (let k = 0; k < 80 && !s.game.campaignEnded; k++) {
      const ok = moves(s.game, GAME_DEFS)
        .filter((m) => m.type !== 'RoadEvent')     // подія — хід середовища: її кидає сама симуляція
        .filter((m) => dispatch(s.game, { ...m, commandId: nextCommandId(s.game) } as Command, GAME_DEFS).ok);
      if (ok.length === 0) break;
      const r = nextInt(rng, ok.length);
      rng = r.state;
      send(ok[r.value] as object);
    }
  } catch {
    return { verdict: 'blocked', minutes: s.clock.minutes };
  }
  if (s.game.campaignEnded) return { verdict: 'ended', minutes: s.clock.minutes };
  const reach = endReachable(s.game, GAME_DEFS, memo, 20_000);
  return { verdict: reach === true ? 'end-reachable' : reach === false ? 'softlock' : 'unknown', minutes: s.clock.minutes };
}

const BIKE_VARIANTS = variantsFor(enumerateCombos(CONTENT)).filter((v) => v.transport === 'transport.bike');
const campaign = (ctx: StepCtx, n = 120): Outcome[] => {
  const memo: EndMemo = new Map();
  return Array.from({ length: n }, (_, i) => simBot(BIKE_VARIANTS[i % BIKE_VARIANTS.length] as Variant, 20261023 + i, ctx, memo));
};
const good = (o: Outcome): boolean => o.verdict === 'ended' || o.verdict === 'end-reachable';

describe('найгірша погода (дощ щодня) не блокує проходження (SIM-WX-008)', () => {
  it('пролог велосипедом (сценарій еталонного реплею) доходить до кінця розділу — і дощ справді сповільнив дорогу', () => {
    const rain = playLog(PROLOGUE_BIKE, WORST);
    const sun = playLog(PROLOGUE_BIKE, SUNNY);
    expect(rain.verdict).toBe('ended');
    expect(sun.verdict).toBe('ended');
    expect(rain.minutes).toBeGreaterThan(sun.minutes);      // інакше «найгірша погода» нічого не перевіряла
    expect(rain.sim?.game.grants).toEqual(sun.sim?.game.grants);
  });

  it(`бот через симуляцію, ${120} прогонів велосипедом (${BIKE_VARIANTS.length} варіантів): кожен — кінець або кінець досяжний`, () => {
    expect(BIKE_VARIANTS.length).toBeGreaterThan(0);
    const runs = campaign(WORST);
    const bad = runs.filter((o) => !good(o));
    expect(bad.slice(0, 3)).toEqual([]);
    expect(runs.filter((o) => o.verdict === 'ended').length).toBeGreaterThan(0);  // справді доходить, а не лише «досяжно»
  }, 120_000);
});

describe('негативний контроль: погода, що закрила дорогу велосипеду, — сторож червоніє', () => {
  it('пролог — «blocked», не «ended»', () => {
    expect(playLog(PROLOGUE_BIKE, BLOCKED).verdict).toBe('blocked');
  });
  it('бот — прогони «blocked» є (той самий фільтр good() їх відкидає)', () => {
    const runs = campaign(BLOCKED, 24);
    expect(runs.some((o) => o.verdict === 'blocked')).toBe(true);
    expect(runs.every(good)).toBe(false);
  });
});
