// GAME-33 · властивість сейву: serialize → fromSave не губить нічого (однаковий stateHash), а
// serialize∘fromSave∘serialize — ідемпотентний. Випадкові послідовності валідних входів із нової гри.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFS } from './determinism.fixture';
import { stateHash } from './hash';
import { fromSave, serialize } from './save';
import { newSim, run, type Input } from './sim';

/** Фіксоване зерно: збій відтворюється тим самим числом. */
const SEED = 20261023;

// Абетка валідних входів: кадри, пауза, довгі дії, покупка/продаж, взаємодії. Без
// довільних полів — інакше випадкове майже завжди відхиляється й нічого не змінює в стані.
const input: fc.Arbitrary<Input> = fc.oneof(
  fc.integer({ min: 16, max: 5000 }).map((realMs): Input => ({ kind: 'frame', realMs })),
  fc.integer({ min: 1, max: 600 }).map((minutes): Input => ({ kind: 'advance', minutes })),
  fc.constant<Input>({ kind: 'pause' }),
  fc.constant<Input>({ kind: 'resume' }),
  fc.integer({ min: 0, max: 4 }).map((n): Input => ({ kind: 'command', command: { type: 'Interact', commandId: `i${n}`, targetId: `obj.spot-${n}` } })),
);

// commandId має бути детермінованим у межах одного прогону, тож нумеруємо після генерації.
const numbered = (xs: readonly Input[]): Input[] =>
  xs.map((x, i) => (x.kind === 'command' ? { kind: 'command', command: { ...x.command, commandId: `c${i}` } } as Input : x));

const play = (seed: number, log: readonly Input[]) => run(newSim(seed, 10_000), numbered(log), { defs: DEFS });

describe('властивість сейву (GAME-33, fast-check)', () => {
  it('fromSave(serialize(s)) дає той самий stateHash; serialize∘fromSave∘serialize — ідемпотентний', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 2 ** 31 }), fc.array(input, { maxLength: 120 }), (seed, log) => {
      const s = play(seed, log);
      const text = serialize(s);
      const r = fromSave(text);
      expect(r.ok, r.ok ? '' : `${r.code}: ${r.detail}`).toBe(true);
      if (!r.ok) return;
      expect(stateHash(r.sim)).toBe(stateHash(s));
      expect(serialize(r.sim)).toBe(text);
    }), { seed: SEED, numRuns: 300 });
  });

  it('позитивний контроль: вибірка справді змінює стан (інакше властивість порожня)', () => {
    let changed = 0;
    fc.assert(fc.property(fc.integer({ min: 0, max: 2 ** 31 }), fc.array(input, { minLength: 20, maxLength: 120 }), (seed, log) => {
      if (stateHash(play(seed, log)) !== stateHash(newSim(seed, 10_000))) changed++;
    }), { seed: SEED, numRuns: 100 });
    expect(changed).toBeGreaterThan(90);
  });
});
