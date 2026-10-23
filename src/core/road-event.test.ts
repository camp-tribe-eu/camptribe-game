// GAME-31 (частина 2) · подія в дорозі: кидок RNG симуляції після приїзду, команда RoadEvent у ядрі,
// діалог без NPC, раз за гру. «З однаковим зерном випадає однаково» — і зерно справді щось вирішує.
import { describe, expect, it } from 'vitest';
import { dispatch, type Command } from './commands';
import type { CoreDefs } from './defs';
import { stateHash } from './hash';
import { newSim, run, type Input, type SimState } from './sim';
import { initialState } from './state';
import { eventSeenFlag } from './story';
import { BIKER, EVENT_DEFS, play } from './story.fixture';

const cmd = (c: Record<string, unknown>, id: string): Command => ({ ...c, commandId: id } as Command);
const atShop = () => play([BIKER, { type: 'Visit', locationId: 'loc.home' }, { type: 'CompleteQuest', questId: 'q.start' }, { type: 'Visit', locationId: 'loc.shop' }], initialState(0), EVENT_DEFS);

describe('команда RoadEvent у ядрі', () => {
  it('відкриває діалог-подію і ставить прапорець «була»; удруге — CONDITION_FAILED', () => {
    const r = dispatch(atShop(), cmd({ type: 'RoadEvent', eventId: 'dlg.ev-rain' }, 'e1'), EVENT_DEFS);
    expect(r.ok && r.state.dialogue).toEqual({ id: 'dlg.ev-rain', node: 'rain' });
    expect(r.ok && r.state.flags).toContain(eventSeenFlag('dlg.ev-rain'));
    const done = play([{ type: 'Choose', choice: 0 }, { type: 'Continue' }], r.state, EVENT_DEFS);
    expect(done.dialogue).toBeNull();
    expect(done.flags).toContain('f.wet');
    expect(dispatch(done, cmd({ type: 'RoadEvent', eventId: 'dlg.ev-rain' }, 'e2'), EVENT_DEFS)).toMatchObject({ ok: false, code: 'CONDITION_FAILED' });
  });
  it('відмови: не там (CONDITION_FAILED), розмова NPC (UNKNOWN_TARGET), у розмові (IN_DIALOGUE), без персонажа', () => {
    const home = play([BIKER, { type: 'Visit', locationId: 'loc.home' }], initialState(0), EVENT_DEFS);
    expect(dispatch(home, cmd({ type: 'RoadEvent', eventId: 'dlg.ev-rain' }, 'e3'), EVENT_DEFS)).toMatchObject({ ok: false, code: 'CONDITION_FAILED' });
    expect(dispatch(atShop(), cmd({ type: 'RoadEvent', eventId: 'dlg.ann' }, 'e4'), EVENT_DEFS)).toMatchObject({ ok: false, code: 'UNKNOWN_TARGET' });
    const talking = play([{ type: 'Talk', npcId: 'npc.ann' }], atShop(), EVENT_DEFS);
    expect(dispatch(talking, cmd({ type: 'RoadEvent', eventId: 'dlg.ev-rain' }, 'e5'), EVENT_DEFS)).toMatchObject({ ok: false, code: 'IN_DIALOGUE' });
    expect(dispatch(initialState(0), cmd({ type: 'RoadEvent', eventId: 'dlg.ev-rain' }, 'e6'), EVENT_DEFS)).toMatchObject({ ok: false, code: 'NO_CHARACTER' });
  });
});

describe('кидок у симуляції після приїзду', () => {
  const LOG: Input[] = [cmd(BIKER, 'a0'), cmd({ type: 'Visit', locationId: 'loc.home' }, 'a1'), cmd({ type: 'CompleteQuest', questId: 'q.start' }, 'a2'), cmd({ type: 'Visit', locationId: 'loc.shop' }, 'a3')]
    .map((command) => ({ kind: 'command', command }));
  const go = (seed: number, defs: CoreDefs = EVENT_DEFS, log: readonly Input[] = LOG): SimState => run(newSim(seed, 0), log, { defs });

  it('те саме зерно — той самий результат (два прогони, однаковий хеш стану)', () => {
    for (const seed of [1, 2, 3, 20261022]) expect(stateHash(go(seed))).toBe(stateHash(go(seed)));
  });
  it('зерно справді вирішує: серед 40 зерен подія випадає і не випадає (інакше «однаково» нічого не доводить)', () => {
    const fired = Array.from({ length: 40 }, (_, i) => go(i + 1).game.dialogue?.id === 'dlg.ev-rain');
    expect(fired.some(Boolean)).toBe(true);
    expect(fired.some((x) => !x)).toBe(true);
  });
  it('випала — у журналі «Подія в дорозі» одразу після приїзду; id команди — похідний від приїзду', () => {
    const seed = Array.from({ length: 40 }, (_, i) => i + 1).find((x) => go(x).game.dialogue?.id === 'dlg.ev-rain') as number;
    const s = go(seed);
    expect(s.journal.slice(-2).map((e) => [e.type, e.ref, e.commandId])).toEqual([['Visit', 'loc.shop', 'a3'], ['RoadEvent', 'dlg.ev-rain', 'a3.ev']]);
  });
  it('кидок споживає RNG стану (інакше дві події поспіль діставали б той самий кидок)', () => {
    expect(stateHash(go(5).rng)).not.toBe(stateHash(run(newSim(5, 0), LOG.slice(0, 3), { defs: EVENT_DEFS }).rng));
  });
  it('повтор приїзду (той самий commandId) не кидає вдруге; без кандидатів RNG не чіпається', () => {
    const once = go(5);
    const twice = go(5, EVENT_DEFS, [...LOG, LOG[3] as Input]);
    expect(stateHash(twice.rng)).toBe(stateHash(once.rng));
    const noEvents = { ...EVENT_DEFS, story: { ...(EVENT_DEFS.story as NonNullable<CoreDefs['story']>), dialogues: Object.fromEntries(Object.entries(EVENT_DEFS.story?.dialogues ?? {}).filter(([, d]) => !d.trigger)) } };
    expect(stateHash(go(5, noEvents).rng)).toBe(stateHash(run(newSim(5, 0), LOG.slice(0, 3), { defs: noEvents }).rng));
  });
});
