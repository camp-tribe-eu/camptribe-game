// GAME-194 · вибір фону за станом (чиста функція), перехід, жест-розблокування, відповідність таблиць файлам і scene.preload.
import { describe, expect, it } from 'vitest';
import { AMBIENT_FILES, FADE_MS, ambientMix, createAmbient, type AmbientState } from './ambient';
import { armFirstGesture } from './index';
import { DEFAULT_AUDIO, createMixer, type LoopHandle, type SoundOut } from './mixer';
import { SFX_FILES, createSfx } from './sfx';
import scene from '../view/world/scene.ts?raw';


const base: AmbientState = { map: 'camp', intro: false, nearLake: false, fireLit: false, nearFire: false, transport: null };
const mix = (o: Partial<AmbientState>) => ambientMix({ ...base, ...o });

describe('ambientMix — фон за станом', () => {
  it('табір: пташки й вітер; озеро додає хвилі; вогонь — лише розпалений І поруч', () => {
    expect(mix({})).toEqual({ camp: 1 });
    expect(mix({ nearLake: true })).toEqual({ camp: 1, lake: 0.8 });
    expect(mix({ fireLit: true, nearFire: false })).toEqual({ camp: 1 });
    expect(mix({ fireLit: false, nearFire: true })).toEqual({ camp: 1 });
    expect(mix({ fireLit: true, nearFire: true })).toEqual({ camp: 1, fire: 0.9 });
  });
  it('двір і вступ — дощ; вступ перекриває мапу', () => {
    expect(mix({ map: 'home' })).toEqual({ rain: 0.8 });
    expect(mix({ intro: true, map: 'camp', nearLake: true })).toEqual({ rain: 1 });
  });
  it('дорога — за транспортом (без вибору — авто)', () => {
    expect(mix({ map: 'road', transport: 'transport.bike' })).toEqual({ 'road-bike': 1 });
    expect(mix({ map: 'road', transport: 'transport.car' })).toEqual({ 'road-car': 1 });
    expect(mix({ map: 'road', transport: null })).toEqual({ 'road-car': 1 });
  });
  it('крамниця — тихий власний фон; світ без мапи — тиша', () => {
    expect(mix({ map: 'shop' })).toEqual({ shop: 0.7 });
    expect(mix({ map: null })).toEqual({});
  });
});

function harness(settings = DEFAULT_AUDIO) {
  const started: { key: string; vol: number; stopped: boolean }[] = [];
  const out: SoundOut = {
    play: () => undefined,
    startLoop(key, volume): LoopHandle { const r = { key, vol: volume, stopped: false }; started.push(r); return { setVolume: (v) => { r.vol = v; }, stop: () => { r.stopped = true; } }; },
  };
  const mx = createMixer(settings, out);
  return { started, a: createAmbient(mx), mx };
}

describe('createAmbient — перехід і розблокування', () => {
  it('до першого жесту нічого не стартує; після — стартує', () => {
    const { started, a } = harness();
    a.setAmbient({ camp: 1 }); a.tick(100);
    expect(started).toEqual([]);
    a.unlock(); a.tick(100);
    expect(started.map((s) => s.key)).toEqual(['amb-camp']);
  });
  it('плавний перехід: старий гасне, новий наростає, зупинений шар звільнено', () => {
    const { started, a } = harness();
    a.unlock(); a.setAmbient({ camp: 1 }); a.tick(FADE_MS);
    a.setAmbient({ rain: 1 }); a.tick(FADE_MS / 2);
    expect(a.levels().camp).toBeCloseTo(0.5); expect(a.levels().rain).toBeCloseTo(0.5);
    a.tick(FADE_MS);
    expect(a.levels()).toEqual({ rain: 1 });
    expect(started.find((s) => s.key === 'amb-camp')?.stopped).toBe(true);
    expect(started.find((s) => s.key === 'amb-rain')?.stopped).toBe(false);
  });
  it('гучність = рівень × master × music; mute → тиша, петля не стартує', () => {
    const on = harness(); on.a.unlock(); on.a.setAmbient({ camp: 1 }); on.a.tick(FADE_MS);
    expect(on.started[0]?.vol).toBeCloseTo(DEFAULT_AUDIO.master * DEFAULT_AUDIO.music);
    const mute = harness({ ...DEFAULT_AUDIO, muted: true }); mute.a.unlock(); mute.a.setAmbient({ camp: 1 }); mute.a.tick(FADE_MS);
    expect(mute.started).toEqual([]);
  });
  it('mute посеред гри: наступний tick (навіть з паузи — main.ts STEP) глушить петлю, що вже грає (рецензія #124)', () => {
    const h = harness(); h.a.unlock(); h.a.setAmbient({ camp: 1 }); h.a.tick(FADE_MS);
    expect(h.started[0]?.vol).toBeGreaterThan(0);
    h.mx.apply({ ...DEFAULT_AUDIO, muted: true }); h.a.tick(16);
    expect(h.started[0]?.vol).toBe(0);
  });
  it('setAmbient(null) гасить усе', () => {
    const { started, a } = harness(); a.unlock(); a.setAmbient({ camp: 1 }); a.tick(FADE_MS); a.setAmbient(null); a.tick(FADE_MS);
    expect(a.levels()).toEqual({}); expect(started[0]?.stopped).toBe(true);
  });
  it('перший жест знімає слухачі й розблоковує', () => {
    const l = new Map<string, () => void>(); let unlocked = 0;
    armFirstGesture({ addEventListener: (e: string, f: () => void) => { l.set(e, f); }, removeEventListener: (e: string) => { l.delete(e); } } as never, { unlock: () => { unlocked++; } });
    expect(unlocked).toBe(0); l.get('keydown')?.();
    expect(unlocked).toBe(1); expect(l.size).toBe(0);
  });
});

const FILES = Object.keys(import.meta.glob('../../public/audio/*.ogg'));
const fileExists = (url: string): boolean => FILES.includes(`../../public/${url}`);

describe('файли й завантаження', () => {
  it('кожен ключ таблиць має файл у public/audio і літерал load.audio у scene.preload', () => {
    for (const f of [...Object.values(AMBIENT_FILES), ...Object.values(SFX_FILES)]) {
      expect(fileExists(f.url), f.url).toBe(true);
      expect(scene.includes(`this.load.audio('${f.key}', '${f.url}')`), f.key).toBe(true);
    }
  });
  it('sfx: грає через мікшер каналу sfx; mute → не грає', () => {
    const calls: string[] = [];
    const out: SoundOut = { play: (k) => { calls.push(k); } };
    expect(createSfx(createMixer(DEFAULT_AUDIO, out)).play('peg')).toBe(true);
    expect(createSfx(createMixer({ ...DEFAULT_AUDIO, muted: true }, out)).play('peg')).toBe(false);
    expect(calls).toEqual(['sfx-peg']);
  });
});
