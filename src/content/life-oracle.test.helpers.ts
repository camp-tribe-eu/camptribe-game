// Спільний перевірник зарплати (GAME-71, SIM-LIFE-002) для тестів ядра й контенту. Не тест — фікстура.
// Живе поза src/core навмисно: оракул читає `Date`, а ядру реальний календар заборонено (TD-001).
// Оракул незалежний від коду зарплати: дата дня — з `Date` (UTC), «виплата» — день, чиє число місяця = payday.
// Лічильника `paydays`, `paydayDay` і `payroll` оракул не читає.
import fc from 'fast-check';
import type { CoreDefs } from '../core/defs';
import { newSim, type Input, type SimState } from '../core/sim';
import { DAY_MINUTES, dayOf } from '../core/weather';

/** Дата дня гри через `Date` — інший шлях, ніж цілочисельний календар ядра. */
export function utcDate(start: string, day: number): Date {
  return new Date(Date.parse(`${start}T00:00:00Z`) + day * 86_400_000);
}

/** Скільки днів виплати в (fromDay, toDay]: оракул. */
export function paydaysBetween(start: string, payday: number, fromDay: number, toDay: number): number {
  let n = 0;
  for (let d = fromDay + 1; d <= toDay; d++) if (utcDate(start, d).getUTCDate() === payday) n++;
  return n;
}

export type Stepper = (s: SimState, i: Input) => SimState;

/**
 * Вхід оракула: звичайний вхід симуляції або «переддень виплати» — перемотати до `before` хв перед північчю, з якої
 * починається найближчий (за `Date`) день виплати. Оракул сам перекладає його у звичайне `advance` від поточного стану:
 * лише так наступний кадр чи дорога справді перетинають північ дня виплати (кадри по 1…250 мс — ні, рецензія GAME-71).
 */
export type OracleInput = Input | { readonly kind: 'eve'; readonly before: number };

export interface PayCase { readonly profile: string; readonly transport: string; readonly preMinutes: number; readonly inputs: readonly OracleInput[] }

/** Скільки кроків кожного виду справді перетнули день виплати (з виплатою > 0) — доказ, що шлях покрито, а не «зелено порожньо». */
export interface PayCoverage { frame: number; command: number; advance: number }

/** Хвилина за `before` хв до півночі найближчого дня виплати після нинішньої хвилини (оракул: `Date`). */
function eveMinute(start: string, payday: number, minutes: number, before: number): number {
  for (let d = Math.floor(minutes / DAY_MINUTES) + 1; ; d++) {
    if (utcDate(start, d).getUTCDate() === payday && d * DAY_MINUTES - before >= minutes) return d * DAY_MINUTES - before;
  }
}

/**
 * Прогнати випадок і повернути ПЕРШЕ порушення (рядок) або null. Кожен крок: приріст грошей = (зарплата − рахунки) ×
 * кількість днів виплати, які годинник ПЕРЕТНУВ цим кроком; до персонажа (перемотування на старті) — нуль.
 * Червоне: подвійна виплата того самого дня, виплата не того дня, пропущений шлях годинника (кадр через північ, дорога
 * через північ) і зарплата до створення персонажа. НЕ покриває стан, що прийшов не з кроку (старий сейв, міграція), —
 * це окремі тести в src/core/life.test.ts і save.test.ts.
 */
export function payrollViolation(defs: CoreDefs, c: PayCase, stepper: Stepper, seen?: PayCoverage): string | null {
  const life = defs.life;
  if (!life) return 'defs.life missing';
  const { start, payday } = life.calendar;
  const job = Object.hasOwn(life.jobs, c.profile) ? life.jobs[c.profile] : undefined;
  const net = job ? job.salaryCents - job.billsCents : 0;
  let s = stepper(newSim(7), { kind: 'advance', minutes: c.preMinutes });
  if (s.game.moneyCents !== 0) return `paid ${s.game.moneyCents} before the character exists`;
  s = stepper(s, { kind: 'command', command: { type: 'CreateCharacter', commandId: 'p0', profileId: c.profile, transportId: c.transport } });
  if (!s.game.processed.p0?.ok) return `CreateCharacter refused: ${s.game.processed.p0?.code ?? '?'}`;
  for (const [i, raw] of c.inputs.entries()) {
    const input: Input = raw.kind === 'eve' ? { kind: 'advance', minutes: eveMinute(start, payday, s.clock.minutes, raw.before) - s.clock.minutes } : raw;
    const before = s;
    s = stepper(s, input);
    const want = net * paydaysBetween(start, payday, dayOf(before.clock), dayOf(s.clock));
    const got = s.game.moneyCents - before.game.moneyCents;
    if (got !== want) return `step ${i} ${JSON.stringify(input)}: day ${dayOf(before.clock)}→${dayOf(s.clock)}, money +${got}, expected +${want}`;
    if (seen && want > 0) seen[input.kind as keyof PayCoverage]++;
  }
  return null;
}

