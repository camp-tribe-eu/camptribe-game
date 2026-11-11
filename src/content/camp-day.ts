// GAME-311 · день у таборі: сім рутин, ролі родини й час, якого не вистачає на все.
// Джерело дизайну — docs/EPISODE-DESIGN.md §6 і §8, docs/DAY-DESIGN.md §2 (дефіцит) і §3 (ролі).
//
// Три речі, які тримають цю частину дня:
//  1. ЧАС СКІНЧЕННИЙ. Навіть найдешевші варіанти всіх семи рутин не влазять у день (CHEAPEST_ALL > DAY_MINUTES) —
//     отже, гравець мусить обирати, що лишити. Це доводить camp-day.test мутацією «нескінченний день».
//  2. РОЛІ. Кожна рутина — чия саме: її робить той член родини, кого вона стосується; решта лишається в таборі
//     при своєму ділі (idleJobOf). Двічі за раунд одну людину не пошлеш.
//  3. ЦІНА ПОРОЖНЬОГО ТАБОРУ. Відправив усіх трьох — табір нікому стерегти, і це окремий слід у ночі.
//
// Жодного годинника й Math.random: усе — чисті функції над планом дня.

import type { Outcome } from './minigame';

export const MEMBERS = ['george', 'victoria', 'matthew'] as const;
export type Member = (typeof MEMBERS)[number];

export const ROUTINE_IDS = ['water', 'firewood', 'fire', 'lanterns', 'fish', 'berries', 'tidy'] as const;
export type RoutineId = (typeof ROUTINE_IDS)[number];

/** Раунди дня (docs/DAY-DESIGN.md §7). Вечір — окремо: «порядок у таборі» грається перед сном. */
export const ROUNDS = ['morning', 'noon', 'afternoon', 'evening'] as const;
export type Round = (typeof ROUNDS)[number];

export interface RoutineDef {
  readonly id: RoutineId;
  /** Хто цим займається (ролі: тато — дрова й риба, мама — вогонь і ягоди, син — вода й ліхтарі). */
  readonly owner: Member;
  /** Чи виконавець при цьому ЙДЕ З ТАБОРУ. */
  readonly away: boolean;
  /** Ігрові хвилини: дешевший і дорожчий варіант (у кого варіанта немає — однакові). */
  readonly minutes: readonly [cheap: number, full: number];
  /** Скільки це триває в живого гравця, секунд (вимір часу частини дня). */
  readonly seconds: number;
}

export const ROUTINES: Readonly<Record<RoutineId, RoutineDef>> = {
  water: { id: 'water', owner: 'matthew', away: true, minutes: [45, 45], seconds: 75 },
  firewood: { id: 'firewood', owner: 'george', away: true, minutes: [50, 90], seconds: 110 },
  fire: { id: 'fire', owner: 'victoria', away: false, minutes: [45, 45], seconds: 90 },
  lanterns: { id: 'lanterns', owner: 'matthew', away: false, minutes: [30, 40], seconds: 65 },
  fish: { id: 'fish', owner: 'george', away: true, minutes: [80, 80], seconds: 100 },
  berries: { id: 'berries', owner: 'victoria', away: true, minutes: [60, 60], seconds: 85 },
  tidy: { id: 'tidy', owner: 'victoria', away: false, minutes: [40, 40], seconds: 80 },
};

/** Скільки ігрових хвилин має частина дня в таборі. */
export const DAY_MINUTES = 300;
/** Найдешевший спосіб зробити геть усе. Більший за день — тому вибір справжній (сторож у camp-day.test). */
export const CHEAPEST_ALL = ROUTINE_IDS.reduce((a, id) => a + ROUTINES[id].minutes[0], 0);

/** Чим зайнятий у таборі той, кого нікуди не послали. Видно здалеку, що табір живе (EPISODE-DESIGN §8). */
export const IDLE_JOB: Readonly<Record<Member, 'dry-things' | 'watch-tent' | 'mind-cat'>> = {
  george: 'watch-tent',
  victoria: 'dry-things',
  matthew: 'mind-cat',
};
export const idleJobOf = (m: Member): string => IDLE_JOB[m];

