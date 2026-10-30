// GAME-175 (зріз 1) · день 1 удома — на мапі, а не в панелі.
//
// Принцип: кожен крок квесту, який можна зробити ногами, робиться на мапі (підійти → дія). Ядро не змінюється: об'єкт мапи лише
// запускає ТУ САМУ команду, що була кнопкою екрана подорожі (CompleteQuest, Pickup, Visit, PackItem…). Цей модуль — чисті функції
// без Phaser: що робить об'єкт зараз (resolveSpot), чи він живий (liveMapSpot), що панель більше не показує (coveredKeys), куди
// йти далі (nextTarget) і що написати біля об'єкта (spotLabel). Сцена й main.ts лише викликають їх.
//
// Закон «жодних тупиків»: кнопку панелі ховає ЛИШЕ ті дії, для яких на мапі зараз є ЖИВИЙ об'єкт з тією самою командою
// (coveredKeys будується з resolveSpot — прийнятих ядром ходів). Об'єкт мертвий — кнопка лишається в панелі. Тож пройти
// можна завжди: або ногами, або (як було) кнопкою. Що саме ногами — доводить map-first.test.ts повним перебором.
import { dispatch, nextCommandId, type Command } from '../core/commands';
import type { CoreDefs } from '../core/defs';
import { canonical } from '../core/hash';
import { autoPack, packFlag, packItemsFor, packedOf, packingOpen } from '../core/packing';
import type { SimState } from '../core/sim';
import type { GameState } from '../core/state';
import { matches } from '../core/story';
import type { Key } from '../i18n';
import { FIREPLACE_SCENE } from './fireplace';
import type { Move } from './moves';
import { vehicleReady } from '../view/world/proximity';

export type MapKey = 'home' | 'shop' | 'camp' | 'road';
/** Локація кожної мапи гри (властивість locationId у .tmj; звіряє map-content.test). */
export const MAP_LOCATION: Readonly<Record<MapKey, string>> = { home: 'loc.home', shop: 'loc.shop', camp: 'loc.camp.lake', road: 'loc.road' };
/** Мапи, де кроки сюжету робляться руками (зріз 1 — дім і крамниця; GAME-183 — табір і дорога). */
export const MAP_FIRST: readonly MapKey[] = ['home', 'shop', 'camp', 'road'];

/** Мапа для локації: дім, крамниця й дорога мають свої; решта — табір біля озера. Немає персонажа (вибір героя) — дім: звідти починається гра. */
export function mapKeyFor(locationId: string | null | undefined): MapKey {
  if (locationId === undefined || locationId === null || locationId === MAP_LOCATION.home) return 'home';
  if (locationId === MAP_LOCATION.shop) return 'shop';
  return locationId === MAP_LOCATION.road ? 'road' : 'camp';
}

/**
 * Об'єкти (тригери й NPC), які сюжет знає на кожній мапі. Імена — мова між .tmj і цим модулем:
 *   step.<квест>  завершити крок руками (CompleteQuest) · pack.<річ>  покласти в багажник / дістати (PackItem / UnpackItem)
 *   take.<річ>    взяти з полиці (Pickup)                · obj.vehicle  сісти в авто/на велосипед і їхати далі (Visit)
 *   obj.trunk     відкрити багажник — сітка пакування GAME-109 · npc.george  розмова (Talk)
 * Список мусить збігатися з об'єктами `objects` у public/maps/home.tmj і shop.tmj (map-first.test).
 */
export const MAP_SPOTS = {
  home: [
    'step.PROLOGUE-HOME-001', 'step.ST-001', 'step.ST-002',
    'pack.item.tent', 'pack.item.sleeping-bag', 'pack.item.water', 'pack.item.simple-dinner', 'pack.item.mia-carrier', 'pack.item.mia-bowl-food',
    'pack.item.lantern', 'pack.item.snacks', 'pack.item.mia-blanket', 'pack.item.lantern-2', 'pack.item.lantern-3', 'pack.item.big-cushion',
    'npc.george', 'obj.vehicle', 'obj.trunk',
    // GAME-183 · решта дому: справи хвилі «Виїзд о шостій», кроки поза основним шляхом, сушарка й приймальня.
    'task.mia-carrier', 'task.map-to-luggage', 'task.lights-window', 'task.anna-goodbye', 'step.ST-004', 'step.CH1-D3-HOME-001', 'obj.drying', 'obj.sell',
  ],
  // Крамниця: прилавок-«купити/продати» (рамка вибору) і сушарка біля входу.
  shop: ['take.item.tent', 'take.item.sleeping-bag', 'take.item.lantern', 'step.ST-003', 'obj.vehicle', 'obj.buy', 'obj.drying'],
  // GAME-183 · дорога — коротка смуга-сцена зі зупинками: справи хвилі, крок «У дорогу», сушарка, приймальня й авто (їхати далі — рамка вибору).
  road: [
    'task.fix-luggage', 'task.mia-water-blanket', 'task.check-route', 'task.patch-tyre', 'task.bag-covers', 'task.pick-path',
    'step.ST-004', 'step.ST-005', 'step.CH1-D3-RETURN-001', 'step.CH1-D3-HOME-001', 'obj.drying', 'obj.sell', 'obj.vehicle',
  ],
  // GAME-183 · табір: кожен крок квесту табору — об'єкт `step.<квест>` (місце — public/maps/camp-lake.tmj, scripts/maps/build_camp_lake.py CAMP_SPOTS); дрова — купа на лісовій
  // галявині; сушарка й приймальня (продаж) — біля наметів і рецепції; авто — на стоянці. Розмова з Елізою, справи хвиль, вогнище й прохання — окремі (director.ts, requests.ts).
  camp: [
    'step.ST-005', 'step.CH1-D2-001', 'step.CH1-D2-ELISE-001', 'step.q.elise-bike-area', 'step.CH1-D2-CAMP-001', 'step.CH1-D2-FIRE-001',
    'step.CH1-D3-001', 'step.CH1-D3-GEAR-001', 'step.CH1-D3-ELISE-001', 'step.CH1-D3-RETURN-001', 'step.CH1-D3-HOME-001',
    'take.item.firewood', 'obj.drying', 'obj.sell', 'obj.vehicle',
  ],
} as const satisfies Readonly<Record<MapKey, readonly string[]>>;

