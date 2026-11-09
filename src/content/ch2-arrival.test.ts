/// <reference types="node" />
// GAME-286 · CH2-ARRIVAL: старт розділу 2 у рантаймі, дні розділу — відносно старту, Мюллерталь зачинений у розділі 1, ядро ≡ валідатор для розділу 2.
// Закон 1: кожен сторож показано червоним мутацією (див. опис PR). Фікстури: tests/e2e/fixtures/ch1-end.json (v5) і tests/saves/v4-ch1-end.json (старий сейв v4);
// `G286_WRITE=1 npx vitest run src/content/ch2-arrival.test.ts` переписує їх; без прапорця тест звіряє їх із тим, що ядро збирає зараз.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildIndex } from '../../scripts/validator/checks.mjs';
import { project } from '../../scripts/validator/combos.mjs';
import { dispatch, type Command } from '../core/commands';
import { fromSave, serialize } from '../core/save';
import { stateHash } from '../core/hash';
import type { GameState } from '../core/state';
import { CHAPTER2_START, chapter2Startable, luxembourgStamp, questOpen, sleepCap } from '../core/story';
import { ch1End, onRoadHome } from './ch1-end.fixture';
import { exploreView, moves, type Move } from './moves';
import { GAME_DEFS } from './slice-defs';
import { CONTENT, STORY } from './story';
import { isCh1Quest } from './ch2-scope.test.helpers';

const E2E = new URL('../../tests/e2e/fixtures/ch1-end.json', import.meta.url);
const OLD = new URL('../../tests/saves/v4-ch1-end.json', import.meta.url);
let n = 0;
const send = (g: GameState, m: object): ReturnType<typeof dispatch> => dispatch(g, { ...m, commandId: `a286-${n++}` } as Command, GAME_DEFS);
const ok = (g: GameState, m: object): GameState => { const r = send(g, m); if (!r.ok) throw new Error(`${JSON.stringify(m)} → ${r.code}`); return r.state; };
const started = (): GameState => ok(ch1End().game, { type: 'StartChapter2' });
const SLEEP: Move = { type: 'Sleep' };

describe('GAME-286 · фікстури кінця розділу 1', () => {
  it('фікстури = те, що ядро збирає зараз', () => {
    const json = `${serialize(ch1End())}\n`;
    const old = `${JSON.stringify({ ...JSON.parse(json), schemaVersion: 4 })}\n`;
    if (process.env.G286_WRITE === '1') { writeFileSync(E2E, json); writeFileSync(OLD, old); return; }
    expect(existsSync(E2E) && existsSync(OLD), 'немає фікстур: G286_WRITE=1').toBe(true);
    expect(readFileSync(E2E, 'utf8'), 'e2e-фікстура розійшлась із ядром').toBe(json);
    expect(readFileSync(OLD, 'utf8'), 'старий сейв розійшовся з ядром').toBe(old);
  });
});

describe('GAME-286 · запуск розділу 2 у рантаймі', () => {
  it('до кінця розділу 1 StartChapter2 відхилено; після — активує CH2-ARRIVAL-001 один раз', () => {
    expect(send(onRoadHome().game, { type: 'StartChapter2' }).ok, 'розділ 1 ще триває').toBe(false);
    const end = ch1End().game;
    expect(end.campaignEnded).toBe(true);
    expect(chapter2Startable(end, STORY)).toBe(true);
    const g = ok(end, { type: 'StartChapter2' });
    expect(g.quests[CHAPTER2_START]).toEqual({ status: 'active', done: [] });
    expect(g.campaignEnded).toBe(false);
    expect(g.chapterStart).toBe(end.slept ?? 0);
    expect(chapter2Startable(g, STORY)).toBe(false);
    expect(send(g, { type: 'StartChapter2' }).ok, 'удруге — не можна').toBe(false);
  });

  it('прибуття: дорога → Мюллерталь → господиня → вибір місця → CH2-ARRIVAL-001 завершено, далі CH2-D1-WALK-001; печатка лише після прибуття', () => {
    let g = started();
    expect(luxembourgStamp(g), 'розділ розпочато, але родина ще не приїхала: печатки нема').toBe(false);
    g = ok(g, { type: 'Visit', locationId: 'loc.road' });
    expect(luxembourgStamp(g)).toBe(false);
    g = ok(g, { type: 'Visit', locationId: 'loc.camp.mullerthal' });
    expect(g.quests[CHAPTER2_START]?.done).toEqual(['o1-mullerthal']);
    expect(luxembourgStamp(g), 'приїхали — печатка є').toBe(true);
    g = ok(g, { type: 'Talk', npcId: 'npc.host-mullerthal' });
    expect(g.dialogue?.id).toBe('dlg.host-mullerthal');
    g = ok(g, { type: 'Choose', choice: 0 });   // «Дякуємо! Дорога була чудова.»
    g = ok(g, { type: 'Choose', choice: 3 });   // «Ми ще роззирнемось.» — вибору місця нема, ціль не зараховано
    expect(g.quests[CHAPTER2_START]?.done, 'розмова без вибору місця ціль не закриває').toEqual(['o1-mullerthal']);
    g = ok(g, { type: 'Continue' });
    g = ok(g, { type: 'Talk', npcId: 'npc.host-mullerthal' });
    g = ok(g, { type: 'Choose', choice: 0 });
    g = ok(g, { type: 'Choose', choice: 1 });   // біля струмка
    expect(g.flags).toContain('f.ch2-spot-stream');
    g = ok(g, { type: 'Continue' });
    g = ok(g, { type: 'CompleteQuest', questId: CHAPTER2_START });
    expect(g.quests[CHAPTER2_START]?.status).toBe('completed');
    expect(g.quests['CH2-D1-WALK-001']?.status).toBe('active');
  });
});

