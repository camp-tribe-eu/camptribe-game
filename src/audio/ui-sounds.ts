// GAME-40 · звуки інтерфейсу (SND-001…003, CC0; завантаження — у preload сцени, див. тест відповідності): три події → три ключі, все через ЄДИНИЙ мікшер (mixer.ts).
// Мікшер сам вирішує: mute або гучність 0 → не грає; немає виходу Phaser (сцена ще вантажиться) → не грає.
import { mixer as sharedMixer, type Mixer } from './index';

export type UiSound = 'press' | 'confirm' | 'back';

/** Ключ у кеші Phaser → шлях відносно сторінки (файли локальні: жодних зовнішніх запитів, збірка YouTube). */
export const UI_SOUND_FILES: Readonly<Record<UiSound, { readonly key: string; readonly url: string }>> = {
  press: { key: 'ui-click', url: 'audio/ui-click_001.ogg' },       // SND-001
  confirm: { key: 'ui-confirmation', url: 'audio/ui-confirmation_001.ogg' },   // SND-002
  back: { key: 'ui-back', url: 'audio/ui-back_001.ogg' },         // SND-003
};

/** Кнопки «назад/закрити/скасувати» (data-ui) і «позитивні підтвердження»; решта кнопок — звичайний клік. */
const BACK = new Set(['story-close', 'confirm-new-no', 'recovery-close', 'summary-end', 'stale-dismiss']);
const CONFIRM = new Set(['resume', 'summary-continue', 'confirm-new-yes']);
export function soundForButton(dataUi: string | undefined): UiSound {
  if (dataUi !== undefined && BACK.has(dataUi)) return 'back';
  if (dataUi !== undefined && CONFIRM.has(dataUi)) return 'confirm';
  return 'press';
}

export interface UiSounds {
  play(sound: UiSound): boolean;
  /** Що мікшер прийняв до відтворення (останні 32) — для тестів; лише читання. */
  readonly played: readonly string[];
}

export function createUiSounds(mx: Pick<Mixer, 'play'>): UiSounds {
  const played: string[] = [];
  return {
    played,
    play(sound) {
      const key = UI_SOUND_FILES[sound].key;
      const ok = mx.play('sfx', key);
      if (ok) { played.push(key); if (played.length > 32) played.shift(); }
      return ok;
    },
  };
}

export const uiSounds: UiSounds = createUiSounds(sharedMixer);
export const playUi = (sound: UiSound): boolean => uiSounds.play(sound);
