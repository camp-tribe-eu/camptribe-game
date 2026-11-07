import { describe, expect, it } from 'vitest';
import { GAME_DEFS } from '../content/slice-defs';
import { euros, isEmptySum, mergeSums, NO_REWARD, rewardDelta, stickerParts, type CoreSnap } from './reward-sticker';

const snap = (o: Partial<CoreSnap> = {}): CoreSnap => ({ xp: 0, om: 0, skills: {}, grants: [], ...o });
const L = { xp: 'XP', om: 'ОМ', skill: (id: string) => id.replace('skill.', '') };

describe('GAME-247 · модель наклейки нагороди', () => {
  it('приріст = різниця знімків ядра; нова нагорода дає рівно свої moneyCents', () => {
    const d = rewardDelta(snap({ xp: 10, om: 5, skills: { 'skill.camping': 4 } }), snap({ xp: 25, om: 5, skills: { 'skill.camping': 7, 'skill.cooking': 2 }, grants: ['g.a'] }), { 'g.a': 500 });
    expect(d).toEqual({ cents: 500, xp: 15, om: 0, skills: { 'skill.camping': 3, 'skill.cooking': 2 } });
  });
  it('стара нагорода, зменшення й невідомий grantId — нічого', () => {
    expect(isEmptySum(rewardDelta(snap({ xp: 9, grants: ['g.a'] }), snap({ xp: 3, grants: ['g.a', 'g.x'] }), { 'g.a': 500 }))).toBe(true);
  });
  it('кожна нагорода з визначень гри віддає в моделі точну суму', () => {
    const cents: Record<string, number> = {};
    for (const d of Object.values(GAME_DEFS.interactions)) cents[d.grantId] = d.moneyCents;
    for (const q of Object.values(GAME_DEFS.story?.quests ?? {})) if (q.reward) cents[q.reward.grantId] = q.reward.moneyCents;
    expect(Object.keys(cents).length).toBeGreaterThan(0);
    for (const [g, c] of Object.entries(cents)) expect(rewardDelta(snap(), snap({ grants: [g] }), cents).cents, g).toBe(c);
  });
  it('злиття складає, а не губить; текст і порядок стабільні', () => {
    const m = mergeSums({ cents: 500, xp: 5, om: 0, skills: { 'skill.camping': 2 } }, { cents: 250, xp: 10, om: 3, skills: { 'skill.camping': 1, 'skill.cooking': 5 } });
    expect(m).toEqual({ cents: 750, xp: 15, om: 3, skills: { 'skill.camping': 3, 'skill.cooking': 5 } });
    expect(stickerParts(m, L).map((p) => p.text)).toEqual(['+7,50 €', '+15 XP', '+3 ОМ', '+5 cooking', '+3 camping']);
    expect(mergeSums(NO_REWARD, NO_REWARD)).toEqual(NO_REWARD);
  });
  it('євро: цілі без копійок', () => { expect(euros(500)).toBe('5'); expect(euros(250)).toBe('2,50'); });
});
