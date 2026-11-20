// GAME-343 · чотири міні-ігри місій тягнулись 81–90 с однотонних дотиків (гравець, що збивається, добивав до межі часу).
// Тут — модель «запускаємо чисту функцію гри зі сценарним гравцем»: час до «fine»/«good» у кадрах, зміна темпу посеред гри, детермінізм.
// Мутації (перевірено, кожна червоніє): тап після зміни судять (lastTap: s.t замість null) · TIE jump: 0 · TWIST_CUE_S = 0.2 · прибрати `* s.ts` у byTime · прибрати `twist` з параметрів · старі fineS 60/limitS 85.
import { describe, expect, it } from 'vitest';
import { FPS, NORMAL, RELAXED, type AnyMinigame, type Difficulty, type FrameInput, type Outcome } from '../../core/minigame';
import { minigameById } from './index';
import { TUNE, TIE, CRANK, WEAVE, TWIST_CUE_S, holdTarget, rhythmNow, type HoldParams, type HoldState, type RhythmParams, type RhythmState } from './missions';

const SEEDS = [11, 20261112, 7, 4242, 31337];
const PEEK: Difficulty = { ...NORMAL, hint: true };
interface Run { readonly frames: number; readonly done: boolean; readonly outcome: Outcome | null; readonly twistAt: number | null }
const NONE: FrameInput = { taps: [], drag: null };

function run(def: AnyMinigame, seed: number, d: Difficulty, player: (t: number, s: unknown) => FrameInput): Run {
  let s = def.init(d, seed); let twistAt: number | null = null;
  const limit = Math.round(def.limitFrames * d.timeScale);
  for (let t = 0; t < limit; t++) {
    s = def.step(s, player(t, s), d);
    if (twistAt === null && (def.view(s, d) as { twist?: boolean }).twist) twistAt = t + 1;
    if (def.done(s)) return { frames: t + 1, done: true, outcome: def.outcomeOf(s), twistAt };
  }
  return { frames: limit, done: false, outcome: null, twistAt };
}

/** Шкала: шукає повзунком 0,2/с, далі тримає ціль із запізненням 0,4 с (competent) або точно (perfect). */
function holdPlayer(def: AnyMinigame, lagS: number, wobble: number, idle = 0): (t: number, s: unknown) => FrameInput {
  let dial = 0.05; let found = false; const hist: number[] = []; const lag = Math.round(lagS * FPS);
  return (t, s) => {
    const v = def.view(s as never, PEEK) as { signal: number; station: number };
    hist.push(v.station);
    if (t < idle) return { taps: [], drag: { x: 0.05, y: 0.5 } };
    if (!found) { dial = Math.min(1, dial + 0.2 / FPS); if (v.signal > 0.5) found = true; } else dial = (hist[Math.max(0, t - lag)] as number) + wobble * Math.sin(t / 37);
    return { taps: [], drag: { x: dial, y: 0.5 } };
  };
}
/** Ритм: проміжки чергуються ±, кожен `jerkEvery`-й — ривок (0 — без ривків); темп читає з гри, але на новий переходить через `late` дотиків. */
function rhythmPlayer(def: AnyMinigame, jitter: number, jerkEvery: number, tol: number, fallback: number, idle = 0, late = 0): (t: number, s: unknown) => FrameInput {
  let next = 30 + idle; let k = 0; let changedAt = -1;
  return (t, s) => {
    if (t !== next) return NONE;
    const now = ((def.view(s as never, NORMAL) as { beat?: number }).beat ?? fallback);
    if (changedAt < 0 && now !== fallback) changedAt = k;
    const beat = changedAt >= 0 && k < changedAt + late ? fallback : now;
    const j = [-1, 1, -0.5, 0.75][k % 4] as number;
    k++;
    next = t + Math.round(jerkEvery > 0 && k % jerkEvery === 0 ? beat + tol + 6 : beat + j * jitter);
    return { taps: [{ x: 0.5, y: 0.5 }], drag: null };
  };
}

