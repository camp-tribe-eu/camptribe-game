// GAME-40 · спільний мікшер гри. Сцена підключає вихід (bindPhaser) після старту; UI лише змінює налаштування.
import { createMixer, type Mixer } from './mixer';
import { phaserSoundOut, type PhaserSoundManager } from './phaser-out';
import { loadSettings } from '../platform/settings';

export const mixer: Mixer = createMixer(loadSettings().audio);

/** Викликає сцена, коли звуковий менеджер Phaser готовий. */
export function bindPhaser(manager: PhaserSoundManager | null): void {
  mixer.bind(manager ? phaserSoundOut(manager) : null);
}

export * from './mixer';
