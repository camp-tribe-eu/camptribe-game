// GAME-141 · Розділ 1, день 2: сцени дня (крім вогнища). На справжньому контенті:
//  · межа дня окремо від кінця розділу: ST-005 — `dayEnd` (день 1 закінчується, розділ триває), CH1-D2-FIRE-001 — `end` + `dayEnd`;
//  · порядок дня 2: CH1-D2-001 → CH1-D2-ELISE-001 → [велосипед: q.elise-bike-area = CH1-D2-BIKEZONE-001] → CH1-D2-CAMP-001 →
//    CH1-D2-FIRE-001 (гачок вогнища: поки один рядок, сцену GAME-142 підключають сюди) → підсумок дня 2 (CH1-D2-SUMMARY — екран GAME-106);
//  · Спосіб перевірки 1: відмова від велозони не блокує кінця розділу — повний перебір дня 2 + мутація «відмова в тупик»;
//  · Спосіб перевірки 2: Еліза згадує лише підтверджене — повний перебір із історією виборів + мутації «пам'ятає відмову»;
//  · сумісність сейвів: сейв, закінчений на старому кінці (ST-005 з `end`), вантажиться й продовжується днем 2.
import { describe, expect, it } from 'vitest';
import { dispatch, type Command } from '../core/commands';
import type { CoreDefs } from '../core/defs';
import { daySummary, daysEnded, dayEndQuests } from '../core/day-summary';
import { fromSave, reopenChapter, serialize } from '../core/save';
import { newSim, step, type SimState } from '../core/sim';
import { initialState, type GameState } from '../core/state';
import { loadContent } from '../../scripts/validator/load.mjs';
import { validate } from '../../scripts/validator/checks.mjs';
import flags from '../../content/flags.json';
import { endReachable, type EndMemo } from './bot';
import { moves, progressKey, type Move } from './moves';
import { GAME_DEFS } from './slice-defs';
import { CONTENT, STORY, compileStory, type RawContent } from './story';

const ZONE = 'q.elise-bike-area';
const ELISE = 'npc.elise';
const DAY2 = ['CH1-D2-001', 'CH1-D2-ELISE-001', 'CH1-D2-CAMP-001', 'CH1-D2-FIRE-001'] as const;

let n = 0;
function play(ms: readonly Move[], from: GameState, defs: CoreDefs = GAME_DEFS): GameState {
  let s = from;
  for (const m of ms) {
    const r = dispatch(s, { ...m, commandId: `d2-${n++}` } as Command, defs);
    if (!r.ok) throw new Error(`${JSON.stringify(m)} → ${r.code}`);
    s = r.state;
  }
  return s;
}
const talk: Move = { type: 'Talk', npcId: ELISE };
const choose = (choice: number): Move => ({ type: 'Choose', choice });
const next: Move = { type: 'Continue' };
const done = (questId: string): Move => ({ type: 'CompleteQuest', questId });

/** День 1 до межі (ST-005 завершено) для трьох видів гравця: велосипед із наметом, авто з кішкою й наметом, авто без намету. */
const DAY1_HEAD: readonly Move[] = [
  done('PROLOGUE-HOME-001'), done('ST-001'), done('ST-002'),
  { type: 'Visit', locationId: 'loc.shop' }, { type: 'Pickup', itemId: 'item.tent' }, { type: 'Pickup', itemId: 'item.sleeping-bag' },
  done('ST-003'), { type: 'Visit', locationId: 'loc.home' },
];
const DAY1_TAIL: readonly Move[] = [{ type: 'Pickup', itemId: 'item.firewood' }, done('ST-005')];
const toLake: readonly Move[] = [done('CH1-HOME-001'), { type: 'Visit', locationId: 'loc.road' }, done('ST-004'), { type: 'Visit', locationId: 'loc.camp.lake' }];

