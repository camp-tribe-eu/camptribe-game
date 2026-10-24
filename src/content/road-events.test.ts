// GAME-108 · події в дорозі розділу 1. Канон радника (ch1-pack-for-coder §2): EV-APPLE-001 (dlg.road-apples) і
// EV-ROAD-002…010 — у коді dlg.ev.ch1.road-002…010 (номер у id = канонічний номер). Короткий зміст:
//  002 «Дощ на повороті» — дощ лише над одним полем; це поливалка фермера (усім);
//  003 «Вказівник із цифрами» — номери велосипедних вузлів замість назв (велосипед);
//  004 «Три однакові ліхтарі» — привал, Джордж перевіряє багажник; спаковано зайві ліхтарі — жарт Метью (родина);
//  005 «Дивна тиша в машині» — Метью помічає тишу; гра «хто перший побачить корову» (родина, авто);
//  006 «Скрип велосипеда» — винуватець — ремінець сумки (велосипед);
//  007 «Вид на озеро» — пагорб, озеро внизу, фото (усім);
//  008 «Загублений список» — список у кишені, куди його поклали, «щоб не загубився» (усім);
//  009 «Сільська крамничка» — «Повернуся за 10 хвилин. Мабуть»; у вітрині головний — кіт (усім);
//  010 «Вітер на відкритій ділянці» — вітер, що теж запізнюється; маки на узбіччі (усім).
// Спосіб перевірки картки:
//  1) ≥ 6 нових подій; валідатор контенту й перевірник графа квестів — 0 проблем (мутація: подія без виходу → червоне);
//  2) кожна подія × кожна комбінація (профіль × транспорт × тварина) × пакування: ПОВНИЙ обхід усіх відповідей —
//     вихід є, тупиків немає, прогрес не втрачено (квести, речі, гроші, нагороди, місце), кінець розділу досяжний;
//     мутації «без виходу для велосипеда» і «подія забирає намет» → червоне;
//  +) дорога обирає ОДНУ подію з кількох детерміновано з RNG симуляції; шанси на комбінацію ≤ 100 % (мутація → червоне);
//  +) чесність ключа перебору (exploreView ховає f.seen-*): жодна умова контенту не читає f.seen-* (мутація → червоне).
// Сторож заборонених тем (політика, релігія) — src/guards/forbidden-topics.test.ts.
import { beforeAll, describe, expect, it } from 'vitest';
import { dispatch, nextCommandId, type Command } from '../core/commands';
import type { CoreDefs, StoryDefs } from '../core/defs';
import { canonical, stateHash } from '../core/hash';
import { newSim, step, type SimState } from '../core/sim';
import { initialState, type GameState } from '../core/state';
import { eventSeenFlag } from '../core/story';
import { enumerateCombos, matches, type Combo } from '../../scripts/validator/combos.mjs';
import { loadContent } from '../../scripts/validator/load.mjs';
import { validate } from '../../scripts/validator/checks.mjs';
import { endReachable, type EndMemo } from './bot';
import { exploreView, progressView, type Move } from './moves';
import { leaveMove } from './road-events.test.helpers';
import { GAME_DEFS } from './slice-defs';
import { CONTENT, STORY } from './story';

const TODAY = '2026-10-24';
const ROAD = 'loc.road';
const NEW = Object.keys(STORY.dialogues).filter((id) => /^dlg\.ev\.ch1\.road-\d{3}$/.test(id)).sort();
const ON_ROAD = Object.keys(STORY.dialogues).filter((id) => STORY.dialogues[id]?.trigger?.at.includes(ROAD)).sort();
const COMBOS = enumerateCombos(CONTENT);
const label = (k: Combo): string => `${k.profile} · ${k.transport} · ${k.animal}`;
const withStory = (story: StoryDefs): CoreDefs => ({ ...GAME_DEFS, story });

type Run = typeof dispatch;
const send = (s: GameState, m: Move, run: Run, defs: CoreDefs) => run(s, { ...m, commandId: nextCommandId(s) } as Command, defs);

/** Пакування: «як радить гра» (авто при створенні) чи з усіма трьома ліхтарями — гілка жарту в 004. */
type Pack = 'auto' | 'lanterns';
const PACKS: readonly Pack[] = ['auto', 'lanterns'];