/**
 * Входи: кадри — дрібні (1…250 мс, багато кроків в один день) і великі (до 2 ігрових годин: північ перетинає САМ кадр),
 * перемотування (дрібні й через місяці), «переддень виплати» (1…60 хв до півночі), відпустки й поїздки (`visit` —
 * локації з дорогами: дорога перемотує годинник усередині команди).
 */
export const inputArb = (visit: readonly string[] = [], maxDay = 4000): fc.Arbitrary<OracleInput> => fc.oneof(
  fc.integer({ min: 1, max: 250 }).map((realMs): OracleInput => ({ kind: 'frame', realMs })),
  fc.integer({ min: 1_000, max: 120 * 1_000 }).map((realMs): OracleInput => ({ kind: 'frame', realMs })),
  fc.integer({ min: 0, max: 180 }).map((minutes): OracleInput => ({ kind: 'advance', minutes })),
  fc.integer({ min: 0, max: 60 * DAY_MINUTES }).map((minutes): OracleInput => ({ kind: 'advance', minutes })),
  fc.integer({ min: 1, max: 60 }).map((before): OracleInput => ({ kind: 'eve', before })),
  fc.record({ from: fc.integer({ min: 0, max: maxDay }), days: fc.integer({ min: 1, max: 20 }), n: fc.nat() })
    .map(({ from, days, n }): OracleInput => ({ kind: 'command', command: { type: 'BookLeave', commandId: `l${n}`, from, days } })),
  ...(visit.length ? [fc.record({ to: fc.constantFrom(...visit), n: fc.nat() })
    .map(({ to, n }): OracleInput => ({ kind: 'command', command: { type: 'Visit', commandId: `v${n}`, locationId: to } }))] : []),
);

/** Другий вхід пари: кадр до 2 ігрових годин або поїздка (без поїздок — лише кадр). */
const crossArb = (visit: readonly string[]): fc.Arbitrary<OracleInput> => fc.oneof(
  fc.integer({ min: 1_000, max: 120 * 1_000 }).map((realMs): OracleInput => ({ kind: 'frame', realMs })),
  ...(visit.length ? [fc.record({ to: fc.constantFrom(...visit), n: fc.nat() })
    .map(({ to, n }): OracleInput => ({ kind: 'command', command: { type: 'Visit', commandId: `w${n}`, locationId: to } }))] : []),
);

export const payCaseArb = (profiles: readonly { profile: string; transport: string }[], visit: readonly string[] = []): fc.Arbitrary<PayCase> =>
  fc.record({
    who: fc.constantFrom(...profiles),
    preMinutes: fc.integer({ min: 0, max: 800 * DAY_MINUTES }),
    // Окремо — пари «переддень виплати, а тоді кадр чи поїздка»: інакше північ дня виплати кадр і дорога перетинали б
    // лише випадково (у ядрі — ~10 разів на 1 000 випадків, рецензія GAME-71).
    inputs: fc.array(fc.oneof(
      inputArb(visit).map((i) => [i]),
      fc.tuple(fc.integer({ min: 1, max: 60 }), crossArb(visit)).map(([before, i]): OracleInput[] => [{ kind: 'eve', before }, i]),
    ), { minLength: 1, maxLength: 20 }).map((xs) => xs.flat()),
  }).map(({ who, preMinutes, inputs }) => ({ profile: who.profile, transport: who.transport, preMinutes, inputs }));
