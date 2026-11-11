// GAME-309 · «гравець» для тестів дороги: проганяє поїздку кадр за кадром за простою стратегією.
// Жодного реального часу — лише кроки по 16 мс, як кадри. Тут немає жодного правила гри: усі рішення
// приймає `stepDrive`, цей файл лише натискає кнопки.
import {
  HAZARD_LEN_M, LANES, VIEW_M, driveResult, startDrive, stepDrive, type Course, type DriveEvent, type DriveResult, type DriveState, type Lane, type Pace,
} from './drive';

export const FRAME_MS = 16;
export const START_MONEY = 50_000;

export interface Policy {
  /** Яку швидкість тримати цього кадру. */
  readonly pace: (s: DriveState, c: Course) => Pace;
  /** Чи об'їжджати перешкоди (false — їдемо як є й гальмуємо за ними). */
  readonly dodge?: boolean;
  /** Чи з'їжджати на кожну пропозицію (заправка / перепочинок). */
  readonly stop?: (s: DriveState, c: Course) => boolean;
  /** Смуга, яку тримати всупереч перешкодам (для перевірок «різко підряд»). */
  readonly lane?: (s: DriveState, c: Course) => Lane | null;
}

/** Чи є перешкода в цій смузі ближче ніж за `look` метрів. */
function busy(c: Course, lane: Lane, metres: number, look: number): boolean {
  return c.hazards.some((h) => h.lane === lane && h.at + HAZARD_LEN_M[h.kind] >= metres - 4 && h.at - metres <= look);
}

/** Куди перестроїтись, щоб не впертись: null — у своїй смузі чисто або вільної немає. */
export function dodgeTo(s: DriveState, c: Course, look = VIEW_M * 0.6): Lane | null {
  if (!busy(c, s.lane, s.metres, look)) return null;
  const free = LANES.filter((l) => l !== s.lane && !busy(c, l, s.metres, look));
  if (free.length === 0) return null;
  return free.reduce((a, b) => (Math.abs(a - s.lane) <= Math.abs(b - s.lane) ? a : b));
}

export interface Run { readonly state: DriveState; readonly result: DriveResult; readonly events: readonly DriveEvent[]; readonly frames: number }

/** Проїхати поїздку до кінця. Кидає, якщо за `maxFrames` кадрів гра не дійшла до приїзду — глухий кут мусить бути видно. */
export function play(c: Course, p: Policy, money = START_MONEY, maxFrames = 120_000): Run {
  let s = startDrive(c, money);
  const events: DriveEvent[] = [];
  let frames = 0;
  const push = (r: { state: DriveState; events: readonly DriveEvent[] }): void => { s = r.state; events.push(...r.events); };
  while (s.phase !== 'arrived') {
    if (++frames > maxFrames) throw new Error(`drive did not finish in ${maxFrames} frames: ${s.phase} ${Math.round(s.metres)} m`);
    const want = p.pace(s, c);
    if (want !== s.pace) push(stepDrive(s, c, { kind: 'pace', pace: want }));
    const hold = p.lane?.(s, c) ?? null;
    const to = hold !== null ? hold : p.dodge === false ? null : dodgeTo(s, c);
    if (to !== null && to !== s.lane && s.changing === 0) push(stepDrive(s, c, { kind: 'lane', to }));
    if (s.offer !== null && p.stop?.(s, c) === true) push(stepDrive(s, c, { kind: 'stop' }));
    push(stepDrive(s, c, { kind: 'tick', dtMs: FRAME_MS }));
  }
  return { state: s, result: driveResult(s, c), events, frames };
}

/** Стратегії, якими тести доводять досяжність кожного з трьох результатів. */
export const STEADY: Policy = { pace: () => 'steady' };
export const BRISK: Policy = { pace: () => 'brisk' };
/** Ніколи не об'їжджає: тягнеться за кожною перешкодою — так доводиться, що «сяк-так» не блокує приїзд. */
export const STUBBORN: Policy = { pace: () => 'steady', dodge: false };
/** Найгірший із можливих, і все одно доїжджає: ні об'їздів, ні поспіху, і з'їжджає на КОЖНУ пропозицію. */
export const SCRAPPY: Policy = { pace: () => 'steady', dodge: false, stop: () => true };
/** Смикається між крайніми смугами без упину: так доводиться, що родину справді заколисує. */
export const SHAKY: Policy = { pace: () => 'steady', lane: (s) => (s.lane === 0 ? 2 : 0) };
/**
 * Той, хто грає добре: жваво там, де вільно; спокійно перед камерою і біля велосипедиста (обгін упритул
 * коштує комфорту); на заправку — лише коли пального справді обмаль.
 */
export const CALM_FAST: Policy = {
  pace: (s, c) => (s.cameraAhead || nearCyclist(s, c) || s.fuelL < 0.5 ? 'steady' : 'brisk'),
  stop: (s) => s.offer?.kind === 'fuel' && s.fuelL < 0.6,
};
/** Жваво й байдуже: штрафи, обгони впритул, сухий бак — усе своєю чергою. */
export const SMART: Policy = {
  pace: (s) => (s.cameraAhead || s.fuelL < 0.9 ? 'steady' : 'brisk'),
  stop: (s) => s.offer?.kind === 'fuel' && s.fuelL < 2.2,
};

/** Чи велосипедист зовсім поруч (ліворуч, праворуч або попереду в тій самій смузі). */
export function nearCyclist(s: DriveState, c: Course): boolean {
  return c.hazards.some((h) => h.kind === 'cyclist' && Math.abs(h.lane - s.lane) <= 1 && h.at - s.metres > -40 && h.at - s.metres < 200);
}