/** Квести табору, чиє завершення робиться ногами (GAME-183): сторож «кожен крок табору має місце на мапі» (camp-first.test) звіряє їх із content/quests.json. */
export const CAMP_STEP_QUESTS: readonly string[] = (MAP_SPOTS.camp as readonly string[]).filter((n) => n.startsWith('step.')).map((n) => n.slice(5));

/** Усі кроки квестів на мапах без дня 1 (табір, дорога, решта дому): підпис «Завершити: <назва квесту>». */
export const FINISH_QUESTS: ReadonlySet<string> = new Set((['camp', 'road', 'home'] as const).flatMap((k) => (MAP_SPOTS[k] as readonly string[]).filter((n) => n.startsWith('step.')).map((n) => n.slice(5))).filter((q) => !['PROLOGUE-HOME-001', 'ST-001', 'ST-002', 'ST-003'].includes(q)));

/** Спорядження в багажнику: те, що вдома кладуть руками (ядро автоукладає його на старті; рука лише уточнює). */
export const SPOT_PREFIX = { step: 'step.', pack: 'pack.', take: 'take.' } as const;

/**
 * Кроки дня 1, що закриваються ногами: «квест.ціль» → об'єкт мапи. Кожна ціль `visit`/`collect` цих квестів мусить мати рядок
 * тут (або явно `talkOnly`) — інакше сторож (map-first.test) червоніє. Ціль `visit loc.home` у квестах дому зараховується
 * в мить, коли квест стає активним (markHere): сам крок — завершення квесту, тож ціль — об'єкт `step.<квест>`.
 * `road-to-lake`: приїзд на дорогу — це «сісти в авто» вдома. Завершення ST-004 на дорозі (зріз 2) — ще екран подорожі.
 */
export type MapTarget = { readonly map: 'home' | 'shop'; readonly spot: string } | { readonly talkOnly: true };
export const DAY1_QUESTS = ['PROLOGUE-HOME-001', 'ST-001', 'ST-002', 'ST-003', 'CH1-HOME-001', 'ST-004'] as const;
export const DAY1_TARGETS: Readonly<Record<string, MapTarget>> = {
  'PROLOGUE-HOME-001.look-around': { map: 'home', spot: 'step.PROLOGUE-HOME-001' },
  'ST-001.free-night': { map: 'home', spot: 'step.ST-001' },
  'ST-002.pick-campsite': { map: 'home', spot: 'step.ST-002' },
  'ST-003.visit-shop': { map: 'home', spot: 'obj.vehicle' },
  'ST-003.get-tent': { map: 'shop', spot: 'take.item.tent' },
  'ST-003.get-sleeping-bag': { map: 'shop', spot: 'take.item.sleeping-bag' },
  'ST-003.get-lantern': { map: 'shop', spot: 'take.item.lantern' },
  'CH1-HOME-001.pack-at-home': { map: 'shop', spot: 'obj.vehicle' },
  'ST-004.road-to-lake': { map: 'home', spot: 'obj.vehicle' },
  'ST-004.cat-on-road': { map: 'home', spot: 'obj.vehicle' },
};

/**
 * Сторож контенту (GAME-175, закон 1 — мусить уміти червоніти): кожна ціль `visit`/`collect` квестів дня 1 має об'єкт мапи (існує в MAP_SPOTS своєї мапи)
 * або явно `talkOnly`; зайвих рядків у таблиці немає. Порожньо — гаразд. Квести беруться з content/quests.json (форма RawQuest), таблиця й об'єкти — параметрами,
 * щоб тест міг дати зламані.
 */
export function targetProblems(
  quests: readonly { id: string; objectives: readonly { id: string; kind: string }[] }[],
  targets: Readonly<Record<string, MapTarget>>,
  spots: Readonly<Record<'home' | 'shop', readonly string[]>>,
  day1: readonly string[] = DAY1_QUESTS,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of day1) {
    const q = quests.find((x) => x.id === id);
    if (!q) { out.push(`NO_MAP_QUEST ${id}: day-1 quest missing from content`); continue; }
    for (const o of q.objectives) {
      if (o.kind !== 'visit' && o.kind !== 'collect') continue;
      const key = `${id}.${o.id}`;
      seen.add(key);
      const t = Object.hasOwn(targets, key) ? targets[key] : undefined;
      if (!t) out.push(`NO_MAP_TARGET ${key}: ${o.kind} objective has no map object and is not talk-only`);
      else if ('spot' in t && !(spots[t.map] as readonly string[]).includes(t.spot)) out.push(`MAP_TARGET_UNKNOWN ${key}: object ${t.spot} not on map ${t.map}`);
    }
  }
  for (const key of Object.keys(targets)) if (!seen.has(key)) out.push(`MAP_TARGET_ORPHAN ${key}: table row has no visit/collect objective in day-1 quests`);
  return out;
}

