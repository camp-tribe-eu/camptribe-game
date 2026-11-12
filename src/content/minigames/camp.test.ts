// GAME-311 · дві рутинні міні-гри в каркасі GAME-308: усі три результати досяжні через справжній цикл кадрів,
// «сяк-так» пускає далі, а одним дотиком жодну не закрити. Мутації, що роблять цей файл червоним:
// «жар не падає» (COOL_PER_S = 0) · «їжа будь-де» (rightPlace → true) · «один дотик — готово» (done → true).
import { describe, expect, it } from 'vitest';
import { canContinue, closeRun, openRun, startRun, stepRun, type FrameInput, type MinigameRun } from '../../core/minigame';
import { EMBERS_GAME, NIGHT_CAMP_GAME, PLACES, actAt, tidyFoodOutside, type TidyGameState } from './camp';
import { THINGS } from '../night-camp';
import { DISHES, type EmberState } from '../embers';

const NO: FrameInput = { taps: [], drag: null };
const tap = (x: number, y: number): FrameInput => ({ taps: [{ x, y }], drag: null });
/** Прогнати гру до результату, даючи на кожен кадр вхід від стану. */
function play(def: typeof EMBERS_GAME, input: (r: MinigameRun) => FrameInput): MinigameRun {
  let run = startRun(openRun(def, {}, 1));
  for (let k = 0; k < 6000 && run.phase === 'play'; k++) run = stepRun(def, run, input(run));
  return run;
}
/** Смуга дії вогнища за y: три рівні смуги поля. */
const Y = { wood: 0.1, blow: 0.5, rake: 0.9 } as const;

describe('mg.embers — жар у смузі', () => {
  it('смуги поля дають саме ті три дії', () => {
    expect([actAt(Y.wood), actAt(Y.blow), actAt(Y.rake)]).toEqual(['wood', 'blow', 'rake']);
  });
  it('жодного дотику — вечеря сира, «сяк-так», і це НЕ блок', () => {
    const run = play(EMBERS_GAME, () => NO);
    expect(run.outcome).toBe('scrappy');
    expect(canContinue(run)).toBe(true);
    expect(closeRun(run).phase).toBe('closed');
  });
  it('один дотик нічого не вирішує: результат той самий «сяк-так»', () => {
    let used = false;
    const run = play(EMBERS_GAME, () => { if (used) return NO; used = true; return tap(0.5, Y.blow); });
    expect(run.outcome).toBe('scrappy');
  });
  it('тримав жар у смузі — «добре»; недбало — «нормально»', () => {
    const keep = play(EMBERS_GAME, (r) => {
      const s = r.state as EmberState;
      const dish = DISHES[s.dish];
      if (!dish) return NO;
      if (s.heat < dish.band.from) return tap(0.5, Y.blow);
      return s.heat > dish.band.to ? tap(0.5, Y.rake) : NO;
    });
    expect(keep.outcome).toBe('good');
    // Недбало: юшку й чай догледіли, рибу лишили на вугіллі самій — вечеря нерівна, але вечеря.
    const lazy = play(EMBERS_GAME, (r) => {
      const s = r.state as EmberState;
      const dish = DISHES[s.dish];
      if (!dish || s.dish === 1) return NO;
      if (s.heat < dish.band.from) return tap(0.5, Y.blow);
      return s.heat > dish.band.to ? tap(0.5, Y.rake) : NO;
    });
    expect(lazy.outcome).toBe('fine');
  });
});

describe('mg.night-camp — нічний табір', () => {
  const pick = (i: number): FrameInput => tap(0.2, (i + 0.5) / THINGS.length);
  const place = (p: (typeof PLACES)[number]): FrameInput => tap(0.8, (PLACES.indexOf(p) + 0.5) / PLACES.length);
  /** Послідовність дотиків: річ → місце, по два на кожну. */
  function run(seq: readonly FrameInput[]): MinigameRun {
    let r = startRun(openRun(NIGHT_CAMP_GAME, {}, 1));
    for (const input of seq) if (r.phase === 'play') r = stepRun(NIGHT_CAMP_GAME, r, input);
    while (r.phase === 'play') r = stepRun(NIGHT_CAMP_GAME, r, NO);
    return r;
  }
  it('одним дотиком не закрити: вибір речі без місця нічого не кладе', () => {
    const r = run([pick(0)]);
    expect((r.state as TidyGameState).tidy.put).toEqual({});
    expect(r.outcome).toBe('scrappy');
    expect(canContinue(r)).toBe(true);
  });
  it('усе на своє місце — «добре», їжі надворі немає', () => {
    const seq: FrameInput[] = [];
    THINGS.forEach((t, i) => {
      const p = t.kind === 'food' ? (i === 0 ? 'car' : 'hung') : t.kind === 'rubbish' ? 'bin' : 'tarp';
      seq.push(pick(i), place(p));
    });
    const r = run(seq);
    expect(r.outcome).toBe('good');
    expect(tidyFoodOutside(r.state as TidyGameState)).toBe(false);
  });
  it('їжа не туди — лисиця: їжа лишилась надворі, результат гірший, але шлях далі є', () => {
    const seq: FrameInput[] = [];
    THINGS.forEach((t, i) => seq.push(pick(i), place(t.kind === 'gear' ? 'tarp' : 'bin')));
    const r = run(seq);
    expect(tidyFoodOutside(r.state as TidyGameState)).toBe(true);
    expect(r.outcome).not.toBe('good');
    expect(canContinue(r)).toBe(true);
  });
});
