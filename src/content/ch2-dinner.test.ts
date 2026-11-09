/// <reference types="node" />
// GAME-288 · CH2-D1-SUMMARY: вечеря (інші страви), Інгрід упізнає символ медальйона («Клуб мандрівників»), сон = сейв, підсумок дня 1 розділу 2.
// Закон 1: кожен сторож нижче показано червоним мутацією (результати — в описі PR):
//  1) розмова без глухих кутів — незалежний оракул по графу JSON І справжній валідатор; мутація «зламано choices[].next» червоніє в обох;
//  2) сцена завершувана за КОЖНОЇ погоди × (з фото / без) × усіх 12 шляхів вибору, на справжніх командах ядра й справжньому режисері (spotMove);
//  3) сцена КОСМЕТИЧНА: стан гри (прапорці, речі, нагороди, квести, гроші) і простір станів перебору (exploreView) до і після — ті самі;
//  4) розділ 1 цього не бачить; сцена не повторюється; сейв після сну < 500 КБ (міряємо байти serialize);
//  5) підсумок дня лічить день розділу 2 від його старту («день 1», а не «день 4»); мутація «зсув дня прибрано» червоніє.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../scripts/validator/load.mjs';
import { validate } from '../../scripts/validator/checks.mjs';
import { dispatch, type Command } from '../core/commands';
import { advance } from '../core/clock';
import { daysEnded } from '../core/day-summary';
import { fromSave, serialize } from '../core/save';
import { step, type SimState } from '../core/sim';
import { stateHash } from '../core/hash';
import type { GameState } from '../core/state';
import { CHAPTER2_START } from '../core/story';
import { WEATHERS, dayOf, weatherOf, type Weather } from '../core/weather';
import { chapterDayBase, summaryOffer, tomorrowKeyOf } from '../view/story-offer';
import { ch1End, onRoadHome } from './ch1-end.fixture';
import { DINNER_QUEST, DINNER_SCENE, DINNER_SPOT, dinnerDue, dinnerPlayed } from './ch2-dinner';
import { liveSpot, spotMove, storyMoves } from './director';
import { exploreView, moves } from './moves';
import { GAME_DEFS } from './slice-defs';
import { STORY } from './story';
import { SECONDS, moveSeconds } from './time-model';
import uk from '../i18n/uk.json';
import en from '../i18n/en.json';
import ukC from '../../content/locales/uk.json';
import enC from '../../content/locales/en.json';

const CTX = { defs: GAME_DEFS };
const FINISH = { type: 'CompleteQuest', questId: 'CH2-D1-SUMMARY-001' };
let n = 0;
const cmdOf = (m: object): Command => ({ ...m, commandId: `a288-${n++}` } as Command);
/** Хід у справжній симуляції (журнал, годинник, сон): відмова ядра — виняток із кодом. */
const run = (s: SimState, m: object): SimState => {
  const c = cmdOf(m);
  const r = step(s, { kind: 'command', command: c }, CTX);
  const p = r.game.processed[c.commandId];
  if (p?.ok !== true) throw new Error(`${JSON.stringify(m)} → ${p?.ok === false ? p.code : 'без відповіді'}`);
  return r;
};
const refused = (s: SimState, m: object): string | null => {
  const c = cmdOf(m);
  const p = step(s, { kind: 'command', command: c }, CTX).game.processed[c.commandId];
  return p?.ok === false ? String(p.code) : null;
};
/** Подія в дорозі (випадкова) відкриває діалог — закрити, як гравець (Continue, інакше Choose 0). */
function settle(s: SimState): SimState {
  for (let i = 0; s.game.dialogue !== null && i < 40; i++) {
    const before = s.game.dialogue;
    s = step(s, { kind: 'command', command: cmdOf({ type: 'Continue' }) }, CTX);
    if (s.game.dialogue === before) s = step(s, { kind: 'command', command: cmdOf({ type: 'Choose', choice: 0 }) }, CTX);
  }
  return s;
}