/** Розділ 1 до приїзду на дорогу — ядром, без симуляції (тож подія не кидається: її відкриває перевірка сама). */
function atRoad(k: Combo, pack: Pack, defs: CoreDefs = GAME_DEFS): GameState {
  let s = initialState(5_000);
  const go = (m: Move): boolean => { const r = send(s, m, dispatch, defs); if (r.ok) s = r.state; return r.ok; };
  const must = (m: Move): void => { if (!go(m)) throw new Error(`${label(k)}: ${JSON.stringify(m)} відмовлено`); };
  must({ type: 'CreateCharacter', profileId: k.profile ?? '', transportId: k.transport ?? '', ...(k.animal === 'animal.none' ? {} : { animalId: k.animal }) } as Move);
  for (const m of [{ type: 'CompleteQuest', questId: 'PROLOGUE-HOME-001' }, { type: 'CompleteQuest', questId: 'ST-001' }, { type: 'CompleteQuest', questId: 'ST-002' },
    { type: 'Visit', locationId: 'loc.shop' }, { type: 'Pickup', itemId: 'item.tent' }, { type: 'Pickup', itemId: 'item.sleeping-bag' },
    { type: 'CompleteQuest', questId: 'ST-003' }, { type: 'Visit', locationId: 'loc.home' }] as Move[]) must(m);
  if (pack === 'lanterns') {
    const spare = ['item.big-cushion', 'item.snacks', 'item.mia-blanket', 'item.simple-dinner', 'item.water'];
    for (const item of ['item.lantern', 'item.lantern-2', 'item.lantern-3']) {
      if (s.flags.includes(`f.pack-${item.slice(5)}`)) continue;
      while (!go({ type: 'PackItem', itemId: item } as Move)) {
        const out = spare.find((x) => s.flags.includes(`f.pack-${x.slice(5)}`));
        if (!out) throw new Error(`${label(k)}: ліхтар ${item} не вміщається`);
        must({ type: 'UnpackItem', itemId: out } as Move);
      }
    }
  }
  must({ type: 'CompleteQuest', questId: 'CH1-HOME-001' });
  must({ type: 'Visit', locationId: ROAD });
  return s;
}

const core = (s: GameState): string => canonical({ ...progressView(s), flags: null, dialogue: null });

interface Probe { readonly endings: number; readonly stuck: string[]; readonly problems: string[]; readonly nodes: Set<string> }

/**
 * Повний обхід події: КОЖНА відповідь у КОЖНОМУ вузлі (умовні — там, де ядро їх приймає) до кінця розмови.
 * stuck — вузли, з яких ядро не приймає жодного ходу (тупик у розмові); problems — кінці, де щось втрачено.
 */
function probe(start: GameState, eventId: string, run: Run = dispatch, defs: CoreDefs = GAME_DEFS, memo: EndMemo = new Map()): Probe {
  const nodes = new Set<string>();
  const stuck: string[] = [];
  const problems: string[] = [];
  const opened = send(start, { type: 'RoadEvent', eventId }, run, defs);
  if (!opened.ok) return { endings: 0, stuck: [`RoadEvent → ${opened.code}`], problems, nodes };
  const seen = new Set<string>();
  const allowed = new Set([...start.flags, eventSeenFlag(eventId), ...(defs.story?.memorable ?? [])]);
  let endings = 0;
  for (const stack = [opened.state]; stack.length > 0;) {
    const s = stack.pop() as GameState;
    const k = canonical([s.dialogue, s.flags, s.inventory]);
    if (seen.has(k)) continue;
    seen.add(k);
    if (!s.dialogue) {
      endings++;
      const at = `${eventId} → кінець`;
      if (core(s) !== core(start)) problems.push(`${at}: змінився стан поза прапорцями (квести/речі/гроші/нагороди/місце/пам'ять)`);
      if (canonical(s.inventory) !== canonical(start.inventory)) problems.push(`${at}: інвентар ${canonical(start.inventory)} → ${canonical(s.inventory)}`);
      const lost = start.flags.filter((f) => !s.flags.includes(f));
      if (lost.length) problems.push(`${at}: зникли прапорці ${lost.join(', ')}`);
      const extra = s.flags.filter((f) => !allowed.has(f));
      if (extra.length) problems.push(`${at}: подія поставила не пам'ятний прапорець ${extra.join(', ')}`);
      if (endReachable(s, defs, memo, 20_000) !== true) problems.push(`${at}: кінець розділу недосяжний`);
      continue;
    }
    nodes.add(`${s.dialogue.id}/${s.dialogue.node}`);
    const choices = defs.story?.dialogues[s.dialogue.id]?.nodes[s.dialogue.node]?.choices ?? [];
    const next = [...choices.map((_, i) => ({ type: 'Choose', choice: i }) as Move), { type: 'Continue' } as Move]
      .map((m) => send(s, m, run, defs)).flatMap((r) => (r.ok ? [r.state] : []));
    if (next.length === 0) stuck.push(`${s.dialogue.id}/${s.dialogue.node}`);
    stack.push(...next);
  }
  return { endings, stuck, problems, nodes };
}

