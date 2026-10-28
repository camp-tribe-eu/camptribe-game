// GAME-40 · єдине місце, що торкається звукового менеджера Phaser (сторож: src/guards/audio-boundary.test.ts).
import type { SoundOut } from './mixer';

/** Мінімум від Phaser.Sound.BaseSoundManager, потрібний мікшеру. */
export interface PhaserSoundManager {
  play(key: string, config?: { volume?: number; loop?: boolean }): boolean;
}

export function phaserSoundOut(manager: PhaserSoundManager): SoundOut {
  return { play: (key, volume, loop) => { manager.play(key, { volume, loop }); } };
}