/**
 * Сторож контенту (GAME-183, закон 1 — мусить уміти червоніти): кожен крок квесту табору має об'єкт `step.<квест>` у MAP_SPOTS.camp І на мапі табору, кожен об'єкт списку
 * є на мапі, зайвих кроків немає. Квести — з content/quests.json (форма RawQuest), список і назви об'єктів — параметрами, щоб тест міг дати зламані. Порожньо — гаразд.
 */
export function campStepProblems(quests: readonly { id: string; locationId?: string }[], spots: readonly string[], onMap: readonly string[], steps: readonly string[] = CAMP_STEP_QUESTS): string[] {
  const out: string[] = [];
  for (const q of quests) {
    // Крок табору — квест із локацією табору й квест із переліку (D3-RETURN-001 має локацію «дорога», але його завершують у таборі, якщо гравець повернувся).
    const isStep = q.locationId === MAP_LOCATION.camp || steps.includes(q.id);
    if (!isStep) continue;
    if (!spots.includes(`step.${q.id}`)) out.push(`NO_CAMP_SPOT ${q.id}: quest step has no step.${q.id} in MAP_SPOTS.camp`);
    else if (!onMap.includes(`step.${q.id}`)) out.push(`CAMP_SPOT_NOT_ON_MAP ${q.id}: step.${q.id} is not an object on camp-lake.tmj`);
  }
  for (const n of spots) {
    if (!onMap.includes(n)) out.push(`CAMP_SPOT_NOT_ON_MAP ${n}: MAP_SPOTS.camp object is not on camp-lake.tmj`);
    if (n.startsWith('step.') && !quests.some((q) => q.id === n.slice(5))) out.push(`CAMP_SPOT_ORPHAN ${n}: no such quest in content`);
  }
  return out;
}

/** Ключ дії для звірки «ця кнопка панелі = цей хід мапи»: тип і ціль (CompleteQuest без/з `to` — одна дія). */
export function moveKey(m: Move): string {
  const r = m as unknown as Record<string, unknown>;
  return `${m.type}|${String(r.questId ?? r.locationId ?? r.itemId ?? r.npcId ?? r.taskId ?? '')}`;
}

/**
 * Що робить об'єкт: ходи ядра (по порядку) і/або відкрити багажник. `options` (GAME-183) — об'єкт пропонує ВИБІР однієї з дій (куди їхати, що сушити,
 * як завершити крок): сцена показує маленьку рамку вибору в рамці розмови замість ☰, `moves` тоді порожній. Один варіант вибору не буває — це просто `moves`.
 */
export interface Resolved { readonly moves: readonly Move[]; readonly ui?: 'trunk'; readonly options?: readonly Move[]; readonly confirm?: true }
// GAME-185: `confirm` — одна поїздка авто (можливо ланцюг ходів): мапа питає «Куди їдемо?» з єдиною відповіддю й «Не зараз», а не їде від дотику повз авто.

const asCommand = (g: GameState, m: Move): Command => ({ ...m, commandId: nextCommandId(g) }) as Command;
/** Хід, який ядро прийме, → наступний стан; інакше null. */
function accepted(g: GameState, defs: CoreDefs, m: Move): GameState | null {
  const r = dispatch(g, asCommand(g, m), defs);
  return r.ok ? r.state : null;
}
/** Усі ходи по черзі приймає ядро (кожен — на стані після попереднього). */
function chain(g: GameState, defs: CoreDefs, moves: readonly Move[]): boolean {
  let s: GameState | null = g;
  for (const m of moves) { s = s && accepted(s, defs, m); if (!s) return false; }
  return true;
}

const own = <T>(o: Readonly<Record<string, T>>, k: string): T | undefined => (Object.hasOwn(o, k) ? o[k] : undefined);
const active = (g: GameState, q: string): boolean => own(g.quests, q)?.status === 'active';

const ROAD = 'loc.road';
/** Усі дороги, які ядро зараз приймає звідси (куди можна поїхати): порядок — дорога, дім, крамниця, табір. */
const openVisits = (g: GameState, defs: CoreDefs): Move[] =>
  [ROAD, MAP_LOCATION.home, MAP_LOCATION.shop, MAP_LOCATION.camp].map((locationId): Move => ({ type: 'Visit', locationId })).filter((m) => accepted(g, defs, m) !== null && (m as { locationId: string }).locationId !== g.player?.locationId);

/**
 * Куди везе авто (велосипед) звідси зараз: ходи однієї ведучої дії (сюжет каже, куди) або вибір із відкритих напрямків (GAME-183 — «Куди їдемо?»); null — нікуди.
 * Ведуча дія не питає (як було в зрізі 1): авто просто їде туди, куди веде квест. Вільний вибір є там, де квест не веде: удома поза сюжетом і в таборі (там навіть «додому» — вибір: дорога, дім чи крамниця, стрілка вказує на авто).
 */
