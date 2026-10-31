// GAME-207 · фонова музика: ЧИСТИЙ вибір теми за мапою, вступом і годиною доби (musicFor) + одна тема за раз із плавним
// перехресним переходом (createMusic на спільному програвачі петель). Тут немає Phaser: петлі запускає мікшер через SoundOut.
// Гучність — канал «music» мікшера (той самий ползунок і mute, що для фону), і ще MUSIC_LEVEL під ефектами.
// Файли — власний детермінований синтез scripts/audio/gen-music.mjs (CC0, docs/LICENSE_REGISTER.md SND-019…024).
import { createLoopPlayer, type AmbientState } from './ambient';
import type { Mixer } from './mixer';

export type MusicTrack = 'intro' | 'home' | 'road' | 'shop' | 'camp-day' | 'camp-evening';
/** Що звучить: тема або явна тиша. */
export type MusicChoice = MusicTrack | 'silence';
export type MapKey = NonNullable<AmbientState['map']>;

export const MUSIC_FILES: Readonly<Record<MusicTrack, { readonly key: string; readonly url: string }>> = {
  intro: { key: 'mus-intro', url: 'audio/mus-intro.ogg' },
  home: { key: 'mus-home', url: 'audio/mus-home.ogg' },
  road: { key: 'mus-road', url: 'audio/mus-road.ogg' },
  shop: { key: 'mus-shop', url: 'audio/mus-shop.ogg' },
  'camp-day': { key: 'mus-camp-day', url: 'audio/mus-camp-day.ogg' },
  'camp-evening': { key: 'mus-camp-evening', url: 'audio/mus-camp-evening.ogg' },
};

/** Тема КОЖНОЇ мапи гри — явно: або назва теми, або 'silence', або 'by-daylight' (день/вечір за годиною). Мапа без рядка тут — червоний music.test. */
export const MUSIC_BY_MAP: Readonly<Record<MapKey, MusicTrack | 'silence' | 'by-daylight'>> = {
  home: 'home',
  road: 'road',
  shop: 'shop',          // GAME-204: легка весела мелодія крамниці
  camp: 'by-daylight',
};

/** Вечірня тема табору — від сутінків (19:30 за daylight.ts мінус пів години, щоб музика вела настрій) до світанку. */
export const EVENING_FROM_MINUTE = 19 * 60;
export const MORNING_FROM_MINUTE = 6 * 60 + 30;
export const isEveningMinute = (minuteOfDay: number): boolean => {
  const m = ((minuteOfDay % 1440) + 1440) % 1440;
  return m >= EVENING_FROM_MINUTE || m < MORNING_FROM_MINUTE;
};

export interface MusicState {
  readonly map: AmbientState['map'];
  readonly intro: boolean;
  /** Хвилина доби 0…1439 (daylight.timeOfDay). */
  readonly minuteOfDay: number;
}

/** Яка тема звучить у цьому стані. Вступ перекриває мапу; світ без мапи — тиша. */
export function musicFor(s: MusicState): MusicChoice {
  if (s.intro) return 'intro';
  if (s.map === null) return 'silence';
  const rule = MUSIC_BY_MAP[s.map];
  if (rule !== 'by-daylight') return rule;
  return isEveningMinute(s.minuteOfDay) ? 'camp-evening' : 'camp-day';
}

/** Рівень музики відносно каналу music: тихо, під ефектами й фоном. */
export const MUSIC_LEVEL = 0.45;
/** Перехресний перехід між темами — повільніший за фон, щоб зміна мапи не «смикала». */
export const MUSIC_FADE_MS = 2500;

export interface Music {
  /** Поточна тема (або тиша); перехід — у tick. */
  setTrack(choice: MusicChoice): void;
  tick(dtMs: number): void;
  /** Перший жест гравця (політика автовідтворення). */
  unlock(): void;
  /** Файли довантажено (сцена після першого кадру). До того рівні ростуть, але петля не стартує. */
  setReady(ready: boolean): void;
  /** Увімкнено взагалі (у збірці e2e — лише за ?music=1: тести детерміновані й без звуку). Вимкнено → завжди тиша і файли не вантажаться. */
  setEnabled(on: boolean): void;
  readonly enabled: boolean;
  readonly ready: boolean;
  /** Поточні рівні тем (лише читання, для тестів і зонда). */
  levels(): Readonly<Partial<Record<MusicTrack, number>>>;
}

export function createMusic(mx: Pick<Mixer, 'volume' | 'startLoop'>): Music {
  let ready = false;
  let enabled = true;
  const player = createLoopPlayer(MUSIC_FILES, mx, { fadeMs: MUSIC_FADE_MS, ready: () => ready });
  return {
    get enabled() { return enabled; },
    get ready() { return ready; },
    setTrack(choice) { player.setAmbient(enabled && choice !== 'silence' ? { [choice]: MUSIC_LEVEL } : null); },
    tick(dt) { player.tick(dt); },
    unlock() { player.unlock(); },
    setReady(r) { ready = r; },
    setEnabled(on) { enabled = on; if (!on) player.setAmbient(null); },
    levels() { return player.levels(); },
  };
}
