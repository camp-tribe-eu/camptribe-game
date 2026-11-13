// Квести й світ розділу (GAME-29). Чиста логіка над чернеткою стану: команда — намір гравця
// (піти, поговорити, підняти, завершити), що з цього виходить — вирішує сюжет із каталогу.
//
// Семантика навмисно та сама, що у валідатора контенту (scripts/validator/checks.mjs, combos.mjs),
// бо інакше «валідатор каже: досяжно» нічого не доводить про гру:
// * `when` — збіг із профілем, транспортом і твариною гравця; квест/ціль/перехід, що не збіглися,
//   для цього гравця не існують; локація чи NPC, що не збіглися, — зачинені назавжди;
// * локація й NPC відкриваються, коли завершено квест `unlockedBy`; NPC — ще й коли відкрита його локація;
// * предмет здобувається з `items` локації, де стоїть гравець, або з нагороди квесту;
// * перехід із `choiceKey` — вибір гравця; без нього — шлях за замовчуванням;
// * `requires` квесту-цілі перевіряється в мить переходу.
import type { FriendState } from './friendship';
import type { LifeState } from './life';
import { isNight, minuteOfDay } from './clock';
import { canSleep } from './rest';
import type { CondDef, EffectDef, GateDef, QuestDef, RewardDef, StoryDefs, WayDef, WhenDef } from './defs';
import type { GameEvent } from './commands';
import type { GearState } from './gear';
import { startSkills } from './skills';
import type { GameState, PlayerState, QuestProgress, RejectCode } from './state';
import type { WaveState } from './wave';
import type { ProgressState } from './progress';
import type { MinigameResults } from './minigame';
import type { CampBoardSave } from './camp-board';

export const NO_ANIMAL = 'animal.none';

/**
 * id основного етапу (GAME-138): канонічний id сценарію великими літерами з номером — ST-001, PROLOGUE-HOME-001, CH1-HOME-001.
 * Той самий формат, що й у валідатора (ID_PATTERNS.quests у scripts/validator/checks.mjs); бічні квести — `q.назва` (isContentId).
 */
export const MAIN_QUEST_ID = /^(?:[A-Z][A-Z0-9]*-)+\d{3}$/;

export type StoryCommand =
  | { readonly type: 'CreateCharacter'; readonly commandId: string; readonly profileId: string; readonly transportId: string; readonly animalId?: string }
  | { readonly type: 'Visit'; readonly commandId: string; readonly locationId: string }
  | { readonly type: 'Talk'; readonly commandId: string; readonly npcId: string }
  | { readonly type: 'Pickup'; readonly commandId: string; readonly itemId: string }
  | { readonly type: 'CompleteQuest'; readonly commandId: string; readonly questId: string; readonly to?: string }
  | { readonly type: 'DeclineQuest'; readonly commandId: string; readonly questId: string; readonly to?: string }
  /** Обрати репліку відкритого діалогу: індекс у `choices` вузла (не серед видимих — UI знає умови). */
  | { readonly type: 'Choose'; readonly commandId: string; readonly choice: number }
  /** Далі: вузол із `next` — до наступного, вузол із `end` — закрити розмову. */
  | { readonly type: 'Continue'; readonly commandId: string }
  /**
   * Подія в дорозі (GAME-31): відкрити діалог-подію. Шле її НЕ гравець, а симуляція після приїзду (кидок
   * RNG у sim.step); ядро лише перевіряє, що подія доречна. Повний перебір має її серед можливих ходів.
   */
  | { readonly type: 'RoadEvent'; readonly commandId: string; readonly eventId: string }
  /**
   * Сцена сюжету (GAME-142): відкрити діалог зі `scene`. Шле її НЕ гравець, а сюжет (гачок кінця дня). `facts` — які з
   * `scene.facts` правдиві зараз (вогнище дозволене, вечеря завершена, фото є); ядро ставить їх прапорцями й відкриває
   * розмову. Факт поза `scene.facts` — відмова: стартер не може вигадати стан, якого сцена не оголосила.
   */
  | { readonly type: 'StartScene'; readonly commandId: string; readonly sceneId: string; readonly facts?: readonly string[] };

export interface StoryDraft {
  moneyCents: number;
  inventory: Record<string, number>;
  grants: string[];
  events: GameEvent[];
  player: PlayerState | null;
  quests: Record<string, QuestProgress>;
  campaignEnded: boolean;
  flags: string[];
  npcMemory: Record<string, readonly string[]>;
  skills: Readonly<Record<string, number>>;
  practice: Readonly<Record<string, number>>;
  gear: Readonly<Record<string, GearState>>;
  life: LifeState;
  dialogue: { readonly id: string; readonly node: string } | null;
  /** Хвилі напруги (GAME-170); поля немає — хвиль не було. */
  wave?: WaveState;
  /** Прогресія (GAME-181); поля немає — нічого не нараховано. */
  progress?: ProgressState;
  /** Наклейки Атласу (GAME-182); поля немає — жодної ще немає. */
  stickers?: readonly string[];
  friend?: FriendState;
  /** GAME-256: скільки разів родина спала (див. GameState.slept). */
  slept?: number;
  /** GAME-286: див. GameState.chapterStart. */
  chapterStart?: number;
  /** GAME-308: див. GameState.minigames. */
  minigames?: MinigameResults;
  /** GAME-314: див. GameState.campBoard. */
  campBoard?: CampBoardSave;
}

