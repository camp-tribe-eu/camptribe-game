// GAME-243 (S2): нотатник Вікторії — список справ ПОТОЧНОЇ фази дня 1 з місцями, і те, що з нього бачить мінімапа та стрілка.
// Чиста логіка без Phaser і DOM. Пункти не мають власного стану: «зроблено» читається з ядра (прапорці f.take-*/f.pack-*, квести, спорядження),
// тож закреслити пункт руками неможливо (закон 1: мутація «пункт не тікає від стану» червоніє в agenda.test.ts).
import type { CoreDefs } from '../core/defs';
import { carriedOf, packFlag, packingOpen, packItemsFor, takeFlag } from '../core/packing';
import type { SimState } from '../core/sim';
import type { GameState } from '../core/state';
import { dayOf } from '../core/weather';
import type { Key } from '../i18n';
import { MAP_LOCATION, mapKeyFor, nextTarget, type MapKey } from './map-first';

/** Скільки перших пунктів агенди треба закрити, щоб підказка-стрілка зникла (вона лише для навчання в перший день). */
export const ONBOARDING_ITEMS = 2;
/** Скільки пунктів уміщає нотатник; довший список (пакування) показує вікно навколо першого відкритого. */
export const AGENDA_MAX = 6;

export type AgendaLabel = { readonly ui: Key } | { readonly item: string };
export interface AgendaItem {
  readonly id: string;
  readonly label: AgendaLabel;
  /** Де це лежить («шухляда в передпокої»); null — місця окремо не названо. */
  readonly placeKey: Key | null;
  readonly done: boolean;
  /** Перший відкритий пункт — його підсвічено. */
  readonly current: boolean;
  readonly map: MapKey;
  /** Об'єкт мапи, куди йти (для крапки на мінімапі); null — крапки немає. */
  readonly spot: string | null;
}
export interface Agenda {
  readonly phase: 'shop' | 'pack' | 'camp' | 'other';
  readonly items: readonly AgendaItem[];
  /** Усього пунктів у фазі й скільки зроблено (у заголовку «3/8»). */
  readonly total: number;
  readonly doneCount: number;
}

const status = (g: GameState, q: string): string | undefined => (Object.hasOwn(g.quests, q) ? g.quests[q]?.status : undefined);
const doneObj = (g: GameState, q: string, o: string): boolean => (Object.hasOwn(g.quests, q) ? g.quests[q]?.done.includes(o) ?? false : false);
const have = (g: GameState, id: string): boolean => (g.inventory[id] ?? 0) > 0;
const itemKey = (id: string): string => id;

type Raw = Omit<AgendaItem, 'current'>;

/** Місце, де річ лежить удома (ключі UI): підказка «де шукати» поруч із назвою. Мапа home.tmj: вітальня ліворуч, кухня посередині, спальня праворуч. */
const PLACE: Readonly<Record<string, Key>> = {
  'item.documents': 'agenda.place.documents', 'item.wallet': 'agenda.place.wallet', 'item.phones': 'agenda.place.phones', 'item.lantern': 'agenda.place.lantern',
  'item.first-aid': 'agenda.place.first-aid', 'item.clothes': 'agenda.place.wardrobe', 'item.sleeping-bag': 'agenda.place.wardrobe', 'item.tent': 'agenda.place.store',
  'item.water': 'agenda.place.kitchen', 'item.snacks': 'agenda.place.kitchen', 'item.simple-dinner': 'agenda.place.kitchen',
  'item.mia-carrier': 'agenda.place.mia', 'item.mia-bowl-food': 'agenda.place.mia', 'item.mia-blanket': 'agenda.place.mia',
};

/** Крамниця: поїхати → намет → спальник → розрахуватись. Пункти НЕ залежать від фази: їхня зроблене-ність потрібна й навчанню. */
function shopItems(sim: SimState): Raw[] {
  const g = sim.game;
  const paid = status(g, 'ST-003') === 'completed';
  const inShop = g.player?.locationId === MAP_LOCATION.shop;
  // Лише спорядження в руках і квест: прапорці f.pack-* ядро ставить усім речам ще на старті (автоукладка GAME-109), тож «куплено» вони не доводять.
  const tent = paid || have(g, 'item.tent');
  const bag = paid || have(g, 'item.sleeping-bag');
  return [
    { id: 'go-shop', label: { ui: 'agenda.go-shop' }, placeKey: 'agenda.place.yard', done: inShop || tent || bag || paid, map: 'home', spot: 'obj.vehicle' },
    { id: 'tent', label: { ui: 'agenda.buy-tent' }, placeKey: 'agenda.place.shelf', done: tent, map: 'shop', spot: 'take.item.tent' },
    { id: 'bag', label: { ui: 'agenda.buy-bag' }, placeKey: 'agenda.place.shelf', done: bag, map: 'shop', spot: 'take.item.sleeping-bag' },
    { id: 'pay', label: { ui: 'agenda.pay' }, placeKey: 'agenda.place.till', done: paid, map: 'shop', spot: 'step.ST-003' },
  ];
}

