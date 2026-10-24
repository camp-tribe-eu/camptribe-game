// GAME-33 · формат сейву: вічні фікстури, коди відмов, повний цикл.
import { describe, expect, it } from 'vitest';
import v1 from '../../tests/saves/v1.json';
import v2 from '../../tests/saves/v2.json';
import v3 from '../../tests/saves/v3.json';
import { V2_STORY, V3_LIFE } from './save-v2.fixture';
import { LIFE_DEFS, STORY_DEFS } from './story.fixture';
import { DEFS, LOG, SEED } from './determinism.fixture';
import { stateHash } from './hash';
import type { StoryDefs } from './defs';
import { LOAD_CODES, SAVE_VERSION, danglingRefs, fromSave, serialize, type LoadCode } from './save';
import { newSim, run, step, type Input, type JournalEntry } from './sim';
import { paydayDay, paydaysThrough } from './life';
import { zeroSkills } from './skills';

/** Кожна випущена версія сейву — фікстура назавжди (TD-007). Нову версію додати сюди. */
const FIXTURES: Record<number, unknown> = { 1: v1, 2: v2, 3: v3 };
/** Фікстури v2/v3 записано до GAME-106: у записах журналу ще немає балансу (`cents`, необов'язкове поле). Решта — та сама. */
const preBalance = (j: readonly JournalEntry[]): object[] => j.map((e) => ({ at: e.at, commandId: e.commandId, type: e.type, ref: e.ref }));

describe('вічні фікстури сейвів (TD-007)', () => {
  it('є фікстура для кожної версії від 1 до поточної', () => {
    for (let v = 1; v <= SAVE_VERSION; v++) expect(FIXTURES[v], `tests/saves/v${v}.json`).toBeDefined();
  });

  for (const [v, fixture] of Object.entries(FIXTURES)) {
    it(`фікстура v${v} завантажується в поточну версію без втрат`, () => {
      const r = fromSave(JSON.stringify(fixture));
      expect(r.ok, r.ok ? '' : `${r.code}: ${r.detail}`).toBe(true);
      if (r.ok) {
        expect(r.fromVersion).toBe(Number(v));
        expect(r.sim.game.seq).toBeGreaterThan(0);
        // round-trip уже в поточній версії: той самий стан
        const again = fromSave(serialize(r.sim));
        expect(again.ok && again.fromVersion).toBe(SAVE_VERSION);
        expect(again.ok && stateHash(again.sim)).toBe(stateHash(r.sim));
      }
    });
  }

  it('фікстура v1 — той самий стан, що й детермінований прогін (сейв нічого не губить)', () => {
    const live = run(newSim(SEED, 10_000), LOG.slice(0, 600), { defs: DEFS });
    const r = fromSave(JSON.stringify(v1));
    // Журналу у v1 не було (GAME-32): міграція дає порожній — історію не вигадуємо. Решта — побайтно.
    expect(r.ok && r.sim.journal).toEqual([]);
    // Зерна світу у v1 теж не було (GAME-46): міграція дає 0 — детерміновано, однаково для всіх v1.
    expect(r.ok && r.sim.worldSeed).toBe(0);
    expect(r.ok && stateHash({ ...r.sim, journal: null, worldSeed: null })).toBe(stateHash({ ...live, journal: null, worldSeed: null }));
  });
});

