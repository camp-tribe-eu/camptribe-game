// Визначення, яким вірить ядро (рецензія TL PR #13): ціни й нагороди — лише з каталогу (CR-041),
// ніколи з команди. Команда несе НАМІР (`Interact{targetId}`, `BuyItem{itemId}`), а не ЕФЕКТ.
// Каталог збирається з перевіреного content/ (валідатор) — ядро його не змінює.
import { isSkillId, MAX_RANK, type SkillId } from './skills';
import type { LifeDefs } from './life';

export interface ItemDef {
  /** Ціна купівлі, центи; немає — предмет не продається. */
  readonly buyCents?: number;
  /**
   * Де продається (GAME-81): id локацій-крамниць. Немає (або порожньо) — купити ніде, навіть із ціною. Єдина правда
   * про «чи можна купити тут» — `soldAt` нижче: і ядро (BuyItem), і меню (воно питає ядро) йдуть через неї.
   */
  readonly soldAt?: readonly string[];
  /** Ціна викупу вживаного, центи; немає — не викуповується. ≤ buyCents (SIM-INV-004). */
  readonly sellCents?: number;
  /**
   * Спорядження (GAME-73): має стан і намокає (src/core/gear.ts). Повна картка (вага, об'єм, тепло…) живе в
   * content/items.json і перевіряється валідатором (gear); ядру поки потрібні лише вид і тир.
   */
  readonly gear?: GearDef;
}

/** Види спорядження (GAME-73). Той самий перелік — у схемі валідатора (items.kind). */
export const GEAR_KINDS = ['tent', 'sleeping-bag'] as const;
export interface GearDef { readonly kind: (typeof GEAR_KINDS)[number]; readonly tier: number }

/**
 * Чи можна купити предмет у цій локації (GAME-81) — ЄДИНЕ місце правила: ядро (BuyItem) питає його, меню питає ядро.
 * Світ із локаціями (`story`) — лише там, де предмет продається; у дорозі (`null`) і без персонажа — ніде.
 * Каталог без сюжету не має локацій, і «де» там нема чого питати: ціна — і все (так працюють ядрові фікстури).
 */
export function canBuyAt(defs: CoreDefs, itemId: string, locationId: string | null | undefined): boolean {
  if (defs.story === undefined) return true;
  const sold = Object.hasOwn(defs.items, itemId) ? defs.items[itemId]?.soldAt : undefined;
  return sold !== undefined && typeof locationId === 'string' && sold.includes(locationId);
}

export interface InteractionDef {
  /** Нагорода видається рівно раз за grantId (TD-004). */
  readonly grantId: string;
  readonly moneyCents: number;
  readonly items?: readonly { readonly itemId: string; readonly qty: number }[];
}

/** Умова `when` контенту (TD-006): збіг із вибором гравця. Порожнього списку валідатор не пропускає. */
export interface WhenDef {
  readonly profiles?: readonly string[];
  readonly transports?: readonly string[];
  readonly animals?: readonly string[];
}

export interface ObjectiveDef {
  readonly id: string;
  readonly kind: 'visit' | 'talk' | 'collect';
  readonly target: string;
  readonly required: boolean;
  /** GAME-87: ціль `talk` закриває лише репліка (`completeObjective`), а не будь-яка розмова з NPC. */
  readonly byDialogue?: boolean;
  readonly when?: WhenDef;
}

export interface TransitionDef {
  readonly on: 'complete' | 'decline';
  readonly to: string;
  /** Є — це вибір гравця, а не шлях за замовчуванням. */
  readonly choice: boolean;
  readonly when?: WhenDef;
}

export interface RewardDef {
  readonly grantId: string;
  readonly moneyCents: number;
  readonly items: readonly { readonly itemId: string; readonly qty: number }[];
}

export interface QuestDef {
  readonly optional: boolean;
  readonly end: boolean;
  readonly locationId?: string;
  readonly when?: WhenDef;
  readonly requires?: { readonly quests: readonly string[]; readonly items: readonly string[] };
  readonly objectives: readonly ObjectiveDef[];
  readonly transitions: readonly TransitionDef[];
  readonly reward?: RewardDef;
}

