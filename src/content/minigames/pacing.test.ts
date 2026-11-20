// GAME-343 · чотири міні-ігри місій тягнулись 81–90 с однотонних дотиків (гравець, що збивається, добивав до межі часу).
// Тут — модель «запускаємо чисту функцію гри зі сценарним гравцем»: час до «fine»/«good» у кадрах, зміна темпу посеред гри, детермінізм.
// Мутація (перевірено): повернути старий темп (lockS 15/need 36, goodS 35/fineS 60, limitS 85) — тест меж червоніє (7 із 24); прибрати `twist` з параметрів — тест зміни темпу червоніє (5 із 24).
import { describe, expect, it } from 'vitest';
import { FPS, NORMAL, RELAXED, type AnyMinigame, type Difficulty, type FrameInput, type Outcome } from '../../core/minigame';
import { minigameById } from './index';
import { TUNE, TIE, CRANK, WEAVE, holdTarget, rhythmNow, type HoldParams, type HoldState, type RhythmParams, type RhythmState } from './missions';

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
/** Ритм: проміжки чергуються ±, кожен `jerkEvery`-й — ривок (0 — без ривків); темп читає з вигляду гри. */
function rhythmPlayer(def: AnyMinigame, jitter: number, jerkEvery: number, tol: number, fallback: number, idle = 0): (t: number, s: unknown) => FrameInput {
  let next = 30 + idle; let k = 0;
  return (t, s) => {
    if (t !== next) return NONE;
    const beat = ((def.view(s as never, NORMAL) as { beat?: number }).beat ?? fallback);
    const j = [-1, 1, -0.5, 0.75][k % 4] as number;
    k++;
    next = t + Math.round(jerkEvery > 0 && k % jerkEvery === 0 ? beat + tol + 6 : beat + j * jitter);
    return { taps: [{ x: 0.5, y: 0.5 }], drag: null };
  };
}

type Kind = 'perfect' | 'competent' | 'slow' | 'novice';
interface Case { readonly id: string; readonly p: HoldParams | RhythmParams; readonly make: (def: AnyMinigame, kind: Kind) => (t: number, s: unknown) => FrameInput }
const IDLE = 6 * FPS;
const rhythmCase = (id: string, p: RhythmParams): Case => ({ id, p, make: (d, k) => rhythmPlayer(d, k === 'perfect' ? 0 : k === 'novice' ? 10 : 4, k === 'perfect' ? 0 : k === 'novice' ? 3 : 7, p.tol, p.beat, k === 'slow' ? IDLE : 0) });
const holdCase = (id: string, p: HoldParams): Case => ({ id, p, make: (d, k) => (k === 'perfect' ? holdPlayer(d, 0.15, 0) : k === 'novice' ? holdPlayer(d, 0.8, 0.06) : k === 'slow' ? holdPlayer(d, 0.45, 0.03) : holdPlayer(d, 0.4, 0.03)) });
const CASES: readonly Case[] = [rhythmCase('mg.lantern-crank', CRANK), rhythmCase('mg.trap-weave', WEAVE), holdCase('mg.aerial-tune', TUNE), holdCase('mg.tarp-tie', TIE)];
const secs = (r: Run): number => r.frames / FPS;

describe('GAME-343 · темп чотирьох міні-ігор місій', () => {
  for (const c of CASES) {
    const def = minigameById(c.id) as AnyMinigame;
    describe(c.id, () => {
      it('параметри: «fine» ≤ 45 с, «good» ≤ 60 с (і раніше за fine), межа часу ≤ 60 с', () => {
        expect(c.p.fineS).toBeLessThanOrEqual(45);
        expect(c.p.goodS).toBeLessThanOrEqual(60);
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
      it('«fine» досяжний: менш точний гравець (запізнення 0,45 с або 6 с роздумів) закінчує між «good» і «fine» межами', () => {
        for (const sd of SEEDS) {
          const r = run(def, sd, NORMAL, c.make(def, 'slow'));
          expect(r.outcome, `slow ${sd}`).toBe('fine');
          expect(secs(r)).toBeLessThanOrEqual(45);
        }
      });
      it('зміна темпу: настає посеред гри, підпис видно, умови справді інші', () => {
        for (const sd of SEEDS) {
          const r = run(def, sd, NORMAL, c.make(def, 'competent'));
          expect(r.twistAt, `twist ${sd}`).not.toBeNull();
          expect((r.twistAt as number) / r.frames).toBeGreaterThan(0.25);
          expect((r.twistAt as number) / r.frames).toBeLessThan(0.75);
        }
        // Умови після зміни інші: ціль/такт відрізняються від тих самих кадрів без зміни.
        if ('beat' in c.p) {
          const p = c.p as RhythmParams; const st = (shift: number): RhythmState => ({ t: 500, lastTap: null, charge: 0, jerks: 0, shift });
          expect(rhythmNow(p, st(100)).beat).not.toBe(rhythmNow(p, st(0)).beat);
        } else {
          const p = c.p as HoldParams; const st = (t: number, shift: number): HoldState => ({ t, dial: 0, base: 0.4, lock: 0, shift });
          const spread = Array.from({ length: 60 }, (_, i) => Math.abs(holdTarget(p, st(i * 10, 1)) - holdTarget(p, st(i * 10, 0))));
          expect(Math.max(...spread)).toBeGreaterThan(0.1);
        }
      });
      it('допомога RELAXED: «fine» і «scrappy» лишаються досяжними', () => {
        const fine = run(def, SEEDS[0] as number, RELAXED, c.make(def, 'slow'));
        expect(fine.done).toBe(true);
        expect(['good', 'fine']).toContain(fine.outcome);
        const bad = run(def, SEEDS[0] as number, RELAXED, c.make(def, 'novice'));
        expect(!bad.done || bad.outcome === 'scrappy').toBe(true);
        expect(def.outcomeOf(def.init(RELAXED, 1))).toBe('scrappy');
      });
      it('детермінізм: те саме зерно й ті самі дотики — той самий результат', () => {
        const a = run(def, 4242, NORMAL, c.make(def, 'competent'));
        const b = run(def, 4242, NORMAL, c.make(def, 'competent'));
        expect(b).toEqual(a);
      });
    });
  }
});
