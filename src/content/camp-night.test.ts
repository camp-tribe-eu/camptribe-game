// GAME-311 · ланцюг наслідків: КОЖНА з семи рутин міняє ніч. Мутації, кожна з яких робить цей файл червоним
// (перевірено вручну, повідомлення — у PR):
//   «ліхтарі не впливають» (гілку lanterns у nightOf замінити на сталий night.light.bright)
//   «порядок не впливає» (гілку tidy — на сталий night.tidy.quiet) — і так само для води, дрів, вогню, риби, ягід;
//   «ніч блокує» (blocked → true) · «порожній табір безкоштовний» (прибрати слід night.camp.crows).
import { describe, expect, it } from 'vitest';
import { ROUTINE_IDS, type RoutineId } from './camp-day';
import { NIGHT_FACTS, nightKeys, nightOf, roughCount, type NightFacts } from './camp-night';
import type { Outcome } from './minigame';

/** Усе зроблено як слід: повне відро, сухі дрова, три ліхтарі, риба на вечерю, солодкі ягоди, прибраний табір. */
const ALL_DONE: NightFacts = {
  results: Object.fromEntries(ROUTINE_IDS.map((id) => [id, 'good' as Outcome])),
  litLanterns: 3, dryLogs: 6, water: 1, fish: 3, bitterBerries: 0, foodOutside: false, emptyRounds: 0, weather: 'rain',
};

/** Та сама ніч, але однієї рутини не зробили — з усіма наслідками, які з цього випливають. */
function without(id: RoutineId): NightFacts {
  const results = Object.fromEntries(Object.entries(ALL_DONE.results).filter(([k]) => k !== id));
  const f: NightFacts = { ...ALL_DONE, results };
  if (id === 'lanterns') return { ...f, litLanterns: 0 };
  if (id === 'firewood') return { ...f, dryLogs: 0 };
  if (id === 'water') return { ...f, water: 0 };
  if (id === 'fish') return { ...f, fish: 0 };
  if (id === 'tidy') return { ...f, foodOutside: true };
  return f;
}

describe('кожна рутина міняє ніч', () => {
  for (const id of ROUTINE_IDS) {
    it(`${id}: зроблено і не зроблено — це різні ночі`, () => {
      const done = nightKeys(ALL_DONE);
      const not = nightKeys(without(id));
      expect(not).not.toEqual(done);
      // саме слід ЦІЄЇ рутини інший, а не чийсь чужий
      const mine = (f: NightFacts): string | undefined => nightOf(f).beats.find((b) => b.routine === id)?.id;
      expect(mine(without(id))).not.toBe(mine(ALL_DONE));
      expect(mine(ALL_DONE)).toBeDefined();
    });
  }
  it('сім слідів — по одному на рутину, плюс буря', () => {
    const beats = nightOf(ALL_DONE).beats;
    expect(new Set(beats.filter((b) => b.routine !== 'camp').map((b) => b.routine))).toEqual(new Set(ROUTINE_IDS));
    expect(beats.filter((b) => b.routine !== 'camp')).toHaveLength(ROUTINE_IDS.length);
    expect(beats.at(-1)?.id).toMatch(/^night\.storm\./);
  });
});

describe('названі наслідки з картки', () => {
  it('не зарядив ліхтарі — ніч бурі темна', () => {
    expect(nightKeys(without('lanterns'))).toContain('night.light.dark');
    expect(nightKeys(ALL_DONE)).toContain('night.light.bright');
    expect(nightKeys({ ...ALL_DONE, litLanterns: 1 })).toContain('night.light.dim');
  });
  it('лишив їжу надворі — прийшла лисиця', () => {
    expect(nightKeys(without('tidy'))).toContain('night.tidy.fox');
    expect(nightKeys({ ...ALL_DONE, foodOutside: true })).toContain('night.tidy.fox');
    expect(nightKeys(ALL_DONE)).toContain('night.tidy.quiet');
  });
  it('нема сухих дров — холодна вечеря', () => {
    expect(nightKeys(without('firewood'))).toContain('night.wood.none');
    expect(nightKeys({ ...ALL_DONE, dryLogs: 2 })).toContain('night.wood.damp');
    expect(nightKeys(ALL_DONE)).toContain('night.wood.dry');
  });
  it('вода, вогонь, риба і ягоди — кожне зі своїм слідом', () => {
    expect(nightKeys(without('water'))).toContain('night.water.none');
    expect(nightKeys({ ...ALL_DONE, water: 0.5 })).toContain('night.water.short');
    expect(nightKeys(without('fire'))).toContain('night.fire.none');
    expect(nightKeys({ ...ALL_DONE, results: { ...ALL_DONE.results, fire: 'scrappy' } })).toContain('night.fire.smoky');
    expect(nightKeys(without('fish'))).toContain('night.fish.none');
    expect(nightKeys({ ...ALL_DONE, fish: 1 })).toContain('night.fish.one');
    expect(nightKeys(without('berries'))).toContain('night.berries.none');
    expect(nightKeys({ ...ALL_DONE, bitterBerries: 2 })).toContain('night.berries.bitter');
  });
  it('відправив усіх із табору — ворони на столі', () => {
    expect(nightKeys(ALL_DONE)).not.toContain('night.camp.crows');
    expect(nightKeys({ ...ALL_DONE, emptyRounds: 1 })).toContain('night.camp.crows');
  });
  it('погода міняє саму бурю', () => {
    expect(nightKeys({ ...ALL_DONE, weather: 'rain' })).toContain('night.storm.wet');
    expect(nightKeys({ ...ALL_DONE, weather: 'sunny' })).toContain('night.storm.wind');
  });
});

describe('ніч ніколи не блокує', () => {
  it('навіть найгірший день закінчується ранком, без екрана поразки', () => {
    const worst = nightOf(NIGHT_FACTS);
    expect(worst.blocked).toBe(false);
    expect(worst.morning).toBe(true);
    expect(roughCount(NIGHT_FACTS)).toBeGreaterThan(0);
    expect(worst.beats.length).toBeGreaterThanOrEqual(ROUTINE_IDS.length);
  });
  it('найкращий день — теж ранок, але слідів «важко» немає', () => {
    expect(nightOf(ALL_DONE).blocked).toBe(false);
    expect(roughCount(ALL_DONE)).toBe(0);
  });
  it('«сяк-так» скрізь — ніч гірша, але не блок', () => {
    const scrappy: NightFacts = { ...ALL_DONE, results: Object.fromEntries(ROUTINE_IDS.map((id) => [id, 'scrappy' as Outcome])), litLanterns: 1, dryLogs: 2, water: 0.5, fish: 1, bitterBerries: 1, foodOutside: false };
    expect(nightOf(scrappy).blocked).toBe(false);
    expect(roughCount(scrappy)).toBeLessThan(roughCount(NIGHT_FACTS));
    expect(nightKeys(scrappy)).not.toEqual(nightKeys(ALL_DONE));
  });
});
