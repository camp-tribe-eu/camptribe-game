// GAME-193 · риболовля. Мутації (кожна має зробити тест червоним): «завжди клює» (wait → bite одразу), «підсікання завжди вдале» (progress росте завжди), «закінчується без вводу» (bite → hook без натискання).
import campMap from '../../public/maps/camp-lake.tmj?raw';
import { describe, expect, it } from 'vitest';
import { BITE_MS, FISH_IDLE, FISH_HI, FISH_LO, REEL_MAX_MS, SPECIES, WAIT_MAX_MS, WAIT_MIN_MS, ZONE, castDistance, catches, fishAt, inZone, makeRng, stepFish, type FishEvent, type FishState } from './fishing';

const rng = makeRng(193);
const tick = (s: FishState, dtMs: number, down: boolean, r = rng): { state: FishState; event: FishEvent } => stepFish(s, { kind: 'tick', dtMs, down }, r);
/** Крок у кроки по 16 мс, поки не буде події чи не вичерпано `ms`. */
function run(s0: FishState, ms: number, down: boolean, r = rng): { state: FishState; events: FishEvent[] } {
  let s = s0; const events: FishEvent[] = [];
  for (let t = 0; t < ms; t += 16) { const x = tick(s, 16, down, r); s = x.state; if (x.event !== 'none') events.push(x.event); }
  return { state: s, events };
}
const pressed = (s: FishState): FishState => tick(tick(s, 16, false).state, 16, true).state;
const waiting = (r = rng, power = 0.5): FishState => { let s = pressed(FISH_IDLE); s = { ...s, power }; return tick(s, 16, false, r).state; };
const biting = (): FishState => { const w = waiting(); return tick({ ...w, t: w.waitMs }, 16, false).state; };
const reeling = (): FishState => tick(tick(biting(), 16, false).state, 16, true).state.phase === 'reel' ? tick(biting(), 16, true).state : biting();

describe('закид', () => {
  it('утримання заряджає шкалу, відпускання — закид; сила впливає на дальність', () => {
    let s = pressed(FISH_IDLE);
    expect(s.phase).toBe('charge');
    s = run(s, 700, true).state; const half = s.power;
    expect(half).toBeGreaterThan(0.3); expect(half).toBeLessThan(0.7);
    s = run(s, 3000, true).state; expect(s.power).toBe(1);
    const r = tick(s, 16, false);
    expect(r.event).toBe('cast'); expect(r.state.phase).toBe('wait');
    expect(castDistance(1)).toBeGreaterThan(castDistance(half)); expect(castDistance(half)).toBeGreaterThan(castDistance(0));
  });
  it('очікування — детерміноване й у межах 1,5–4 с; те саме зерно дає той самий час', () => {
    const a = waiting(makeRng(5)).waitMs; const b = waiting(makeRng(5)).waitMs;
    expect(a).toBe(b);
    for (let k = 0; k < 50; k++) { const w = waiting(makeRng(k)).waitMs; expect(w).toBeGreaterThanOrEqual(WAIT_MIN_MS); expect(w).toBeLessThan(WAIT_MAX_MS); }
  });
});

describe('клювання', () => {
  it('до часу очікування не клює; після — клює (не «завжди»)', () => {
    const w = waiting();
    expect(run({ ...w, t: 0 }, w.waitMs - 100, false).state.phase).toBe('wait');
    expect(run({ ...w, t: 0 }, w.waitMs + 100, false).state.phase).toBe('bite');
    expect(tick(w, 16, true).state.phase).toBe('wait');   // тап зарано нічого не підсікає
  });
  it('тап у вікні 600 мс підсікає; проґавив — «зірвалась», назад у спокій без штрафу', () => {
    const b = biting();
    expect(tick(pressed(b), 16, true).state.phase).toBe('reel');
    const late = run(b, BITE_MS + 100, false);
    expect(late.events).toContain('slipped'); expect(late.state.phase).toBe('idle'); expect(late.state.slipped).toBe(1);
    expect(catches(late.state)).toBe(0);
  });
});

