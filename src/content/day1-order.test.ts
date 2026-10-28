// GAME-138 (R1-01) · порядок дня 1: PROLOGUE-HOME-001 → ST-001 → ST-002 → ST-003 → CH1-HOME-001 → ST-004 → EV-APPLE-001 → ST-005 →
// CH1-D1-SUMMARY. Без повторного вибору кемпінгу (ST-002) і без повторного знайомства з Елізою.
//
// Що є що в ядрі: PROLOGUE-HOME-001 і CH1-HOME-001 — основні етапи content/quests.json; EV-APPLE-001 — подія в дорозі
// dlg.road-apples (необов'язкова: шанс, тож може й не статись); CH1-D1-SUMMARY — підсумок дня 1 (GAME-106), межа дня — ST-005.
//
// Способи перевірки картки (кожен — із мутацією, що червонить ту саму перевірку, закон 1):
//  1) бот і реплей-еталон проходять послідовність; повторний вибір кемпінгу після ST-002 недосяжний;
//  2) сейв посеред прологу → нова сесія відновлює саме поточний етап;
//  3) з 0 € на старті ST-003 має безкоштовний шлях — кінець розділу досяжний у кожній комбінації.
import { beforeAll, describe, expect, it } from 'vitest';
import { dispatch } from '../core/commands';
import { daySummary, dayEndQuests } from '../core/day-summary';
import { compileGear, GAME_DEFS, RAW_ITEMS } from './slice-defs';
import { storyItems, type CoreDefs, type StoryDefs } from '../core/defs';
import { initialState, type GameState } from '../core/state';
import { changedGame, isJournalType, newSim, step, type JournalEntry, type SimState } from '../core/sim';
import { MAIN_QUEST_ID } from '../core/story';
import { nextInt, seedRng } from '../core/rng';
import { enumerateCombos } from '../../scripts/validator/combos.mjs';
import { createMemoryBackend } from '../platform/save-memory';
import { createSaveSession, type SessionBridge } from '../platform/save-session';
import { endReachable, runBot, variantsFor, type EndMemo, type Variant } from './bot';
import { LIFE } from './life';
import type { Move } from './moves';
import { PROLOGUE_BIKE, SEED, START_MONEY } from './replay.scenario';
import { CONTENT, STORY, STORY_REV, compileStory, type RawContent } from './story';
import { saveViable } from './viability';

/** Етапи дня 1 у порядку картки, з тим, як кожен видно в журналі ядра. */
const ORDER_QUESTS = ['PROLOGUE-HOME-001', 'ST-001', 'ST-002', 'ST-003', 'CH1-HOME-001', 'ST-004', 'ST-005'] as const;
/** GAME-141: основні етапи дня 2 — після межі дня 1; їхній порядок стереже src/content/day2.test.ts. */
const DAY2_QUESTS = ['CH1-D2-001', 'CH1-D2-ELISE-001', 'CH1-D2-CAMP-001', 'CH1-D2-FIRE-001'] as const;
// GAME-144: день 3 — ланцюг до кінця розділу (CH1-D3-HOME-001).
const DAY3_QUESTS = ['CH1-D3-001', 'CH1-D3-GEAR-001', 'CH1-D3-ELISE-001', 'CH1-D3-RETURN-001', 'CH1-D3-HOME-001'] as const;
/** Етапи після межі дня 1 (дні 2 і 3) — порядок дня 1 їх не стосується. */
const isDay2 = (q: string): boolean => (DAY2_QUESTS as readonly string[]).includes(q) || (DAY3_QUESTS as readonly string[]).includes(q);
const APPLE = 'dlg.road-apples';   // EV-APPLE-001
const NO_ANIMAL = 'animal.none';

type Entry = Pick<JournalEntry, 'type' | 'ref'>;

/**
 * Порушення порядку дня 1 у журналі. Порожньо — порядок дотримано.
 * ended — розділ закінчено: тоді всі етапи мусять бути рівно раз і в порядку; інакше — префікс порядку.
 */
