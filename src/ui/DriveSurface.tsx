// GAME-309 · поверхня дороги для MinigameHost: три смуги згори, смуга прогресу з рецепцією, пальне й комфорт,
// репліки родини. Правила — у content/minigames/drive.ts; тут лише показ і дотик (UI не імпортує значень з ядра).
// Один палець: свайп по дорозі — смуга, великі кнопки (≥ 48 px, клас .mg-btn) — для тих, кому свайп незручний.
// Вступ, час, пауза й результат малює оболонка (MinigameHost): тут їх немає навмисно.
import type { Key } from '../i18n';
import type { SurfaceProps } from './MinigameHost';

/** Форма даних із content/minigames/drive.ts (UI читає лише форму, не імпортує значень). */
interface DriveHazard { readonly id: string; readonly kind: string; readonly lane: number; readonly depth: number; readonly len: number }
interface DriveSurfaceData {
  readonly lane: number;
  readonly laneAt: number;
  readonly pace: 'steady' | 'brisk';
  readonly progress: number;
  readonly kmDone: number;
  readonly kmLeft: number;
  readonly inTime: boolean;
  readonly fuel: number;
  readonly comfort: number;
  readonly finesCents: number;
  readonly cameraAhead: boolean;
  readonly stopOffer: 'fuel' | 'rest' | null;
  readonly waiting: string | null;
  readonly hazards: readonly DriveHazard[];
  readonly beatKey: string | null;
  readonly beatSpeaker: string | null;
  readonly freeLane: number | null;
}

const LANES = [0, 1, 2];
const pct = (x: number): string => `${Math.max(0, Math.min(1, x)) * 100}%`;
/** Верх перешкоди: чим далі попереду, тим вище. */
const topOf = (depth: number): string => `${(1 - depth) * 84}%`;
const SPEAKER_KEY: Readonly<Record<string, Key>> = {
  george: 'ui.drive.speakerGeorge', victoria: 'ui.drive.speakerVictoria', matthew: 'ui.drive.speakerMatthew',
  radio: 'ui.drive.speakerRadio', sign: 'ui.drive.speakerSign',
};
const WAIT_KEY: Readonly<Record<string, Key>> = {
  refuel: 'ui.drive.waitRefuel', rest: 'ui.drive.waitRest', puncture: 'ui.drive.waitPuncture',
  diversion: 'ui.drive.waitDiversion', dry: 'ui.drive.waitDry',
};
const STOP_KEY: Readonly<Record<string, Key>> = { fuel: 'ui.drive.stopFuel', rest: 'ui.drive.stopRest' };
/** Зони вхідних тапів (ті самі числа, що читає `stepDriveMg`): верх — швидкість, низ — з'їхати. */
const PACE_TAP = { x: 0.5, y: 0.1 };
const STOP_TAP = { x: 0.5, y: 0.9 };
/** Центр смуги в долях ширини — ним кнопки ◀ ▶ «перетягують» авто. */
const laneCentre = (lane: number): number => (lane * 2 + 1) / 6;

