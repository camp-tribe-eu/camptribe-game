// GAME-31 · дороги: найкоротший шлях для транспорту, ціна в грошах, час одним кроком (SIM-TIME-004).
import { describe, expect, it } from 'vitest';
import { dispatch, type Command } from './commands';
import type { CoreDefs, StoryDefs } from './defs';
import { newSim, step, type SimState } from './sim';
import { initialState } from './state';
import { route } from './story';
import { BIKER, DRIVER, ROAD_DEFS, STORY_DEFS, play } from './story.fixture';

const ST = ROAD_DEFS.story as StoryDefs;
const cmd = (c: Record<string, unknown>, id: string): Command => ({ ...c, commandId: id } as Command);

describe('route: найкоротша дорога (GAME-31)', () => {
  it('велосипедом — крізь замкнений собачий парк (проїхати можна, зупинитись ні): 30 хв, 0 €', () => {
    expect(route(ST, 'loc.home', 'loc.shop', 'transport.bike')).toEqual({ minutes: 30, cents: 0 });
  });
  it('автом — однаковий час (10 хв) напряму і через парк: береться дешевший', () => {
    expect(route(ST, 'loc.home', 'loc.shop', 'transport.car')).toEqual({ minutes: 10, cents: 200 });
  });
  it('без дороги для транспорту — null; на місці і «ще ніде» — нуль; сюжет без доріг — нуль', () => {
    expect(route(ST, 'loc.shop', 'loc.home', 'transport.bike')).toBeNull();
    expect(route(ST, 'loc.home', 'loc.home', 'transport.bike')).toEqual({ minutes: 0, cents: 0 });
    expect(route(ST, null, 'loc.shop', 'transport.bike')).toEqual({ minutes: 0, cents: 0 });
    expect(route(STORY_DEFS.story as StoryDefs, 'loc.home', 'loc.shop', 'transport.bike')).toEqual({ minutes: 0, cents: 0 });
  });
});

describe('Visit по дорозі: гроші й відмови', () => {
  const atHomeDriver = (money: number) => play([DRIVER, { type: 'Visit', locationId: 'loc.home' }, { type: 'CompleteQuest', questId: 'q.start' }], initialState(money), ROAD_DEFS);
  it('ціна дороги списується рівно раз; повтор commandId — без другого списання', () => {
    const s0 = atHomeDriver(1_000);
    const c = cmd({ type: 'Visit', locationId: 'loc.shop' }, 'r1');
    const r1 = dispatch(s0, c, ROAD_DEFS);
    expect(r1.ok && r1.state.moneyCents).toBe(800);
    const r2 = dispatch(r1.state, c, ROAD_DEFS);
    expect(r2.ok && r2.repeated && r2.state.moneyCents).toBe(800);
  });
  it('грошей на дорогу бракує — INSUFFICIENT_FUNDS, гравець на місці', () => {
    const s0 = atHomeDriver(150);
    const r = dispatch(s0, cmd({ type: 'Visit', locationId: 'loc.shop' }, 'r2'), ROAD_DEFS);
    expect(r).toMatchObject({ ok: false, code: 'INSUFFICIENT_FUNDS' });
    expect(r.state.player?.locationId).toBe('loc.home');
  });
});

describe('час на дорозі (SIM-TIME-004)', () => {
  const run = (inputs: readonly Command[], defs: CoreDefs = ROAD_DEFS): SimState =>
    inputs.reduce<SimState>((s, c) => step(s, { kind: 'command', command: c }, { defs }), newSim(1, 1_000));
  const prep = [cmd(BIKER, 'a0'), cmd({ type: 'Visit', locationId: 'loc.home' }, 'a1'), cmd({ type: 'CompleteQuest', questId: 'q.start' }, 'a2')];

  it('дорога перемотує годинник одним кроком на свої хвилини; запис журналу — з часом ДО дороги', () => {
    const before = run(prep);
    const after = run([...prep, cmd({ type: 'Visit', locationId: 'loc.shop' }, 'a3')]);
    expect(after.clock.minutes - before.clock.minutes).toBe(30);
    expect(after.journal.at(-1)).toMatchObject({ type: 'Visit', ref: 'loc.shop', at: before.clock.minutes });
  });
  it('відмова, повтор і «прийти туди, де стоїш» — годинник стоїть', () => {
    const base = run([...prep, cmd({ type: 'Visit', locationId: 'loc.shop' }, 'a3')]);
    const again = run([...prep, cmd({ type: 'Visit', locationId: 'loc.shop' }, 'a3'), cmd({ type: 'Visit', locationId: 'loc.shop' }, 'a3')]);
    expect(again.clock.minutes).toBe(base.clock.minutes);                               // повтор commandId
    const stay = run([...prep, cmd({ type: 'Visit', locationId: 'loc.shop' }, 'a3'), cmd({ type: 'Visit', locationId: 'loc.shop' }, 'a4')]);
    expect(stay.clock.minutes).toBe(base.clock.minutes);                                // на місці
    const noRoute = run([...prep, cmd({ type: 'Visit', locationId: 'loc.shop' }, 'a3'), cmd({ type: 'Visit', locationId: 'loc.home' }, 'a5')]);
    expect(noRoute.clock.minutes).toBe(base.clock.minutes);                             // NO_ROUTE
    expect(noRoute.game.player?.locationId).toBe('loc.shop');
  });
  it('позитивний контроль: без доріг у сюжеті перехід миттєвий', () => {
    const a = run(prep, STORY_DEFS);
    const b = run([...prep, cmd({ type: 'Visit', locationId: 'loc.shop' }, 'a3')], STORY_DEFS);
    expect(b.clock.minutes).toBe(a.clock.minutes);
    expect(b.game.player?.locationId).toBe('loc.shop');
  });
});
