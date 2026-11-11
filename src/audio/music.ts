// GAME-207 · фонова музика; GAME-252 · музика ЗА РОЛЛЮ (рішення власника OD-027): ЧИСТИЙ вибір ролі за станом (musicFor) + одна
// тема за раз із плавним перехресним переходом (createMusic на спільному програвачі петель). Тут немає Phaser: петлі запускає мікшер через SoundOut.
// Гучність — канал «music» мікшера (той самий ползунок і mute, що для фону), і ще MUSIC_LEVEL під ефектами.
// Файли — п'ять CC0-треків OpenGameArt, обраних власником (docs/LICENSE_REGISTER.md SND-026…030); старий синтез SND-019…024 знято.
import { createLoopPlayer, type AmbientState } from './ambient';
import type { Mixer } from './mixer';

/** Роль музики: головна (вільна гра), меню/Атлас, поспіх (квест під тиском), сюжет (вступ і кіно), ніч (вечір у таборі). */
export type MusicTrack = 'main' | 'menu' | 'hurry' | 'story' | 'night';
/** Що звучить: роль або явна тиша. */
export type MusicChoice = MusicTrack | 'silence';
export type MapKey = NonNullable<AmbientState['map']>;
/** Екран поверх світу, що має свою музику (Атлас). null — світ. */
export type MusicScreen = 'menu' | null;

export const MUSIC_FILES: Readonly<Record<MusicTrack, { readonly key: string; readonly url: string }>> = {
  main: { key: 'mus-main', url: 'audio/mus-main.ogg' },
  menu: { key: 'mus-menu', url: 'audio/mus-menu.ogg' },
  hurry: { key: 'mus-hurry', url: 'audio/mus-hurry.ogg' },
  story: { key: 'mus-story', url: 'audio/mus-story.ogg' },
  night: { key: 'mus-night', url: 'audio/mus-night.ogg' },
};

/** Роль КОЖНОЇ мапи гри — явно: роль, 'silence' або 'by-daylight' (табір: день → main, вечір → night). Мапа без рядка тут — червоний music.test. */
export const MUSIC_BY_MAP: Readonly<Record<MapKey, MusicTrack | 'silence' | 'by-daylight'>> = {
  home: 'main',
  road: 'main',
  shop: 'main',
  camp: 'by-daylight',
  schengen: 'by-daylight',   // GAME-291: набережна Шенгену — день → main, вечір → night, як табір
  mullerthal: 'by-daylight',   // GAME-295: кемпінг Мюллерталь — як табір: день → main, вечір → night
};

/** Вечірня тема табору — від вечора (сутінки daylight.ts починаються о 17:50; музика вмикається о 19:00, коли вже видно синій) до світанку. */
export const EVENING_FROM_MINUTE = 19 * 60;
export const MORNING_FROM_MINUTE = 6 * 60 + 30;
export const isEveningMinute = (minuteOfDay: number): boolean => {
  const m = ((minuteOfDay % 1440) + 1440) % 1440;
  return m >= EVENING_FROM_MINUTE || m < MORNING_FROM_MINUTE;
};

export interface MusicState {
  readonly map: AmbientState['map'];
  readonly intro: boolean;
  /** Екран поверх світу (Атлас → menu). */
  readonly screen?: MusicScreen;
  /** Квест під тиском (хвиля з лімітом часу) → hurry. Хука в грі ще нема — GAME-252 лише відкриває роль. */
  readonly hurry?: boolean;
  /** Хвилина доби 0…1439 (daylight.timeOfDay). */
  readonly minuteOfDay: number;
}

/** Яка роль звучить. Пріоритет: вступ/кіно (story) → екран (menu) → поспіх (hurry) → світ без мапи (тиша) → мапа (main; табір увечері — night). */
export function musicFor(s: MusicState): MusicChoice {
  if (s.intro) return 'story';
  if (s.screen === 'menu') return 'menu';
  if (s.hurry === true) return 'hurry';
  if (s.map === null) return 'silence';
  const rule = MUSIC_BY_MAP[s.map];
  if (rule !== 'by-daylight') return rule;
  return isEveningMinute(s.minuteOfDay) ? 'night' : 'main';
}

/** Рівень музики відносно каналу music (GAME-252: 0,45 → 0,35 — справжні треки гучніші за старий синтез; 0,35 × master 0,8 × music 0,6 ≈ 0,17, ефекти — 1). */
export const MUSIC_LEVEL = 0.35;
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
