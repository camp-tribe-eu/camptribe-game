// GAME-144 · Розділ 1, день 3 «Не зовсім за планом» (R1-04). На справжньому контенті:
//  · порядок дня 3: CH1-D2-FIRE-001 (межа дня 2, НЕ кінець) → CH1-D3-001 → CH1-D3-GEAR-001 → CH1-D3-ELISE-001 → CH1-D3-RETURN-001
//    → CH1-D3-HOME-001 (`end` + `dayEnd`): кінець розділу — удома;
//  · Спосіб перевірки 1: справне спорядження → нейтральна сцена; мутація «примусова поломка» (мокрий / зношений намет чи спальник
//    у руках) → інший текст, і до нього є справжня дія ядра (DryGear) — жодної кнопки, що нічого не робить;
//  · Спосіб перевірки 2: chapter1_complete — ПОХІДНЕ від квесту-кінця (chapterComplete); мутація «прапорець без квесту» →
//    розділ не «пройдений», сейв знову відкривається; рівність campaignEnded === chapterComplete на всіх досяжних станах дня 3;
//  · кожна дозволена комбінація профіль × транспорт × тварина проходить день 3 до кінця, тупиків 0;
//  · сумісність: сейв, що закінчив розділ на дні 2 (до GAME-144), вантажиться й продовжується днем 3 (мета «ранок» зарахована);
//  · W5 «Не залишати слідів до 11:00» стартує на CH1-D3-001 для кожної комбінації й гасне, щойно етап минув; кінець від неї не залежить;
//  · Еліза дякує за прибрані пакети (f.litter-cleaned-ch1) лише тим, хто їх прибрав; сам вчинок — запис журналу Interact.
import { describe, expect, it } from 'vitest';
import { dispatch, type Command } from '../core/commands';
import type { CoreDefs } from '../core/defs';
import { CONDITION_MAX, GEAR_SCENE_VARIANTS, gearIssue, gearOf } from '../core/gear';
import { fromSave, reopenChapter, serialize } from '../core/save';
import { newSim, step, type SimState } from '../core/sim';
import { initialState, type GameState } from '../core/state';
import { chapterComplete } from '../core/story';
import { GEAR_CHECK_VARIANTS } from '../../scripts/validator/codes.mjs';
import { enumerateCombos } from '../../scripts/validator/combos.mjs';
import { objectiveKey, storyOffer } from '../view/story-offer';
import { endReachable, type EndMemo } from './bot';
import { pendingWave, storyMoves } from './director';
import { moves, type Move } from './moves';
import { GAME_DEFS } from './slice-defs';
import { CONTENT, STORY } from './story';
import flags from '../../content/flags.json';
import EN from '../../content/locales/en.json';
import UK from '../../content/locales/uk.json';

const LOCALES: Record<string, Record<string, string>> = { uk: UK, en: EN };

const ELISE = 'npc.elise';
const LITTER = 'f.litter-cleaned-ch1';
const W5 = 'wave.ch1-day3-checkout';
const DAY3 = ['CH1-D3-001', 'CH1-D3-GEAR-001', 'CH1-D3-ELISE-001', 'CH1-D3-RETURN-001', 'CH1-D3-HOME-001'] as const;
const END = 'CH1-D3-HOME-001';

let n = 0;
function play(ms: readonly Move[], from: GameState, defs: CoreDefs = GAME_DEFS): GameState {
  let s = from;
  for (const m of ms) {
    const r = dispatch(s, { ...m, commandId: `d3-${n++}` } as Command, defs);
    if (!r.ok) throw new Error(`${JSON.stringify(m)} → ${r.code}`);
    s = r.state;
  }
  return s;
}
const talk: Move = { type: 'Talk', npcId: ELISE };
const choose = (choice: number): Move => ({ type: 'Choose', choice });
const next: Move = { type: 'Continue' };
const done = (questId: string): Move => ({ type: 'CompleteQuest', questId });
const visit = (locationId: string): Move => ({ type: 'Visit', locationId });

