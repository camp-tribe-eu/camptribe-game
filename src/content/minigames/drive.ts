// GAME-309 · дорога до озера як міні-гра каркаса (GAME-308). Правила поїздки — у `src/content/drive.ts`
// (чисті, покадрові); тут лише оболонка договору: три результати, вхід одним пальцем, допомога, вигляд.
//
// Чому дорога вкладається в 30–90 с каркаса, хоча їхати «п'ять хвилин»: усередині модель живе в секундах
// ДОРОГИ, а один кадр гри додає `FRAME_ROAD_MS` (ROAD_SPEEDUP = 5). Смуга прогресу показує справжні 42 км
// і закриття рецепції, а гравець проводить за кермом ~50–75 с. Час на реакцію рахується вже в секундах
// ГРИ — саме їх відчуває гравець (`minTelegraphSec`).
//
// Що дорога віддає далі: `consequence` = `arrival.early | arrival.ontime | arrival.late` — рівно значення
// прапорця `f.arrival` з docs/ARRIVAL-CONTRACT.md. Набір вільних ділянок рахує приїзд (GAME-310).
import { FPS, defineMinigame, type Difficulty, type FrameInput, type Outcome } from '../../core/minigame';
import {
  COMFORT_MAX, FRAME_ROAD_MS, HAZARD_LEN_M, LANES, SHARP_COST, TANK_MAX_L, VIEW_M,
  arrivalConsequence, buildCourse, driveOutcome, driveResult, etaSec, kmDone, kmLeft, progressOf, speedOf, startDrive, stepDrive, willMakeReception,
  type Course, type DriveEvent, type DriveState, type Lane, type Pace,
} from '../drive';
import { nextBeats, type DriveBeat } from '../drive-script';

/** Скільки грошей у родини на старті поїздки, поки сцена приїзду не передала гаманець (GAME-310). */
export const DEFAULT_WALLET_CENTS = 50_000;

export interface DriveMgState {
  readonly course: Course;
  readonly drive: DriveState;
  /** Які репліки вже прозвучали (кожна рівно раз). */
  readonly said: readonly string[];
  /** Репліка, яку показувати зараз; null — ніхто не говорить. */
  readonly line: DriveBeat | null;
  /** Події останнього кадру — їх читає поверхня (звук, блимання знаку). */
  readonly events: readonly DriveEvent[];
}

export interface DriveHazardView { readonly id: string; readonly kind: string; readonly lane: Lane; readonly depth: number; readonly len: number }
export interface DriveView {
  readonly lane: Lane;
  readonly laneAt: number;
  readonly pace: Pace;
  readonly progress: number;
  readonly kmDone: number;
  readonly kmLeft: number;
  readonly inTime: boolean;
  readonly fuel: number;
  readonly comfort: number;
  readonly moneyCents: number;
  readonly finesCents: number;
  readonly cameraAhead: boolean;
  readonly stopOffer: 'fuel' | 'rest' | null;
  readonly waiting: string | null;
  readonly hazards: readonly DriveHazardView[];
  readonly beatKey: string | null;
  readonly beatSpeaker: string | null;
  /** Підказка допомоги: яка смуга попереду вільна (null — вільна своя). */
  readonly freeLane: Lane | null;
}

/** Смуги вхідних зон: верх екрана — швидкість, низ — з'їхати, середина — вести. */
export const PACE_ZONE_Y = 0.25;
export const STOP_ZONE_Y = 0.75;

/** Смуга за точкою перетягування 0..1 по ширині поля. */
export const laneAtX = (x: number): Lane => (x < 1 / 3 ? 0 : x < 2 / 3 ? 1 : 2) as Lane;

/** Вільна смуга попереду (підказка допомоги); null — у своїй чисто або вільної немає. */
export function freeLaneOf(s: DriveState, c: Course, look: number): Lane | null {
  const busy = (lane: Lane): boolean => c.hazards.some((h) => h.lane === lane && h.at + HAZARD_LEN_M[h.kind] >= s.metres - 4 && h.at - s.metres <= look);
  if (!busy(s.lane)) return null;
  const free = LANES.filter((l) => l !== s.lane && !busy(l));
  return free.length === 0 ? null : (free.reduce((a, b) => (Math.abs(a - s.lane) <= Math.abs(b - s.lane) ? a : b)) as Lane);
}