describe('GAME-286 · дні розділу 2 — відносно його старту', () => {
  it('після старту ворота дня 2 і 3 зачинені, відчиняються лише після сну розділу; стеля сну — від старту', () => {
    let g = started();
    expect(g.chapterStart, 'сон кінця розділу 1 уже в лічильнику').toBeGreaterThan(0);
    const open = (id: string): boolean => questOpen(STORY, g, id);
    expect([open('CH2-D2-PLAN-001'), open('CH2-SCHENGEN-001')], 'день 1 розділу: ворота днів 2 і 3 зачинені').toEqual([false, false]);
    g = ok(g, SLEEP);
    expect([open('CH2-D2-PLAN-001'), open('CH2-SCHENGEN-001')], 'після першого сну — день 2').toEqual([true, false]);
    g = ok(g, SLEEP);
    expect([open('CH2-D2-PLAN-001'), open('CH2-SCHENGEN-001')], 'після другого — день 3').toEqual([true, true]);
    for (let i = 0; i < 6; i++) g = ok(g, SLEEP);
    expect(g.slept, 'лічильник росте до стелі, відрахованої від старту розділу').toBe(sleepCap(g));
  });

  it('розділ 1 міряє дні як і раніше — абсолютним лічильником', () => {
    expect(questOpen(STORY, { slept: 1 }, 'CH1-D2-001')).toBe(true);
    expect(questOpen(STORY, { slept: 0 }, 'CH1-D2-001')).toBe(false);
    expect(questOpen(STORY, { slept: 1, chapterStart: 1 }, 'CH1-D2-001'), 'маркер розділу 2 розділу 1 не стосується').toBe(true);
  });
});

describe('GAME-286 · Мюллерталь у розділі 1 і старі сейви', () => {
  it('loc.camp.mullerthal не відвідується, поки розділ 1 не завершено (ядро відмовляє, moves() не пропонує)', () => {
    const road = onRoadHome().game;
    expect(road.quests['CH1-D3-HOME-001']?.status).not.toBe('completed');
    const r = send(road, { type: 'Visit', locationId: 'loc.camp.mullerthal' });
    expect(r.ok, 'Visit у Мюллерталь до кінця розділу 1').toBe(false);
    expect(moves(road, GAME_DEFS).some((m) => m.type === 'Visit' && (m as { locationId: string }).locationId === 'loc.camp.mullerthal')).toBe(false);
    const fresh = send(ch1End().game, { type: 'Visit', locationId: 'loc.camp.mullerthal' });
    expect(fresh.ok === false || fresh.state.quests[CHAPTER2_START] === undefined, 'до StartChaper2 розділу 2 нема').toBe(true);
  });

  it('старий сейв v4 (кінець розділу 1, без chapterStart) завантажується; розділ 2 запускається; збережена гра розділу 2 переживає завантаження', () => {
    const l = fromSave(readFileSync(OLD, 'utf8'), { story: STORY });
    if (!l.ok) throw new Error(`${l.code} ${l.detail}`);
    expect(l.sim.game.chapterStart).toBeUndefined();
    expect(chapter2Startable(l.sim.game, STORY)).toBe(true);
    const sim = { ...l.sim, game: ok(l.sim.game, { type: 'StartChapter2' }) };
    const back = fromSave(serialize(sim), { story: STORY });
    if (!back.ok) throw new Error(`${back.code} ${back.detail}`);
    expect(back.sim.game.quests[CHAPTER2_START]?.status, 'reopenChapter не прибирає CH2-ARRIVAL-001 як осиротілий').toBe('active');
    expect(back.sim.game.chapterStart).toBe(sim.game.chapterStart);
  });
});