function vehicleMoves(g: GameState, defs: CoreDefs): { moves: Move[]; options?: Move[] } | null {
  const p = g.player;
  if (!p) return null;
  if (p.locationId === MAP_LOCATION.shop) return { moves: [{ type: 'Visit', locationId: MAP_LOCATION.home }] };
  if (p.locationId === MAP_LOCATION.home) {
    // Дім: ST-003 (крамниця) → поїхали по спорядження; CH1-HOME-001 — завершити «Ми точно все взяли?» і виїхати; далі — на дорогу.
    if (active(g, 'ST-003')) return { moves: [{ type: 'Visit', locationId: MAP_LOCATION.shop }] };
    if (active(g, 'CH1-HOME-001')) return { moves: [{ type: 'CompleteQuest', questId: 'CH1-HOME-001' }, { type: 'Visit', locationId: ROAD }] };
  }
  if (p.locationId === MAP_LOCATION.road) {
    // Дорога: приїхали на місце — квест веде до табору (ST-005) чи додому (CH1-D3-HOME-001) і більше нікуди; інакше вибір із відкритих.
    // GAME-185: поки активний ST-004, авто везе ВПЕРЕД: завершує «У дорогу» й їде до табору (назад — дім чи крамниця — губить хвилю: там вибору немає).
    if (active(g, 'ST-004') && chain(g, defs, [{ type: 'CompleteQuest', questId: 'ST-004' }, { type: 'Visit', locationId: MAP_LOCATION.camp }])) return { moves: [{ type: 'CompleteQuest', questId: 'ST-004' }, { type: 'Visit', locationId: MAP_LOCATION.camp }] };
    const lead = active(g, 'ST-005') ? MAP_LOCATION.camp : active(g, 'CH1-D3-HOME-001') ? MAP_LOCATION.home : null;
    const m: Move | null = lead === null ? null : { type: 'Visit', locationId: lead };
    if (m && accepted(g, defs, m)) return { moves: [m] };
  }
  if (p.locationId !== MAP_LOCATION.home && p.locationId !== MAP_LOCATION.camp && p.locationId !== MAP_LOCATION.road) return null;
  const open = openVisits(g, defs);
  if (open.length === 0) return null;
  return open.length === 1 ? { moves: open } : { moves: [], options: open };
}

/** Варіанти завершення кроку: «Завершити» без вибору, з кожним вибором переходу, «Відмовитись» — лише ті, що ядро приймає, без дублів за наслідком (GAME-183). */
function stepVariants(g: GameState, defs: CoreDefs, questId: string): Move[] {
  const tos = (defs.story?.quests[questId]?.transitions ?? []).map((t) => t.to);
  const out: Move[] = [];
  const seen = new Set<string>();
  for (const type of ['CompleteQuest', 'DeclineQuest'] as const) {
    for (const to of [undefined, ...tos]) {
      const m: Move = to === undefined ? { type, questId } : { type, questId, to };
      const next = accepted(g, defs, m);
      if (!next) continue;
      const k = `${type}|${canonical({ q: next.quests, f: next.flags, i: next.inventory, m: next.moneyCents })}`;   // наслідок — не лише квести: перехід, що міняє лише прапорці, теж окремий вибір
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(m);
    }
  }
  return out;
}

/** Ходи, які ядро приймає й які міняють стан: для сушарки (DryGear) і приймальні (SellItem). */
const acceptedOf = (g: GameState, defs: CoreDefs, list: readonly Move[]): Move[] => list.filter((m) => accepted(g, defs, m) !== null);

const choice = (list: readonly Move[]): Resolved | null => (list.length === 0 ? null : list.length === 1 ? { moves: list } : { moves: [], options: list });

const memo = new WeakMap<GameState, Map<string, Resolved | null>>();

/** Сцену біля вогнища вже грали (запис StartScene у журналі): лише тоді вогнище завершує вечір (GAME-183). */
const firePlayed = (sim: SimState): boolean => sim.journal.some((e) => e.type === 'StartScene' && e.ref === FIREPLACE_SCENE);

