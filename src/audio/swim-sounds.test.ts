// GAME-227 · звуки купання: мікшер глушить (mute або 0 → навіть контекст не створюється), кожен звук має свій тон і гучність.
// Мутація (вручну): прибрати перевірку `v > 0` — червоніють «mute мовчить» і «гучність 0».
import { describe, expect, it } from 'vitest';
import { SWIM_SPECS, createSwimSounds } from './swim-sounds';

function fake(vol: number) {
  const log: { type: string; from: number; to: number; peak: number }[] = []; let made = 0;
  const ctx = {
    currentTime: 1, destination: {},
    createOscillator: () => { const o = { type: '', f: [] as number[], frequency: { setValueAtTime: (v: number) => o.f.push(v), exponentialRampToValueAtTime: (v: number) => o.f.push(v) }, connect() {}, start() {}, stop() {} }; log.push({ get type() { return o.type; }, get from() { return o.f[0] ?? 0; }, get to() { return o.f[1] ?? 0; }, peak: 0 }); return o; },
    createGain: () => ({ gain: { setValueAtTime() {}, linearRampToValueAtTime: (v: number) => { const l = log[log.length - 1]; if (l) l.peak = v; }, exponentialRampToValueAtTime() {} }, connect() {} }),
  };
  return { sounds: createSwimSounds({ volume: () => vol }, () => { made++; return ctx; }), log, made: () => made };
}

describe('звуки купання', () => {
  it('чотири звуки грають із власним тоном; гребок найтихіший', () => {
    const { sounds, log } = fake(1);
    for (const n of ['enter', 'swim', 'exit', 'wet'] as const) expect(sounds.play(n), n).toBe(true);
    expect(sounds.played).toEqual(['enter', 'swim', 'exit', 'wet']);
    expect(log.map((l) => [l.from, l.to])).toEqual(Object.values(SWIM_SPECS).map((s) => [s.from, s.to]));
    expect(SWIM_SPECS.swim.peak).toBeLessThan(SWIM_SPECS.enter.peak);
    expect(log[0]?.peak).toBeCloseTo(SWIM_SPECS.enter.peak, 5);
  });
  it('mute (гучність 0) мовчить і контекст не створює', () => {
    const { sounds, made } = fake(0);
    expect(sounds.play('enter')).toBe(false);
    expect(sounds.played).toEqual([]);
    expect(made()).toBe(0);
  });
  it('без WebAudio — тиша, а не збій', () => {
    expect(createSwimSounds({ volume: () => 1 }, () => null).play('enter')).toBe(false);
    expect(createSwimSounds({ volume: () => 1 }, () => { throw new Error('x'); }).play('enter')).toBe(false);
  });
});