const own = <T>(o: Readonly<Record<string, T>>, k: string): T | undefined => (Object.hasOwn(o, k) ? o[k] : undefined);
const isCents = (n: number): boolean => Number.isSafeInteger(n) && n >= 0;

export function matches(when: WhenDef | undefined, p: PlayerState): boolean {
  if (!when) return true;
  return (!when.profiles || when.profiles.includes(p.profileId))
    && (!when.transports || when.transports.includes(p.transportId))
    && (!when.animals || when.animals.includes(p.animalId));
}

/** Скільки разів родина може спати до того, як лічильник перестає рости (стеля для ворота `day`: валідатор — GATE_DAY_RANGE). */
export const SLEEP_CAP = 4;
/** День сюжету з 1: скільки разів родина спала + 1 (GAME-256). */
export const storyDay = (slept: number | undefined): number => (slept ?? 0) + 1;

/** GAME-286: перший квест розділу 2 — його запускає команда StartChapter2 (у переходах його немає: розділ 1 заморожений, зв'язок — meta.chapterLinks). */
export const CHAPTER2_START = 'CH2-ARRIVAL-001';
/** Квест розділу 2 — за префіксом id (формат GAME-285: `CH2-…`). */
export const isCh2Quest = (questId: string): boolean => questId.startsWith('CH2-');
/**
 * GAME-286: лічильник сну, яким квест міряє СВІЙ день: розділ 1 — абсолютний `slept`, розділ 2 — відносно старту розділу (`chapterStart`).
 * Сон до старту розділу 2 (сон кінця розділу 1) у дні розділу 2 не входить.
 */
export const questSlept = (questId: string, d: { readonly slept?: number; readonly chapterStart?: number }): number | undefined =>
  isCh2Quest(questId) ? Math.max(0, (d.slept ?? 0) - (d.chapterStart ?? 0)) : d.slept;
/** Стеля лічильника сну: SLEEP_CAP днів від старту розділу (для розділу 1 — від нуля). */
export const sleepCap = (d: { readonly chapterStart?: number }): number => (d.chapterStart ?? 0) + SLEEP_CAP;

/**
 * GAME-256 · ворота дня відчинені? День — за сном (`slept`), хвилина доби — за годинником (`now`, ігрові хвилини). Без годинника (повний перебір
 * і бот ходять без нього) ворота хвилини вважаються відчиненими: час доби доводять тести на симуляції, а день — лічильник сну, який є й там.
 */
export function gateOpen(gate: GateDef | undefined, slept: number | undefined, now?: number): boolean {
  if (!gate) return true;
  const day = storyDay(slept);
  if (day !== gate.day) return day > gate.day;
  return gate.fromMinute === undefined || now === undefined || minuteOfDay(now) >= gate.fromMinute;
}
/** Ворота квесту відчинені (квесту без воріт — завжди). */
export const questOpen = (st: Pick<StoryDefs, 'quests'>, d: { readonly slept?: number; readonly chapterStart?: number }, questId: string, now?: number): boolean => gateOpen(own(st.quests, questId)?.gate, questSlept(questId, d), now);
/** Квест активний І його ворота відчинені: лише такий крок «живий» для розмов, хвиль і сцен. */
export const questLive = (st: Pick<StoryDefs, 'quests'>, d: { readonly quests: StoryDraft['quests']; readonly slept?: number; readonly chapterStart?: number }, questId: string, now?: number): boolean =>
  own(d.quests, questId)?.status === 'active' && questOpen(st, d, questId, now);

/**
 * GAME-256 · вечірній крок СЬОГОДНІ ще не зроблено: активний квест із `gate.fromMinute`, чий день настав і чия година минула. Спати, поки він активний, не можна
 * (інакше вечір (вечеря, вогнище) переїхав би на ранок наступного дня): спершу вечірні кроки. Після «пора спати» (22:00) діє старе правило GAME-242 — лягти можна де застала ніч.
 */
export const eveningPending = (st: Pick<StoryDefs, 'quests'> | undefined, d: { readonly quests: StoryDraft['quests']; readonly slept?: number; readonly chapterStart?: number }, now: number): boolean =>
  st !== undefined && Object.entries(d.quests).some(([id, q]) => { const gate = own(st.quests, id)?.gate; return q.status === 'active' && gate?.fromMinute !== undefined && storyDay(questSlept(id, d)) === gate.day && minuteOfDay(now) >= gate.fromMinute; });
/** Можна лягти спати: правило GAME-242 (ліжко/намет з 18:00, будь-де після 22:00) І немає незробленого вечірнього кроку дня (до 22:00). */
export const canSleepNow = (st: Pick<StoryDefs, 'quests'> | undefined, d: Parameters<typeof canSleep>[0] & { readonly quests: StoryDraft['quests']; readonly slept?: number; readonly chapterStart?: number }, now: number): boolean =>
  canSleep(d, now) && (isNight(now) || !eveningPending(st, d, now));

