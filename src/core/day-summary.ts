// Підсумок дня (GAME-106): ЛИШЕ факти з журналу й стану — жодного «могло б статись». Секція з'являється, коли під неї є
// факт; порожніх секцій немає. Чиста функція: той самий стан → той самий підсумок (детерміновано, без годинника браузера).
//
// Що таке «день» тут. Ігровий годинник (dayOf) — не день історії: вільна прогулянка мапою (1 с = 1 хв) може перегорнути
// добу посеред Прологу. День історії закінчується завершенням квесту-межі дня (GAME-141): квест із `dayEnd: true` — межа дня,
// розділ триває; квест із `end: true` — кінець розділу, і він теж закриває день (останній день розділу не лишається відкритим).
// Розділ 1 зараз: день 1 — до ST-005 (`dayEnd`), день 2 — до CH1-D2-FIRE-001 (`end` + `dayEnd`; день 3 — GAME-144). День N —
// записи журналу після межі дня N−1 до межі дня N включно; день, межі якого ще не було, — відкритий (ended: false) і тягнеться
// до останнього запису. Сейв до GAME-141, де ST-005 мав `end`, рахує ті самі межі: ST-005 у журналі — межа дня 1 і тепер.
//
// Прапорці (`f.night-*`, `f.pack-*`) часу не мають — це стан «зараз». Тому секції з них (ночівля, пакування) належать лише
// ОСТАННЬОМУ ЗАВЕРШЕНОМУ дню (а поки жоден не завершився — відкритому дню 1): для раніших днів їх не довести, а відкритий день
// після межі ще не мав своєї ночі — підсумок їх там не показує. Ночівля (`f.night-*`) — у чому родина ночує на ЦЬОМУ кемпінгу
// (ставиться раз на ST-005 і лишається до кінця перебування), тож підсумок дня 2 на тому ж кемпінгу показує її як нинішню
// (GAME-141). Коли з'явиться інша ночівля (новий кемпінг, день 3 — GAME-144), прапорець мусить отримати день чи місце. Спаковане
// (`f.pack-*`) — лише в день, коли пакували: день 1 (CreateCharacter складає багаж за замовчуванням, GAME-109) або день, у журналі
// якого є PackItem/UnpackItem/AutoPack. Інакше підсумок дня 2 повторив би пакування дня 1.
import type { CoreDefs } from './defs';
import { packedOf } from './packing';
import type { JournalEntry, SimState } from './sim';

/** Порядок секцій на екрані. */
export const SUMMARY_KINDS = ['night', 'packed', 'events', 'quests', 'bought', 'got', 'sold'] as const;
export type SummaryKind = (typeof SUMMARY_KINDS)[number];

export interface DaySummary {
  /** День історії з 1. */
  readonly day: number;
  /** Межу дня пройдено (квест-межу завершено). */
  readonly ended: boolean;
  /** Лише непорожні секції, у порядку SUMMARY_KINDS. `ids` — id прапорців, предметів, подій чи квестів; без повторів. */
  readonly sections: readonly { readonly kind: SummaryKind; readonly ids: readonly string[] }[];
  /** Баланс на початку й у кінці дня (центи); null — у журналі цього факту немає (обрізаний журнал, сейв до GAME-106). */
  readonly money: { readonly start: number; readonly end: number } | null;
}

/** Прапорець ночівлі: `f.night-tent` — ніч у наметі. */
export const NIGHT_PREFIX = 'f.night-';

/** Квести-межі дня (GAME-141): `dayEnd: true` (межа дня) і `end: true` (кінець розділу закриває й день). */
export const dayEndQuests = (defs: CoreDefs): ReadonlySet<string> =>
  new Set(Object.entries(defs.story?.quests ?? {}).filter(([, q]) => q.dayEnd === true || q.end).map(([id]) => id));

const isDayEnd = (e: JournalEntry, ends: ReadonlySet<string>): boolean => e.type === 'CompleteQuest' && e.ref !== null && ends.has(e.ref);

