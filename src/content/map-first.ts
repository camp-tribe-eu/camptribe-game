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
import { packFlag, packItemsFor, packingOpen } from '../core/packing';
import type { SimState } from '../core/sim';
import type { GameState } from '../core/state';
import { matches } from '../core/story';
import type { Key } from '../i18n';
import type { Move } from './moves';

export type MapKey = 'home' | 'shop' | 'camp';
/** Локація кожної мапи гри (властивість locationId у .tmj; звіряє map-content.test). */
export const MAP_LOCATION: Readonly<Record<MapKey, string>> = { home: 'loc.home', shop: 'loc.shop', camp: 'loc.camp.lake' };
/** Мапи, де кроки сюжету робляться руками (зріз 1). Дорога й табір — наступні зрізи: там усе, як було. */
export const MAP_FIRST: readonly MapKey[] = ['home', 'shop'];

/** Мапа для локації: дім і крамниця мають свої; решта (дорога, табір) — табір біля озера. Немає персонажа (вибір героя) — дім: звідти починається гра. */
export function mapKeyFor(locationId: string | null | undefined): MapKey {
  if (locationId === undefined || locationId === null || locationId === MAP_LOCATION.home) return 'home';
  return locationId === MAP_LOCATION.shop ? 'shop' : 'camp';
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
  ],
  shop: ['take.item.tent', 'take.item.sleeping-bag', 'take.item.lantern', 'step.ST-003', 'obj.vehicle'],
} as const satisfies Readonly<Record<'home' | 'shop', readonly string[]>>;

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
    if (!q) { out.push(`NO_MAP_QUEST ${id}: квесту дня 1 немає в контенті`); continue; }
    for (const o of q.objectives) {
      if (o.kind !== 'visit' && o.kind !== 'collect') continue;
      const key = `${id}.${o.id}`;
      seen.add(key);
      const t = Object.hasOwn(targets, key) ? targets[key] : undefined;
      if (!t) out.push(`NO_MAP_TARGET ${key}: ціль ${o.kind} без об'єкта мапи й без «лише розмова»`);
      else if ('spot' in t && !(spots[t.map] as readonly string[]).includes(t.spot)) out.push(`MAP_TARGET_UNKNOWN ${key}: об'єкта ${t.spot} немає на мапі ${t.map}`);
    }
  }
  for (const key of Object.keys(targets)) if (!seen.has(key)) out.push(`MAP_TARGET_ORPHAN ${key}: рядок таблиці без цілі visit/collect у квестах дня 1`);
  return out;
}

/** Ключ дії для звірки «ця кнопка панелі = цей хід мапи»: тип і ціль (CompleteQuest без/з `to` — одна дія). */
export function moveKey(m: Move): string {
  const r = m as unknown as Record<string, unknown>;
  return `${m.type}|${String(r.questId ?? r.locationId ?? r.itemId ?? r.npcId ?? '')}`;
}

/** Що робить об'єкт: ходи ядра (по порядку) і/або відкрити багажник. */
export interface Resolved { readonly moves: readonly Move[]; readonly ui?: 'trunk' }

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

/** Куди везе авто (велосипед) звідси зараз і які ходи для цього треба; null — нікуди. */
function vehicleMoves(g: GameState, defs: CoreDefs): Move[] | null {
  const p = g.player;
  if (!p) return null;
  if (p.locationId === MAP_LOCATION.shop) return [{ type: 'Visit', locationId: MAP_LOCATION.home }];
  if (p.locationId !== MAP_LOCATION.home) return null;
  // Дім: ST-003 (крамниця) → поїхали по спорядження; CH1-HOME-001 — завершити «Ми точно все взяли?» і виїхати; далі — на дорогу.
  if (active(g, 'ST-003')) return [{ type: 'Visit', locationId: MAP_LOCATION.shop }];
  if (active(g, 'CH1-HOME-001')) return [{ type: 'CompleteQuest', questId: 'CH1-HOME-001' }, { type: 'Visit', locationId: 'loc.road' }];
  const road: Move = { type: 'Visit', locationId: 'loc.road' };
  return accepted(g, defs, road) ? [road] : null;
}

const memo = new WeakMap<GameState, Map<string, Resolved | null>>();

function compute(g: GameState, defs: CoreDefs, name: string): Resolved | null {
  const p = g.player;
  if (!p) return null;
  if (name.startsWith(SPOT_PREFIX.step)) {
    const moves: Move[] = [{ type: 'CompleteQuest', questId: name.slice(SPOT_PREFIX.step.length) }];
    return active(g, (moves[0] as { questId: string }).questId) && chain(g, defs, moves) ? { moves } : null;
  }
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
    const moves = vehicleMoves(g, defs);
    return moves && chain(g, defs, moves) ? { moves } : null;
  }
  return null;
}

/** Що робить об'єкт мапи зараз; null — нічого (мертвий). Лише для мап зрізу 1 і лише коли гравець у їхній локації, без розмови. */
export function resolveSpot(sim: SimState, defs: CoreDefs, name: string): Resolved | null {
  const g = sim.game;
  const p = g.player;
  if (!p || g.dialogue !== null || g.campaignEnded) return null;
  const map = mapKeyFor(p.locationId);
  if (map === 'camp' || !(MAP_SPOTS[map] as readonly string[]).includes(name) || p.locationId !== MAP_LOCATION[map]) return null;
  let byName = memo.get(g);
  if (!byName) { byName = new Map(); memo.set(g, byName); }
  if (byName.has(name)) return byName.get(name) ?? null;
  const r = compute(g, defs, name);
  byName.set(name, r);
  return r;
}