describe('GAME-286 · completed() ≡ status === completed для квесту, якого нема в s.quests', () => {
  it('Visit у локацію з unlockedBy: moves() і ядро збігаються на відсутньому, активному, завершеному й відхиленому ключі', () => {
    const base = onRoadHome().game;
    for (const [id, l] of Object.entries(STORY.locations)) {
      if (l.unlockedBy === undefined || id === 'loc.camp.mullerthal' && false) continue;
      for (const status of [undefined, 'active', 'completed', 'declined'] as const) {
        const quests = Object.fromEntries(Object.entries(base.quests).filter(([q]) => q !== l.unlockedBy));
        const g = { ...base, quests: status === undefined ? quests : { ...quests, [l.unlockedBy]: { status, done: [] } } } as GameState;
        const offered = moves(g, GAME_DEFS).some((m) => m.type === 'Visit' && (m as { locationId: string }).locationId === id);
        const r = send(g, { type: 'Visit', locationId: id });
        const locked = !r.ok && r.code === 'LOCKED';
        if (offered) expect(locked, `${id}/${String(status)}: moves() пропонує, ядро каже LOCKED`).toBe(false);
        if (status !== 'completed') expect(r.ok && !locked, `${id}/${String(status)}: ключ не завершено, а ядро пустило`).toBe(false);
        if (status === undefined) expect(offered, `${id}: ключа нема в s.quests — moves() не пропонує`).toBe(false);
      }
    }
  });
});

describe('GAME-286 · розділ 2: ядро ≡ валідатор (досяжні квести)', () => {
  const ALLOWED = new Set(['Visit', 'Sleep', 'Talk', 'Choose', 'Continue', 'CompleteQuest', 'DeclineQuest']);
  it('множина квестів розділу 2, яку відкриває ядро від StartChapter2, = досяжні валідатору (CH1 фільтр не застосовується)', () => {
    const combo = { profile: 'profile.family-teen', transport: 'transport.car', animal: 'animal.cat' };
    const expected = [...buildIndex(project(CONTENT, combo)).reachable].filter((q) => !isCh1Quest(q)).sort();
    expect(expected.length, 'валідатор бачить розділ 2').toBeGreaterThan(10);
    const first = started();
    const key = (s: GameState): string => stateHash(exploreView(s, STORY));
    const seen = new Map<string, GameState>([[key(first), first]]);
    const queue = [first];
    for (let s = queue.shift(); s; s = queue.shift()) {
      for (const m of moves(s, GAME_DEFS)) {
        if (!ALLOWED.has(m.type)) continue;
        const r = send(s, m);
        if (!r.ok) continue;
        const k = key(r.state);
        if (!seen.has(k)) { seen.set(k, r.state); queue.push(r.state); }
      }
      if (seen.size > 100_000) throw new Error('простір станів вибухнув');
    }
    const opened = new Set<string>();
    for (const s of seen.values()) for (const q of Object.keys(s.quests)) if (!isCh1Quest(q)) opened.add(q);
    expect([...opened].sort()).toEqual(expected);
  }, 240_000);
});

describe('GAME-295 · Мюллерталь відчиняє «Продовжити подорож», а не сам кінець розділу 1', () => {
  const VISIT = { type: 'Visit', locationId: 'loc.camp.mullerthal' };
  const TALK = { type: 'Talk', npcId: 'npc.host-mullerthal' };
  const offered = (g: GameState, m: object): boolean => moves(g, GAME_DEFS).some((x) => JSON.stringify(x) === JSON.stringify(m));
  it('кінець розділу 1 без старту розділу 2: ядро — LOCKED, moves() не пропонує', () => {
    const g = ch1End().game;
    expect(g.quests['CH1-D3-HOME-001']?.status).toBe('completed');   // справді кінець розділу 1 (інакше тест нічого не доводить)
    for (const m of [VISIT, TALK]) {
      const r = send(g, m);
      expect(!r.ok && r.code, JSON.stringify(m)).toBe('LOCKED');
      expect(offered(g, m), JSON.stringify(m)).toBe(false);
    }
  });
  it('після «Продовжити подорож» — їдемо й говоримо з господинею', () => {
    const g = started();
    expect(offered(g, VISIT)).toBe(true);
    const there = ok(g, VISIT);
    expect(offered(there, TALK)).toBe(true);
    ok(there, TALK);
  });
});
