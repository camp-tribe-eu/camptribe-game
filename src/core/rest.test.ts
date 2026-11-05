// GAME-242 · ритм дня: «пора спати», сон → ранок + підсумок, сон о 00:30, години крамниці.
// Хвилина 0 = 08:00. Тому: 21:00 = 780, 22:00 = 840, 00:30 = 990, 07:00 наступної доби = 1380, 07:30 = 1410.
import { describe, expect, it } from 'vitest';
import { bedtimeNight, minuteOfDay } from './clock';
import type { CoreDefs } from './defs';
import { daysEnded, daySummary } from './day-summary';
import { newSim, step, type JournalEntry, type SimState } from './sim';

const DEFS: CoreDefs = { items: { 'item.lamp': { buyCents: 900, soldAt: ['loc.shop'] } }, interactions: {} };
const PLAYER = { profileId: 'profile.a', transportId: 'transport.car', animalId: 'animal.none' };
const J0: JournalEntry = { at: 0, commandId: 'c0', type: 'CreateCharacter', ref: null, cents: 100_000 };
const J1: JournalEntry = { at: 5, commandId: 'c1', type: 'BuyItem', ref: 'item.lamp', cents: 99_100 };

/** Симуляція в локації `at` о хвилині `minutes`; `tent` — намет поставлено. */
function simAt(at: string, minutes: number, tent = false): SimState {
  const s = newSim(1, 100_000);
  return { ...s, clock: { ...s.clock, minutes }, journal: [J0, J1], game: { ...s.game, player: { ...PLAYER, locationId: at }, flags: tent ? ['f.night-tent'] : [] } };
}
const cmd = (s: SimState, command: { type: 'Sleep' | 'WaitForShop' } | { type: 'BuyItem'; itemId: string }, id = 'x1'): SimState =>
  step(s, { kind: 'command', command: { ...command, commandId: id } as never }, { defs: DEFS });

describe('GAME-242 · пора спати (підказка)', () => {
  it('вікно [22:00, 00:30): о 21:59 немає, о 22:00 і 00:29 — та сама ніч, о 00:30 — знову немає', () => {
    expect(bedtimeNight(839)).toBeNull();
    expect(bedtimeNight(840)).toBe(0);
    expect(bedtimeNight(989)).toBe(0);
    expect(bedtimeNight(990)).toBeNull();
    expect(bedtimeNight(840 + 1440)).toBe(1);
    expect(minuteOfDay(840)).toBe(22 * 60);
  });
});

describe('GAME-242 · сон', () => {
  it('удома ввечері: Sleep → 07:00 наступної доби, запис у журналі, день закрито з підсумком', () => {
    const before = simAt('loc.home', 870);   // 22:30
    expect(daysEnded(before, DEFS)).toBe(0);
    const after = cmd(before, { type: 'Sleep' });
    expect(after.clock.minutes).toBe(1380);
    expect(minuteOfDay(after.clock.minutes)).toBe(7 * 60);
    expect(after.journal.at(-1)).toMatchObject({ type: 'Sleep', ref: 'bed' });
    expect(daysEnded(after, DEFS)).toBe(1);
    expect(daySummary(after, 1, DEFS)?.ended).toBe(true);
  });
  it('після півночі, але до ранку: Sleep веде до 07:00 ТОЇ САМОЇ ранкової доби', () => {
    expect(cmd(simAt('loc.home', 1100), { type: 'Sleep' }).clock.minutes).toBe(1380);   // 02:18
  });
  it('намет у таборі: з 18:00, лише коли поставлено; без намету вдень і ввечері — відмова', () => {
    expect(cmd(simAt('loc.camp.lake', 600, true), { type: 'Sleep' }).journal.at(-1)?.ref).toBe('tent');   // 18:00
    const noTent = cmd(simAt('loc.camp.lake', 600, false), { type: 'Sleep' });
    expect(noTent.clock.minutes).toBe(600);
    expect(noTent.journal).toHaveLength(2);
  });
  it('вдень сон не дозволено навіть удома (інакше — пропуск доби)', () => {
    const noon = cmd(simAt('loc.home', 240), { type: 'Sleep' });   // 12:00
    expect(noon.clock.minutes).toBe(240);
  });
  it('після 22:00 — будь-де («де застала ніч»)', () => {
    const r = cmd(simAt('loc.road', 900), { type: 'Sleep' });   // 23:00
    expect(r.journal.at(-1)?.ref).toBe('late');
    expect(r.clock.minutes).toBe(1380);
  });
  it('сон одразу після квест-межі дня не показує той самий підсумок удруге', () => {
    const s = simAt('loc.home', 870);
    const done: SimState = { ...s, journal: [J0, J1, { at: 6, commandId: 'c2', type: 'Sleep', ref: 'bed', cents: 99_100 }] };
    expect(daysEnded(done, DEFS)).toBe(1);
    expect(daysEnded({ ...done, journal: [...done.journal, { ...done.journal[2] as JournalEntry, commandId: 'c3' }] }, DEFS)).toBe(1);
  });
});

describe('GAME-242 · герой засинає сам о 00:30', () => {
  it('кадр через 00:30 → прокидається о 07:30, запис auto, без втрат у грошах і речах', () => {
    const s = simAt('loc.road', 989);
    const r = step(s, { kind: 'frame', realMs: 1000 });
    expect(r.clock.minutes).toBe(1410);
    expect(minuteOfDay(r.clock.minutes)).toBe(7 * 60 + 30);
    expect(r.journal.at(-1)).toMatchObject({ type: 'Sleep', ref: 'auto' });
    expect(r.game.moneyCents).toBe(s.game.moneyCents);
    expect(daysEnded(r, DEFS)).toBe(1);
  });
  it('до 00:30 (00:28 → 00:29) не засинає', () => {
    const r = step(simAt('loc.road', 987), { kind: 'frame', realMs: 1000 });
    expect(r.clock.minutes).toBe(988);
    expect(r.journal).toHaveLength(2);
  });
  it('перемотування (advance) сон не вмикає — це рішення гравця чи тесту', () => {
    expect(step(simAt('loc.road', 980), { kind: 'advance', minutes: 20 }).journal).toHaveLength(2);
  });
});

describe('GAME-242 · крамниця 08:00–20:00', () => {
  const buy = (s: SimState): SimState => cmd(s, { type: 'BuyItem', itemId: 'item.lamp' });
  it('о 21:00 купівля відмовлена (гроші й речі цілі), о 09:00 — проходить', () => {
    const night = buy(simAt('loc.shop', 780));
    expect(night.game.inventory['item.lamp']).toBeUndefined();
    expect(night.game.moneyCents).toBe(100_000);
    expect(buy(simAt('loc.shop', 60)).game.inventory['item.lamp']).toBe(1);   // 09:00
  });
  it('межі: 19:59 відчинено, 20:00 зачинено, 08:00 відчинено', () => {
    expect(buy(simAt('loc.shop', 719)).game.inventory['item.lamp']).toBe(1);
    expect(buy(simAt('loc.shop', 720)).game.inventory['item.lamp']).toBeUndefined();
    expect(buy(simAt('loc.shop', 1440)).game.inventory['item.lamp']).toBe(1);
  });
  it('«почекати»: о 21:00 → 08:00 наступної доби; коли відчинено — відмова', () => {
    expect(cmd(simAt('loc.shop', 780), { type: 'WaitForShop' }).clock.minutes).toBe(1440);
    expect(cmd(simAt('loc.shop', 60), { type: 'WaitForShop' }).clock.minutes).toBe(60);
  });
});
