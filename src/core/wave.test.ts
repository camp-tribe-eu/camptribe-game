// GAME-170 · хвилі напруги в ядрі: строки в ігрових хвилинах, пауза їх зупиняє, спізнення — м'який наслідок, хвиля
// завжди закінчується, сейв не губить живої хвилі, старий сейв без поля читається.
import { describe, expect, it } from 'vitest';
import { dispatch, type Command } from './commands';
import { checkDefs, type CoreDefs } from './defs';
import { fromSave, serialize } from './save';
import { newSim, step, type SimState } from './sim';
import { initialState, type GameState } from './state';
import { settleWave, taskOutcome, waveView } from './wave';

const DEFS: CoreDefs = {
  items: {}, interactions: {},
  story: {
    start: 'q.start', profiles: { 'profile.a': {} }, transports: ['transport.car', 'transport.bike'], animals: { 'animal.cat': { transports: ['transport.car'] } },
    locations: { 'loc.camp': { items: [] } }, npcs: {},
    quests: { 'q.start': { optional: false, end: true, locationId: 'loc.camp', objectives: [], transitions: [] } },
    dialogues: {},
  },
  waves: {
    waves: {
      'wave.dusk': {
        stage: 'q.start',
        tasks: [
          { id: 'wood', limitMin: 10, done: { effects: ['f.wood-done'] }, late: { effects: ['f.wood-late'] } },
          { id: 'tea', limitMin: 20, done: { effects: [] }, late: { effects: [] } },
          { id: 'cat', limitMin: 30, leaderOnly: true, animal: 'animal.cat', when: { animals: ['animal.cat'] }, done: { effects: [] }, late: { effects: [] } },
        ],
        allDone: { effects: ['f.all-done'] },
      },
    },
  },
};
const CTX = { defs: DEFS };
const cmd = (s: SimState, command: Omit<Command, 'commandId'>): SimState => step(s, { kind: 'command', command: { ...command, commandId: `c${s.game.seq}` } as Command }, CTX);
const minutes = (s: SimState, n: number): SimState => step(s, { kind: 'frame', realMs: n * 1000 }, CTX);
const start = (animal?: string): SimState => cmd(newSim(1), { type: 'CreateCharacter', profileId: 'profile.a', transportId: 'transport.car', ...(animal ? { animalId: animal } : {}) });
const code = (s: SimState): string | undefined => { const r = s.game.processed[`c${s.game.seq - 1}`]; return r?.ok ? 'ok' : r?.code; };