function startOf(kind: 'bike' | 'car-cat' | 'car-no-tent', defs: CoreDefs = GAME_DEFS): GameState {
  const create: Move = kind === 'bike'
    ? { type: 'CreateCharacter', profileId: 'profile.solo-explorer', transportId: 'transport.bike' } as Move
    : kind === 'car-cat'
      ? { type: 'CreateCharacter', profileId: 'profile.family-teen', transportId: 'transport.car', animalId: 'animal.cat' } as Move
      : { type: 'CreateCharacter', profileId: 'profile.solo-explorer', transportId: 'transport.car' } as Move;
  const pack: Move[] = kind === 'car-no-tent' ? [{ type: 'UnpackItem', itemId: 'item.tent' } as Move] : [];
  // Перша розмова з Елізою: велосипед — hello.c1 → bike → intro → spot; інші — hello.c2 → intro → spot. Далі — намет (spot.c1)
  // або без намету ніч в авто (spot.c2).
  const meet: Move[] = kind === 'bike' ? [talk, choose(0), next, next, choose(0), next]
    : kind === 'car-cat' ? [talk, choose(1), next, choose(0), next]
      : [talk, choose(1), next, choose(1), next, next];
  const s = play([create, ...DAY1_HEAD, ...pack, ...toLake, ...meet, ...DAY1_TAIL], initialState(5_000), defs);
  expect(s.quests['ST-005']?.status).toBe('completed');
  expect(s.campaignEnded).toBe(false);
  return s;
}

// ── повний перебір дня 2 з історією виборів ────────────────────────────────────────────────────────────────────────────
const DAY_MOVES = new Set(['Talk', 'Choose', 'Continue', 'CompleteQuest', 'DeclineQuest']);
/** Вузли, у яких гравець ПІДТВЕРДЖУЄ щось Елізі: вибір тут пишеться в історію шляху (`advice.c1` — «так», `.c2` — «по-своєму»). */
const CONFIRM_NODES = new Set(['advice', 'bikezone']);
/** Вузол-згадка → що мусить бути в історії, щоб Еліза мала право його сказати. */
const REVISIT: Readonly<Record<string, string>> = { 'again-yes': 'advice.c1', 'again-no': 'advice.c2', 'bikezone-thanks': 'bikezone.c1' };
/** Факт пам'яті Елізи → вибір, що його підтверджує. */
const MEMORY: Readonly<Record<string, string>> = { 'm.advice-taken': 'advice.c1', 'm.advice-declined': 'advice.c2', 'm.bikezone-helped': 'bikezone.c1' };

interface Explored {
  states: number;
  readonly violations: string[];
  /** Стани одразу після відмови від велозони. */
  readonly declined: GameState[];
  readonly entered: Set<string>;
  ended: number;
}

function explore(start: GameState, defs: CoreDefs = GAME_DEFS, cap = 200_000): Explored {
  const out: Explored = { states: 0, violations: [], declined: [], entered: new Set(), ended: 0 };
  const seen = new Set<string>();
  const queue: { s: GameState; h: readonly string[] }[] = [{ s: start, h: [] }];
  for (let cur = queue.shift(); cur; cur = queue.shift()) {
    const { s, h } = cur;
    out.states++;
    // GAME-144: межа дня 2 (вогнище завершено) — кінець перебору дня 2; що далі є день 3 і кінець розділу, доводить day3.test.
    if (s.campaignEnded || s.quests['CH1-D2-FIRE-001']?.status === 'completed') { out.ended++; continue; }
    for (const m of moves(s, defs)) {
      if (!DAY_MOVES.has(m.type)) continue;
      const r = dispatch(s, { ...m, commandId: `x${n++}` } as Command, defs);
      if (!r.ok) continue;
      const t = r.state;
      let hist = h;
      if (m.type === 'Choose' && s.dialogue && CONFIRM_NODES.has(s.dialogue.node)) hist = [...new Set([...h, `${s.dialogue.node}.c${m.choice + 1}`])].sort();
      if (m.type === 'DeclineQuest' && m.questId === ZONE) { hist = [...new Set([...h, 'zone-declined'])].sort(); out.declined.push(t); }
      // Що Еліза пам'ятає — лише підтверджене цим шляхом.
      for (const f of t.npcMemory[ELISE] ?? []) {
        const need = MEMORY[f];
        if (need && !hist.includes(need)) out.violations.push(`пам'ятає ${f} без ${need} (історія: ${hist.join(',') || '—'})`);
      }
      // Що Еліза каже — лише підтверджене; від велозони після відмови — жодної пропозиції знову.
      const node = t.dialogue?.id === 'dlg.elise-greeting' ? t.dialogue.node : null;
      if (node && node !== s.dialogue?.node) {
        out.entered.add(node);
        const need = REVISIT[node];
        if (need && !hist.includes(need)) out.violations.push(`каже «${node}» без ${need} (історія: ${hist.join(',') || '—'})`);
        if (node === 'bikezone' && hist.includes('zone-declined')) out.violations.push('після відмови знову пропонує велозону');
      }
      const k = `${progressKey(t)}|${hist.join(',')}`;
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push({ s: t, h: hist });
    }
    if (seen.size > cap) throw new Error(`перебір дня 2 вийшов за ${cap} станів — нічого не доведено`);
  }
  return out;
}

