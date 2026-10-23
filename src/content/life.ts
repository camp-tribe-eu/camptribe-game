// Календар життя для ядра (GAME-71): content/calendar.json + робота й школярі з content/profiles.json → LifeDefs.
// Форму й дати перевіряє валідатор (`calendar`: CALENDAR_BAD_DATE, CALENDAR_RANGE_OVERLAP, CALENDAR_MISSING,
// JOB_BILLS_EXCEED_SALARY); тут — лише переклад у форму ядра. Сюжету (StoryDefs, STORY_REV) це не торкається.
import type { CalendarDef, JobDef, LifeDefs } from '../core/life';
import calendar from '../../content/calendar.json';
import profiles from '../../content/profiles.json';

export interface RawProfileLife { id: string; job?: JobDef; childInSchool?: boolean }

export function compileLife(cal: CalendarDef, raw: readonly RawProfileLife[]): LifeDefs {
  return {
    calendar: cal,
    jobs: Object.fromEntries(raw.filter((p) => p.job).map((p) => [p.id, { salaryCents: p.job?.salaryCents ?? 0, billsCents: p.job?.billsCents ?? 0, vacationDays: p.job?.vacationDays ?? 0 }])),
    schoolProfiles: raw.filter((p) => p.childInSchool === true).map((p) => p.id),
  };
}

export const RAW_CALENDAR: CalendarDef = calendar;
export const RAW_PROFILE_LIFE: readonly RawProfileLife[] = profiles as RawProfileLife[];
export const LIFE: LifeDefs = compileLife(RAW_CALENDAR, RAW_PROFILE_LIFE);
