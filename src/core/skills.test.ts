// GAME-72 · навички: спадна віддача практики, межа практики, небезпека дороги не залежить від навичок,
// ремонт без інструмента неможливий на будь-якому ранзі, досвід переживає сейв. Кожна властивість має
// мутацію в ядрі, яку вона ловить (закон 1) — перелік у звіті коміту; тут — вбудовані негативні контролі.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { dispatch, type Command } from './commands';
import { checkDefs, type CoreDefs, type StoryDefs } from './defs';
import { stateHash } from './hash';
import { fromSave, serialize } from './save';
import { newSim, run, type Input } from './sim';
import {
  MAX_RANK, PRACTICE_RANK_CAP, PRACTICE_XP_CAP, RANK_XP, SKILL_IDS, practiceGain, rankOf, zeroSkills,
} from './skills';
import { initialState, type GameState } from './state';
import { routeRisk, tripRisk } from './story';
import { BIKER, DRIVER, MECHANIC, NOVICE, play, SKILL_DEFS, type Step } from './story.fixture';

const SEED = 20261023;
const RUNS = 300;
const STORY = SKILL_DEFS.story as StoryDefs;

/** Стан із грошима й персонажем (ще без жодної практики). */
const start = (who: Step = DRIVER, money = 100_000): GameState => play([who], initialState(money), SKILL_DEFS);
const withXp = (s: GameState, xp: Readonly<Record<string, number>>): GameState => ({ ...s, skills: { ...s.skills, ...xp } });

let n = 0;
const send = (s: GameState, c: Step, defs: CoreDefs = SKILL_DEFS) => dispatch(s, { ...c, commandId: `k${n++}` } as Command, defs);

/** Досвід навички після кожного з `times` повторів пари «купити → продати» пічки (ключ trade:item.stove). */
function farmTrade(s0: GameState, times: number): { xp: number[]; state: GameState } {
  let s = s0;
  const xp: number[] = [];
  for (let i = 0; i < times; i++) {
    const c: Step = i % 2 === 0 ? { type: 'BuyItem', itemId: 'item.stove' } : { type: 'SellItem', itemId: 'item.stove' };
    const r = send(s, c);
    if (!r.ok) throw new Error(`${c.type} → ${r.code}`);
    s = r.state;
    xp.push(s.skills['skill.finance'] as number);
  }
  return { xp, state: s };
}