/** Умова діалогу (TD-006, DC-011): об'єкт рівно з одним ключем. */
export type CondDef =
  | { readonly flag: string }
  | { readonly notFlag: string }
  | { readonly quest: string; readonly status: 'active' | 'completed' }
  | { readonly transport: string }
  /** GAME-48: NPC, чия це розмова, пам'ятає факт (`m.назва`). У події в дорозі NPC немає — ніколи. */
  | { readonly remembers: string }
  | { readonly notRemembers: string }
  | { readonly all: readonly CondDef[] }
  | { readonly any: readonly CondDef[] };

export type EffectDef =
  | { readonly setFlag: string }
  | { readonly startQuest: string }
  | { readonly completeObjective: { readonly quest: string; readonly objective: string } }
  /** GAME-48: NPC, чия це розмова, запам'ятовує факт. Єдиний спосіб змінити пам'ять NPC. */
  | { readonly remember: string };

export interface DialogueNodeDef {
  readonly end?: true;
  readonly next?: string;
  /**
   * GAME-142: автоматична розвилка вузла з `next` — «Далі» веде в першу гілку, чия умова виконана, інакше в `next`.
   * Гравець нічого не обирає: так сцена показує «вогнище чи ліхтар», «є фото чи ні» за фактами стану.
   */
  readonly branches?: readonly { readonly when: CondDef; readonly next: string }[];
  readonly choices?: readonly { readonly next: string; readonly when?: CondDef; readonly effects: readonly EffectDef[] }[];
}

/** Подія в дорозі (GAME-31): діалог без NPC, що відкривається сам — з шансом, після приїзду в одну з локацій `at`. */
export interface EventTriggerDef {
  readonly at: readonly string[];
  /** Відсоток 1…100. Лише 100 — «гарантовано»: доказ «тупиків немає» не покладається на везіння (SIM-EV-003). */
  readonly chance: number;
}

/**
 * Сцена сюжету (GAME-142): діалог без NPC і без кидка RNG — його відкриває команда StartScene, яку шле сюжет
 * (наприклад, кінець дня). `facts` — bool-прапорці, які стартер може поставити в мить старту; інших ядро не прийме.
 */
export interface SceneDef { readonly facts: readonly string[] }

/** Діалог має рівно одного «власника»: NPC (розмова), trigger (подія в дорозі) або scene (сцена сюжету). */
export interface DialogueDef {
  readonly npcId?: string;
  readonly trigger?: EventTriggerDef;
  readonly scene?: SceneDef;
  readonly start: string;
  readonly nodes: Readonly<Record<string, DialogueNodeDef>>;
}

/**
 * Спосіб проїхати дорогу одним транспортом. `risk` (GAME-72) — небезпека дороги 0…3, властивість дороги й
 * транспорту, а не гравця: навичка її не знижує (SIM-SKL-003). Немає — 0.
 */
export interface WayDef { readonly minutes: number; readonly cents: number; readonly risk?: number }

/** Дорога (GAME-31): одне ребро в один бік; ways — транспорт → час і гроші. Немає транспорту — ним не їдуть. */
export interface RoadDef {
  readonly from: string;
  readonly to: string;
  readonly ways: Readonly<Record<string, WayDef>>;
}

/** Найбільша небезпека дороги (GAME-72). */
export const MAX_RISK = 3;