function compute(sim: SimState, defs: CoreDefs, name: string): Resolved | null {
  const g = sim.game;
  const p = g.player;
  if (!p) return null;
  if (name.startsWith(SPOT_PREFIX.step)) {
    const questId = name.slice(SPOT_PREFIX.step.length);
    if (!active(g, questId)) return null;
    // Вечір дня 2: сцена біля вогнища — ПЕРШЕ (obj.campfire, director.ts), завершення — те саме вогнище, коли сцену зіграно.
    if (questId === 'CH1-D2-FIRE-001' && !firePlayed(sim)) return null;
    return choice(stepVariants(g, defs, questId));
  }
  if (name.startsWith('task.')) {
    // Справа хвилі на мапі (дім, дорога): та сама команда, що була кнопкою екрана подорожі; живе, поки справа відкрита й строк не минув.
    const taskId = name.slice(5);
    const t = g.wave?.active?.tasks[taskId];
    const m: Move = { type: 'CompleteTask', taskId };
    // Ядро звіряє строк за годинником симуляції (`now`): без нього CompleteTask — INVALID_COMMAND.
    return t !== undefined && t.outcome === 'open' && sim.clock.minutes <= t.dueAt && dispatch(g, asCommand(g, m), defs, undefined, undefined, undefined, sim.clock.minutes).ok ? { moves: [m] } : null;
  }
  if (name === 'obj.buy') {
    // GAME-185: прилавок ЗАВЖДИ питає «Що беремо?» (навіть з одним варіантом) і живий, поки є що купити хоч би й на недостатні гроші: недоступні рядки з причиною додає storyOffer.
    const list = acceptedOf(g, defs, Object.keys(defs.items).flatMap((itemId): Move[] => [{ type: 'BuyItem', itemId }, { type: 'SellItem', itemId }]));
    const short = Object.keys(defs.items).some((itemId) => { const r = dispatch(g, asCommand(g, { type: 'BuyItem', itemId }), defs); return !r.ok && r.code === 'INSUFFICIENT_FUNDS'; });
    return list.length === 0 && !short ? null : { moves: [], options: list };
  }
  if (name === 'obj.drying') return choice(acceptedOf(g, defs, Object.entries(g.gear).filter(([, x]) => x.wet).map(([itemId]): Move => ({ type: 'DryGear', itemId }))));
  if (name === 'obj.sell') return choice(acceptedOf(g, defs, Object.keys(defs.items).map((itemId): Move => ({ type: 'SellItem', itemId }))));
  if (name.startsWith(SPOT_PREFIX.take)) {
    const moves: Move[] = [{ type: 'Pickup', itemId: name.slice(SPOT_PREFIX.take.length) }];
    return chain(g, defs, moves) ? { moves } : null;
  }
  if (name.startsWith(SPOT_PREFIX.pack)) {
    const pk = defs.packing;
    const itemId = name.slice(SPOT_PREFIX.pack.length);
    if (!pk || !packingOpen(pk, g) || !packItemsFor(pk, p).some((i) => i.itemId === itemId)) return null;
    const packed = g.flags.includes(packFlag(itemId));
    const move: Move = { type: packed ? 'UnpackItem' : 'PackItem', itemId };
    // Не вміщається (PACK_FULL) — об'єкт живий, але дія веде до багажника: сітка скаже, чому, і що можна дістати.
    return chain(g, defs, [move]) ? { moves: [move] } : { moves: [], ui: 'trunk' };
  }
  if (name === 'obj.trunk') {
    const pk = defs.packing;
    return pk && packingOpen(pk, g) ? { moves: [], ui: 'trunk' } : null;
  }
  if (name === 'obj.vehicle') {
    const v = vehicleMoves(g, defs);
    if (!v) return null;
    if (v.options) return { moves: [], options: v.options };
    return chain(g, defs, v.moves) ? { moves: v.moves, confirm: true } : null;
  }
  return null;
}

/** Що робить об'єкт мапи зараз; null — нічого (мертвий). Лише для мап зрізу 1 і лише коли гравець у їхній локації, без розмови. */
export function resolveSpot(sim: SimState, defs: CoreDefs, name: string): Resolved | null {
  const g = sim.game;
  const p = g.player;
  if (!p || g.dialogue !== null || g.campaignEnded) return null;
  const map = mapKeyFor(p.locationId);
  if (!(MAP_SPOTS[map] as readonly string[]).includes(name) || p.locationId !== MAP_LOCATION[map]) return null;
  let byName = memo.get(g);
  if (!byName) { byName = new Map(); memo.set(g, byName); }
  if (!name.startsWith('task.') && byName.has(name)) return byName.get(name) ?? null;   // справи хвилі залежать від годинника, якого немає в GameState — без кешу
  const r = compute(sim, defs, name);
  byName.set(name, r);
  return r;
}

/** NPC зрізу на мапі: тут живе, умова профілю виконана, відкритий. */
export function npcLive(g: GameState, defs: CoreDefs, id: string): boolean {
  const p = g.player;
  const npc = defs.story ? own(defs.story.npcs, id) : undefined;
  return !!p && !!npc && g.dialogue === null && npc.locationId === p.locationId && matches(npc.when, p)
    && (npc.unlockedBy === undefined || own(g.quests, npc.unlockedBy)?.status === 'completed');
}

/** Чи об'єкт мапи зрізу 1 зараз видимий і діє. */
export function liveMapSpot(sim: SimState, defs: CoreDefs, name: string): boolean {
  const p = sim.game.player;
  if (!p) return false;
  const map = mapKeyFor(p.locationId);
  if (!(MAP_SPOTS[map] as readonly string[]).includes(name)) return false;
  return name.startsWith('npc.') ? npcLive(sim.game, defs, name) : resolveSpot(sim, defs, name) !== null;
}

/** Чи назва — об'єкт зрізу 1 (на будь-якій з двох мап): їх веде цей модуль, решту — режисер хвиль (director.ts). */
export const isMapFirstSpot = (name: string): boolean => MAP_FIRST.some((k) => (MAP_SPOTS[k] as readonly string[]).includes(name));

const coveredMemo = new WeakMap<GameState, Set<string>>();
/**
 * Дії панелі, які мапа вже дає руками (ключі moveKey): панель їх НЕ показує. Лише живі об'єкти й лише в локаціях зрізу 1.
 * Чесність: ключ є тільки там, де ядро справді прийме хід, — тож кнопка не зникає без заміни.
 */
