// GAME-170 · хвиля W4 «Вечір на трьох фронтах» на справжньому контенті, у симуляції (годинник + ядро), для КОЖНОЇ дозволеної
// комбінації профіль × транспорт × тварина: повний перебір порядків «зробити справу» / «дочекатись найближчого строку»
// доходить до кінця хвилі з кожного стану (тупиків 0); «усе вчасно» й «усе проігноровано» — обидва закінчують хвилю без
// поразки; пауза не рухає строки; варіанти авто/вело/кішка — саме ті; лише-лідер — лише лідер. Кінець розділу від хвилі не залежить.
import { describe, expect, it } from 'vitest';
import { checkDefs, WAVE_MAX_LIMIT, WAVE_MAX_TASKS, WAVE_MIN_TASKS, type CoreDefs } from '../core/defs';
import { canonical } from '../core/hash';
import type { Command } from '../core/commands';
import { newSim, step, type SimState } from '../core/sim';
type Cmd = Command extends infer C ? (C extends Command ? Omit<C, 'commandId'> : never) : never;
import { tasksFor, waveView } from '../core/wave';
import { enumerateCombos } from '../../scripts/validator/combos.mjs';
import * as REGISTRY from '../../scripts/validator/codes.mjs';
import { GAME_DEFS } from './slice-defs';
import { CONTENT } from './story';
import { RAW_WAVES, WAVE_CH1_EVENING, WAVES } from './waves';

const DEFS: CoreDefs = GAME_DEFS;
const CTX = { defs: DEFS };
const W = WAVES.waves[WAVE_CH1_EVENING];
if (!W) throw new Error('хвилі W4 немає в контенті');

const cmd = (s: SimState, c: Cmd): SimState => step(s, { kind: 'command', command: { ...c, commandId: `w${s.game.seq}` } as Command }, CTX);
const ok = (s: SimState): boolean => s.game.processed[`w${s.game.seq - 1}`]?.ok === true;
const started = (k: { profile: string | null; transport: string | null; animal: string }): SimState => {
  let s = cmd(newSim(7, 5_000), { type: 'CreateCharacter', profileId: k.profile ?? '', transportId: k.transport ?? '', ...(k.animal === 'animal.none' ? {} : { animalId: k.animal }) });
  s = step(s, { kind: 'advance', minutes: 2 * 1440 + 19 * 60 }, CTX); // вечір дня 2
  // Ядро (GAME-170, рецензія) не стартує хвилю, поки її етап не активний; тут сюжет «дійшов» до етапу прямою підстановкою.
  s = { ...s, game: { ...s.game, quests: { ...s.game.quests, [W.stage]: { status: 'active', done: [] } } } };
  s = cmd(s, { type: 'StartWave', waveId: WAVE_CH1_EVENING });
  if (!ok(s)) throw new Error(`StartWave відмовив: ${JSON.stringify(s.game.processed[`w${s.game.seq - 1}`])}`);
  return s;
};
const must = <T>(v: T | null | undefined, what: string): T => { if (v === null || v === undefined) throw new Error(`немає ${what}`); return v; };
const view = (s: SimState) => must(waveView(s.game, s.clock.minutes), 'живої хвилі');
const past = (s: SimState) => must(s.game.wave?.past[WAVE_CH1_EVENING], 'наслідків хвилі');
const ended = (s: SimState): boolean => s.game.wave?.active === null && s.game.wave.past[WAVE_CH1_EVENING] !== undefined;