interface Combo { profile: string | null; transport: string | null; animal: string }
const COMBOS = (enumerateCombos(CONTENT) as Combo[]).filter((c): c is Combo & { profile: string; transport: string } => c.profile !== null && c.transport !== null);

/** Дні 1 і 2 для будь-якої дозволеної комбінації (намет і спальник у руках): до межі дня 2 — CH1-D2-FIRE-001 завершено. */
function afterDay2(c: { profile: string; transport: string; animal: string }, defs: CoreDefs = GAME_DEFS): GameState {
  const create: Move = { type: 'CreateCharacter', profileId: c.profile, transportId: c.transport, ...(c.animal === 'animal.none' ? {} : { animalId: c.animal }) } as Move;
  const bike = c.transport === 'transport.bike';
  // Перша розмова з Елізою: велосипед — hello.c1 → bike → intro → spot; інші — hello.c2 → intro → spot; далі намет (spot.c1).
  const meet: Move[] = bike ? [talk, choose(0), next, next, choose(0), next] : [talk, choose(1), next, choose(0), next];
  const day1: Move[] = [
    create, done('PROLOGUE-HOME-001'), done('ST-001'), done('ST-002'),
    visit('loc.shop'), { type: 'Pickup', itemId: 'item.tent' }, { type: 'Pickup', itemId: 'item.sleeping-bag' }, done('ST-003'),
    visit('loc.home'), done('CH1-HOME-001'), visit('loc.road'), done('ST-004'), visit('loc.camp.lake'),
    ...meet, { type: 'Pickup', itemId: 'item.firewood' }, done('ST-005'),
  ];
  // День 2 (GAME-141): ранок → «Доброго ранку!» (по-своєму) → вечеря просто → вогнище.
  const day2: Move[] = [
    done('CH1-D2-001'), talk, choose(10), choose(1), next, done('CH1-D2-ELISE-001'),
    talk, choose(13), choose(0), next, next, done('CH1-D2-CAMP-001'), done('CH1-D2-FIRE-001'),
  ];
  const s = play([...day1, ...day2], initialState(5_000), defs);
  expect(s.quests['CH1-D2-FIRE-001']?.status).toBe('completed');
  expect(s.quests['CH1-D3-001']?.status).toBe('active');
  expect(s.campaignEnded).toBe(false);
  return s;
}
/** День 3 до кінця: ранок, речі, прощання (goodbye.c1), дорога, дім. */
const DAY3_MOVES: readonly Move[] = [
  done('CH1-D3-001'), done('CH1-D3-GEAR-001'),
  talk, choose(14), next, choose(0), next, next, done('CH1-D3-ELISE-001'),
  visit('loc.road'), done('CH1-D3-RETURN-001'), visit('loc.home'), done(END),
];
const FAMILY = { profile: 'profile.family-teen', transport: 'transport.car', animal: 'animal.cat' };
const simOf = (game: GameState): SimState => ({ ...newSim(1, 5_000), game });
const rawObjective = (quest: string, id: string) => (CONTENT.quests.find((q) => q.id === quest) as { objectives: { id: string; textKey?: string; gearCheck?: boolean }[] }).objectives.find((o) => o.id === id);