type Kind = 'perfect' | 'competent' | 'slow' | 'late' | 'novice' | 'sluggish';
interface Case { readonly id: string; readonly p: HoldParams | RhythmParams; readonly make: (def: AnyMinigame, kind: Kind) => (t: number, s: unknown) => FrameInput }
const IDLE = 6 * FPS;
const SLUG = 50 * FPS;   // «сонний» гравець: 50 с стоїть, потім грає вправно
/** Гравці: competent — запізнення 0,4 с / проміжки ±4–5 кадрів і ривок кожен 7-й; slow — 6 с роздумів (ритм) чи запізнення 0,6 с (шкала); late — на новий такт переходить із запізненням у 2 дотики. */
const rhythmCase = (id: string, p: RhythmParams): Case => ({ id, p, make: (d, k) => rhythmPlayer(d, k === 'perfect' ? 0 : k === 'novice' ? 10 : 4, k === 'perfect' ? 0 : k === 'novice' ? 3 : 7, p.tol, p.beat, k === 'slow' ? IDLE : k === 'sluggish' ? SLUG : 0, k === 'late' ? 2 : 0) });
const holdCase = (id: string, p: HoldParams): Case => ({ id, p, make: (d, k) => (k === 'perfect' ? holdPlayer(d, 0.15, 0) : k === 'novice' ? holdPlayer(d, 0.8, 0.06) : k === 'slow' ? holdPlayer(d, 0.6, 0.03) : holdPlayer(d, 0.4, 0.03, k === 'sluggish' ? SLUG : 0)) });
const CASES: readonly Case[] = [rhythmCase('mg.lantern-crank', CRANK), rhythmCase('mg.trap-weave', WEAVE), holdCase('mg.aerial-tune', TUNE), holdCase('mg.tarp-tie', TIE)];
const secs = (r: Run): number => r.frames / FPS;
const isRhythm = (p: HoldParams | RhythmParams): p is RhythmParams => 'beat' in p;

