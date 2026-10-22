// GAME-13 · годинник, RNG, негативний контроль детермінізму.
import { describe, expect, it } from 'vitest';
import { STEP_MS, newClock, pause, resume, tick } from './clock';
import { DEFS, LOG, SEED } from './determinism.fixture';
import { stateHash } from './hash';
import { nextUint32, seedRng, type RngState } from './rng';
import { findsSystem, newSim, run, type System } from './sim';

describe('журнал справді щось робить (інакше «однаковий хеш» нічого не доводить)', () => {
  it('RNG споживався, час ішов, гроші й інвентар змінились', () => {
    const s = run(newSim(SEED, 10_000), LOG, { defs: DEFS });
    expect(s.finds).toBeGreaterThan(10);
    expect(s.clock.minutes).toBeGreaterThan(2 * 24 * 60);
    expect(s.game.moneyCents).not.toBe(10_000);
    expect(s.game.inventory['item.tent']).toBeGreaterThan(0);
  });

  it('інше зерно → інший відбиток', () => {
    expect(stateHash(run(newSim(SEED + 1, 10_000), LOG, { defs: DEFS }))).not.toBe(stateHash(run(newSim(SEED, 10_000), LOG, { defs: DEFS })));
  });
});

describe('RNG зі станом у сейві', () => {
  it('серіалізація посеред гри → відновлення → наступні 1000 значень збігаються', () => {
    const mid = run(newSim(SEED, 10_000), LOG.slice(0, 1500), { defs: DEFS });
    const restored = JSON.parse(JSON.stringify(mid)) as typeof mid;
    let a: RngState = mid.rng;
    let b: RngState = restored.rng;
    const va: number[] = [];
    const vb: number[] = [];
    for (let i = 0; i < 1000; i++) {
      const ra = nextUint32(a); a = ra.state; va.push(ra.value);
      const rb = nextUint32(b); b = rb.state; vb.push(rb.value);
    }
    expect(vb).toEqual(va);
    expect(new Set(va).size).toBeGreaterThan(990);
  });

  it('продовження після відновлення дає той самий кінцевий стан, що й без перерви', () => {
    const whole = run(newSim(SEED, 10_000), LOG, { defs: DEFS });
    const mid = JSON.parse(JSON.stringify(run(newSim(SEED, 10_000), LOG.slice(0, 1500), { defs: DEFS }))) as ReturnType<typeof newSim>;
    expect(stateHash(run(mid, LOG.slice(1500), { defs: DEFS }))).toBe(stateHash(whole));
  });

  it('однакове зерно — однаковий стан генератора; різне — різний', () => {
    expect(seedRng(7)).toEqual(seedRng(7));
    expect(seedRng(7)).not.toEqual(seedRng(8));
  });
});

describe('годинник', () => {
  it('пауза меню не просуває ігровий час', () => {
    const c = tick(pause(newClock()), 60_000);
    expect(c.steps).toBe(0);
    expect(c.clock.minutes).toBe(0);
    expect(tick(resume(c.clock), 60_000).clock.minutes).toBe(60);
  });

  it('фіксований крок: залишок кадру переноситься, сума кадрів = сума кроків', () => {
    let c = newClock();
    let steps = 0;
    for (let i = 0; i < 100; i++) { const t = tick(c, 333); c = t.clock; steps += t.steps; }
    expect(steps).toBe(Math.floor((100 * 333) / STEP_MS));
    expect(c.accMs).toBe((100 * 333) % STEP_MS);
  });

  it('нуль, від’ємний і NaN кадр не рухають час', () => {
    for (const ms of [0, -5, Number.NaN]) expect(tick(newClock(), ms).steps).toBe(0);
  });
});

describe('негативний контроль: Math.random у системі ядра ламає детермінізм', () => {
  it('два прогони з тим самим зерном розходяться', () => {
    const leaky: System = (s, steps) => ({ ...findsSystem(s, steps), finds: s.finds + (steps > 0 && Math.random() < 0.5 ? 1 : 0) });
    const a = stateHash(run(newSim(SEED, 10_000), LOG, { defs: DEFS, systems: [leaky] }));
    const b = stateHash(run(newSim(SEED, 10_000), LOG, { defs: DEFS, systems: [leaky] }));
    expect(a).not.toBe(b);
  });
});
