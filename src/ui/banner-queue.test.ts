// GAME-260 · банери — у черзі за екранами. Закон 1: мутація (bannersOpen ігнорує будь-яке поле) червонить відповідний рядок.
import { describe, expect, it } from 'vitest';
import { bannersOpen, type BannerBlockers } from './banner-queue';

const CLEAR: BannerBlockers = { paused: false, storyOpen: false, talk: false, summary: false, atlasOpen: false, backpackOpen: false, episode: false, intro: false };

describe('bannersOpen (GAME-260)', () => {
  it('нічого не закриває поле — банер видно', () => { expect(bannersOpen(CLEAR)).toBe(true); });
  for (const k of Object.keys(CLEAR) as (keyof BannerBlockers)[]) {
    it(`${k} відкрито — банер чекає в черзі`, () => { expect(bannersOpen({ ...CLEAR, [k]: true })).toBe(false); });
  }
});