const mutate = (f: (c: RawContent) => void): CoreDefs => {
  const c = structuredClone(CONTENT);
  f(c);
  return { ...GAME_DEFS, story: compileStory(c) };
};
type RawNode = { id: string; choices?: { effects?: Record<string, unknown>[] }[] };
const eliseNode = (c: RawContent, id: string): RawNode | undefined =>
  (c.dialogues.find((d) => d.id === 'dlg.elise-greeting')?.nodes as unknown as RawNode[] | undefined)?.find((x) => x.id === id);

describe('GAME-141 · межа дня й кінець розділу — різні речі', () => {
  it('ST-005 — межа дня 1, не кінець; межа дня 2 — CH1-D2-FIRE-001 (вечір біля вогнища); кінець розділу — удома в день 3 (GAME-144)', () => {
    expect(STORY.quests['ST-005']).toMatchObject({ dayEnd: true, end: false });
    expect(STORY.quests['CH1-D2-FIRE-001']).toMatchObject({ dayEnd: true, end: false });
    expect([...dayEndQuests(GAME_DEFS)]).toEqual(['ST-005', 'CH1-D2-FIRE-001', 'CH1-D3-HOME-001']);
    expect(Object.entries(STORY.quests).filter(([, q]) => q.end).map(([id]) => id)).toEqual(['CH1-D3-HOME-001']);
  });

  it('порядок дня 2 за замовчуванням: ST-005 → CH1-D2-001 → CH1-D2-ELISE-001 → CH1-D2-CAMP-001 → CH1-D2-FIRE-001; велозона — лише вибір велосипедиста', () => {
    const chain: string[] = ['ST-005'];
    // GAME-144: ланцюг дня 2 — до межі дня 2 (вогнище); далі день 3 (day3.test).
    for (let q = STORY.quests['ST-005']; q && chain.at(-1) !== 'CH1-D2-FIRE-001' && chain.length < 10; q = STORY.quests[chain.at(-1) as string]) {
      const to = q.transitions.find((t) => t.on === 'complete' && !t.choice && !t.when)?.to;
      if (!to) break;
      chain.push(to);
    }
    expect(chain).toEqual(['ST-005', ...DAY2]);
    expect(STORY.quests['CH1-D2-ELISE-001']?.transitions.find((t) => t.to === ZONE)).toEqual({ on: 'complete', to: ZONE, choice: true, when: { transports: ['transport.bike'] } });
    expect(STORY.quests[ZONE]?.transitions.map((t) => [t.on, t.to])).toEqual([['complete', 'CH1-D2-CAMP-001'], ['decline', 'CH1-D2-CAMP-001']]);
    // Мія ніколи не їде велосипедом: кішка — лише авто, тож велозони вона не бачить у жодній комбінації.
    expect(CONTENT.animals.find((a) => a.id === 'animal.cat')?.transports).toEqual(['transport.car']);
  });

  it('гачок вогнища (GAME-142) — один етап CH1-D2-FIRE-001: після вечері, останній перед підсумком дня 2, і поки без сцени', () => {
    expect(STORY.quests['CH1-D2-CAMP-001']?.transitions).toEqual([{ on: 'complete', to: 'CH1-D2-FIRE-001', choice: false }]);
    expect(STORY.quests['CH1-D2-FIRE-001']?.transitions).toEqual([{ on: 'complete', to: 'CH1-D3-001', choice: false }]);   // GAME-144: далі ранок дня 3
    // Вечеря (ціль dinner CH1-D2-CAMP-001) — до вогнища: canon «вогнище — коли вечеря завершена».
    expect(STORY.quests['CH1-D2-CAMP-001']?.objectives.find((o) => o.id === 'dinner')?.required).toBe(true);
    // Ціль «вечір» — візит табору (гравець уже тут): GAME-142 замінить її на сцену, не чіпаючи межі дня.
    expect(STORY.quests['CH1-D2-FIRE-001']?.objectives).toEqual([{ id: 'evening', kind: 'visit', target: 'loc.camp.lake', required: true }]);
    expect((flags as { id: string }[]).filter((f) => f.id.startsWith('f.fire')).map((f) => f.id).sort()).toEqual(['f.fire-allowed', 'f.fire-dinner-done', 'f.fire-photo-tent']);   // прапорці вогнища принесла GAME-142 (#66)
  });

  it('підсумок дня: «день 1» закінчується на ST-005, «день 2» — на CH1-D2-FIRE-001, розділ триває (повний прохід авто)', () => {
    const CTX = { defs: GAME_DEFS };
    let sim = newSim(7, 5_000);
    const sendAll = (ms: readonly Move[]): void => { for (const m of ms) sim = step(sim, { kind: 'command', command: { ...m, commandId: `s${n++}` } as Command }, CTX); };
    sendAll([{ type: 'CreateCharacter', profileId: 'profile.solo-explorer', transportId: 'transport.car' } as Move, ...DAY1_HEAD, ...toLake]);
    for (let i = 0; sim.game.dialogue && i < 10; i++) sendAll([next]);   // подія в дорозі, якщо кинулась
    sendAll([talk, choose(1), next, choose(0), next, ...DAY1_TAIL]);
    expect(daysEnded(sim, GAME_DEFS)).toBe(1);
    expect(daySummary(sim, 1, GAME_DEFS)?.sections.find((x) => x.kind === 'quests')?.ids.at(-1)).toBe('ST-005');
    expect(sim.game.campaignEnded).toBe(false);
    sendAll([done('CH1-D2-001'), talk, choose(10), choose(1), next, done('CH1-D2-ELISE-001'), talk, choose(13), choose(0), next, next, done('CH1-D2-CAMP-001'), done('CH1-D2-FIRE-001')]);
    expect(sim.game.campaignEnded).toBe(false);                 // GAME-144: межа дня 2, розділ триває
    expect(sim.game.quests['CH1-D3-001']?.status).toBe('active');
    expect(daysEnded(sim, GAME_DEFS)).toBe(2);
    expect(daySummary(sim, 2, GAME_DEFS)?.sections.find((x) => x.kind === 'quests')?.ids).toEqual([...DAY2]);
  });
});

