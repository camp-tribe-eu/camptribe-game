// GAME-308 · каркас міні-ігор. Закон 1: кожна перевірка тут має мутацію, на якій вона червоніє (запобіжник MinigameGuards або зламана копія гри); перелік і тексти червоних повідомлень — у PR.
import { describe, expect, it } from 'vitest';
import { dispatch, type Command, type Safeguards } from './commands';
import {
  COUNT_CAP, FPS, HELP_AFTER, MAX_JOURNEY_FRAMES, MAX_PLAY_FRAMES, MIN_JOURNEY_FRAMES, MIN_PLAY_FRAMES, NORMAL, NO_INPUT, OUTCOMES, RELAXED,
  canContinue, checkMinigame, closeRun, defineMinigame, difficultyFor, giveUp, openRun, recordResult, resultOf, resultOfRun, setPaused, startRun, stepRun,
  type AnyMinigame, type MinigameGuards, type MinigameResults, type Outcome,
} from './minigame';
import { SAVE_VERSION, fromSave, serialize } from './save';
import { newSim } from './sim';
import { stateHash } from './hash';
import { initialState, type GameState } from './state';
import { DRIVER, SKILL_DEFS, play } from './story.fixture';
import type { CoreDefs } from './defs';
import { MINIGAMES, MINIGAME_DEFS } from '../content/minigames';
import { REFERENCE } from '../content/minigames/reference';

const DEFS: CoreDefs = { ...SKILL_DEFS, minigames: MINIGAME_DEFS };
const ID = REFERENCE.id;
const SAFE: Safeguards = { commandId: true, grantId: true, rollback: true };
const start = (): GameState => play([DRIVER], initialState(0), DEFS);
let n = 0;
const finish = (s: GameState, outcome: string, guard?: MinigameGuards, id = ID, defs: CoreDefs = DEFS) =>
  dispatch(s, { type: 'FinishMinigame', commandId: `m${n++}`, minigameId: id, outcome } as Command, defs, guard ? { ...SAFE, minigame: guard } : undefined);
const mustFinish = (s: GameState, outcome: string, guard?: MinigameGuards): GameState => {
  const r = finish(s, outcome, guard);
  if (!r.ok) throw new Error(`FinishMinigame ${outcome} → ${r.code}`);
  return r.state;
};
/** Зламана копія гри: без одного з результатів. */
const without = (def: AnyMinigame, o: Outcome): AnyMinigame => ({ ...def, outcomes: Object.fromEntries(Object.entries(def.outcomes).filter(([k]) => k !== o)) as AnyMinigame['outcomes'] });
const registryProblems = (list: readonly AnyMinigame[]) => list.flatMap(checkMinigame);