describe('день 3 — порядок і межі (GAME-144)', () => {
  it('вогнище — межа дня 2, не кінець; кінець розділу — CH1-D3-HOME-001 (`end` + `dayEnd`); ланцюг дня 3 без розгалужень', () => {
    expect([STORY.quests['CH1-D2-FIRE-001']?.dayEnd, STORY.quests['CH1-D2-FIRE-001']?.end ?? false]).toEqual([true, false]);
    expect([STORY.quests[END]?.dayEnd, STORY.quests[END]?.end]).toEqual([true, true]);
    expect(Object.entries(STORY.quests).filter(([, q]) => q.end).map(([id]) => id)).toEqual([END]);
    const chain = ['CH1-D2-FIRE-001', ...DAY3];
    for (let i = 0; i + 1 < chain.length; i++) expect(STORY.quests[chain[i] as string]?.transitions.map((t) => t.to), chain[i]).toEqual([chain[i + 1]]);
    expect(STORY.quests[END]?.transitions).toEqual([]);
    for (const id of DAY3) expect(STORY.quests[id]?.optional, id).toBe(false);
  });

  it('усі комбінації профіль × транспорт × тварина: день 3 до кінця тим самим сценарієм; з межі дня 2 кінець досяжний (тупиків 0)', () => {
    expect(COMBOS.length).toBeGreaterThanOrEqual(3);
    const memo: EndMemo = new Map();
    for (const c of COMBOS) {
      const at = afterDay2(c);
      expect(endReachable(at, GAME_DEFS, memo, 20_000), JSON.stringify(c)).toBe(true);
      const end = play(DAY3_MOVES, at);
      expect(end.campaignEnded, JSON.stringify(c)).toBe(true);
      expect(chapterComplete(end, STORY)).toBe(true);
      expect(DAY3.map((id) => end.quests[id]?.status)).toEqual(DAY3.map(() => 'completed'));
      expect(end.player?.locationId).toBe('loc.home');
      expect(storyOffer(simOf(end), GAME_DEFS).offer.stage).toBe('ended');
    }
  });
});

