// Календар життя (GAME-71, SIMULATION_RULES SIM-LIFE-001…012): дата з ігрового годинника, робота, зарплата й рахунки,
// відпустки, свята, шкільні канікули. Лише цілі числа (дні, центи), жодного RNG і жодного `Date`: та сама хвилина
// годинника завжди дає ту саму дату, а той самий журнал — ті самі гроші.
//
// Ядро команд годинника не бачить: «сьогодні» йому передає симуляція (sim.step → dispatch(…, today)).
// Зарплату нараховує симуляція (`payroll`), коли годинник перетинає день виплати, — не команда гравця.

import type { GameState, RejectCode } from './state';

/** Календар гри — з перевіреного content/calendar.json (валідатор `calendar`). Дати свят і канікул — «MM-DD», щороку. */
export interface CalendarDef {
  /** Дата дня 0 гри, «YYYY-MM-DD» (григоріанський календар, SIM-TIME-008). */
  readonly start: string;
  /** День місяця виплати 1…28 (у кожному місяці існує). */
  readonly payday: number;
  /** Від скількох днів подорож «довга» — для неї профіль зі школярем зважає на канікули (SIM-LIFE-004). */
  readonly longTripDays: number;
  /** Найдовша одна відпустка, днів. */
  readonly maxLeaveDays: number;
  /** На скільки днів наперед можна бронювати. */
  readonly bookAheadDays: number;
  readonly publicHolidays: readonly string[];
  /** Канікули: [from, to] включно; from > to — через Новий рік (12-23 → 01-06). */
  readonly schoolHolidays: readonly { readonly from: string; readonly to: string }[];
}

/** Робота профілю (DC-022): зарплата й рахунки за місяць, центи; днів відпустки на календарний рік. */
export interface JobDef {
  readonly salaryCents: number;
  readonly billsCents: number;
  readonly vacationDays: number;
}

export interface LifeDefs {
  readonly calendar: CalendarDef;
  /** id профілю → робота. Немає — профіль не працює: ні зарплати, ні ліміту відпустки. */
  readonly jobs: Readonly<Record<string, JobDef>>;
  /** Профілі зі школярем у родині (SIM-LIFE-004). */
  readonly schoolProfiles: readonly string[];
}

/** Відпустка (подорож) у стані: перший день, скільки днів і скільки з них — витрачені дні відпустки (робочі). */
export interface LeaveEntry {
  readonly from: number;
  readonly days: number;
  readonly vacation: number;
}

/** Стан календаря життя в GameState: скільки днів виплати вже враховано, заброньовані відпустки (за `from`). */
export interface LifeState {
  readonly paydays: number;
  readonly leave: readonly LeaveEntry[];
}

export const NEW_LIFE: LifeState = { paydays: 0, leave: [] };

// ---------- григоріанський календар у цілих числах ----------

/** Дні від 1970-01-01 (алгоритм days_from_civil, H. Hinnant): лише цілі, без `Date`. */
export function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export interface Ymd { readonly y: number; readonly m: number; readonly d: number }

export function civilFromDays(z0: number): Ymd {
  const z = z0 + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d };
}

export const isLeap = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const daysInMonth = (y: number, m: number): number => (m === 2 ? (isLeap(y) ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31);

const parseStart = (s: string): Ymd => {
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  return { y, m, d };
};
/** «MM-DD» → число MMDD для порівняння в межах року. */
const md = (s: string): number => Number(s.slice(0, 2)) * 100 + Number(s.slice(3, 5));

const startEpoch = (cal: CalendarDef): number => { const s = parseStart(cal.start); return daysFromCivil(s.y, s.m, s.d); };

/** Дата дня гри. */
export const dateOf = (cal: CalendarDef, day: number): Ymd => civilFromDays(startEpoch(cal) + day);
/** День тижня ISO: 1 — понеділок … 7 — неділя. 1970-01-01 — четвер. */
export const weekdayOf = (cal: CalendarDef, day: number): number => (((startEpoch(cal) + day + 3) % 7) + 7) % 7 + 1;

export const isWeekend = (cal: CalendarDef, day: number): boolean => weekdayOf(cal, day) >= 6;
export function isPublicHoliday(cal: CalendarDef, day: number): boolean {
  const { m, d } = dateOf(cal, day);
  return cal.publicHolidays.some((h) => md(h) === m * 100 + d);
}
export function isSchoolHoliday(cal: CalendarDef, day: number): boolean {
  const { m, d } = dateOf(cal, day);
  const x = m * 100 + d;
  return cal.schoolHolidays.some(({ from, to }) => (md(from) <= md(to) ? md(from) <= x && x <= md(to) : x >= md(from) || x <= md(to)));
}
/** Робочий день: будній і не свято. Його й витрачає відпустка. */
export const isWorkday = (cal: CalendarDef, day: number): boolean => !isWeekend(cal, day) && !isPublicHoliday(cal, day);
/** Шкільний день: робочий і не канікули. */
export const isSchoolDay = (cal: CalendarDef, day: number): boolean => isWorkday(cal, day) && !isSchoolHoliday(cal, day);

export type DayKind = 'work' | 'weekend' | 'holiday' | 'leave';
/** Що за день для гравця (для екрана й бота): відпустка, вихідний, свято чи робочий (SIM-LIFE-001). */
export function dayKind(cal: CalendarDef, life: LifeState, day: number): DayKind {
  if (life.leave.some((e) => e.from <= day && day < e.from + e.days)) return 'leave';
  if (isWeekend(cal, day)) return 'weekend';
  return isPublicHoliday(cal, day) ? 'holiday' : 'work';
}

// ---------- зарплата (SIM-LIFE-002) ----------

/**
 * День гри k-ї виплати (k ≥ 0): `payday`-те число кожного місяця, починаючи з першого не раніше дня 0.
 * Рахується з календаря, а не зберігається: у стані — лише лічильник уже врахованих виплат.
 */
export function paydayDay(cal: CalendarDef, k: number): number {
  const s = parseStart(cal.start);
  const first = s.y * 12 + (s.m - 1) + (s.d > cal.payday ? 1 : 0);
  const month = first + k;
  const y = Math.floor(month / 12);
  return daysFromCivil(y, (month % 12) + 1, cal.payday) - startEpoch(cal);
}

/**
 * Нарахувати всі виплати, чий день уже настав (≤ today), — кожну рівно раз: лічильник `paydays` росте разом із нарахуванням.
 * Працює лише для профілю з роботою; до створення персонажа (і без роботи) лічильник іде вперед без грошей —
 * тож зарплата за час до персонажа не приходить заднім числом. Рахунки списуються в той самий день разом із зарплатою
 * (одна сума «на руки»; валідатор: рахунки ≤ зарплати — JOB_BILLS_EXCEED_SALARY), тож баланс від них ніколи не падає.
 */
export function payroll(game: GameState, today: number, life: LifeDefs | undefined): GameState {
  if (!life) return game;
  const job = game.player && Object.hasOwn(life.jobs, game.player.profileId) ? life.jobs[game.player.profileId] : undefined;
  let k = game.life.paydays;
  let money = game.moneyCents;
  while (paydayDay(life.calendar, k) <= today) {
    if (job) money += job.salaryCents - job.billsCents;
    k++;
  }
  if (k === game.life.paydays) return game;
  return { ...game, moneyCents: money, life: { ...game.life, paydays: k } };
}

// ---------- відпустки (SIM-LIFE-003, -004) ----------

export const yearOf = (cal: CalendarDef, day: number): number => dateOf(cal, day).y;

/** Скільки днів відпустки вже заброньовано на календарний рік `year` (за днем початку відпустки). */
export const vacationUsed = (cal: CalendarDef, life: LifeState, year: number): number =>
  life.leave.reduce((n, e) => n + (yearOf(cal, e.from) === year ? e.vacation : 0), 0);

export interface LeaveRequest { readonly from: number; readonly days: number; readonly schoolOverride?: boolean }

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n);