describe('підсікання (шкала)', () => {
  it('без вводу рибка ніколи не в зоні: зона лежить унизу, рибка вище, прогрес гасне, рибка втікає — улову нема', () => {
    for (let seed = 0; seed < 40; seed++) {
      let s = reeling();
      expect(s.phase).toBe('reel');
      s = { ...s, ph1: seed * 0.7, ph2: seed * 1.3, species: seed % SPECIES.length };
      for (let t = 0; t < REEL_MAX_MS + 500 && s.phase === 'reel'; t += 16) {
        s = tick(s, 16, false).state;
        if (s.phase === 'reel') expect(inZone(s)).toBe(false);
      }
      expect(s.phase).toBe('idle'); expect(s.aways).toBe(1); expect(catches(s)).toBe(0);
    }
  });
  it('рибка блукає лише в межах шкали над мінімумом, а зона — в межах 0..1', () => {
    for (const sp of SPECIES.keys()) for (let seed = 0; seed < 20; seed++) for (let t = 0; t < REEL_MAX_MS; t += 50) {
      const f = fishAt({ ...FISH_IDLE, species: sp, ph1: seed, ph2: seed * 2, reelT: t });
      expect(f).toBeGreaterThanOrEqual(FISH_LO - 1e-9); expect(f).toBeLessThanOrEqual(FISH_HI + 1e-9);
    }
    expect(FISH_LO).toBeGreaterThan(ZONE);
  });
  it('гравець, що веде зону за рибкою, ловить за ~3–6 с; тримання/відпускання рухає зону', () => {
    let s = reeling(); let ms = 0; let ev: FishEvent = 'none';
    while (s.phase === 'reel' && ms < REEL_MAX_MS) { const x = tick(s, 16, fishAt(s) > s.zone); s = x.state; ev = x.event; ms += 16; }
    expect(ev).toBe('caught'); expect(s.phase).toBe('choice');
    expect(ms).toBeGreaterThan(1500); expect(ms).toBeLessThan(6500);
    const a = reeling(); expect(tick(a, 100, true).state.zone).toBeGreaterThan(a.zone);
    const b = { ...a, zone: 0.6 }; expect(tick(b, 100, false).state.zone).toBeLessThan(0.6);
  });
});

describe('улов і вибір', () => {
  const choice = (): FishState => ({ ...reeling(), phase: 'choice', progress: 1 });
  it('вибір: відпустити й узяти обидва повертають у спокій і рахуються; без вибору фаза не змінюється', () => {
    expect(run(choice(), 20_000, false).state.phase).toBe('choice');
    const k = stepFish(choice(), { kind: 'choose', keep: true }, rng); expect(k.event).toBe('kept'); expect(k.state.phase).toBe('idle'); expect(k.state.kept).toBe(1);
    const r = stepFish(k.state, { kind: 'choose', keep: false }, rng); expect(r.event).toBe('none');
    const r2 = stepFish({ ...choice(), kept: 1 }, { kind: 'choose', keep: false }, rng); expect(r2.state.released).toBe(1); expect(catches(r2.state)).toBe(2);
  });
});

describe('вибір тією самою дією', () => {
  it('дію, що зробила вибір, ще тримають → нового закиду нема, доки не відпустять і не натиснуть знову', () => {
    let s = stepFish({ ...FISH_IDLE, phase: 'choice', down: true }, { kind: 'choose', keep: true }, rng).state;
    s = run(s, 500, true).state; expect(s.phase).toBe('idle');
    s = tick(s, 16, false).state; s = tick(s, 16, true).state; expect(s.phase).toBe('charge');
  });
});

describe('без вводу нічого не відбувається (закон 1: сторож, що вміє червоніти)', () => {
  it('скільки б не йшов час без натискання — idle лишається idle, улову нема', () => {
    const r = run(FISH_IDLE, 60_000, false);
    expect(r.state.phase).toBe('idle'); expect(r.events).toEqual([]);
  });
  it('закид без підсікання: «клює» минає, жодного улову, жодного кроку далі за bite', () => {
    const r = run(waiting(), 30_000, false);
    expect(r.events).toEqual(['bite', 'slipped']); expect(r.state.phase).toBe('idle'); expect(catches(r.state)).toBe(0);
  });
  it('choice досяжний лише через підсікання: жоден тік без натискання не дає hook', () => {
    for (let seed = 0; seed < 30; seed++) { const r = run(waiting(makeRng(seed)), 20_000, false, makeRng(seed)); expect(r.events).not.toContain('hook'); expect(r.events).not.toContain('caught'); }
  });
});

describe('місце на справжній мапі табору', () => {
  const m = JSON.parse(campMap) as { width: number; layers: { name: string; data?: number[]; objects?: { name: string; type: string; x: number; y: number }[] }[] };
  const walls = m.layers.find((l) => l.name === 'walls')?.data ?? [];
  const spot = (m.layers.find((l) => l.name === 'objects')?.objects ?? []).find((o) => o.name === 'fish.shore');
  const solid = (x: number, y: number): boolean => (walls[Math.floor(y / 32) * m.width + Math.floor(x / 32)] ?? 1) > 0;
  it('fish.shore — точка на вільній землі, а поплавок на будь-якій силі лягає у воду (непрохідну плитку)', () => {
    expect(spot, 'fish.shore є на мапі').toBeDefined();
    const s = spot as { x: number; y: number; type: string };
    expect(s.type).toBe('anchor');
    expect(solid(s.x, s.y)).toBe(false);
    for (const p of [0, 0.25, 0.5, 0.75, 1]) expect(solid(s.x + 24 + castDistance(p), s.y), `сила ${p}`).toBe(true);
  });
});
