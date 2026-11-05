// GAME-256 · сюжет чекає на день: кроки днів 2–3 — лише після сну, вечірні — після 18:00. Кожен сторож має негативний контроль («мутація»):
// той самий оракул на контенті БЕЗ воріт показує протилежне — отже, перевірка вміє почервоніти (закон 1).
import { describe, expect, it } from 'vitest';
import { dispatch, type Command } from '../core/commands';
import { dayRanges } from '../core/day-summary';
import type { CoreDefs, StoryDefs } from '../core/defs';
import { newSim, step, type JournalEntry, type SimState } from '../core/sim';
import { initialState, type GameState } from '../core/state';
import { gateOpen, SLEEP_CAP } from '../core/story';
import { GAME_START_MINUTE } from '../core/clock';
import { validate } from '../../scripts/validator/checks.mjs';
import { SLEEP_CAP as VALIDATOR_SLEEP_CAP } from '../../scripts/validator/codes.mjs';
import { runBot, type EndMemo } from './bot';
import { heldGate } from './map-first';
import { pendingWave } from './director';
import { moves } from './moves';
import { GAME_DEFS } from './slice-defs';
import { CONTENT, STORY } from './story';
import { goalOf } from '../view/story-offer';

/** Ігрові хвилини дня сюжету `day` (з 1) на годиннику `hh:mm`. */
const at = (day: number, hh: number, mm = 0): number => (day - 1) * 1440 + hh * 60 + mm - GAME_START_MINUTE;

const stripGates = (st: StoryDefs): StoryDefs => ({ ...st, quests: Object.fromEntries(Object.entries(st.quests).map(([id, q]) => { const { gate: _g, ...rest } = q; void _g; return [id, rest]; })) });
const defsWith = (st: StoryDefs): CoreDefs => ({ ...GAME_DEFS, story: st });
const NO_GATES = defsWith(stripGates(STORY));

/** Стан табору: герой біля озера, поточний квест активний, спав `slept` разів. */
function camp(questId: string, slept: number, done: string[] = []): GameState {
  const base = initialState(0);
  return {
    ...base, slept,
    player: { profileId: 'profile.solo-explorer', transportId: 'transport.bike', animalId: 'animal.none', locationId: 'loc.camp.lake' },
    flags: ['f.night-tent'],
    quests: { [questId]: { status: 'active', done } },
  };
}
let n = 0;
const send = (s: GameState, m: Record<string, unknown>, defs: CoreDefs, now?: number) => dispatch(s, { ...m, commandId: `g${n++}` } as Command, defs, undefined, undefined, undefined, now);
const code = (r: ReturnType<typeof send>): string => (r.ok ? 'ok' : r.code);

describe('ворота дня сюжету (core): gateOpen', () => {
  it('день рахується за сном, година — за годинником; без годинника година відчинена', () => {
    expect(gateOpen(undefined, 0, 0)).toBe(true);
    expect(gateOpen({ day: 2 }, 0)).toBe(false);
    expect(gateOpen({ day: 2 }, 1)).toBe(true);
    expect(gateOpen({ day: 2, fromMinute: 1080 }, 1, at(2, 12))).toBe(false);
    expect(gateOpen({ day: 2, fromMinute: 1080 }, 1, at(2, 17, 59))).toBe(false);
    expect(gateOpen({ day: 2, fromMinute: 1080 }, 1, at(2, 18))).toBe(true);
    expect(gateOpen({ day: 2, fromMinute: 1080 }, 1)).toBe(true);
    expect(gateOpen({ day: 2, fromMinute: 1080 }, 0, at(1, 20))).toBe(false);   // вечір дня 1 день 2 не відчиняє — потрібен сон
    expect(gateOpen({ day: 2, fromMinute: 1080 }, 2, at(3, 9))).toBe(true);     // проспали вечір — крок лишається доступним
  });
  it('стеля сну збігається з валідатором', () => { expect(SLEEP_CAP).toBe(VALIDATOR_SLEEP_CAP); });
});

