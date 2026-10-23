// Крок симуляції: стан гри + годинник + RNG. Вхід — лише журнал (кадри, команди, перемотування),
// тож той самий seed і той самий журнал дають той самий стан (GAME-13).

import { advance, newClock, pause, resume, tick, type GameClock } from './clock';
import { dispatch, type Command } from './commands';
import { EMPTY_DEFS, type CoreDefs } from './defs';
import { canonical } from './hash';
import { wearAfterTrip } from './gear';
import { eventEligible, route } from './story';
import { nextInt, seedRng, type RngState } from './rng';
import { initialState, type GameState } from './state';
import { dayOf, tripMinutes, weatherOf, type Weather } from './weather';

export interface SimState {
  readonly game: GameState;
  readonly clock: GameClock;
  readonly rng: RngState;
  /** Зерно світу (GAME-46): з нього погода дня. Незмінне за гру; RNG стану від нього не залежить. */
  readonly worldSeed: number;
  /** Скільки разів за кроки вільного руху випала дрібна знахідка — приклад системи, що споживає RNG. */
  readonly finds: number;
  /** Журнал подорожі (GAME-32): пишеться сам, по запису на кожну прийняту НОВУ команду з переліку. */
  readonly journal: readonly JournalEntry[];
}

/** Запис журналу: коли (ігрова хвилина), що (тип команди), з чим (id цілі) і яка команда спричинила. */
export interface JournalEntry {
  readonly at: number;
  readonly commandId: string;
  readonly type: JournalType;
  readonly ref: string | null;
}

/**
 * Команди, що потрапляють у журнал. Розмова, вибір реплік і «далі» — ні: це не події подорожі.
 * Repair (GAME-72) поки ні: ремонтів у контенті немає. Додати сюди разом із першим ремонтом у content/.
 */
export const JOURNAL_TYPES = ['CreateCharacter', 'Visit', 'Pickup', 'BuyItem', 'SellItem', 'Interact', 'CompleteQuest', 'DeclineQuest', 'RoadEvent'] as const;
export type JournalType = (typeof JOURNAL_TYPES)[number];
export const isJournalType = (t: unknown): t is JournalType => (JOURNAL_TYPES as readonly unknown[]).includes(t);

/**
 * Скільки останніх записів журнал тримає (рецензія GAME-32): без межі «пінг-понг» між локаціями
 * роздував би сейв і код відновлення без кінця — 5 тис. записів ≈ 38 тис. знаків коду. 500 записів —
 * це кілька розділів подорожі, а код лишається в межах кількох тисяч знаків.
 */
export const JOURNAL_LIMIT = 500;

/** Чи змінила команда гру: без лічильників команд (вони ростуть від кожної прийнятої команди). */
export const changedGame = (a: GameState, b: GameState): boolean =>
  canonical({ ...a, processed: null, seq: null }) !== canonical({ ...b, processed: null, seq: null });

function refOf(c: Command): string | null {
  const r = c as unknown as Record<string, unknown>;
  const v = r.questId ?? r.locationId ?? r.itemId ?? r.targetId ?? r.profileId ?? r.eventId;
  return typeof v === 'string' ? v : null;
}

/**
 * Дорога перемотує ігровий час одним кроком (SIM-TIME-004, GAME-31): прийнята НОВА команда Visit, що
 * змінила локацію, — хвилини найкоротшої дороги транспорту гравця з поправкою на погоду дня (GAME-46).
 * Запис журналу бере час ДО дороги.
 */
function travelMinutes(s: SimState, r: ReturnType<typeof dispatch>, ctx: StepCtx): number {
  const before = s.game;
  const st = ctx.defs?.story;
  const from = before.player?.locationId ?? null;
  const to = r.ok ? r.state.player?.locationId ?? null : null;
  if (!st || !r.ok || r.repeated || to === null || from === to || !before.player) return 0;
  const minutes = route(st, from, to, before.player.transportId)?.minutes ?? 0;
  // Погода дня ВИЇЗДУ (SIM-WX-007): дорога, що перетинає північ, не змінює своєї ціни посеред шляху.
  return (ctx.weather?.tripMinutes ?? tripMinutes)(minutes, before.player.transportId, todayWeather(s, ctx));
}

/** Погода поточного дня симуляції (SIM-WX-005). Підміна — лише для тестів (StepCtx.weather). */
export const todayWeather = (s: Pick<SimState, 'worldSeed' | 'clock'>, ctx: StepCtx = {}): Weather =>
  (ctx.weather?.of ?? weatherOf)(s.worldSeed, dayOf(s.clock));

/**
 * Подія в дорозі (GAME-31): після приїзду — один кидок RNG стану серед подій, доречних тут (eventEligible),
 * за накопиченим шансом. Випала — ядро отримує команду RoadEvent з id `ev<seq>`: похідна від журналу
 * входів, тож реплей і сейв відтворюються без нових полів стану. Кандидатів немає — кидка немає.
 */