function orderViolations(journal: readonly Entry[], ended: boolean): string[] {
  const out: string[] = [];
  const done = journal.filter((e) => e.type === 'CompleteQuest' && e.ref !== null && MAIN_QUEST_ID.test(e.ref) && !isDay2(e.ref)).map((e) => e.ref as string);
  const want = ended ? [...ORDER_QUESTS] : ORDER_QUESTS.slice(0, done.length);
  if (done.join(' → ') !== want.join(' → ')) out.push(`етапи: ${done.join(' → ')} ≠ ${want.join(' → ')}`);
  // EV-APPLE-001 — між ST-004 (дорога відкрита лише після CH1-HOME-001) і ST-005.
  const at = (ref: string): number => journal.findIndex((e) => e.type === 'CompleteQuest' && e.ref === ref);
  const apple = journal.findIndex((e) => e.type === 'RoadEvent' && e.ref === APPLE);
  if (apple >= 0) {
    if (at('CH1-HOME-001') < 0 || apple < at('CH1-HOME-001')) out.push('яблука — раніше за CH1-HOME-001 (до дороги ST-004)');
    // GAME-141: після ST-005 розділ не закінчується — день 2 на тій самій мапі, і подію, що не випала вдень 1, можна зустріти
    // на дорозі вдень 2 (раз за гру, f.seen-*). Це вже подія дня 2 (її показує підсумок дня 2), а не порушення порядку дня 1.
  }
  return out;
}

/** CH1-D1-SUMMARY: підсумок дня 1 завершений рівно тоді, коли завершено ST-005, і межа дня — саме ST-005 (останній етап дня). */
function summaryViolations(sim: Pick<SimState, 'game' | 'journal'>, defs: CoreDefs): string[] {
  const sum = daySummary(sim, 1, defs);
  const ended = sim.game.quests['ST-005']?.status === 'completed';
  if (!sum) return ['підсумку дня 1 немає'];
  if (sum.ended !== ended) return [`підсумок дня 1: ended=${sum.ended}, а ST-005 ${ended ? 'завершено' : 'ні'}`];
  if (!ended) return [];
  const quests = sum.sections.find((x) => x.kind === 'quests')?.ids ?? [];
  if (quests.at(-1) !== 'ST-005') return [`межа дня 1 — ${String(quests.at(-1))}, а не ST-005`];
  // GAME-141: після ST-005 іде день 2, але жоден етап дня 1 у нього не перетікає.
  const day2 = daySummary(sim, 2, defs)?.sections.find((x) => x.kind === 'quests')?.ids ?? [];
  const leaked = day2.filter((q) => (ORDER_QUESTS as readonly string[]).includes(q));
  if (leaked.length) return [`етапи дня 1 у дні 2: ${leaked.join(', ')}`];
  return [];
}

/** Ходи бота → журнал за тим самим правилом, що й sim.step (прийнята команда з переліку, що змінила гру). */
function journalOf(v: Variant, startCents: number, trace: readonly { m: Move; before: GameState; after: GameState }[]): JournalEntry[] {
  const out: JournalEntry[] = [{ at: 0, commandId: 'b0', type: 'CreateCharacter', ref: v.profile, cents: startCents }];
  trace.forEach(({ m, before, after }, i) => {
    if (!isJournalType(m.type) || !changedGame(before, after)) return;
    const r = m as unknown as Record<string, unknown>;
    const ref = r.questId ?? r.locationId ?? r.itemId ?? r.targetId ?? r.eventId;
    out.push({ at: 0, commandId: `t${i}`, type: m.type, ref: typeof ref === 'string' ? ref : null, cents: after.moneyCents });
  });
  return out;
}

interface TracedRun { variant: Variant; verdict: string; final: GameState; trace: { m: Move; before: GameState; after: GameState }[] }