/** Сюжет розділу (GAME-29): збирається з перевіреного content/ (src/content/story.ts). */
export interface StoryDefs {
  readonly start: string;
  /** startSkills (GAME-72, DC-022): id навички → стартовий ранг 0…5. Професія задає старт, не стелю (SIM-SKL-004). */
  readonly profiles: Readonly<Record<string, { readonly transports?: readonly string[]; readonly startSkills?: Readonly<Record<string, number>> }>>;
  readonly transports: readonly string[];
  readonly animals: Readonly<Record<string, { readonly transports?: readonly string[] }>>;
  /** `sheltered` (GAME-88): дім чи кемпінг — під дахом або при наметі; тут спорядження можна сушити й у дощ. Немає поля — просто неба. */
  readonly locations: Readonly<Record<string, { readonly unlockedBy?: string; readonly when?: WhenDef; readonly items: readonly string[]; readonly sheltered?: boolean }>>;
  readonly npcs: Readonly<Record<string, { readonly locationId: string; readonly unlockedBy?: string; readonly when?: WhenDef }>>;
  readonly quests: Readonly<Record<string, QuestDef>>;
  /** Діалоги за id; на NPC — щонайбільше один (валідатор: DIALOGUE_NPC_DUPLICATE). */
  readonly dialogues: Readonly<Record<string, DialogueDef>>;
  /** Дороги між локаціями (GAME-31). Немає або порожньо — моделі подорожі немає: перехід миттєвий і безкоштовний. */
  readonly roads?: readonly RoadDef[];
  /**
   * Пам'ятні вибори (GAME-110): конкретні назви фактів (`f.pitch-pines`, `m.advice-taken`), які вибір у розмові пише в журнал
   * подорожі. Збирається з рядків content/flags.json із `journal: true`. Немає — журнал вибору не пише нічого.
   */
  readonly memorable?: readonly string[];
}

/**
 * Ремонт (GAME-72): що потрібно, щоб полагодити ціль. Навичка відкриває дію (`minRank`), але не скасовує
 * інструмент (`tool` — потрібен у руках, не витрачається) і запчастину (`part` — витрачається одна)
 * (SIM-SKL-003). Полагоджене ставить прапорець `flag` — і вдруге не ремонтується.
 */
export interface RepairDef {
  readonly skill: SkillId;
  readonly minRank: number;
  readonly tool: string;
  readonly part?: string;
  readonly flag: string;
}

/** Річ пакування (GAME-109): група, місце в одиницях, `when` — лише для частини гравців (переноска — з кішкою). */
export interface PackItemDef { readonly itemId: string; readonly group: 'needed' | 'useful' | 'leave'; readonly units: number; readonly when?: WhenDef }

/** Пакування (GAME-109): де й коли відкрите, скільки місця на транспорт, що пакують, підписи, коли речі бракує. */
export interface PackingDefs {
  readonly openAfter?: string;
  readonly at: readonly string[];
  readonly capacity: Readonly<Record<string, number>>;
  readonly items: readonly PackItemDef[];
  readonly notes: readonly { readonly missing: string; readonly transports?: readonly string[]; readonly textKey: string }[];
}

/**
 * Хвиля напруги (GAME-170, рішення власника 24–25.10): 2–4 одночасні справи з власним лімітом в ІГРОВИХ хвилинах
 * (пауза зупиняє годинник — і таймери). Кожна справа має два наслідки: встиг (`done`) і не встиг (`late`) — м'якший,
 * ніколи не поразка. Хвиля унікальна для свого етапу (`stage`) і на іншому не повторюється. `when` хвилі й справи —
 * варіанти за транспортом/профілем/твариною. Кінець розділу від хвиль не залежить (fallback: хвиля завжди закінчується).
 */
export interface WaveOutcomeDef { readonly effects: readonly string[] }
export interface WaveTaskDef {
  readonly id: string;
  /** Межа в ігрових хвилинах, ціле ≥ 1. */
  readonly limitMin: number;
  /** Лише лідер (гравець) може закрити справу; помічники — пізніше (GAME-170). */
  readonly leaderOnly?: boolean;
  /** Справа про тварину (`animal.cat`): її ціль ніколи не біля води чи вогню — валідатор WAVE_ANIMAL_UNSAFE. */
  readonly animal?: string;
  readonly when?: WhenDef;
  readonly done: WaveOutcomeDef;
  readonly late: WaveOutcomeDef;
}
export interface WaveDef {
  readonly stage: string;
  readonly when?: WhenDef;
  readonly tasks: readonly WaveTaskDef[];
  /** Прапорці, які ставить ядро, коли КОЖНА справа встигла. */
  readonly allDone?: WaveOutcomeDef;
}
export interface WaveDefs { readonly waves: Readonly<Record<string, WaveDef>> }

