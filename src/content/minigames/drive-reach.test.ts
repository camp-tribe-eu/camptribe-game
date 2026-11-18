// GAME-317 · приймання зразкового дня: дорога ЗАВЖДИ закінчувалась «пізно». Тут дорогу грає той самий цикл, що в грі (openRun → stepRun, межа DRIVE_LIMIT_FRAMES, ввід — тап/перетягування
// екрана), а не голий stepDrive без межі кадрів. Доводимо: кожен із трьох результатів досяжний якимось вводом на ТОМУ зерні, яке бере зразковий день.
// Мутація: DRIVE_LIMIT_FRAMES = 90 * FPS (або ROAD_SPEEDUP = 1) → «спокійно» і «жваво» дають scrappy, тест червоніє на «досяжні вчасно й рано».
import { describe, expect, it } from 'vitest';
import { NO_INPUT, openRun, startRun, stepRun, type FrameInput, type MinigameRun, type Outcome } from '../../core/minigame';
import { dodgeTo, nearCyclist } from '../drive.fixture';
import { DRIVE, type DriveMgState } from './drive';

const SEEDS = [7, 1, 2, 3, 11, 19, 23, 42];
const laneX = (l: number): number => (l * 2 + 1) / 6;
type Plan = { readonly pace: (s: DriveMgState) => 'steady' | 'brisk'; readonly stop: (s: DriveMgState) => boolean; readonly look?: number };

function playMg(seed: number, plan: Plan): { outcome: Outcome; frames: number; run: MinigameRun } {
  let run = startRun(openRun(DRIVE, undefined, seed));
  while (run.phase === 'play') {
    const s = run.state as DriveMgState;
    const taps: { x: number; y: number }[] = [];
    if (plan.pace(s) !== s.drive.pace) taps.push({ x: 0.5, y: 0.1 });
    if (s.drive.offer !== null && plan.stop(s)) taps.push({ x: 0.5, y: 0.9 });
    const to = dodgeTo(s.drive, s.course, plan.look);
    const input: FrameInput = taps.length > 0 || to !== null ? { taps, drag: to !== null && s.drive.changing === 0 ? { x: laneX(to), y: 0.5 } : null } : NO_INPUT;
    run = stepRun(DRIVE, run, input);
  }
  return { outcome: run.outcome as Outcome, frames: run.frame, run };
}
const STEADY: Plan = { pace: () => 'steady', stop: () => false };
/** Людина, а не робот: помічає перешкоду лише за ~230 м (а не за 500) і не їде зі швидкістю, яку підказує допомога. */
const HUMAN_STEADY: Plan = { pace: () => 'steady', stop: () => false, look: 230 };
const CALM_FAST: Plan = {
  pace: (s) => (s.drive.cameraAhead || nearCyclist(s.drive, s.course) || s.drive.fuelL < 0.5 ? 'steady' : 'brisk'),
  stop: (s) => s.drive.offer?.kind === 'fuel' && s.drive.fuelL < 0.6,
};
const STOPS_EVERYWHERE: Plan = { pace: () => 'steady', stop: () => true };

describe('GAME-317 · дорога в справжньому циклі міні-гри: усі три часи приїзду досяжні', () => {
  it('спокійна їзда без зупинок — вчасно (fine), жвава обережна — рано (good), на кожному зерні', () => {
    for (const seed of SEEDS) {
      expect(playMg(seed, STEADY).outcome, `зерно ${seed}: рівна спокійна їзда`).toBe('fine');
      expect(playMg(seed, CALM_FAST).outcome, `зерно ${seed}: жваво, але обережно`).toBe('good');
    }
  });
  it('людина з пізнім об\'їздом (за ~230 м), без зупинок, рівно — теж не «пізно» (мутація: DRIVE_LIMIT_FRAMES = 90 * FPS → червоніє)', () => {
    for (const seed of SEEDS) expect(playMg(seed, HUMAN_STEADY).outcome, `зерно ${seed}`).not.toBe('scrappy');
  });
  it('запас: ідеальна рівна їзда приїздить ≥ 25 с дороги до закриття рецепції — людині є куди помилитись (мутація: RECEPTION_SEC = 310 → зерно 7 має 5 с і червоніє)', () => {
    for (const seed of SEEDS) {
      const st = playMg(seed, STEADY).run.state as DriveMgState;
      expect(st.course.receptionSec - st.drive.sec, `зерно ${seed}: запас, с`).toBeGreaterThanOrEqual(25);
    }
  });
  it('їзда з кожною зупинкою — пізно (scrappy), і все ще доїжджає (не глухий кут)', () => {
    for (const seed of SEEDS) expect(playMg(seed, STOPS_EVERYWHERE).outcome, `зерно ${seed}`).toBe('scrappy');
  });
  it('усі три результати справді різні за вводом (негативний контроль: тест не зелений наосліп)', () => {
    const seen = new Set(SEEDS.flatMap((s) => [playMg(s, STEADY).outcome, playMg(s, CALM_FAST).outcome, playMg(s, STOPS_EVERYWHERE).outcome]));
    expect([...seen].sort()).toEqual(['fine', 'good', 'scrappy']);
  });
  it('гра, яка не дійшла до кінця за межу кадрів, — «пізно»: межа не з\'їдає ні вчасно, ні рано', () => {
    const r = playMg(7, STEADY);
    expect(r.frames, 'приїхали до межі кадрів, а не за нею').toBeLessThan(r.run.limit);
  });
});
