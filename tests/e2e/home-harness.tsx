// GAME-352 · стенд для game-352.spec.ts: справжні SampleDay + справжній CSS; ранок закрито й дорогу додому пройдено, далі — сцена «вдома» і кінцева картка.
// Порт пише «вдома» так, як main.ts (SeeHome → homeSeen), перезавантаження — це повторний монтаж із `home: true`. Проводку main.ts веде game-314 (повний день).
import { render } from 'preact';
import { SampleDay, type SamplePort } from '../../src/ui/SampleDay';
import { t } from '../../src/i18n';
import type { Key } from '../../src/i18n';
import { pitchFlag } from '../../src/content/arrival-pitch';
import { MISSIONS } from '../../src/content/missions';
import type { StrikeSave } from '../../src/content/camp-strike';

interface Opts { home?: boolean; road?: string; lang?: 'uk' | 'en'; clean?: string }
const w = window as unknown as { __home?: boolean; __restarts: number; __seen: number; __mountHome: (o?: Opts) => void };

w.__mountHome = (o = {}) => {
  let host = document.getElementById('harness');
  if (!host) {
    host = document.createElement('div');
    host.id = 'harness';
    host.style.cssText = 'position:fixed;inset:0;z-index:99;background:#1b1f23;--edge-left:0px;--edge-right:0px;--edge-bottom:0px;--edge-top:0px';
    document.body.append(host);
  }
  render(null, host);
  const lang = o.lang ?? 'uk';
  w.__home = o.home === true; w.__restarts = 0; w.__seen = 0;
  const g = o.clean ?? 'fine';
  const strike: StrikeSave = { closed: true, results: { tent: g, litter: g, fire: g, car: g } as StrikeSave['results'] };
  const flags = ['f.arrival-early', pitchFlag('water'), ...MISSIONS.slice(0, 2).map((m) => m.doneFlag)];
  const ls = new Set<() => void>();
  const port: SamplePort = {
    stage: () => 'day', lane: () => null, neighbours: () => [], report: () => null, goal: () => 'done', flags: () => flags, moneyCents: () => 4250, seed: () => 7, weather: () => 'rain',
    onFrame: () => () => undefined, driveInDone: () => undefined, board: () => undefined, saveBoard: () => undefined, stormNight: () => undefined,
    request: () => ({ id: null, n: 0 }), working: () => undefined,
    strike: () => strike, saveStrike: () => undefined, roadHome: () => o.road ?? 'fine',
    homeSeen: () => w.__home === true, seeHome: () => { w.__home = true; w.__seen++; for (const l of [...ls]) l(); },
    restart: () => { w.__restarts++; return Promise.resolve(); }, subscribe: (l) => { ls.add(l); return () => { ls.delete(l); }; },
  };
  render(<SampleDay port={port} t={(k: Key) => t(lang, k)} lang={lang} onBoard={() => undefined} />, host);
};
