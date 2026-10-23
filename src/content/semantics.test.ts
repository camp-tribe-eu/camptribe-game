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
// навмисно оптимістичний (межі — окремим тестом нижче).
// Межа охоплення: DIALOGUE_FLAG_NEVER_SET — навмисний лінт одруківок (прапорець, якого ніхто не ставить,
// навіть у живій гілці any чи в notFlag), а не вирок «не справдиться»; цим тестом він не звіряється.
describe('умови діалогу: валідатор не відкидає того, що ядро може справдити', () => {
  const FLAGS = ['f.a', 'f.b', 'f.c'];
  const KNOWN = new Set(['f.a', 'f.b']);             // f.c — жоден ефект не ставить
  const leaf: fc.Arbitrary<CondDef> = fc.oneof(
    fc.constantFrom(...FLAGS).map((flag) => ({ flag })),
    fc.constantFrom(...FLAGS).map((notFlag) => ({ notFlag })),
    fc.constantFrom('active', 'completed').map((status) => ({ quest: 'q.x', status } as CondDef)),
    fc.constantFrom('transport.car', 'transport.bike').map((transport) => ({ transport })),
  );
  const tree: fc.Arbitrary<CondDef> = fc.letrec<{ c: CondDef }>((tie) => ({
    c: fc.oneof({ depthSize: 'small', withCrossShrink: true }, leaf,
      fc.array(tie('c'), { minLength: 1, maxLength: 3 }).map((all) => ({ all })),
      fc.array(tie('c'), { minLength: 1, maxLength: 3 }).map((any) => ({ any }))),
  })).c;
  // Корінь — завжди all/any (рецензія: 34 % голих листків), плюс форма all[x, any[y]] з однією гілкою.
  const cond: fc.Arbitrary<CondDef> = fc.oneof(
    fc.array(tree, { minLength: 1, maxLength: 4 }).map((all) => ({ all })),
    fc.array(tree, { minLength: 1, maxLength: 4 }).map((any) => ({ any })),
    fc.tuple(tree, tree).map(([x, y]) => ({ all: [x, { any: [y] }] })),
  );
  // Усі стани, які ядро може мати: прапорці — лише з відомих (ставлять лише ефекти контенту).
  const STATES = subsets(['f.a', 'f.b']).flatMap((flags) => (['none', 'active', 'completed'] as const).flatMap((q) => ['transport.car', 'transport.bike'].map((transportId) => ({
    draft: { flags: flags ?? [], quests: q === 'none' ? {} : { 'q.x': { status: q, done: [] } } } as unknown as StoryDraft,
    player: { profileId: 'profile.a', transportId, animalId: 'animal.none', locationId: null } as PlayerState,
  }))));
  const validatorSaysDead = (c: CondDef): boolean => !satisfiable(c, KNOWN) || contradictions(c).size > 0;

  /** Перша умова, яку «суддя» відкинув, а ядро справдило; null — таких немає. */
  function counterexample(isDead: (c: CondDef) => boolean): { cond: CondDef; dead: number } | null {
    let dead = 0;
    let found: CondDef | null = null;
    fc.assert(fc.property(cond, (c) => {
      if (!isDead(c)) return;
      dead++;
      if (found === null && STATES.some((s) => holds(c, s.draft, s.player))) found = c;
    }), { seed: 20261023, numRuns: 3000 });
    return found === null ? null : { cond: found, dead };
  }

  it(`fast-check, 3000 умов × ${STATES.length} станів: «нездійсненне» у валідатора — false у ядра скрізь`, () => {
    let dead = 0;
    let clash = 0;                                    // мертві саме через суперечність, а не через невідомий прапорець
    fc.assert(fc.property(cond, (c) => {
      if (validatorSaysDead(c)) dead++;
      if (!satisfiable(c, new Set(FLAGS))) clash++;
    }), { seed: 20261023, numRuns: 3000 });
    // Запас від порогів (рецензія: 507 при порозі 500 — оновлення fast-check могло б тихо перетнути межу).
    expect(dead).toBeGreaterThan(400);
    expect(clash).toBeGreaterThan(100);
    expect(counterexample(validatorSaysDead)).toBeNull();
  });

  it('негативний контроль: суддя, що відкидає все, і суддя без шлюзу satisfiable — обидва ловляться', () => {
    expect(counterexample(() => true)).not.toBeNull();
    // Старий DIALOGUE_COND_CONTRADICTION (будь-яке зіткнення flag/notFlag у будь-якій гілці).
    const anyClash = (c: CondDef): boolean => {
      const walk = (x: CondDef, acc: { yes: Set<string>; no: Set<string> }): boolean => {
        if ('flag' in x) { acc.yes.add(x.flag); return acc.no.has(x.flag); }
        if ('notFlag' in x) { acc.no.add(x.notFlag); return acc.yes.has(x.notFlag); }
        if ('all' in x) { const a = { yes: new Set<string>(), no: new Set<string>() }; return x.all.map((y) => walk(y, a)).some(Boolean); }
        if ('any' in x) return x.any.map((y) => walk(y, { yes: new Set(), no: new Set() })).some(Boolean);
        return false;
      };
      return walk(c, { yes: new Set(), no: new Set() });
    };
    expect(counterexample(anyClash)).not.toBeNull();
  });

  it('відома оптимістичність валідатора (межа, не помилка): він пропускає ці мертві умови', () => {
    const KNOWN_DEAD: CondDef[] = [
      { all: [{ quest: 'q.x', status: 'active' }, { quest: 'q.x', status: 'completed' }] },  // квест і так, і так
      { all: [{ flag: 'f.a' }, { any: [{ notFlag: 'f.a' }] }] },                              // notFlag у any з однією гілкою
    ];
    for (const c of KNOWN_DEAD) {
      expect(validatorSaysDead(c), JSON.stringify(c)).toBe(false);
      expect(STATES.some((s) => holds(c, s.draft, s.player)), JSON.stringify(c)).toBe(false);
    }
  });
});