describe('реєстр: кожна гра оголошує всі три результати', () => {
  it('реєстр не порожній і чистий', () => {
    expect(MINIGAMES.length).toBeGreaterThan(0);
    expect(registryProblems(MINIGAMES)).toEqual([]);
  });
  it('мутація: прибрати будь-який результат (особливо програшний) → сторож червоніє', () => {
    for (const o of OUTCOMES) {
      for (const def of MINIGAMES) expect(registryProblems([without(def, o)]).map((f) => f.code), `${def.id} без ${o}`).toContain('OUTCOMES');
    }
  });
  it('мутація: порожній наслідок, повторний наслідок, межа поза 30–90 с, погане id → окремі знахідки', () => {
    const base = REFERENCE;
    expect(checkMinigame({ ...base, outcomes: { ...base.outcomes, scrappy: { ...base.outcomes.scrappy, consequence: '' } } }).map((f) => f.code)).toContain('CONSEQUENCE');
    expect(checkMinigame({ ...base, outcomes: { ...base.outcomes, scrappy: { ...base.outcomes.good } } }).map((f) => f.code)).toContain('CONSEQUENCE');
    expect(checkMinigame({ ...base, limitFrames: MIN_PLAY_FRAMES - 1 }).map((f) => f.code)).toContain('LIMIT');
    expect(checkMinigame({ ...base, limitFrames: MAX_PLAY_FRAMES + 1 }).map((f) => f.code)).toContain('LIMIT');
    expect(checkMinigame({ ...base, id: 'reference' }).map((f) => f.code)).toContain('ID');
    expect(checkMinigame({ ...base, outcomes: { ...base.outcomes, epic: { consequence: 'x', resultKey: 'y' } } as never }).map((f) => f.code)).toContain('OUTCOMES');
  });
  it('межі: рівно 30 і рівно 90 с — дозволено', () => {
    expect(checkMinigame({ ...REFERENCE, limitFrames: 30 * FPS })).toEqual([]);
    expect(checkMinigame({ ...REFERENCE, limitFrames: 90 * FPS })).toEqual([]);
  });
  it('GAME-309 · подорож: 90–180 с дозволено ЛИШЕ з kind journey; звичайна гра понад 90 с і подорож понад 180 с — червоні', () => {
    // звичайна міні-гра довша за 90 с — LIMIT (довгу межу не можна взяти «тихцем», без оголошення виду)
    expect(checkMinigame({ ...REFERENCE, limitFrames: 150 * FPS }).map((f) => f.code)).toContain('LIMIT');
    expect(checkMinigame({ ...REFERENCE, kind: 'game', limitFrames: MAX_PLAY_FRAMES + 1 }).map((f) => f.code)).toContain('LIMIT');
    // подорож — у своїх межах зелена, поза ними червона
    expect(checkMinigame({ ...REFERENCE, kind: 'journey', limitFrames: MIN_JOURNEY_FRAMES })).toEqual([]);
    expect(checkMinigame({ ...REFERENCE, kind: 'journey', limitFrames: MAX_JOURNEY_FRAMES })).toEqual([]);
    expect(checkMinigame({ ...REFERENCE, kind: 'journey', limitFrames: MAX_JOURNEY_FRAMES + 1 }).map((f) => f.code)).toContain('LIMIT');
    expect(checkMinigame({ ...REFERENCE, kind: 'journey', limitFrames: MIN_JOURNEY_FRAMES - 1 }).map((f) => f.code)).toContain('LIMIT');
    expect(checkMinigame({ ...REFERENCE, kind: 'sprint' as never }).map((f) => f.code)).toContain('LIMIT');
  });
});

