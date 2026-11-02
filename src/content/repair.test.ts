// GAME-209 · лагодження лавки: три удари, поза зоною удар не рахується, після третього нагорода раз (ядро: grantId + XP «секрет»).
import { describe, expect, it } from 'vitest';
import { REPAIR_FLAG, REPAIR_HITS, REPAIR_IDLE, REPAIR_INTERACTION, REPAIR_SPOT, stepRepair, type RepairState } from './repair';
import { STORY } from './story';
import { GAME_DEFS } from './slice-defs';

describe('GAME-209 · лавка руками', () => {
  it('три удари → done; четвертий нічого не дає', () => {
    let s: RepairState = REPAIR_IDLE; const ev: string[] = [];
    for (let i = 0; i < REPAIR_HITS + 1; i++) { const r = stepRepair(s, true); s = r.state; ev.push(r.event); }
    expect(ev).toEqual(['hit', 'hit', 'done', 'none']);
    expect(s).toEqual({ hits: REPAIR_HITS, done: true });
  });
  it('поза зоною дії удар не рахується', () => {
    expect(stepRepair(REPAIR_IDLE, false)).toEqual({ state: REPAIR_IDLE, event: 'none' });
  });
  it('прапорець лавки косметичний для перебору меню (інакше story-offer.test вибухає в часі): у requestFlags', () => {
    expect(STORY.requestFlags).toContain(REPAIR_FLAG);
  });
  it('взаємодія в каталозі ядра: 0 центів, прапорець, XP «секрет»', () => {
    expect(GAME_DEFS.interactions?.[REPAIR_SPOT]).toEqual(REPAIR_INTERACTION);
    expect(REPAIR_INTERACTION.flags).toEqual([REPAIR_FLAG]);
    expect(REPAIR_INTERACTION.moneyCents).toBe(0);
    expect(REPAIR_INTERACTION.award).toBe('secret');
  });
});
