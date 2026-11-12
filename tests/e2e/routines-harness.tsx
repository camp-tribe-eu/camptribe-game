// GAME-311 · стенд для game-311.spec.ts: справжня панель рутин зі справжнім CSS гри, без проходу світом.
// Крок кадру дає сам стенд (гра веде час від кадру сцени; тут — той самий договір: панель свого таймера не має).
import { render } from 'preact';
import { CampRoutines } from '../../src/ui/CampRoutines';
import { t } from '../../src/i18n';
import type { Key } from '../../src/i18n';
import type { Weather } from '../../src/core/weather';

interface Spec { lang: 'uk' | 'en'; weather: Weather; seed: number }
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
  render(<CampRoutines t={(k: Key) => t(s.lang, k)} weather={s.weather} seed={s.seed} onFrame={onFrame} devices={{ 'fish-trap': { care: 0.3 } }} />, host);
};
