// GAME-350 · стенд для game-350.spec.ts: справжній SampleDay зі справжнім CSS гри; порт зберігає ранок так, як main.ts (перевіряє форму ядра `strikeError`) і сповіщує підписників.
import { render } from 'preact';
import { SampleDay, type SamplePort } from '../../src/ui/SampleDay';
import { t } from '../../src/i18n';
import type { Key } from '../../src/i18n';
import { strikeError } from '../../src/core/camp-strike';
import type { StrikeSave } from '../../src/content/camp-strike';

interface W { __strike?: StrikeSave | undefined; __saves: number; __lang?: 'uk' | 'en' }
const w = window as unknown as W & { __mountStrike: (o?: { saved?: StrikeSave | undefined; lang?: 'uk' | 'en' }) => void };

w.__mountStrike = (o = {}) => {
  let host = document.getElementById('harness');
  if (!host) {
    host = document.createElement('div');
    host.id = 'harness';
    host.style.cssText = 'position:fixed;inset:0;z-index:99;background:#1b1f23;--edge-left:0px;--edge-right:0px;--edge-bottom:0px;--edge-top:0px';
    document.body.append(host);
  }
  render(null, host);
  const lang = o.lang ?? 'uk';
  w.__strike = o.saved;
  w.__saves = 0;
  const ls = new Set<() => void>();
  const port: SamplePort = {
    stage: () => 'day', lane: () => null, neighbours: () => [], report: () => null, goal: () => 'done', flags: () => [], moneyCents: () => 0, seed: () => 7, weather: () => 'rain',
    onFrame: () => () => undefined, driveInDone: () => undefined, board: () => undefined, saveBoard: () => undefined, stormNight: () => undefined,
    request: () => ({ id: null, n: 0 }), working: () => undefined,
    strike: () => w.__strike,
    saveStrike: (s) => { const why = strikeError(s); if (why !== null) throw new Error(`SaveStrike rejected: ${why}`); w.__strike = s; w.__saves++; for (const l of [...ls]) l(); },
    restart: () => Promise.resolve(), subscribe: (l) => { ls.add(l); return () => { ls.delete(l); }; },
  };
  render(<SampleDay port={port} t={(k: Key) => t(lang, k)} lang={lang} onBoard={() => undefined} />, host);
};