/** NPC зрізу на мапі: тут живе, умова профілю виконана, відкритий. */
function npcLive(g: GameState, defs: CoreDefs, id: string): boolean {
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
  if (map === 'camp' || !(MAP_SPOTS[map] as readonly string[]).includes(name)) return false;
  return name.startsWith('npc.') ? npcLive(sim.game, defs, name) : resolveSpot(sim, defs, name) !== null;
}

/** Чи назва — об'єкт зрізу 1 (на будь-якій з двох мап): їх веде цей модуль, решту — режисер хвиль (director.ts). */
export const isMapFirstSpot = (name: string): boolean => MAP_FIRST.some((k) => (MAP_SPOTS[k as 'home' | 'shop'] as readonly string[]).includes(name));

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
  if (p && map !== 'camp' && g.dialogue === null) {
    for (const name of MAP_SPOTS[map] as readonly string[]) {
      if (name.startsWith('npc.')) { if (npcLive(g, defs, name)) out.add(`Talk|npc.${name.slice(4)}`); continue; }
      if (name.startsWith(SPOT_PREFIX.pack)) continue;   // пакування — не серед меню панелі (ходи PackItem/UnpackItem з сітки багажника)
      for (const m of resolveSpot(sim, defs, name)?.moves ?? []) out.add(moveKey(m));
    }
  }
  coveredMemo.set(g, out);
  return out;
}

/** Підказка «Далі: …» і об'єкт, на який вона вказує (null — вказувати нікуди, лише слова). */
export interface Next { readonly key: Key; readonly spot: string | null }

const quest = (g: GameState, q: string): boolean => active(g, q);

/**
 * Що робити далі (рядок «Далі:» над мапою і підсвічений об'єкт). null — підказки немає (розмова, кінець розділу, мапа не зрізу 1).
 * Дорога (зріз 2): єдина підказка — відкрити ☰, бо там її кроки ще кнопками.
 */
export function nextTarget(sim: SimState, defs: CoreDefs, carried: readonly string[] = []): Next | null {
  const g = sim.game;
  const p = g.player;
  if (!p || g.dialogue !== null || g.campaignEnded) return null;
  const car = p.transportId === 'transport.car';
  if (p.locationId === 'loc.road') return { key: 'next.road', spot: null };
  if (p.locationId === MAP_LOCATION.shop) {
    if (quest(g, 'ST-003')) {
      if (!g.inventory['item.tent']) return { key: 'next.take-tent', spot: 'take.item.tent' };
      if (!g.inventory['item.sleeping-bag']) return { key: 'next.take-bag', spot: 'take.item.sleeping-bag' };
      return { key: 'next.pay', spot: 'step.ST-003' };
    }
    return { key: 'next.back-home', spot: 'obj.vehicle' };
  }
  if (p.locationId !== MAP_LOCATION.home) return null;
  if (quest(g, 'PROLOGUE-HOME-001')) return { key: 'next.prologue-home-001', spot: 'step.PROLOGUE-HOME-001' };
  if (quest(g, 'ST-001')) return { key: 'next.st-001', spot: 'step.ST-001' };
  if (quest(g, 'ST-002')) return { key: 'next.st-002', spot: 'step.ST-002' };
  if (quest(g, 'ST-003')) return { key: car ? 'next.go-shop.car' : 'next.go-shop.bike', spot: 'obj.vehicle' };
  // Пакування: «потрібне» ще не в багажнику (рукою дістали) — до нього; усе на місці — у дорогу.
  const pk = defs.packing;
  if (quest(g, 'CH1-HOME-001') && pk && packingOpen(pk, g)) {
    if (carried.length > 0) return { key: 'next.unload', spot: 'obj.vehicle' };   // рюкзак повний — до авто, розвантажити
    const missing = packItemsFor(pk, p).find((i) => i.group === 'needed' && !g.flags.includes(packFlag(i.itemId)) && !carried.includes(i.itemId));
    if (missing) return { key: 'next.pack', spot: `pack.${missing.itemId}` };
  }
  return { key: car ? 'next.depart.car' : 'next.depart.bike', spot: 'obj.vehicle' };
}

/** Підпис дії біля об'єкта: ключ UI і (для речі чи NPC) id сутності, назву якої додає екран. null — об'єкт нічого не робить. */
export interface SpotLabel { readonly label: Key; readonly ref: string | null }

export function spotLabel(sim: SimState, defs: CoreDefs, name: string): SpotLabel | null {
  const p = sim.game.player;
  if (!p || !liveMapSpot(sim, defs, name)) return null;
  const car = p.transportId === 'transport.car';
  if (name.startsWith(SPOT_PREFIX.step)) return { label: `near.step.${name.slice(SPOT_PREFIX.step.length).toLowerCase()}` as Key, ref: null };
  if (name.startsWith(SPOT_PREFIX.take)) return { label: 'act.pickup', ref: name.slice(SPOT_PREFIX.take.length) };
  if (name.startsWith(SPOT_PREFIX.pack)) {
    const itemId = name.slice(SPOT_PREFIX.pack.length);
    return { label: sim.game.flags.includes(packFlag(itemId)) ? 'pack.out' : 'pack.in', ref: itemId };
  }
  if (name === 'obj.trunk') return { label: 'near.trunk', ref: null };
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