/** Кампанія бота з трасою: той самий генератор варіантів і зерно, що й у bot.test (GAME-37). */
function campaign(defs: CoreDefs, n: number, seed: number, only?: (v: Variant) => boolean, maxSteps = 120): TracedRun[] {
  const variants = variantsFor(enumerateCombos(CONTENT)).filter((v) => !only || only(v));
  const memo: EndMemo = new Map();
  let rng = seedRng(seed);
  const out: TracedRun[] = [];
  for (let i = 0; i < n; i++) {
    const r = nextInt(rng, variants.length);
    rng = r.state;
    const variant = variants[r.value] as Variant;
    const trace: TracedRun['trace'] = [];
    const run = runBot(defs, variant, seed + i, memo, { maxSteps, cap: 20_000, trace: (m, before, after) => trace.push({ m, before, after }) });
    out.push({ variant, verdict: run.verdict, final: run.final, trace });
  }
  return out;
}

const startCents = (v: Variant): number => (v.money === 'some' ? 10_000 : 0);

/** Усі порушення порядку й підсумку в кампанії (для звіту — перші кілька). */
function campaignViolations(runs: readonly TracedRun[], defs: CoreDefs): string[] {
  return runs.flatMap((r, i) => {
    const journal = journalOf(r.variant, startCents(r.variant), r.trace);
    return [...orderViolations(journal, r.final.campaignEnded), ...summaryViolations({ game: r.final, journal }, defs)].map((x) => `прогін ${i}: ${x}`);
  });
}

/**
 * Повторний вибір кемпінгу: ST-002 знову активний після того, як його вже завершили (бот — по кожному ходу траси).
 * Друге знайомство з Елізою: розмова заходила у вузол знайомства (intro) більше одного разу за прогін.
 */
function repeatViolations(runs: readonly TracedRun[]): string[] {
  return runs.flatMap((r, i) => {
    const out = r.trace.flatMap(({ m, before, after }) => (before.quests['ST-002']?.status === 'completed' && after.quests['ST-002']?.status === 'active'
      ? [`прогін ${i}: ${m.type} знову відкрив вибір кемпінгу ST-002`] : []));
    const intros = r.trace.filter(({ before, after }) => after.dialogue?.id === 'dlg.elise-greeting' && after.dialogue.node === 'intro' && before.dialogue?.node !== 'intro').length;
    if (intros > 1) out.push(`прогін ${i}: Еліза знайомиться ${intros} рази`);
    return out;
  });
}

/**
 * Статично, на всьому сюжеті: чи може ST-002 знову стати активним після свого завершення — перехід із будь-якого етапу, досяжного
 * після ST-002, назад у ST-002, або startQuest ST-002 у будь-якій розмові. Повний (не вибірковий) доказ для нинішнього контенту.
 */
function campsiteReentry(st: StoryDefs, quest = 'ST-002'): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const queue = (st.quests[quest]?.transitions ?? []).map((t) => t.to);
  for (let q = queue.shift(); q !== undefined; q = queue.shift()) {
    if (seen.has(q)) continue;
    seen.add(q);
    for (const t of st.quests[q]?.transitions ?? []) {
      if (t.to === quest) out.push(`${q} → ${quest}`);
      queue.push(t.to);
    }
  }
  for (const [id, d] of Object.entries(st.dialogues)) {
    for (const n of Object.values(d.nodes)) for (const c of n.choices ?? []) for (const e of c.effects) if ('startQuest' in e && e.startQuest === quest) out.push(`${id}: startQuest ${quest}`);
  }
  return out;
}

/** Мутація: «передумати» — з CH1-HOME-001 вибором назад до вибору кемпінгу. */
function withCampsiteAgain(c: RawContent): RawContent {
  const m = structuredClone(c);
  m.quests.find((q) => q.id === 'CH1-HOME-001')?.transitions.push({ on: 'complete', to: 'ST-002', choiceKey: 'q.st-002' });
  return m;
}

