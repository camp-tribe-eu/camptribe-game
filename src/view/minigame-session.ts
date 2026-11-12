// GAME-308 · сесія міні-гри: тонкий шар між чистим циклом (core/minigame) і UI. Кадри дає ЗОВНІШНІЙ цикл (сцена викликає frame() раз на кадр гри; тест — скільки треба): жодного таймера тут немає.
// Результат сесія повідомляє РІВНО раз, коли гра дійшла до `result` (report) — хост шле команду FinishMinigame; закриття результату нічого не пише вдруге.
import { closeRun, giveUp, openRun, resultOfRun, setPaused, startRun, stepRun, NO_INPUT, type AnyMinigame, type FrameInput, type MinigameGuards, type MinigameResults, type MinigameRun, type Outcome, type Point } from '../core/minigame';
import type { MinigamePoint, MinigameSessionPort, MinigameView } from '../ui/minigame-types';

export interface MinigameSession extends MinigameSessionPort {
  /** Прожити `n` кадрів гри (за замовчуванням 1): накопичені дотики йдуть у перший. На паузі й поза грою нічого не міняє. */
  frame(n?: number): void;
  readonly run: MinigameRun;
}

export interface SessionOptions {
  /** Записані результати: за ними обирається допомога. */
  readonly results: MinigameResults | undefined;
  readonly seed: number;
  /** Гра дійшла до результату: що записати. Викликається рівно раз за сесію. */
  readonly report: (r: { readonly outcome: Outcome; readonly consequence: string }) => void;
  readonly guard?: MinigameGuards;
}

export function createMinigameSession(def: AnyMinigame, opts: SessionOptions): MinigameSession {
  const guard = opts.guard ?? {};
  let run = openRun(def, opts.results, opts.seed, guard);
  let taps: Point[] = [];
  let dragAt: Point | null = null;
  let reported = false;
  const listeners = new Set<() => void>();

  const set = (next: MinigameRun): void => {
    if (next === run) return;
    run = next;
    if (run.phase === 'result' && !reported) {
      reported = true;
      const r = resultOfRun(def, run);
      if (r) opts.report(r);
    }
    for (const l of [...listeners]) l();
  };

  return {
    get run() { return run; },
    view(): MinigameView {
      const decl = run.outcome ? def.outcomes[run.outcome] : undefined;
      return {
        id: def.id, phase: run.phase, paused: run.paused, helped: run.helped, outcome: run.outcome, progress: Math.min(1, run.frame / run.limit),
        titleKey: def.titleKey, introKey: def.introKey, hintKey: def.hintKey, resultKey: decl?.resultKey ?? null, surface: def.view(run.state, run.difficulty),
      };
    },
    start: () => set(startRun(run)),
    pause: () => set(setPaused(run, true)),
    resume: () => set(setPaused(run, false)),
    moveOn: () => set(giveUp(run)),
    close: () => set(closeRun(run, guard)),
    tap: (p: MinigamePoint) => { if (run.phase === 'play' && !run.paused) taps.push(p); },
    drag: (p: MinigamePoint | null) => { dragAt = run.phase === 'play' && !run.paused ? p : null; },
    subscribe(l) { listeners.add(l); return () => { listeners.delete(l); }; },
    frame(n = 1) {
      for (let i = 0; i < n; i++) {
        if (run.phase !== 'play' || run.paused) break;
        const input: FrameInput = taps.length || dragAt ? { taps, drag: dragAt } : NO_INPUT;
        taps = [];
        set({ ...stepRun(def, run, input) });
      }
    },
  };
}
