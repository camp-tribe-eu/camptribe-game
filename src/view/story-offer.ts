// Сюжет на екрані (GAME-32): з поточного стану — що показати гравцеві і які дії запропонувати.
// Дії — це ті самі спроби, що перебирають бот і повний перебір (src/content/moves.ts), залишені лише
// ті, які ядро справді прийме (пробний dispatch). Тож доказ «з кожного стану кінець досяжний» з
// story.test / bot.test стосується й того, що гравець бачить на екрані (перевіряє story-offer.test).
//
// Винятки, і чому вони не ламають доказ (перевіряє той самий тест, повним перебором):
// * під час розмови показано лише відповіді й «далі» — інші дії чекають кінця розмови;
// * Interact — справа сцени (об'єкт поруч на мапі), не меню;
// * дві спроби, що ведуть в один і той самий стан (завершити квест без вибору й тим самим переходом),
//   показуються одним рядком;
// * дія, що не змінює нічого (прийти туди, де вже стоїш), не показується.
import { dispatch, nextCommandId, type Command } from '../core/commands';
import type { CoreDefs, StoryDefs } from '../core/defs';
import { gearOf, sellPriceOf } from '../core/gear';
import { canonical } from '../core/hash';
import { todayForecast, todayWeather, type SimState } from '../core/sim';
import { initialState, type GameState } from '../core/state';
import { matches, route } from '../core/story';
import { capacityOf, packedOf, packFlag, packingOpen, packItemsFor, usedUnits } from '../core/packing';
import { DAY_MINUTES, dayOf, tripMinutes, type Weather } from '../core/weather';
import { CONTENT, memorableFacts } from '../content/story';
import { moves, progressKey, type Move } from '../content/moves';
import items from '../../content/items.json';
import { daySummary, daysEnded, NIGHT_PREFIX } from '../core/day-summary';
import type { OfferAction, OfferCharacter, OfferPacking, OfferSummary, StoryOffer } from '../ui/story-types';

const NO_ANIMAL = 'animal.none';

interface Named { id: string; nameKey?: string; titleKey?: string }
interface RawNode { id: string; speaker?: string; textKey?: string; choices?: { textKey?: string }[] }
interface RawTransition { on: string; to: string; choiceKey?: string }

/** id сутності → ключ її назви в content/locales. Невідомий id — null (UI покаже лише тип запису). */
const NAMES: ReadonlyMap<string, string> = new Map([
  ...([...CONTENT.profiles, ...CONTENT.transports, ...CONTENT.animals, ...CONTENT.locations, ...CONTENT.npcs, ...CONTENT.quests, ...items] as Named[])
    .flatMap((x) => { const k = x.nameKey ?? x.titleKey; return k ? [[x.id, k] as const] : []; }),
  // Подія в дорозі (GAME-31): назва — titleKey тригера (заголовок розмови й запис журналу).
  ...CONTENT.dialogues.flatMap((d) => (d.trigger ? [[d.id, d.trigger.titleKey] as const] : [])),
  // Сцена сюжету (GAME-142): так само — назва сцени над репліками.
  ...CONTENT.dialogues.flatMap((d) => (d.scene ? [[d.id, d.scene.titleKey] as const] : [])),
  // Пам'ятний вибір (GAME-110): запис журналу «Запам'ятали: …» — текст journal.<факт> (валідатор: LOCALE_MISSING без нього).
  ...memorableFacts(CONTENT).map((f) => [f, `journal.${f}`] as const),
]);
export const nameKey = (id: string | null | undefined): string | null => (id ? NAMES.get(id) ?? null : null);

const DIALOGUE_NODES: ReadonlyMap<string, RawNode> = new Map(
  CONTENT.dialogues.flatMap((d) => (d.nodes as RawNode[]).map((n) => [`${d.id}#${n.id}`, n] as const)),
);
const TRANSITIONS: ReadonlyMap<string, readonly RawTransition[]> = new Map(
  CONTENT.quests.map((q) => [q.id, q.transitions as RawTransition[]] as const),
);

/**
 * Ключ стану для порівняння наслідків: без лічильників команд і навичок (як у бота, progressKey). Дія, що
 * лише додала досвіду (вдруге поговорити з тим, хто вже все сказав), — «нічого не змінює» і в меню не йде.
 */
export const outcomeKey = progressKey;

const tryMove = (s: GameState, m: Move | Omit<Command, 'commandId'>, defs: CoreDefs, weather?: Weather): GameState | null => {
  const r = dispatch(s, { ...m, commandId: nextCommandId(s) } as Command, defs, undefined, undefined, weather);
  return r.ok ? r.state : null;
};