describe('GAME-138 · порядок дня 1 у контенті', () => {
  it('усі етапи порядку є, основні й без умов; перший — старт гри; межа дня — ST-005 (далі день 2, GAME-141)', () => {
    expect(STORY.start).toBe('PROLOGUE-HOME-001');
    for (const q of ORDER_QUESTS) {
      expect(STORY.quests[q], q).toBeDefined();
      expect(STORY.quests[q]?.optional, q).toBe(false);
      expect(STORY.quests[q]?.when, q).toBeUndefined();
    }
    // Ланцюг за замовчуванням (перехід без вибору) — саме порядок картки.
    const chain: string[] = [STORY.start];
    for (let q = STORY.quests[STORY.start]; q && !q.end; q = STORY.quests[chain.at(-1) as string]) {
      const next = q.transitions.find((t) => t.on === 'complete' && !t.choice && !t.when)?.to;
      if (!next) break;
      chain.push(next);
    }
    expect(chain).toEqual([...ORDER_QUESTS, ...DAY2_QUESTS, ...DAY3_QUESTS]);
    expect([...dayEndQuests(GAME_DEFS)]).toEqual(['ST-005', 'CH1-D2-FIRE-001', 'CH1-D3-HOME-001']);   // GAME-144: три межі дня
    expect(STORY.quests['ST-005']?.end).toBe(false);                                     // межа дня 1 — не кінець розділу
    // EV-APPLE-001 — подія лише на дорозі, а дорога відкривається після CH1-HOME-001: яблука не трапляються раніше за ST-004.
    expect(STORY.dialogues[APPLE]?.trigger?.at).toEqual(['loc.road']);
    expect(STORY.locations['loc.road']?.unlockedBy).toBe('CH1-HOME-001');
  });

  it('кожен id основного етапу проходить перевірку ядра (інакше CompleteQuest — INVALID_COMMAND); формат не пропускає сміття', () => {
    expect(Object.keys(STORY.quests).filter((q) => !q.startsWith('q.') && !MAIN_QUEST_ID.test(q))).toEqual([]);
    for (const bad of ['st-001', 'ST-1', 'PROLOGUE_HOME-001', 'CH1-HOME', '-001', 'ST-001x']) expect(MAIN_QUEST_ID.test(bad), bad).toBe(false);
  });
});