describe('Спосіб перевірки 1: проблема за ФАКТИЧНИМ станом спорядження', () => {
  const at = () => play([done('CH1-D3-001')], afterDay2(FAMILY));
  const key = (s: GameState, id: 'check-gear' | 'check-gear-solo' = 'check-gear') => objectiveKey(rawObjective('CH1-D3-GEAR-001', id), id, s, GAME_DEFS);
  const NEUTRAL = 'q.ch1-d3-gear-001.o1';
  const withGear = (s: GameState, gear: GameState['gear']): GameState => ({ ...s, gear });

  it('перелік варіантів сцени — один і той самий у ядрі й валідаторі', () => {
    expect([...GEAR_SCENE_VARIANTS].sort()).toEqual([...GEAR_CHECK_VARIANTS].sort());
  });

  it('справне спорядження (сухе, стан 100) → нейтральна сцена; мутація «примусова поломка» → інший текст (цей тест червоніє)', () => {
    const s = at();
    expect(s.quests['CH1-D3-GEAR-001']?.status).toBe('active');
    expect(gearIssue(s, GAME_DEFS.items)).toBeNull();
    expect(key(s)).toBe(NEUTRAL);
    // Мутації стану речей у руках — кожна дає СВІЙ варіант, і жодна — нейтральний.
    const cases: [GameState['gear'], string][] = [
      [{ 'item.tent': { condition: CONDITION_MAX, wet: true } }, 'tent-wet'],
      [{ 'item.tent': { condition: CONDITION_MAX - 10, wet: false } }, 'tent-worn'],
      [{ 'item.sleeping-bag': { condition: CONDITION_MAX, wet: true } }, 'sleeping-bag-wet'],
      [{ 'item.sleeping-bag': { condition: CONDITION_MAX - 10, wet: false } }, 'sleeping-bag-worn'],
      // Порядок: намет раніше за спальник; у межах виду мокре раніше за зношене.
      [{ 'item.tent': { condition: CONDITION_MAX - 10, wet: false }, 'item.sleeping-bag': { condition: CONDITION_MAX, wet: true } }, 'tent-worn'],
      [{ 'item.tent': { condition: CONDITION_MAX - 10, wet: true }, 'item.sleeping-bag': { condition: CONDITION_MAX - 50, wet: true } }, 'tent-wet'],
    ];
    for (const [gear, variant] of cases) {
      const m = withGear(s, gear);
      expect(key(m), variant).toBe(`${NEUTRAL}.${variant}`);
      expect(key(m)).not.toBe(NEUTRAL);
      // Текст варіанта є обома мовами (валідатор LOCALE_MISSING стереже те саме; тут — на екрані гравця).
      for (const lang of ['uk', 'en']) expect(LOCALES[lang]?.[key(m)], `${lang} ${variant}`).toBeTruthy();
    }
    // Соло-профіль — свій ключ (o2), ті самі варіанти.
    expect(key(withGear(s, { 'item.tent': { condition: CONDITION_MAX, wet: true } }), 'check-gear-solo')).toBe('q.ch1-d3-gear-001.o2.tent-wet');
  });

  it('стан речі, якої вже немає в руках, сцени не змінює; без намету й спальника — завжди нейтральна', () => {
    const s = at();
    const gone = withGear({ ...s, inventory: { ...s.inventory, 'item.tent': 0 } }, { 'item.tent': { condition: 10, wet: true } });
    expect(key(gone)).toBe(NEUTRAL);
    const none = { ...s, inventory: Object.fromEntries(Object.entries(s.inventory).filter(([id]) => !GAME_DEFS.items[id]?.gear)) };
    expect(key(withGear(none, { 'item.tent': { condition: 10, wet: true }, 'item.sleeping-bag': { condition: 10, wet: true } }))).toBe(NEUTRAL);
  });

  it('жодної кнопки, що нічого не робить: мокре → на екрані ціль-варіант і дія «висушити» (DryGear) → після неї сцена нейтральна', () => {
    const wet = withGear(at(), { 'item.tent': { condition: CONDITION_MAX, wet: true } });
    const { offer, intents } = storyOffer(simOf(wet), GAME_DEFS);
    const gear = offer.quests.find((q) => q.key === 'q.ch1-d3-gear-001');
    expect(gear?.objectives.map((o) => o.key)).toEqual([`${NEUTRAL}.tent-wet`]);
    const dry = offer.actions.filter((a) => a.kind === 'dry');
    expect(dry.map((a) => a.key)).toEqual(['item.tent']);
    const move = intents.get(dry[0]?.id ?? '');
    expect(move?.type).toBe('DryGear');
    const dried = play([move as Move], wet);
    expect(gearOf(dried.gear, 'item.tent').wet).toBe(false);
    expect(key(dried)).toBe(NEUTRAL);
    expect(storyOffer(simOf(dried), GAME_DEFS).offer.actions.some((a) => a.kind === 'dry')).toBe(false);
    // Справне спорядження — «висушити» не пропонується (кнопки без дії немає), а «далі» (CompleteQuest) є.
    const neutral = storyOffer(simOf(at()), GAME_DEFS).offer;
    expect(neutral.actions.some((a) => a.kind === 'dry')).toBe(false);
    expect(neutral.actions.some((a) => a.kind === 'complete' && a.key === 'q.ch1-d3-gear-001')).toBe(true);
    // Зношений (сухий) намет: сушити нічого — сцена каже «склади акуратно», і єдина дія — «далі».
    const worn = storyOffer(simOf(withGear(at(), { 'item.tent': { condition: CONDITION_MAX - 20, wet: false } })), GAME_DEFS).offer;
    expect(worn.quests.find((q) => q.key === 'q.ch1-d3-gear-001')?.objectives[0]?.key).toBe(`${NEUTRAL}.tent-worn`);
    expect(worn.actions.some((a) => a.kind === 'dry')).toBe(false);
    expect(worn.actions.some((a) => a.kind === 'complete' && a.key === 'q.ch1-d3-gear-001')).toBe(true);
  });
});