const base = ch1End();
/** Вечір 19:00 того ж дня, що й кінець розділу 1 + зерно світу з потрібною погодою цього дня. */
const evening = ((19 * 60 - ((base.clock.minutes + 480) % 1440) + 1440) % 1440);
const clockEv = advance(base.clock, evening);
const seedFor = (w: Weather): number => { for (let s = 1; s < 5000; s++) if (weatherOf(s, dayOf(clockEv)) === w) return s; throw new Error(`немає зерна з ${w}`); };
const SPOT_OF: Readonly<Record<Weather, string>> = { sunny: 'obj.photo-orchid', cloudy: 'obj.photo-orchid', rain: 'obj.photo-drops' };

interface Day1 { readonly sim: SimState; readonly seconds: number }
/**
 * День 1 розділу 2 до вечері: прибуття, прогулянка (з кадром або без), повернення в табір; годинник — 19:00, зерно — з потрібною погодою.
 * `seconds` — модель часу гравця (time-model.ts) за ходами цього відрізка, коли їх шле гравець: повернення в табір.
 */
function toDinner(w: Weather, photo: boolean): Day1 {
  let s: SimState = { ...base, worldSeed: seedFor(w) };
  let seconds = 0;
  const go = (m: object): void => { s = run(s, m); };
  go({ type: 'StartChapter2' });
  go({ type: 'Visit', locationId: 'loc.road' }); s = settle(s);
  go({ type: 'Visit', locationId: 'loc.camp.mullerthal' }); s = settle(s);
  go({ type: 'Talk', npcId: 'npc.host-mullerthal' });
  go({ type: 'Choose', choice: 0 }); go({ type: 'Choose', choice: 1 }); go({ type: 'Continue' });
  go({ type: 'CompleteQuest', questId: CHAPTER2_START });
  if (photo) go({ type: 'Interact', targetId: SPOT_OF[w] });
  go({ type: 'Visit', locationId: 'loc.trail.official' }); s = settle(s);
  go({ type: 'CompleteQuest', questId: 'CH2-D1-WALK-001' });
  go({ type: 'Visit', locationId: 'loc.camp.mullerthal' }); s = settle(s);
  seconds += moveSeconds({ type: 'Visit', locationId: 'loc.camp.mullerthal' });
  s = { ...s, clock: advance(s.clock, Math.max(0, clockEv.minutes - s.clock.minutes)) };
  return { sim: s, seconds };
}

const NODES = (GAME_DEFS.story?.dialogues[DINNER_SCENE]?.nodes ?? {}) as Record<string, { choices?: unknown[]; next?: string; end?: true }>;
interface Picks { readonly dish: number; readonly club: number; readonly ask: number }
const ALL_PICKS: Picks[] = [0, 1, 2].flatMap((dish) => [0, 1].flatMap((club) => [0, 1].map((ask) => ({ dish, club, ask }))));
const pickOf = (p: Picks, node: string): number => (node === 'dish' ? p.dish : node === 'g3' ? p.club : p.ask);

interface Played { readonly sim: SimState; readonly seconds: number; readonly lines: number; readonly nodes: string[] }
/** Вечеря: дотик до столу (режисер), потім гравець читає («Далі») і вибирає за `p`, доки розмова не закриється. */
function dinner(from: SimState, p: Picks): Played {
  let s = from;
  const mv = spotMove(s, DINNER_SPOT);
  expect(mv, 'стіл живий — дотик дає StartScene').toEqual({ type: 'StartScene', sceneId: DINNER_SCENE, facts: [] });
  let seconds = SECONDS.walkOnMap + moveSeconds(mv as never);   // підійти до столу + перший рядок
  s = run(s, mv as object);
  const seen: string[] = [];
  let lines = 1;
  for (let i = 0; s.game.dialogue !== null; i++) {
    if (i > 40) throw new Error('розмова не закривається');
    expect(s.game.dialogue.id).toBe(DINNER_SCENE);
    const id = s.game.dialogue.node;
    seen.push(id);
    const node = NODES[id];
    const m = node?.choices ? { type: 'Choose', choice: pickOf(p, id) } : { type: 'Continue' };
    seconds += moveSeconds(m as never);
    lines++;
    s = run(s, m);
  }
  return { sim: s, seconds, lines, nodes: seen };
}
/** Стан гри без розмови й лічильників команд (processed, seq): те, що сцена не має права змінити. */
const gameFacts = (g: GameState): string => JSON.stringify(Object.fromEntries(Object.entries(g).filter(([k]) => k !== 'processed' && k !== 'dialogue' && k !== 'seq')));