describe('v2 (GAME-29): персонаж і квести', () => {
  it('фікстура v2 — той самий стан, що й живий прогін із сюжетом', () => {
    const live = run(run(newSim(SEED, 10_000), LOG.slice(0, 600), { defs: DEFS }), V2_STORY as Input[], { defs: STORY_DEFS });
    const r = fromSave(JSON.stringify(v2));
    // GAME-84 №1: фікстура — вічна (сейв, записаний до виправлення), тож вона тримає запис журналу «Visit loc.home» удома,
    // якого новий рушій уже не пише (дія нічого не міняє). Усе інше — той самий стан; журнал порівнюємо окремо нижче.
    expect(r.ok && stateHash({ ...r.sim, journal: null })).toBe(stateHash({ ...live, journal: null }));
    expect(r.ok && r.sim.journal.length).toBe(live.journal.length + 1);
    expect(r.ok && r.sim.journal.filter((e) => !(e.type === 'Visit' && e.ref === 'loc.home'))).toEqual(preBalance(live.journal));
    expect(r.ok && Object.keys(r.sim.game.quests).length).toBe(3);   // фікстура справді несе квести
    expect(r.ok && r.sim.game.npcMemory).toEqual({ 'npc.ann': ['m.biker'] });   // і пам'ять NPC (GAME-48), не лише {}
  });
  it('v1 після міграції: персонажа ще нема, квестів нема, розділ не завершено', () => {
    const r = fromSave(JSON.stringify(v1));
    expect(r.ok && { p: r.sim.game.player, q: r.sim.game.quests, e: r.sim.game.campaignEnded, v: r.sim.game.schemaVersion }).toEqual({ p: null, q: {}, e: false, v: 3 });
  });
  it('v1 після міграції: навички — вісім нулів, практики немає (GAME-72)', () => {
    const r = fromSave(JSON.stringify(v1));
    expect(r.ok && r.sim.game.skills).toEqual(zeroSkills());
    expect(r.ok && r.sim.game.practice).toEqual({});
  });
  it('фікстура v2 несе навички й практику, не лише нулі (GAME-72)', () => {
    const r = fromSave(JSON.stringify(v2));
    expect(r.ok && r.sim.game.skills['skill.planning']).toBe(12);
    expect(r.ok && r.sim.game.practice).toEqual({ 'visit:loc.shop': 1, 'pickup:item.gold': 1, 'talk:npc.ann': 1 });
  });
  it('v1 після міграції: NPC нічого не пам\'ятають (GAME-48)', () => {
    const r = fromSave(JSON.stringify(v1));
    expect(r.ok && r.sim.game.npcMemory).toEqual({});
  });
});

describe('v3 (GAME-71): календар життя; v2 вийшов до гравців без `life` — лише міграція', () => {
  const LIFE = LIFE_DEFS.life as NonNullable<typeof LIFE_DEFS.life>;
  it('фікстура v2 — РІВНО та, що на main (опублікована гра): поля life у ній немає', () => {
    expect(Object.hasOwn((v2 as { sim: { game: object } }).sim.game, 'life')).toBe(false);
    expect((v2 as { checksum: string }).checksum).toBe('fe089db9');
  });
  it('v2 → v3: відпусток немає; без календаря лічильник 0, з календарем — дні виплати до сейву зараховано без грошей', () => {
    const bare = fromSave(JSON.stringify(v2));
    expect(bare.ok && bare.sim.game.life).toEqual({ paydays: 0, leave: [] });
    expect(bare.ok && bare.sim.game.schemaVersion).toBe(3);
    // Той самий v2, але годинник на дні 100 (9 вересня 2027): 25.06, 25.07, 25.08 уже минули.
    const late = structuredClone(v2) as { checksum: string; sim: { clock: { minutes: number } } };
    late.sim.clock.minutes = 100 * 1440 + 7;
    late.checksum = stateHash(late.sim);
    const r = fromSave(JSON.stringify(late), { life: LIFE });
    expect(r.ok && r.sim.game.life).toEqual({ paydays: 3, leave: [] });
    if (!r.ok) return;
    // і перший крок гри з календарем не платить за ці три дні заднім числом; наступна виплата 25.09 — платить
    const money = r.sim.game.moneyCents;
    const a = step(r.sim, { kind: 'advance', minutes: 0 }, { defs: LIFE_DEFS });
    expect(a.game.moneyCents).toBe(money);
    expect(step(a, { kind: 'advance', minutes: 16 * 1440 }, { defs: LIFE_DEFS }).game.moneyCents).toBe(money + 70_000);
  });
  it('негативний контроль: та сама міграція без календаря — і перший крок із календарем платить 3 пропущені виплати', () => {
    const late = structuredClone(v2) as { checksum: string; sim: { clock: { minutes: number } } };
    late.sim.clock.minutes = 100 * 1440 + 7;
    late.checksum = stateHash(late.sim);
    const r = fromSave(JSON.stringify(late));
    if (!r.ok) throw new Error(r.code);
    expect(step(r.sim, { kind: 'advance', minutes: 0 }, { defs: LIFE_DEFS }).game.moneyCents - r.sim.game.moneyCents).toBe(3 * 70_000);
  });
  it('фікстура v2 (main) завантажується, і serialize → fromSave дає той самий стан (round-trip уже у v3)', () => {
    const r = fromSave(JSON.stringify(v2), { life: LIFE });
    if (!r.ok) throw new Error(r.code);
    const again = fromSave(serialize(r.sim), { life: LIFE });
    expect(again.ok && again.fromVersion).toBe(3);
    expect(again.ok && stateHash(again.sim)).toBe(stateHash(r.sim));
  });
  it('фікстура v3 — той самий стан, що й живий прогін (сюжет + календар): виплата й відпустка в ній є', () => {
    const live = run(run(run(newSim(SEED, 10_000), LOG.slice(0, 600), { defs: DEFS }), V2_STORY as Input[], { defs: LIFE_DEFS }), V3_LIFE as Input[], { defs: LIFE_DEFS });
    const r = fromSave(JSON.stringify(v3), { life: LIFE });
    expect(r.ok && r.fromVersion).toBe(3);
    // Журнал — як у v2 вище (GAME-84 №1): старий запис «Visit loc.home» удома нове ядро не пише; решта стану збігається.
    expect(r.ok && stateHash({ ...r.sim, journal: null })).toBe(stateHash({ ...live, journal: null }));
    expect(r.ok && r.sim.journal.length).toBe(live.journal.length + 1);   // рівно один старий запис, як у v2 (рецензія PR #21)
    expect(r.ok && r.sim.journal.filter((e) => !(e.type === 'Visit' && e.ref === 'loc.home'))).toEqual(preBalance(live.journal));
    expect(r.ok && r.sim.game.life).toEqual({ paydays: 1, leave: [{ from: 40, days: 3, vacation: 2 }] });
  });
  it('paydaysThrough (закрита формула) = кількість paydayDay ≤ дня, 20 років щодня; і старт після дня виплати', () => {
    for (const cal of [LIFE.calendar, { ...LIFE.calendar, start: '2027-06-26' }, { ...LIFE.calendar, start: '2027-06-25' }]) {
      let k = 0;
      for (let d = 0; d < 366 * 20; d++) {
        while (paydayDay(cal, k) <= d) k++;
        if (paydaysThrough(cal, d) !== k) expect({ start: cal.start, d, got: paydaysThrough(cal, d) }).toEqual({ start: cal.start, d, got: k });
      }
    }
  });
});