describe('Спосіб перевірки 2: chapter1_complete = квест-кінець, не прапорець', () => {
  const DAY_MOVES = new Set(['Talk', 'Choose', 'Continue', 'CompleteQuest', 'DeclineQuest', 'DryGear']);
  /** Ходи дня 3 (без крамниці й пакування — вони не рухають сюжету): розмови, квести, дорога додому. */
  const dayMoves = (s: GameState): Move[] => moves(s, GAME_DEFS).filter((m) => DAY_MOVES.has(m.type) || (m.type === 'Visit' && ['loc.road', 'loc.home', 'loc.camp.lake'].includes(m.locationId)));   // без подій дороги (хід удачі) і крамниці

  it('кінець розділу: campaignEnded стає true лише завершенням CH1-D3-HOME-001; до того — false на кожному кроці', () => {
    let s = afterDay2(FAMILY);
    for (const m of DAY3_MOVES) {
      expect(chapterComplete(s, STORY)).toBe(false);
      expect(s.campaignEnded).toBe(false);
      s = play([m], s);
    }
    expect(s.campaignEnded).toBe(true);
    expect(chapterComplete(s, STORY)).toBe(true);
  });

  it('МУТАЦІЯ «прапорець без квесту»: campaignEnded = true, кінець не завершено → розділ НЕ пройдений (екран грає далі), сейв знову відкрито', () => {
    const at = play([done('CH1-D3-001')], afterDay2(FAMILY));
    const flagged: GameState = { ...at, campaignEnded: true };
    expect(chapterComplete(flagged, STORY)).toBe(false);                       // похідне не вірить прапорцю
    expect(storyOffer(simOf(flagged), GAME_DEFS).offer.stage).toBe('play');    // екран — не «кінець»
    const reopened = reopenChapter(flagged, STORY);
    expect(reopened.campaignEnded).toBe(false);
    expect(reopened.quests).toEqual(at.quests);                                // квестів не чіпає — відкривати нічого
    // Контроль: справжній кінець reopenChapter не чіпає (той самий об'єкт).
    const end = play(DAY3_MOVES, afterDay2(FAMILY));
    expect(reopenChapter(end, STORY)).toBe(end);
    // І навпаки: кінець завершено, прапорця немає — похідне каже «пройдено» (прапорець тут ні до чого).
    expect(chapterComplete({ ...end, campaignEnded: false } as GameState, STORY)).toBe(true);
  });

  it('повний перебір дня 3 (сімейна з кішкою, авто): campaignEnded === chapterComplete на кожному досяжному стані; кінець досяжний звідусіль', () => {
    const start = afterDay2(FAMILY);
    const seen = new Map<string, GameState>();
    const keyOf = (s: GameState) => JSON.stringify([s.quests, s.dialogue, s.player?.locationId, s.flags, s.npcMemory, s.campaignEnded, s.gear]);
    const queue = [start];
    seen.set(keyOf(start), start);
    const back = new Map<string, string[]>();
    const endedKeys: string[] = [];
    let mismatch = 0;
    while (queue.length > 0) {
      const cur = queue.shift() as GameState;
      const k = keyOf(cur);
      if (cur.campaignEnded !== chapterComplete(cur, STORY)) mismatch++;
      if (cur.campaignEnded) { endedKeys.push(k); continue; }
      const outs = dayMoves(cur);
      expect(outs.length, `тупик: ${JSON.stringify([cur.quests, cur.dialogue, cur.player?.locationId])}`).toBeGreaterThan(0);
      for (const m of outs) {
        const r = dispatch(cur, { ...m, commandId: `x${n++}` } as Command, GAME_DEFS);
        if (!r.ok) continue;
        const nk = keyOf(r.state);
        back.set(nk, [...(back.get(nk) ?? []), k]);
        if (!seen.has(nk)) { seen.set(nk, r.state); queue.push(r.state); }
      }
      if (seen.size > 50_000) throw new Error('простір станів дня 3 вибухнув — тест нічого не доводить');
    }
    expect(mismatch, 'станів, де campaignEnded ≠ chapterComplete').toBe(0);
    expect(endedKeys.length).toBeGreaterThan(0);
    expect(seen.size).toBeGreaterThan(20);
    // Кожен стан веде до кінця: зворотна досяжність від усіх станів кінця (повний доказ на цьому переборі, не вибірка).
    const ok = new Set(endedKeys);
    const stack = [...endedKeys];
    for (let k = stack.pop(); k !== undefined; k = stack.pop()) for (const p of back.get(k) ?? []) if (!ok.has(p)) { ok.add(p); stack.push(p); }
    const stuck = [...seen.keys()].filter((k) => !ok.has(k));
    expect(stuck.length, stuck[0] ?? '').toBe(0);
    console.info(`GAME-144 Спосіб 2: станів дня 3 ${seen.size}, кінців ${endedKeys.length}, тупиків 0`);
  }, 120_000);
});

