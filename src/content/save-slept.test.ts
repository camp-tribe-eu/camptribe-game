// GAME-256 · міграція сейву v3 → v4 (лічильник сну) і правило «спати — лише коли вечірній крок дня зроблено».
// Кожен сторож має негативний контроль: той самий оракул без міграції / без воріт показує червоне (закон 1).
import { describe, expect, it } from 'vitest';
import { dispatch, type Command } from '../core/commands';
import { GAME_START_MINUTE } from '../core/clock';
import type { CoreDefs, StoryDefs } from '../core/defs';
import { fromSave, SAVE_VERSION } from '../core/save';
import { newSim, type SimState } from '../core/sim';
import { initialState, type GameState } from '../core/state';
import { resolveSpot, TENT_SPOT } from './map-first';
import { GAME_DEFS } from './slice-defs';
import { STORY } from './story';
import v3unslept from '../../tests/saves/v3-day2-unslept.json';

const at = (day: number, hh: number, mm = 0): number => (day - 1) * 1440 + hh * 60 + mm - GAME_START_MINUTE;
let n = 0;
const send = (s: GameState, m: Record<string, unknown>, defs: CoreDefs, now?: number) => dispatch(s, { ...m, commandId: `ss${n++}` } as Command, defs, undefined, undefined, undefined, now);
const code = (r: ReturnType<typeof send>): string => (r.ok ? 'ok' : r.code);
const load = (text: string, story: StoryDefs | null = STORY) => fromSave(text, { ...(story ? { story } : {}), ...(GAME_DEFS.life ? { life: GAME_DEFS.life } : {}) });

describe('сейв v3 (до лічильника сну) → v4', () => {
  const text = JSON.stringify(v3unslept);
  it('версія збірки 4, фікстура — справжній v3 без `slept`, а CH1-D2-001 активний', () => {
    expect(SAVE_VERSION).toBe(4);
    expect(v3unslept.schemaVersion).toBe(3);
    expect((v3unslept.sim.game as { slept?: number }).slept).toBeUndefined();
    expect(v3unslept.sim.game.quests['CH1-D2-001']?.status).toBe('active');
  });
  it('міграція: день 2 уже «відкритий» сейвом (slept = 1) — крок завершується, а не QUEST_NOT_YET', () => {
    const r = load(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fromVersion).toBe(3);
    expect(r.sim.game.slept).toBe(1);
    expect(code(send(r.sim.game, { type: 'CompleteQuest', questId: 'CH1-D2-001' }, GAME_DEFS, at(1, 12)))).toBe('ok');
  });
  it('негативний контроль: без міграції (slept немає) той самий крок — QUEST_NOT_YET', () => {
    const r = load(text);
    if (!r.ok) throw new Error(r.code);
    const { slept: _s, ...bare } = r.sim.game; void _s;
    expect(code(send(bare as GameState, { type: 'CompleteQuest', questId: 'CH1-D2-001' }, GAME_DEFS, at(1, 12)))).toBe('QUEST_NOT_YET');
  });
  it('без сюжету в ctx — лише за журналом: два Sleep → 2; стеля SLEEP_CAP; жодного сну → поля немає', () => {
    const withSleeps = (k: number): string => {
      const sim = JSON.parse(JSON.stringify(v3unslept.sim)) as SimState & { journal: unknown[] };
      for (let i = 0; i < k; i++) sim.journal.push({ at: i, commandId: `s${i}`, type: 'Sleep', ref: 'tent', cents: 0 });
      return JSON.stringify({ ...v3unslept, checksum: stateHashOf(sim), sim });
    };
    const two = load(withSleeps(2), null);
    expect(two.ok && two.sim.game.slept).toBe(2);
    const many = load(withSleeps(9), null);
    expect(many.ok && many.sim.game.slept).toBe(4);
    const none = load(text, null);
    expect(none.ok && none.sim.game.slept).toBeUndefined();
  });
});

describe('спати — лише коли вечірній крок дня зроблено', () => {
  const player = { profileId: 'profile.solo-explorer', transportId: 'transport.bike', animalId: 'animal.none', locationId: 'loc.camp.lake' };
  const base = (quests: GameState['quests']): GameState => ({ ...initialState(0), slept: 1, player, flags: ['f.night-tent'], quests });
  const pending = base({ 'ST-005': { status: 'completed', done: [] }, 'CH1-D2-CAMP-001': { status: 'active', done: [] } });
  const done = { ...base({ 'ST-005': { status: 'completed', done: [] }, 'CH1-D2-FIRE-001': { status: 'completed', done: [] }, 'CH1-D3-001': { status: 'active', done: [] } }), slept: 1 };
  const NO_GATES: CoreDefs = { ...GAME_DEFS, story: { ...STORY, quests: Object.fromEntries(Object.entries(STORY.quests).map(([id, q]) => { const { gate: _g, ...rest } = q; void _g; return [id, rest]; })) } };
  it('о 19:00 вечеря не зроблена — Sleep відмовлено; після 22:00 — можна; вечірні кроки зроблено — можна', () => {
    expect(code(send(pending, { type: 'Sleep' }, GAME_DEFS, at(2, 19)))).toBe('CONDITION_FAILED');
    expect(code(send(pending, { type: 'Sleep' }, GAME_DEFS, at(2, 22, 30)))).toBe('ok');
    expect(code(send(done, { type: 'Sleep' }, GAME_DEFS, at(2, 19)))).toBe('ok');
  });
  it('негативний контроль: без воріт сон о 19:00 з незробленою вечерею проходив би', () => {
    expect(code(send(pending, { type: 'Sleep' }, NO_GATES, at(2, 19)))).toBe('ok');
  });
  it('намет на мапі: «Спати» немає, поки вечеря не зроблена, і є, коли зроблено', () => {
    const sim = (g: GameState, m: number): SimState => ({ ...newSim(1), game: g, clock: { minutes: m, accMs: 0, paused: false } });
    expect(resolveSpot(sim(pending, at(2, 19)), GAME_DEFS, TENT_SPOT)).toBeNull();
    expect(resolveSpot(sim(done, at(2, 19)), GAME_DEFS, TENT_SPOT)?.moves[0]).toEqual({ type: 'Sleep' });
    expect(resolveSpot(sim(pending, at(2, 19)), NO_GATES, TENT_SPOT)?.moves[0]).toEqual({ type: 'Sleep' });   // контроль
  });
});

import { stateHash as stateHashOf } from '../core/hash';