describe('GAME-343 · темп чотирьох міні-ігор місій', () => {
  for (const c of CASES) {
    const def = minigameById(c.id) as AnyMinigame;
    describe(c.id, () => {
      it('параметри: «fine» ≤ 45 с, «good» раніше за fine, межа часу ≤ 60 с', () => {
        expect(c.p.fineS).toBeLessThanOrEqual(45);
        expect(c.p.goodS).toBeLessThan(c.p.fineS);
        expect(c.p.limitS).toBeLessThanOrEqual(60);
        expect(def.limitFrames).toBe(c.p.limitS * FPS);
      });
      it('вправний гравець: до кінця ≤ 45 с і результат не гірший за «fine»; точний гравець — «good» ≤ 60 с', () => {
        for (const sd of SEEDS) {
          const comp = run(def, sd, NORMAL, c.make(def, 'competent'));
          expect(comp.done, `competent ${sd}`).toBe(true);
          expect(secs(comp), `competent ${sd}`).toBeLessThanOrEqual(45);
          expect(['good', 'fine']).toContain(comp.outcome);
          const perf = run(def, sd, NORMAL, c.make(def, 'perfect'));
          expect(perf.outcome, `perfect ${sd}`).toBe('good');
          expect(secs(perf)).toBeLessThanOrEqual(60);
        }
      });
      it('повільніший гравець не карається: «fine» (не «scrappy») на всіх зернах, ≤ 45 с', () => {
        for (const sd of SEEDS) {
          const r = run(def, sd, NORMAL, c.make(def, 'slow'));
          expect(['good', 'fine'], `slow ${sd}: ${secs(r)} с ${String(r.outcome)}`).toContain(r.outcome);
          expect(secs(r)).toBeLessThanOrEqual(45);
        }
      });
      if (isRhythm(c.p)) {
        it('гравець, що переходить на новий такт із запізненням у 2 дотики, все одно доходить до «fine»', () => {
          for (const sd of SEEDS) {
            const r = run(def, sd, NORMAL, c.make(def, 'late'));
            expect(['good', 'fine'], `late ${sd}: ${secs(r)} с`).toContain(r.outcome);
            expect(secs(r)).toBeLessThanOrEqual(45);
          }
        });
      }
      it('зміна темпу: настає посеред гри, підпис видно', () => {
        for (const sd of SEEDS) {
          const r = run(def, sd, NORMAL, c.make(def, 'competent'));
          expect(r.twistAt, `twist ${sd}`).not.toBeNull();
          expect((r.twistAt as number) / r.frames).toBeGreaterThan(0.25);
          expect((r.twistAt as number) / r.frames).toBeLessThan(0.75);
        }
      });
      it('зміна темпу рухає гру рівно на задану величину (не «нуль»)', () => {
        const init = def.init(NORMAL, 1);
        if (isRhythm(c.p)) {
          const p = c.p; const st = (shift: number): RhythmState => ({ ...(init as RhythmState), t: 500, shift });
          expect(p.twist, 'twist задано').toBeDefined();
          expect(rhythmNow(p, st(100)).beat).toBe(p.twist?.beat);
          expect(Math.abs((p.twist?.beat ?? 0) - p.beat), 'такт зсувається помітно').toBeGreaterThanOrEqual(10);
          expect((def.view(st(100), NORMAL) as { beat: number }).beat).toBe(p.twist?.beat);
        } else {
          const p = c.p; const st = (shift: number): HoldState => ({ ...(init as HoldState), t: 0, base: 0.4, shift });
          expect(p.twist?.jump ?? 0, 'ціль зноситься на ≥ 0,1 шкали').toBeGreaterThanOrEqual(0.1);
          // t = 0: sin = 0, тож різниця цілей — рівно знос `jump` (база 0,4 < 0,5 → убік, де більше місця).
          expect(holdTarget(p, st(1)) - holdTarget(p, st(0))).toBeCloseTo(p.twist?.jump ?? -1, 9);
          expect(p.twist?.swayMul !== 1 || p.twist?.periodMul !== 1, 'міняється й коливання').toBe(true);
        }
      });
      it('підпис висить ≈ TWIST_CUE_S секунд після зміни (не блимає на кадр і не лишається назавжди)', () => {
        expect(TWIST_CUE_S).toBeGreaterThanOrEqual(2);
        let s = { ...(def.init(NORMAL, 1) as object), t: 100, shift: 100 } as never; let on = 0;
        for (let i = 0; i < 12 * FPS; i++) { if ((def.view(s, NORMAL) as { twist: boolean }).twist) on++; s = def.step(s, NONE, NORMAL) as never; }
        expect(on).toBeGreaterThanOrEqual(2.5 * FPS);
        expect(on).toBeLessThanOrEqual(4 * FPS);
      });
      it('допомога RELAXED: «fine» і «scrappy» лишаються досяжними; межі good/fine ростуть разом із часом', () => {
        const fine = run(def, SEEDS[0] as number, RELAXED, c.make(def, 'slow'));
        expect(fine.done).toBe(true);
        expect(['good', 'fine']).toContain(fine.outcome);
        const bad = run(def, SEEDS[0] as number, RELAXED, c.make(def, 'sluggish'));
        expect(bad.done, 'сонний гравець таки доходить до кінця (межа 90 с)').toBe(true);
        expect(bad.outcome).toBe('scrappy');
        expect(def.outcomeOf(def.init(RELAXED, 1))).toBe('scrappy');
        // Дописана «до кінця» гра на 50-й секунді: без допомоги це «scrappy», з допомогою (×1,5 часу) — «fine».
        const finished = (d: Difficulty): never => ({ ...(def.init(d, 1) as object), t: 50 * FPS, charge: 1e6, lock: 1e6 }) as never;
        expect(def.outcomeOf(finished(NORMAL))).toBe('scrappy');
        expect(def.outcomeOf(finished(RELAXED))).toBe('fine');
      });
      it('детермінізм: те саме зерно й ті самі дотики — той самий результат', () => {
        const a = run(def, 4242, NORMAL, c.make(def, 'competent'));
        const b = run(def, 4242, NORMAL, c.make(def, 'competent'));
        expect(b).toEqual(a);
      });
    });
  }
  for (const p of [CRANK, WEAVE]) {
    it(`${p.id}: перший проміжок після зміни такту не судять (тап у старий такт — без штрафу)`, () => {
      const def = minigameById(p.id) as AnyMinigame;
      const half = Math.ceil(p.need / 2);
      // Стан за крок до зміни: заряд half-1, попередній дотик рівно за такт тому.
      let s = { ...(def.init(NORMAL, 1) as object), t: 1000, lastTap: 1000 - p.beat, charge: half - 1 } as unknown as RhythmState;
      const tap: FrameInput = { taps: [{ x: 0.5, y: 0.5 }], drag: null };
      s = def.step(s, tap, NORMAL) as RhythmState;
      expect(s.shift, 'зміна настала').toBeGreaterThan(0);
      expect(s.charge).toBe(half);
      for (let i = 0; i < p.beat - 1; i++) s = def.step(s, NONE, NORMAL) as RhythmState;
      const next = def.step(s, tap, NORMAL) as RhythmState;   // тап через ОДИН СТАРИЙ такт — для нового такту це ривок, якби його судили
      expect(next.charge, 'заряд не змінився').toBe(half);
      expect(next.jerks, 'ривків не додалось').toBe(0);
      expect(next.lastTap, 'відлік нового такту почато').toBe(s.t);
    });
  }
});
