// GAME-231 · нічні звуки: вдень цвіркунів нема, вночі є; сова — від ігрової хвилини (детерміновано); mute → без AudioContext; дощ глушить.
// Мутації (вручну, виводи в PR): nightTarget завжди 1 → «вдень тиша» червоніє; прибрати `v > 0` → «mute» червоніє; сова без модуля доби → «детермінована» червоніє.
import { afterEach, describe, expect, it } from 'vitest';
import { createBlipper, resetSharedContext } from './blip';
import { CRICKET_EVERY_MS, NIGHT_FADE_MS, OWL_OFFSETS, OWL_WINDOW, createNightSounds, nightTarget, owlDue, type NightState } from './night-sounds';

function fake(vol: number, gesture = true) {
  let made = 0; let osc = 0;
  const ctx = {
    currentTime: 1, destination: {},
    createOscillator: () => { osc++; return { type: '', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} }; },
    createGain: () => ({ gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }),
  };
  const s = createNightSounds({ volume: () => vol }, () => { made++; return ctx; });
  if (gesture) s.unlock();
  return { s, made: () => made, osc: () => osc };
}
const SCENE = Object.values(import.meta.glob<string>('../view/world/scene.ts', { query: '?raw', import: 'default', eager: true }))[0] ?? '';
const at = (minuteOfDay: number, extra: Partial<NightState> = {}): NightState => ({ map: 'camp', intro: false, raining: false, minuteOfDay, ...extra });
const NIGHT = 23 * 60; const DAY = 12 * 60;
function run(s: ReturnType<typeof fake>['s'], st: NightState, ms: number): void { for (let t = 0; t < ms; t += 16) s.tick(16, st); }

describe('цільовий рівень ночі', () => {
  it('вдень 0; з 19:00 до 06:30 — 1; дощ, не табір і вступ — 0', () => {
    expect(nightTarget(at(DAY))).toBe(0);
    expect(nightTarget(at(18 * 60 + 59))).toBe(0);
    expect(nightTarget(at(19 * 60))).toBe(1);
    expect(nightTarget(at(3 * 60))).toBe(1);
    expect(nightTarget(at(6 * 60 + 30))).toBe(0);
    expect(nightTarget(at(NIGHT, { raining: true }))).toBe(0);
    expect(nightTarget(at(NIGHT, { map: 'home' }))).toBe(0);
    expect(nightTarget(at(NIGHT, { map: 'road' }))).toBe(0);
    expect(nightTarget(at(NIGHT, { intro: true }))).toBe(0);
  });
});

describe('сова', () => {
  it('детермінована: рівно один крик у кожному вікні, у момент із таблиці', () => {
    const hits: number[] = [];
    const from = 25 * OWL_WINDOW;
    for (let m = from + 1; m <= from + 6 * OWL_WINDOW; m += 1) if (owlDue(m - 1, m)) hits.push(m);
    expect(hits).toHaveLength(6);
    hits.forEach((m, i) => { const k = 25 + i; expect(m, `вікно ${k}`).toBe(k * OWL_WINDOW + (OWL_OFFSETS[k % OWL_OFFSETS.length] as number)); });
    expect(owlDue(100.2, 100.2)).toBe(false);
  });
  it('через північ не губиться; стрибок часу (завантаження) не наздоганяє крики', () => {
    let n = 0;
    for (let m = 1430; m < 1440 + 60; m += 0.5) if (owlDue(m - 0.5, m)) n++;
    expect(n).toBeGreaterThanOrEqual(1);
    expect(owlDue(0, 700)).toBe(false);
  });
});