/**
 * id дії — сама спроба канонічним рядком: стабільний між кадрами, тож клік не влучить у чужу дію.
 * Відповідь у розмові ще й прив'язана до вузла (рецензія: «відповідь 0» є в кожному вузлі — без
 * цього затиснутий Enter проходив би розмову сам).
 */
const idOf = (m: Move, s: GameState): string =>
  canonical(m.type === 'Choose' || m.type === 'Continue' ? { ...m, at: s.dialogue } : m);

function describe(m: Move, defs: CoreDefs, s: GameState, weather: Weather): Omit<OfferAction, 'id'> {
  switch (m.type) {
    case 'Visit': {
      // Ціна дороги для гравця (GAME-31): хвилини й гроші найкоротшого шляху його транспортом;
      // хвилини — уже з погодою дня (SIM-WX-007), тобто ті самі, що симуляція перемотає.
      const way = s.player && defs.story ? route(defs.story, s.player.locationId, m.locationId, s.player.transportId) : null;
      const minutes = way && s.player ? tripMinutes(way.minutes, s.player.transportId, weather) : 0;
      return { kind: 'visit', key: nameKey(m.locationId), ...(minutes > 0 ? { minutes } : {}), ...(way && way.cents > 0 ? { priceCents: way.cents } : {}) };
    }
    case 'Talk': return { kind: 'talk', key: nameKey(m.npcId) };
    case 'Pickup': return { kind: 'pickup', key: nameKey(m.itemId) };
    case 'BuyItem': return { kind: 'buy', key: nameKey(m.itemId), priceCents: defs.items[m.itemId]?.buyCents ?? 0 };
    // Уживане спорядження — за станом (SIM-GEAR-004): та сама ціна, яку дасть ядро.
    case 'SellItem': return { kind: 'sell', key: nameKey(m.itemId), priceCents: sellPriceOf(defs.items[m.itemId], s.gear, m.itemId) ?? 0 };
    case 'DryGear': return { kind: 'dry', key: nameKey(m.itemId) };
    case 'CompleteQuest':
    case 'DeclineQuest': {
      const on = m.type === 'CompleteQuest' ? 'complete' : 'decline';
      const kind = on;
      if (m.to === undefined) return { kind, key: nameKey(m.questId) };
      const raw = TRANSITIONS.get(m.questId)?.find((t) => t.on === on && t.to === m.to);
      return { kind, key: raw?.choiceKey ?? nameKey(m.to) };
    }
    case 'Choose': {
      const d = s.dialogue;
      const node = d ? DIALOGUE_NODES.get(`${d.id}#${d.node}`) : undefined;
      return { kind: 'choose', key: node?.choices?.[m.choice]?.textKey ?? null };
    }
    case 'Continue': return { kind: 'continue', key: null };
    default: throw new Error(`story menu: unexpected move ${m.type}`);
  }
}

const refOf = (m: Move): string => {
  const r = m as unknown as Record<string, unknown>;
  return String(r.questId ?? r.locationId ?? r.itemId ?? r.npcId ?? '');
};

/** Наміри для меню: показані дії → їхні команди (без commandId — його дає місток). */
export interface Offered { readonly offer: StoryOffer; readonly intents: ReadonlyMap<string, Move> }

