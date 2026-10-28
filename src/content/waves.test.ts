// GAME-170 · КОЖНА хвиля контенту (W1 дім, W2 дорога авто/вело, W3 приїзд, W4 вечір) на справжньому контенті, у симуляції
// (годинник + ядро), для КОЖНОЇ дозволеної комбінації профіль × транспорт × тварина, яку хвиля адресує: повний перебір порядків
// «зробити справу» / «дочекатись найближчого строку» доходить до кінця хвилі з кожного стану (тупиків 0); «усе вчасно» й «усе
// проігноровано» — обидва закінчують хвилю без поразки; пауза не рухає строки; варіанти авто/вело/кішка — саме ті; лише-лідер —
// лише лідер; Мія ніколи не на велосипеді й не сама в авто. Кінець розділу від хвиль не залежить.
import { describe, expect, it } from 'vitest';
import { checkDefs, WAVE_MAX_LIMIT, WAVE_MAX_TASKS, WAVE_MIN_TASKS, type CoreDefs, type WaveDef } from '../core/defs';
import { canonical } from '../core/hash';
import type { Command } from '../core/commands';
import { newSim, step, type SimState } from '../core/sim';
type Cmd = Command extends infer C ? (C extends Command ? Omit<C, 'commandId'> : never) : never;
import { matches } from '../core/story';
import { tasksFor, waveView } from '../core/wave';
import { enumerateCombos } from '../../scripts/validator/combos.mjs';
import * as REGISTRY from '../../scripts/validator/codes.mjs';
import { GAME_DEFS } from './slice-defs';
import { CONTENT } from './story';
import { RAW_WAVES, WAVE_CH1_ARRIVAL, WAVE_CH1_DEPARTURE, WAVE_CH1_EVENING, WAVE_CH1_ROAD, WAVE_CH1_ROAD_BIKE, WAVES } from './waves';

const DEFS: CoreDefs = GAME_DEFS;
const CTX = { defs: DEFS };
type Combo = { profile: string | null; transport: string | null; animal: string };

const cmd = (s: SimState, c: Cmd): SimState => step(s, { kind: 'command', command: { ...c, commandId: `w${s.game.seq}` } as Command }, CTX);
const ok = (s: SimState): boolean => s.game.processed[`w${s.game.seq - 1}`]?.ok === true;
const started = (waveId: string, W: WaveDef, k: Combo): SimState => {
  let s = cmd(newSim(7, 5_000), { type: 'CreateCharacter', profileId: k.profile ?? '', transportId: k.transport ?? '', ...(k.animal === 'animal.none' ? {} : { animalId: k.animal }) });
  s = step(s, { kind: 'advance', minutes: 2 * 1440 + 19 * 60 }, CTX);
  // Ядро (GAME-170, рецензія) не стартує хвилю, поки її етап не активний; тут сюжет «дійшов» до етапу прямою підстановкою.
  s = { ...s, game: { ...s.game, quests: { ...s.game.quests, [W.stage]: { status: 'active', done: [] } } } };
  s = cmd(s, { type: 'StartWave', waveId });
  if (!ok(s)) throw new Error(`StartWave ${waveId} відмовив: ${JSON.stringify(s.game.processed[`w${s.game.seq - 1}`])}`);
  return s;
};
const must = <T>(v: T | null | undefined, what: string): T => { if (v === null || v === undefined) throw new Error(`немає ${what}`); return v; };
const view = (s: SimState) => must(waveView(s.game, s.clock.minutes), 'живої хвилі');
const past = (s: SimState, waveId: string) => must(s.game.wave?.past[waveId], 'наслідків хвилі');
const ended = (s: SimState, waveId: string): boolean => s.game.wave?.active === null && s.game.wave.past[waveId] !== undefined;
const isMia = (id: string): boolean => id.startsWith('mia') || id.endsWith('mia');

/** Що саме мусить бути у варіанті (сценарій v3 §3): справи про Мію — лише з кішкою; велосипедні — лише на велосипеді. */
const EXPECTED: Record<string, (k: Combo) => string[]> = {
  [WAVE_CH1_DEPARTURE]: (k) => ['map-to-luggage', 'lights-window', ...(k.animal === 'animal.cat' ? ['mia-carrier'] : []), ...(k.transport === 'transport.bike' ? ['anna-goodbye'] : [])],
  [WAVE_CH1_ROAD]: (k) => ['fix-luggage', 'check-route', ...(k.animal === 'animal.cat' ? ['mia-water-blanket'] : [])],
  [WAVE_CH1_ROAD_BIKE]: () => ['patch-tyre', 'bag-covers', 'pick-path'],
  [WAVE_CH1_ARRIVAL]: (k) => ['pick-spot', 'pitch-tent', 'gear-shelter', ...(k.animal === 'animal.cat' ? ['mia-car'] : [])],
  [WAVE_CH1_EVENING]: (k) => ['dinner', 'firewood', ...(k.animal === 'animal.cat' ? ['find-mia'] : []), ...(k.transport === 'transport.bike' ? ['cover-bikes'] : [])],
};

