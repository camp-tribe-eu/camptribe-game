// GAME-13 · детермінізм, процес A. Файл B робить те саме в іншому процесі (pool: forks).
import { describe, expect, it } from 'vitest';
import { DEFS, GOLDEN, LOG, SEED } from './determinism.fixture';
import { stateHash } from './hash';
import { newSim, run } from './sim';

describe('детермінізм — процес A', () => {
  it('той самий seed + журнал → зафіксований відбиток стану', () => {
    const a = run(newSim(SEED, 10_000), LOG, { defs: DEFS });
    const b = run(newSim(SEED, 10_000), LOG, { defs: DEFS });
    expect(stateHash(a)).toBe(stateHash(b));
    expect(stateHash(a)).toBe(GOLDEN);
  });
});