function roadEvent(s: SimState, ctx: StepCtx): SimState {
  const st = ctx.defs?.story;
  if (!st) return s;
  const candidates = Object.keys(st.dialogues).sort().filter((id) => eventEligible(st, s.game, id));
  if (candidates.length === 0) return s;
  const roll = nextInt(s.rng, 100);
  let acc = 0;
  const hit = candidates.find((id) => (acc += st.dialogues[id]?.trigger?.chance ?? 0) > roll.value);
  const rolled: SimState = { ...s, rng: roll.state };
  if (!hit) return rolled;
  // id — з лічильника нових команд ядра: унікальний і завжди коротший за межу COMMAND_ID (рецензія:
  // «<id приїзду>.ev» переростав 64 знаки й міг збігтися з чужим id).
  // Зайнятий id (команда ззовні з id «evN») пропускаємо, як nextCommandId, — інакше подію загубив би COMMAND_ID_REUSED.
  let n = s.game.seq;
  while (Object.hasOwn(s.game.processed, `ev${n}`)) n++;
  return step(rolled, { kind: 'command', command: { type: 'RoadEvent', commandId: `ev${n}`, eventId: hit } }, ctx);
}

export type Input =
  | { readonly kind: 'frame'; readonly realMs: number }
  | { readonly kind: 'command'; readonly command: Command }
  | { readonly kind: 'advance'; readonly minutes: number }
  | { readonly kind: 'pause' }
  | { readonly kind: 'resume' };

/** Система вільного руху: кожна ігрова хвилина — шанс 1/50 дрібної знахідки. Лише через RNG стану. */
export type System = (s: SimState, steps: number) => SimState;

export const findsSystem: System = (s, steps) => {
  let rng = s.rng;
  let finds = s.finds;
  for (let i = 0; i < steps; i++) {
    const r = nextInt(rng, 50);
    rng = r.state;
    if (r.value === 0) finds++;
  }
  return { ...s, rng, finds };
};

export function newSim(seed: number, moneyCents = 0): SimState {
  return { game: initialState(moneyCents), clock: newClock(), rng: seedRng(seed), worldSeed: seed >>> 0, finds: 0, journal: [] };
}

/** Контекст кроку: незмінний каталог визначень і системи. У сейв не потрапляє. */
export interface StepCtx {
  readonly defs?: CoreDefs;
  readonly systems?: readonly System[];
  /**
   * ЛИШЕ ДЛЯ ТЕСТІВ (GAME-46): підміна погоди дня й/або її впливу на дорогу — «найгірша погода щодня»
   * і негативний контроль «погода, що закрила дорогу». Гра й реплеї цього поля не задають.
   */
  readonly weather?: {
    readonly of?: (worldSeed: number, day: number) => Weather;
    readonly tripMinutes?: (minutes: number, transportId: string, weather: Weather) => number;
  };
}

export function step(s: SimState, input: Input, ctx: StepCtx = {}): SimState {
  const systems = ctx.systems ?? [findsSystem];
  switch (input.kind) {
    case 'frame': {
      const t = tick(s.clock, input.realMs);
      return systems.reduce((acc, sys) => sys(acc, t.steps), { ...s, clock: t.clock });
    }
    case 'command': {
      const r = dispatch(s.game, input.command, ctx.defs ?? EMPTY_DEFS);
      const travelled = travelMinutes(s, r, ctx);
      // Спорядження в дорозі (GAME-73, SIM-GEAR-002/003): погода дня ВИЇЗДУ, як і для хвилин дороги (SIM-WX-007).
      const tripWeather = travelled > 0 ? todayWeather(s, ctx) : null;
      if (travelled > 0) s = { ...s, clock: advance(s.clock, travelled) };
      // Рівно один запис на прийняту нову команду з переліку, що щось змінила в грі. Відмова, повтор
      // commandId і «порожня» дія (прийти туди, де стоїш; вдруге погрітись біля вогнища) — нуль.
      let next: SimState = { ...s, game: r.state };
      if (r.ok && !r.repeated && isJournalType(input.command.type) && changedGame(s.game, r.state)) {
        const entry: JournalEntry = { at: s.clock.minutes - travelled, commandId: input.command.commandId, type: input.command.type, ref: refOf(input.command) };
        next = { ...next, journal: [...s.journal, entry].slice(-JOURNAL_LIMIT) };
      }
      if (tripWeather) next = { ...next, game: wearAfterTrip(next.game, (ctx.defs ?? EMPTY_DEFS).items, tripWeather) };
      return travelled > 0 ? roadEvent(next, ctx) : next;
    }
    case 'advance':
      return { ...s, clock: advance(s.clock, input.minutes) };
    case 'pause':
      return { ...s, clock: pause(s.clock) };
    case 'resume':
      return { ...s, clock: resume(s.clock) };
  }
}

export const run = (s: SimState, log: readonly Input[], ctx: StepCtx = {}): SimState =>
  log.reduce((acc, i) => step(acc, i, ctx), s);
