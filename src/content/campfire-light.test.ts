// GAME-190 · вогнище руками. Мутації (кожна має зробити тест червоним): «завжди влучає» (inBand → true), «lit/done без вводу» (tick доводить до done).
import { describe, expect, it } from 'vitest';
import { BAND, CHARGE_MS, FIRE_IDLE, GROW_MS, LOGS, chargeAt, inBand, startFire, stepFire, type FireInput, type FireState } from './campfire-light';

const run = (s: FireState, ...inputs: FireInput[]): { state: FireState; events: string[] } => {
  const events: string[] = [];
  let state = s;
  for (const i of inputs) { const r = stepFire(state, i); state = r.state; events.push(r.event); }
  return { state, events };
};
const act: FireInput = { kind: 'act' };
const hold = (down: boolean): FireInput => ({ kind: 'hold', down });
const tick = (dtMs: number): FireInput => ({ kind: 'tick', dtMs });
const stacked = (): FireState => run(startFire(), act, act, act, hold(false)).state;   // три поліна, дію відпущено
const MID = (BAND.from + BAND.to) / 2 * CHARGE_MS;

describe('поліна', () => {
  it('3 дії — 3 поліна, третя відкриває сірник; зайва дія нічого не міняє', () => {
    const r = run(startFire(), act, act, act, act);
    expect(r.events).toEqual(['log', 'log', 'stacked', 'none']);
    expect(r.state.phase).toBe('match');
    expect(r.state.logs).toBe(LOGS);
  });
});

describe('сірник: тримати й відпустити в зеленому', () => {
  it('утримання, відпускання в зеленому → lit; далі полум\'я росте й лише тоді done', () => {
    let r = run(stacked(), hold(true), tick(MID));
    expect(inBand(chargeAt(r.state.t))).toBe(true);
    r = run(r.state, hold(false));
    expect(r.events).toEqual(['lit']);
    expect(r.state.phase).toBe('lit');
    r = run(r.state, tick(GROW_MS / 2));
    expect(r.state.phase).toBe('lit');
    r = run(r.state, tick(GROW_MS));
    expect(r.events).toEqual(['done']);
    expect(r.state.phase).toBe('done');
  });
  it('відпустив зарано чи запізно — згас, штрафу нема, можна знову', () => {
    for (const hit of [100, CHARGE_MS * 0.9]) {
      let r = run(stacked(), hold(true), tick(hit), hold(false));
      expect(r.events[2]).toBe('fizzle');
      expect(r.state.phase).toBe('match');
      expect(r.state.fizzles).toBe(1);
      r = run(r.state, hold(true), tick(MID), hold(false));
      expect(r.state.phase).toBe('lit');
    }
  });
  it('тримав до краю — сам згас, і доки не відпустиш, нова спроба не починається', () => {
    let r = run(stacked(), hold(true), tick(CHARGE_MS + 10));
    expect(r.events[1]).toBe('fizzle');
    expect(r.state.holding).toBe(false);
    r = run(r.state, hold(true), tick(MID), hold(true));
    expect(r.state.holding).toBe(false);
    expect(r.state.t).toBe(0);
    r = run(r.state, hold(false), hold(true), tick(MID), hold(false));
    expect(r.state.phase).toBe('lit');
  });
  it('дія, що поклала останнє полінце, не починає шкалу сама: спершу відпусти', () => {
    const r = run(startFire(), act, act, act, hold(true), tick(MID), hold(true));
    expect(r.state.holding).toBe(false);
    expect(r.state.phase).toBe('match');
  });
  it('шкала: зелена смуга всередині 0..1', () => {
    expect(chargeAt(0)).toBe(0); expect(chargeAt(CHARGE_MS * 2)).toBe(1);
    expect(inBand(0.1)).toBe(false); expect(inBand(0.95)).toBe(false); expect(inBand(0.65)).toBe(true);
  });
});

describe('без вводу нічого не завершується (закон 1: сторож, що вміє червоніти)', () => {
  it('тільки час: idle/stack/match/stacked — жодне не доходить до lit чи done', () => {
    for (const s0 of [FIRE_IDLE, startFire(), stacked()]) {
      let s = s0;
      for (let i = 0; i < 500; i++) s = stepFire(s, tick(100)).state;
      expect(['lit', 'done']).not.toContain(s.phase);
      expect(s.phase).toBe(s0.phase);
    }
  });
  it('тримання без відпускання ніколи не запалює (лише згасає)', () => {
    let s = stacked();
    s = stepFire(s, hold(true)).state;
    for (let i = 0; i < 500; i++) { s = stepFire(s, tick(50)).state; s = stepFire(s, hold(true)).state; }
    expect(['lit', 'done']).not.toContain(s.phase);
  });
  it('idle не реагує на вхід', () => {
    for (const i of [act, hold(true), hold(false)]) expect(stepFire(FIRE_IDLE, i)).toEqual({ state: FIRE_IDLE, event: 'none' });
  });
  it('відпускання в кожну мить шкали: запалює лише в зеленому (не завжди)', () => {
    let lit = 0; let fizz = 0;
    for (let t = 0; t < CHARGE_MS; t += 20) { const e = stepFire({ ...stacked(), holding: true, lock: false, t }, hold(false)).event; if (e === 'lit') lit++; else if (e === 'fizzle') fizz++; }
    expect(lit).toBeGreaterThan(5);
    expect(fizz).toBeGreaterThan(20);
  });
});