const eligibleFor = (k: Combo, id: string, story: StoryDefs = STORY): boolean => matches(story.dialogues[id]?.trigger?.when, k);

describe('GAME-108 · Спосіб перевірки 1: ≥ 6 нових подій, валідатор і граф квестів — 0 проблем', () => {
  const loaded = loadContent('content');

  it(`нових подій дороги ${NEW.length} (≥ 6), кожна — на дорозі, з назвою в uk і en`, () => {
    expect(NEW.length).toBeGreaterThanOrEqual(6);
    expect(NEW.every((id) => ON_ROAD.includes(id))).toBe(true);
    const raw = loaded.content as { dialogues: { id: string; trigger?: { titleKey: string } }[]; locales: Record<string, Record<string, string>> };
    for (const id of NEW) {
      const key = raw.dialogues.find((d) => d.id === id)?.trigger?.titleKey ?? '';
      for (const lang of ['uk', 'en']) expect(raw.locales[lang]?.[key], `${lang}: ${key}`).toBeTruthy();
    }
  });

  it('валідатор на справжньому контенті: 0 проблем (діалоги, прапорці, граф квестів, комбінації)', () => {
    expect(loaded.status).toBe('OK');
    expect(validate(loaded.content, { today: TODAY })).toEqual([]);
  });

  it('мутація: подія без безумовного виходу (лише «для авто») — валідатор червоніє саме на ній', () => {
    const c = structuredClone(loaded.content) as { dialogues: { id: string; nodes: { id: string; choices?: unknown[] }[] }[] };
    const ev = c.dialogues.find((d) => d.id === 'dlg.ev.ch1.road-007');
    const view = ev?.nodes.find((n) => n.id === 'view');
    if (!view) throw new Error('немає вузла view');
    view.choices = [{ textKey: 'dlg.ev.ch1.road-007.view.c1', next: 'photo', when: { transport: 'transport.car' } }];
    const issues = validate(c, { today: TODAY });
    expect(issues.filter((i) => i.code === 'DIALOGUE_DEAD_END').map((i) => i.where)).toContain('dlg.ev.ch1.road-007/view');
  });

  it('мутація: when тригера з неіснуючим транспортом / нездійсненний — REF_MISSING / WHEN_UNSATISFIABLE', () => {
    const codes = (id: string, when: unknown): string[] => {
      const c = structuredClone(loaded.content) as { dialogues: { id: string; trigger?: { when?: unknown } }[] };
      const ev = c.dialogues.find((d) => d.id === id);
      if (!ev?.trigger) throw new Error(`немає ${id}`);
      ev.trigger.when = when;
      return validate(c, { today: TODAY }).map((i) => `${i.code} ${i.where}`);
    };
    expect(codes('dlg.ev.ch1.road-006', { transports: ['transport.horse'] })).toContain('REF_MISSING dlg.ev.ch1.road-006.trigger.when.transports');
    // родина велосипедом не їздить (profiles.json) — подія не трапиться нікому
    expect(codes('dlg.ev.ch1.road-005', { profiles: ['profile.family-teen'], transports: ['transport.bike'] })).toContain('WHEN_UNSATISFIABLE dlg.ev.ch1.road-005.trigger.when');
  });
});