describe('GAME-138 · Спосіб перевірки 1: бот і реплей проходять порядок дня 1', () => {
  const N = 600;
  let runs: TracedRun[] = [];
  beforeAll(() => { runs = campaign(GAME_DEFS, N, 20261023); }, 300_000);

  it(`бот (${N} прогонів, усі варіанти): порядок етапів, яблука між ST-004 і ST-005, підсумок дня 1 — на ST-005; тупиків 0`, () => {
    expect(campaignViolations(runs, GAME_DEFS).slice(0, 5)).toEqual([]);
    expect(runs.filter((r) => r.verdict === 'softlock' || r.verdict === 'unknown')).toEqual([]);
    // GAME-141: розділ дводенний — за 120 ходів прогулянка доходить до кінця дня 1, а кінця розділу — рідко. Порядок дня 1
    // перевіряється саме на прогонах, що пройшли межу дня 1.
    const ended = runs.filter((r) => r.final.quests['ST-005']?.status === 'completed');
    expect(ended.length).toBeGreaterThan(N / 10);                                       // перевірка бачила саме дійшлі до кінця дня 1 прогони
    expect(ended.some((r) => r.trace.some(({ m }) => m.type === 'RoadEvent'))).toBe(true);   // і з яблуками, і без
    // GAME-108: подія дня 2 (її можна зустріти на дорозі вдень 2) — не порушення порядку дня 1; рахуємо лише події до межі дня 1.
    expect(ended.some((r) => !r.trace.some(({ m, before }) => m.type === 'RoadEvent' && before.quests['ST-005']?.status !== 'completed'))).toBe(true);
  });

  it('реплей-еталон (tests/replays, симуляція з годинником і кидками): журнал іде порядком дня 1, підсумок дня 1 завершено на ST-005', () => {
    let s = newSim(SEED, START_MONEY);
    for (const i of PROLOGUE_BIKE) s = step(s, i, { defs: GAME_DEFS });
    expect(s.game.campaignEnded).toBe(true);
    expect(orderViolations(s.journal, true)).toEqual([]);
    expect(summaryViolations(s, GAME_DEFS)).toEqual([]);
  });

  it('повторний вибір кемпінгу після ST-002 недосяжний: ні в графі сюжету, ні в жодному ході бота; Еліза не знайомиться вдруге', () => {
    expect(campsiteReentry(STORY)).toEqual([]);
    expect(repeatViolations(runs).slice(0, 5)).toEqual([]);
    const st002 = runs.flatMap((r) => r.trace.filter(({ m }) => m.type === 'CompleteQuest' && m.questId === 'ST-002')).length;
    expect(st002).toBeLessThanOrEqual(runs.length);                                    // ST-002 завершується не більше разу за прогін
    expect(runs.every((r) => r.trace.filter(({ m }) => m.type === 'CompleteQuest' && m.questId === 'ST-002').length <= 1)).toBe(true);
  });

  it('МУТАЦІЯ: перехід CH1-HOME-001 → ST-002 («обрати кемпінг ще раз») — граф, бот і порядок червоніють', () => {
    const mut = withCampsiteAgain(CONTENT);
    const story = compileStory(mut);
    expect(campsiteReentry(story)).toEqual(['CH1-HOME-001 → ST-002']);
    const defs: CoreDefs = { ...GAME_DEFS, story };
    const bad = campaign(defs, 300, 20261023, (v) => v.side === 'take');
    expect(repeatViolations(bad).length).toBeGreaterThan(0);
    expect(campaignViolations(bad, defs).length).toBeGreaterThan(0);
  }, 300_000);   // GAME-144: розділ триденний — 300 прогонів бота з пошуком кінця з мутованого графа заміряно > 120 с під навантаженням

  it('МУТАЦІЯ: привітання Елізи без умови «ще не знайомі» (hello.c2 без notFlag f.elise-met) — бот бачить друге знайомство', () => {
    const mut = structuredClone(CONTENT);
    const hello = mut.dialogues.find((d) => d.id === 'dlg.elise-greeting')?.nodes.find((n) => n.id === 'hello');
    const c2 = hello?.choices?.[1];
    expect(c2?.when).toEqual({ notFlag: 'f.elise-met' });                              // мутуємо саме ту умову, яку думаємо
    if (c2) delete c2.when;
    const bad = campaign({ ...GAME_DEFS, story: compileStory(mut) }, 300, 20261023);
    expect(repeatViolations(bad).filter((x) => x.includes('Еліза')).length).toBeGreaterThan(0);
  }, 120_000);

  it('МУТАЦІЯ: ST-003 веде просто в ST-004 (етап пакування CH1-HOME-001 випав) — порядок червоніє', () => {
    const mut = structuredClone(CONTENT);
    const st003 = mut.quests.find((q) => q.id === 'ST-003');
    if (st003) st003.transitions = [{ on: 'complete', to: 'ST-004' }];
    const loc = mut.locations.find((l) => l.id === 'loc.road');
    if (loc) loc.unlockedBy = 'ST-003';
    const defs: CoreDefs = { ...GAME_DEFS, story: compileStory(mut) };
    expect(campaignViolations(campaign(defs, 100, 20261023), defs).length).toBeGreaterThan(0);
  }, 120_000);

  it('НЕГАТИВНИЙ КОНТРОЛЬ перевірок журналу: яблука до пакування, етап двічі, межа дня не ST-005 — кожне червоніє', () => {
    const j = (refs: string[]): Entry[] => refs.map((r) => (r === APPLE ? { type: 'RoadEvent', ref: r } : { type: 'CompleteQuest', ref: r }));
    expect(orderViolations(j([...ORDER_QUESTS]), true)).toEqual([]);
    expect(orderViolations(j(['PROLOGUE-HOME-001', 'ST-001', 'ST-002', 'ST-003', APPLE, 'CH1-HOME-001', 'ST-004', 'ST-005']), true).length).toBeGreaterThan(0);
    expect(orderViolations(j(['PROLOGUE-HOME-001', 'ST-001', 'ST-002', 'ST-002', 'ST-003', 'CH1-HOME-001', 'ST-004', 'ST-005']), true).length).toBeGreaterThan(0);
    expect(orderViolations(j(['ST-001', 'ST-002']), false).length).toBeGreaterThan(0);
    let s = newSim(SEED, START_MONEY);
    for (const i of PROLOGUE_BIKE) s = step(s, i, { defs: GAME_DEFS });
    const story = GAME_DEFS.story as StoryDefs;
    const st005: StoryDefs['quests'][string] = { ...(story.quests['ST-005'] as StoryDefs['quests'][string]) };
    delete (st005 as { dayEnd?: true }).dayEnd;
    const shifted: CoreDefs = { ...GAME_DEFS, story: { ...story, quests: { ...story.quests, 'ST-005': st005, 'ST-004': { ...(story.quests['ST-004'] as StoryDefs['quests'][string]), dayEnd: true } } } };
    expect(summaryViolations(s, shifted).length).toBeGreaterThan(0);
  });
});

