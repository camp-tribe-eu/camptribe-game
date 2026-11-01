// GAME-202 · умова діалогу `taskOpen`: вибір-доручення видно, лише поки справа живої хвилі ВІДКРИТА. Зроблена, спізнена чи хвиля минула —
// вибору немає (інакше «Іду» — а ніхто не йде: справи вже нема). Мутації (кожна — червоний тест нижче): «будь-яка справа відкрита» (return true),
// «читати past замість active», «не зважати на outcome».
import { describe, expect, it } from 'vitest';
import type { CondDef } from './defs';
import { holds, type StoryDraft } from './story';
import type { PlayerState } from './state';
import { NEW_LIFE } from './life';
import type { WaveState } from './wave';

const P: PlayerState = { profileId: 'profile.a', transportId: 'transport.car', animalId: 'animal.none', locationId: 'loc.camp' };
const draft = (wave?: WaveState): StoryDraft => ({
  moneyCents: 0, inventory: {}, grants: [], events: [], player: P, quests: {}, campaignEnded: false, flags: [], npcMemory: {}, skills: {}, practice: {}, gear: {}, life: NEW_LIFE, dialogue: null,
  ...(wave ? { wave } : {}),
});
const live = (outcome: 'open' | 'done' | 'late'): WaveState => ({ active: { waveId: 'wave.x', startedAt: 0, tasks: { 'gear-shelter': { dueAt: 60, outcome }, dinner: { dueAt: 60, outcome: 'open' } } }, past: {} });
const C: CondDef = { taskOpen: 'gear-shelter' };

describe('taskOpen (GAME-202)', () => {
  it('відкрита справа живої хвилі — так', () => { expect(holds(C, draft(live('open')), P)).toBe(true); });
  it('справу зроблено чи спізнено — ні (мутація «не зважати на outcome»)', () => {
    expect(holds(C, draft(live('done')), P)).toBe(false);
    expect(holds(C, draft(live('late')), P)).toBe(false);
  });
  it('хвилі нема або вона минула (лише past) — ні (мутація «читати past»)', () => {
    expect(holds(C, draft(), P)).toBe(false);
    expect(holds(C, draft({ active: null, past: { 'wave.x': { 'gear-shelter': 'done' } } }), P)).toBe(false);
  });
  it('інша справа тієї ж хвилі відкрита — це не ця (мутація «будь-яка справа»)', () => {
    expect(holds({ taskOpen: 'firewood' }, draft(live('open')), P)).toBe(false);
    expect(holds({ taskOpen: 'dinner' }, draft(live('done')), P)).toBe(true);
  });
  it('у складі all/any — як звичайний лист', () => {
    expect(holds({ all: [C, { notFlag: 'f.x' }] }, draft(live('open')), P)).toBe(true);
    expect(holds({ all: [C, { notFlag: 'f.x' }] }, draft(live('done')), P)).toBe(false);
    expect(holds({ any: [C, { flag: 'f.x' }] }, draft(live('done')), P)).toBe(false);
  });
});
