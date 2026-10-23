// Перехресна перевірка семантики (рецензія TL 23.10, ризик №1): правило `when` реалізоване двічі —
// у валідаторі (scripts/validator/combos.mjs) і в ядрі (src/core/story.ts). Повний перебір на
// нинішньому контенті не бачить розбіжності для виміру, якого в контенті ще немає. Тут — довільні
// умови й гравці: обидві реалізації мусять відповідати однаково.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { CondDef, WhenDef } from '../core/defs';
import type { PlayerState } from '../core/state';
import { holds, matches as coreMatches, type StoryDraft } from '../core/story';
import { matches as validatorMatches } from '../../scripts/validator/combos.mjs';
import { contradictions, satisfiable } from '../../scripts/validator/checks.mjs';

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

// Простір скінченний: усі непорожні підмножини кожного виміру або «немає ключа» × усі гравці —
// перебираємо ПОВНІСТЮ, а не вибіркою (рецензія GAME-42: 2000 випадків покривали ~14 %).
const subsets = (xs: string[]): (string[] | undefined)[] => [undefined, ...Array.from({ length: (1 << xs.length) - 1 }, (_, m) => xs.filter((_, i) => ((m + 1) >> i) & 1))];
const ALL_WHENS: (WhenDef | undefined)[] = [undefined];
for (const profiles of subsets(P)) for (const transports of subsets(T)) for (const animals of subsets(A)) {
  ALL_WHENS.push(Object.fromEntries(Object.entries({ profiles, transports, animals }).filter(([, v]) => v !== undefined)) as WhenDef);
}
const ALL_PLAYERS = P.flatMap((profileId) => T.flatMap((transportId) => A.map((animalId) => ({ profileId, transportId, animalId }))));

describe('семантика when: валідатор ≡ ядро', () => {
  it(`повний перебір: ${ALL_WHENS.length} умов × ${ALL_PLAYERS.length} гравців — обидві реалізації відповідають однаково`, () => {
    let checked = 0;
    for (const w of ALL_WHENS) for (const p of ALL_PLAYERS) {
      const core = coreMatches(w, { ...p, locationId: null } as PlayerState);
      const val = validatorMatches(w, { profile: p.profileId, transport: p.transportId, animal: p.animalId });
      if (core !== val) throw new Error(`розбіжність: when=${JSON.stringify(w)} гравець=${JSON.stringify(p)} ядро=${core} валідатор=${val}`);
      checked++;
    }
    expect(checked).toBe(ALL_WHENS.length * ALL_PLAYERS.length);
    expect(ALL_WHENS.length).toBe(8 * 8 * 8 + 1);   // 7 непорожніх підмножин + «немає ключа», по кожному виміру; + без when
  });

  it('ключ присутній, але undefined — як відсутній (обидві сторони)', () => {
    const p = ALL_PLAYERS[0] as (typeof ALL_PLAYERS)[number];
    const w = { animals: undefined } as unknown as WhenDef;
    expect(coreMatches(w, { ...p, locationId: null } as PlayerState)).toBe(validatorMatches(w, { profile: p.profileId, transport: p.transportId, animal: p.animalId }));
  });

  it('fast-check (зерно 20261023) — на випадок, якщо перелік вимірів розшириться без оновлення перебору', () => {
    fc.assert(fc.property(when, player, (w, p) => {
      expect(coreMatches(w, { ...p, locationId: null } as PlayerState)).toBe(validatorMatches(w, { profile: p.profileId, transport: p.transportId, animal: p.animalId }));
    }), { seed: 20261023, numRuns: 500 });
  });
  it('позитивний контроль: генератор справді дає і збіги, і незбіги', () => {
    const out = fc.sample(fc.tuple(when, player), { seed: 1, numRuns: 500 }).map(([w, p]) => coreMatches(w, { ...p, locationId: null } as PlayerState));
    expect(out).toContain(true);
    expect(out).toContain(false);
  });
});

// Рецензія GAME-42: умови реплік діалогу (CondDef) ядро обчислює (holds), а валідатор лише судить
// статично (satisfiable / contradictions у checks.mjs). Вимога — НАДІЙНІСТЬ валідатора: що він
// назвав нездійсненним, того ядро не справдить у жодному стані. Обернене не вимагається: валідатор
// навмисно оптимістичний щодо quest і transport (рахує їх здійсненними), — це перелічено нижче.
describe('умови діалогу: валідатор не відкидає того, що ядро може справдити', () => {
  const FLAGS = ['f.a', 'f.b', 'f.c'];
  const KNOWN = new Set(['f.a', 'f.b']);             // f.c — жоден ефект не ставить
  const leaf: fc.Arbitrary<CondDef> = fc.oneof(
    fc.constantFrom(...FLAGS).map((flag) => ({ flag })),
    fc.constantFrom(...FLAGS).map((notFlag) => ({ notFlag })),
    fc.constantFrom('active', 'completed').map((status) => ({ quest: 'q.x', status } as CondDef)),
    fc.constantFrom('transport.car', 'transport.bike').map((transport) => ({ transport })),
  );
  const cond: fc.Arbitrary<CondDef> = fc.letrec<{ c: CondDef }>((tie) => ({
    c: fc.oneof({ depthSize: 'small', withCrossShrink: true }, leaf,
      fc.array(tie('c'), { minLength: 1, maxLength: 3 }).map((all) => ({ all })),
      fc.array(tie('c'), { minLength: 1, maxLength: 3 }).map((any) => ({ any }))),
  })).c;
  // Усі стани, які ядро може мати: прапорці — лише з відомих (ставлять лише ефекти контенту).
  const STATES = subsets(['f.a', 'f.b']).flatMap((flags) => (['none', 'active', 'completed'] as const).flatMap((q) => ['transport.car', 'transport.bike'].map((transportId) => ({
    draft: { flags: flags ?? [], quests: q === 'none' ? {} : { 'q.x': { status: q, done: [] } } } as unknown as StoryDraft,
    player: { profileId: 'profile.a', transportId, animalId: 'animal.none', locationId: null } as PlayerState,
  }))));

  it(`fast-check, 3000 умов × ${STATES.length} станів: «нездійсненне» у валідатора — false у ядра скрізь`, () => {
    let rejected = 0;
    fc.assert(fc.property(cond, (c) => {
      const dead = !satisfiable(c, KNOWN) || contradictions(c).size > 0;
      if (!dead) return;
      rejected++;
      for (const s of STATES) if (holds(c, s.draft, s.player)) throw new Error(`валідатор відкинув здійсненне: ${JSON.stringify(c)} справджується в ${JSON.stringify(s.draft)} ${s.player.transportId}`);
    }), { seed: 20261023, numRuns: 3000 });
    expect(rejected).toBeGreaterThan(300);            // перевірка справді бачила «нездійсненні» умови
  });

  it('відома оптимістичність валідатора (не помилка, а межа): quest-суперечність і чужий транспорт він пропускає', () => {
    const both: CondDef = { all: [{ quest: 'q.x', status: 'active' }, { quest: 'q.x', status: 'completed' }] };
    expect(satisfiable(both, KNOWN)).toBe(true);
    expect(STATES.some((s) => holds(both, s.draft, s.player))).toBe(false);
  });

  it('негативний контроль: «валідатор», що відкидає все, ловиться', () => {
    const c: CondDef = { flag: 'f.a' };
    const fakeDead = true;
    expect(fakeDead && STATES.some((s) => holds(c, s.draft, s.player))).toBe(true);
  });
});