/** GAME-269 · хвилина доби, до якої «Відпочити до вечора» перемотує час (17:30: ще пів години до 18:00, коли збираються на вечір). */
export const REST_TO = 17 * 60 + 30;
/** Сцена «Відпочити до вечора» (content/dialogue/rest-evening.json): коротка родинна розмова після перемотування. */
export const REST_SCENE = 'dlg.rest-evening';
/**
 * GAME-269 · мертве вікно: у таборі, намет стоїть, до 17:30, жодного обов'язкового кроку, що вже чекає на гравця (відкритий квест без `optional`) чи відкритої справи хвилі,
 * і є обов'язковий крок, що чекає свого дня чи вечора (інакше відпочивати нема до чого). Розмова чи сцена в ході — ні.
 */
export const canRestNow = (st: Pick<StoryDefs, 'quests'> | undefined, d: { readonly player: { readonly locationId: string | null } | null; readonly flags: readonly string[]; readonly quests: StoryDraft['quests']; readonly slept?: number; readonly dialogue?: unknown; readonly wave?: { readonly active?: { readonly tasks: Readonly<Record<string, { readonly outcome: string }>> } | null } | null }, now: number): boolean => {
  if (!st || !d.player || d.dialogue || !(d.player.locationId ?? '').startsWith('loc.camp.') || !d.flags.includes('f.night-tent') || minuteOfDay(now) >= REST_TO) return false;
  if (Object.values(d.wave?.active?.tasks ?? {}).some((t) => t.outcome === 'open')) return false;
  const required = Object.entries(d.quests).filter(([id, q]) => q.status === 'active' && !own(st.quests, id)?.optional);
  return required.length > 0 && required.every(([id]) => !questOpen(st, d, id, now));
};

const completed = (d: StoryDraft, questId: string | undefined): boolean => questId === undefined || own(d.quests, questId)?.status === 'completed';

/**
 * GAME-295: місце, яке відкриває КІНЕЦЬ розділу (квест з `end`, напр. Мюллерталь після CH1-D3-HOME-001), відкривається лише коли гравець почав наступний
 * розділ («Продовжити подорож», `chapterStart`). Без цього між кінцем розділу 1 і стартом розділу 2 можна було приїхати в Мюллерталь і говорити з господинею —
 * поза сюжетом (вибір місця ще до прибуття), а перебір розділу 1 ріс на 47 % (story-offer GAME-48: 104 тис. → 153 тис. станів).
 */
export const unlockOpen = (st: Pick<StoryDefs, 'quests'>, d: { readonly quests: StoryDraft['quests']; readonly chapterStart?: number }, questId: string | undefined): boolean =>
  questId === undefined || (own(d.quests, questId)?.status === 'completed' && (!own(st.quests, questId)?.end || d.chapterStart !== undefined));

export function locationOpen(st: StoryDefs, d: StoryDraft, p: PlayerState, id: string): boolean {
  const loc = own(st.locations, id);
  return !!loc && matches(loc.when, p) && unlockOpen(st, d, loc.unlockedBy);
}

export function npcOpen(st: StoryDefs, d: StoryDraft, p: PlayerState, id: string): boolean {
  const npc = own(st.npcs, id);
  return !!npc && matches(npc.when, p) && completed(d, npc.unlockedBy) && (npc.follows === true || locationOpen(st, d, p, npc.locationId));
}

// Сусіди вузла для транспорту — раз на заморожений перелік доріг (рецензія: route() кличуть на кожен Visit,
// у меню і в повному переборі; лінійний прохід по всіх дорогах на кожному кроці росте квадратично).
const ADJ = new WeakMap<object, Map<string, Map<string, [string, WayDef][]>>>();
function adjacency(roads: NonNullable<StoryDefs['roads']>, transport: string): Map<string, [string, WayDef][]> {
  let byTransport = ADJ.get(roads);
  if (!byTransport) { byTransport = new Map(); ADJ.set(roads, byTransport); }
  let adj = byTransport.get(transport);
  if (!adj) {
    adj = new Map();
    for (const r of roads) {
      const w = own(r.ways, transport);
      if (w) adj.set(r.from, [...(adj.get(r.from) ?? []), [r.to, w]]);
    }
    byTransport.set(transport, adj);
  }
  return adj;
}

/**
 * Найкоротша (за часом) дорога між локаціями для транспорту (GAME-31): хвилини й гроші. Крізь замкнену
 * локацію проїхати можна — зупинитись ні (так само рахує валідатор, перевірка `roads`). Доріг у сюжеті
 * немає — перехід миттєвий і безкоштовний; на місці чи ще ніде (null) — теж. null — дороги немає.
 */
export function route(st: StoryDefs, from: string | null, to: string, transport: string): { minutes: number; cents: number } | null {
  const w = way(st, from, to, transport);
  return w && { minutes: w.minutes, cents: w.cents };
}

