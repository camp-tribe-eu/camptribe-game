// GAME-311 · день у таборі: час, ролі й ціна порожнього табору. Мутації, кожна з яких робить цей файл червоним:
//   «нескінченний день» (DAY_MINUTES = 9999) · «одна людина робить усе» (whyNot без перевірки owner)
//   · «порядок будь-коли» (whyNot без перевірки раунду) · «порожній табір безкоштовний» (emptyRounds → [])
//   · «рутини миттєві» (ROUTINES[*].seconds = 0 — вимір часу падає нижче 10 хв).
import { describe, expect, it } from 'vitest';
import { CHEAPEST_ALL, DAY_MINUTES, MEMBERS, ROUNDS, ROUTINES, ROUTINE_IDS, addPick, awayIn, campBusy, campMinutes, canAdd, emptyRounds, idleJobOf, minutesLeft, minutesUsed, recordResult, skipped, startCampDay, whyNot, type RoutineId } from './camp-day';

const subsets = <T>(xs: readonly T[]): T[][] => xs.reduce<T[][]>((acc, x) => [...acc, ...acc.map((s) => [...s, x])], [[]]);

describe('часу не вистачає на все — отже, є що обирати', () => {
  it('навіть найдешевші варіанти всіх семи рутин не влазять у день', () => {
    expect(CHEAPEST_ALL).toBeGreaterThan(DAY_MINUTES);
  });
  it('жоден набір із усіх семи не влазить; а шість — влазять', () => {
    const fits = (ids: readonly RoutineId[]): boolean => ids.reduce((a, id) => a + ROUTINES[id].minutes[0], 0) <= DAY_MINUTES;
    expect(fits(ROUTINE_IDS)).toBe(false);
    const all = subsets(ROUTINE_IDS).filter(fits);
    expect(Math.max(...all.map((s) => s.length))).toBe(6);
  });
  it('час справді витрачається: узяв рутину — лишилось менше', () => {
    const d = addPick(startCampDay(), 'fish', 'morning');
    expect(minutesUsed(d)).toBe(ROUTINES.fish.minutes[0]);
    expect(minutesLeft(d)).toBe(DAY_MINUTES - ROUTINES.fish.minutes[0]);
  });
  it('дорожчий варіант дрів (далі в ліс по сухе) коштує більше часу', () => {
    expect(ROUTINES.firewood.minutes[1]).toBeGreaterThan(ROUTINES.firewood.minutes[0]);
    const near = addPick(startCampDay(), 'firewood', 'morning', false);
    const far = addPick(startCampDay(), 'firewood', 'morning', true);
    expect(minutesLeft(far)).toBeLessThan(minutesLeft(near));
  });
  it('коли часу нема — рутину не взяти, і причина названа', () => {
    let d = startCampDay();
    d = addPick(d, 'fish', 'morning');
    d = addPick(d, 'firewood', 'noon', true);
    d = addPick(d, 'berries', 'noon');
    d = addPick(d, 'water', 'afternoon');
    expect(minutesLeft(d)).toBeLessThan(ROUTINES.fire.minutes[0]);
    expect(whyNot(d, 'fire', 'afternoon')).toBe('noTime');
    expect(canAdd(d, 'fire', 'afternoon')).toBe(false);
    expect(skipped(d)).toContain('fire');
  });
});