/**
 * Забронювати відпустку-подорож [from, from + days). Відпустка витрачає лише робочі дні (вихідні й свята безкоштовні).
 * Відмови: без календаря — UNKNOWN_TARGET; без персонажа — NO_CHARACTER; дні поза 1…maxLeaveDays — INVALID_AMOUNT;
 * минуле чи далі за bookAheadDays — LEAVE_DATE; перетин з іншою — LEAVE_OVERLAP; довга подорож профілю зі школярем,
 * що зачіпає шкільний день, без явного рішення (`schoolOverride: true`) — SCHOOL_TERM; бракує днів відпустки — VACATION_EXHAUSTED.
 */
export function bookLeave(game: Pick<GameState, 'player' | 'life'>, req: LeaveRequest, life: LifeDefs | undefined, today: number): { code: RejectCode } | { life: LifeState; entry: LeaveEntry } {
  if (!life) return { code: 'UNKNOWN_TARGET' };
  if (!game.player) return { code: 'NO_CHARACTER' };
  const cal = life.calendar;
  if (!isInt(req.from) || !isInt(req.days) || req.days < 1 || req.days > cal.maxLeaveDays || (req.schoolOverride !== undefined && typeof req.schoolOverride !== 'boolean')) return { code: 'INVALID_AMOUNT' };
  if (req.from < today || req.from > today + cal.bookAheadDays) return { code: 'LEAVE_DATE' };
  const end = req.from + req.days;
  if (game.life.leave.some((e) => e.from < end && req.from < e.from + e.days)) return { code: 'LEAVE_OVERLAP' };
  const span = Array.from({ length: req.days }, (_, i) => req.from + i);
  if (life.schoolProfiles.includes(game.player.profileId) && req.days >= cal.longTripDays && req.schoolOverride !== true && span.some((d) => isSchoolDay(cal, d))) return { code: 'SCHOOL_TERM' };
  const job = Object.hasOwn(life.jobs, game.player.profileId) ? life.jobs[game.player.profileId] : undefined;
  const vacation = job ? span.filter((d) => isWorkday(cal, d)).length : 0;
  if (job && vacationUsed(cal, game.life, yearOf(cal, req.from)) + vacation > job.vacationDays) return { code: 'VACATION_EXHAUSTED' };
  const entry: LeaveEntry = { from: req.from, days: req.days, vacation };
  // Минулорічні відпустки, що вже скінчились, на ліміт цього року не впливають — стан не росте без меж.
  const thisYear = yearOf(cal, today);
  const keep = game.life.leave.filter((e) => e.from + e.days > today || yearOf(cal, e.from) >= thisYear);
  return { life: { ...game.life, leave: [...keep, entry].sort((a, b) => a.from - b.from) }, entry };
}

/** Скасувати ще не розпочату відпустку: дні повертаються. Немає такої — LEAVE_NOT_FOUND; уже почалась — LEAVE_STARTED. */
export function cancelLeave(game: Pick<GameState, 'life'>, from: number, life: LifeDefs | undefined, today: number): { code: RejectCode } | { life: LifeState } {
  if (!life) return { code: 'UNKNOWN_TARGET' };
  const e = game.life.leave.find((x) => x.from === from);
  if (!e) return { code: 'LEAVE_NOT_FOUND' };
  if (e.from <= today) return { code: 'LEAVE_STARTED' };
  return { life: { ...game.life, leave: game.life.leave.filter((x) => x !== e) } };
}