/**
 * Небезпека дороги, якою поїде гравець (GAME-72): найбільший `risk` ребер тієї самої найкоротшої дороги,
 * що й route(). Аргументи — лише сюжет, місце й транспорт: навичок ця функція не бачить (SIM-SKL-003).
 */
export function routeRisk(st: StoryDefs, from: string | null, to: string, transport: string): number | null {
  return way(st, from, to, transport)?.risk ?? null;
}

/**
 * Небезпека поїздки гравця в `to` (GAME-72) — те, що покаже UI. Бере весь стан гри (і навички в ньому), але
 * результат від навичок не залежить: досвідчений водій на небезпечній дорозі — так само на небезпечній
 * (SIM-SKL-003). Доказ — властивість у src/core/skills.test.ts. null — персонажа чи дороги немає.
 */
export function tripRisk(st: StoryDefs, s: Pick<GameState, 'player' | 'skills'>, to: string): number | null {
  const p = s.player;
  return p ? routeRisk(st, p.locationId, to, p.transportId) : null;
}

function way(st: StoryDefs, from: string | null, to: string, transport: string): { minutes: number; cents: number; risk: number } | null {
  const roads = st.roads ?? [];
  if (roads.length === 0 || from === null || from === to) return { minutes: 0, cents: 0, risk: 0 };
  // Дейкстра на кількох вузлах: перебором, детерміновано (рівні за часом — дешевший, далі — за id).
  const best = new Map<string, { minutes: number; cents: number; risk: number }>([[from, { minutes: 0, cents: 0, risk: 0 }]]);
  const done = new Set<string>();
  for (;;) {
    let cur: string | null = null;
    for (const [k, v] of best) {
      if (done.has(k)) continue;
      const c = cur === null ? undefined : best.get(cur);
      if (!c || v.minutes < c.minutes || (v.minutes === c.minutes && (v.cents < c.cents || (v.cents === c.cents && k < (cur as string))))) cur = k;
    }
    if (cur === null) return null;
    if (cur === to) return best.get(cur) ?? null;
    done.add(cur);
    const here = best.get(cur) as { minutes: number; cents: number; risk: number };
    for (const [to, w] of adjacency(roads, transport).get(cur) ?? []) {
      const cand = { minutes: here.minutes + w.minutes, cents: here.cents + w.cents, risk: Math.max(here.risk, w.risk ?? 0) };
      const old = best.get(to);
      if (!old || cand.minutes < old.minutes || (cand.minutes === old.minutes && cand.cents < old.cents)) best.set(to, cand);
    }
  }
}

/** Прапорець «подія вже була» — подія в дорозі трапляється раз; вміст може читати його в умовах (notFlag). */
export const eventSeenFlag = (eventId: string): string => `f.seen-${eventId.replace(/^dlg\./, '')}`;

/** Чи може подія відкритись зараз: гравець є, розмови немає, він у локації з `at`, подія для нього (`when`, GAME-108), її ще не було. */
export function eventEligible(st: StoryDefs, d: { readonly player: PlayerState | null; readonly flags: readonly string[]; readonly dialogue: StoryDraft['dialogue'] }, eventId: string): boolean {
  const ev = own(st.dialogues, eventId);
  const p = d.player;
  if (!ev?.trigger || !p || p.locationId === null) return false;
  const open = d.dialogue ? own(st.dialogues, d.dialogue.id) : undefined;
  if (d.dialogue && open && own(open.nodes, d.dialogue.node)) return false; // жива розмова (зависла — не заважає, як у liveDialogue)
  return ev.trigger.at.includes(p.locationId) && matches(ev.trigger.when, p) && !d.flags.includes(eventSeenFlag(eventId));
}

/** Цілі квесту, що існують для цього гравця. */
const objectivesFor = (q: QuestDef, p: PlayerState) => q.objectives.filter((o) => matches(o.when, p));

export function objectiveDone(d: StoryDraft, questId: string, o: QuestDef['objectives'][number]): boolean {
  if (o.kind === 'collect') return (own(d.inventory, o.target) ?? 0) >= 1;
  return own(d.quests, questId)?.done.includes(o.id) ?? false;
}

/**
 * Чи потрібен предмет активному квесту (GAME-73, SIM-INV-004): ціль `collect` цього квесту або `requires.items` квесту,
 * куди з нього веде доступний гравцеві перехід. Такий предмет не продається — інакше квест не завершити.
 */
export function questNeedsItem(st: StoryDefs, d: Pick<StoryDraft, 'quests'>, p: PlayerState, itemId: string): boolean {
  for (const [qid, prog] of Object.entries(d.quests)) {
    if (prog.status !== 'active') continue;
    const q = own(st.quests, qid);
    if (!q || !matches(q.when, p)) continue;
    if (objectivesFor(q, p).some((o) => o.kind === 'collect' && o.target === itemId)) return true;
    if (q.transitions.some((t) => matches(t.when, p) && (own(st.quests, t.to)?.requires?.items.includes(itemId) ?? false))) return true;
  }
  return false;
}