describe('GAME-288 · розмова без глухих кутів (оракул по графу JSON; мутація — зламаний choices[].next)', () => {
  interface RawNode { id: string; choices?: { next: string; when?: unknown }[]; next?: string; end?: true; branches?: { next: string }[] }
  interface RawDlg { start: string; nodes: RawNode[] }
  const raw = JSON.parse(readFileSync(new URL('../../content/dialogue/ch2-dinner.json', import.meta.url), 'utf8')) as RawDlg;
  /** Незалежний від валідатора оракул: порушення словами. Порожньо — розмова чесна. */
  function problems(d: RawDlg): string[] {
    const out: string[] = [];
    const by = new Map(d.nodes.map((x) => [x.id, x]));
    for (const x of d.nodes) {
      for (const c of x.choices ?? []) if (!by.has(c.next)) out.push(`${x.id}: вибір веде на неіснуючий вузол «${c.next}»`);
      if (x.next !== undefined && !by.has(x.next)) out.push(`${x.id}: next веде на неіснуючий вузол «${x.next}»`);
      for (const b of x.branches ?? []) if (!by.has(b.next)) out.push(`${x.id}: гілка веде на неіснуючий вузол «${b.next}»`);
    }
    // з кожного вузла — безумовний шлях до end: next, а також вибір БЕЗ when (гілки й умовні вибори не рахуються)
    const exits = (x: RawNode): string[] => [...(x.next !== undefined ? [x.next] : []), ...(x.choices ?? []).filter((c) => c.when === undefined).map((c) => c.next)];
    for (const x of d.nodes) {
      const seen = new Set<string>([x.id]);
      const q = [x];
      let ends = x.end === true;
      for (let i = 0; i < q.length && !ends; i++) for (const t of exits(q[i] as RawNode)) {
        const y = by.get(t);
        if (!y || seen.has(t)) continue;
        seen.add(t); q.push(y);
        if (y.end === true) ends = true;
      }
      if (!ends) out.push(`${x.id}: безумовного шляху до end немає`);
    }
    return out;
  }
  const mutate = (d: RawDlg, f: (x: RawNode) => void): RawDlg => { const c = structuredClone(d); f(c.nodes.find((x) => x.id === 'g3') as RawNode); return c; };

  it('оракул: у справжньому діалозі порушень нема; 17 вузлів, 3 вибори', () => {
    expect(problems(raw)).toEqual([]);
    expect(raw.nodes.length).toBe(17);
    expect(raw.nodes.filter((x) => x.choices).length).toBe(3);
  });
  it('МУТАЦІЯ «зламано choices[].next» → оракул червоніє (текст порушення)', () => {
    const bad = problems(mutate(raw, (x) => { const c = x.choices?.[0]; if (c) c.next = 'club-nowhere'; }));
    expect(bad.length).toBeGreaterThan(0);
    expect(bad[0]).toBe('g3: вибір веде на неіснуючий вузол «club-nowhere»');
  });
  it('МУТАЦІЯ «вузол без виходу» (прибрано next) → оракул: безумовного шляху до end немає', () => {
    const d = structuredClone(raw);
    delete (d.nodes.find((x) => x.id === 'club3') as RawNode).next;
    expect(problems(d)).toContain('club3: безумовного шляху до end немає');
  });
  const loaded = loadContent('content');
  const TODAY = '2026-11-09';
  it('справжній валідатор: чистий контент; МУТАЦІЯ choices[].next → DIALOGUE_REF_MISSING саме на цьому вузлі; МУТАЦІЯ без виходу → DIALOGUE_DEAD_END', () => {
    expect(loaded.status).toBe('OK');
    const codes = (c: unknown): { code: string; where: string; msg?: string }[] => validate(c, { today: TODAY }).filter((i: { where: string }) => i.where.startsWith('dlg.ch2-dinner'));
    expect(codes(loaded.content)).toEqual([]);
    const broken = structuredClone(loaded.content) as { dialogues: { id: string; nodes: { id: string; choices?: { next: string }[]; next?: string }[] }[] };
    const g3 = broken.dialogues.find((d) => d.id === DINNER_SCENE)?.nodes.find((x) => x.id === 'g3')?.choices?.[0];
    if (!g3) throw new Error('у діалозі нема g3.choices[0]');
    g3.next = 'club-nowhere';
    const red = codes(broken);
    expect(red.map((i) => i.code), JSON.stringify(red)).toContain('DIALOGUE_REF_MISSING');
    const dead = structuredClone(loaded.content) as typeof broken;
    const club3 = dead.dialogues.find((d) => d.id === DINNER_SCENE)?.nodes.find((x) => x.id === 'club3');
    if (!club3) throw new Error('у діалозі нема club3');
    delete club3.next;
    expect(codes(dead).map((i) => i.code)).toContain('DIALOGUE_DEAD_END');
  });
  it('тексти: кожен ключ діалогу — у uk і en (content/locales), немає ключа без пари', () => {
    const keys = (l: Record<string, string>): string[] => Object.keys(l).filter((k) => k.startsWith('dlg.ch2-dinner.')).sort();
    expect(keys(ukC)).toEqual(keys(enC));
    for (const x of raw.nodes) for (const k of [`dlg.ch2-dinner.${x.id}`, ...(x.choices ?? []).map((_, i) => `dlg.ch2-dinner.${x.id}.c${i + 1}`)]) { expect((ukC as Record<string, string>)[k], `uk/${k}`).toBeTruthy(); expect((enC as Record<string, string>)[k], `en/${k}`).toBeTruthy(); }
    expect((ukC as Record<string, string>)['dlg.ch2-dinner.club3']).toContain('три країни');
    expect((enC as Record<string, string>)['dlg.ch2-dinner.club1']).toContain('Travellers’ Club');
  });
});