describe('W4 «Вечір на трьох фронтах» у симуляції (GAME-170)', () => {
  const combos = enumerateCombos(CONTENT);
  it('каталог гри з хвилями чистий; комбінацій > 1', () => {
    expect(checkDefs(DEFS)).toEqual([]);
    expect(combos.length).toBeGreaterThan(1);
  });

  for (const k of combos) {
    const label = `${k.profile} · ${k.transport} · ${k.animal}`;
    it(`${label}: варіант справ — кішку шукають лише з кішкою, велосипеди накривають лише на велосипеді, 2–4 справи`, () => {
      const s = started(k);
      const ids = waveView(s.game, s.clock.minutes)?.tasks.map((t) => t.id) ?? [];
      expect(ids.includes('find-mia')).toBe(k.animal === 'animal.cat');
      expect(ids.includes('cover-bikes')).toBe(k.transport === 'transport.bike');
      expect(ids.length).toBeGreaterThanOrEqual(2);
      expect(ids.length).toBeLessThanOrEqual(4);
      expect(ids).toEqual(tasksFor(W, must(s.game.player, 'гравця')).map((t) => t.id));
    });

    it(`${label}: «усе вчасно» → усі done; «усе проігноровано» → усі late; обидва — кінець хвилі, розділ не зламано`, () => {
      let s = started(k);
      const ids = view(s).tasks.map((t) => t.id);
      for (const id of ids) { s = cmd(s, { type: 'CompleteTask', taskId: id }); expect(ok(s), id).toBe(true); }
      expect(ended(s)).toBe(true);
      expect(Object.values(past(s))).toEqual(ids.map(() => 'done'));
      let i = started(k);
      i = step(i, { kind: 'frame', realMs: 61 * 1000 }, CTX);  // довше за найдовший строк (60 хв = 60 с)
      expect(ended(i)).toBe(true);
      expect(Object.values(past(i))).toEqual(ids.map(() => 'late'));
      expect(i.game.campaignEnded).toBe(false);
      expect(Object.keys(i.game.quests).sort()).toEqual(['PROLOGUE-HOME-001', W.stage].sort());     // хвиля сюжету не торкнулась (лише етап, який ми підставили)
    });

    it(`${label}: повний перебір «зробити» × «дочекатись строку» — з кожного стану хвиля закінчується, тупиків 0`, () => {
      const first = started(k);
      const key = (s: SimState): string => canonical({ w: s.game.wave, m: s.clock.minutes });
      const seen = new Map<string, SimState>([[key(first), first]]);
      const queue = [first];
      let finals = 0;
      for (let s = queue.shift(); s; s = queue.shift()) {
        if (ended(s)) { finals++; continue; }
        const v = view(s);
        const next: SimState[] = [];
        for (const t of v.tasks) if (t.outcome === 'open') {
          const n = cmd(s, { type: 'CompleteTask', taskId: t.id });
          expect(ok(n), `${t.id} за ${t.remainingMin} хв до строку`).toBe(true);
          next.push(n);
        }
        const soonest = Math.min(...v.tasks.filter((t) => t.outcome === 'open').map((t) => t.remainingMin));
        next.push(step(s, { kind: 'advance', minutes: soonest + 1 }, CTX));
        next.push(step(s, { kind: 'advance', minutes: soonest }, CTX));   // рівно на межі: ще можна встигнути
        for (const n of next) { const h = key(n); if (!seen.has(h)) { seen.set(h, n); queue.push(n); } }
        expect(seen.size).toBeLessThan(5_000);
      }
      expect(finals).toBeGreaterThan(1);
      // кожен стан, що не кінець, має хід далі — перебір дійшов до кінця з усіх (інакше впав би вище)
      for (const s of seen.values()) if (!ended(s)) expect(view(s).tasks.some((t) => t.outcome === 'open')).toBe(true);
    });

    it(`${label}: пауза не рухає строки; помічник не шукає Мію`, () => {
      const s = started(k);
      const before = waveView(s.game, s.clock.minutes);
      const p = step(step(s, { kind: 'pause' }, CTX), { kind: 'frame', realMs: 120_000 }, CTX);
      expect(waveView(p.game, p.clock.minutes)).toEqual(before);
      const r = step(step(p, { kind: 'resume' }, CTX), { kind: 'frame', realMs: 120_000 }, CTX);
      expect(ended(r)).toBe(true);                                      // негативний контроль: без паузи строки минають
      if (k.animal === 'animal.cat') {
        const h = cmd(s, { type: 'CompleteTask', taskId: 'find-mia', actor: 'helper' });
        expect(s.game.processed).not.toBe(h.game.processed);
        expect(h.game.processed[`w${h.game.seq - 1}`]?.code).toBe('TASK_LEADER_ONLY');
        expect(ok(cmd(s, { type: 'CompleteTask', taskId: 'find-mia' }))).toBe(true);
      }
    });
  }

  it('контент: строки кожної справи 30–60 ігрових хв (≈ с); Мія лише в безпечних місцях і лише в руках лідера; кінець розділу від хвиль не залежить', () => {
    const raw = must(RAW_WAVES.find((w) => w.id === WAVE_CH1_EVENING), 'W4');
    for (const t of raw.tasks) expect(t.limitMin, t.id).toBeGreaterThanOrEqual(30);
    for (const t of raw.tasks) expect(t.limitMin, t.id).toBeLessThanOrEqual(60);
    const mia = must(raw.tasks.find((t) => t.id === 'find-mia'), 'справи find-mia');
    expect(mia.leaderOnly).toBe(true);
    expect(mia.targets?.length).toBeGreaterThan(0);
    expect(mia.targets?.every((x) => x.safe)).toBe(true);
    // Жоден квест не знає про хвилі: схема квестів не має такого поля, і в контенті немає посилань на wave.*.
    expect(JSON.stringify(CONTENT.quests)).not.toContain('wave.');
  });
});

describe('межі хвилі: одне значення в ядрі й у реєстрі валідатора (GAME-170)', () => {
  it('WAVE_MAX_LIMIT, WAVE_MIN_TASKS, WAVE_MAX_TASKS збігаються з codes.mjs', () => {
    expect([REGISTRY.WAVE_MAX_LIMIT, REGISTRY.WAVE_MIN_TASKS, REGISTRY.WAVE_MAX_TASKS]).toEqual([WAVE_MAX_LIMIT, WAVE_MIN_TASKS, WAVE_MAX_TASKS]);
  });
  it('каталог ядра відхиляє п’яту справу (DEFS_BAD_AMOUNT)', () => {
    const w = W;
    const task = (id: string) => ({ ...(w.tasks[0] as (typeof w.tasks)[number]), id });
    const five = { ...DEFS, waves: { waves: { ...WAVES.waves, [WAVE_CH1_EVENING]: { ...w, tasks: ['a', 'b', 'c', 'd', 'e'].map(task) } } } };
    expect(checkDefs(five).map((i) => i.code)).toContain('DEFS_BAD_AMOUNT');
  });
});