describe('пам\'ять NPC у сейві (GAME-48)', () => {
  const live = run(run(newSim(SEED, 10_000), LOG.slice(0, 600), { defs: DEFS }), V2_STORY as Input[], { defs: STORY_DEFS });
  it('serialize → fromSave: пам\'ять та сама, хеш той самий; без поля хеш інший (поле справді в хеші)', () => {
    expect(live.game.npcMemory).toEqual({ 'npc.ann': ['m.biker'] });
    const r = fromSave(serialize(live));
    expect(r.ok && r.sim.game.npcMemory).toEqual(live.game.npcMemory);
    expect(r.ok && stateHash(r.sim)).toBe(stateHash(live));
    expect(stateHash({ ...live, game: { ...live.game, npcMemory: {} } })).not.toBe(stateHash(live));
  });
  it('продовження після завантаження = без перерви: Енн так само пам\'ятає велосипедиста', () => {
    const r = fromSave(serialize(live));
    if (!r.ok) throw new Error(r.code);
    const more: Input[] = [{ type: 'Continue' }, { type: 'Continue' }, { type: 'Talk', npcId: 'npc.ann' }, { type: 'Choose', choice: 5 }]
      .map((c, i) => ({ kind: 'command', command: { ...c, commandId: `after${i}` } }) as Input);
    const a = run(r.sim, more, { defs: STORY_DEFS });
    expect(a.game.dialogue).toEqual({ id: 'dlg.ann', node: 'gossip' });          // вибір «пам'ятає» прийнято
    expect(stateHash(a)).toBe(stateHash(run(live, more, { defs: STORY_DEFS })));
  });
});

describe('повний цикл', () => {
  it('serialize → fromSave → той самий відбиток; продовження після завантаження = без перерви', () => {
    const mid = run(newSim(SEED, 10_000), LOG.slice(0, 1500), { defs: DEFS });
    const r = fromSave(serialize(mid));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(stateHash(r.sim)).toBe(stateHash(mid));
    const whole = run(newSim(SEED, 10_000), LOG, { defs: DEFS });
    expect(stateHash(run(r.sim, LOG.slice(1500), { defs: DEFS }))).toBe(stateHash(whole));
  });
});

