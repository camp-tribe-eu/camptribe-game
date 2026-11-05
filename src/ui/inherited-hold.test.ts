import { describe, expect, it } from 'vitest';
import { freshPress, heldBlocks } from './inherited-hold';
import box from './DialogueBox.tsx?raw';

describe('GAME-237 · успадкований палець рамки розмови', () => {
  it('притиснутий палець глушить дотик і мишу', () => {
    expect(heldBlocks('click', new Set([3]))).toBe(true);
    expect(heldBlocks('click', new Set())).toBe(false);
    expect(heldBlocks('click', null)).toBe(false);
  });
  it('клавіатуру не глушить ніколи (загублений pointerup не замикає вибір клавішами)', () => {
    expect(heldBlocks('keydown', new Set([1]))).toBe(false);
  });
  it('нове натискання знімає всі успадковані (палець не натискає вдруге, не піднявшись)', () => {
    const s = new Set([1, 7]);
    freshPress(s);
    expect(heldBlocks('click', s)).toBe(false);
  });
  it('рамка справді користується цими правилами', () => {
    expect(box).toMatch(/heldBlocks\(e\.type, inherited\.current\)/);
    expect(box).toMatch(/addEventListener\('pointerdown', press/);
  });
});