export function DriveSurface({ view, t, tap, drag }: SurfaceProps) {
  const s = view.surface as DriveSurfaceData;
  const toLane = (d: -1 | 1): void => { const to = s.lane + d; if (to >= 0 && to <= 2) drag({ x: laneCentre(to), y: 0.5 }); };
  const swipe = (e: PointerEvent): void => {
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (box.width > 0) drag({ x: (e.clientX - box.left) / box.width, y: 0.5 });
  };

  return (
    <div class="mg-drive" data-ui="mg-drive" data-lane={s.lane} data-pace={s.pace} data-fines={s.finesCents}
      data-fuel={s.fuel.toFixed(3)} data-comfort={s.comfort.toFixed(3)} data-progress={s.progress.toFixed(3)}>
      <div class="mg-drive-strip">
        <span data-ui="mg-drive-done">{`${t('ui.drive.done')}: ${s.kmDone} ${t('ui.drive.km')}`}</span>
        <span data-ui="mg-drive-left">{`${t('ui.drive.left')}: ${s.kmLeft} ${t('ui.drive.km')}`}</span>
        <span class="mg-drive-eta" data-ui="mg-drive-eta" data-ok={s.inTime ? 'yes' : 'no'}>{s.inTime ? t('ui.drive.etaOk') : t('ui.drive.etaLate')}</span>
      </div>
      <div class="mg-drive-gauges">
        <div class="mg-drive-gauge mg-drive-fuel" role="progressbar" aria-label={t('ui.drive.fuel')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(s.fuel * 100)}><i style={{ width: pct(s.fuel) }} /></div>
        <div class="mg-drive-gauge mg-drive-comfort" data-low={s.comfort < 0.4 ? 'yes' : 'no'} role="progressbar" aria-label={t('ui.drive.comfort')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(s.comfort * 100)}><i style={{ width: pct(s.comfort) }} /></div>
      </div>

      <div class="mg-drive-road" data-ui="mg-drive-road" role="img" aria-label={t('mg.drive.lanes')}
        onPointerDown={swipe} onPointerMove={(e) => { if (e.buttons !== 0 || e.pointerType === 'touch') swipe(e); }}>
        {LANES.map((l) => <div key={l} class="mg-drive-lane" data-mid={l === 1 ? 'yes' : 'no'} data-free={s.freeLane === l ? 'yes' : 'no'} style={{ left: pct(l / 3) }} />)}
        {[1, 2].map((i) => <div key={i} class="mg-drive-divider" style={{ left: pct(i / 3) }} />)}
        {s.hazards.map((h) => (
          <div key={h.id} class="mg-drive-hazard" data-ui="mg-drive-hazard" data-kind={h.kind}
            style={{ left: pct(h.lane / 3 + 0.05), top: topOf(h.depth), height: pct(Math.max(0.03, h.len)) }} />
        ))}
        {s.cameraAhead && <div class="mg-drive-sign" data-ui="mg-drive-camera">{t('ui.drive.cameraAhead')}</div>}
        <div class="mg-drive-car" data-ui="mg-drive-car" style={{ left: pct(s.laneAt / 3 + 0.05) }} />
        {s.waiting !== null && <div class="mg-drive-wait" data-ui="mg-drive-wait" data-why={s.waiting}>{t(WAIT_KEY[s.waiting] ?? 'ui.drive.waitRest')}</div>}
      </div>

      <p class="mg-drive-beat" data-ui="mg-drive-beat" data-beat={s.beatKey ?? ''}>
        {s.beatKey === null ? t('ui.drive.swipeHint') : `${t(SPEAKER_KEY[s.beatSpeaker ?? 'george'] ?? 'ui.drive.speakerGeorge')}: ${t(s.beatKey as Key)}`}
      </p>

      <div class="mg-drive-pad">
        <button type="button" class="ui-btn mg-btn" data-ui="mg-drive-lane-left" aria-label={t('ui.drive.laneLeft')} onClick={() => toLane(-1)}>{'◀'}</button>
        <button type="button" class="ui-btn mg-btn mg-drive-wide" data-ui="mg-drive-pace" data-pace={s.pace} onClick={() => tap(PACE_TAP)}>
          {t(s.pace === 'steady' ? 'ui.drive.paceSteady' : 'ui.drive.paceBrisk')}
        </button>
        {s.stopOffer !== null && (
          <button type="button" class="ui-btn mg-btn mg-drive-wide" data-ui="mg-drive-stop" data-kind={s.stopOffer} onClick={() => tap(STOP_TAP)}>
            {t(STOP_KEY[s.stopOffer] ?? 'ui.drive.stopRest')}
          </button>
        )}
        <button type="button" class="ui-btn mg-btn" data-ui="mg-drive-lane-right" aria-label={t('ui.drive.laneRight')} onClick={() => toLane(1)}>{'▶'}</button>
      </div>
    </div>
  );
}
