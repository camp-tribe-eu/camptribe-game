// GAME-309 · стенд для game-309.spec.ts: справжній екран дороги (src/ui/Drive) без проходу всією грою.
// Тест грає в нього дотиком, як гравець. `speedUp` стискає ігровий час — правила від цього не міняються
// (крок логіки так само бере dt кадру), просто п'ять хвилин поїздки проходять за десятки секунд.
import { render } from 'preact';
import { Drive } from '../../src/ui/Drive';
import { dodgeTo } from '../../src/content/drive.fixture';
import { t, type Key } from '../../src/i18n';
import type { Course, DriveResult, DriveState } from '../../src/content/drive';

interface Spec { seed: number; moneyCents: number; speedUp: number; lang: 'uk' | 'en' }
interface Probe {
  mount: (s: Spec) => void;
  /** Куди варто перестроїтись, щоб не впертись у перешкоду; null — у своїй смузі чисто. */
  advice: () => number | null;
  state: DriveState | null;
  result: DriveResult | null;
}

const probe: Probe = { mount: () => undefined, advice: () => null, state: null, result: null };
let course: Course | null = null;

probe.mount = (s: Spec): void => {
  let host = document.getElementById('drive-harness');
  if (!host) { host = document.createElement('div'); host.id = 'drive-harness'; host.style.cssText = 'position:fixed;inset:0;z-index:99'; document.body.append(host); }
  render(null, host);
  probe.state = null; probe.result = null; course = null;
  render(
    <Drive
      t={(k: Key) => t(s.lang, k)}
      seed={s.seed}
      moneyCents={s.moneyCents}
      speedUp={s.speedUp}
      onFrame={(st, c) => { probe.state = st; course = c; }}
      onDone={(r) => { probe.result = r; }}
    />,
    host,
  );
};
probe.advice = (): number | null => (probe.state && course ? dodgeTo(probe.state, course) : null);

(window as unknown as { __drive: Probe }).__drive = probe;
