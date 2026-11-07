import { describe, expect, it } from 'vitest';
import { worldCovered, type CoverState } from './world-cover';

const open: CoverState = { paused: false, storyOpen: false, summary: false, atlasOpen: false, backpackOpen: false };

describe('worldCovered (GAME-268)', () => {
  it('світ іде, коли нічого не відкрито', () => expect(worldCovered(open)).toBe(false));
  it.each(['paused', 'storyOpen', 'summary', 'atlasOpen', 'backpackOpen'] as const)('%s закриває світ', (k) => expect(worldCovered({ ...open, [k]: true })).toBe(true));
  it('рамка розмови (її в стані немає) світ не закриває', () => {
    // Shell не передає `talk`: частково прозора рамка внизу не зупиняє світ — тип CoverState цього поля просто не має.
    expect(Object.keys(open)).not.toContain('talk');
    expect(worldCovered(open)).toBe(false);
  });
});