describe('крок дня 2 (CH1-D2-001): недоступний у день 1, доступний після сну', () => {
  const ready = (slept: number) => camp('CH1-D2-001', slept, ['morning']);
  it('день 1: відмова QUEST_NOT_YET; після сну — завершується', () => {
    expect(code(send(ready(0), { type: 'CompleteQuest', questId: 'CH1-D2-001' }, GAME_DEFS, at(1, 11)))).toBe('QUEST_NOT_YET');
    expect(code(send(ready(1), { type: 'CompleteQuest', questId: 'CH1-D2-001' }, GAME_DEFS, at(2, 7)))).toBe('ok');
  });
  it('негативний контроль: без воріт крок завершувався б у день 1 (оракул вміє червоніти)', () => {
    expect(code(send(ready(0), { type: 'CompleteQuest', questId: 'CH1-D2-001' }, NO_GATES, at(1, 11)))).toBe('ok');
  });
  it('сон справді відчиняє день: Sleep → slept 1, і лише раз за ніч (стеля)', () => {
    let s = ready(0);
    s = { ...s, player: { ...(s.player as NonNullable<GameState['player']>), locationId: 'loc.camp.lake' } };
    const r = send(s, { type: 'Sleep' }, GAME_DEFS, at(1, 19));
    expect(r.ok && r.state.slept).toBe(1);
    let c = r.ok ? r.state : s;
    for (let i = 0; i < 10; i++) { const x = send(c, { type: 'Sleep' }, GAME_DEFS, at(1, 19)); if (x.ok) c = x.state; }
    expect(c.slept).toBe(SLEEP_CAP);
    expect(code(send(s, { type: 'Sleep' }, GAME_DEFS, at(1, 12)))).toBe('CONDITION_FAILED');   // вдень спати не можна (GAME-242)
  });
  it('ціль «Далі» і перелік ходів: до сну бот/перебір мають хід Sleep, після — ні', () => {
    expect(moves(ready(0), GAME_DEFS).some((m) => m.type === 'Sleep')).toBe(true);
    expect(moves(ready(1), GAME_DEFS).some((m) => m.type === 'Sleep')).toBe(false);
    expect(moves(ready(0), NO_GATES).some((m) => m.type === 'Sleep')).toBe(false);
  });
});

describe('вечірній крок (CH1-D2-CAMP-001): недоступний о 12:00, доступний о 18:00', () => {
  const ready = camp('CH1-D2-CAMP-001', 1, ['dinner']);
  it('12:00 — QUEST_NOT_YET, 18:00 — ok', () => {
    expect(code(send(ready, { type: 'CompleteQuest', questId: 'CH1-D2-CAMP-001' }, GAME_DEFS, at(2, 12)))).toBe('QUEST_NOT_YET');
    expect(code(send(ready, { type: 'CompleteQuest', questId: 'CH1-D2-CAMP-001' }, GAME_DEFS, at(2, 18)))).toBe('ok');
  });
  it('негативний контроль: без воріт о 12:00 крок проходив би', () => {
    expect(code(send(ready, { type: 'CompleteQuest', questId: 'CH1-D2-CAMP-001' }, NO_GATES, at(2, 12)))).toBe('ok');
  });
  it('хвиля вечора (W4) не стартує вдень і стартує з 18:00; її строки — від 18:00 дня 2', () => {
    const g = camp('CH1-D2-CAMP-001', 1);
    expect(code(send(g, { type: 'StartWave', waveId: 'wave.ch1-day2-evening' }, GAME_DEFS, at(2, 12)))).toBe('QUEST_NOT_YET');
    const ok = send(g, { type: 'StartWave', waveId: 'wave.ch1-day2-evening' }, GAME_DEFS, at(2, 18));
    expect(ok.ok && ok.state.wave?.active?.startedAt).toBe(at(2, 18));
    expect(pendingWave(g, GAME_DEFS, at(2, 12))).toBeNull();
    expect(pendingWave(g, GAME_DEFS, at(2, 18))).toBe('wave.ch1-day2-evening');
    expect(pendingWave(g, NO_GATES, at(2, 12))).toBe('wave.ch1-day2-evening');   // контроль
  });
  it('вечерю в розмові з Елізою не запропоновано вдень: умова `quest active` враховує ворота', () => {
    const talking = (now: number, defs: CoreDefs): string => code(send({ ...ready, dialogue: { id: 'dlg.elise-greeting', node: 'hello' } }, { type: 'Choose', choice: 3 }, defs, now));
    const dinnerChoice = CONTENT.dialogues.find((d) => d.id === 'dlg.elise-greeting')?.nodes.find((x) => x.id === 'hello')?.choices?.findIndex((c) => JSON.stringify(c.when ?? '').includes('CH1-D2-CAMP-001')) ?? -1;
    expect(dinnerChoice).toBeGreaterThanOrEqual(0);
    const choose = (now: number, defs: CoreDefs): string => code(send({ ...ready, quests: { 'CH1-D2-CAMP-001': { status: 'active', done: [] } }, dialogue: { id: 'dlg.elise-greeting', node: 'hello' } }, { type: 'Choose', choice: dinnerChoice }, defs, now));
    void talking;
    expect(choose(at(2, 12), GAME_DEFS)).toBe('CONDITION_FAILED');
    expect(choose(at(2, 18), GAME_DEFS)).toBe('ok');
    expect(choose(at(2, 12), NO_GATES)).toBe('ok');
  });
  it('вечірня сцена біля вогнища (CH1-D2-FIRE-001) не відкривається вдень', () => {
    const fire = camp('CH1-D2-FIRE-001', 1);
    const scene = { type: 'StartScene', sceneId: 'dlg.ch1-fire', facts: [] };
    expect(code(send(fire, scene, GAME_DEFS, at(2, 12)))).toBe('QUEST_NOT_YET');
    expect(code(send(fire, scene, GAME_DEFS, at(2, 19)))).toBe('ok');
    expect(code(send(fire, scene, NO_GATES, at(2, 12)))).toBe('ok');
  });
});