describe('ранги й крива (SIM-SKL-001, 005)', () => {
  it('вісім напрямів, ранги 0–5 за порогами 0/10/30/60/100/150', () => {
    expect(SKILL_IDS.length).toBe(8);
    expect(Object.keys(initialState(0).skills).sort()).toEqual([...SKILL_IDS].sort());
    expect([0, 9, 10, 29, 30, 59, 60, 99, 100, 149, 150, 10_000].map(rankOf)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    expect(RANK_XP.length).toBe(MAX_RANK + 1);
  });
  it('віддача повтору: 12, 6, 4, 3, 2, 2, 1, 1, 1, 1, 1, 1, потім 0 — лише цілі числа', () => {
    const g = Array.from({ length: 14 }, (_, i) => practiceGain(i));
    expect(g).toEqual([12, 6, 4, 3, 2, 2, 1, 1, 1, 1, 1, 1, 0, 0]);
    expect(g.every(Number.isSafeInteger)).toBe(true);
  });
  it('професія задає старт: механік на рангах 5, новачок — 1, без startSkills — нулі', () => {
    expect(start(MECHANIC).skills).toEqual({ ...zeroSkills(), 'skill.mechanics': 150, 'skill.electrics': 150 });
    expect(start(NOVICE).skills).toEqual({ ...zeroSkills(), 'skill.mechanics': 10 });
    expect(start(DRIVER).skills).toEqual(zeroSkills());
  });
});

describe('Спосіб перевірки 1: спадна віддача й межа практики (SIM-SKL-006, 007)', () => {
  it('повтор тієї самої дії: 10-й повтор дає менше досвіду, ніж 1-й (1 проти 12)', () => {
    const { xp } = farmTrade(start(), 12);
    const gains = xp.map((x, i) => x - (i === 0 ? 0 : (xp[i - 1] as number)));
    expect(gains).toEqual([12, 6, 4, 3, 2, 2, 1, 1, 1, 1, 1, 1]);
    expect(gains[9]).toBeLessThan(gains[0] as number);
    expect([gains[0], gains[9]]).toEqual([12, 1]);
  });

  it('нова ціль вчить знову: перша поїздка в нове місце — знову 12, повернення в старе — менше', () => {
    // Водій: дім → крамниця (12) → дім (12, інший ключ) → крамниця (6, повтор).
    const s0 = play([{ type: 'Visit', locationId: 'loc.home' }, { type: 'CompleteQuest', questId: 'q.start' }], start(), SKILL_DEFS);
    const route = ['loc.shop', 'loc.home', 'loc.shop'];
    let s = s0;
    const gains: number[] = [];
    for (const loc of route) {
      const before = s.skills['skill.planning'] as number;
      s = play([{ type: 'Visit', locationId: loc }], s, SKILL_DEFS);
      gains.push((s.skills['skill.planning'] as number) - before);
    }
    expect(gains).toEqual([12, 12, 6]);
    expect(s.skills['skill.endurance']).toBe(s.skills['skill.planning']);   // переїзд вчить і витривалість
  });

  it('фарм однієї дії з нуля: 200 повторів — 35 досвіду, ранг 2 (не вище межі 3)', () => {
    const { xp } = farmTrade(start(), 200);
    expect(xp.at(-1)).toBe(35);
    expect(rankOf(xp.at(-1) as number)).toBe(2);
    expect(xp.slice(12).every((x) => x === 35)).toBe(true);                // з 13-го повтору — нічого
  });

  it('властивість (fast-check): будь-скільки повторів однієї дії з будь-якого старту — ранг ≤ max(старт, 3)', () => {
    const base = start();
    fc.assert(fc.property(fc.integer({ min: 0, max: 200 }), fc.integer({ min: 1, max: 40 }), (xp0, times) => {
      const { state } = farmTrade(withXp(base, { 'skill.finance': xp0 }), times);
      const after = state.skills['skill.finance'] as number;
      return rankOf(after) <= Math.max(rankOf(xp0), PRACTICE_RANK_CAP) && after >= xp0;
    }), { seed: SEED, numRuns: RUNS });
  });

  it('властивість (fast-check): досвід, що вже вище межі практики (від професії), практика не зменшує й не збільшує', () => {
    const base = start();
    fc.assert(fc.property(fc.integer({ min: PRACTICE_XP_CAP, max: 500 }), fc.integer({ min: 1, max: 20 }), (xp0, times) => {
      return farmTrade(withXp(base, { 'skill.finance': xp0 }), times).state.skills['skill.finance'] === xp0;
    }), { seed: SEED, numRuns: RUNS });
  });

  it('межа досяжна, але не перейдена: старт 95 + одна практика = 99 (ранг 3), а не 107 (ранг 4)', () => {
    const { xp } = farmTrade(withXp(start(), { 'skill.finance': 95 }), 1);
    expect(xp).toEqual([PRACTICE_XP_CAP]);
    expect(rankOf(PRACTICE_XP_CAP)).toBe(PRACTICE_RANK_CAP);
  });

  it('без персонажа вчитись нікому; відмова й повтор commandId нічого не вчать', () => {
    const blank = send(initialState(10_000), { type: 'BuyItem', itemId: 'item.stove' });
    expect(blank.ok && blank.state.skills).toEqual(zeroSkills());
    expect(blank.ok && blank.state.practice).toEqual({});
    const s = start(DRIVER, 0);
    const poor = send(s, { type: 'BuyItem', itemId: 'item.stove' });   // INSUFFICIENT_FUNDS
    expect(poor.ok).toBe(false);
    expect(poor.state.skills).toEqual(s.skills);
    const rich = start();
    const once = dispatch(rich, { type: 'BuyItem', commandId: 'same', itemId: 'item.stove' }, SKILL_DEFS);
    const again = dispatch(once.state, { type: 'BuyItem', commandId: 'same', itemId: 'item.stove' }, SKILL_DEFS);
    expect(again.repeated).toBe(true);
    expect(again.state.skills).toEqual(once.state.skills);
  });

  it('прийти туди, де стоїш, — не практика', () => {
    const s = play([{ type: 'Visit', locationId: 'loc.home' }], start(), SKILL_DEFS);
    expect(s.skills).toEqual(zeroSkills());
    expect(s.practice).toEqual({});
  });
});

describe('Спосіб перевірки 2: навичка не робить небезпечну дорогу безпечною (SIM-SKL-003, 009)', () => {
  const ALL = ['loc.home', 'loc.shop', 'loc.dogpark'];
  const skillsArb = fc.record(Object.fromEntries(SKILL_IDS.map((id) => [id, fc.integer({ min: 0, max: 1_000 })])) as Record<string, fc.Arbitrary<number>>);
  const where = fc.record({ from: fc.constantFrom(...ALL), to: fc.constantFrom(...ALL), transport: fc.constantFrom('transport.car', 'transport.bike') });

  /** Чи не залежить функція небезпеки від навичок: для будь-яких навичок — те саме, що й з нулями. */
  const independent = (risk: typeof tripRisk): boolean => {
    const r = fc.check(fc.property(skillsArb, where, (skills, w) => {
      const player = { profileId: 'profile.a', transportId: w.transport, animalId: 'animal.none', locationId: w.from };
      return risk(STORY, { player, skills }, w.to) === risk(STORY, { player, skills: zeroSkills() }, w.to);
    }), { seed: SEED, numRuns: RUNS });
    return !r.failed;
  };

  it('небезпечна дорога існує: автом дім → крамниця — 3, велосипедом через парк — 2 (максимум ребер)', () => {
    expect(routeRisk(STORY, 'loc.home', 'loc.shop', 'transport.car')).toBe(3);
    expect(routeRisk(STORY, 'loc.home', 'loc.shop', 'transport.bike')).toBe(2);
    // Найризикованіша ділянка першою (2, потім 1): «остання ділянка» дала б 1 (рецензія fbd9c56).
    expect(routeRisk(STORY, 'loc.shop', 'loc.home', 'transport.bike')).toBe(2);
    expect(routeRisk(STORY, 'loc.home', 'loc.home', 'transport.car')).toBe(0);
  });

  it('водій із усіма навичками на рангах 5 — та сама небезпека 3, що й новачок', () => {
    const novice = play([{ type: 'Visit', locationId: 'loc.home' }], start(), SKILL_DEFS);
    const master = withXp(novice, Object.fromEntries(SKILL_IDS.map((id) => [id, RANK_XP[MAX_RANK] as number])));
    expect([tripRisk(STORY, novice, 'loc.shop'), tripRisk(STORY, master, 'loc.shop')]).toEqual([3, 3]);
  });

  it('властивість (fast-check): небезпека поїздки не залежить від навичок — для будь-яких навичок, місць і транспорту', () => {
    expect(independent(tripRisk)).toBe(true);
  });

  it('негативний контроль: небезпека, яку знижує планування, — властивість вище це ловить', () => {
    const softened: typeof tripRisk = (st, s, to) => {
      const r = tripRisk(st, s, to);
      return r === null ? null : Math.max(0, r - rankOf(s.skills['skill.planning'] ?? 0));
    };
    expect(independent(softened)).toBe(false);
  });

  it('поїздка не змінює небезпеку дороги: ядро не читає навичок у Visit і не змінює каталог', () => {
    const s = play([{ type: 'Visit', locationId: 'loc.home' }, { type: 'CompleteQuest', questId: 'q.start' }, { type: 'Visit', locationId: 'loc.shop' }], start(), SKILL_DEFS);
    expect(s.skills['skill.planning']).toBeGreaterThan(0);
    expect(routeRisk(STORY, 'loc.shop', 'loc.home', 'transport.car')).toBe(3);
    expect(tripRisk(STORY, s, 'loc.home')).toBe(3);
  });
});

describe('Спосіб перевірки 3: навичка не скасовує інструмента й запчастини (SIM-SKL-003, 008)', () => {
  const WHEEL: Step = { type: 'Repair', targetId: 'obj.bike-wheel' };
  const buy = (s: GameState, ...items: string[]) => play(items.map((itemId) => ({ type: 'BuyItem', itemId }) as Step), s, SKILL_DEFS);

  it('механік на рангі 5 без ключа — відмова TOOL_MISSING, стан не змінено', () => {
    const s = buy(start(MECHANIC), 'item.tube');
    expect(rankOf(s.skills['skill.mechanics'] as number)).toBe(5);
    const r = send(s, WHEEL);
    expect(r.ok ? 'ok' : r.code).toBe('TOOL_MISSING');
    expect(r.state.flags).toEqual(s.flags);
    expect(r.state.inventory).toEqual(s.inventory);
  });

  it('властивість (fast-check): будь-які навички, будь-який набір без інструмента — завжди TOOL_MISSING', () => {
    const base = start(MECHANIC);
    const arb = fc.record({
      xp: fc.record(Object.fromEntries(SKILL_IDS.map((id) => [id, fc.integer({ min: 0, max: 1_000 })])) as Record<string, fc.Arbitrary<number>>),
      items: fc.subarray(['item.tube', 'item.multimeter', 'item.stove']),
      target: fc.constantFrom('obj.bike-wheel', 'obj.lamp'),
    });
    fc.assert(fc.property(arb, ({ xp, items, target }) => {
      const tool = target === 'obj.bike-wheel' ? 'item.wrench' : 'item.multimeter';
      const inventory = Object.fromEntries(items.filter((i) => i !== tool).map((i) => [i, 1]));
      const r = send({ ...base, skills: xp, inventory }, { type: 'Repair', targetId: target });
      return !r.ok && r.code === 'TOOL_MISSING';
    }), { seed: SEED, numRuns: RUNS });
  });

  it('з ключем, але без камери — PART_MISSING; з обома, але ранг 1 — SKILL_TOO_LOW', () => {
    const r1 = send(buy(start(MECHANIC), 'item.wrench'), WHEEL);
    expect(r1.ok ? 'ok' : r1.code).toBe('PART_MISSING');
    const novice = buy(start(NOVICE), 'item.wrench', 'item.tube');
    expect(rankOf(novice.skills['skill.mechanics'] as number)).toBe(1);
    const r2 = send(novice, WHEEL);
    expect(r2.ok ? 'ok' : r2.code).toBe('SKILL_TOO_LOW');
  });

  it('усе є — полагоджено: камера витрачена, ключ лишився, прапорець стоїть; вдруге — ALREADY_REPAIRED', () => {
    const s = buy(start(MECHANIC), 'item.wrench', 'item.tube');
    const r = send(s, WHEEL);
    expect(r.ok).toBe(true);
    expect(r.state.inventory).toEqual({ 'item.wrench': 1 });
    expect(r.state.flags).toContain('f.wheel-fixed');
    expect(r.state.practice['repair:obj.bike-wheel']).toBe(1);
    const again = send(buy(r.state, 'item.tube'), WHEEL);
    expect(again.ok ? 'ok' : again.code).toBe('ALREADY_REPAIRED');
  });

  it('ремонт вчить свою навичку: електрика 10 → 22 після лампи', () => {
    const s = withXp(buy(start(DRIVER), 'item.multimeter'), { 'skill.electrics': 10 });
    const r = send(s, { type: 'Repair', targetId: 'obj.lamp' });
    expect(r.ok && r.state.skills['skill.electrics']).toBe(22);
  });

  it('невідома ціль — UNKNOWN_TARGET; без персонажа — NO_CHARACTER', () => {
    expect(send(start(), { type: 'Repair', targetId: 'obj.ghost' })).toMatchObject({ ok: false, code: 'UNKNOWN_TARGET' });
    expect(send(initialState(0), WHEEL)).toMatchObject({ ok: false, code: 'NO_CHARACTER' });
  });
});

describe('Спосіб перевірки 4: досвід переживає сейв (хеш)', () => {
  const log: Input[] = [
    MECHANIC, { type: 'Visit', locationId: 'loc.home' }, { type: 'CompleteQuest', questId: 'q.start' },
    { type: 'Visit', locationId: 'loc.shop' }, { type: 'BuyItem', itemId: 'item.stove' }, { type: 'SellItem', itemId: 'item.stove' },
    { type: 'BuyItem', itemId: 'item.stove' }, { type: 'Pickup', itemId: 'item.gold' }, { type: 'Talk', npcId: 'npc.ann' },
  ].map((c, i) => ({ kind: 'command', command: { ...c, commandId: `sv${i}` } }) as Input);
  const live = run(newSim(SEED, 50_000), log, { defs: SKILL_DEFS });

  it('serialize → fromSave: навички й практика ті самі, хеш той самий; без навичок хеш інший', () => {
    expect(live.game.skills['skill.finance']).toBe(22);                       // 12 + 6 + 4 за три торги пічкою
    expect(live.game.skills['skill.mechanics']).toBe(150);                    // старт професії
    expect(Object.keys(live.game.practice).length).toBe(4);
    const r = fromSave(serialize(live));
    expect(r.ok && r.sim.game.skills).toEqual(live.game.skills);
    expect(r.ok && r.sim.game.practice).toEqual(live.game.practice);
    expect(r.ok && stateHash(r.sim)).toBe(stateHash(live));
    expect(stateHash({ ...live, game: { ...live.game, skills: zeroSkills() } })).not.toBe(stateHash(live));
    expect(stateHash({ ...live, game: { ...live.game, practice: {} } })).not.toBe(stateHash(live));
  });

  it('продовження після завантаження = без перерви: наступний торг дає ту саму віддачу (3), хеш той самий', () => {
    const r = fromSave(serialize(live));
    if (!r.ok) throw new Error(r.code);
    const more: Input[] = [{ kind: 'command', command: { type: 'SellItem', commandId: 'after0', itemId: 'item.stove' } }];
    const a = run(r.sim, more, { defs: SKILL_DEFS });
    expect(a.game.skills['skill.finance']).toBe(25);
    expect(stateHash(a)).toBe(stateHash(run(live, more, { defs: SKILL_DEFS })));
  });
});

describe('детермінізм: навички не споживають RNG', () => {
  it('той самий журнал із навичками на нулях і на рангах 5 — той самий RNG і ті самі знахідки', () => {
    const log: Input[] = [
      { kind: 'command', command: { ...BIKER, commandId: 'r0' } },
      ...Array.from({ length: 50 }, (_, i): Input => ({ kind: 'frame', realMs: 250 + i })),
      { kind: 'command', command: { type: 'Visit', commandId: 'r1', locationId: 'loc.home' } },
      { kind: 'command', command: { type: 'CompleteQuest', commandId: 'r2', questId: 'q.start' } },
      { kind: 'command', command: { type: 'Visit', commandId: 'r3', locationId: 'loc.shop' } },
      ...Array.from({ length: 50 }, (_, i): Input => ({ kind: 'frame', realMs: 250 + i })),
    ];
    const a = run(newSim(SEED, 10_000), log, { defs: SKILL_DEFS });
    const s0 = run(newSim(SEED, 10_000), log.slice(0, 1), { defs: SKILL_DEFS });
    const maxed = { ...s0, game: { ...s0.game, skills: Object.fromEntries(SKILL_IDS.map((id) => [id, 150])) } };
    const b = run(maxed, log.slice(1), { defs: SKILL_DEFS });
    expect(b.rng).toEqual(a.rng);
    expect(b.finds).toBe(a.finds);
    expect(b.clock).toEqual(a.clock);
    expect(a.game.skills['skill.planning']).not.toBe(b.game.skills['skill.planning']);   // навички справді різні
  });
});

describe('каталог: checkDefs відсікає криві навички, ремонти й небезпеку', () => {
  it('позитивний контроль: SKILL_DEFS — без знахідок', () => {
    expect(checkDefs(SKILL_DEFS)).toEqual([]);
  });
  it('невідома навичка, ранг поза 0–5, небезпека поза 0–3 — кожне має свою знахідку', () => {
    const st = STORY;
    const bad: CoreDefs = {
      ...SKILL_DEFS,
      repairs: { 'obj.x': { skill: 'skill.swimming' as never, minRank: 6, tool: 'item.wrench', flag: 'f.x' } },
      story: {
        ...st,
        profiles: { ...st.profiles, 'profile.z': { startSkills: { 'skill.swimming': 1, 'skill.camping': 9 } } },
        roads: [{ from: 'loc.home', to: 'loc.shop', ways: { 'transport.car': { minutes: 1, cents: 0, risk: 4 } } }],
      },
    };
    expect(checkDefs(bad).map((f) => `${f.code} ${f.where}`).sort()).toEqual([
      'DEFS_BAD_AMOUNT obj.x.minRank',
      'DEFS_BAD_AMOUNT profile.z.startSkills.skill.camping',
      'DEFS_BAD_AMOUNT roads[0].transport.car.risk',
      'DEFS_BAD_REF obj.x.skill',
      'DEFS_BAD_REF profile.z.startSkills.skill.swimming',
    ]);
  });
});