describe('GAME-108 · Спосіб перевірки 2: кожна подія × кожна комбінація × пакування — вихід є, прогрес не втрачено', () => {
  // У beforeAll, а не під час збору тестів (як bot.test): тайм-аут діє, виняток — провал тесту.
  let starts: { k: Combo; pack: Pack; s: GameState }[] = [];
  let results: { k: Combo; pack: Pack; id: string; p: Probe }[] = [];
  beforeAll(() => {
    const memo: EndMemo = new Map();
    starts = COMBOS.flatMap((k) => PACKS.map((pack) => ({ k, pack, s: atRoad(k, pack) })));
    results = starts.flatMap(({ k, pack, s }) => ON_ROAD.filter((id) => eligibleFor(k, id)).map((id) => ({ k, pack, id, p: probe(s, id, dispatch, GAME_DEFS, memo) })));
  }, 120_000);

  it(`перебрано ${COMBOS.length} комбінацій × ${PACKS.length} пакування; ліхтарі справді спаковано там, де треба`, () => {
    expect(COMBOS.length).toBe(5);
    expect(results.length).toBeGreaterThanOrEqual(NEW.length * 2);
    for (const { k, pack, s } of starts) if (pack === 'lanterns') expect(s.flags, label(k)).toEqual(expect.arrayContaining(['f.pack-lantern-2', 'f.pack-lantern-3']));
  });

  it('кожна пара подія × комбінація: ≥ 1 кінець, 0 тупиків, 0 втрат прогресу, кінець розділу досяжний', () => {
    const bad = results.filter((r) => r.p.endings === 0 || r.p.stuck.length || r.p.problems.length)
      .map((r) => `${label(r.k)} · ${r.pack} · ${r.id}: кінців ${r.p.endings}; ${[...r.p.stuck, ...r.p.problems].join('; ')}`);
    expect(bad).toEqual([]);
    console.info(`GAME-108 перебір: ${results.length} пар подія × комбінація × пакування, кінців розмови ${results.reduce((a, r) => a + r.p.endings, 0)}`);
  });

  it('вихід для КОЖНОГО транспорту: подія доступна й проходиться рівно там, де дозволяє її when (авто і велосипед)', () => {
    for (const id of NEW) {
      const allowed = new Set(COMBOS.filter((k) => eligibleFor(k, id)).map((k) => k.transport));
      const exited = new Set(results.filter((r) => r.id === id && r.p.endings > 0).map((r) => r.k.transport));
      expect([...exited].sort(), id).toEqual([...allowed].sort());
      expect(allowed.size, id).toBeGreaterThan(0);
    }
    for (const t of ['transport.car', 'transport.bike']) expect(NEW.filter((id) => results.some((r) => r.id === id && r.k.transport === t && r.p.endings > 0)).length, t).toBeGreaterThanOrEqual(4);
  });

  it('when тригера діє в ядрі: «скрип велосипеда» в авто й «тиша в машині» у велосипедиста не відкриваються', () => {
    const car = starts.find((x) => x.k.transport === 'transport.car' && x.pack === 'auto')?.s as GameState;
    const bike = starts.find((x) => x.k.transport === 'transport.bike' && x.pack === 'auto')?.s as GameState;
    expect(send(car, { type: 'RoadEvent', eventId: 'dlg.ev.ch1.road-006' }, dispatch, GAME_DEFS)).toMatchObject({ ok: false, code: 'CONDITION_FAILED' });
    expect(send(bike, { type: 'RoadEvent', eventId: 'dlg.ev.ch1.road-005' }, dispatch, GAME_DEFS)).toMatchObject({ ok: false, code: 'CONDITION_FAILED' });
  });

  it('обхід не порожній: кожен вузол кожної нової події відвідано (зокрема жарт про ліхтарі)', () => {
    const visited = new Set(results.flatMap((r) => [...r.p.nodes]));
    const ends = NEW.flatMap((id) => Object.entries(STORY.dialogues[id]?.nodes ?? {}).filter(([, n]) => n.end).map(([n]) => `${id}/${n}`));
    const all = NEW.flatMap((id) => Object.keys(STORY.dialogues[id]?.nodes ?? {}).map((n) => `${id}/${n}`));
    // Вузол «end» закривається Continue — у nodes він теж є (розмова на ньому ще відкрита).
    expect(all.filter((n) => !visited.has(n))).toEqual([]);
    expect(ends.length).toBeGreaterThanOrEqual(NEW.length * 2);
  });

  it('мутація «без виходу для велосипеда»: єдина відповідь 007 — лише для авто → у велосипедиста тупик, в авто — ні', () => {
    const ev = STORY.dialogues['dlg.ev.ch1.road-007'];
    if (!ev) throw new Error('немає 007');
    const mut: StoryDefs = { ...STORY, dialogues: { ...STORY.dialogues, 'dlg.ev.ch1.road-007': { ...ev, nodes: { ...ev.nodes, view: { choices: [{ next: 'photo', when: { transport: 'transport.car' }, effects: [] }] } } } } };
    const defs = withStory(mut);
    const bike = COMBOS.find((k) => k.transport === 'transport.bike') as Combo;
    const car = COMBOS.find((k) => k.transport === 'transport.car') as Combo;
    const red = probe(atRoad(bike, 'auto', defs), 'dlg.ev.ch1.road-007', dispatch, defs);
    expect(red.stuck).toEqual(['dlg.ev.ch1.road-007/view']);
    expect(probe(atRoad(car, 'auto', defs), 'dlg.ev.ch1.road-007', dispatch, defs).stuck).toEqual([]);
  });

  it('мутація «подія забирає намет»: ядро, що на відповіді в події знімає item.tent, → червоне (інвентар і стан)', () => {
    const thief: Run = (s, c, d, ...rest) => {
      const r = dispatch(s, c, d, ...rest);
      if (!r.ok || c.type !== 'Choose' || !s.dialogue?.id.startsWith('dlg.ev.ch1.road-')) return r;
      const inventory = Object.fromEntries(Object.entries(r.state.inventory).filter(([id]) => id !== 'item.tent'));
      return { ...r, state: { ...r.state, inventory } };
    };
    const k = COMBOS.find((x) => x.transport === 'transport.bike') as Combo;
    const p = probe(atRoad(k, 'auto'), 'dlg.ev.ch1.road-002', thief);
    expect(p.problems.some((x) => x.includes('інвентар'))).toBe(true);
    expect(p.problems.some((x) => x.includes('змінився стан'))).toBe(true);
  });

  it('мутація «подія ставить сюжетний прапорець» (f.night-car — ночівля в авто): червоне', () => {
    const ev = STORY.dialogues['dlg.ev.ch1.road-009'];
    if (!ev?.nodes.shop?.choices) throw new Error('немає 009');
    const shop = ev.nodes.shop;
    const mut: StoryDefs = { ...STORY, dialogues: { ...STORY.dialogues, 'dlg.ev.ch1.road-009': { ...ev, nodes: { ...ev.nodes, shop: { choices: (shop.choices ?? []).map((c) => ({ ...c, effects: [{ setFlag: 'f.night-car' }] })) } } } } };
    const k = COMBOS.find((x) => x.transport === 'transport.car') as Combo;
    const defs = withStory(mut);
    expect(probe(atRoad(k, 'auto', defs), 'dlg.ev.ch1.road-009', dispatch, defs).problems.some((x) => x.includes('не пам’ятний') || x.includes("не пам'ятний"))).toBe(true);
  });
});