describe('GAME-288 · вечеря завершувана за будь-якої погоди, з фото і без, усіма 12 шляхами вибору', () => {
  for (const w of WEATHERS) for (const photo of [true, false]) {
    it(`погода ${w}, фото ${photo ? 'є' : 'нема'}: стіл живий → сцена → розмова закрита; стан (прапорці, речі, нагороди, квести, гроші) і простір станів перебору — як до вечері`, () => {
      const day = toDinner(w, photo);
      expect(dinnerDue(day.sim)).toBe(true);
      expect(liveSpot(day.sim, DINNER_SPOT), 'стіл живий').toBe(true);
      expect(day.sim.game.quests[DINNER_QUEST]).toEqual({ status: 'active', done: ['o1-mullerthal'] });
      const before = gameFacts(day.sim.game);
      expect(storyMoves(day.sim, GAME_DEFS), 'до вечері сюжет квест не завершує').toEqual([]);
      const hashBefore = stateHash(exploreView(day.sim.game, STORY));
      const lineCounts = new Set<number>();
      const endings = new Set<string>();
      for (const p of ALL_PICKS) {
        const r = dinner(day.sim, p);
        expect(r.sim.game.dialogue, `шлях ${JSON.stringify(p)}: розмову закрито`).toBeNull();
        expect(gameFacts(r.sim.game), `шлях ${JSON.stringify(p)}: сцена нічого не змінила в стані гри`).toBe(before);
        expect(stateHash(exploreView(r.sim.game, STORY)), `шлях ${JSON.stringify(p)}: простір станів перебору не виріс`).toBe(hashBefore);
        expect(r.nodes.at(-1)).toBe('close');
        expect(r.nodes).toContain(photo ? 'g2p' : 'g2');
        expect(r.nodes, 'гілка фото — лише коли кадр знято').not.toContain(photo ? 'g2' : 'g2p');
        expect(dinnerPlayed(r.sim), 'запис StartScene у журналі').toBe(true);
        expect(storyMoves(r.sim, GAME_DEFS), 'після вечері сюжет сам завершує день-квест').toEqual([FINISH]);
        expect(liveSpot(r.sim, DINNER_SPOT), 'після вечері стіл гасне').toBe(false);
        expect(spotMove(r.sim, DINNER_SPOT), 'і німий').toBeNull();
        lineCounts.add(r.lines);
        endings.add(r.nodes.join('>'));
      }
      expect(endings.size, '12 різних шляхів: 3 страви × 2 × 2').toBe(12);
      expect([...lineCounts], 'довжина шляху однакова: вибір косметичний').toHaveLength(1);
    });
  }
});