/** Спроби, які меню пропонує в стані: прийняті ядром, без Interact, у розмові — лише розмова, без дублів наслідку. */
export function menuMoves(s: GameState, defs: CoreDefs, weather?: Weather): { move: Move; next: GameState }[] {
  const talking = s.dialogue !== null;
  const here = outcomeKey(s);
  const seen = new Set<string>();
  const out: { move: Move; next: GameState }[] = [];
  for (const m of moves(s, defs)) {
    if (m.type === 'Interact' || m.type === 'RoadEvent') continue; // справа сцени й симуляції, не меню
    if (talking && m.type !== 'Choose' && m.type !== 'Continue') continue;
    const next = tryMove(s, m, defs, weather);
    if (!next) continue;
    const outcome = outcomeKey(next);
    if (outcome === here) continue; // дія, що нічого не змінює (прийти туди, де стоїш), — не пропонуємо
    // Дубль — лише той самий наслідок ТІЄЇ САМОЇ дії (з переходом і без): інакше різні записи журналу злилися б.
    const k = `${m.type}|${refOf(m)}|${outcome}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ move: m, next });
  }
  return out;
}

/**
 * Купівлі, які тут продаються, але на які бракує грошей (GAME-83). Лише код INSUFFICIENT_FUNDS: решту відмов
 * (NOT_SOLD_HERE, ITEM_ALREADY_HELD…) меню, як і раніше, ховає. Ядро відмовляє у фондах ПІСЛЯ перевірки місця,
 * тож «не продається тут» сюди не потрапить. У розмові купівлі немає.
 */
export function unaffordableBuys(s: GameState, defs: CoreDefs): { move: Move; shortCents: number }[] {
  if (s.dialogue !== null) return [];
  const out: { move: Move; shortCents: number }[] = [];
  for (const m of moves(s, defs)) {
    if (m.type !== 'BuyItem') continue;
    const r = dispatch(s, { ...m, commandId: nextCommandId(s) } as Command, defs);
    const price = Object.hasOwn(defs.items, m.itemId) ? defs.items[m.itemId]?.buyCents : undefined;
    if (!r.ok && r.code === 'INSUFFICIENT_FUNDS' && price !== undefined) out.push({ move: m, shortCents: price - s.moneyCents });
  }
  return out;
}

/** Дозволені на старті персонажі: кожна комбінація, яку ядро прийме як CreateCharacter. */
export function characterChoices(defs: CoreDefs): { offer: OfferCharacter; intent: Move }[] {
  const st = defs.story;
  if (!st) return [];
  const out: { offer: OfferCharacter; intent: Move }[] = [];
  const blank = initialState(0);
  for (const profileId of Object.keys(st.profiles)) for (const transportId of st.transports) {
    for (const animalId of [NO_ANIMAL, ...Object.keys(st.animals)]) {
      const intent = { type: 'CreateCharacter', profileId, transportId, ...(animalId === NO_ANIMAL ? {} : { animalId }) } as Move;
      if (!tryMove(blank, intent, defs)) continue;
      out.push({ intent, offer: { id: idOf(intent, blank), profileKey: nameKey(profileId) ?? profileId, transportKey: nameKey(transportId) ?? transportId, animalKey: animalId === NO_ANIMAL ? null : nameKey(animalId) ?? animalId } });
    }
  }
  return out;
}

/**
 * Екран пакування (GAME-109): річ, яку ядро прийме, дістає наміру; та, що не вміщається, — без дії (UI покаже причину).
 * Пакування не серед `moves()`: інакше простір станів повного перебору множився б на 2^12. Його доводить окремий перебір (story.test).
 */
function packingOffer(s: GameState, defs: CoreDefs, intents: Map<string, Move>): OfferPacking | null {
  const pk = defs.packing;
  const p = s.player;
  if (!pk || !p || !packingOpen(pk, s)) return null;
  const action = (m: Move, kind: OfferAction['kind'], key: string | null): OfferAction | null => {
    if (!tryMove(s, m, defs)) return null;
    const a: OfferAction = { id: idOf(m, s), kind, key };
    intents.set(a.id, m);
    return a;
  };
  const packed = new Set(packedOf(s.flags, pk, p));
  const groups = (['needed', 'useful', 'leave'] as const).map((group) => ({
    group,
    items: packItemsFor(pk, p).filter((i) => i.group === group).map((i) => {
      const on = packed.has(i.itemId);
      return { key: nameKey(i.itemId) ?? i.itemId, units: i.units, packed: on, action: action({ type: on ? 'UnpackItem' : 'PackItem', itemId: i.itemId }, on ? 'unpack' : 'pack', nameKey(i.itemId)) };
    }),
  })).filter((g) => g.items.length > 0);
  const note = pk.notes.find((n) => !s.flags.includes(packFlag(n.missing)) && packItemsFor(pk, p).some((i) => i.itemId === n.missing) && (!n.transports || n.transports.includes(p.transportId)));
  // «Укласти автоматично» показується завжди; дія без наслідку (вже так складено) лишається натисканням «нічого не змінило».
  const auto: OfferAction = { id: idOf({ type: 'AutoPack' }, s), kind: 'autopack', key: null };
  intents.set(auto.id, { type: 'AutoPack' });
  return { used: usedUnits(s.flags, pk, p), capacity: capacityOf(pk, p.transportId), groups, auto, noteKey: note?.textKey ?? null };
}

/**
 * Підсумок останнього завершеного дня (GAME-106) — для екрана: id фактів → ключі текстів. Сам підсумок (що є фактом) вирішує
 * ядро; тут лише назви. Ночівля — ключ UI `sum.night.<вид>` (наявність підписів для кожного f.night-* контенту звіряє тест).
 */
export function summaryOffer(sim: SimState, defs: CoreDefs): { daysEnded: number; summary: OfferSummary | null } {
  const ended = daysEnded(sim, defs);
  const sum = ended > 0 ? daySummary(sim, ended, defs) : null;
  if (!sum) return { daysEnded: ended, summary: null };
  return {
    daysEnded: ended,
    summary: {
      day: sum.day,
      money: sum.money,
      sections: sum.sections.map((x) => ({ kind: x.kind, keys: x.ids.map((id) => (x.kind === 'night' ? `sum.night.${id.slice(NIGHT_PREFIX.length)}` : nameKey(id) ?? id)) })),
    },
  };
}

export function storyOffer(sim: SimState, defs: CoreDefs): Offered {
  const s = sim.game;
  const st = defs.story as StoryDefs;
  const intents = new Map<string, Move>();
  const journal = sim.journal.map((e) => ({ type: e.type, key: nameKey(e.ref), at: e.at }));
  // Спорядження — зі станом і «мокре» (GAME-83): те саме, що веде ядро (GAME-73), без власного стану в UI.
  const inventory = Object.entries(s.inventory).sort(([a], [b]) => a.localeCompare(b)).map(([id, qty]) => ({
    key: nameKey(id) ?? id, qty,
    ...(Object.hasOwn(defs.items, id) && defs.items[id]?.gear ? { gear: gearOf(s.gear, id) } : {}),
  }));
  const weather = todayWeather(sim);
  const lastTrip = [...sim.journal].reverse().find((e) => e.type === 'Visit')?.commandId ?? null;
  const base = { moneyCents: s.moneyCents, inventory, journal, lastTrip, weather, forecast: todayForecast(sim), day: dayOf(sim.clock) + 1, timeMinutes: sim.clock.minutes % DAY_MINUTES, ...summaryOffer(sim, defs) };

  if (!s.player) {
    const choices = characterChoices(defs);
    for (const c of choices) intents.set(c.offer.id, c.intent);
    return { intents, offer: { ...base, stage: 'create', characters: choices.map((c) => c.offer), locationKey: null, quests: [], dialogue: null, actions: [], packing: null, locked: [] } };
  }

  const p = s.player;
  const quests = Object.entries(s.quests).filter(([, q]) => q.status === 'active').map(([qid, q]) => {
    const def = st.quests[qid];
    const raw = CONTENT.quests.find((x) => x.id === qid) as { objectives: { id: string; textKey?: string }[] } | undefined;
    const objectives = (def?.objectives ?? [])
      .filter((o) => matches(o.when, p))
      .map((o) => ({
        key: raw?.objectives.find((r) => r.id === o.id)?.textKey ?? o.id,
        required: o.required,
        done: o.kind === 'collect' ? (s.inventory[o.target] ?? 0) >= 1 : q.done.includes(o.id),
      }));
    return { key: nameKey(qid) ?? qid, objectives };
  });

  const offered: OfferAction[] = [];
  for (const { move } of menuMoves(s, defs, weather)) {
    const a: OfferAction = { id: idOf(move, s), ...describe(move, defs, s, weather) };
    intents.set(a.id, move);
    offered.push(a);
  }

  // Недоступні купівлі: без наміру в `intents` — активувати їх нічим (і нічого не відправиться).
  const locked: OfferAction[] = unaffordableBuys(s, defs).map(({ move, shortCents }) => ({ id: `locked|${idOf(move, s)}`, ...describe(move, defs, s, weather), shortCents }));

  let dialogue: StoryOffer['dialogue'] = null;
  if (s.dialogue) {
    const node = DIALOGUE_NODES.get(`${s.dialogue.id}#${s.dialogue.node}`);
    const npcId = st.dialogues[s.dialogue.id]?.npcId;
    // Розмова з NPC — його ім'я; подія в дорозі — її назва.
    const speakerKey = npcId === undefined ? nameKey(s.dialogue.id) : node?.speaker === 'npc' ? nameKey(npcId) : null;
    dialogue = { speakerKey, key: node?.textKey ?? null, answers: offered };
  }

  return {
    intents,
    offer: {
      ...base,
      stage: s.campaignEnded ? 'ended' : 'play',
      characters: [],
      locationKey: nameKey(p.locationId),
      quests,
      dialogue,
      actions: dialogue ? [] : offered,
      packing: dialogue ? null : packingOffer(s, defs, intents),
      locked,
    },
  };
}
