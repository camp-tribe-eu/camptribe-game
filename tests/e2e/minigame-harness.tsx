// GAME-308 · стенд для game-308.spec.ts: справжні MinigameHost + ReferenceSurface + сесія каркаса із справжнім CSS гри, без проходу світом.
// Кадри дає ТЕСТ (frame(n)), а не годинник: жодних очікувань за часом, прохід детермінований.
import { render } from 'preact';
import { MinigameHost } from '../../src/ui/MinigameHost';
import { ReferenceSurface } from '../../src/ui/ReferenceSurface';
import { createMinigameSession, type MinigameSession } from '../../src/view/minigame-session';
import { recordResult, type MinigameResults, type Outcome } from '../../src/core/minigame';
import { REFERENCE, markerAt, CORE_HALF } from '../../src/content/minigames/reference';
import { t } from '../../src/i18n';
import type { Key } from '../../src/i18n';

interface Opts { lang: 'uk' | 'en'; scrappyStreak: number }
let session: MinigameSession | null = null;
const reported: { outcome: Outcome; consequence: string }[] = [];

const api = {
  open(o: Opts): void {
    let results: MinigameResults | undefined;
    for (let i = 0; i < o.scrappyStreak; i++) results = recordResult(results, REFERENCE.id, 'scrappy', 'ref.messy') ?? results;
    reported.length = 0;
    session = createMinigameSession(REFERENCE, { results, seed: 1, report: (r) => { reported.push(r); } });
    let host = document.getElementById('mg-root');
    if (!host) { host = document.createElement('div'); host.id = 'mg-root'; document.body.append(host); }
    render(null, host);
    render(<MinigameHost session={session} t={(k: Key) => t(o.lang, k)} Surface={ReferenceSurface} />, host);
  },
  frame(n: number): void { session?.frame(n); },
  /** Крутить кадри, доки маркер не в ядрі смуги (його видно на екрані); дотику не робить — його робить тест по справжній кнопці. */
  toCenter(): number {
    let n = 0;
    while (session && session.run.phase === 'play' && n < 600) {
      const s = session.run.state as { t: number };
      if (Math.abs(markerAt(s.t) - 0.5) <= coreHalf(session) * 0.5) return n;
      session.frame(1); n++;
    }
    return n;
  },
  state(): { phase: string; paused: boolean; frame: number; limit: number; helped: boolean; outcome: string | null; reported: typeof reported } {
    const r = (session as MinigameSession).run;
    return { phase: r.phase, paused: r.paused, frame: r.frame, limit: r.limit, helped: r.helped, outcome: r.outcome, reported: [...reported] };
  },
};
const coreHalf = (s: MinigameSession): number => CORE_HALF * s.run.difficulty.bandScale;
(window as unknown as { __mg: typeof api }).__mg = api;