describe('коди відмов завантаження: кожен має зламаний приклад', () => {
  const good = JSON.parse(serialize(newSim(SEED, 10_000))) as Record<string, unknown> & { sim: { game: Record<string, unknown>; journal: unknown } };
  const withSim = (patch: (s: typeof good) => void): string => { const c = structuredClone(good); patch(c); return JSON.stringify(c); };
  const resum = (c: typeof good): void => { c.checksum = stateHash(c.sim); };
  const cases: [LoadCode, string][] = [
    ['SAVE_PARSE', '{"format":"camplife-save", обрізано'],
    ['SAVE_FORMAT', JSON.stringify({ ...good, format: 'other-game' })],
    ['SAVE_VERSION_UNSUPPORTED', JSON.stringify({ ...good, schemaVersion: SAVE_VERSION + 1 })],
    ['SAVE_CHECKSUM', withSim((c) => { c.sim.game.moneyCents = 999_999_999; })],
    ['SAVE_SHAPE', withSim((c) => { c.sim.game.moneyCents = -5; resum(c); })],
    ['SAVE_CONTENT_MISMATCH', JSON.stringify(v2)],          // v2-фікстура записана на STORY_DEFS; проти «сюжету без q.side» — зникле посилання
  ];
  const story = STORY_DEFS.story as StoryDefs;
  const withoutQuest = (id: string): StoryDefs => ({ ...story, quests: Object.fromEntries(Object.entries(story.quests).filter(([k]) => k !== id)) });
  const OPTS: Partial<Record<LoadCode, { story: StoryDefs }>> = { SAVE_CONTENT_MISMATCH: { story: withoutQuest('q.side') } };

  it('кожен код реєстру покрито прикладом', () => {
    expect(cases.map(([c]) => c).sort()).toEqual([...LOAD_CODES].sort());
  });
  for (const [code, text] of cases) {
    it(`повертає ${code}`, () => {
      const r = fromSave(text, OPTS[code] ?? {});
      expect(r.ok ? 'ok' : r.code).toBe(code);
    });
  }
  it('позитивний контроль: щойно записаний сейв завантажується', () => {
    expect(fromSave(JSON.stringify(good)).ok).toBe(true);
    // і з пам'яттю правильної форми (відсортовано, без повторів) — теж
    expect(fromSave(withSim((c) => { c.sim.game.npcMemory = { 'npc.ann': ['m.a', 'm.b'], 'npc.bob': [] }; resum(c); })).ok).toBe(true);
  });
  // Рецензія GAME-33: форма елементів, не лише контейнерів (контрольну суму підробник перерахує сам).
  for (const [what, patch] of [
    ['grant не рядок', (c: typeof good) => { c.sim.game.grants = [42]; }],
    ['запис processed без fp', (c: typeof good) => { c.sim.game.processed = { c0: { ok: true } }; }],
    ['відмова в processed із кодом не з реєстру', (c: typeof good) => { c.sim.game.processed = { c0: { ok: false, fp: 'x', code: 42 } }; }],
    ['квест з невідомим статусом', (c: typeof good) => { c.sim.game.quests = { 'ST-001': { status: 'won', done: [] } }; }],
    ['персонаж без транспорту', (c: typeof good) => { c.sim.game.player = { profileId: 'profile.a', animalId: 'animal.none', locationId: null }; }],
    ['запис processed — null (без перевірки об\'єкта — виняток, а не код)', (c: typeof good) => { c.sim.game.processed = { c0: null }; }],
    ['запис журналу невідомого типу (рецензія GAME-32)', (c: typeof good) => { c.sim.journal = [{ at: 0, commandId: 'c0', type: 'Teleport', ref: null }]; }],
    ['баланс у записі журналу від\'ємний (GAME-106)', (c: typeof good) => { c.sim.journal = [{ at: 0, commandId: 'c0', type: 'Visit', ref: null, cents: -1 }]; }],
    ['баланс у записі журналу — рядок (GAME-106)', (c: typeof good) => { c.sim.journal = [{ at: 0, commandId: 'c0', type: 'Visit', ref: null, cents: '5' }]; }],
    ['без зерна світу (GAME-46)',(c: typeof good) => { delete (c.sim as Record<string, unknown>).worldSeed; }],
    ['зерно світу поза uint32 (GAME-46)', (c: typeof good) => { (c.sim as Record<string, unknown>).worldSeed = 2 ** 32; }],
    ['без пам\'яті NPC (GAME-48)', (c: typeof good) => { delete c.sim.game.npcMemory; }],
    ['пам\'ять NPC — масив, а не об\'єкт', (c: typeof good) => { c.sim.game.npcMemory = []; }],
    ['факт пам\'яті не рядок', (c: typeof good) => { c.sim.game.npcMemory = { 'npc.ann': [42] }; }],
    ['факти пам\'яті не відсортовано', (c: typeof good) => { c.sim.game.npcMemory = { 'npc.ann': ['m.b', 'm.a'] }; }],
    ['факт пам\'яті двічі', (c: typeof good) => { c.sim.game.npcMemory = { 'npc.ann': ['m.a', 'm.a'] }; }],
    ['без навичок (GAME-72)', (c: typeof good) => { delete (c.sim.game as Record<string, unknown>).skills; }],
    ['навичок сім, а не вісім', (c: typeof good) => { c.sim.game.skills = Object.fromEntries(Object.entries(c.sim.game.skills as Record<string, number>).filter(([k]) => k !== 'skill.cooking')); }],
    ['невідома навичка', (c: typeof good) => { c.sim.game.skills = { ...(c.sim.game.skills as Record<string, number>), 'skill.swimming': 1 }; }],
    ['досвід від\'ємний', (c: typeof good) => { c.sim.game.skills = { ...(c.sim.game.skills as Record<string, number>), 'skill.camping': -1 }; }],
    ['досвід дробовий', (c: typeof good) => { c.sim.game.skills = { ...(c.sim.game.skills as Record<string, number>), 'skill.camping': 1.5 }; }],
    ['без практики', (c: typeof good) => { delete (c.sim.game as Record<string, unknown>).practice; }],
    ['лічильник практики 0', (c: typeof good) => { c.sim.game.practice = { 'visit:loc.a': 0 }; }],
    ['лічильник практики понад насичення', (c: typeof good) => { c.sim.game.practice = { 'visit:loc.a': 13 }; }],
  ] as const) {
    it(`SAVE_SHAPE: ${what}`, () => {
      const r = fromSave(withSim((c) => { patch(c); resum(c); }));
      expect(r.ok ? 'ok' : r.code).toBe('SAVE_SHAPE');
    });
  }
  it('accountId у v1 завжди null (OD-008: без мережі)', () => {
    expect(good.accountId).toBeNull();
  });
});

