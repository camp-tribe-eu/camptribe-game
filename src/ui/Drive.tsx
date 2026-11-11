// GAME-309 · дорога: екран міні-гри. Логіка — чиста `src/content/drive.ts`; тут лише показ, дотик і кадри.
// Вигляд свій: погляд згори на три смуги, наші знаки, наші кольори (жодних чужих форм і назв — §5б DAY-DESIGN).
// Один палець: свайп убік — перестроїтись, великі кнопки (≥ 48 px) для тих, кому свайп незручний. Пауза — завжди.
// Кадри: requestAnimationFrame, і крок логіки бере dt КАДРУ. Жодного setTimeout, жодного реального годинника в правилах.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Key } from '../i18n';
import {
  HAZARD_LEN_M, LANES, LANE_CHANGE_MS, TANK_MAX_L, VIEW_M, buildCourse, driveResult, helpFor, kmDone, kmLeft, progressOf, startDrive, stepDrive, willMakeReception,
  type Course, type DriveEvent, type DriveInput, type DriveResult, type DriveState, type Lane, type StopKind, type StoppedWhy,
} from '../content/drive';
import { nextBeats, type DriveBeat } from '../content/drive-script';

/** Мінімальний дотиковий розмір (OD-014): палець, а не курсор. */
const TAP = 56;
/** Свайп зараховується від цього зсуву — випадковий дотик смугу не міняє. */
const SWIPE_PX = 30;

const SPEAKER_KEY: Readonly<Record<DriveBeat['speaker'], Key>> = {
  george: 'ui.drive.speakerGeorge', victoria: 'ui.drive.speakerVictoria', matthew: 'ui.drive.speakerMatthew',
  radio: 'ui.drive.speakerRadio', sign: 'ui.drive.speakerSign',
};
const WAIT_KEY: Readonly<Record<StoppedWhy, Key>> = {
  refuel: 'ui.drive.waitRefuel', rest: 'ui.drive.waitRest', puncture: 'ui.drive.waitPuncture',
  diversion: 'ui.drive.waitDiversion', dry: 'ui.drive.waitDry',
};
const STOP_KEY: Readonly<Record<StopKind, Key>> = { fuel: 'ui.drive.stopFuel', rest: 'ui.drive.stopRest' };
const RESULT_KEY = { good: 'ui.drive.resultGood', fine: 'ui.drive.resultFine', scrappy: 'ui.drive.resultScrappy' } as const;

const S = {
  root: { position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: '#1b1f23', color: '#e8e6e3', userSelect: 'none', touchAction: 'none', overflow: 'hidden' },
  strip: { flex: 0, padding: 8, display: 'flex', flexDirection: 'column', rowGap: 6, background: '#232a30' },
  stripTop: { display: 'flex', alignItems: 'center', columnGap: 8, fontSize: 13 },
  bar: { position: 'relative', height: 10, borderRadius: 5, background: '#111519', overflow: 'hidden' },
  fill: { position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: 5 },
  gauges: { display: 'flex', columnGap: 10, fontSize: 12 },
  gauge: { flex: 1 },
  road: { position: 'relative', flex: 1, minHeight: 0, background: '#4b4f45', overflow: 'hidden', touchAction: 'none' },
  lane: { position: 'absolute', top: 0, bottom: 0, width: '33.33%' },
  divider: { position: 'absolute', top: 0, bottom: 0, width: 3, background: '#d9d4c5', opacity: 0.55 },
  hazard: { position: 'absolute', borderRadius: 4, borderWidth: 2, borderStyle: 'solid', borderColor: '#2b2f26' },
  car: { position: 'absolute', width: '22%', top: '82%', height: '12%', borderRadius: 6, background: '#d94f30', borderWidth: 2, borderStyle: 'solid', borderColor: '#f2e3c8' },
  sign: { position: 'absolute', left: 8, top: 8, padding: 4, borderRadius: 4, fontSize: 11, background: '#f2e3c8', color: '#1b1f23', borderWidth: 2, borderStyle: 'solid', borderColor: '#b03a28' },
  beat: { position: 'absolute', left: 8, right: 8, bottom: 8, padding: 8, borderRadius: 8, background: '#101418', fontSize: 14, lineHeight: 1.35 },
  wait: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#101418', opacity: 0.88, fontSize: 16 },
  pad: { flex: 0, display: 'flex', alignItems: 'center', columnGap: 8, padding: 8, background: '#232a30' },
  btn: { minWidth: TAP, minHeight: TAP, borderRadius: 10, borderWidth: 0, background: '#3d4a52', color: '#e8e6e3', fontSize: 14, fontFamily: 'inherit' },
  btnWide: { flex: 1, minWidth: TAP, minHeight: TAP, borderRadius: 10, borderWidth: 0, background: '#3d4a52', color: '#e8e6e3', fontSize: 14, fontFamily: 'inherit' },
  over: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', rowGap: 12, background: '#101418', padding: 16, textAlign: 'center' },
  title: { fontSize: 18 },
  spacer: { flex: 1 },
} as const;

