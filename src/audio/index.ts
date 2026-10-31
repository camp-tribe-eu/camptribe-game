// GAME-40 · спільний мікшер гри. Сцена підключає вихід (bindPhaser) після старту; UI лише змінює налаштування.
// GAME-194: фоновий шар (ambient) і жест-розблокування. Власного mute у збірці YouTube немає: окремого перемикача не додаємо,
// гучність і mute — ті самі налаштування, що вже є (платформа керує звуком сама).
import { createAmbient, type Ambient } from './ambient';
import { createMixer, type Mixer } from './mixer';
import { createMusic, type Music } from './music';
import { phaserSoundOut, type PhaserSoundManager } from './phaser-out';
import { loadSettings } from '../platform/settings';

export const mixer: Mixer = createMixer(loadSettings().audio);
export const ambient: Ambient = createAmbient(mixer);
/** GAME-207: фонова музика — та сама гучність і mute, що фон; тема за мапою/годиною (music.ts). */
export const music: Music = createMusic(mixer);

/** Викликає сцена, коли звуковий менеджер Phaser готовий. */
export function bindPhaser(manager: PhaserSoundManager | null): void {
  mixer.bind(manager ? phaserSoundOut(manager) : null);
}

/** Фон стартує лише після першого жесту гравця (політика браузерів); слухачі знімаються після першого. */
export function armFirstGesture(target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>, a: Pick<Ambient, 'unlock'> = ambient, m: Pick<Music, 'unlock'> = music): void {
  const events = ['pointerdown', 'keydown', 'touchstart'] as const;
  const fire = (): void => { a.unlock(); m.unlock(); for (const e of events) target.removeEventListener(e, fire); };
  for (const e of events) target.addEventListener(e, fire);
}
if (typeof window !== 'undefined') armFirstGesture(window);

let introOpen = false;
/** Вступ відкрито/закрито (Intro.tsx) — фон дощу. */
export function setIntroOpen(open: boolean): void { introOpen = open; }
export const isIntroOpen = (): boolean => introOpen;

export * from './mixer';
export { MUSIC_FILES, MUSIC_BY_MAP, MUSIC_LEVEL, MUSIC_FADE_MS, musicFor, isEveningMinute, type MusicTrack, type MusicChoice, type MusicState } from './music';
export { AMBIENT_FILES, ambientMix, type AmbientLayer, type AmbientMix, type AmbientState } from './ambient';