describe('ролі: іде той, кого справа стосується', () => {
  it('у кожної рутини свій виконавець, і всі троє при ділі', () => {
    expect(new Set(ROUTINE_IDS.map((id) => ROUTINES[id].owner))).toEqual(new Set(MEMBERS));
  });
  it('одна людина не робить двох справ за раунд', () => {
    const d = addPick(startCampDay(), 'firewood', 'morning');
    expect(ROUTINES.fish.owner).toBe(ROUTINES.firewood.owner);
    expect(whyNot(d, 'fish', 'morning')).toBe('busy');
    expect(whyNot(d, 'fish', 'noon')).toBeNull();
  });
  it('хто лишився в таборі — зайнятий своїм, і це видно', () => {
    const d = addPick(startCampDay(), 'fish', 'morning');
    const home = campBusy(d, 'morning');
    expect(home.map((h) => h.member)).toEqual(['victoria', 'matthew']);
    for (const h of home) expect(h.job).toBe(idleJobOf(h.member));
  });
  it('«порядок у таборі» — вечірня справа, і лише вона', () => {
    expect(whyNot(startCampDay(), 'tidy', 'morning')).toBe('when');
    expect(whyNot(startCampDay(), 'tidy', 'evening')).toBeNull();
    expect(whyNot(startCampDay(), 'fire', 'evening')).toBe('when');
  });
  it('у раунді не більше трьох справ — по одній на людину', () => {
    let d = startCampDay();
    d = addPick(d, 'firewood', 'morning');
    d = addPick(d, 'berries', 'morning');
    d = addPick(d, 'water', 'morning');
    expect(whyNot(d, 'lanterns', 'morning')).toBe('full');
    expect(awayIn(d, 'morning')).toHaveLength(MEMBERS.length);
  });
});

describe('відправив усіх — табір нікому стерегти', () => {
  it('три справи з табору в одному раунді лишають табір порожнім', () => {
    let d = startCampDay();
    d = addPick(d, 'firewood', 'morning');
    d = addPick(d, 'berries', 'morning');
    d = addPick(d, 'water', 'morning');
    expect(emptyRounds(d)).toEqual(['morning']);
    expect(campBusy(d, 'morning')).toEqual([]);
  });
  it('лишив когось удома — табір під наглядом', () => {
    let d = startCampDay();
    d = addPick(d, 'firewood', 'morning');
    d = addPick(d, 'berries', 'morning');
    d = addPick(d, 'lanterns', 'morning');
    expect(emptyRounds(d)).toEqual([]);
    expect(campBusy(d, 'morning').map((h) => h.member)).toEqual(['matthew']);
  });
  it('раундів чотири, і вечір серед них', () => {
    expect(ROUNDS).toContain('evening');
    expect(ROUNDS).toHaveLength(4);
  });
});

describe('результат рутини лягає в день', () => {
  it('записати можна лише те, що планували; незігране лишається пропущеним', () => {
    const d = recordResult(addPick(startCampDay(), 'water', 'morning'), 'water', 'good');
    expect(d.results.water).toBe('good');
    expect(skipped(d)).not.toContain('water');
    expect(recordResult(startCampDay(), 'fish', 'good').results.fish).toBeUndefined();
  });
});

describe('вимір часу: табірна частина дня — 10–12 хвилин', () => {
  const fits = (ids: readonly RoutineId[]): boolean => ids.reduce((a, id) => a + ROUTINES[id].minutes[0], 0) <= DAY_MINUTES;
  const cheapest = Math.min(...ROUTINE_IDS.map((id) => ROUTINES[id].minutes[0]));
  // «Повний день»: набір, що влазить і в який уже нічого не додати (лишилось менше за найдешевшу рутину).
  const fullDays = subsets(ROUTINE_IDS).filter((s) => fits(s) && DAY_MINUTES - s.reduce((a, id) => a + ROUTINES[id].minutes[0], 0) < cheapest);

  it('кожен повний день гравця лягає в 10–12 хвилин', () => {
    expect(fullDays.length).toBeGreaterThan(3);
    const times = fullDays.map((s) => campMinutes(s));
    const lo = Math.min(...times);
    const hi = Math.max(...times);
    expect(`${lo}..${hi}`).toBe(`${lo}..${hi}`);   // число звіту — у PR
    expect(lo).toBeGreaterThanOrEqual(10);
    expect(hi).toBeLessThanOrEqual(12);
  });
  it('типовий день (вода, дрова по сухе, вогонь, риба, порядок) — у межах', () => {
    const typical: RoutineId[] = ['water', 'firewood', 'fire', 'fish', 'tidy'];
    const min = campMinutes(typical);
    expect(min).toBeGreaterThanOrEqual(10);
    expect(min).toBeLessThanOrEqual(12);
  });
});