const HAZARD_FILL = { lorry: '#8d7a4a', tractor: '#5a7a3a', roadworks: '#c98a1e', cyclist: '#3a6a8d' } as const;

/** Верх перешкоди у відсотках висоти дороги: чим далі попереду, тим вище. */
export function depthTop(aheadM: number): number {
  const d = Math.max(0, Math.min(1, aheadM / VIEW_M));
  return (1 - d) * 86;
}

/** Ліва межа авто у відсотках ширини дороги: під час перестроювання — плавно між смугами. */
export function carLeft(lane: Lane, toLane: Lane, changing: number): number {
  const k = changing > 0 ? 1 - changing / LANE_CHANGE_MS : 1;
  return (lane + (toLane - lane) * k) * 33.33 + 5;
}

export interface DriveProps {
  readonly t: (key: Key) => string;
  readonly seed: number;
  readonly moneyCents: number;
  /** Скільки «сяк-так» поспіль уже було: від двох вмикається допомога (ширший запас часу й пального). */
  readonly scrappyStreak?: number;
  /** Поїздка скінчилась — підсумок для GAME-310 (набір вільних ділянок усередині). */
  readonly onDone: (result: DriveResult) => void;
  /** Лише стенд e2e: у скільки разів швидше йде ігровий час (1 — як у грі). Правила від цього не міняються. */
  readonly speedUp?: number;
  /** Лише стенд e2e: кадр логіки стався. */
  readonly onFrame?: (s: DriveState, c: Course, events: readonly DriveEvent[]) => void;
}

