// GAME-309 · стенд для game-309.spec.ts: справжні MinigameHost + DriveSurface + сесія каркаса зі справжнім CSS гри.
// Кадри дає ТЕСТ (frame(n)), а не годинник: жодних очікувань за часом, прохід детермінований і швидкий.
// Рішення гравця тест ухвалює сам і натискає СПРАВЖНІ кнопки; `advice` лише показує, яка смуга вільна.
import { render } from 'preact';
import { MinigameHost } from '../../src/ui/MinigameHost';
import { DriveSurface } from '../../src/ui/DriveSurface';
import { createMinigameSession, type MinigameSession } from '../../src/view/minigame-session';
import { recordResult, type MinigameResults, type Outcome } from '../../src/core/minigame';
import { DRIVE, driveSummary, freeLaneOf, type DriveMgState } from '../../src/content/minigames/drive';
import { VIEW_M, arrivalConsequence } from '../../src/content/drive';
import { t, type Key } from '../../src/i18n';

interface Opts { lang: 'uk' | 'en'; seed: number; scrappyStreak: number }
let session: MinigameSession | null = null;
const reported: { outcome: Outcome; consequence: string }[] = [];
const mg = (): DriveMgState => (session as MinigameSession).run.state as DriveMgState;

const api = {
  open(o: Opts): void {
    let results: MinigameResults | undefined;
    for (let i = 0; i < o.scrappyStreak; i++) results = recordResult(results, DRIVE.id, 'scrappy', arrivalConsequence('scrappy')) ?? results;
    reported.length = 0;
    session = createMinigameSession(DRIVE, { results, seed: o.seed, report: (r) => { reported.push(r); } });
    let host = document.getElementById('mg-root');
    if (!host) { host = document.createElement('div'); host.id = 'mg-root'; document.body.append(host); }
    render(null, host);
    render(<MinigameHost session={session} t={(k: Key) => t(o.lang, k)} Surface={DriveSurface} />, host);
  },
  frame(n: number): void { session?.frame(n); },
  /** Яка смуга вільна попереду; null — у своїй чисто або вільної немає. */
  advice(): number | null {
    if (!session || session.run.phase !== 'play') return null;
    const s = mg();
    return freeLaneOf(s.drive, s.course, VIEW_M * 0.5);
  },
  state(): Record<string, unknown> {
    const r = (session as MinigameSession).run;
    const s = r.state as DriveMgState;
    const sum = driveSummary(s);
    return {
      phase: r.phase, paused: r.paused, frame: r.frame, limit: r.limit, helped: r.helped, outcome: r.outcome, reported: [...reported],
      lane: s.drive.lane, pace: s.drive.pace, fines: s.drive.finesCents, money: s.drive.moneyCents, cameraAhead: s.drive.cameraAhead,
      offer: s.drive.offer?.kind ?? null, fuelL: s.drive.fuelL, comfort: s.drive.comfort, roadSec: s.drive.sec,
      arrival: sum.arrival, drivePhase: s.drive.phase,
    };
  },
};
(window as unknown as { __drive: typeof api }).__drive = api;
