// Річний бот календаря життя (GAME-71, SIM-LIFE-005): не повний перебір, а детермінована симуляція кількох ігрових років
// для одного профілю простою політикою «як людина у відпустці». Ходить справжньою симуляцією (sim.step): годинник,
// зарплата й відмови ядра — ті самі, що в грі. Вимога власника: «кілька разів на рік на кілька тижнів» → ≥ 2 подорожі
// по ≥ 7 днів на кожен ігровий рік.
//
// Політика (свідомо проста й без RNG):
// * щодня, якщо цього календарного року подорожей < 2 і минуло ≥ GAP_DAYS від кінця попередньої, — спроба почати
//   подорож сьогодні тривалістю 16, інакше 9, інакше 7 днів (BookLeave, без schoolOverride — школяр їде лише в канікули);
// * перша прийнята — заброньовано; інакше — завтра.
import type { CoreDefs } from '../core/defs';
import { DAY_MINUTES, dayOf } from '../core/weather';
import { yearOf } from '../core/life';
import { newSim, step, type SimState } from '../core/sim';

export const TRIP_LENGTHS = [16, 9, 7] as const;
/** Скільки днів бот чекає між подорожами — щоб подорожі не злипались в одну (тимч.). */
export const GAP_DAYS = 28;

export interface Trip { readonly from: number; readonly days: number; readonly year: number; readonly vacation: number }

export interface YearReport {
  readonly profile: string;
  readonly trips: readonly Trip[];
  /** Рік → кількість подорожей ≥ 7 днів, що почались цього року. */
  readonly longTripsByYear: Readonly<Record<number, number>>;
  /** Рік → відмови за кодом (для звіту: SCHOOL_TERM, VACATION_EXHAUSTED…). */
  readonly refusals: Readonly<Record<string, number>>;
  readonly moneyCents: number;
  readonly sim: SimState;
}

export function runYearBot(defs: CoreDefs, profile: string, transport: string, days: number, seed = 20261023): YearReport {
  const life = defs.life;
  if (!life) throw new Error('runYearBot: defs.life is missing');
  let s = newSim(seed);
  let n = 0;
  const cmd = (command: Record<string, unknown>): { ok: boolean; code?: string } => {
    const commandId = `y${n++}`;
    s = step(s, { kind: 'command', command: { ...command, commandId } as never }, { defs });
    const rec = s.game.processed[commandId];
    return { ok: rec?.ok === true, ...(rec?.code ? { code: rec.code } : {}) };
  };
  const created = cmd({ type: 'CreateCharacter', profileId: profile, transportId: transport });
  if (!created.ok) throw new Error(`runYearBot: CreateCharacter ${profile} × ${transport} → ${created.code ?? '?'}`);
  const trips: Trip[] = [];
  const refusals: Record<string, number> = {};
  let nextAllowed = 0;
  for (let today = 0; today < days; today++) {
    if (dayOf(s.clock) !== today) s = step(s, { kind: 'advance', minutes: today * DAY_MINUTES - s.clock.minutes }, { defs });
    const year = yearOf(life.calendar, today);
    if (today < nextAllowed || trips.filter((t) => t.year === year).length >= 2) continue;
    for (const len of TRIP_LENGTHS) {
      const r = cmd({ type: 'BookLeave', from: today, days: len });
      if (r.ok) {
        const e = s.game.life.leave.find((x) => x.from === today);
        trips.push({ from: today, days: len, year, vacation: e?.vacation ?? -1 });
        nextAllowed = today + len + GAP_DAYS;
        break;
      }
      if (r.code) refusals[r.code] = (refusals[r.code] ?? 0) + 1;
    }
  }
  const longTripsByYear: Record<number, number> = {};
  for (let d = 0; d < days; d = d + 1) longTripsByYear[yearOf(life.calendar, d)] ??= 0;
  for (const t of trips) if (t.days >= 7) longTripsByYear[t.year] = (longTripsByYear[t.year] ?? 0) + 1;
  return { profile, trips, longTripsByYear, refusals, moneyCents: s.game.moneyCents, sim: s };
}
