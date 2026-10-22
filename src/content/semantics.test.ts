// Перехресна перевірка семантики (рецензія TL 23.10, ризик №1): правило `when` реалізоване двічі —
// у валідаторі (scripts/validator/combos.mjs) і в ядрі (src/core/story.ts). Повний перебір на
// нинішньому контенті не бачить розбіжності для виміру, якого в контенті ще немає. Тут — довільні
// умови й гравці: обидві реалізації мусять відповідати однаково.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { WhenDef } from '../core/defs';
import type { PlayerState } from '../core/state';
import { matches as coreMatches } from '../core/story';
import { matches as validatorMatches } from '../../scripts/validator/combos.mjs';

const P = ['profile.a', 'profile.b', 'profile.c'];
const T = ['transport.car', 'transport.bike', 'transport.camper'];
const A = ['animal.none', 'animal.dog', 'animal.cat'];
const sub = (xs: string[]) => fc.option(fc.subarray(xs, { minLength: 1 }), { nil: undefined });
const when: fc.Arbitrary<WhenDef | undefined> = fc.option(
  fc.record({ profiles: sub(P), transports: sub(T), animals: sub(A) }, { requiredKeys: [] })
    .map((w) => Object.fromEntries(Object.entries(w).filter(([, v]) => v !== undefined)) as WhenDef),
  { nil: undefined },
);
const player = fc.record({ profileId: fc.constantFrom(...P), transportId: fc.constantFrom(...T), animalId: fc.constantFrom(...A) });

describe('семантика when: валідатор ≡ ядро', () => {
  it('на довільних умовах і гравцях обидві реалізації відповідають однаково (fast-check, 2000 випадків)', () => {
    fc.assert(fc.property(when, player, (w, p) => {
      const core = coreMatches(w, { ...p, locationId: null } as PlayerState);
      const val = validatorMatches(w, { profile: p.profileId, transport: p.transportId, animal: p.animalId });
      expect(core).toBe(val);
    }), { seed: 20261023, numRuns: 2000 });
  });

  it('позитивний контроль: генератор справді дає і збіги, і незбіги', () => {
    const out = fc.sample(fc.tuple(when, player), { seed: 1, numRuns: 500 }).map(([w, p]) => coreMatches(w, { ...p, locationId: null } as PlayerState));
    expect(out).toContain(true);
    expect(out).toContain(false);
  });
});