export interface Pick { readonly id: RoutineId; readonly round: Round; readonly full: boolean }
export interface CampDay {
  readonly picks: readonly Pick[];
  readonly results: Readonly<Partial<Record<RoutineId, Outcome>>>;
}
export const startCampDay = (): CampDay => ({ picks: [], results: {} });

export const minutesOf = (p: Pick): number => ROUTINES[p.id].minutes[p.full ? 1 : 0];
export const minutesUsed = (d: CampDay): number => d.picks.reduce((a, p) => a + minutesOf(p), 0);
export const minutesLeft = (d: CampDay): number => DAY_MINUTES - minutesUsed(d);
export const planned = (d: CampDay, id: RoutineId): Pick | undefined => d.picks.find((p) => p.id === id);
export const inRound = (d: CampDay, r: Round): readonly Pick[] => d.picks.filter((p) => p.round === r);

export type AddFail = 'done' | 'busy' | 'noTime' | 'full' | 'when';
/** Чому цю рутину зараз не взяти (або null — можна). Вечірній раунд тримає лише «порядок», і лише вечірній. */
export function whyNot(d: CampDay, id: RoutineId, round: Round, full = false): AddFail | null {
  if (planned(d, id)) return 'done';
  if ((round === 'evening') !== (id === 'tidy')) return 'when';
  const def = ROUTINES[id];
  const here = inRound(d, round);
  if (here.length >= MEMBERS.length) return 'full';
  if (here.some((p) => ROUTINES[p.id].owner === def.owner)) return 'busy';
  if (minutesUsed(d) + def.minutes[full ? 1 : 0] > DAY_MINUTES) return 'noTime';
  return null;
}
export const canAdd = (d: CampDay, id: RoutineId, round: Round, full = false): boolean => whyNot(d, id, round, full) === null;

export function addPick(d: CampDay, id: RoutineId, round: Round, full = false): CampDay {
  return canAdd(d, id, round, full) ? { ...d, picks: [...d.picks, { id, round, full }] } : d;
}
/** Рутину зіграно: результат міні-гри лягає в день. Записати результат того, чого не планували, не можна. */
export function recordResult(d: CampDay, id: RoutineId, outcome: Outcome): CampDay {
  return planned(d, id) ? { ...d, results: { ...d.results, [id]: outcome } } : d;
}
export const isDone = (d: CampDay, id: RoutineId): boolean => d.results[id] !== undefined;
export const skipped = (d: CampDay): readonly RoutineId[] => ROUTINE_IDS.filter((id) => !isDone(d, id));

/** Хто з родини пішов із табору в цьому раунді. */
export const awayIn = (d: CampDay, r: Round): readonly Member[] => inRound(d, r).filter((p) => ROUTINES[p.id].away).map((p) => ROUTINES[p.id].owner);
/** Раунди, у яких табір лишився без нікого: всі троє пішли. Ціна — слід у ночі (camp-night). */
export const emptyRounds = (d: CampDay): readonly Round[] => ROUNDS.filter((r) => new Set(awayIn(d, r)).size >= MEMBERS.length);
/** Хто лишився в таборі в цьому раунді й чим зайнятий. */
export const campBusy = (d: CampDay, r: Round): readonly { member: Member; job: string }[] => {
  const away = new Set(awayIn(d, r));
  return MEMBERS.filter((m) => !away.has(m)).map((m) => ({ member: m, job: idleJobOf(m) }));
};

// ─── вимір часу частини дня (жива людина, секунди) ───────────────────────────────────────────────
/** Перехід між справами (дійти, роздивитися). */
export const WALK_S = 15;
/** Рішення на дошці рутин у кожному раунді, де щось узяли. */
export const DECIDE_S = 20;
/** Вечеря, ніч і підсумок після рутин. */
export const EVENING_S = 45;
export function campSeconds(ids: readonly RoutineId[], rounds = 3): number {
  return ids.reduce((a, id) => a + ROUTINES[id].seconds, 0) + ids.length * WALK_S + rounds * DECIDE_S + EVENING_S;
}
export const campMinutes = (ids: readonly RoutineId[], rounds = 3): number => Math.round((campSeconds(ids, rounds) / 60) * 10) / 10;