describe('життєвий цикл: open → play → result → close, лише кадрами', () => {
  const open = (res?: MinigameResults) => openRun(REFERENCE, res, 1);
  it('відкрита гра ще не йде: кадри нічого не міняють, поки не «Почати»', () => {
    const r = open();
    expect(r.phase).toBe('open');
    expect(stepRun(REFERENCE, r, NO_INPUT)).toBe(r);
  });
  it('open → play → result → closed', () => {
    let r = startRun(open());
    expect(r.phase).toBe('play');
    while (r.phase === 'play') r = stepRun(REFERENCE, r, NO_INPUT);
    expect(r.phase).toBe('result');
    expect(r.frame).toBe(r.limit);   // без вводу гра закінчується межею кадрів, а не висить
    expect(r.outcome).toBe('scrappy');
    expect(closeRun(r).phase).toBe('closed');
  });
  it('пауза доступна завжди (відкрито, гра, результат) і заморожує кадри', () => {
    let r = startRun(open());
    for (let i = 0; i < 10; i++) r = stepRun(REFERENCE, r, NO_INPUT);
    const paused = setPaused(r, true);
    expect(paused.paused).toBe(true);
    expect(stepRun(REFERENCE, paused, { taps: [{ x: 0, y: 0 }], drag: null })).toBe(paused);   // ні кадр, ні дотик на паузі не рахуються
    expect(setPaused(paused, false).paused).toBe(false);
    expect(setPaused(open(), true).paused).toBe(true);
    let done = startRun(open());
    while (done.phase === 'play') done = stepRun(REFERENCE, done, NO_INPUT);
    expect(setPaused(done, true).paused).toBe(true);
    expect(setPaused(closeRun(done), true).paused).toBe(false);   // закритій грі паузи немає
  });
  it('допомога розтягує межу кадрів і робить смугу ширшою', () => {
    const plain = open();
    const helped = open(streak(2));
    expect(helped.helped).toBe(true);
    expect(helped.limit).toBe(Math.round(REFERENCE.limitFrames * RELAXED.timeScale));
    expect(helped.limit).toBeGreaterThan(plain.limit);
    const view = (r: typeof plain) => REFERENCE.view(r.state, r.difficulty) as { band: { from: number; to: number }; hint: boolean };
    expect(view(helped).band.to - view(helped).band.from).toBeGreaterThan(view(plain).band.to - view(plain).band.from);
    expect(view(plain).hint).toBe(false);
    expect(view(helped).hint).toBe(true);
  });
  it('гра детермінована: ті самі входи по кадрах — той самий результат', () => {
    const play1 = (): unknown => { let r = startRun(open()); for (let t = 0; r.phase === 'play'; t++) r = stepRun(REFERENCE, r, t % 40 === 0 ? { taps: [{ x: 0.5, y: 0.5 }], drag: null } : NO_INPUT); return r; };
    expect(stateHash(play1())).toBe(stateHash(play1()));
  });
  it('гра, що повертає сміття замість результату, не блокує: це scrappy', () => {
    const odd = defineMinigame({ ...(REFERENCE as never as Parameters<typeof defineMinigame>[0]), outcomeOf: () => 'epic' as never, done: () => true });
    const r = stepRun(odd, startRun(openRun(odd, undefined, 1)), NO_INPUT);
    expect(r.phase).toBe('result');
    expect(r.outcome).toBe('scrappy');
  });
});

/** Записи, у яких на кінці рівно k «сяк-так» поспіль. */
function streak(k: number): MinigameResults {
  let res: MinigameResults | undefined;
  for (let i = 0; i < k; i++) res = recordResult(res, ID, 'scrappy', 'ref.messy') as MinigameResults;
  return res as MinigameResults;
}
const seq = (outcomes: readonly Outcome[], guard?: MinigameGuards) => {
  let res: MinigameResults | undefined;
  const diffs = [difficultyFor(undefined, guard)];
  for (const o of outcomes) { res = recordResult(res, ID, o, `c.${o}`, guard) as MinigameResults; diffs.push(difficultyFor(resultOf(res, ID) ?? undefined, guard)); }
  return diffs.map((d) => (d === NORMAL ? 'N' : d === RELAXED ? 'R' : '?')).join('');
};

