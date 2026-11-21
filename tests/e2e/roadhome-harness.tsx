// GAME-351 · стенд для game-351.spec.ts: справжні SampleDay + MinigameHost + поверхня дороги зі справжнім CSS. Порт відтворює рішення main.ts: дорогу додому відкрито,
// поки ранок закрито, а запису `mg.drive-home` ще нема; результат пишеться тим самим записом, що й FinishMinigame (recordResult), і підсумок не з'являється, поки міні-гра відкрита.
// Справжню проводку main.ts (sampleOpenRoadHome, FinishMinigame, сейв) перевіряє game-314 (повний зразковий день).
import { render } from 'preact';
import { SampleDay, type SamplePort } from '../../src/ui/SampleDay';
import { MinigameHost } from '../../src/ui/MinigameHost';
import { missionSurface } from '../../src/ui/MissionSurfaces';
import { t } from '../../src/i18n';
import type { Key } from '../../src/i18n';
import { createMinigameSession, type MinigameSession } from '../../src/view/minigame-session';
import { recordResult, type AnyMinigame, type MinigameResults } from '../../src/core/minigame';
import { DRIVE_HOME } from '../../src/content/minigames/drive';
import type { DriveMgState } from '../../src/content/minigames/drive';
import { ROAD_HOME_ID, roadHomeResult } from '../../src/content/road-home';
import { dodgeTo } from '../../src/content/drive.fixture';
import type { StrikeSave } from '../../src/content/camp-strike';

interface W { __results?: MinigameResults | undefined; __lang?: 'uk' | 'en' }
const w = window as unknown as W & { __mountRoadHome: (o?: { results?: MinigameResults | undefined; lang?: 'uk' | 'en' }) => void; __rhPlay: () => void };
const CLOSED: StrikeSave = { closed: true, results: { tent: 'good', litter: 'good', fire: 'good', car: 'good' } };
let session: MinigameSession | null = null;

w.__mountRoadHome = (o = {}) => {
  let host = document.getElementById('harness');
  if (!host) {
    host = document.createElement('div');
    host.id = 'harness';
    host.style.cssText = 'position:fixed;inset:0;z-index:99;background:#1b1f23;--edge-left:0px;--edge-right:0px;--edge-bottom:0px;--edge-top:0px';
    document.body.append(host);
  }
  render(null, host);
  const lang = o.lang ?? 'uk';
  w.__results = o.results;
  session = null;
  const ls = new Set<() => void>();
  const changed = (): void => { openIfDue(); for (const l of [...ls]) l(); paint(); };
  const openIfDue = (): void => {
    if (session !== null || roadHomeResult(w.__results) !== null) return;
    session = createMinigameSession(DRIVE_HOME as AnyMinigame, {
      results: w.__results, seed: 7,
      report: (r) => { w.__results = recordResult(w.__results, ROAD_HOME_ID, r.outcome, r.consequence) ?? w.__results; changed(); },
    });
    session.subscribe(paint);
  };
  const port: SamplePort = {
    stage: () => 'day', lane: () => null, neighbours: () => [], report: () => null, goal: () => 'done', flags: () => [], moneyCents: () => 0, seed: () => 7, weather: () => 'rain',
    onFrame: () => () => undefined, driveInDone: () => undefined, board: () => undefined, saveBoard: () => undefined, stormNight: () => undefined,
    request: () => ({ id: null, n: 0 }), working: () => undefined,
    strike: () => CLOSED, saveStrike: () => undefined,
    roadHome: () => (session !== null && session.run.phase !== 'closed' ? null : roadHomeResult(w.__results)),
    restart: () => Promise.resolve(), subscribe: (l) => { ls.add(l); return () => { ls.delete(l); }; },
  };
  const paint = (): void => {
    if (session !== null && session.run.phase === 'closed') session = null;
    render(
      <>
        <SampleDay port={port} t={(k: Key) => t(lang, k)} lang={lang} onBoard={() => undefined} />
        {session !== null && <MinigameHost session={session} t={(k: Key) => t(lang, k)} lang={lang} Surface={missionSurface(ROAD_HOME_ID) as never} />}
      </>,
      host as HTMLElement,
    );
  };
  openIfDue();
  paint();
};

/** Людина за кермом: рівна їзда з об'їздом перешкод, по кадру, до результату. */
w.__rhPlay = () => {
  const s = session as MinigameSession;
  for (let i = 0; i < 20_000 && s.run.phase === 'play'; i++) {
    const st = s.run.state as DriveMgState;
    const to = dodgeTo(st.drive, st.course, 230);
    if (to !== null && st.drive.changing === 0) s.drag({ x: (to * 2 + 1) / 6, y: 0.5 });
    s.frame();
  }
};