describe('хвиля напруги: строки й пауза (GAME-170)', () => {
  it('каталог хвиль чистий; без годинника StartWave — INVALID_COMMAND (мовчазної «хвилини 0» немає)', () => {
    expect(checkDefs(DEFS)).toEqual([]);
    const g = start().game;
    expect(dispatch(g, { type: 'StartWave', commandId: 'x', waveId: 'wave.dusk' }, DEFS).code).toBe('INVALID_COMMAND');
    expect(dispatch(g, { type: 'StartWave', commandId: 'x', waveId: 'wave.dusk' }, DEFS, undefined, undefined, undefined, 5).ok).toBe(true);
  });

  it('старт: справи зі строками від «зараз»; варіант без кішки не має справи про кішку', () => {
    const s = cmd(minutes(start(), 100), { type: 'StartWave', waveId: 'wave.dusk' });
    expect(code(s)).toBe('ok');
    expect(waveView(s.game, 100)).toEqual({ waveId: 'wave.dusk', tasks: [{ id: 'wood', remainingMin: 10, outcome: 'open' }, { id: 'tea', remainingMin: 20, outcome: 'open' }] });
    expect(Object.keys(start('animal.cat').game.wave ?? {})).toEqual([]);
    const withCat = cmd(start('animal.cat'), { type: 'StartWave', waveId: 'wave.dusk' });
    expect(waveView(withCat.game, 0)?.tasks.map((t) => t.id)).toEqual(['wood', 'tea', 'cat']);
  });

  it('усе вчасно: кожна справа done, прапорці «встиг» і «усе встигли», хвиля закінчена й у past', () => {
    let s = cmd(start(), { type: 'StartWave', waveId: 'wave.dusk' });
    s = minutes(s, 10);                                                   // рівно на межі ще можна
    s = cmd(s, { type: 'CompleteTask', taskId: 'wood' });
    expect(code(s)).toBe('ok');
    s = cmd(s, { type: 'CompleteTask', taskId: 'tea' });
    expect(s.game.wave?.active).toBeNull();
    expect(s.game.wave?.past).toEqual({ 'wave.dusk': { wood: 'done', tea: 'done' } });
    expect(s.game.flags).toEqual(['f.all-done', 'f.wood-done']);
    expect(s.journal.filter((e) => e.type === 'CompleteTask').map((e) => e.ref)).toEqual(['wood', 'tea']);
  });

  it('усе проігноровано: годинник минає строки — кожна справа late, хвиля закінчена сама, без поразки', () => {
    let s = cmd(start(), { type: 'StartWave', waveId: 'wave.dusk' });
    s = minutes(s, 11);
    expect(waveView(s.game, 11)?.tasks.map((t) => t.outcome)).toEqual(['late', 'open']);
    expect(s.game.flags).toEqual(['f.wood-late']);
    expect(code(cmd(s, { type: 'CompleteTask', taskId: 'wood' }))).toBe('TASK_NOT_OPEN'); // спізнена справа вже вирішена
    s = step(s, { kind: 'advance', minutes: 10 }, CTX);
    expect(s.game.wave).toEqual({ active: null, past: { 'wave.dusk': { wood: 'late', tea: 'late' } } });
    expect(s.game.flags).toEqual(['f.wood-late']);                      // «усе встигли» не ставиться
    expect(taskOutcome(s.game, 'wave.dusk', 'wood')).toBe('late');
    expect(s.game.campaignEnded).toBe(false);                            // і нічого не зламалось у сюжеті
  });

  it('пауза зупиняє годинник — і строки; без паузи той самий час спізнює (негативний контроль)', () => {
    const s = cmd(start(), { type: 'StartWave', waveId: 'wave.dusk' });
    const paused = minutes(step(s, { kind: 'pause' }, CTX), 60);
    expect(paused.clock.minutes).toBe(0);
    expect(waveView(paused.game, paused.clock.minutes)?.tasks.every((t) => t.outcome === 'open')).toBe(true);
    expect(paused.game.wave).toBe(s.game.wave);
    const running = minutes(step(paused, { kind: 'resume' }, CTX), 60);
    expect(running.game.wave?.active).toBeNull();
    expect(running.game.wave?.past['wave.dusk']).toEqual({ wood: 'late', tea: 'late' });
  });

  it('відмови: друга хвиля поки жива — WAVE_ACTIVE; та сама вдруге — WAVE_SEEN; чужа справа — UNKNOWN_TARGET; lідер-only для помічника', () => {
    let s = cmd(start('animal.cat'), { type: 'StartWave', waveId: 'wave.dusk' });
    expect(code(cmd(s, { type: 'StartWave', waveId: 'wave.dusk' }))).toBe('WAVE_ACTIVE');
    expect(code(cmd(s, { type: 'CompleteTask', taskId: 'ghost' }))).toBe('UNKNOWN_TARGET');
    expect(code(cmd(s, { type: 'CompleteTask', taskId: 'cat', actor: 'helper' }))).toBe('TASK_LEADER_ONLY');
    expect(code(cmd(s, { type: 'CompleteTask', taskId: 'tea', actor: 'helper' }))).toBe('ok');
    s = cmd(s, { type: 'CompleteTask', taskId: 'cat', actor: 'leader' });
    expect(code(s)).toBe('ok');
    expect(code(cmd(s, { type: 'CompleteTask', taskId: 'cat' }))).toBe('TASK_NOT_OPEN');
    s = step(s, { kind: 'advance', minutes: 40 }, CTX);
    expect(s.game.wave?.active).toBeNull();
    expect(code(cmd(s, { type: 'StartWave', waveId: 'wave.dusk' }))).toBe('WAVE_SEEN');
    expect(code(cmd(start(), { type: 'CompleteTask', taskId: 'wood' }))).toBe('TASK_NOT_OPEN'); // хвилі немає
    expect(code(cmd(start(), { type: 'StartWave', waveId: 'wave.ghost' }))).toBe('UNKNOWN_TARGET');
  });

  it('відмова не змінює стану хвилі (rollback)', () => {
    const s = cmd(start(), { type: 'StartWave', waveId: 'wave.dusk' });
    const rejected = cmd(s, { type: 'CompleteTask', taskId: 'ghost' });
    expect(rejected.game.wave).toEqual(s.game.wave);
  });

  it('settleWave чиста: без живої хвилі чи до строку повертає той самий об’єкт', () => {
    const g = start().game;
    expect(settleWave(g, 10_000, DEFS.waves)).toBe(g);
    const s = cmd(start(), { type: 'StartWave', waveId: 'wave.dusk' });
    expect(settleWave(s.game, 10, DEFS.waves)).toBe(s.game);
    expect(settleWave(s.game, 11, DEFS.waves)).not.toBe(s.game);
  });

  it('сейв: жива хвиля зі строками проходить serialize → fromSave без втрат; стан без поля wave — теж', () => {
    const s = minutes(cmd(start(), { type: 'StartWave', waveId: 'wave.dusk' }), 3);
    const r = fromSave(serialize(s));
    expect(r.ok && r.sim.game.wave).toEqual(s.game.wave);
    const plain = start();
    expect('wave' in plain.game).toBe(false);
    const r2 = fromSave(serialize(plain));
    expect(r2.ok && 'wave' in r2.sim.game).toBe(false);
  });

  it('сейв: зіпсоване поле wave — SAVE_SHAPE (негативний контроль форми)', () => {
    const s = cmd(start(), { type: 'StartWave', waveId: 'wave.dusk' });
    const bad = (patch: (g: Record<string, unknown>) => void): string => {
      const sim = structuredClone(s) as unknown as { game: Record<string, unknown> };
      patch(sim.game);
      const file = JSON.parse(serialize(sim as unknown as SimState)) as Record<string, unknown>;
      const r = fromSave(JSON.stringify(file));
      return r.ok ? 'ok' : r.code;
    };
    expect(bad((g) => { (g.wave as { active: { tasks: Record<string, { outcome: string }> } }).active.tasks.wood!.outcome = 'won'; })).toBe('SAVE_SHAPE');
    expect(bad((g) => { (g.wave as { past: Record<string, unknown> }).past['wave.x'] = { wood: 'open' }; })).toBe('SAVE_SHAPE');
    expect(bad((g) => { g.wave = 'yes'; })).toBe('SAVE_SHAPE');
    expect(bad(() => {})).toBe('ok');
  });

  it('initialState без поля wave — відбиток стану до GAME-170 не змінився', () => {
    const g: GameState = initialState();
    expect('wave' in g).toBe(false);
  });
});