describe('GAME-288 · розділ 1 цього не бачить; сцена лише на своєму етапі й місці', () => {
  it('у розділі 1 (кінець, дорога додому) стіл мертвий, сцена — відмова ядра, moves() її не пропонує', () => {
    for (const sim of [base, onRoadHome()]) {
      expect(dinnerDue(sim)).toBe(false);
      expect(liveSpot(sim, DINNER_SPOT)).toBe(false);
      expect(spotMove(sim, DINNER_SPOT)).toBeNull();
      expect(refused(sim, { type: 'StartScene', sceneId: DINNER_SCENE, facts: [] })).toBe('QUEST_NOT_ACTIVE');
      expect(moves(sim.game, GAME_DEFS).some((m) => m.type === 'StartScene')).toBe(false);
    }
  });
  it('до повернення з прогулянки (квест вечора ще не активний), поза Мюллерталем і після завершення квесту — стіл мертвий', () => {
    const day = toDinner('sunny', true);
    const early = run({ ...base, worldSeed: seedFor('sunny') }, { type: 'StartChapter2' });
    expect(dinnerDue(early), 'розділ 2 розпочато, вечора ще нема').toBe(false);
    expect(refused(early, { type: 'StartScene', sceneId: DINNER_SCENE, facts: [] })).toBe('QUEST_NOT_ACTIVE');
    const away = run(day.sim, { type: 'Visit', locationId: 'loc.trail.official' });
    expect(dinnerDue(settle(away)), 'на стежці столу нема').toBe(false);
    const done = run(day.sim, { type: 'CompleteQuest', questId: DINNER_QUEST });
    expect(dinnerDue(done), 'квест завершено — день пішов далі').toBe(false);
    expect(refused(done, { type: 'StartScene', sceneId: DINNER_SCENE, facts: [] })).toBe('QUEST_NOT_ACTIVE');
  });
  it('до 18:00 вечері нема (стіл мертвий, сюжет нічого не шле); з 18:00 — є', () => {
    const day = toDinner('sunny', true);
    const early = { ...day.sim, clock: { ...day.sim.clock, minutes: day.sim.clock.minutes - 60 * 4 } };   // 15:00
    expect(dinnerDue(early)).toBe(false);
    expect(liveSpot(early, DINNER_SPOT)).toBe(false);
    expect(storyMoves(early, GAME_DEFS)).toEqual([]);
    expect(dinnerDue(day.sim)).toBe(true);
  });
  it('вечеря необов’язкова: лягти можна й без неї (з 18:00), день закривається; уранці день-квест завершується сам — день 2 відкрито, softlock-у нема', () => {
    const day = toDinner('rain', false);
    let s = run(day.sim, { type: 'Sleep' });
    expect(dinnerPlayed(s)).toBe(false);
    expect(s.game.quests['CH2-D1-SUMMARY-001']?.status, 'сон без вечері квест не завершує').toBe('active');
    expect(dinnerDue(s), 'на ранок вечері вже нема (день 1 минув)').toBe(false);
    expect(storyMoves(s, GAME_DEFS), 'але сюжет закриває день-квест').toEqual([FINISH]);
    s = run(s, FINISH);
    expect(s.game.quests['CH2-D2-PLAN-001']?.status).toBe('active');
    expect(summaryOffer(s, GAME_DEFS).summary?.day, 'підсумок сну — день 1 розділу').toBe(1);
  });
  it('вечеря необов’язкова: о 22:30 без неї сюжет теж завершує день-квест (ніч — кінець вечора), потім сон', () => {
    const day = toDinner('sunny', false);
    const late = { ...day.sim, clock: advance(day.sim.clock, 60 * 3 + 30) };   // 22:30
    expect(dinnerDue(late), 'стіл ще живий, а сюжет чекає вечері до ночі').toBe(true);
    expect(storyMoves(late, GAME_DEFS)).toEqual([FINISH]);
  });
  it('розмова не лишає слідів у квестах: перша репліка не завершує квест і не ставить прапорців', () => {
    const day = toDinner('sunny', false);
    const r = dinner(day.sim, ALL_PICKS[0] as Picks);
    expect(r.sim.game.quests).toEqual(day.sim.game.quests);
    expect(r.sim.game.flags).toEqual(day.sim.game.flags);
  });
});

