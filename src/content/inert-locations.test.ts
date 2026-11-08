// GAME-283 · inertLocations: локація без жодного посилання із сюжету не дає ходів Visit (простір станів перебору).
// Закон 1: прибрати перевірку посилань/предметів/unlockedBy у moves.ts → тест червоніє (мутація нижче в описі PR).
import { describe, expect, it } from 'vitest';
import type { StoryDefs } from '../core/defs';
import { initialState } from '../core/state';
import { GAME_DEFS } from './slice-defs';
import { inertLocations, moves } from './moves';

const base = (): StoryDefs => {
  const st = structuredClone(GAME_DEFS.story as StoryDefs) as unknown as { locations: Record<string, unknown> };
  st.locations['loc.t.free'] = { id: 'loc.t.free', items: [] };
  st.locations['loc.t.items'] = { id: 'loc.t.items', items: ['item.tent'] };
  st.locations['loc.t.npc'] = { id: 'loc.t.npc', items: [] };
  st.locations['loc.t.lock'] = { id: 'loc.t.lock', items: [], unlockedBy: 'ST-001' };
  return st as unknown as StoryDefs;
};

describe('inertLocations (GAME-283)', () => {
  it('нічим не згадана локація — інертна; з предметами, замком чи посиланням — ні', () => {
    const st = base();
    (st.npcs as unknown as Record<string, Record<string, unknown>>)['npc.t'] = { id: 'npc.t', locationId: 'loc.t.npc' };
    const inert = inertLocations(st);
    expect(inert.has('loc.t.free')).toBe(true);
    for (const id of ['loc.t.items', 'loc.t.npc', 'loc.t.lock']) expect(inert.has(id), id).toBe(false);
  });

  it('локації розділу 1 живі, а Visit в інертну не пропонується', () => {
    const st = base();
    const inert = inertLocations(st);
    for (const id of ['loc.home', 'loc.shop', 'loc.road', 'loc.camp.lake']) expect(inert.has(id), id).toBe(false);
    const state = initialState(0);
    const visits = moves(state, { ...GAME_DEFS, story: st }).filter((m) => m.type === 'Visit').map((m) => (m as { locationId: string }).locationId);
    expect(visits).not.toContain('loc.t.free');
    expect(visits).toContain('loc.t.items');
  });
});
