// GAME-13 · детермінізм, процес B — копія A в окремому процесі (pool: forks).
import { describe, expect, it } from 'vitest';
import { GOLDEN, LOG, SEED } from './determinism.fixture';
import { stateHash } from './hash';
import { newSim, run } from './sim';

describe('детермінізм — процес B', () => {
  it('той самий seed + журнал → зафіксований відбиток стану', () => {
    const a = run(newSim(SEED, 10_000), LOG);
    const b = run(newSim(SEED, 10_000), LOG);
    expect(stateHash(a)).toBe(stateHash(b));
    expect(stateHash(a)).toBe(GOLDEN);
  });
});