describe('сумісність: сейв, що закінчив розділ на дні 2 (до GAME-144)', () => {
  /** Так виглядав сейв після старого кінця: вогнище завершено, campaignEnded, жодного квесту дня 3. */
  const oldEnded = (): GameState => {
    const s = afterDay2(FAMILY);
    const quests = Object.fromEntries(Object.entries(s.quests).filter(([id]) => !(DAY3 as readonly string[]).includes(id)));
    return { ...s, quests, campaignEnded: true };
  };

  it('reopenChapter: campaignEnded знято, CH1-D3-001 активний, мета «ранок» (і «Мія на списку») зарахована — гравець уже в таборі', () => {
    const old = oldEnded();
    expect(chapterComplete(old, STORY)).toBe(false);
    const re = reopenChapter(old, STORY);
    expect(re.campaignEnded).toBe(false);
    expect(re.quests['CH1-D3-001']).toEqual({ status: 'active', done: ['mia-list', 'morning'] });
    expect(Object.keys(re.quests).filter((id) => (DAY3 as readonly string[]).includes(id))).toEqual(['CH1-D3-001']);
    expect(reopenChapter(re, STORY)).toEqual(re);                                  // ідемпотентно
    expect(endReachable(re, GAME_DEFS, new Map(), 20_000)).toBe(true);
    expect(play(DAY3_MOVES, re).campaignEnded).toBe(true);
  });

  it('через текст сейву: serialize → fromSave зі story — те саме, і далі грається день 3 до кінця', () => {
    const r = fromSave(serialize(simOf(oldEnded())), { story: STORY });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sim.game.campaignEnded).toBe(false);
    expect(r.sim.game.quests['CH1-D3-001']?.status).toBe('active');
    expect(storyOffer(r.sim, GAME_DEFS).offer.stage).toBe('play');
    expect(play(DAY3_MOVES, r.sim.game).campaignEnded).toBe(true);
  });

  it('МУТАЦІЯ: без логіки «старий кінець» (кінець і далі на вогнищі) той самий сейв лишився б пройденим — отже оракул вміє червоніти', () => {
    const fire = STORY.quests['CH1-D2-FIRE-001'];
    const mutated = { ...STORY, quests: { ...STORY.quests, 'CH1-D2-FIRE-001': { ...fire, end: true } } } as typeof STORY;
    const old = oldEnded();
    expect(chapterComplete(old, mutated)).toBe(true);
    expect(reopenChapter(old, mutated)).toBe(old);
  });
});