describe('GAME-138 · Спосіб перевірки 2: перерваний пролог (сейв → нова сесія) відновлює поточний етап', () => {
  /** Місток як у грі, з пам'яттю замість світу. resetOnLoad — мутація «квест скидається при завантаженні». */
  function bridge(resetOnLoad = false): SessionBridge & { sim: SimState } {
    const b = {
      sim: newSim(1, 5_000), sent: 0,
      get state() { return b.sim; },
      load(s: SimState) { b.sim = resetOnLoad ? { ...s, game: { ...s.game, quests: { [STORY.start]: { status: 'active' as const, done: [] } } } } : s; },
      restart() { b.sim = newSim(1, 5_000); },
      setPaused() {},
    };
    return b;
  }
  const content = { story: STORY, life: LIFE, contentRev: STORY_REV, viable: (g: GameState) => saveViable(g, GAME_DEFS) };
  const active = (g: GameState): string[] => Object.entries(g.quests).filter(([, p]) => p.status === 'active').map(([q]) => q).sort();

  /** Стан посеред прологу: команди до точки переривання, справжньою симуляцією. */
  function upTo(n: number): SimState {
    let s = newSim(SEED, START_MONEY);
    let commands = 0;
    for (const i of PROLOGUE_BIKE) {
      if (i.kind === 'command' && commands++ >= n) break;
      s = step(s, i, { defs: GAME_DEFS });
    }
    return s;
  }
  // Точки: щойно створено (PROLOGUE-HOME-001), після прологу вдома (ST-001), у крамниці (ST-003), удома на пакуванні (CH1-HOME-001).
  const CUTS = [1, 2, 5, 11];

  /** Перервати в точці й відкрити нову сесію: що відновилось. */
  async function interrupt(n: number, resetOnLoad: boolean): Promise<{ before: GameState; after: GameState }> {
    const backend = createMemoryBackend();
    const first = bridge();
    const s1 = createSaveSession(first, backend, content);
    await s1.start();
    first.sim = upTo(n);
    expect(await s1.save()).toBe(true);
    const second = bridge(resetOnLoad);
    await createSaveSession(second, backend, content).start();
    return { before: first.sim.game, after: second.sim.game };
  }

  it('точки переривання справді посеред прологу, кожна — на іншому етапі (інакше перевірка порожня)', () => {
    expect(CUTS.map((n) => active(upTo(n).game).join(','))).toEqual(['PROLOGUE-HOME-001', 'ST-001', 'ST-003', 'CH1-HOME-001']);
  });

  for (const n of CUTS) {
    it(`після ${n} команд: нова сесія — той самий поточний етап і ті самі виконані цілі; далі пролог доходить до кінця`, async () => {
      const { before, after } = await interrupt(n, false);
      expect(active(after)).toEqual(active(before));
      expect(after.quests).toEqual(before.quests);
      expect(after.player).toEqual(before.player);
      expect(endReachable(after, GAME_DEFS, new Map(), 20_000)).toBe(true);
    });
  }

  it('МУТАЦІЯ: квест скидається при завантаженні — та сама перевірка червоніє', async () => {
    const { before, after } = await interrupt(5, true);
    expect(active(before)).toEqual(['ST-003']);
    expect(active(after)).not.toEqual(active(before));
  });
});