describe('GAME-108 · дорога обирає одну подію з кількох — детерміновано з RNG симуляції', () => {
  /** Розділ до дороги симуляцією (з годинником і кидком після приїзду); повертає стан одразу після приїзду. */
  function simToRoad(k: Combo, seed: number): SimState {
    let s = newSim(seed, 5_000);
    const go = (m: Move): void => { s = step(s, { kind: 'command', command: { ...m, commandId: nextCommandId(s.game) } as Command }, { defs: GAME_DEFS }); };
    go({ type: 'CreateCharacter', profileId: k.profile ?? '', transportId: k.transport ?? '', ...(k.animal === 'animal.none' ? {} : { animalId: k.animal }) } as Move);
    for (const m of [{ type: 'CompleteQuest', questId: 'PROLOGUE-HOME-001' }, { type: 'CompleteQuest', questId: 'ST-001' }, { type: 'CompleteQuest', questId: 'ST-002' },
      { type: 'Visit', locationId: 'loc.shop' }, { type: 'Pickup', itemId: 'item.tent' }, { type: 'Pickup', itemId: 'item.sleeping-bag' },
      { type: 'CompleteQuest', questId: 'ST-003' }, { type: 'Visit', locationId: 'loc.home' }, { type: 'CompleteQuest', questId: 'CH1-HOME-001' },
      { type: 'Visit', locationId: ROAD }] as Move[]) go(m);
    return s;
  }
  const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);

  it('те саме зерно — та сама подія і той самий хеш стану (два прогони)', () => {
    for (const k of COMBOS) for (const seed of [1, 7, 42]) expect(stateHash(simToRoad(k, seed)), `${label(k)} #${seed}`).toBe(stateHash(simToRoad(k, seed)));
  });

  it('за 300 зерен кожна доречна подія випадає в кожній комбінації, а недоречна — ніколи; рівно одна за приїзд', () => {
    for (const k of COMBOS) {
      const fired = new Map<string, number>();
      for (const seed of SEEDS) {
        const s = simToRoad(k, seed);
        const events = s.journal.filter((e) => e.type === 'RoadEvent');
        expect(events.length, `${label(k)} #${seed}`).toBeLessThanOrEqual(1);
        const id = s.game.dialogue?.id ?? '—';
        fired.set(id, (fired.get(id) ?? 0) + 1);
      }
      const want = ON_ROAD.filter((id) => eligibleFor(k, id));
      expect([...fired.keys()].filter((x) => x !== '—').sort(), label(k)).toEqual(want);
      // Шанс «Яблук» 40 %: частка в межах 30–50 % на 300 зернах (інакше кидок не той, що в контенті).
      const apples = (fired.get('dlg.road-apples') ?? 0) / SEEDS.length;
      expect(apples, label(k)).toBeGreaterThan(0.3);
      expect(apples, label(k)).toBeLessThan(0.5);
    }
  });

  /** Сума шансів подій одного місця для однієї комбінації. > 100 — хвіст переліку на першому приїзді не випаде ніколи. */
  function overBudget(story: StoryDefs): string[] {
    return COMBOS.flatMap((k) => {
      const sum = ON_ROAD.filter((id) => eligibleFor(k, id, story)).reduce((a, id) => a + (story.dialogues[id]?.trigger?.chance ?? 0), 0);
      return sum > 100 ? [`${label(k)}: ${sum} %`] : [];
    });
  }
  it('шанси подій дороги на кожну комбінацію разом ≤ 100 % (кожна подія може випасти вже на першому приїзді)', () => {
    expect(overBudget(STORY)).toEqual([]);
  });
  it('мутація: шанс 002 «Дощ на повороті» 60 % → сума понад 100 % — червоне', () => {
    const ev = STORY.dialogues['dlg.ev.ch1.road-002'];
    if (!ev?.trigger) throw new Error('немає 002');
    const mut: StoryDefs = { ...STORY, dialogues: { ...STORY.dialogues, 'dlg.ev.ch1.road-002': { ...ev, trigger: { ...ev.trigger, chance: 60 } } } };
    expect(overBudget(mut).length).toBeGreaterThan(0);
  });
});