export function coveredKeys(sim: SimState, defs: CoreDefs): ReadonlySet<string> {
  const g = sim.game;
  const hit = coveredMemo.get(g);
  if (hit) return hit;
  const out = new Set<string>();
  const p = g.player;
  const map = mapKeyFor(p?.locationId);
  // Дорога мапи не має (її малює табір), тож покриває лише гравець у локації своєї мапи.
  if (p && p.locationId === MAP_LOCATION[map] && g.dialogue === null) {
    for (const name of MAP_SPOTS[map] as readonly string[]) {
      if (name.startsWith('npc.')) { if (npcLive(g, defs, name)) out.add(`Talk|npc.${name.slice(4)}`); continue; }
      if (name.startsWith(SPOT_PREFIX.pack)) continue;   // пакування — не серед меню панелі (ходи PackItem/UnpackItem з сітки багажника)
      const r = resolveSpot(sim, defs, name);
      for (const m of [...(r?.moves ?? []), ...(r?.options ?? [])]) out.add(moveKey(m));
      // Авто живе — усі відкриті дороги звідси покриті ним (веде квест — одна ціль, ні — вибір; решта «Піти:» не лишається кнопками ☰).
      if (name === 'obj.vehicle' && r) for (const m of openVisits(g, defs)) out.add(moveKey(m));
    }
    // Квест, чий крок стоїть на мапі ІНШОЇ локації (виїхали з табору посеред дня): завершується там, де він живе, — авто туди повертає (vehicleMoves), тож тут кнопка не потрібна.
    for (const [qid, q] of Object.entries(g.quests)) {
      const at = q.status === 'active' ? defs.story?.quests[qid]?.locationId : undefined;
      if (at === undefined || at === p.locationId) continue;
      const there = (Object.keys(MAP_LOCATION) as MapKey[]).find((k) => MAP_LOCATION[k] === at);
      if (there && (MAP_SPOTS[there] as readonly string[]).includes(`step.${qid}`)) { out.add(`CompleteQuest|${qid}`); out.add(`DeclineQuest|${qid}`); }
    }
    if (map === 'camp') {
      // Розмова з Елізою — NPC табору на мапі (рамка розмови): та сама дія, що кнопка «Поговорити».
      if (npcLive(g, defs, 'npc.elise')) out.add('Talk|npc.elise');
      // Вогнище дня 2: сцена, потім завершення вечора — обидва в одного вогнища (director.spotMove), тож кнопка завершення мапою покрита й до сцени.
      if (active(g, 'CH1-D2-FIRE-001')) out.add('CompleteQuest|CH1-D2-FIRE-001');
    }
  }
  coveredMemo.set(g, out);
  return out;
}

/** Підказка «Далі: …» і об'єкт, на який вона вказує (null — вказувати нікуди, лише слова). */
export interface Next { readonly key: Key; readonly spot: string | null }

const quest = (g: GameState, q: string): boolean => active(g, q);
const objDone = (g: GameState, q: string, o: string): boolean => own(g.quests, q)?.done.includes(o) ?? false;

/**
 * GAME-183 · табір: стрілка й рядок «Далі:» ЗАВЖДИ ведуть до наступної цілі на мапі — а не до ☰. Спершу справи живої хвилі (строк горить), далі — крок головного квесту:
 * розмова з Елізою, купа дров, намет, берег озера, вогнище, авто. Квест без кроку на мапі табору — null (кінець розділу тощо); сторож camp-first.test доводить, що в жодному
 * досяжному стані табору розділ не лишається без цілі.
 */
/** Перша відкрита справа живої хвилі, чий об'єкт стоїть на цій мапі (строк горить — вона перша). */
function waveTask(sim: SimState, map: MapKey): string | null {
  const w = sim.game.wave?.active;
  if (!w) return null;
  const spots = MAP_SPOTS[map] as readonly string[];
  const open = Object.entries(w.tasks).find(([id, t]) => t.outcome === 'open' && sim.clock.minutes <= t.dueAt && spots.includes(`task.${id}`));
  return open ? `task.${open[0]}` : null;
}

/** GAME-183 · дорога: справи зупинки, крок «У дорогу» чи «Дорога додому», далі — авто (їхати далі). Стрілка завжди на живу ціль смуги. */
function roadNext(sim: SimState, defs: CoreDefs): Next | null {
  void defs;
  const g = sim.game;
  const task = waveTask(sim, 'road');
  if (task) return { key: 'next.road.task', spot: task };
  if (quest(g, 'ST-004')) return { key: 'next.road.step', spot: 'step.ST-004' };
  if (quest(g, 'CH1-D3-RETURN-001')) return { key: 'next.road.step', spot: 'step.CH1-D3-RETURN-001' };
  return { key: 'next.road.go', spot: 'obj.vehicle' };
}