/** Переходи, які гравець може взяти: збіг `when` переходу й квесту-цілі. */
export function exitsFor(st: StoryDefs, q: QuestDef, on: 'complete' | 'decline', p: PlayerState) {
  return q.transitions.filter((t) => t.on === on && matches(t.when, p) && matches(own(st.quests, t.to)?.when, p));
}

/** Позначити виконані цілі `visit`/`talk` в усіх активних квестах. */
function mark(st: StoryDefs, d: StoryDraft, p: PlayerState, kind: 'visit' | 'talk', target: string): void {
  for (const [qid, prog] of Object.entries(d.quests)) {
    if (prog.status !== 'active') continue;
    const q = own(st.quests, qid);
    if (!q) continue;
    const hits = objectivesFor(q, p).filter((o) => o.kind === kind && o.target === target && o.byDialogue !== true && !prog.done.includes(o.id)).map((o) => o.id);
    if (hits.length) d.quests = { ...d.quests, [qid]: { ...prog, done: [...prog.done, ...hits].sort() } };
  }
}

/**
 * GAME-84 №1: квест, що стартує там, де гравець уже стоїть, одразу рахує ціль «побувати тут» виконаною.
 * Без цього меню мусило пропонувати «Піти: Дім» тому, хто вдома, — лише щоб поставити позначку.
 */
function markHere(st: StoryDefs, d: StoryDraft, p: PlayerState): void {
  if (p.locationId !== null) mark(st, d, p, 'visit', p.locationId);
}

function giveReward(d: StoryDraft, commandId: string, questId: string, r: RewardDef, guardGrant: boolean): RejectCode | null {
  if (guardGrant && d.grants.includes(r.grantId)) return null; // нагорода — рівно раз за grantId (TD-004); квест усе одно завершено
  if (!isCents(r.moneyCents)) return 'INVALID_AMOUNT';
  d.moneyCents += r.moneyCents;
  if (!isCents(d.moneyCents)) return 'INVALID_AMOUNT';
  for (const { itemId, qty } of r.items) {
    const next = (own(d.inventory, itemId) ?? 0) + qty;
    if (!Number.isSafeInteger(next) || qty < 1) return 'INVALID_AMOUNT';
    d.inventory[itemId] = next;
  }
  d.grants.push(r.grantId);
  d.grants.sort();
  d.events.push({ type: 'RewardGranted', commandId, targetId: questId, grantId: r.grantId, moneyCents: r.moneyCents, items: r.items.map((i) => ({ ...i })) });
  return null;
}

/** Завершити або відмовитись: вибрати перехід, перевірити `requires` цілі, відкрити її. */
function leave(st: StoryDefs, d: StoryDraft, p: PlayerState, cmd: { commandId: string; questId: string; to?: string }, on: 'complete' | 'decline', guardGrant: boolean, now?: number): RejectCode | null {
  const q = own(st.quests, cmd.questId);
  if (!q || !matches(q.when, p)) return 'UNKNOWN_TARGET';
  if (own(d.quests, cmd.questId)?.status !== 'active') return 'QUEST_NOT_ACTIVE';
  if (!questOpen(st, d, cmd.questId, now)) return 'QUEST_NOT_YET';   // GAME-256: крок чекає на свій день / вечір
  if (on === 'decline' && !q.optional) return 'QUEST_NOT_OPTIONAL';
  if (on === 'complete' && objectivesFor(q, p).some((o) => o.required && !objectiveDone(d, cmd.questId, o))) return 'QUEST_OBJECTIVES_OPEN';

  const exits = exitsFor(st, q, on, p);
  let to: string | undefined;
  if (cmd.to !== undefined) {
    if (!exits.some((t) => t.to === cmd.to)) return 'INVALID_CHOICE';
    to = cmd.to;
  } else if (exits.length) {
    to = exits.find((t) => !t.choice)?.to;
    // Лише вибори — гравець мусить назвати один; у квесту-кінця «без вибору» означає просто кінець.
    if (to === undefined && !(on === 'complete' && q.end)) return 'INVALID_CHOICE';
  } else if (!(on === 'complete' && q.end)) {
    return 'QUEST_NO_EXIT'; // тупик: валідатор не мав цього пропустити
  }

  const prev = own(d.quests, cmd.questId) as QuestProgress;
  d.quests = { ...d.quests, [cmd.questId]: { ...prev, status: on === 'complete' ? 'completed' : 'declined' } };
  if (on === 'complete' && q.reward) {
    const bad = giveReward(d, cmd.commandId, cmd.questId, q.reward, guardGrant);
    if (bad) return bad;
  }
  // Завершення квесту-кінця закінчує розділ завжди — і коли далі є перехід (епілог), як у валідатора,
  // для якого `end` — термінальний вузол (рецензія GAME-29: інакше такий кінець не наставав ніколи).
  if (on === 'complete' && q.end) d.campaignEnded = true;
  if (to === undefined) return null;
  const target = own(st.quests, to) as QuestDef;
  const req = target.requires;
  if (req && (req.quests.some((r) => !completed(d, r)) || req.items.some((i) => (own(d.inventory, i) ?? 0) < 1))) return 'QUEST_REQUIRES_UNMET';
  // Повторний вхід (цикл у графі, валідатор його дозволяє за наявності виходу — cycle-exit) знову
  // робить квест активним із чистими цілями; нагорода за grantId однаково не повториться.
  if (own(d.quests, to)?.status !== 'active') { d.quests = { ...d.quests, [to]: { status: 'active', done: [] } }; markHere(st, d, p); }
  return null;
}