describe('GAME-288 · сон = сейв, підсумок дня 1, час сцени', () => {
  /** Увесь вечір: повернення з лісу → вечеря → (сюжет завершує квест) → сон; секунди — модель часу гравця. */
  function eveningWhole(w: Weather, p: Picks): { sim: SimState; seconds: number; dinnerSeconds: number } {
    const day = toDinner(w, true);
    const d = dinner(day.sim, p);
    let s = d.sim;
    for (const m of storyMoves(s, GAME_DEFS)) s = run(s, m);   // сюжет сам завершує день-квест (час гравця 0)
    expect(s.game.quests[DINNER_QUEST]?.status).toBe('completed');
    s = run(s, { type: 'Sleep' });
    const seconds = day.seconds + d.seconds + moveSeconds({ type: 'Sleep' } as never) + SECONDS.summary;
    return { sim: s, seconds, dinnerSeconds: d.seconds };
  }

  it('сон закриває день 1 розділу 2: підсумок «день 1», 3 квести дня, наступний — «Закрита стежка», тизер завтра; en і uk', () => {
    const { sim } = eveningWhole('sunny', ALL_PICKS[0] as Picks);
    expect(daysEnded(sim, GAME_DEFS), 'у грі це вже четвертий завершений день (три — розділ 1)').toBe(4);
    const o = summaryOffer(sim, GAME_DEFS).summary;
    expect(o?.day, 'день розділу, а не день гри').toBe(1);
    expect(o?.nextKey).toBe('q.ch2-d2-plan-001');
    expect(o?.tomorrowKey).toBe('sum.tomorrow.ch2.1');
    const quests = o?.sections.find((x) => x.kind === 'quests')?.keys ?? [];
    expect(quests).toEqual(['q.ch2-arrival-001', 'q.ch2-d1-walk-001', 'q.ch2-d1-summary-001']);
    expect(o?.sections.find((x) => x.kind === 'night')?.keys).toEqual(['sum.night.tent']);
    for (const k of [...quests, 'q.ch2-d2-plan-001']) { expect((ukC as Record<string, string>)[k], `uk/${k}`).toBeTruthy(); expect((enC as Record<string, string>)[k], `en/${k}`).toBeTruthy(); }
    for (const l of [uk, en] as Record<string, string>[]) { expect(l['sum.tomorrow.ch2.1']?.length).toBeGreaterThan(10); expect((l['sum.tomorrow.ch2.1'] ?? '').length, 'коротко').toBeLessThanOrEqual(90); }
    expect(tomorrowKeyOf(3), 'тизери розділу 1 не зачеплено: кінець розділу — без тизера').toBeNull();
  });

  it('зсув дня розділу 2: chapterDayBase = 3, день = 4 − 3 = 1 (мутація «зсув прибрано» — день 4 — червоніє в тесті вище, див. опис PR)', () => {
    const { sim } = eveningWhole('sunny', ALL_PICKS[0] as Picks);
    const raw = daysEnded(sim, GAME_DEFS);
    expect(raw, 'без зсуву підсумок показав би цей номер').toBe(4);
    expect(chapterDayBase(sim, GAME_DEFS, raw), 'зсув = три дні розділу 1').toBe(3);
    expect(raw - chapterDayBase(sim, GAME_DEFS, raw), 'день розділу 2').toBe(1);
    expect(chapterDayBase(base, GAME_DEFS, 3), 'розділ 1: зсуву нема').toBe(0);
  });

  it('сейв після сну: < 500 КБ (число — в описі PR), завантажується, день 2 розділу відкрито, вечеря в сейві не ожила', () => {
    const { sim } = eveningWhole('sunny', ALL_PICKS[0] as Picks);
    const json = serialize(sim);
    const bytes = new TextEncoder().encode(json).length;
    process.stdout.write(`GAME-288 save bytes after sleep: ${bytes}\n`);
    expect(bytes, 'бажана межа YouTube — 500 КіБ').toBeLessThan(500 * 1024);
    const l = fromSave(json, { story: STORY });
    if (!l.ok) throw new Error(`${l.code} ${l.detail}`);
    expect(l.sim.game.quests[DINNER_QUEST]?.status).toBe('completed');
    expect(l.sim.game.quests['CH2-D2-PLAN-001']?.status).toBe('active');
    expect(dinnerDue(l.sim)).toBe(false);
    expect(serialize(l.sim), 'круг сейву стабільний').toBe(json);
  });

  it('час вечора за моделлю гравця (time-model.ts): повернення + стіл + вечеря + квест + сон + підсумок; усі 12 шляхів — число в описі PR', () => {
    const secs = ALL_PICKS.flatMap((p) => WEATHERS.map((w) => eveningWhole(w, p).seconds));
    const lo = Math.min(...secs);
    const hi = Math.max(...secs);
    process.stdout.write(`GAME-288 evening model seconds: min ${lo}, max ${hi}; dinner scene alone ${eveningWhole('sunny', ALL_PICKS[0] as Picks).dinnerSeconds}\n`);
    expect(lo, 'вечір — не порожній').toBeGreaterThan(60);
    expect(hi, 'і не нескінченний').toBeLessThan(240);
    expect(hi - lo, 'вибір косметичний: час шляхів однаковий').toBeLessThanOrEqual(0);
  });
});