/** Один кадр гри = один крок дороги на FRAME_ROAD_MS. Вхід: перетягування — смуга, тап угорі — швидкість, тап унизу — з'їхати. */
export function stepDriveMg(s: DriveMgState, input: FrameInput, d: Difficulty): DriveMgState {
  const c = s.course;
  const events: DriveEvent[] = [];
  let st = s.drive;
  const go = (r: { state: DriveState; events: readonly DriveEvent[] }): void => { st = r.state; events.push(...r.events); };
  for (const p of input.taps) {
    if (p.y < PACE_ZONE_Y) go(stepDrive(st, c, { kind: 'pace', pace: st.pace === 'steady' ? 'brisk' : 'steady' }));
    else if (p.y >= STOP_ZONE_Y) go(stepDrive(st, c, { kind: 'stop' }));
  }
  if (input.drag) {
    const to = laneAtX(input.drag.x);
    if (to !== st.lane && st.changing === 0) go(stepDrive(st, c, { kind: 'lane', to }));
  }
  go(stepDrive(st, c, { kind: 'tick', dtMs: FRAME_ROAD_MS }));
  const fresh = nextBeats(st, c, events, new Set(s.said));
  // Допомога (два «сяк-так» поспіль): різке перестроювання коштує вдвічі менше — комфорт падає повільніше.
  const soften = d.bandScale > 1 && events.some((e) => e.kind === 'sharp');
  const drive = soften ? { ...st, comfort: Math.min(COMFORT_MAX, st.comfort + SHARP_COST / 2) } : st;
  return {
    course: c, drive, events,
    said: fresh.length > 0 ? [...s.said, ...fresh.map((b) => b.id)] : s.said,
    line: fresh[fresh.length - 1] ?? s.line,
  };
}

export const DRIVE_LIMIT_FRAMES = 90 * FPS;

export const DRIVE = defineMinigame<DriveMgState, DriveView>({
  id: 'mg.drive',
  titleKey: 'mg.drive.title',
  introKey: 'mg.drive.intro',
  hintKey: 'mg.drive.hint',
  limitFrames: DRIVE_LIMIT_FRAMES,
  outcomes: {
    good: { consequence: arrivalConsequence('good'), resultKey: 'mg.drive.result.good' },
    fine: { consequence: arrivalConsequence('fine'), resultKey: 'mg.drive.result.fine' },
    scrappy: { consequence: arrivalConsequence('scrappy'), resultKey: 'mg.drive.result.scrappy' },
  },
  init: (d: Difficulty, seed: number): DriveMgState => {
    // Допомога каркаса: ширша смуга огляду (видно далі) і довший запас часу до рецепції.
    const help = { extraFuelL: d.bandScale > 1 ? 1.6 : 0, extraSec: d.timeScale > 1 ? 30 : 0, comfortShield: d.hint };
    const course = buildCourse(seed, help);
    return { course, drive: startDrive(course, DEFAULT_WALLET_CENTS, help), said: [], line: null, events: [] };
  },
  step: stepDriveMg,
  done: (s: DriveMgState) => s.drive.phase === 'arrived',
  outcomeOf: (s: DriveMgState): Outcome => driveOutcome(s.drive, s.course),
  view: (s: DriveMgState, d: Difficulty): DriveView => {
    const { drive: v, course: c } = s;
    const look = VIEW_M * d.bandScale;
    return {
      lane: v.lane, laneAt: v.changing > 0 ? v.lane + (v.toLane - v.lane) * (1 - v.changing / 420) : v.lane,
      pace: v.pace, progress: progressOf(v, c), kmDone: kmDone(v), kmLeft: kmLeft(v, c), inTime: willMakeReception(v, c),
      fuel: Math.min(1, v.fuelL / TANK_MAX_L), comfort: v.comfort / COMFORT_MAX, moneyCents: v.moneyCents, finesCents: v.finesCents,
      cameraAhead: v.cameraAhead, stopOffer: v.offer?.kind ?? null, waiting: v.stoppedWhy,
      hazards: c.hazards.filter((h) => h.at - v.metres > -HAZARD_LEN_M[h.kind] - 30 && h.at - v.metres < look)
        .map((h) => ({ id: h.id, kind: h.kind, lane: h.lane, depth: Math.max(0, Math.min(1, (h.at - v.metres) / look)), len: HAZARD_LEN_M[h.kind] / look })),
      beatKey: s.line?.key ?? null, beatSpeaker: s.line?.speaker ?? null,
      freeLane: d.hint ? freeLaneOf(v, c, look * 0.5) : null,
    };
  },
});

/** Підсумок поїздки для сцени приїзду (GAME-310): штраф, пальне, комфорт і значення `f.arrival`. */
export const driveSummary = (s: DriveMgState): ReturnType<typeof driveResult> => driveResult(s.drive, s.course);
/** Скільки часу лишилось до рецепції, у секундах дороги (для сцени й тестів). */
export const driveEta = (s: DriveMgState): number => etaSec(s.drive, s.course);
/** Швидкість цього кадру (м/с дороги) — поверхня малює ним розмиття смуг. */
export const driveSpeed = (s: DriveMgState): number => speedOf(s.drive, s.course);
