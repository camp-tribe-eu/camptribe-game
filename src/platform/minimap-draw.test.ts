import { describe, expect, it } from 'vitest';
import { miniSig } from './minimap-draw';
import type { MiniFrame } from '../content/agenda';

const F: MiniFrame = { key: 'camp', cols: 4, rows: 4, tones: new Uint8Array(0), px: 1.01, py: 2, dir: 'down', dots: [{ x: 3, y: 3 }] };

describe('miniSig (GAME-267)', () => {
  it('той самий знімок і дрібне тремтіння < 1/8 плитки — той самий підпис', () => {
    expect(miniSig({ ...F })).toBe(miniSig(F));
    expect(miniSig({ ...F, px: 1.03 })).toBe(miniSig(F));
  });
  it('крок гравця, напрям, мапа, крапки — інший підпис', () => {
    for (const g of [{ px: 1.5 }, { py: 2.4 }, { dir: 'left' as const }, { key: 'home' }, { dots: [] }, { dots: [{ x: 3, y: 2 }] }]) expect(miniSig({ ...F, ...g })).not.toBe(miniSig(F));
  });
});
