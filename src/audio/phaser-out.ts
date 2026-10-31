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
      // Рецензія PR #143: Phaser кидає «Audio key missing from cache», якщо файл не завантажився (404, декодування) —
      // а петлю просять щокадру. Тиша замість зависання гри: тихий «порожній» дескриптор, повторних спроб немає.
      let snd: PhaserSound;
      try { snd = manager.add(key, { volume, loop: true }); snd.play(); } catch { return { setVolume() { /* немає файлу */ }, stop() { /* немає файлу */ } }; }
      return { setVolume(v) { snd.volume = v; }, stop() { snd.stop(); snd.destroy(); } };
    },
  };
}