/** Найбільша межа справи (ігрові хвилини ≈ реальні секунди вільної сцени, SIM-TIME-002): хвиля триває 30–60 с. */
export const WAVE_MAX_LIMIT = 60;

export interface CoreDefs {
  /** Хвилі напруги (GAME-170, content/waves.json). Немає — StartWave/CompleteTask відмовляють (UNKNOWN_TARGET). */
  readonly waves?: WaveDefs;
  readonly items: Readonly<Record<string, ItemDef>>;
  readonly interactions: Readonly<Record<string, InteractionDef>>;
  /** Ремонти за id цілі (GAME-72). У контенті гри їх поки немає: команду доводять тести ядра. */
  readonly repairs?: Readonly<Record<string, RepairDef>>;
  /** Немає — команди сюжету відмовляють (UNKNOWN_TARGET), решта працює. */
  readonly story?: StoryDefs;
  /**
   * Календар життя (GAME-71): календар, робота профілів, школярі. Немає — зарплати немає, BookLeave/CancelLeave —
   * UNKNOWN_TARGET. Збирається з content/calendar.json і content/profiles.json (src/content/life.ts).
   */
  readonly life?: LifeDefs;
  /** Пакування (GAME-109, content/packing.json). Немає — команди пакування відмовляють (UNKNOWN_TARGET), персонаж стартує без прапорців. */
  readonly packing?: PackingDefs;
}

export const EMPTY_DEFS: CoreDefs = { items: {}, interactions: {} };

export const DEFS_CODES = ['DEFS_BAD_AMOUNT', 'DEFS_RESALE_ABOVE_PRICE', 'DEFS_BAD_ID', 'DEFS_BAD_REF', 'DEFS_STORY_ITEM_SELLABLE', 'DEFS_STORY_ITEM_BUYABLE'] as const;
export type DefsCode = (typeof DEFS_CODES)[number];

const isCents = (n: unknown): boolean => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
const ID = /^[a-z]+\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const isRank = (n: unknown): boolean => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= MAX_RANK;

/**
 * Каталог має бути цілим ДО гри: ціни — цілі центи ≥ 0, викуп ≤ купівлі (SIM-INV-004, інакше
 * купи-продай — нескінченні гроші), id — у форматі контенту. Повертає знахідки; порожньо — добре.
 */