describe('GAME-288 · сейв для e2e (tests/e2e/fixtures/ch2-dinner.json)', () => {
  const file = new URL('../../tests/e2e/fixtures/ch2-dinner.json', import.meta.url);
  it('сейв = те, що ядро збирає зараз; G288_WRITE=1 переписує', () => {
    const json = `${serialize(toDinner('sunny', true).sim)}\n`;
    if (process.env.G288_WRITE === '1') { writeFileSync(file, json); return; }
    expect(existsSync(file), 'немає фікстури: G288_WRITE=1').toBe(true);
    expect(readFileSync(file, 'utf8'), 'фікстура розійшлась із ядром').toBe(json);
    const l = fromSave(json, { story: STORY });
    if (!l.ok) throw new Error(`${l.code} ${l.detail}`);
    expect(dinnerDue(l.sim), 'у сейві вечеря готова').toBe(true);
  });
});

describe('GAME-288 · мапа Мюллерталя має стіл вечері', () => {
  interface Tmj { layers: { name: string; objects?: { name: string; type: string; x: number; y: number }[] }[] }
  const map = JSON.parse(readFileSync(new URL('../../public/maps/mullerthal.tmj', import.meta.url), 'utf8')) as Tmj;
  it('obj.dinner — якір (anchor, як кадри GAME-287) на мапі, один; назва збігається з DINNER_SPOT', () => {
    const objs = (map.layers.find((l) => l.name === 'objects')?.objects ?? []).filter((o) => o.name === DINNER_SPOT);
    expect(objs).toHaveLength(1);
    expect(objs[0]?.type).toBe('anchor');
  });
});

// Захист від випадкового «мертвого» export: дані сцени справді з контенту, а не з пам'яті тесту.
describe('GAME-288 · сцена у даних', () => {
  it('dlg.ch2-dinner — сцена етапу CH2-D1-SUMMARY-001 без фактів (стан не чіпає)', () => {
    const d = GAME_DEFS.story?.dialogues[DINNER_SCENE];
    expect(d?.scene).toEqual({ facts: [], atQuest: DINNER_QUEST });
    expect(dispatch(ch1End().game, cmdOf({ type: 'StartScene', sceneId: DINNER_SCENE, facts: ['f.photo-ch2-orchid'] }), GAME_DEFS).ok, 'стартер не вигадає факт').toBe(false);
  });
});