describe('W5 «Не залишати слідів до 11:00» — на етапі CH1-D3-001', () => {
  const cmd = (s: SimState, m: Move): SimState => step(s, { kind: 'command', command: { ...m, commandId: `w${n++}` } as Command }, { defs: GAME_DEFS });

  it('стартує на ранку дня 3 для кожної комбінації (кішка — 4 справи, інакше 3); до CH1-D3-001 не стартує', () => {
    for (const c of COMBOS) {
      const at = afterDay2(c);
      expect(pendingWave(at, GAME_DEFS), JSON.stringify(c)).toBe(W5);
      const sim = simOf(at);
      const started = storyMoves(sim, GAME_DEFS);
      expect(started).toEqual([{ type: 'StartWave', waveId: W5 }]);
      const live = cmd(sim, started[0] as Move);
      const tasks = Object.keys(live.game.wave?.active?.tasks ?? {}).sort();
      expect(tasks, JSON.stringify(c)).toEqual(c.animal === 'animal.cat' ? ['clean-up', 'mia-carrier-home', 'pack-tent', 'walk-site'] : ['clean-up', 'pack-tent', 'walk-site']);
    }
    // Контроль: етап минув (CH1-D3-001 завершено, далі — речі) — хвилі стартувати нема де.
    const after = play([done('CH1-D3-001')], afterDay2(FAMILY));
    expect(pendingWave(after, GAME_DEFS)).toBeNull();
  });

  it('хвиля не блокує: кінець розділу досяжний і з живою хвилею, і після того, як годинник вирішив справи', () => {
    const sim = simOf(afterDay2(FAMILY));
    const live = cmd(sim, storyMoves(sim, GAME_DEFS)[0] as Move);
    expect(live.game.wave?.active?.waveId).toBe(W5);
    // Етап завершено — хвиля ще жива (ядро нині гасить її лише годинником; «етап минув → усе late» несе GAME-170 зріз 3),
    // і вона нічого не блокує: кінець розділу досяжний з живою хвилею.
    const over = cmd(live, done('CH1-D3-001'));
    expect(over.game.wave?.active?.waveId).toBe(W5);
    expect(over.game.campaignEnded).toBe(false);
    expect(play(DAY3_MOVES.slice(1), over.game).campaignEnded).toBe(true);
    // Годинник минув найдовший строк (55 хв) — усе незроблене late, хвиля закінчена; одна зроблена справа — done.
    const one = cmd(live, { type: 'CompleteTask', taskId: 'pack-tent' });
    const settled = step(one, { kind: 'advance', minutes: 56 }, { defs: GAME_DEFS });
    expect(settled.game.wave?.active).toBeNull();
    expect(settled.game.wave?.past[W5]).toEqual({ 'walk-site': 'late', 'clean-up': 'late', 'pack-tent': 'done', 'mia-carrier-home': 'late' });
    expect(play(DAY3_MOVES, settled.game).campaignEnded).toBe(true);
  });
});

describe('Еліза дякує за прибрані пакети лише тим, хто прибрав (f.litter-cleaned-ch1)', () => {
  const atElise = () => play([done('CH1-D3-001'), done('CH1-D3-GEAR-001')], afterDay2(FAMILY));

  it('без прапорця: прощання → goodbye; з прапорцем: прощання → goodbye-litter → goodbye; мутація «прапорця немає» — подяки немає', () => {
    const plain = play([talk, choose(14)], atElise());
    expect(plain.dialogue).toEqual({ id: 'dlg.elise-greeting', node: 'farewell' });
    expect(play([next], plain).dialogue?.node).toBe('goodbye');
    const thanked = play([talk, choose(14), next], { ...atElise(), flags: [...atElise().flags, LITTER] });
    expect(thanked.dialogue?.node).toBe('goodbye-litter');
    expect(play([next], thanked).dialogue?.node).toBe('goodbye');
    // Подяка — ніколи без прапорця: з кожного стану прощання без LITTER вузол goodbye-litter недосяжний.
    expect(play([talk, choose(14), next, choose(0), next, next], atElise()).dialogue).toBeNull();
    expect(play([talk, choose(14), next, choose(1), next, next], atElise()).dialogue).toBeNull();
  });

  it('вчинок: дотик до obj.litter у таборі ставить прапорець і пише запис журналу Interact; удруге не повторюється', () => {
    const sim = simOf(afterDay2(FAMILY));
    const n0 = sim.journal.length;
    const did = step(sim, { kind: 'command', command: { type: 'Interact', targetId: 'obj.litter', commandId: 'lit-1' } }, { defs: GAME_DEFS });
    expect(did.game.flags).toContain(LITTER);
    expect(did.journal.slice(n0).map((e) => [e.type, e.ref])).toEqual([['Interact', 'obj.litter']]);
    const again = step(did, { kind: 'command', command: { type: 'Interact', targetId: 'obj.litter', commandId: 'lit-2' } }, { defs: GAME_DEFS });
    expect(again.journal.length).toBe(did.journal.length);
    // Прапорець з реєстру: ставить ядро (kind: interaction), читає прощання Елізи.
    const row = (flags as { id: string; kind?: string; reserved?: boolean }[]).find((f) => f.id === LITTER);
    expect(row).toMatchObject({ kind: 'interaction' });
    expect(row?.reserved).toBeUndefined();
  });
});