describe('GAME-141 · Спосіб перевірки 1: відмова від велозони не блокує кінця розділу', () => {
  const memo: EndMemo = new Map();
  const bike = explore(startOf('bike'));

  it('повний перебір дня 2 велосипедиста: відмов багато, і з КОЖНОЇ кінець розділу досяжний', () => {
    expect(bike.declined.length).toBeGreaterThan(0);
    expect(bike.ended).toBeGreaterThan(0);
    const stuck = bike.declined.filter((s) => endReachable(s, GAME_DEFS, memo, 50_000) !== true);
    expect(stuck.length, `станів після відмови: ${bike.declined.length}`).toBe(0);
    // Відмова справді вела далі: після неї активний табірний день, а квест велозони — «declined», не «completed».
    expect(bike.declined.every((s) => s.quests[ZONE]?.status === 'declined' && s.quests['CH1-D2-CAMP-001']?.status === 'active')).toBe(true);
    console.info(`GAME-141 Спосіб 1: станів дня 2 (велосипед) ${bike.states}, відмов від велозони ${bike.declined.length}, кінців розділу ${bike.ended}; тупиків після відмови 0`);
  });

  it('МУТАЦІЯ «відмова в тупик» (decline → квест без виходу): перебір червоніє, і валідатор теж', () => {
    const dead = (c: RawContent): void => {
      const z = c.quests.find((q) => q.id === ZONE);
      const t = z?.transitions.find((x) => x.on === 'decline');
      if (t) t.to = 'q.zone-stuck';
      c.quests.push({ id: 'q.zone-stuck', optional: false, objectives: [], transitions: [] });
    };
    const defs = mutate(dead);
    const m = explore(startOf('bike', defs), defs);
    expect(m.declined.length).toBeGreaterThan(0);
    const stuck = m.declined.filter((s) => endReachable(s, defs, new Map(), 50_000) === false);
    expect(stuck.length).toBe(m.declined.length);
    console.info(`GAME-141 Спосіб 1 · МУТАЦІЯ: відмов ${m.declined.length}, тупиків після відмови ${stuck.length}`);
    // Той самий тупик статично: валідатор на контенті з цією мутацією.
    const loaded = loadContent('content');
    const c = structuredClone(loaded.content) as unknown as { quests: { id: string; titleKey?: string; optional: boolean; objectives: unknown[]; transitions: { on: string; to: string }[] }[] };
    const z = c.quests.find((q) => q.id === ZONE);
    const t = z?.transitions.find((x) => x.on === 'decline');
    if (t) t.to = 'q.zone-stuck';
    c.quests.push({ id: 'q.zone-stuck', titleKey: 'q.elise-bike-area', optional: false, objectives: [], transitions: [] });
    const codes = validate(c, { today: '2026-10-24' }).map((x) => x.code);
    expect(codes).toContain('NO_PATH_TO_END');
    expect(validate(loaded.content, { today: '2026-10-24' }).filter((x) => x.code === 'NO_PATH_TO_END')).toEqual([]);
  }, 120_000);
});