describe('сейв проти нинішнього контенту (рецензія TL: сейв зі зниклим квестом застрягав назавжди)', () => {
  const story = STORY_DEFS.story as StoryDefs;
  const live = run(run(newSim(SEED, 10_000), LOG.slice(0, 600), { defs: DEFS }), V2_STORY as Input[], { defs: STORY_DEFS });
  const json = serialize(live, 'rev-old');

  it('кожен вид зниклого посилання — названо', () => {
    const drop = <K extends keyof StoryDefs>(k: K, id: string): StoryDefs => ({ ...story, [k]: Object.fromEntries(Object.entries(story[k] as object).filter(([x]) => x !== id)) });
    expect(danglingRefs(live.game, drop('quests', 'q.mid'))).toEqual(['quest q.mid']);
    expect(danglingRefs(live.game, drop('profiles', 'profile.a'))).toEqual(['profile profile.a']);
    expect(danglingRefs(live.game, { ...story, transports: ['transport.car'] })).toEqual(['transport transport.bike']);
    expect(danglingRefs(live.game, drop('locations', 'loc.shop'))).toEqual(['location loc.shop']);
    expect(danglingRefs(live.game, story)).toEqual([]);
    // квест є, але вже не для цього гравця (велосипедист, q.side тепер лише для авто)
    const sideCar: StoryDefs = { ...story, quests: { ...story.quests, 'q.side': { ...(story.quests['q.side'] as StoryDefs['quests'][string]), when: { transports: ['transport.car'] } } } };
    const sideActive = { ...live.game, quests: { ...live.game.quests, 'q.side': { status: 'active' as const, done: [] } } };
    expect(danglingRefs(sideActive, sideCar)).toEqual(['quest q.side (when)']);
    // пара, яку контент більше не дозволяє: profile.a тепер лише авто
    expect(danglingRefs(live.game, { ...story, profiles: { ...story.profiles, 'profile.a': { transports: ['transport.car'] } } })).toEqual(['profile profile.a × transport.bike']);
  });

  it('позитивний контроль: сумісне оновлення (новий квест, інший відбиток) сейв НЕ відкидає', () => {
    const grown: StoryDefs = { ...story, quests: { ...story.quests, 'q.new': { optional: true, end: false, objectives: [], transitions: [] } } };
    const r = fromSave(json, { story: grown });
    expect(r.ok && r.contentRev).toBe('rev-old');
  });

  it('без сюжету (як у вічних фікстурах) — перевірка посилань не виконується', () => {
    expect(fromSave(JSON.stringify(v2)).ok).toBe(true);
  });
});