describe('день 3 і хвиля виїзду: «до 11:00» дня 3 не спрацьовує в день 1', () => {
  it('хвиля виїзду з табору чекає на день 3 (два сни)', () => {
    const g = (slept: number): GameState => camp('CH1-D3-001', slept);
    expect(pendingWave(g(1), GAME_DEFS, at(2, 9))).toBeNull();
    expect(pendingWave(g(2), GAME_DEFS, at(3, 8))).toBe('wave.ch1-day3-checkout');
    expect(code(send(g(1), { type: 'CompleteQuest', questId: 'CH1-D3-001' }, GAME_DEFS, at(2, 9)))).toBe('QUEST_NOT_YET');
    const w = send(g(2), { type: 'StartWave', waveId: 'wave.ch1-day3-checkout' }, GAME_DEFS, at(3, 8));
    expect(w.ok && w.state.wave?.active?.tasks['walk-site']?.dueAt).toBe(at(3, 8) + 45);
  });
});

describe('ціль і вільний час: тупика немає', () => {
  const sim = (g: GameState, minutes: number): SimState => ({ ...newSim(1), game: g, clock: { minutes, accMs: 0, paused: false } });
  it('крок чекає день: до 18:00 — «вільний час», з 18:00 — «спати»; вечірній крок — «дочекатись вечора»', () => {
    const d = camp('CH1-D2-001', 0);
    expect(goalOf(d, STORY, at(1, 12))?.key).toBe('goal.wait.free');
    expect(goalOf(d, STORY, at(1, 18))?.key).toBe('goal.wait.sleep');
    expect(goalOf(camp('CH1-D2-CAMP-001', 1), STORY, at(2, 12))?.key).toBe('goal.wait.evening');
    expect(goalOf(camp('CH1-D2-CAMP-001', 1), STORY, at(2, 18))?.key).not.toMatch(/^goal\.wait/);
    expect(goalOf(d, stripGates(STORY), at(1, 12))?.key).not.toMatch(/^goal\.wait/);   // контроль
  });
  it('мапа табору каже, що робити (стрілки немає, слова є), і до 18:00 не веде до замкнених воріт', () => {
    expect(heldGate(sim(camp('CH1-D2-001', 0), at(1, 12)), GAME_DEFS)).toEqual({ questId: 'CH1-D2-001', sleepNext: true });
    expect(heldGate(sim(camp('CH1-D2-CAMP-001', 1), at(2, 12)), GAME_DEFS)).toEqual({ questId: 'CH1-D2-CAMP-001', sleepNext: false });
    expect(heldGate(sim(camp('CH1-D2-CAMP-001', 1), at(2, 18)), GAME_DEFS)).toBeNull();
    expect(heldGate(sim(camp('CH1-D2-001', 0), at(1, 12)), NO_GATES)).toBeNull();
  });
  it('у симуляції сон о 19:00 у наметі відчиняє ранок дня 2; автосон о 00:30 теж', () => {
    const run = (s: SimState, m: Record<string, unknown>): SimState => step(s, { kind: 'command', command: { ...m, commandId: `x${n++}` } as Command }, { defs: GAME_DEFS });
    const s0 = sim(camp('CH1-D2-001', 0, ['morning']), at(1, 19));
    const slept = run(s0, { type: 'Sleep' });
    expect(slept.game.slept).toBe(1);
    expect(slept.clock.minutes).toBe(at(2, 7));
    expect(code(send(slept.game, { type: 'CompleteQuest', questId: 'CH1-D2-001' }, GAME_DEFS, slept.clock.minutes))).toBe('ok');
    let auto = sim(camp('CH1-D2-001', 0, ['morning']), at(1, 23, 59));
    auto = step(auto, { kind: 'frame', realMs: 120_000 }, { defs: GAME_DEFS });
    expect(auto.game.slept).toBe(1);
    expect(auto.journal.at(-1)).toMatchObject({ type: 'Sleep', ref: 'auto' });
  });
});

