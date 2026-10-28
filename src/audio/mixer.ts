// GAME-40 · аудіо-основа. ЄДИНИЙ модуль звуку (CLAUDE.md: звук — через один модуль): мікшер з каналами master + sfx + music,
// вимкненням звуку (mute) і обмеженням гучності 0..1. Тут немає Phaser і WebAudio: мікшер лише вирішує, ЧИ і з якою
// гучністю грати, а грає SoundOut (phaser-out.ts — єдине місце, що торкається звукового менеджера Phaser).
// Гучність 0 (загальна чи каналу) або mute → SoundOut.play не викликається взагалі, а не викликається з volume 0.

export type Channel = 'sfx' | 'music';

export interface AudioSettings {
  readonly master: number;
  readonly sfx: number;
  readonly music: number;
  readonly muted: boolean;
}

export const DEFAULT_AUDIO: AudioSettings = { master: 0.8, sfx: 1, music: 0.6, muted: false };

/** Куди мікшер віддає вже порахований звук. Реалізація Phaser — phaser-out.ts; у тестах — запис викликів. */
export interface SoundOut {
  play(key: string, volume: number, loop: boolean): void;
}

/** Обмежує до 0..1; NaN, Infinity і не-числа — 0 (тиша безпечніша за гучний сюрприз). */
export function clamp01(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Читання з довільного (зіпсованого) JSON: чуже значення → типове, а не тиша. */
export function parseAudio(raw: unknown): AudioSettings {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const num = (x: unknown, d: number): number => (typeof x === 'number' && Number.isFinite(x) ? clamp01(x) : d);
  return { master: num(v.master, DEFAULT_AUDIO.master), sfx: num(v.sfx, DEFAULT_AUDIO.sfx), music: num(v.music, DEFAULT_AUDIO.music), muted: v.muted === true };
}

export function effectiveVolume(s: AudioSettings, channel: Channel): number {
  return s.muted ? 0 : clamp01(s.master) * clamp01(s[channel]);
}

export interface Mixer {
  readonly settings: AudioSettings;
  /** Грає звук каналу; false — нічого не зіграно (тиша, немає виходу). */
  play(channel: Channel, key: string, opts?: { readonly loop?: boolean }): boolean;
  /** Застосувати налаштування (з обмеженням 0..1). */
  apply(next: AudioSettings): void;
  /** Підключити/відключити вихід (сцена Phaser з'являється пізніше за мікшер). */
  bind(out: SoundOut | null): void;
}

export function createMixer(initial: AudioSettings = DEFAULT_AUDIO, initialOut: SoundOut | null = null): Mixer {
  let s = parseAudio(initial);
  let out = initialOut;
  return {
    get settings() { return s; },
    play(channel, key, opts) {
      const volume = effectiveVolume(s, channel);
      if (volume <= 0 || out === null) return false;
      out.play(key, volume, opts?.loop === true);
      return true;
    },
    apply(next) { s = parseAudio(next); },
    bind(o) { out = o; },
  };
}