/**
 * Розділ пройдено (GAME-144, `chapter1_complete` сценарію) — ПОХІДНЕ від квестів: завершено квест-кінець (`end: true`,
 * для розділу 1 — CH1-D3-HOME-001). Окремого прапорця немає й не буде: прапорець можна поставити без квесту, а квест —
 * єдине джерело правди. `campaignEnded` ядро ставить лише в мить завершення такого квесту (leave), а сейв, де він стоїть без
 * завершеного кінця, reopenChapter знову відкриває; рівність `campaignEnded === chapterComplete` на всіх досяжних станах
 * доводить src/content/day3.test.ts.
 */
export function chapterComplete(game: Pick<GameState, 'quests'>, st: Pick<StoryDefs, 'quests'>): boolean {
  return Object.entries(st.quests).some(([id, q]) => q.end && own(game.quests, id)?.status === 'completed');
}

/** Квест-кінець розділу 2 (GAME-285). `chapter2_complete` — ПОХІДНЕ від його завершення; окремого прапорця немає й не буде (як для розділу 1). */
export const CHAPTER2_END = 'CH2-D3-HOME-001';
export function chapter2Complete(game: Pick<GameState, 'quests'>, st: Pick<StoryDefs, 'quests'>): boolean {
  return own(st.quests, CHAPTER2_END)?.end === true && own(game.quests, CHAPTER2_END)?.status === 'completed';
}

/** GAME-286: розділ 1 завершено, а розділ 2 ще не починали — гравцеві пропонують «Продовжити подорож». */
export const chapter2Startable = (game: Pick<GameState, 'quests'>, st: Pick<StoryDefs, 'quests'>): boolean =>
  own(st.quests, CHAPTER2_START) !== undefined && chapterComplete(game, st) && own(game.quests, CHAPTER2_START) === undefined;
/** GAME-286: печатка Люксембургу в Атласі — лише коли родина справді приїхала в Мюллерталь (ціль `visit`), а не коли розділ лише розпочато. */
export const luxembourgStamp = (game: Pick<GameState, 'quests'>): boolean => {
  const q = own(game.quests, CHAPTER2_START);
  return q !== undefined && (q.status === 'completed' || q.done.includes('o1-mullerthal'));
};

/** Чи пам'ятає NPC факт (GAME-48). Без NPC (подія в дорозі) — ніхто нічого не пам'ятає. */
export function remembers(d: Pick<StoryDraft, 'npcMemory'>, npcId: string | undefined, fact: string): boolean {
  return npcId !== undefined && (own(d.npcMemory, npcId) ?? []).includes(fact);
}

/**
 * Умова діалогу (TD-006). Семантика — як у валідатора (scripts/validator/checks.mjs, GAME-28).
 * npcId — власник розмови: `remembers`/`notRemembers` читають пам'ять саме цього NPC (GAME-48).
 */
export function holds(c: CondDef, d: StoryDraft, p: PlayerState, npcId?: string, gate?: { readonly st: Pick<StoryDefs, 'quests'>; readonly now?: number | undefined }): boolean {
  if ('flag' in c) return d.flags.includes(c.flag);
  if ('notFlag' in c) return !d.flags.includes(c.notFlag);
  if ('remembers' in c) return remembers(d, npcId, c.remembers);
  if ('notRemembers' in c) return !remembers(d, npcId, c.notRemembers);
  // GAME-256: «активний» для розмови — лише коли ворота дня відчинені (вечеря не пропонується вдень); без `gate` — як було.
  if ('quest' in c) return own(d.quests, c.quest)?.status === c.status && (c.status !== 'active' || !gate || questOpen(gate.st, d, c.quest, gate.now));
  // GAME-202: справа відкрита лише в живій хвилі й зі статусом open; зроблена, спізнена чи хвиля минула — ні. Строк за годинником
  // уже розсудив settleWave перед командою (sim.afterClock), тож тут статусу досить.
  if ('taskOpen' in c) return own(d.wave?.active?.tasks ?? {}, c.taskOpen)?.outcome === 'open';
  // GAME-312: робота місії — міні-гра на місці; розмова просильника читає лише «зіграно», результат читає ніч (src/content/storm-night.ts).
  if ('minigame' in c) return own(d.minigames ?? {}, c.minigame) !== undefined;
  if ('transport' in c) return p.transportId === c.transport;
  if ('animal' in c) return p.animalId === c.animal;
  if ('all' in c) return c.all.every((x) => holds(x, d, p, npcId, gate));
  return c.any.some((x) => holds(x, d, p, npcId, gate));
}