function campNext(sim: SimState, defs: CoreDefs): Next | null {
  const g = sim.game;
  const w = g.wave?.active;
  const stage = w ? defs.waves?.waves[w.waveId]?.stage : undefined;
  if (w && stage !== undefined && own(defs.story?.quests ?? {}, stage)?.locationId === MAP_LOCATION.camp) {
    const open = Object.entries(w.tasks).find(([, t]) => t.outcome === 'open' && sim.clock.minutes <= t.dueAt);
    if (open) return { key: 'next.camp.task', spot: `task.${open[0]}` };
  }
  const tent = (id: string): Next => ({ key: 'next.camp.tent', spot: `step.${id}` });
  const elise = (id: string, o: string): Next => (objDone(g, id, o) ? { key: 'next.camp.elise.done', spot: `step.${id}` } : { key: 'next.camp.elise', spot: 'npc.elise' });
  if (quest(g, 'ST-005')) {
    if (!objDone(g, 'ST-005', 'meet-elise') || !objDone(g, 'ST-005', 'pitch-tent')) return { key: 'next.camp.elise', spot: 'npc.elise' };
    if (!g.inventory['item.firewood']) return { key: 'next.camp.firewood', spot: 'take.item.firewood' };
    return tent('ST-005');
  }
  if (quest(g, 'CH1-D2-001')) return { key: 'next.camp.lake', spot: 'step.CH1-D2-001' };
  if (quest(g, 'CH1-D2-ELISE-001')) return elise('CH1-D2-ELISE-001', 'talk-elise');
  if (quest(g, 'q.elise-bike-area')) return elise('q.elise-bike-area', 'talk-elise');
  if (quest(g, 'CH1-D2-CAMP-001')) return objDone(g, 'CH1-D2-CAMP-001', 'dinner') ? tent('CH1-D2-CAMP-001') : { key: 'next.camp.elise', spot: 'npc.elise' };
  if (quest(g, 'CH1-D2-FIRE-001')) return { key: 'next.camp.fire', spot: firePlayed(sim) ? 'step.CH1-D2-FIRE-001' : 'obj.campfire' };
  if (quest(g, 'CH1-D3-001')) return tent('CH1-D3-001');
  if (quest(g, 'CH1-D3-GEAR-001')) return tent('CH1-D3-GEAR-001');
  if (quest(g, 'CH1-D3-ELISE-001')) return elise('CH1-D3-ELISE-001', 'goodbye');
  // Дорога додому: повернувся в табір посеред неї (або на кінцевий квест) — знову до авто.
  if (quest(g, 'CH1-D3-HOME-001') && objDone(g, 'CH1-D3-HOME-001', 'home')) return { key: 'next.camp.finish', spot: 'step.CH1-D3-HOME-001' };   // «Знову вдома» вже зараховано (був удома), а гравець у таборі — крок завершується тут
  if (quest(g, 'CH1-D3-RETURN-001') || quest(g, 'CH1-D3-HOME-001')) return { key: 'next.camp.leave', spot: 'obj.vehicle' };
  return null;
}

/**
 * Що робити далі (рядок «Далі:» над мапою і підсвічений об'єкт). null — підказки немає (розмова, кінець розділу, мапа не зрізу 1).
 * Дорога (зріз 2): єдина підказка — відкрити ☰, бо там її кроки ще кнопками.
 */
export function nextTarget(sim: SimState, defs: CoreDefs, carried: readonly string[] = []): Next | null {
  const g = sim.game;
  const p = g.player;
  if (!p || g.dialogue !== null || g.campaignEnded) return null;
  const car = p.transportId === 'transport.car';
  if (p.locationId === MAP_LOCATION.road) return roadNext(sim, defs);
  if (p.locationId === MAP_LOCATION.camp) return campNext(sim, defs);
  if (p.locationId === MAP_LOCATION.shop) {
    if (quest(g, 'ST-003')) {
      if (!g.inventory['item.tent']) return { key: 'next.take-tent', spot: 'take.item.tent' };
      if (!g.inventory['item.sleeping-bag']) return { key: 'next.take-bag', spot: 'take.item.sleeping-bag' };
      return { key: 'next.pay', spot: 'step.ST-003' };
    }
    return { key: 'next.back-home', spot: 'obj.vehicle' };
  }
  if (p.locationId !== MAP_LOCATION.home) return null;
  if (quest(g, 'CH1-D3-HOME-001')) return { key: 'next.home.end', spot: 'step.CH1-D3-HOME-001' };
  if (quest(g, 'PROLOGUE-HOME-001')) return { key: 'next.prologue-home-001', spot: 'step.PROLOGUE-HOME-001' };
  if (quest(g, 'ST-001')) return { key: 'next.st-001', spot: 'step.ST-001' };
  if (quest(g, 'ST-002')) return { key: 'next.st-002', spot: 'step.ST-002' };
  if (quest(g, 'ST-003')) return { key: car ? 'next.go-shop.car' : 'next.go-shop.bike', spot: 'obj.vehicle' };
  // Пакування: «потрібне» ще не в багажнику (рукою дістали) — до нього; усе на місці — у дорогу.
  const pk = defs.packing;
  if (quest(g, 'CH1-HOME-001') && pk && packingOpen(pk, g)) {
    if (carried.length > 0) return { key: car ? 'next.unload' : 'next.unload.bike', spot: 'obj.vehicle' };   // рюкзак повний — до авто, розвантажити
    const missing = packItemsFor(pk, p).find((i) => i.group === 'needed' && !g.flags.includes(packFlag(i.itemId)) && !carried.includes(i.itemId));
    if (missing) return { key: car ? 'next.pack' : 'next.pack.bike', spot: `pack.${missing.itemId}` };
  }
  return { key: car ? 'next.depart.car' : 'next.depart.bike', spot: 'obj.vehicle' };
}

