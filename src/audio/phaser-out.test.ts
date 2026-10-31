// Рецензія PR #143: петля з файлом, якого немає в кеші, не валить кадр — тиша замість винятку щокадру.
// Мутація: прибрати try/catch у startLoop → «не кидає» червоніє.
import { describe, expect, it } from 'vitest';
import { phaserSoundOut, type PhaserSoundManager } from './phaser-out';

const loop = (m: PhaserSoundManager) => { const start = phaserSoundOut(m).startLoop; if (!start) throw new Error('startLoop відсутній'); const h = start('mus-shop', 0.4); if (!h) throw new Error('немає дескриптора'); return h; };

describe('phaserSoundOut.startLoop', () => {
  it('не кидає, якщо Phaser не має файлу (add кидає «missing from cache»)', () => {
    expect(() => { const h = loop({ play: () => true, add: () => { throw new Error('Audio key "mus-shop" missing from cache'); } }); h.setVolume(0.2); h.stop(); }).not.toThrow();
  });
  it('звичайна петля грає й гасне', () => {
    const calls: string[] = [];
    const snd = { volume: 0, play: () => { calls.push('play'); return true; }, stop: () => { calls.push('stop'); return true; }, destroy: () => { calls.push('destroy'); } };
    const h = loop({ play: () => true, add: () => snd });
    h.setVolume(0.3);
    h.stop();
    expect(snd.volume).toBe(0.3);
    expect(calls).toEqual(['play', 'stop', 'destroy']);
  });
});