describe('«сяк-так» ніколи не блокує', () => {
  /** Усі способи дійти до scrappy; для кожного гравець мусить піти далі й результат мусить записатись. */
  function scrappyProblems(defs: readonly AnyMinigame[], guard?: MinigameGuards): string[] {
    const out: string[] = [];
    for (const def of defs) {
      const ways: [string, () => ReturnType<typeof openRun>][] = [
        ['далі без цього зі вступу', () => giveUp(openRun(def, undefined, 1, guard))],
        ['далі без цього з гри', () => { let r = startRun(openRun(def, undefined, 1, guard)); for (let i = 0; i < 5; i++) r = stepRun(def, r, NO_INPUT); return giveUp(r); }],
        ['далі без цього з паузи', () => giveUp(setPaused(startRun(openRun(def, undefined, 1, guard)), true))],
        ['час вичерпано без вводу', () => { let r = startRun(openRun(def, undefined, 1, guard)); while (r.phase === 'play') r = stepRun(def, r, NO_INPUT); return r; }],
      ];
      for (const [way, make] of ways) {
        const r = make();
        if (r.outcome !== 'scrappy') { out.push(`${def.id} · ${way}: результат ${String(r.outcome)}, а не scrappy`); continue; }
        if (!canContinue(r, guard)) out.push(`${def.id} · ${way}: canContinue=false`);
        if (closeRun(r, guard).phase !== 'closed') out.push(`${def.id} · ${way}: результат не закривається`);
        const rec = resultOfRun(def, r);
        if (!rec) { out.push(`${def.id} · ${way}: немає запису`); continue; }
        const s = finish(start(), rec.outcome, guard, def.id);
        if (!s.ok) out.push(`${def.id} · ${way}: ядро відмовило ${s.code}`);
      }
    }
    return out;
  }
  it('кожна зареєстрована гра: усі шляхи до scrappy пускають далі й пишуть результат', () => {
    expect(scrappyProblems(MINIGAMES)).toEqual([]);
  });
  it('мутація: scrappy блокує → сторож червоніє (і закрити не можна, і ядро відмовляє)', () => {
    const bad = scrappyProblems(MINIGAMES, { scrappyContinues: false });
    expect(bad.length).toBeGreaterThan(0);
    expect(bad.some((b) => b.includes('canContinue=false'))).toBe(true);
    expect(bad.some((b) => b.includes('ядро відмовило'))).toBe(true);
  });
  it('scrappy — лише запис: нічого іншого в стані гри не міняється (гроші, інвентар, квести, прапорці)', () => {
    const before = start();
    const after = mustFinish(before, 'scrappy');
    const { minigames, processed, seq: sq, ...rest } = after;
    const { processed: p0, seq: s0, ...rest0 } = before;
    expect(minigames?.[ID]?.last).toBe('scrappy');
    expect(rest).toEqual(rest0);
    expect(Object.keys(processed).length).toBe(Object.keys(p0).length + 1);
    expect(sq).toBe(s0 + 1);
  });
  it('після scrappy гру можна зіграти знову й перебити результат', () => {
    let s = mustFinish(start(), 'scrappy');
    s = mustFinish(s, 'good');
    expect(s.minigames?.[ID]?.last).toBe('good');
  });
});

describe('допомога: рівно після двох «сяк-так» поспіль', () => {
  it('N → N → R: після першого ще немає, після другого — є', () => {
    expect(seq(['scrappy'])).toBe('NN');
    expect(seq(['scrappy', 'scrappy'])).toBe('NNR');
    expect(HELP_AFTER).toBe(2);
  });
  it('далі допомога тримається, доки не вийде не-scrappy; тоді знімається', () => {
    expect(seq(['scrappy', 'scrappy', 'scrappy'])).toBe('NNRR');
    expect(seq(['scrappy', 'scrappy', 'fine'])).toBe('NNRN');
    expect(seq(['scrappy', 'scrappy', 'good', 'scrappy'])).toBe('NNRNN');
  });
  it('«підряд» — це підряд: scrappy, fine, scrappy допомоги не дає', () => {
    expect(seq(['scrappy', 'fine', 'scrappy'])).toBe('NNNN');
    expect(seq(['scrappy', 'good', 'scrappy'])).toBe('NNNN');
    expect(seq(['good', 'good'])).toBe('NNN');
  });
  it('мутація: лічильник рахує всі scrappy, а не підряд → «scrappy, fine, scrappy» дав би допомогу', () => {
    expect(seq(['scrappy', 'fine', 'scrappy'], { consecutive: false })).toBe('NNNR');
    expect(seq(['scrappy', 'fine', 'scrappy'], { consecutive: false })).not.toBe(seq(['scrappy', 'fine', 'scrappy']));
  });
  it('мутація: поріг 1 → допомога вже після першого; поріг 3 → ще немає після другого', () => {
    expect(seq(['scrappy'], { helpAfter: 1 })).toBe('NR');
    expect(seq(['scrappy', 'scrappy'], { helpAfter: 3 })).toBe('NNN');
    for (const bad of [1, 3]) expect(seq(['scrappy', 'scrappy'], { helpAfter: bad })).not.toBe('NNR');
  });
  it('крізь команди ядра: допомога видна в наступному відкритті гри', () => {
    let s = start();
    expect(openRun(REFERENCE, s.minigames, 1).helped).toBe(false);
    s = mustFinish(s, 'scrappy');
    expect(openRun(REFERENCE, s.minigames, 1).helped).toBe(false);
    s = mustFinish(s, 'scrappy');
    expect(openRun(REFERENCE, s.minigames, 1).helped).toBe(true);
    s = mustFinish(s, 'fine');
    expect(openRun(REFERENCE, s.minigames, 1).helped).toBe(false);
  });
  it('допомога — це послаблення, яке гра читає, а не докір: більше часу, ширше, підказка; без жодного мінуса', () => {
    expect(RELAXED.timeScale).toBeGreaterThan(NORMAL.timeScale);
    expect(RELAXED.bandScale).toBeGreaterThan(NORMAL.bandScale);
    expect(RELAXED.hint).toBe(true);
    expect(NORMAL.hint).toBe(false);
  });
});