export function checkDefs(defs: CoreDefs): { code: DefsCode; where: string }[] {
  const out: { code: DefsCode; where: string }[] = [];
  for (const [id, d] of Object.entries(defs.items)) {
    if (!ID.test(id)) out.push({ code: 'DEFS_BAD_ID', where: id });
    if ((d.buyCents !== undefined && !isCents(d.buyCents)) || (d.sellCents !== undefined && !isCents(d.sellCents))) out.push({ code: 'DEFS_BAD_AMOUNT', where: id });
    if (d.buyCents !== undefined && d.sellCents !== undefined && d.sellCents > d.buyCents) out.push({ code: 'DEFS_RESALE_ABOVE_PRICE', where: id });
    if (d.gear && (!(GEAR_KINDS as readonly string[]).includes(d.gear.kind) || !Number.isSafeInteger(d.gear.tier) || d.gear.tier < 1 || d.gear.tier > 3)) out.push({ code: 'DEFS_BAD_AMOUNT', where: `${id}.gear` });
  }
  for (const [id, d] of Object.entries(defs.interactions)) {
    if (!ID.test(id) || !ID.test(d.grantId) || (d.items ?? []).some((i) => !ID.test(i.itemId))) out.push({ code: 'DEFS_BAD_ID', where: id });
    if (!isCents(d.moneyCents) || (d.items ?? []).some((i) => !Number.isSafeInteger(i.qty) || i.qty < 1)) out.push({ code: 'DEFS_BAD_AMOUNT', where: id });
  }
  for (const [id, r] of Object.entries(defs.repairs ?? {})) {
    if (!ID.test(id) || !ID.test(r.tool) || (r.part !== undefined && !ID.test(r.part)) || !ID.test(r.flag)) out.push({ code: 'DEFS_BAD_ID', where: id });
    if (!isSkillId(r.skill)) out.push({ code: 'DEFS_BAD_REF', where: `${id}.skill` });
    if (!isRank(r.minRank)) out.push({ code: 'DEFS_BAD_AMOUNT', where: `${id}.minRank` });
  }
  const pk = defs.packing;
  if (pk) {
    // GAME-109: одиниці — цілі ≥ 1, річ — з id контенту, місце — ціле ≥ 1; посилання на сюжет — лише коли він є.
    for (const i of pk.items) {
      if (!ID.test(i.itemId)) out.push({ code: 'DEFS_BAD_ID', where: `packing.${i.itemId}` });
      if (!Number.isSafeInteger(i.units) || i.units < 1) out.push({ code: 'DEFS_BAD_AMOUNT', where: `packing.${i.itemId}.units` });
    }
    for (const [t, u] of Object.entries(pk.capacity)) if (!Number.isSafeInteger(u) || u < 1) out.push({ code: 'DEFS_BAD_AMOUNT', where: `packing.capacity.${t}` });
    if (defs.story) {
      if (pk.openAfter !== undefined && !Object.hasOwn(defs.story.quests, pk.openAfter)) out.push({ code: 'DEFS_BAD_REF', where: 'packing.openAfter' });
      for (const l of pk.at) if (!Object.hasOwn(defs.story.locations, l)) out.push({ code: 'DEFS_BAD_REF', where: `packing.at.${l}` });
      for (const t of Object.keys(pk.capacity)) if (!defs.story.transports.includes(t)) out.push({ code: 'DEFS_BAD_REF', where: `packing.capacity.${t}` });
    }
  }
  for (const [id, w] of Object.entries(defs.waves?.waves ?? {})) {
    // GAME-170: етап існує, справ ≥ 2, межа — ціле 1…WAVE_MAX_LIMIT; повну семантику (варіанти, унікальність) доводить валідатор.
    if (!ID.test(id) || w.tasks.some((t) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(t.id))) out.push({ code: 'DEFS_BAD_ID', where: id });
    if (defs.story && !Object.hasOwn(defs.story.quests, w.stage)) out.push({ code: 'DEFS_BAD_REF', where: `${id}.stage` });
    if (w.tasks.length < 2) out.push({ code: 'DEFS_BAD_AMOUNT', where: `${id}.tasks` });
    for (const t of w.tasks) {
      if (!Number.isSafeInteger(t.limitMin) || t.limitMin < 1 || t.limitMin > WAVE_MAX_LIMIT) out.push({ code: 'DEFS_BAD_AMOUNT', where: `${id}/${t.id}.limitMin` });
      if (t.animal !== undefined && defs.story && !Object.hasOwn(defs.story.animals, t.animal)) out.push({ code: 'DEFS_BAD_REF', where: `${id}/${t.id}.animal` });
      for (const f of [...t.done.effects, ...t.late.effects, ...(w.allDone?.effects ?? [])]) if (!ID.test(f)) out.push({ code: 'DEFS_BAD_ID', where: `${id}/${t.id}` });
    }
  }
  if (defs.story) {
    out.push(...checkStory(defs.story));
    // Предмет сюжету (лежить у локації, видається нагородою, потрібен квесту) не викуповується:
    // інакше продаж нагороди робить квест незавершуваним (нагорода вдруге не видається), а продаж
    // підібраного — нескінченні гроші: підняв, продав, підняв знову (рецензія GAME-29).
    const story = storyItems(defs.story);
    for (const [id, d] of Object.entries(defs.items)) if (d.sellCents !== undefined && story.has(id)) out.push({ code: 'DEFS_STORY_ITEM_SELLABLE', where: id });
    // GAME-81: те, що лежить у локації, сюжет дає безкоштовно — купівля десь інде робить «Узяти» неможливим
    // (ITEM_ALREADY_HELD), а гравець заплатив би за подарунок. Тому ціни в такого предмета немає взагалі.
    const places = defs.story.locations;
    const lying = new Set(Object.values(places).flatMap((l) => l.items));
    for (const [id, d] of Object.entries(defs.items)) if (d.buyCents !== undefined && lying.has(id)) out.push({ code: 'DEFS_STORY_ITEM_BUYABLE', where: id });
    // soldAt веде в існуючу локацію: помилка в id мовчки зробила б предмет непродаваним.
    for (const [id, d] of Object.entries(defs.items)) {
      if (d.soldAt?.some((l) => !Object.hasOwn(places, l))) out.push({ code: 'DEFS_BAD_REF', where: `${id}.soldAt` });
    }
  }
  return out;
}

