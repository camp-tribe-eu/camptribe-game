// GAME-311 · стенд для game-311.spec.ts: справжня панель рутин зі справжнім CSS гри, без проходу світом.
// Крок кадру дає сам стенд (гра веде час від кадру сцени; тут — той самий договір: панель свого таймера не має).
import { render } from 'preact';
import { CampRoutines } from '../../src/ui/CampRoutines';
import { t } from '../../src/i18n';
import type { Key } from '../../src/i18n';
import type { Weather } from '../../src/core/weather';
import type { Devices } from '../../src/content/camp-devices';
import { DriveInCard, SampleDay, type SamplePort } from '../../src/ui/SampleDay';
import { MinigameHost } from '../../src/ui/MinigameHost';
import { missionSurface } from '../../src/ui/MissionSurfaces';
import { createMinigameSession } from '../../src/view/minigame-session';
import { TARP_TIE } from '../../src/content/minigames/missions';
import { minigameById } from '../../src/content/minigames';
import { NORMAL, type AnyMinigame } from '../../src/core/minigame';

interface Spec { lang: 'uk' | 'en'; weather: Weather; seed: number; bare?: boolean; devices?: Devices }
(window as unknown as { __mount: (s: Spec) => void }).__mount = (s) => {
  let host = document.getElementById('harness');
  if (!host) {
    host = document.createElement('div');
    host.id = 'harness';
    host.style.cssText = 'position:fixed;inset:0;z-index:99;background:#1b1f23;--edge-left:0px;--edge-right:0px;--edge-bottom:0px;--edge-top:0px';
    document.body.append(host);
  }
  render(null, host);
  const onFrame = (cb: (dtMs: number) => void): (() => void) => {
    let live = true;
    let prev = 0;
    const loop = (now: number) => {
      if (!live) return;
      if (prev > 0) cb(Math.min(50, now - prev));
      prev = now;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return () => { live = false; };
  };
  // Табір, де вже стоїть верша, але її давно не переносили: дошка має показати «ось-ось закінчиться» і «Доглянути».
  const draw = (live: boolean) => render(<CampRoutines t={(k: Key) => t(s.lang, k)} weather={s.weather} seed={s.seed} onFrame={onFrame} live={live} devices={s.devices ?? (s.bare ? {} : { 'fish-trap': { care: 0.3 } })} />, host);
  draw(true);
  // GAME-346: дошку знову показано (у грі — після розмови чи «Дошка табору»): live false→true.
  (window as unknown as { __live: (v: boolean) => void }).__live = draw;
};

/** GAME-323: заїзд на ділянку (картка зразкового дня) на тому самому стенді — щоб перевірити, що в альбомі вона стоїть на екрані без прокрутки. */
(window as unknown as { __mountDrive: (lane: string) => void }).__mountDrive = (lane) => {
  let host = document.getElementById('harness');
  if (!host) {
    host = document.createElement('div');
    host.id = 'harness';
    host.style.cssText = 'position:fixed;inset:0;z-index:99;background:#1b1f23;--edge-left:0px;--edge-right:0px;--edge-bottom:0px;--edge-top:0px';
    document.body.append(host);
  }
  render(null, host);
  render(<DriveInCard laneId={lane} t={(k: Key) => t('uk', k)} done={() => undefined} />, host);
};

/** GAME-323: кінець зразкового дня — справжній SampleDay із портом-пустушкою: goal 'done' → підсумок з єдиною дією «Почати знову» (її виклики лічить window.__restarts). */
(window as unknown as { __mountSample: (goal: 'day' | 'done') => void }).__mountSample = (goal) => {
  let host = document.getElementById('harness');
  if (!host) {
    host = document.createElement('div');
    host.id = 'harness';
    host.style.cssText = 'position:fixed;inset:0;z-index:99;background:#1b1f23;--edge-left:0px;--edge-right:0px;--edge-bottom:0px;--edge-top:0px';
    document.body.append(host);
  }
  render(null, host);
  const w = window as unknown as { __restarts?: number };
  w.__restarts = 0;
  const port: SamplePort = {
    stage: () => 'day', lane: () => null, neighbours: () => [], report: () => null, goal: () => goal, flags: () => [], moneyCents: () => 0, seed: () => 7, weather: () => 'rain',
    onFrame: () => () => undefined, driveInDone: () => undefined, board: () => undefined, saveBoard: () => undefined, stormNight: () => undefined,
    request: () => ({ id: null, n: 0 }), working: () => undefined,
    restart: () => { w.__restarts = (w.__restarts ?? 0) + 1; return Promise.resolve(); }, subscribe: () => () => undefined,
  };
  render(<SampleDay port={port} t={(k: Key) => t('uk', k)} lang="uk" onBoard={() => undefined} />, host);
};

/** GAME-341: кінець зразкового дня УСЕРЕДИНІ #app разом із справжньою «Ціллю» (її чип лежить у .ui-strip), щоб CSS `#app:has(…)` бачив підсумок. */
(window as unknown as { __mountSummaryGoal: () => void }).__mountSummaryGoal = () => {
  const app = document.getElementById('app') as HTMLElement;
  document.getElementById('harness')?.remove();
  document.getElementById('goal-fake')?.remove();
  const strip = document.createElement('div');
  strip.id = 'goal-fake'; strip.className = 'ui-strip';
  strip.innerHTML = '<div class="ui-goal" data-ui="goal" data-ended="yes">Ціль: День скінчено</div>';
  app.append(strip);
  const host = document.createElement('div');
  host.id = 'harness';
  host.style.cssText = 'position:absolute;inset:0;z-index:40;background:#1b1f23;--edge-left:0px;--edge-right:0px;--edge-bottom:0px;--edge-top:0px';
  app.append(host);
  const port: SamplePort = {
    stage: () => 'day', lane: () => null, neighbours: () => [], report: () => null, goal: () => 'done', flags: () => [], moneyCents: () => 0, seed: () => 7, weather: () => 'rain',
    onFrame: () => () => undefined, driveInDone: () => undefined, board: () => undefined, saveBoard: () => undefined, stormNight: () => undefined,
    request: () => ({ id: null, n: 0 }), working: () => undefined, restart: () => Promise.resolve(), subscribe: () => () => undefined,
  };
  render(<SampleDay port={port} t={(k: Key) => t('uk', k)} lang="uk" onBoard={() => undefined} />, host);
};

/** GAME-346 (A03): шапка з чипами «Ціль» і «Далі:» (ті самі класи, що в Shell) + справжній SampleDay із підказкою про місця справ — щоб виміряти, чи лягають вони одне на одне. */
(window as unknown as { __mountChips: () => void }).__mountChips = () => {
  const app = document.getElementById('app') as HTMLElement;
  document.getElementById('harness')?.remove();
  document.getElementById('chips-fake')?.remove();
  const head = document.createElement('header');
  head.id = 'chips-fake'; head.className = 'ui-header'; head.style.minHeight = '64px';
  head.innerHTML = '<div class="ui-strip"><div class="ui-goal" data-ui="goal">Ціль: Допомогти сусідам: Аміна, Люк, Клер</div><div class="ui-next" data-ui="next-hint" data-kind="next">Далі: поверни прохання тому, хто просив</div></div>';
  app.prepend(head);
  const host = document.createElement('div');
  host.id = 'harness';
  host.style.cssText = 'position:absolute;inset:0;z-index:40;pointer-events:none;--edge-left:0px;--edge-right:0px;--edge-bottom:0px;--edge-top:0px';
  app.append(host);
  const port: SamplePort = {
    stage: () => 'day', lane: () => null, neighbours: () => [], report: () => null, goal: () => 'day', flags: () => [], moneyCents: () => 0, seed: () => 7, weather: () => 'rain',
    onFrame: () => () => undefined, driveInDone: () => undefined, board: () => undefined, saveBoard: () => undefined, stormNight: () => undefined,
    request: () => ({ id: null, n: 0 }), working: () => undefined, restart: () => Promise.resolve(), subscribe: () => () => undefined,
  };
  render(<SampleDay port={port} t={(k: Key) => t('uk', k)} lang="uk" onBoard={() => undefined} />, host);
};

/** GAME-341: справжня міні-гра «Тент над дровами» (TarpSurface = TuneSurface) уже в фазі гри — для перевірки видимого підпису повзунка. */
(window as unknown as { __mountTarp: () => void }).__mountTarp = () => {
  let host = document.getElementById('harness');
  if (!host) {
    host = document.createElement('div');
    host.id = 'harness';
    host.style.cssText = 'position:fixed;inset:0;z-index:99;background:#1b1f23;--edge-left:0px;--edge-right:0px;--edge-bottom:0px;--edge-top:0px';
    document.body.append(host);
  }
  render(null, host);
  const session = createMinigameSession(TARP_TIE, { results: undefined, seed: 1, report: () => undefined });
  session.start();
  render(<MinigameHost session={session} t={(k: Key) => t('uk', k)} lang="uk" Surface={missionSurface('mg.tarp-tie') as never} />, host);
};

/** GAME-343: справжня міні-гра місії за id у фазі гри + ручний ведучий кадрів: ідеальний гравець грає до зміни темпу й далі. */
interface MgHandle { session: ReturnType<typeof createMinigameSession>; def: AnyMinigame; since: number }
let mgHandle: MgHandle | null = null;
(window as unknown as { __mountMission: (id: string, lang?: 'uk' | 'en') => void }).__mountMission = (id, lang = 'uk') => {
  let host = document.getElementById('harness');
  if (!host) {
    host = document.createElement('div');
    host.id = 'harness';
    host.style.cssText = 'position:fixed;inset:0;z-index:99;background:#1b1f23;--edge-left:0px;--edge-right:0px;--edge-bottom:0px;--edge-top:0px';
    document.body.append(host);
  }
  render(null, host);
  const def = minigameById(id) as AnyMinigame;
  const session = createMinigameSession(def, { results: undefined, seed: 1, report: () => undefined });
  session.start();
  mgHandle = { session, def, since: 1000 };
  render(<MinigameHost session={session} t={(k: Key) => t(lang, k)} lang={lang} Surface={missionSurface(id) as never} />, host);
};
/** Грає `frames` кадрів (або до початку підпису зміни темпу, якщо `untilCue`); повертає, чи підпис зараз увімкнений. */
(window as unknown as { __mgPlay: (frames: number, untilCue: boolean) => boolean }).__mgPlay = (frames, untilCue) => {
  const h = mgHandle as MgHandle;
  const cue = (): boolean => Boolean((h.session.view().surface as { twist?: boolean }).twist);
  for (let i = 0; i < frames && h.session.run.phase === 'play'; i++) {
    const surf = h.session.view().surface as { beat?: number; dial?: number };
    if (surf.beat !== undefined) { if (++h.since >= surf.beat) { h.session.tap({ x: 0.5, y: 0.5 }); h.since = 0; } }
    else { const st = (h.def.view(h.session.run.state, { ...NORMAL, hint: true }) as { station: number }).station; h.session.drag({ x: st, y: 0.5 }); }
    h.session.frame();
    if (untilCue && cue()) break;
  }
  return cue();
};