describe('команда FinishMinigame: результат у стані гри', () => {
  it('пише останній результат, наслідок із каталогу, лічильники', () => {
    let s = mustFinish(start(), 'good');
    expect(s.minigames?.[ID]).toEqual({ last: 'good', consequence: MINIGAME_DEFS[ID]?.good, plays: 1, scrappyStreak: 0 });
    s = mustFinish(s, 'scrappy');
    expect(s.minigames?.[ID]).toEqual({ last: 'scrappy', consequence: MINIGAME_DEFS[ID]?.scrappy, plays: 2, scrappyStreak: 1 });
  });
  it('наслідки різних результатів різні — сценарій відрізнить вогке ліжко від сухого', () => {
    const tags = OUTCOMES.map((o) => (mustFinish(start(), o).minigames?.[ID] as { consequence: string }).consequence);
    expect(new Set(tags).size).toBe(3);
  });
  it('відмови: невідома гра, невідомий результат, сміття, без персонажа, без каталогу', () => {
    expect(finish(start(), 'good', undefined, 'mg.nope')).toMatchObject({ ok: false, code: 'UNKNOWN_TARGET' });
    expect(finish(start(), 'epic')).toMatchObject({ ok: false, code: 'INVALID_COMMAND' });
    expect(finish(start(), 'good', undefined, 'toString')).toMatchObject({ ok: false, code: 'INVALID_COMMAND' });
    expect(finish(start(), 'good', undefined, '__proto__')).toMatchObject({ ok: false, code: 'INVALID_COMMAND' });
    expect(finish(initialState(0), 'good')).toMatchObject({ ok: false, code: 'NO_CHARACTER' });
    expect(finish(start(), 'good', undefined, ID, SKILL_DEFS)).toMatchObject({ ok: false, code: 'UNKNOWN_TARGET' });
  });
  it('повтор того самого commandId результату вдруге не додає (лічильник не накручується)', () => {
    const s = start();
    const cmd = { type: 'FinishMinigame', commandId: 'same1', minigameId: ID, outcome: 'scrappy' } as Command;
    const a = dispatch(s, cmd, DEFS);
    expect(a.ok).toBe(true);
    const b = dispatch(a.state, cmd, DEFS);
    expect(b.ok && b.repeated).toBe(true);
    expect(b.state.minigames?.[ID]?.plays).toBe(1);
  });
  it('лічильники мають стелю: стан не росте без меж', () => {
    let res: MinigameResults | undefined = { [ID]: { last: 'scrappy', consequence: 'x', plays: COUNT_CAP, scrappyStreak: COUNT_CAP } };
    res = recordResult(res, ID, 'scrappy', 'x') as MinigameResults;
    expect(res[ID]).toMatchObject({ plays: COUNT_CAP, scrappyStreak: COUNT_CAP });
  });
  it('прототип: ключ `toString` у записах не «знаходиться»', () => {
    expect(resultOf({}, 'toString')).toBeNull();
    expect(resultOf(undefined, ID)).toBeNull();
  });
});