/** Підпис дії біля об'єкта: ключ UI і (для речі чи NPC) id сутності, назву якої додає екран. null — об'єкт нічого не робить. */
export interface SpotLabel { readonly label: Key; readonly ref: string | null }

export function spotLabel(sim: SimState, defs: CoreDefs, name: string): SpotLabel | null {
  const p = sim.game.player;
  if (!p || !liveMapSpot(sim, defs, name)) return null;
  const car = p.transportId === 'transport.car';
  if (name.startsWith(SPOT_PREFIX.step)) {
    const q = name.slice(SPOT_PREFIX.step.length);
    // Табір (GAME-183): один підпис «Завершити: <назва квесту>»; удома — власні підписи кроків дня 1.
    return FINISH_QUESTS.has(q) ? { label: 'near.finish', ref: q } : { label: `near.step.${q.toLowerCase()}` as Key, ref: null };
  }
  if (name === 'obj.drying') return { label: 'near.dry', ref: null };
  if (name === 'obj.sell') return { label: 'near.sell', ref: null };
  if (name === 'obj.buy') return { label: 'near.buy', ref: null };
  if (name.startsWith(SPOT_PREFIX.take)) return { label: 'act.pickup', ref: name.slice(SPOT_PREFIX.take.length) };
  if (name.startsWith(SPOT_PREFIX.pack)) {
    const itemId = name.slice(SPOT_PREFIX.pack.length);
    return { label: sim.game.flags.includes(packFlag(itemId)) ? 'pack.out' : 'pack.in', ref: itemId };
  }
  if (name === 'obj.trunk') return { label: car ? 'near.trunk' : 'near.trunk.bike', ref: null };
  if (name === 'obj.vehicle') return { label: car ? 'near.vehicle.car' : 'near.vehicle.bike', ref: null };
  if (name.startsWith('npc.')) return { label: 'act.talk', ref: name };
  return null;
}

/** Вигляд об'єкта-речі: лежить удома чи вже в багажнику (маркер на мапі міняє колір). */
export function spotLook(sim: SimState, name: string): 'room' | 'trunk' {
  return name.startsWith(SPOT_PREFIX.pack) && sim.game.flags.includes(packFlag(name.slice(SPOT_PREFIX.pack.length))) ? 'trunk' : 'room';
}

/** Громіздка річ (місце ≥ 2: намет, спальник, переноска) іде одразу в багажник; дрібна (1) — у рюкзак героя, а в авто її розвантажують біля машини. */
export function isBulky(defs: CoreDefs, itemId: string): boolean {
  return (defs.packing?.items.find((i) => i.itemId === itemId)?.units ?? 1) >= 2;
}

/** Що ще потрібне в дорогу (група «потрібне», ще не в багажнику й не в рюкзаку) — для бульбашок над авто. Порожньо поза пакуванням. */
export function needsLeft(sim: SimState, defs: CoreDefs, carried: readonly string[] = []): string[] {
  const g = sim.game;
  const p = g.player;
  const pk = defs.packing;
  if (!p || !pk || !packingOpen(pk, g) || !active(g, 'CH1-HOME-001')) return [];
  return packItemsFor(pk, p).filter((i) => i.group === 'needed' && !g.flags.includes(packFlag(i.itemId)) && !carried.includes(i.itemId)).map((i) => i.itemId);
}

/** Чому авто зараз не рушає: рюкзак не порожній або потрібне ще не в багажнику. null — можна їхати (чи пакування не стосується цієї поїздки). */
export type DepartBlock = { readonly kind: 'carry' } | { readonly kind: 'missing'; readonly items: readonly string[] };

/**
 * GAME-178: єдине джерело істини для «чи готове до дороги» — те саме vehicleReady, що тримає кільце біля авто (scene.ts). E/тап на авто (рамка «Куди їдемо?»)
 * перед відправленням питає сюди ж: інакше ця стежка їхала б з речами на полицях чи в рюкзаку (ядро автоспакування на ній не робить).
 */
export function departBlock(sim: SimState, defs: CoreDefs, carried: readonly string[] = []): DepartBlock | null {
  const left = needsLeft(sim, defs, carried);
  if (vehicleReady(carried.length > 0, { small: left.length, bulky: 0 })) return null;
  return carried.length > 0 ? { kind: 'carry' } : { kind: 'missing', items: left };
}

/**
 * Пакування ходьбою: ядро на старті вважає все «спакованим як радить гра» (GAME-109), тож удома нічого було б носити. Коли гравець повернувся з крамниці
 * і пакування відкрилось, а набір ще точно дорівнює порадженому (ніхто не торкався) — розкладаємо його назад по місцях: ті самі команди UnpackItem, що
 * знімають річ з багажника. Далі речі треба знову віднести ногами. Порожньо, коли не вдома, не ця справа чи набір уже змінено.
 */
export function unpackMoves(sim: SimState, defs: CoreDefs): Move[] {
  const g = sim.game;
  const p = g.player;
  const pk = defs.packing;
  if (!p || !pk || p.locationId !== MAP_LOCATION.home || !quest(g, 'CH1-HOME-001') || !packingOpen(pk, g)) return [];
  const have = packedOf(g.flags, pk, p);
  const want = autoPack(pk, p);
  if (have.length === 0 || have.length !== want.length || !have.every((i) => want.includes(i))) return [];
  return have.map((itemId) => ({ type: 'UnpackItem' as const, itemId }));
}