export function storyItems(st: StoryDefs): Set<string> {
  const out = new Set<string>();
  for (const l of Object.values(st.locations)) for (const i of l.items) out.add(i);
  for (const q of Object.values(st.quests)) {
    for (const i of q.reward?.items ?? []) out.add(i.itemId);
    for (const i of q.requires?.items ?? []) out.add(i);
    for (const o of q.objectives) if (o.kind === 'collect') out.add(o.target);
  }
  return out;
}

/**
 * Сюжет: посилання цілі (повну перевірку досяжності робить валідатор контенту; тут — лише те, без
 * чого ядро не може працювати й мовчки дало б інший результат, ніж валідатор).
 */
function checkStory(st: StoryDefs): { code: DefsCode; where: string }[] {
  const out: { code: DefsCode; where: string }[] = [];
  const has = (o: object, k: string | undefined): boolean => k === undefined || Object.hasOwn(o, k);
  if (!Object.hasOwn(st.quests, st.start)) out.push({ code: 'DEFS_BAD_REF', where: 'story.start' });
  for (const [id, q] of Object.entries(st.quests)) {
    if (!has(st.locations, q.locationId)) out.push({ code: 'DEFS_BAD_REF', where: `${id}.locationId` });
    for (const t of q.transitions) if (!has(st.quests, t.to)) out.push({ code: 'DEFS_BAD_REF', where: `${id}→${t.to}` });
    for (const r of q.requires?.quests ?? []) if (!has(st.quests, r)) out.push({ code: 'DEFS_BAD_REF', where: `${id}.requires` });
    for (const o of q.objectives) {
      const pool = o.kind === 'visit' ? st.locations : o.kind === 'talk' ? st.npcs : null;
      if (pool && !has(pool, o.target)) out.push({ code: 'DEFS_BAD_REF', where: `${id}.${o.id}` });
    }
    if (q.reward && (!isCents(q.reward.moneyCents) || q.reward.items.some((i) => !Number.isSafeInteger(i.qty) || i.qty < 1))) out.push({ code: 'DEFS_BAD_AMOUNT', where: `${id}.reward` });
  }
  for (const [id, p] of Object.entries(st.profiles)) {
    for (const [sk, r] of Object.entries(p.startSkills ?? {})) {
      if (!isSkillId(sk)) out.push({ code: 'DEFS_BAD_REF', where: `${id}.startSkills.${sk}` });
      if (!isRank(r)) out.push({ code: 'DEFS_BAD_AMOUNT', where: `${id}.startSkills.${sk}` });
    }
  }
  for (const [id, n] of Object.entries(st.npcs)) if (!has(st.locations, n.locationId)) out.push({ code: 'DEFS_BAD_REF', where: `${id}.locationId` });
  // Одруківка в unlockedBy зачинила б локацію чи NPC назавжди — мовчки.
  for (const [id, e] of [...Object.entries(st.locations), ...Object.entries(st.npcs)]) if (!has(st.quests, e.unlockedBy)) out.push({ code: 'DEFS_BAD_REF', where: `${id}.unlockedBy` });
  for (const [i, r] of (st.roads ?? []).entries()) {
    if (!has(st.locations, r.from) || !has(st.locations, r.to)) out.push({ code: 'DEFS_BAD_REF', where: `roads[${i}]` });
    for (const [t, w] of Object.entries(r.ways)) {
      if (!st.transports.includes(t)) out.push({ code: 'DEFS_BAD_REF', where: `roads[${i}].${t}` });
      if (!isCents(w.cents) || !Number.isSafeInteger(w.minutes) || w.minutes < 1) out.push({ code: 'DEFS_BAD_AMOUNT', where: `roads[${i}].${t}` });
      if (w.risk !== undefined && (!Number.isSafeInteger(w.risk) || w.risk < 0 || w.risk > MAX_RISK)) out.push({ code: 'DEFS_BAD_AMOUNT', where: `roads[${i}].${t}.risk` });
    }
  }
  const npcsWithDialogue = new Set<string>();
  for (const [id, d] of Object.entries(st.dialogues)) {
    if ([d.npcId, d.trigger, d.scene].filter((x) => x !== undefined).length !== 1) out.push({ code: 'DEFS_BAD_REF', where: `${id}: exactly one of npcId, trigger or scene` });
    if (d.npcId !== undefined) {
      if (!has(st.npcs, d.npcId) || npcsWithDialogue.has(d.npcId)) out.push({ code: 'DEFS_BAD_REF', where: `${id}.npcId` });
      npcsWithDialogue.add(d.npcId);
    }
    if (d.trigger) {
      if (d.trigger.at.length === 0 || d.trigger.at.some((l) => !has(st.locations, l))) out.push({ code: 'DEFS_BAD_REF', where: `${id}.trigger.at` });
      if (!Number.isSafeInteger(d.trigger.chance) || d.trigger.chance < 1 || d.trigger.chance > 100) out.push({ code: 'DEFS_BAD_AMOUNT', where: `${id}.trigger.chance` });
    }
    if (!has(d.nodes, d.start)) out.push({ code: 'DEFS_BAD_REF', where: `${id}.start` });
    for (const [nid, n] of Object.entries(d.nodes)) {
      for (const next of [n.next, ...(n.choices ?? []).map((c) => c.next), ...(n.branches ?? []).map((b) => b.next)]) if (!has(d.nodes, next)) out.push({ code: 'DEFS_BAD_REF', where: `${id}/${nid}→${String(next)}` });
      if (n.branches && n.next === undefined) out.push({ code: 'DEFS_BAD_REF', where: `${id}/${nid}: branches without next` });
      for (const e of (n.choices ?? []).flatMap((c) => c.effects)) {
        // Пам'ять належить NPC розмови; у події в дорозі NPC немає — запам'ятати нікому (валідатор: EVENT_EFFECT_UNSUPPORTED).
        if ('remember' in e && d.npcId === undefined) out.push({ code: 'DEFS_BAD_REF', where: `${id}/${nid}: remember without npcId` });
        const q = 'startQuest' in e ? e.startQuest : 'completeObjective' in e ? e.completeObjective.quest : undefined;
        if (!has(st.quests, q)) out.push({ code: 'DEFS_BAD_REF', where: `${id}/${nid}: ${String(q)}` });
      }
    }
  }
  return out;
}

/** Глибоке заморожування: каталог не змінити під час гри ні з модуля, ні через подію (TL/рецензія PR #13). */
export function freezeDefs(defs: CoreDefs): CoreDefs {
  const deep = <T>(v: T): T => {
    if (v && typeof v === 'object' && !Object.isFrozen(v)) {
      for (const x of Object.values(v as object)) deep(x);
      Object.freeze(v);
    }
    return v;
  };
  return deep(structuredClone(defs));
}