describe('результат переживає збереження й завантаження', () => {
  const sim = (g: GameState) => ({ ...newSim(7, 0), game: g });
  for (const o of OUTCOMES) {
    it(`${o}: save → load → той самий запис, той самий відбиток стану`, () => {
      const s = sim(mustFinish(start(), o));
      const r = fromSave(serialize(s));
      expect(r.ok, r.ok ? '' : `${(r as { code: string }).code}: ${(r as { detail: string }).detail}`).toBe(true);
      if (!r.ok) return;
      expect(r.sim.game.minigames).toEqual(s.game.minigames);
      expect(r.sim.game.minigames?.[ID]?.last).toBe(o);
      expect(stateHash(r.sim)).toBe(stateHash(s));
    });
  }
  it('допомога переживає перезавантаження: два scrappy → save → load → гра відкривається послабленою', () => {
    const s = sim(mustFinish(mustFinish(start(), 'scrappy'), 'scrappy'));
    const r = fromSave(serialize(s));
    expect(r.ok && openRun(REFERENCE, r.sim.game.minigames, 1).helped).toBe(true);
  });
  it('сейв без міні-ігор (до v6) читається: поля немає, і воно не вигадується', () => {
    const s = sim(start());
    const text = serialize(s).replace(/"schemaVersion":6,"checksum"/, '"schemaVersion":5,"checksum"');
    const r = fromSave(text);
    expect(r.ok && r.fromVersion).toBe(5);
    expect(r.ok && 'minigames' in r.sim.game).toBe(false);
    expect(SAVE_VERSION).toBe(6);
  });
  describe('форма запису: зіпсований сейв відхиляється (контрольну суму підробник перерахує сам)', () => {
    type Saved = { checksum: string; sim: { game: { minigames: Record<string, Record<string, unknown>> } } };
    const good = (): Saved => JSON.parse(serialize(sim(mustFinish(start(), 'scrappy')))) as Saved;
    const bad = (patch: (m: Record<string, Record<string, unknown>>) => void): string => { const c = good(); patch(c.sim.game.minigames); c.checksum = stateHash(c.sim); return JSON.stringify(c); };
    it('позитивний контроль: записаний сейв проходить', () => { expect(fromSave(JSON.stringify(good())).ok).toBe(true); });
    for (const [what, patch] of [
      ['результат не з трьох', (m: Record<string, Record<string, unknown>>) => { (m[ID] as Record<string, unknown>).last = 'epic'; }],
      ['порожній наслідок', (m: Record<string, Record<string, unknown>>) => { (m[ID] as Record<string, unknown>).consequence = ''; }],
      ['scrappy з нульовим лічильником', (m: Record<string, Record<string, unknown>>) => { (m[ID] as Record<string, unknown>).scrappyStreak = 0; }],
      ['good з ненульовим лічильником', (m: Record<string, Record<string, unknown>>) => { (m[ID] as Record<string, unknown>).last = 'good'; }],
      ['лічильник більший за кількість ігор', (m: Record<string, Record<string, unknown>>) => { (m[ID] as Record<string, unknown>).scrappyStreak = 5; }],
      ['зіграно 0', (m: Record<string, Record<string, unknown>>) => { (m[ID] as Record<string, unknown>).plays = 0; }],
      ['id не mg.…', (m: Record<string, Record<string, unknown>>) => { const r = m[ID] as Record<string, unknown>; for (const k of Object.keys(m)) Reflect.deleteProperty(m, k); m['toString'] = r; }],
    ] as const) {
      it(`SAVE_SHAPE: ${what}`, () => { const r = fromSave(bad(patch)); expect(r.ok ? 'ok' : r.code).toBe('SAVE_SHAPE'); });
    }
  });
});
