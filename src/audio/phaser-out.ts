// GAME-40 · єдине місце, що торкається звукового менеджера Phaser (сторож: src/guards/audio-boundary.test.ts).
import type { SoundOut } from './mixer';

/** Мінімум від Phaser.Sound.BaseSound, потрібний для петлі. */
export interface PhaserSound { volume: number; play(): boolean; stop(): boolean; destroy(): void }

/** Мінімум від Phaser.Sound.BaseSoundManager, потрібний мікшеру. */
export interface PhaserSoundManager {
  play(key: string, config?: { volume?: number; loop?: boolean }): boolean;
  add(key: string, config?: { volume?: number; loop?: boolean }): PhaserSound;
}

export function phaserSoundOut(manager: PhaserSoundManager): SoundOut {
  return {
    play: (key, volume, loop) => { manager.play(key, { volume, loop }); },
    startLoop(key, volume) {
      const snd = manager.add(key, { volume, loop: true });
      snd.play();
      return { setVolume(v) { snd.volume = v; }, stop() { snd.stop(); snd.destroy(); } };
    },
  };
}