describe('GAME-141 · Спосіб перевірки 2: Еліза згадує лише підтверджене (EL-REVISIT)', () => {
  const runs = { bike: explore(startOf('bike')), 'car-cat': explore(startOf('car-cat')), 'car-no-tent': explore(startOf('car-no-tent')) };

  it('повний перебір дня 2 (велосипед, авто з кішкою, авто без намету): жодної згадки чи пам’яті без підтвердження', () => {
    for (const [k, r] of Object.entries(runs)) expect(r.violations.slice(0, 5), k).toEqual([]);
    console.info(`GAME-141 Спосіб 2: станів ${Object.entries(runs).map(([k, r]) => `${k} ${r.states}`).join(', ')}; порушень 0`);
  });

  it('перебір не порожній: кожна згадка й відмова справді траплялись (інакше «лише підтверджене» нічого не доводить)', () => {
    for (const node of ['again-yes', 'again-no', 'bikezone', 'bikezone-yes', 'bikezone-no', 'bikezone-thanks', 'morning', 'dinner']) expect(runs.bike.entered.has(node), node).toBe(true);
    for (const node of ['again-yes', 'again-no', 'morning', 'dinner']) expect(runs['car-cat'].entered.has(node), node).toBe(true);
    // Велозону бачить лише велосипедист; поради про намет немає тому, хто ночує без намету.
    expect(runs['car-cat'].entered.has('bikezone')).toBe(false);
    expect(runs['car-no-tent'].entered.has('advice')).toBe(false);
    expect(Object.values(runs).every((r) => r.ended > 0)).toBe(true);
  });

  it('МУТАЦІЯ «Еліза пам’ятає відмову від велозони» (bikezone.c2 теж ставить m.bikezone-helped): червоне', () => {
    const defs = mutate((c) => { const ch = eliseNode(c, 'bikezone')?.choices?.[1]; if (ch) ch.effects = [...(ch.effects ?? []), { remember: 'm.bikezone-helped' }]; });
    const r = explore(startOf('bike', defs), defs);
    expect(r.violations.length).toBeGreaterThan(0);
    expect(r.violations.some((v) => v.startsWith("пам'ятає m.bikezone-helped без bikezone.c1"))).toBe(true);
    expect(r.violations.some((v) => v.startsWith('каже «bikezone-thanks» без bikezone.c1'))).toBe(true);
    console.info(`GAME-141 Спосіб 2 · МУТАЦІЯ велозона: порушень ${r.violations.length}, перше: ${r.violations[0]}`);
  });

  it('МУТАЦІЯ «Еліза пам’ятає відхилену пораду як прийняту» (advice.c2 ставить m.advice-taken): червоне', () => {
    const defs = mutate((c) => { const ch = eliseNode(c, 'advice')?.choices?.[1]; if (ch) ch.effects = [{ remember: 'm.advice-taken' }]; });
    const r = explore(startOf('car-cat', defs), defs);
    expect(r.violations.some((v) => v.startsWith("пам'ятає m.advice-taken без advice.c1"))).toBe(true);
    console.info(`GAME-141 Спосіб 2 · МУТАЦІЯ порада: порушень ${r.violations.length}, перше: ${r.violations[0]}`);
  });

  it('МУТАЦІЯ «після відмови велозону пропонують знову» (hello.c12 без умови «квест активний»): червоне', () => {
    const defs = mutate((c) => {
      const hello = c.dialogues.find((d) => d.id === 'dlg.elise-greeting')?.nodes.find((x) => x.id === 'hello');
      const c12 = hello?.choices?.[11];
      if (c12) c12.when = { remembers: 'm.came-by-bike' };
    });
    const r = explore(startOf('bike', defs), defs);
    expect(r.violations).toContain('після відмови знову пропонує велозону');
  });
});