describe('GAME-138 · Спосіб перевірки 3: 0 € на старті — ST-003 має безкоштовний шлях, кінець розділу досяжний', () => {
  const create = (defs: CoreDefs, money: number, k: { profile: string | null; transport: string | null; animal: string }): GameState => {
    const r = dispatch(initialState(money), {
      type: 'CreateCharacter', commandId: 'z0', profileId: k.profile ?? '', transportId: k.transport ?? '', ...(k.animal === NO_ANIMAL ? {} : { animalId: k.animal }),
    }, defs);
    if (!r.ok) throw new Error(r.code);
    return r.state;
  };
  const combos = enumerateCombos(CONTENT);

  /** Мутація: намет і спальник більше не лежать у крамниці (не «взяти»), лише продаються — безкоштовного шляху немає. */
  function paidOnly(): CoreDefs {
    const mut = structuredClone(CONTENT);
    const shop = mut.locations.find((l) => l.id === 'loc.shop');
    if (shop) shop.items = (shop.items ?? []).filter((i) => i !== 'item.tent' && i !== 'item.sleeping-bag');
    const story = compileStory(mut);
    const free = new Set([...storyItems(story)].filter((i) => i !== 'item.tent' && i !== 'item.sleeping-bag'));
    return { ...GAME_DEFS, story, items: { ...GAME_DEFS.items, ...compileGear(RAW_ITEMS, free) } };
  }

  it('кожна комбінація з 0 € доходить до кінця розділу (повний пошук від створення персонажа)', () => {
    expect(combos.length).toBeGreaterThan(1);
    for (const k of combos) expect(endReachable(create(GAME_DEFS, 0, k), GAME_DEFS, new Map(), 50_000), JSON.stringify(k)).toBe(true);
  });

  it('бот без грошей (лише варіанти money=none): жодної покупки, тупиків 0, і до кінця доходить', () => {
    const runs = campaign(GAME_DEFS, 200, 20261024, (v) => v.money === 'none', 220);   // GAME-141: два дні — довша прогулянка
    expect(runs.every((r) => r.variant.money === 'none')).toBe(true);
    expect(runs.flatMap((r) => r.trace.filter(({ m }) => m.type === 'BuyItem'))).toEqual([]);
    expect(runs.filter((r) => r.verdict === 'softlock' || r.verdict === 'unknown')).toEqual([]);
    expect(runs.some((r) => r.final.campaignEnded && r.final.quests['ST-003']?.status === 'completed')).toBe(true);
    expect(campaignViolations(runs, GAME_DEFS).slice(0, 3)).toEqual([]);
  }, 300_000);

  it('МУТАЦІЯ: без безкоштовного шляху ST-003 з 0 € кінець недосяжний у кожній комбінації; з 100 € — досяжний (саме гроші, а не зламаний сюжет)', () => {
    const defs = paidOnly();
    for (const k of combos) {
      expect(endReachable(create(defs, 0, k), defs, new Map(), 50_000), `0 € ${JSON.stringify(k)}`).toBe(false);
      expect(endReachable(create(defs, 10_000, k), defs, new Map(), 50_000), `100 € ${JSON.stringify(k)}`).toBe(true);
    }
  });
});