export function Drive({ t, seed, moneyCents, scrappyStreak = 0, onDone, speedUp = 1, onFrame }: DriveProps) {
  const help = helpFor(scrappyStreak);
  const courseRef = useRef<Course | null>(null);
  if (courseRef.current === null) courseRef.current = buildCourse(seed, help);
  const course = courseRef.current;
  const [state, setState] = useState<DriveState>(() => startDrive(course, moneyCents, help));
  const [paused, setPaused] = useState(false);
  const [said, setSaid] = useState<readonly string[]>([]);
  const [line, setLine] = useState<DriveBeat | null>(null);
  const [result, setResult] = useState<DriveResult | null>(null);
  const live = useRef({ state, said, paused, result });
  live.current = { state, said, paused, result };

  const apply = (next: DriveState, events: readonly DriveEvent[]): void => {
    const cur = live.current;
    const fresh = nextBeats(next, course, events, new Set(cur.said));
    if (fresh.length > 0) { setSaid([...cur.said, ...fresh.map((b) => b.id)]); setLine(fresh[fresh.length - 1] ?? null); }
    setState(next);
    if (next.phase === 'arrived' && cur.result === null) setResult(driveResult(next, course));
  };

  const act = (input: DriveInput): void => {
    const cur = live.current;
    if (cur.paused || cur.result !== null) return;
    const r = stepDrive(cur.state, course, input);
    apply(r.state, r.events);
  };

  // Кадр: dt справжнього кадру × speedUp. Логіка не знає ні про rAF, ні про годинник — лише про dt.
  useEffect(() => {
    let raf = 0; let prev = 0;
    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame);
      const dt = prev === 0 ? 0 : now - prev;
      prev = now;
      const cur = live.current;
      if (cur.paused || cur.result !== null || dt <= 0) return;
      const r = stepDrive(cur.state, course, { kind: 'tick', dtMs: dt * speedUp });
      apply(r.state, r.events);
      onFrame?.(r.state, course, r.events);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [course, speedUp, onFrame, apply]);

  // Свайп по дорозі: горизонтальний зсув понад SWIPE_PX — сусідня смуга. Вертикальний рух смугу не міняє.
  const down = useRef<{ x: number; y: number } | null>(null);
  const onDown = (e: PointerEvent): void => { down.current = { x: e.clientX, y: e.clientY }; };
  const onUp = (e: PointerEvent): void => {
    const from = down.current; down.current = null;
    if (!from) return;
    const dx = e.clientX - from.x;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(e.clientY - from.y)) return;
    move(dx > 0 ? 1 : -1);
  };
  const move = (d: -1 | 1): void => {
    const to = live.current.state.lane + d;
    if (to >= 0 && to <= 2) act({ kind: 'lane', to: to as Lane });
  };

  const p = progressOf(state, course);
  const ok = willMakeReception(state, course);

  return (
    <div style={S.root} data-ui="drive" data-phase={state.phase} data-lane={state.lane} data-pace={state.pace}
      data-comfort={Math.round(state.comfort)} data-fuel={state.fuelL.toFixed(2)} data-money={state.moneyCents} data-fines={state.finesCents}
      data-sec={state.sec.toFixed(1)} data-outcome={result?.outcome ?? ''} data-free={result?.freePitches.join(' ') ?? ''}>
      <div style={S.strip}>
        <div style={S.stripTop}>
          <span data-ui="drive-done">{`${t('ui.drive.done')}: ${kmDone(state)} ${t('ui.drive.km')}`}</span>
          <span data-ui="drive-left">{`${t('ui.drive.left')}: ${kmLeft(state, course)} ${t('ui.drive.km')}`}</span>
          <span style={S.spacer} />
          <button type="button" style={S.btn} data-ui="drive-pause" aria-label={t('ui.drive.pause')}
            onClick={() => setPaused((x) => !x)}>{paused ? t('ui.drive.resume') : t('ui.drive.pause')}</button>
        </div>
        <div style={S.bar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)} aria-label={t('ui.drive.done')}>
          <span style={{ ...S.fill, width: `${p * 100}%`, background: '#6fb26f' }} />
        </div>
        <div data-ui="drive-eta" data-ok={ok ? 1 : 0} style={{ fontSize: 13, color: ok ? '#9ad29a' : '#e3a06a' }}>{ok ? t('ui.drive.etaOk') : t('ui.drive.etaLate')}</div>
        <div style={S.gauges}>
          <div style={S.gauge}>
            <div>{t('ui.drive.fuel')}</div>
            <div style={S.bar}><span data-ui="drive-fuel-fill" style={{ ...S.fill, width: `${Math.min(100, (state.fuelL / TANK_MAX_L) * 100)}%`, background: '#d9b44a' }} /></div>
          </div>
          <div style={S.gauge}>
            <div>{t('ui.drive.comfort')}</div>
            <div style={S.bar}><span data-ui="drive-comfort-fill" style={{ ...S.fill, width: `${state.comfort}%`, background: state.comfort < 40 ? '#d96a4a' : '#6fb2a8' }} /></div>
          </div>
        </div>
      </div>

      <div style={S.road} data-ui="drive-road" onPointerDown={onDown} onPointerUp={onUp}>
        {LANES.map((l) => <div key={l} style={{ ...S.lane, left: `${l * 33.33}%`, background: l === 1 ? '#50554a' : '#4b4f45' }} />)}
        {[1, 2].map((i) => <div key={i} style={{ ...S.divider, left: `${i * 33.33}%` }} />)}
        {course.hazards.filter((h) => h.at - state.metres > -HAZARD_LEN_M[h.kind] - 30 && h.at - state.metres < VIEW_M).map((h) => (
          <div key={h.id} data-ui="drive-hazard" data-kind={h.kind} style={{
            ...S.hazard, left: `${h.lane * 33.33 + 5}%`, width: '23%', background: HAZARD_FILL[h.kind],
            height: `${Math.max(3, (HAZARD_LEN_M[h.kind] / VIEW_M) * 100)}%`, top: `${depthTop(h.at - state.metres)}%`,
          }} />
        ))}
        {state.cameraAhead && <div style={S.sign} data-ui="drive-camera-sign">{t('ui.drive.cameraAhead')}</div>}
        <div style={{ ...S.car, left: `${carLeft(state.lane, state.toLane, state.changing)}%` }} data-ui="drive-car" />
        {state.stoppedWhy !== null && <div style={S.wait} data-ui="drive-wait" data-why={state.stoppedWhy}>{`${t(WAIT_KEY[state.stoppedWhy])} — ${Math.ceil(state.stoppedFor)}`}</div>}
        {line !== null && <div style={S.beat} data-ui="drive-beat" data-beat={line.id}>{`${t(SPEAKER_KEY[line.speaker])}: ${t(line.key as Key)}`}</div>}
      </div>

      <div style={S.pad}>
        <button type="button" style={S.btn} data-ui="drive-left-btn" aria-label={t('ui.drive.laneLeft')} onClick={() => move(-1)}>{'◀'}</button>
        <button type="button" style={S.btnWide} data-ui="drive-pace" data-pace={state.pace}
          onClick={() => act({ kind: 'pace', pace: state.pace === 'steady' ? 'brisk' : 'steady' })}>{t(state.pace === 'steady' ? 'ui.drive.paceSteady' : 'ui.drive.paceBrisk')}</button>
        {state.offer !== null && <button type="button" style={S.btnWide} data-ui="drive-stop" data-kind={state.offer.kind} onClick={() => act({ kind: 'stop' })}>{t(STOP_KEY[state.offer.kind])}</button>}
        <button type="button" style={S.btn} data-ui="drive-right-btn" aria-label={t('ui.drive.laneRight')} onClick={() => move(1)}>{'▶'}</button>
      </div>

      {result !== null && (
        <div style={S.over} data-ui="drive-result" data-outcome={result.outcome} data-free={result.freePitches.join(' ')}>
          <strong style={S.title}>{t(RESULT_KEY[result.outcome])}</strong>
          <span data-ui="drive-result-pitches">{`${t('ui.drive.freePitches')}: ${result.freePitches.length}`}</span>
          {result.finesCents > 0 && <span data-ui="drive-result-fine">{t('ui.drive.fineTaken')}</span>}
          <button type="button" style={S.btnWide} data-ui="drive-arrive" onClick={() => onDone(result)}>{t('ui.drive.arrive')}</button>
        </div>
      )}
      {paused && <div style={S.over} data-ui="drive-paused"><strong style={S.title}>{t('ui.drive.pause')}</strong>
        <button type="button" style={S.btnWide} data-ui="drive-unpause" onClick={() => setPaused(false)}>{t('ui.drive.resume')}</button></div>}
    </div>
  );
}
