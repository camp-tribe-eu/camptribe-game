// GAME-320 · зразковий день: дорога за північ не відхиляється (softlock), а обмежується стопкою; чисті стрибки відхиляються. Міст передає holdMinute у команди.
// Мутації: у step повернути `return s` для Visit → «дорога…» червоніє; у bridge.send прибрати holdMinute → «міст…» червоніє.
import { describe, expect, it } from 'vitest';
import { minuteOfDay } from '../core/clock';
import { nextCommandId, type Command } from '../core/commands';
import { newSim, step, type SimState } from '../core/sim';
import { createBridge } from '../view/world/bridge';
import { GAME_DEFS } from './slice-defs';
import { SAMPLE_HOLD_MINUTE } from './sample-day';

const send = (sim: SimState, c: object, hold?: number): SimState =>
  step(sim, { kind: 'command', command: { ...c, commandId: nextCommandId(sim.game) } as unknown as Command }, hold === undefined ? { defs: GAME_DEFS } : { defs: GAME_DEFS, holdMinute: hold });
function shopAt(minutes: number): SimState {
  let sim = newSim(1, 100_000);
  for (const c of [{ type: 'CreateCharacter', profileId: 'profile.solo-explorer', transportId: 'transport.bike' }, { type: 'CompleteQuest', questId: 'PROLOGUE-HOME-001' }, { type: 'CompleteQuest', questId: 'ST-001' }, { type: 'CompleteQuest', questId: 'ST-002' }, { type: 'Visit', locationId: 'loc.shop' }]) sim = send(sim, c);
  return { ...sim, clock: { ...sim.clock, minutes } };
}
const LATE = 23 * 60 + 57 - 8 * 60;   // 23:57, після стопки (хвилина 0 = 08:00): дорога перетнула б північ

describe('GAME-320: дорога в зразковому дні', () => {
  it('контроль: без утримання дорога з 23:20 переходить за північ', () => {
    const r = send(shopAt(LATE), { type: 'Visit', locationId: 'loc.home' });
    expect(r.game.player?.locationId).toBe('loc.home');
    expect(r.clock.minutes + 480).toBeGreaterThanOrEqual(1440);
  });
  it('з утриманням: дорога проходить, день той самий, годинник не йде за північ', () => {
    const r = send(shopAt(LATE), { type: 'Visit', locationId: 'loc.home' }, SAMPLE_HOLD_MINUTE);
    expect(r.game.player?.locationId).toBe('loc.home');
    expect(minuteOfDay(r.clock.minutes)).toBe(23 * 60 + 57);
  });
  it('дорога 45 хв з 23:20: приїзд рівно о 23:30 тієї ж доби (не відмова)', () => {
    const sim = shopAt(23 * 60 + 20 - 8 * 60);
    const ctx = { defs: GAME_DEFS, holdMinute: SAMPLE_HOLD_MINUTE, weather: { of: () => 'sunny' as const, tripMinutes: () => 45 } };
    const r = step(sim, { kind: 'command', command: { type: 'Visit', locationId: 'loc.home', commandId: nextCommandId(sim.game) } as Command }, ctx);
    expect(r.game.player?.locationId).toBe('loc.home');
    expect(minuteOfDay(r.clock.minutes)).toBe(SAMPLE_HOLD_MINUTE);
  });
  it('міст: send() з утриманням не пропускає команду за північ (дорога обмежена, сон відхилено)', () => {
    const b = createBridge(1, GAME_DEFS, undefined, undefined, SAMPLE_HOLD_MINUTE);
    b.load(shopAt(LATE));
    b.send({ type: 'Sleep' });
    expect(minuteOfDay(b.state.clock.minutes)).toBe(23 * 60 + 57);
    b.send({ type: 'Visit', locationId: 'loc.home' });
    expect(b.state.game.player?.locationId).toBe('loc.home');
    expect(minuteOfDay(b.state.clock.minutes)).toBe(23 * 60 + 57);
  });
});