describe('нічні звуки: цвіркуни й сова', () => {
  it('вдень тиша: жодного звуку й жодного AudioContext', () => {
    const { s, made } = fake(1);
    run(s, at(DAY), 8000);
    expect(s.played).toEqual([]);
    expect(made()).toBe(0);
  });
  it('уночі цвіркуни стрекочуть двома голосами, рівень плавно росте за NIGHT_FADE_MS', () => {
    const { s, made } = fake(1);
    run(s, at(NIGHT), 400);
    expect(s.level).toBeGreaterThan(0);
    expect(s.level).toBeLessThan(0.3);
    run(s, at(NIGHT), NIGHT_FADE_MS);
    expect(s.level).toBe(1);
    const before = s.counts.cricket;
    run(s, at(NIGHT), 10_000);
    expect(s.counts.cricket - before).toBeGreaterThanOrEqual(Math.floor(10_000 / CRICKET_EVERY_MS[0]) + Math.floor(10_000 / CRICKET_EVERY_MS[1]) - 1);
    expect(made()).toBe(1);
  });
  it('сова кричить уночі за ігровим часом; вранці вдень — ні', () => {
    const { s } = fake(1);
    run(s, at(NIGHT), NIGHT_FADE_MS + 100);
    for (let i = 0; i < 400; i++) s.tick(16, at(NIGHT + i / 8));   // 50 ігрових хвилин ≥ одного вікна
    expect(s.counts.owl).toBeGreaterThanOrEqual(1);
    const { s: d } = fake(1);
    run(d, at(DAY), NIGHT_FADE_MS + 100);
    for (let i = 0; i < 400; i++) d.tick(16, at(DAY + i / 8));
    expect(d.counts.owl).toBe(0);
  });
  it('mute або без жесту: звуку нема й AudioContext не створюється', () => {
    const m = fake(0);
    run(m.s, at(NIGHT), 6000);
    expect(m.s.played).toEqual([]);
    expect(m.made()).toBe(0);
    const g = fake(1, false);
    run(g.s, at(NIGHT), 6000);
    expect(g.s.played).toEqual([]);
    expect(g.made()).toBe(0);
  });
  it('дощ глушить: рівень падає до 0, нові звуки не з\'являються', () => {
    const { s } = fake(1);
    run(s, at(NIGHT), 4000);
    run(s, at(NIGHT, { raining: true }), NIGHT_FADE_MS + 200);
    expect(s.level).toBe(0);
    const n = s.played.length; const c = s.counts.cricket;
    run(s, at(NIGHT, { raining: true }), 6000);
    expect(s.counts.cricket).toBe(c);
    expect(s.played.length).toBe(n);
  });
  it('без WebAudio — тиша, а не збій', () => {
    const s = createNightSounds({ volume: () => 1 }, () => null);
    s.unlock();
    expect(() => run(s, at(NIGHT), 4000)).not.toThrow();
    expect(s.played).toEqual([]);
  });
});

describe('межа звуку: сцена кличе лише модуль src/audio', () => {
  it('scene.ts викликає nightSounds.tick з ../../audio і не торкається WebAudio сама', () => {
    const src = SCENE;
    expect(src.length).toBeGreaterThan(1000);
    expect(src).toMatch(/import \{[^}]*nightSounds[^}]*\} from '\.\.\/\.\.\/audio\/night-sounds'/);
    expect(src).toMatch(/nightSounds\.tick\(/);
    expect(src).not.toMatch(/AudioContext/);
  });
});

describe('GAME-235: спільний AudioContext', () => {
  const g = globalThis as { AudioContext?: unknown };
  const old = g.AudioContext;
  afterEach(() => { g.AudioContext = old; resetSharedContext(); });
  function stub(): { made: () => number } {
    let made = 0;
    g.AudioContext = class {
      currentTime = 1; destination = {};
      constructor() { made++; }
      createOscillator() { return { type: '', frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} }; }
      createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
    };
    resetSharedContext();
    return { made: () => made };
  }
  it('нічні звуки й blip ділять один AudioContext', () => {
    const c = stub();
    const mx = { volume: () => 1 };
    const n = createNightSounds(mx); n.unlock();
    const b = createBlipper(mx);
    expect(b.blip(220)).toBe(true);
    run(n, at(NIGHT), 6000);
    expect(n.counts.cricket, 'нічні звуки справді грали').toBeGreaterThan(0);
    expect(c.made(), 'контекст один').toBe(1);
  });
  it('mute або без жесту — жодного AudioContext', () => {
    const c = stub();
    const muted = createNightSounds({ volume: () => 0 }); muted.unlock();
    run(muted, at(NIGHT), 6000);
    const noGesture = createNightSounds({ volume: () => 1 });
    run(noGesture, at(NIGHT), 6000);
    expect(c.made()).toBe(0);
  });
});