function runEffect(st: StoryDefs, d: StoryDraft, p: PlayerState, e: EffectDef, npcId: string | undefined, now?: number): RejectCode | null {
  if ('setFlag' in e) {
    if (!d.flags.includes(e.setFlag)) d.flags = [...d.flags, e.setFlag].sort();
    return null;
  }
  if ('remember' in e) {
    // Нікому пам'ятати (подія в дорозі) — нічого, а не відмова: відмова на єдиному виході замкнула б
    // гравця в розмові. Статично це ловить валідатор (EVENT_EFFECT_UNSUPPORTED) і checkDefs.
    if (npcId === undefined || remembers(d, npcId, e.remember)) return null;
    d.npcMemory = { ...d.npcMemory, [npcId]: [...(own(d.npcMemory, npcId) ?? []), e.remember].sort() };
    return null;
  }
  if ('startQuest' in e) {
    // Квест, який стартувати не можна (не для цього гравця, requires не виконано), — нічого, а не
    // відмова: відмова вибору на єдиному виході замкнула б гравця в розмові назавжди (рецензія
    // GAME-29). Статично такі старти ловить валідатор (DIALOGUE_QUEST_GATE).
    const q = own(st.quests, e.startQuest);
    if (!q || !matches(q.when, p)) return null;
    const req = q.requires;
    if (req && (req.quests.some((r) => !completed(d, r)) || req.items.some((i) => (own(d.inventory, i) ?? 0) < 1))) return null;
    const cur = own(d.quests, e.startQuest)?.status;
    if (cur !== 'active' && cur !== 'completed') { d.quests = { ...d.quests, [e.startQuest]: { status: 'active', done: [] } }; markHere(st, d, p); }
    return null;
  }
  // completeObjective: лише в активному квесті (як і позначки Visit/Talk); інакше — нічого.
  const { quest, objective } = e.completeObjective;
  const prog = own(d.quests, quest);
  if (prog?.status === 'active' && questOpen(st, d, quest, now) && !prog.done.includes(objective)) d.quests = { ...d.quests, [quest]: { ...prog, done: [...prog.done, objective].sort() } };
  return null;
}

/** guardGrant — запобіжник «нагорода рівно раз» (Safeguards.grantId); false — лише в тестах-мутаціях. */
/** Відкритий діалог, що справді є в контенті. Сейв із вузлом, якого вже немає, розмови не тримає. */
function liveDialogue(st: StoryDefs, d: StoryDraft) {
  if (!d.dialogue) return null;
  const dlg = own(st.dialogues, d.dialogue.id);
  const node = dlg && own(dlg.nodes, d.dialogue.node);
  return node ? { id: d.dialogue.id, node } : null;
}

