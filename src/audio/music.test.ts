// GAME-207 · сторож музики. Закон 1 — у кожної перевірки є мутація, під якою вона червоніє (перелік у описі коміту):
//  1) КОЖНА мапа сцени (літерали load.tilemapTiledJSON) має рядок у MUSIC_BY_MAP — тема або явна тиша;
//  2) тема табору змінюється ввечері (картка: «музика не змінюється ввечері» → RED);
//  3) кожен файл таблиці є в public/audio і має літерал load.audio у сцені (а сам preload його НЕ вантажить — лазі після кадру);
//  4) програвач: без жесту / до довантаження / у mute не стартує; перехресний перехід; вимкнено (e2e) — тиша й нічого не вантажиться.
import { describe, expect, it } from 'vitest';
import { MUSIC_BY_MAP, MUSIC_FADE_MS, MUSIC_FILES, MUSIC_LEVEL, createMusic, isEveningMinute, musicFor, type MapKey, type MusicTrack } from './music';
import { DEFAULT_AUDIO, createMixer, type LoopHandle, type SoundOut } from './mixer';
import { armFirstGesture } from './index';
import scene from '../view/world/scene.ts?raw';

const FILES = Object.keys(import.meta.glob('../../public/audio/*.ogg'));
const fileExists = (url: string): boolean => FILES.includes(`../../public/${url}`);
/** Мапи, які сцена справді вантажить (джерело правди — літерали; мапа без теми не може сховатись). */
export function sceneMapKeys(src: string): string[] {
  return [...src.matchAll(/this\.load\.tilemapTiledJSON\('([a-z-]+)'/g)].map((m) => m[1] as string);
}
/** Чи кожній мапі призначено тему або явну тиша. Повертає мапи без рядка. */
export function mapsWithoutMusic(maps: readonly string[], table: Readonly<Record<string, string>>): string[] {
  return maps.filter((m) => !(m in table) || !['silence', 'by-daylight', ...Object.keys(MUSIC_FILES)].includes(table[m] as string));
}

describe('musicFor — тема за станом', () => {
  it('кожна мапа сцени має тему або явну тишу (і самотест: мапа без рядка — червона)', () => {
    const maps = sceneMapKeys(scene);
    expect(maps.length).toBeGreaterThanOrEqual(4);
    expect(mapsWithoutMusic(maps, MUSIC_BY_MAP)).toEqual([]);
    expect(mapsWithoutMusic([...maps, 'forest'], MUSIC_BY_MAP)).toEqual(['forest']);
    expect(mapsWithoutMusic(['camp'], { camp: 'disco' })).toEqual(['camp']);
    for (const m of maps) expect(musicFor({ map: m as MapKey, intro: false, minuteOfDay: 12 * 60 })).not.toBeUndefined();
  });
  it('табір: удень одна тема, увечері інша (картка GAME-207: «музика не змінюється ввечері» → RED)', () => {
    const day = musicFor({ map: 'camp', intro: false, minuteOfDay: 12 * 60 });
    const evening = musicFor({ map: 'camp', intro: false, minuteOfDay: 20 * 60 });
    const night = musicFor({ map: 'camp', intro: false, minuteOfDay: 2 * 60 });
    expect(day).toBe('camp-day');
    expect(evening).toBe('camp-evening');
    expect(night).toBe('camp-evening');
    expect(day).not.toBe(evening);
    expect(isEveningMinute(18 * 60 + 59)).toBe(false); expect(isEveningMinute(19 * 60)).toBe(true);
    expect(isEveningMinute(6 * 60 + 29)).toBe(true); expect(isEveningMinute(6 * 60 + 30)).toBe(false);
    expect(isEveningMinute(-60)).toBe(true);   // від'ємна хвилина — по модулю доби, без NaN
  });
  it('вступ перекриває мапу й годину; дім, дорога, крамниця (GAME-204) — свої теми; без мапи — тиша', () => {
    expect(musicFor({ map: 'camp', intro: true, minuteOfDay: 12 * 60 })).toBe('intro');
    expect(musicFor({ map: null, intro: true, minuteOfDay: 0 })).toBe('intro');
    expect(musicFor({ map: 'home', intro: false, minuteOfDay: 20 * 60 })).toBe('home');
    expect(musicFor({ map: 'road', intro: false, minuteOfDay: 20 * 60 })).toBe('road');
    expect(musicFor({ map: 'shop', intro: false, minuteOfDay: 20 * 60 })).toBe('shop');
    expect(musicFor({ map: null, intro: false, minuteOfDay: 0 })).toBe('silence');
  });
});

function harness(settings = DEFAULT_AUDIO) {
  const started: { key: string; vol: number; stopped: boolean }[] = [];
  const out: SoundOut = {
    play: () => undefined,
    startLoop(key, volume): LoopHandle { const r = { key, vol: volume, stopped: false }; started.push(r); return { setVolume: (v) => { r.vol = v; }, stop: () => { r.stopped = true; } }; },
  };
  const mx = createMixer(settings, out);
  return { started, m: createMusic(mx), mx };
}

describe('createMusic — одна тема, перехід, запобіжники', () => {
  it('без жесту й до довантаження не стартує; після обох — стартує з рівнем MUSIC_LEVEL × master × music', () => {
    const { started, m } = harness();
    m.setTrack('home'); m.tick(MUSIC_FADE_MS);
    expect(started).toEqual([]);
    m.unlock(); m.tick(16);
    expect(started).toEqual([]);   // файлів ще нема в кеші
    m.setReady(true); m.tick(16);
    expect(started.map((s) => s.key)).toEqual(['mus-home']);
    expect(started[0]?.vol).toBeCloseTo(MUSIC_LEVEL * DEFAULT_AUDIO.master * DEFAULT_AUDIO.music);
    expect(MUSIC_LEVEL).toBeLessThan(0.6);   // тихо, під ефектами
  });
  it('зміна мапи — перехресний перехід: стара гасне, нова наростає, стару звільнено', () => {
    const { started, m } = harness(); m.unlock(); m.setReady(true);
    m.setTrack('home'); m.tick(MUSIC_FADE_MS);
    m.setTrack('road'); m.tick((MUSIC_FADE_MS * MUSIC_LEVEL) / 2);   // крок переходу — в одиницях рівня 0..1 за MUSIC_FADE_MS
    expect(m.levels().home).toBeCloseTo(MUSIC_LEVEL / 2); expect(m.levels().road).toBeCloseTo(MUSIC_LEVEL / 2);
    m.tick(MUSIC_FADE_MS);
    expect(m.levels()).toEqual({ road: MUSIC_LEVEL });
    expect(started.find((s) => s.key === 'mus-home')?.stopped).toBe(true);
    expect(started.find((s) => s.key === 'mus-road')?.stopped).toBe(false);
  });
  it('mute → не стартує; mute посеред гри глушить петлю наступним tick; silence гасить', () => {
    const mute = harness({ ...DEFAULT_AUDIO, muted: true }); mute.m.unlock(); mute.m.setReady(true); mute.m.setTrack('shop'); mute.m.tick(MUSIC_FADE_MS);
    expect(mute.started).toEqual([]);
    const h = harness(); h.m.unlock(); h.m.setReady(true); h.m.setTrack('shop'); h.m.tick(MUSIC_FADE_MS);
    expect(h.started[0]?.vol).toBeGreaterThan(0);
    h.mx.apply({ ...DEFAULT_AUDIO, muted: true }); h.m.tick(16);
    expect(h.started[0]?.vol).toBe(0);
    h.mx.apply(DEFAULT_AUDIO); h.m.setTrack('silence'); h.m.tick(MUSIC_FADE_MS);
    expect(h.m.levels()).toEqual({}); expect(h.started[0]?.stopped).toBe(true);
  });
  it('вимкнено (збірка e2e без ?music=1): setTrack — тиша, нічого не стартує; увімкнення повертає', () => {
    const { started, m } = harness(); m.unlock(); m.setReady(true);
    m.setEnabled(false); m.setTrack('camp-day'); m.tick(MUSIC_FADE_MS);
    expect(started).toEqual([]); expect(m.levels()).toEqual({}); expect(m.enabled).toBe(false);
    m.setEnabled(true); m.setTrack('camp-day'); m.tick(MUSIC_FADE_MS);
    expect(started.map((s) => s.key)).toEqual(['mus-camp-day']);
    m.setEnabled(false); m.tick(MUSIC_FADE_MS);   // вимкнули посеред теми — вона гасне, не чекаючи наступного setTrack
    expect(m.levels()).toEqual({}); expect(started[0]?.stopped).toBe(true);
  });
  it('перший жест розблоковує і музику, і фон', () => {
    const l = new Map<string, () => void>(); let a = 0; let m = 0;
    armFirstGesture({ addEventListener: (e: string, f: () => void) => { l.set(e, f); }, removeEventListener: (e: string) => { l.delete(e); } } as never, { unlock: () => { a++; } }, { unlock: () => { m++; } });
    l.get('pointerdown')?.();
    expect([a, m]).toEqual([1, 1]);
  });
});

describe('файли й завантаження', () => {
  it('кожна тема має файл у public/audio, літерал load.audio у сцені — і сцена вантажить музику лише за music.enabled (після preload)', () => {
    for (const t of Object.keys(MUSIC_FILES) as MusicTrack[]) {
      const f = MUSIC_FILES[t];
      expect(fileExists(f.url), f.url).toBe(true);
      expect(scene.includes(`this.load.audio('${f.key}', '${f.url}')`), f.key).toBe(true);
    }
    const preload = scene.slice(scene.indexOf('preload(): void {'), scene.indexOf('create(): void {'));
    expect(preload.includes('mus-')).toBe(false);   // не в preload: перший кадр не чекає музики
    const create = scene.slice(scene.indexOf('create(): void {'));
    expect(create.includes('if (music.enabled) {')).toBe(true);
    expect(create.includes("this.load.once('complete', () => music.setReady(true))")).toBe(true);
    expect(/public\/audio\/mus-[a-z-]+\.ogg/.test(FILES.join(' '))).toBe(true);
    expect(FILES.filter((p) => p.includes('/mus-')).length).toBe(Object.keys(MUSIC_FILES).length);   // зайвий файл без теми — теж червоне
  });
});