describe('хвилі розділу 1 у симуляції (GAME-170)', () => {
  const combos = enumerateCombos(CONTENT) as Combo[];
  it('каталог гри з хвилями чистий; комбінацій > 1; хвиль 5 (W1, W2 авто, W2 вело, W3, W4), кожна описана в EXPECTED', () => {
    expect(checkDefs(DEFS)).toEqual([]);
    expect(combos.length).toBeGreaterThan(1);
    expect(Object.keys(WAVES.waves).sort()).toEqual(Object.keys(EXPECTED).sort());
    expect(RAW_WAVES).toHaveLength(5);
  });

  for (const [waveId, W] of Object.entries(WAVES.waves)) {
    const label = (k: Combo): string => `${waveId} · ${k.profile} · ${k.transport} · ${k.animal}`;
    const addressed = combos.filter((k) => matches(W.when, { profileId: k.profile ?? '', transportId: k.transport ?? '', animalId: k.animal === 'animal.none' ? undefined : k.animal } as never));
    it(`${waveId}: адресує ≥ 1 комбінацію; поза своїм when — StartWave відмовляє (CONDITION_FAILED)`, () => {
      expect(addressed.length).toBeGreaterThan(0);
      for (const k of combos.filter((k) => !addressed.includes(k))) {
        let s = cmd(newSim(7, 5_000), { type: 'CreateCharacter', profileId: k.profile ?? '', transportId: k.transport ?? '', ...(k.animal === 'animal.none' ? {} : { animalId: k.animal }) });
        s = { ...s, game: { ...s.game, quests: { ...s.game.quests, [W.stage]: { status: 'active', done: [] } } } };
        s = cmd(s, { type: 'StartWave', waveId });
        expect(s.game.processed[`w${s.game.seq - 1}`]).toMatchObject({ ok: false, code: 'CONDITION_FAILED' });
      }
    });

    for (const k of addressed) {
      it(`${label(k)}: варіант справ — рівно за сценарієм; 2–4 справи; Мія лише з кішкою (ніколи на велосипеді)`, () => {
        const s = started(waveId, W, k);
        const ids = waveView(s.game, s.clock.minutes)?.tasks.map((t) => t.id) ?? [];
        expect([...ids].sort()).toEqual([...(EXPECTED[waveId] as (k: Combo) => string[])(k)].sort());
        expect(ids.length).toBeGreaterThanOrEqual(2);
        expect(ids.length).toBeLessThanOrEqual(4);
        expect(ids).toEqual(tasksFor(W, must(s.game.player, 'гравця')).map((t) => t.id));
        if (k.animal !== 'animal.cat') expect(ids.some(isMia)).toBe(false);
        if (k.transport === 'transport.bike') expect(ids.some(isMia)).toBe(false);
      });

      it(`${label(k)}: «усе вчасно» → усі done; «усе проігноровано» → усі late; обидва — кінець хвилі, розділ не зламано`, () => {
        let s = started(waveId, W, k);
        const ids = view(s).tasks.map((t) => t.id);
        for (const id of ids) { s = cmd(s, { type: 'CompleteTask', taskId: id }); expect(ok(s), id).toBe(true); }
        expect(ended(s, waveId)).toBe(true);
        expect(Object.values(past(s, waveId))).toEqual(ids.map(() => 'done'));
        let i = started(waveId, W, k);
        i = step(i, { kind: 'frame', realMs: 61 * 1000 }, CTX);  // довше за найдовший строк (60 хв = 60 с)
        expect(ended(i, waveId)).toBe(true);
        expect(Object.values(past(i, waveId))).toEqual(ids.map(() => 'late'));
        expect(i.game.campaignEnded).toBe(false);
        expect(Object.keys(i.game.quests).sort()).toEqual([...new Set(['PROLOGUE-HOME-001', W.stage])].sort());     // хвиля сюжету не торкнулась
      });

      it(`${label(k)}: повний перебір «зробити» × «дочекатись строку» — з кожного стану хвиля закінчується, тупиків 0`, () => {
        const first = started(waveId, W, k);
        const key = (s: SimState): string => canonical({ w: s.game.wave, m: s.clock.minutes });
        const seen = new Map<string, SimState>([[key(first), first]]);
        const queue = [first];
        let finals = 0;
        for (let s = queue.shift(); s; s = queue.shift()) {
          if (ended(s, waveId)) { finals++; continue; }
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
        for (const s of seen.values()) if (!ended(s, waveId)) expect(view(s).tasks.some((t) => t.outcome === 'open')).toBe(true);
      });

      it(`${label(k)}: пауза не рухає строки; помічник не робить справ «лише лідер»`, () => {
        const s = started(waveId, W, k);
        const before = waveView(s.game, s.clock.minutes);
        const p = step(step(s, { kind: 'pause' }, CTX), { kind: 'frame', realMs: 120_000 }, CTX);
        expect(waveView(p.game, p.clock.minutes)).toEqual(before);
        const r = step(step(p, { kind: 'resume' }, CTX), { kind: 'frame', realMs: 120_000 }, CTX);
        expect(ended(r, waveId)).toBe(true);                                      // негативний контроль: без паузи строки минають
        const leaderOnly = tasksFor(W, must(s.game.player, 'гравця')).filter((t) => t.leaderOnly === true).map((t) => t.id);
        for (const id of leaderOnly) {
          const h = cmd(s, { type: 'CompleteTask', taskId: id, actor: 'helper' });
          expect(h.game.processed[`w${h.game.seq - 1}`]?.code, id).toBe('TASK_LEADER_ONLY');
          expect(ok(cmd(s, { type: 'CompleteTask', taskId: id })), id).toBe(true);
        }
        // Справи про Мію — завжди лише лідер (валідатор WAVE_ANIMAL_HELPER; тут — та сама істина в ядрі).
        for (const t of tasksFor(W, must(s.game.player, 'гравця'))) if (isMia(t.id)) expect(leaderOnly, t.id).toContain(t.id);
      });
    }
  }

  it('контент: строки кожної справи 30–60 ігрових хв (≈ с); одна хвиля на етап для кожного варіанта; Мія лише в безпечних місцях і лише в руках лідера; квести не знають про хвилі', () => {
    for (const w of RAW_WAVES) for (const t of w.tasks) {
      expect(t.limitMin, `${w.id}/${t.id}`).toBeGreaterThanOrEqual(30);
      expect(t.limitMin, `${w.id}/${t.id}`).toBeLessThanOrEqual(60);
      if (isMia(t.id)) {
        expect(t.leaderOnly, `${w.id}/${t.id}`).toBe(true);
        expect(t.animal, `${w.id}/${t.id}`).toBe('animal.cat');
        expect(t.when?.animals, `${w.id}/${t.id}`).toEqual(['animal.cat']);
        expect(t.targets?.length).toBeGreaterThan(0);
        expect(t.targets?.every((x) => x.safe)).toBe(true);
      }
    }
    // На одному етапі для одного варіанта гравця — щонайбільше одна хвиля (W2 авто й W2 вело ділять етап ST-004 через when).
    for (const k of enumerateCombos(CONTENT) as Combo[]) {
      const p = { profileId: k.profile ?? '', transportId: k.transport ?? '', animalId: k.animal === 'animal.none' ? undefined : k.animal } as never;
      const stages = Object.values(WAVES.waves).filter((w) => matches(w.when, p)).map((w) => w.stage);
      expect(new Set(stages).size, `${k.profile} · ${k.transport} · ${k.animal}`).toBe(stages.length);
    }
    expect(JSON.stringify(CONTENT.quests)).not.toContain('wave.');
  });
});

describe('межі хвилі: одне значення в ядрі й у реєстрі валідатора (GAME-170)', () => {
  const W = must(WAVES.waves[WAVE_CH1_EVENING], 'W4');
  it('WAVE_MAX_LIMIT, WAVE_MIN_TASKS, WAVE_MAX_TASKS збігаються з codes.mjs', () => {
    expect([REGISTRY.WAVE_MAX_LIMIT, REGISTRY.WAVE_MIN_TASKS, REGISTRY.WAVE_MAX_TASKS]).toEqual([WAVE_MAX_LIMIT, WAVE_MIN_TASKS, WAVE_MAX_TASKS]);
  });
  it('каталог ядра відхиляє п’яту справу (DEFS_BAD_AMOUNT)', () => {
    const task = (id: string) => ({ ...(W.tasks[0] as (typeof W.tasks)[number]), id });
    const five = { ...DEFS, waves: { waves: { ...WAVES.waves, [WAVE_CH1_EVENING]: { ...W, tasks: ['a', 'b', 'c', 'd', 'e'].map(task) } } } };
    expect(checkDefs(five).map((i) => i.code)).toContain('DEFS_BAD_AMOUNT');
  });
});