export function applyStory(cmd: StoryCommand, d: StoryDraft, st: StoryDefs | undefined, isId: (s: unknown) => boolean, guardGrant = true, now?: number): RejectCode | null {
  if (!st) return 'UNKNOWN_TARGET';
  if (cmd.type === 'CreateCharacter') {
    if (d.player) return 'CHARACTER_EXISTS';
    const animalId = cmd.animalId ?? NO_ANIMAL;
    if (!isId(cmd.profileId) || !isId(cmd.transportId) || !isId(animalId)) return 'INVALID_COMMAND';
    const profile = own(st.profiles, cmd.profileId);
    const animal = animalId === NO_ANIMAL ? {} : own(st.animals, animalId);
    if (!profile || !animal || !st.transports.includes(cmd.transportId)) return 'UNKNOWN_TARGET';
    if ((profile.transports && !profile.transports.includes(cmd.transportId)) || (animal.transports && !animal.transports.includes(cmd.transportId))) return 'INVALID_CHOICE';
    const start = own(st.quests, st.start) as QuestDef;
    const player: PlayerState = { profileId: cmd.profileId, transportId: cmd.transportId, animalId, locationId: start.locationId ?? null };
    if (!matches(start.when, player)) return 'INVALID_CHOICE';
    d.player = player;
    d.quests = { [st.start]: { status: 'active', done: [] } };
    markHere(st, d, player);
    // Старт професії (SIM-SKL-004). До персонажа практики не було (practiseAfter вимагає гравця).
    d.skills = startSkills(profile.startSkills);
    return null;
  }

  const p = d.player;
  if (!p) return 'NO_CHARACTER';
  switch (cmd.type) {
    case 'Visit': {
      if (liveDialogue(st, d)) return 'IN_DIALOGUE';
      if (!isId(cmd.locationId)) return 'INVALID_COMMAND';
      if (!own(st.locations, cmd.locationId)) return 'UNKNOWN_TARGET';
      if (!locationOpen(st, d, p, cmd.locationId)) return 'LOCKED';
      const way = route(st, p.locationId, cmd.locationId, p.transportId);
      if (!way) return 'NO_ROUTE';
      if (d.moneyCents < way.cents) return 'INSUFFICIENT_FUNDS';
      d.moneyCents -= way.cents;
      d.player = { ...p, locationId: cmd.locationId };
      mark(st, d, d.player, 'visit', cmd.locationId);
      return null;
    }
    case 'Talk': {
      if (liveDialogue(st, d)) return 'IN_DIALOGUE';
      if (!isId(cmd.npcId)) return 'INVALID_COMMAND';
      const npc = own(st.npcs, cmd.npcId);
      if (!npc) return 'UNKNOWN_TARGET';
      if (!npcOpen(st, d, p, cmd.npcId)) return 'LOCKED';
      if (p.locationId !== npc.locationId && npc.follows !== true) return 'NOT_HERE';   // GAME-202: родина завжди поруч із героєм
      mark(st, d, p, 'talk', cmd.npcId);
      const dlg = Object.entries(st.dialogues).find(([, x]) => x.npcId === cmd.npcId);
      if (dlg) d.dialogue = { id: dlg[0], node: dlg[1].start };
      return null;
    }
    case 'RoadEvent': {
      if (!isId(cmd.eventId)) return 'INVALID_COMMAND';
      const ev = own(st.dialogues, cmd.eventId);
      if (!ev?.trigger) return 'UNKNOWN_TARGET';
      if (liveDialogue(st, d)) return 'IN_DIALOGUE';
      if (!eventEligible(st, d, cmd.eventId)) return 'CONDITION_FAILED';
      d.flags = [...d.flags, eventSeenFlag(cmd.eventId)].sort();
      d.dialogue = { id: cmd.eventId, node: ev.start };
      return null;
    }
    case 'StartScene': {
      if (!isId(cmd.sceneId)) return 'INVALID_COMMAND';
      const sc = own(st.dialogues, cmd.sceneId);
      if (!sc?.scene) return 'UNKNOWN_TARGET';
      if (liveDialogue(st, d)) return 'IN_DIALOGUE';
      // Законний хід лише на своєму етапі (GAME-141): квест сцени активний, а розділ ще не закінчено.
      if (sc.scene.atQuest !== undefined && (d.campaignEnded || own(d.quests, sc.scene.atQuest)?.status !== 'active')) return 'QUEST_NOT_ACTIVE';
      if (sc.scene.atQuest !== undefined && !questOpen(st, d, sc.scene.atQuest, now)) return 'QUEST_NOT_YET';   // GAME-256: вечірня сцена — не раніше свого вечора
      const facts = cmd.facts ?? [];
      if (!Array.isArray(facts) || facts.some((f) => typeof f !== 'string' || !sc.scene?.facts.includes(f))) return 'INVALID_CHOICE';
      if (facts.length) d.flags = [...new Set([...d.flags, ...facts])].sort();
      d.dialogue = { id: cmd.sceneId, node: sc.start };
      return null;
    }
    case 'Choose':
    case 'Continue': {
      const live = liveDialogue(st, d);
      if (!live) {
        // Сейв із вузлом, якого вже немає в контенті (рецензія GAME-29): «далі» прибирає завислу
        // розмову — інакше гравець застряг би. Без розмови взагалі — звичайна відмова.
        if (d.dialogue && cmd.type === 'Continue') { d.dialogue = null; return null; }
        return 'NO_DIALOGUE';
      }
      const { node } = live;
      if (cmd.type === 'Continue') {
        if (node.choices) return 'INVALID_CHOICE';
        if (node.next === undefined) { d.dialogue = null; return null; }
        // Автоматична розвилка (GAME-142): перша гілка, чия умова виконана; жодна — безумовний next.
        const npcOwner = own(st.dialogues, live.id)?.npcId;
        const hit = (node.branches ?? []).find((b) => holds(b.when, d, p, npcOwner, { st, now }));
        d.dialogue = { id: live.id, node: hit ? hit.next : node.next };
        return null;
      }
      const choice = Number.isSafeInteger(cmd.choice) && cmd.choice >= 0 ? node.choices?.[cmd.choice] : undefined;
      if (!choice) return 'INVALID_CHOICE';
      const npcId = own(st.dialogues, live.id)?.npcId;
      if (choice.when && !holds(choice.when, d, p, npcId, { st, now })) return 'CONDITION_FAILED';
      for (const e of choice.effects) {
        const bad = runEffect(st, d, p, e, npcId, now);
        if (bad) return bad;
      }
      d.dialogue = { id: live.id, node: choice.next };
      return null;
    }
    case 'Pickup': {
      if (!isId(cmd.itemId)) return 'INVALID_COMMAND';
      const here = p.locationId === null ? undefined : own(st.locations, p.locationId);
      if (!here?.items.includes(cmd.itemId)) return 'NOT_HERE';
      // Один примірник у руках: підбирання не множить предмети без меж (ціни й продаж — GAME-75).
      if ((own(d.inventory, cmd.itemId) ?? 0) >= 1) return 'ITEM_ALREADY_HELD';
      d.inventory[cmd.itemId] = 1;
      return null;
    }
    case 'CompleteQuest':
    case 'DeclineQuest':
      if (!isId(cmd.questId) && !MAIN_QUEST_ID.test(cmd.questId)) return 'INVALID_COMMAND';
      if (cmd.to !== undefined && !isId(cmd.to) && !MAIN_QUEST_ID.test(cmd.to)) return 'INVALID_COMMAND';
      return leave(st, d, p, cmd, cmd.type === 'CompleteQuest' ? 'complete' : 'decline', guardGrant, now);
  }
}
