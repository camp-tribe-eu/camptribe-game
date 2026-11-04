// GAME-225 · звуки табору: мікшер глушить (mute або 0 → контекст не створюється), кожен матеріал має свій тон.
// Мутація (вручну): прибрати `v > 0` — червоніють «mute мовчить»; звести два звуки до одного тону — червоніє «матеріали різні».
import { describe, expect, it } from 'vitest';
import { CAMP_SPECS, createCampSounds, type CampSoundName } from './camp-sounds';

function fake(vol: number) {
  const log: { type: string; from: number; to: number; peak: number }[] = []; let made = 0;
  const ctx = {
    currentTime: 1, destination: {},
    createOscillator: () => { const o = { type: '', f: [] as number[], frequency: { setValueAtTime: (v: number) => o.f.push(v), exponentialRampToValueAtTime: (v: number) => o.f.push(v) }, connect() {}, start() {}, stop() {} }; log.push({ get type() { return o.type; }, get from() { return o.f[0] ?? 0; }, get to() { return o.f[1] ?? 0; }, peak: 0 }); return o; },
    createGain: () => ({ gain: { setValueAtTime() {}, linearRampToValueAtTime: (v: number) => { const l = log[log.length - 1]; if (l) l.peak = v; }, exponentialRampToValueAtTime() {} }, connect() {} }),
  };
  return { sounds: createCampSounds({ volume: () => vol }, () => { made++; return ctx; }), log, made: () => made };
}
const NAMES = Object.keys(CAMP_SPECS) as CampSoundName[];

describe('звуки табору', () => {
  it('усі звуки грають із власним тоном і гучністю', () => {
    const { sounds, log } = fake(1);
    for (const n of NAMES) expect(sounds.play(n), n).toBe(true);
    expect(sounds.played).toEqual(NAMES);
    expect(log.map((l) => [l.from, l.to])).toEqual(NAMES.map((n) => [CAMP_SPECS[n].from, CAMP_SPECS[n].to]));
    expect(log[0]?.peak).toBeCloseTo(CAMP_SPECS.plank.peak, 5);
  });
  it('матеріали різні: дошка пірса — не метал і не вода (тон і форма хвилі)', () => {
    const key = (n: CampSoundName): string => `${CAMP_SPECS[n].type}${CAMP_SPECS[n].from}${CAMP_SPECS[n].to}`;
    expect(new Set(NAMES.map(key)).size).toBe(NAMES.length);
    expect(CAMP_SPECS.plank.from).toBeLessThan(CAMP_SPECS.clank.from);
    expect(CAMP_SPECS.plank.from).toBeLessThan(CAMP_SPECS.water.to);
  });
  it('mute (гучність 0) мовчить і контекст не створює', () => {
    const { sounds, made } = fake(0);
    for (const n of NAMES) expect(sounds.play(n), n).toBe(false);
    expect(sounds.played).toEqual([]);
    expect(made()).toBe(0);
  });
  it('без WebAudio — тиша, а не збій', () => {
    expect(createCampSounds({ volume: () => 1 }, () => null).play('plank')).toBe(false);
    expect(createCampSounds({ volume: () => 1 }, () => { throw new Error('x'); }).play('plank')).toBe(false);
  });
});
