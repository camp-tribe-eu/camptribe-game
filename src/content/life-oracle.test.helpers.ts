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

export interface PayCase { readonly profile: string; readonly transport: string; readonly preMinutes: number; readonly inputs: readonly Input[] }

/**
 * Прогнати випадок і повернути ПЕРШЕ порушення (рядок) або null. Кожен крок: приріст грошей = (зарплата − рахунки) ×
 * кількість днів виплати, які годинник ПЕРЕТНУВ цим кроком, — і нічого не платиться до створення персонажа.
 * Тож і подвійна виплата того самого дня, і виплата не того дня, і зарплата «заднім числом» — червоне.
 */
export function payrollViolation(defs: CoreDefs, c: PayCase, stepper: Stepper): string | null {
  const life = defs.life;
  if (!life) return 'defs.life missing';
  const job = Object.hasOwn(life.jobs, c.profile) ? life.jobs[c.profile] : undefined;
  const net = job ? job.salaryCents - job.billsCents : 0;
  let s = stepper(newSim(7), { kind: 'advance', minutes: c.preMinutes });
  if (s.game.moneyCents !== 0) return `paid ${s.game.moneyCents} before the character exists`;
  s = stepper(s, { kind: 'command', command: { type: 'CreateCharacter', commandId: 'p0', profileId: c.profile, transportId: c.transport } });
  if (!s.game.processed.p0?.ok) return `CreateCharacter refused: ${s.game.processed.p0?.code ?? '?'}`;
  for (const [i, input] of c.inputs.entries()) {
    const before = s;
    s = stepper(s, input);
    const want = net * paydaysBetween(life.calendar.start, life.calendar.payday, dayOf(before.clock), dayOf(s.clock));
    const got = s.game.moneyCents - before.game.moneyCents;
    if (got !== want) return `step ${i} ${JSON.stringify(input)}: day ${dayOf(before.clock)}→${dayOf(s.clock)}, money +${got}, expected +${want}`;
  }
  return null;
}

/** Входи: кадри й дрібні перемотування (багато кроків в один день), великі перемотування (через місяці), відпустки. */
export const inputArb = (maxDay = 4000): fc.Arbitrary<Input> => fc.oneof(
  fc.integer({ min: 1, max: 250 }).map((realMs): Input => ({ kind: 'frame', realMs })),
  fc.integer({ min: 0, max: 180 }).map((minutes): Input => ({ kind: 'advance', minutes })),
  fc.integer({ min: 0, max: 60 * DAY_MINUTES }).map((minutes): Input => ({ kind: 'advance', minutes })),
  fc.record({ from: fc.integer({ min: 0, max: maxDay }), days: fc.integer({ min: 1, max: 20 }), n: fc.nat() })
    .map(({ from, days, n }): Input => ({ kind: 'command', command: { type: 'BookLeave', commandId: `l${n}`, from, days } })),
);

export const payCaseArb = (profiles: readonly { profile: string; transport: string }[]): fc.Arbitrary<PayCase> =>
  fc.record({
    who: fc.constantFrom(...profiles),
    preMinutes: fc.integer({ min: 0, max: 800 * DAY_MINUTES }),
    inputs: fc.array(inputArb(), { minLength: 1, maxLength: 25 }),
  }).map(({ who, preMinutes, inputs }) => ({ profile: who.profile, transport: who.transport, preMinutes, inputs }));