describe('підсумок дня і сон: межі не подвоюються', () => {
  const J = (type: string, ref: string | null, i: number): JournalEntry => ({ at: i, commandId: `c${i}`, type, ref, cents: 0 }) as JournalEntry;
  it('крок із dayEnd день не закриває — його закриває сон; кінець розділу закриває сам', () => {
    const ends = new Set(Object.entries(STORY.quests).filter(([, q]) => q.end).map(([id]) => id));
    const journal = [J('CreateCharacter', null, 0), J('CompleteQuest', 'ST-005', 1), J('Pickup', 'item.firewood', 2), J('Sleep', 'tent', 3), J('CompleteQuest', 'CH1-D2-001', 4), J('Sleep', 'tent', 5)];
    expect(dayRanges(journal, ends).map((r) => [r.from, r.to, r.ended])).toEqual([[0, 3, true], [4, 5, true]]);
    expect(STORY.quests['ST-005']?.dayEnd).toBe(true);
    const old = new Set([...ends, 'ST-005']);   // контроль: раніше ST-005 закривав день серед білого дня
    expect(dayRanges(journal, old).length).toBeGreaterThan(2);
  });
});

describe('валідатор: неможливі ворота — помилка', () => {
  const bad = (patch: (q: Record<string, unknown>) => void): string[] => {
    const content = structuredClone(CONTENT) as unknown as { quests: Record<string, unknown>[] } & Record<string, unknown>;
    patch(content.quests.find((q) => q.id === 'CH1-D2-001') as Record<string, unknown>);
    return (validate(content as never, { today: '2026-11-05' }) as { code: string }[]).map((i) => i.code);
  };
  it('день 1, день за стелею, година після «пора спати» — відмови; чесні ворота — чисто', () => {
    expect(bad((q) => { q.gate = { day: 1 }; })).toContain('GATE_DAY_RANGE');
    expect(bad((q) => { q.gate = { day: SLEEP_CAP + 2 }; })).toContain('GATE_DAY_RANGE');
    expect(bad((q) => { q.gate = { day: 2, fromMinute: 23 * 60 }; })).toContain('GATE_MINUTE_RANGE');
    expect(bad((q) => { q.gate = { day: 2, fromMinute: 18 * 60 }; })).not.toContain('GATE_DAY_RANGE');
    expect(bad((q) => { q.gate = { day: 2 }; })).not.toContain('GATE_MINUTE_RANGE');
  });
});

describe('бот: кінець розділу досяжний зі сном (усі ворота лишають шлях)', () => {
  it('прогони бота: жодного тупика, і ходи сну справді траплялись; ворота — причина сну (без воріт сну немає)', () => {
    const variant = { profile: 'profile.solo-explorer', transport: 'transport.car', animal: 'animal.none', side: 'take', money: 'some' } as const;
    const count = (defs: CoreDefs): { sleeps: number; softlocks: number } => {
      const memo: EndMemo = new Map();
      let sleeps = 0;
      let softlocks = 0;
      for (let seed = 1; seed <= 8; seed++) {
        const r = runBot(defs, variant, seed, memo, { maxSteps: 400, cap: 20_000, trace: (m) => { if (m.type === 'Sleep') sleeps++; } });
        if (r.verdict === 'softlock') softlocks++;
      }
      return { sleeps, softlocks };
    };
    const gated = count(GAME_DEFS);
    expect(gated.softlocks).toBe(0);
    expect(gated.sleeps).toBeGreaterThan(0);
    expect(count(NO_GATES).sleeps).toBe(0);   // контроль: без воріт бот не спить
  }, 180_000);
});