/** Межі днів у журналі: [від, до] індексів записів включно; останній день може бути відкритим. */
export function dayRanges(journal: readonly JournalEntry[], ends: ReadonlySet<string>): { from: number; to: number; ended: boolean }[] {
  const out: { from: number; to: number; ended: boolean }[] = [];
  let from = 0;
  journal.forEach((e, i) => {
    if (isDayEnd(e, ends)) { out.push({ from, to: i, ended: true }); from = i + 1; }
  });
  if (from < journal.length) out.push({ from, to: journal.length - 1, ended: false });
  return out;
}

/** Скільки днів уже завершено (межу пройдено). */
export const daysEnded = (sim: Pick<SimState, 'journal'>, defs: CoreDefs): number =>
  dayRanges(sim.journal, dayEndQuests(defs)).filter((r) => r.ended).length;

const uniq = (xs: readonly string[]): string[] => [...new Set(xs)];

/**
 * Підсумок дня `day` (з 1). null — такого дня в журналі немає. Журнал обрізається з голови (JOURNAL_LIMIT): якщо перший
 * запис — уже не CreateCharacter, номери днів від нього не відлічити, і підсумку немає (чесне «не знаю», а не вигадка).
 * Ночівля й спаковане читаються з НИНІШНІХ прапорців (у прапорців немає часу), тож секції останнього дня правдиві лише
 * одразу на межі дня — саме там Shell і будує підсумок; пізніше перебудований підсумок може з тим днем розійтися.
 */
export function daySummary(sim: Pick<SimState, 'game' | 'journal'>, day: number, defs: CoreDefs): DaySummary | null {
  if (!Number.isSafeInteger(day) || day < 1) return null;
  if (sim.journal[0]?.type !== 'CreateCharacter') return null;
  const ranges = dayRanges(sim.journal, dayEndQuests(defs));
  const r = ranges[day - 1];
  if (!r) return null;
  const entries = sim.journal.slice(r.from, r.to + 1);
  const refs = (type: JournalEntry['type']): string[] => uniq(entries.filter((e) => e.type === type && e.ref !== null).map((e) => e.ref as string));

  const ended = ranges.filter((x) => x.ended).length;
  const latest = ended > 0 ? day === ended : day === 1;
  const p = sim.game.player;
  const night = latest ? sim.game.flags.filter((f) => f.startsWith(NIGHT_PREFIX)) : [];
  const packedToday = r.from === 0 || entries.some((e) => e.type === 'PackItem' || e.type === 'UnpackItem' || e.type === 'AutoPack');
  const packed = latest && packedToday && p && defs.packing ? packedOf(sim.game.flags, defs.packing, p) : [];
  // Нагорода предметами — факт лише тоді, коли квест завершено САМЕ цього дня й нагороду справді видано (grantId у стані).
  const quests = refs('CompleteQuest');
  const rewards = quests.flatMap((q) => {
    const rw = defs.story?.quests[q]?.reward;
    return rw && sim.game.grants.includes(rw.grantId) ? rw.items.map((i) => i.itemId) : [];
  });
  const sections: Record<SummaryKind, string[]> = {
    night,
    packed,
    events: refs('RoadEvent'),
    quests,
    bought: refs('BuyItem'),
    got: uniq([...refs('Pickup'), ...rewards]),
    sold: refs('SellItem'),
  };

  // Гроші: початок — баланс після останнього запису попереднього дня (для дня 1 — після створення персонажа: гроші, з якими
  // почали); кінець — після запису-межі дня, а для відкритого дня — нинішній баланс.
  const before = r.from === 0 ? sim.journal[0] : sim.journal[r.from - 1];
  const start = before?.cents;
  const end = r.ended ? sim.journal[r.to]?.cents : sim.game.moneyCents;
  const money = start !== undefined && end !== undefined ? { start, end } : null;

  return {
    day,
    ended: r.ended,
    sections: SUMMARY_KINDS.filter((k) => sections[k].length > 0).map((kind) => ({ kind, ids: sections[kind] })),
    money,
  };
}