describe('GAME-108 · чесність ключа перебору: f.seen-* читає лише хід везіння', () => {
  type RawDlg = { id: string; nodes: { choices?: { when?: unknown }[] }[] };
  /** Умови контенту, що читають прапорець «подія вже була». Порожньо — exploreView може його ховати. */
  function seenReaders(dialogues: readonly RawDlg[]): string[] {
    const leaves = (c: unknown): string[] => {
      if (!c || typeof c !== 'object') return [];
      const o = c as Record<string, unknown>;
      const own = [o.flag, o.notFlag].filter((x): x is string => typeof x === 'string');
      return [...own, ...[...(Array.isArray(o.all) ? o.all : []), ...(Array.isArray(o.any) ? o.any : [])].flatMap(leaves)];
    };
    return dialogues.flatMap((d) => d.nodes.flatMap((n) => (n.choices ?? []).flatMap((ch) => leaves(ch.when).filter((f) => f.startsWith('f.seen-')).map((f) => `${d.id}: ${f}`))));
  }
  const raw = (CONTENT as unknown as { dialogues: RawDlg[] }).dialogues;

  it('жодна умова контенту не читає f.seen-*', () => {
    expect(raw.length).toBeGreaterThan(10);
    expect(seenReaders(raw)).toEqual([]);
  });
  it('мутація: відповідь з умовою { notFlag: f.seen-ev.ch1.road-002 } — червоне', () => {
    const mut = structuredClone(raw);
    mut[0]?.nodes[0]?.choices?.push({ when: { any: [{ notFlag: 'f.seen-ev.ch1.road-002' }] } });
    expect(seenReaders(mut)).toHaveLength(1);
  });
  it('exploreView ховає рівно f.seen-* подій і пам’ятні факти; інший прапорець лишається в ключі', () => {
    const s = atRoad(COMBOS[0] as Combo, 'auto');
    const seen = { ...s, flags: [...s.flags, eventSeenFlag('dlg.ev.ch1.road-007')].sort() };
    expect(canonical(exploreView(seen, STORY))).toBe(canonical(exploreView(s, STORY)));
    expect(canonical(exploreView({ ...s, flags: [...s.flags, 'f.night-car'].sort() }, STORY))).not.toBe(canonical(exploreView(s, STORY)));
  });
  it('вихід із події для тестів-сценаріїв (leaveMove): останній вибір кожного вузла події — безумовний', () => {
    for (const id of ON_ROAD) for (const [nid, n] of Object.entries(STORY.dialogues[id]?.nodes ?? {})) {
      if (n.choices) expect(n.choices.at(-1)?.when, `${id}/${nid}`).toBeUndefined();
    }
    expect(leaveMove({ dialogue: null }, STORY)).toBeNull();
  });
});