describe('GAME-141 · сумісність сейвів: старий кінець розділу (ST-005 з end) продовжується днем 2', () => {
  /** Контент ДО GAME-141: ST-005 — кінець розділу без виходів, велозона — вибір із ST-004 і веде в ST-005. Ядро те саме. */
  const OLD = mutate((c) => {
    const st005 = c.quests.find((q) => q.id === 'ST-005');
    if (st005) { st005.end = true; delete st005.dayEnd; st005.transitions = []; }
    c.quests.find((q) => q.id === 'ST-004')?.transitions.push({ on: 'complete', to: ZONE, choiceKey: 'q.elise-bike-area.choice', when: { transports: ['transport.bike'] } });
    const zone = c.quests.find((q) => q.id === ZONE);
    if (zone) zone.transitions = [{ on: 'complete', to: 'ST-005' }, { on: 'decline', to: 'ST-005', choiceKey: 'q.elise-bike-area.decline' }];
  });
  const CTX_OLD = { defs: OLD };
  const oldEnded = (): SimState => {
    let sim = newSim(28, 5_000);   // GAME-108: сід без події в дорозі (шанс події 82 %)
    const ms: Move[] = [{ type: 'CreateCharacter', profileId: 'profile.solo-explorer', transportId: 'transport.bike' } as Move, ...DAY1_HEAD, ...toLake];
    for (const m of ms) sim = step(sim, { kind: 'command', command: { ...m, commandId: `o${n++}` } as Command }, CTX_OLD);
    for (let i = 0; sim.game.dialogue && i < 10; i++) sim = step(sim, { kind: 'command', command: { type: 'Continue', commandId: `o${n++}` } }, CTX_OLD);
    for (const m of [talk, choose(0), next, next, choose(0), next, ...DAY1_TAIL]) sim = step(sim, { kind: 'command', command: { ...m, commandId: `o${n++}` } as Command }, CTX_OLD);
    return sim;
  };

  it('сейв, закінчений на старому ST-005, вантажиться (не SAVE_CONTENT_MISMATCH) і відкривається на ранку дня 2; кінець досяжний', () => {
    const old = oldEnded();
    expect(old.game.campaignEnded).toBe(true);
    expect(old.game.quests['CH1-D2-001']).toBeUndefined();
    const r = fromSave(serialize(old), { story: STORY });
    expect(r.ok, r.ok ? '' : `${r.code}: ${r.detail}`).toBe(true);
    if (!r.ok) return;
    expect(r.sim.game.campaignEnded).toBe(false);
    expect(r.sim.game.quests['CH1-D2-001']).toEqual({ status: 'active', done: ['morning'] });   // «ранок» — гравець біля озера
    expect(r.sim.game.quests['ST-005']?.status).toBe('completed');
    expect(daysEnded(r.sim, GAME_DEFS)).toBe(1);                                               // старий журнал: межа дня 1 — ST-005
    expect(daySummary(r.sim, 1, GAME_DEFS)?.ended).toBe(true);
    expect(endReachable(r.sim.game, GAME_DEFS, new Map(), 50_000)).toBe(true);
  });

  it('МУТАЦІЯ «без відкриття розділу» (той самий сейв без reopenChapter): розділ лишається закінченим, дня 2 немає', () => {
    const r = fromSave(serialize(oldEnded()));                                                 // без story — reopenChapter не кличеться
    expect(r.ok && r.sim.game.campaignEnded).toBe(true);
    expect(r.ok && r.sim.game.quests['CH1-D2-001']).toBeUndefined();
  });

  /** Старий сейв посеред дня 1: велосипедист обрав велозону з ST-004 (старий контент) і стоїть біля озера; ST-005 ще не було. */
  const oldMidZone = (): SimState => {
    let sim = newSim(28, 5_000);   // GAME-108: сід без події в дорозі
    const ms: Move[] = [{ type: 'CreateCharacter', profileId: 'profile.solo-explorer', transportId: 'transport.bike' } as Move, ...DAY1_HEAD,
      done('CH1-HOME-001'), { type: 'Visit', locationId: 'loc.road' }];
    for (const m of ms) sim = step(sim, { kind: 'command', command: { ...m, commandId: `o${n++}` } as Command }, CTX_OLD);
    for (let i = 0; sim.game.dialogue && i < 10; i++) sim = step(sim, { kind: 'command', command: { type: 'Continue', commandId: `o${n++}` } }, CTX_OLD);
    for (const m of [{ type: 'CompleteQuest', questId: 'ST-004', to: ZONE } as Move, { type: 'Visit', locationId: 'loc.camp.lake' } as Move]) sim = step(sim, { kind: 'command', command: { ...m, commandId: `o${n++}` } as Command }, CTX_OLD);
    return sim;
  };

  it('старий сейв з активною велозоною дня 1 (ST-005 ще немає): велозона прибирається, відкривається ST-005 — день 1 не перестрибнути', () => {
    const old = oldMidZone();
    expect(old.game.quests[ZONE]?.status).toBe('active');
    expect(old.game.quests['ST-005']).toBeUndefined();
    const r = fromSave(serialize(old), { story: STORY });
    expect(r.ok, r.ok ? '' : `${r.code}: ${r.detail}`).toBe(true);
    if (!r.ok) return;
    expect(r.sim.game.quests['ST-005']).toEqual({ status: 'active', done: [] });
    expect(r.sim.game.quests[ZONE]).toBeUndefined();                                            // вдень 2 запропонують звичайним шляхом
    expect(r.sim.game.campaignEnded).toBe(false);
    // Далі звичайний день 1 → день 2, і велосипедист знову може обрати велозону після поради Елізи.
    const d2 = play([talk, choose(0), next, next, choose(0), next, ...DAY1_TAIL, done('CH1-D2-001'), talk, choose(10), choose(1), next,
      { type: 'CompleteQuest', questId: 'CH1-D2-ELISE-001', to: ZONE } as Move], r.sim.game);
    expect(d2.quests[ZONE]?.status).toBe('active');
    expect(endReachable(r.sim.game, GAME_DEFS, new Map(), 50_000)).toBe(true);
  });

  it('МУТАЦІЯ «без ремонту» (той самий сейв без reopenChapter): ST-005 немає, а завершена велозона перестрибує в табірний день 2', () => {
    const r = fromSave(serialize(oldMidZone()));                                               // без story — reopenChapter не кличеться
    if (!r.ok) throw new Error(r.code);
    expect(r.sim.game.quests['ST-005']).toBeUndefined();
    // hello.c1 → bike → intro → spot.c1; далі hello.c12 → bikezone.c1 («Ходімо, гляну») — і «Завершити» велозону.
    const s = play([talk, choose(0), next, next, choose(0), next, talk, choose(11), choose(0), next, next, { type: 'CompleteQuest', questId: ZONE } as Move], r.sim.game);
    expect(s.quests['CH1-D2-CAMP-001']?.status).toBe('active');
    expect(s.quests['ST-005']).toBeUndefined();                                                // день 1 і «Прибуття» пропущено
  });

  it('GAME-141: вогнище (StartScene) у дні 2 — законне лише коли активний CH1-D2-FIRE-001; до нього й після кінця розділу — відмова', () => {
    const fire: Move = { type: 'StartScene', sceneId: 'dlg.ch1-fire', facts: ['f.fire-allowed'] };
    const upToCamp: Move[] = [done('CH1-D2-001'), talk, choose(10), choose(1), next, done('CH1-D2-ELISE-001'), talk, choose(13), choose(0), next, next];
    const mid = play(upToCamp, startOf('car-cat'));
    expect(mid.quests['CH1-D2-CAMP-001']?.status).toBe('active');
    expect(() => play([fire], mid)).toThrow(/QUEST_NOT_ACTIVE/);
    const atFire = play([done('CH1-D2-CAMP-001')], mid);
    expect(atFire.quests['CH1-D2-FIRE-001']?.status).toBe('active');
    expect(play([fire], atFire).dialogue).toEqual({ id: 'dlg.ch1-fire', node: 'open' });
    const ended = play([done('CH1-D2-FIRE-001')], atFire);
    expect(ended.campaignEnded).toBe(false);                    // GAME-144: етап вогнища минув, розділ триває — сцена все одно не відкривається
    expect(() => play([fire], ended)).toThrow(/QUEST_NOT_ACTIVE/);
  });

  it('розділ, закінчений на НИНІШНЬОМУ кінці, не відкривається знову; незакінчений — не змінюється', () => {
    // GAME-144: нинішній кінець — удома в день 3.
    const now = play([done('CH1-D2-001'), talk, choose(10), choose(1), next, done('CH1-D2-ELISE-001'), talk, choose(13), choose(0), next, next, done('CH1-D2-CAMP-001'), done('CH1-D2-FIRE-001'),
      done('CH1-D3-001'), done('CH1-D3-GEAR-001'), talk, choose(14), next, choose(0), next, next, done('CH1-D3-ELISE-001'),
      { type: 'Visit', locationId: 'loc.road' }, done('CH1-D3-RETURN-001'), { type: 'Visit', locationId: 'loc.home' }, done('CH1-D3-HOME-001')], startOf('car-cat'));
    expect(now.campaignEnded).toBe(true);
    expect(reopenChapter(now, STORY)).toBe(now);
    const mid = startOf('bike');
    expect(reopenChapter(mid, STORY)).toBe(mid);
    // Сторож 1 (кінець — нинішній `end`): навіть коли в сейві є «сирота» (активна велозона, а CH1-D2-ELISE-001, що її відкриває,
    // прибрано руками), закінчений на нинішньому кінці розділ не чіпається. Без сторожа сироту прибрало б, ELISE-001 відкрився б
    // знову, а campaignEnded став би false.
    const holey = { ...now, quests: { ...Object.fromEntries(Object.entries(now.quests).filter(([id]) => id !== 'CH1-D2-ELISE-001')), [ZONE]: { status: 'active' as const, done: [] } } };
    expect(reopenChapter(holey, STORY)).toBe(holey);
  });

  it('сторож 2 (вихід уже почався): у старому закінченому сейві CH1-D2-001 уже є — його не перезаписують активним', () => {
    const g = oldEnded().game;
    const already = { ...g, quests: { ...g.quests, 'CH1-D2-001': { status: 'completed' as const, done: ['morning'] } } };
    const out = reopenChapter(already, STORY);
    expect(out.quests['CH1-D2-001']).toEqual({ status: 'completed', done: ['morning'] });
    expect(out.quests['CH1-D2-ELISE-001']?.status).toBe('active');                             // далі — наступний етап, а не повтор
  });
});