/** Збори вдома: кожна потрібна річ — за назвою й місцем (GAME-245), потім «Завантажити в авто». */
function packItems(sim: SimState, defs: CoreDefs): Raw[] {
  const g = sim.game;
  const p = g.player;
  const pk = defs.packing;
  if (!p || !pk) return [];
  const needed = packItemsFor(pk, p).filter((i) => i.group === 'needed');
  const taken = (id: string): boolean => g.flags.includes(takeFlag(id)) || g.flags.includes(packFlag(id));
  const list: Raw[] = needed.map((i) => ({ id: i.itemId, label: { item: itemKey(i.itemId) }, placeKey: PLACE[i.itemId] ?? null, done: taken(i.itemId), map: 'home', spot: `pack.${i.itemId}` }));
  const loaded = needed.every((i) => g.flags.includes(packFlag(i.itemId))) && carriedOf(g.flags, pk, p).length === 0;
  list.push({ id: 'load', label: { ui: 'agenda.load' }, placeKey: 'agenda.place.yard', done: loaded, map: 'home', spot: 'obj.vehicle' });
  return list;
}

/** Табір, вечір дня 1: знайти Елізу → намет → дрова → у намет. */
function campItems(sim: SimState): Raw[] {
  const g = sim.game;
  const fin = status(g, 'ST-005') === 'completed';
  return [
    { id: 'elise', label: { ui: 'agenda.camp.elise' }, placeKey: 'agenda.place.reception', done: fin || doneObj(g, 'ST-005', 'meet-elise'), map: 'camp', spot: 'npc.elise' },
    { id: 'pitch', label: { ui: 'agenda.camp.pitch' }, placeKey: 'agenda.place.pitch', done: fin || doneObj(g, 'ST-005', 'pitch-tent'), map: 'camp', spot: `task.pitch-tent` },
    { id: 'wood', label: { ui: 'agenda.camp.wood' }, placeKey: 'agenda.place.forest', done: fin || doneObj(g, 'ST-005', 'gather-firewood') || have(g, 'item.firewood'), map: 'camp', spot: 'take.item.firewood' },
    { id: 'bed', label: { ui: 'agenda.camp.bed' }, placeKey: 'agenda.place.tent', done: fin, map: 'camp', spot: 'step.ST-005' },
  ];
}

/** Вікно довгого списку: тримає перший відкритий пункт і пару щойно зроблених перед ним, щоб було видно, що закреслилось. */
export function windowOf<T>(list: readonly T[], firstOpen: number, max: number = AGENDA_MAX): readonly T[] {
  if (list.length <= max) return list;
  const start = Math.min(Math.max(firstOpen - 2, 0), list.length - max);
  return list.slice(start, start + max);
}

/** Скільки пунктів дня 1 уже зроблено за фазами крамниці й табору (лічильник навчання). Збори вдома не рахуємо: до них прапорці f.pack-* стоять з автоукладки. */
function day1Done(sim: SimState): number {
  return [...shopItems(sim), ...campItems(sim)].filter((i) => i.done).length;
}

/** Навчання (стрілка-підказка): лише день 1 і поки закрито менше ONBOARDING_ITEMS пунктів агенди. Далі шукаєш сам — мінімапа й нотатник. */
export function onboarding(sim: SimState): boolean {
  return dayOf(sim.clock) === 0 && day1Done(sim) < ONBOARDING_ITEMS;
}

/** Знімок для мінімапи (GAME-243): сцена збирає щокадру, UI малює. `tones` — карта плиток (0 підлога, 1 стіна, 2 вода), та сама для всієї мапи (за `key`). Координати — у плитках. */
export interface MiniFrame {
  readonly key: string;
  readonly cols: number;
  readonly rows: number;
  readonly tones: Uint8Array;
  readonly px: number;
  readonly py: number;
  readonly dir: 'up' | 'down' | 'left' | 'right';
  readonly dots: readonly { readonly x: number; readonly y: number }[];
}

/** Нотатник на зараз; null — гравця ще немає. */
export function agendaOf(sim: SimState, defs: CoreDefs): Agenda | null {
  const g = sim.game;
  const p = g.player;
  if (!p) return null;
  let phase: Agenda['phase'] = 'other';
  let raw: Raw[] = [];
  if (status(g, 'ST-003') === 'active') { phase = 'shop'; raw = shopItems(sim); }
  else if (defs.packing && status(g, 'CH1-HOME-001') === 'active' && packingOpen(defs.packing, g)) { phase = 'pack'; raw = packItems(sim, defs); }
  else if (status(g, 'ST-005') === 'active' && p.locationId === MAP_LOCATION.camp) { phase = 'camp'; raw = campItems(sim); }
  else {
    const n = nextTarget(sim, defs, defs.packing ? carriedOf(g.flags, defs.packing, p) : []);
    if (n) raw = [{ id: 'next', label: { ui: n.key }, placeKey: null, done: false, map: mapKeyFor(p.locationId), spot: n.spot }];
  }
  // Підсвічений пункт — той, до якого веде підказка «Далі» (справа хвилі з горілим строком може бути перед розмовою); інакше перший відкритий.
  const nt = phase === 'other' ? null : nextTarget(sim, defs, defs.packing ? carriedOf(g.flags, defs.packing, p) : []);
  const byHint = nt?.spot ? raw.findIndex((i) => !i.done && i.spot === nt.spot) : -1;
  const firstOpen = byHint >= 0 ? byHint : raw.findIndex((i) => !i.done);
  const items = windowOf(raw, firstOpen).map((i) => ({ ...i, current: i.id === raw[firstOpen]?.id }));
  return { phase, items, total: raw.length, doneCount: raw.filter((i) => i.done).length };
}

/** Об'єкти мапи, що світяться крапками на мінімапі: ЛИШЕ відкриті пункти й лише на цій мапі (зроблене крапки не має). */
export function minimapTargets(agenda: Agenda | null, map: MapKey): readonly string[] {
  if (!agenda) return [];
  return agenda.items.filter((i) => !i.done && i.map === map && i.spot !== null).map((i) => i.spot as string);
}
