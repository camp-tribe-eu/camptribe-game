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
import { gearIssue, gearOf, gearSceneVariant, sellPriceOf } from '../core/gear';
import { canonical } from '../core/hash';
import { todayForecast, todayWeather, type SimState } from '../core/sim';
import { initialState, type GameState } from '../core/state';
import { MAX_RANK, SKILL_IDS, skillStep } from '../core/skills';
import { TITLE_COUNT, progressOf, titleStep } from '../core/progress';
import { STICKER_SLOTS, stickersOf } from '../core/stickers';
import { ATLAS_PAGES, STICKER_META } from '../content/stickers';
import { pageFill } from '../core/atlas-fill';
import { nearestReward } from '../content/nearest-reward';
import { LOCALES } from '../i18n';
import { chapterComplete, matches, route } from '../core/story';
import { awardsFor } from '../core/progress';
import { capacityOf, carriedOf, overflowCandidates, packedOf, packFlag, packingOpen, packItemsFor, usedUnits } from '../core/packing';
import { timeOfDay } from './world/daylight';
import { bedtimeNight } from '../core/clock';
import { canSleep, shopClosedHere, wakeMinute } from '../core/rest';
import { dayOf, tripMinutes, type Weather } from '../core/weather';
import { CONTENT, memorableFacts } from '../content/story';
import { moves, progressKey, type Move } from '../content/moves';
import items from '../../content/items.json';
import { daySummary, daysEnded, NIGHT_PREFIX } from '../core/day-summary';
import { type OfferAction, type OfferAtlas, type OfferGoal, type OfferCharacter, type OfferPacking, type OfferProgress, type OfferSummary, type OfferWave, type StoryOffer } from '../ui/story-types';
import { RAW_WAVES } from '../content/waves';
import { menuTasks } from '../content/director';
import { agendaOf } from '../content/agenda';
import { coveredKeys, departBlock, moveKey, nextTarget, resolveSpot, spotLabel } from '../content/map-first';
import { waveView } from '../core/wave';
import type { Key } from '../i18n';
import { liveRequestSpot as liveSpotFor, REQUEST_LOCATION } from '../content/requests';
import { miaState } from '../content/mia';
import { giftOptions } from '../content/friendship';
import { photoPage } from '../content/photos';
import { henryPage, isTraceSpot, liveTraceSpot } from '../content/traces';
import { isRequestSpot, offerNodeOf, REQUESTS, requestOf, requestStatus, requestDoneFlags, requestTarget, trackerRows } from '../content/requests';

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
  ...[...memorableFacts(CONTENT), ...requestDoneFlags()].map((f) => [f, `journal.${f}`] as const),
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
  for (const m of moves(s, defs, true)) {
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
function packingOffer(s: GameState, defs: CoreDefs, intents: Map<string, Move>, overflow: boolean): OfferPacking | null {
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
  const carried = new Set(carriedOf(s.flags, pk, p));
  const all = packItemsFor(pk, p);
  const stateOf = (id: string): 'home' | 'bag' | 'car' => (packed.has(id) ? 'car' : carried.has(id) ? 'bag' : 'home');
  const groups = (['needed', 'useful', 'leave'] as const).map((group) => ({
    group,
    items: all.filter((i) => i.group === group).map((i) => ({ key: nameKey(i.itemId) ?? i.itemId, units: i.units, state: stateOf(i.itemId) })),
  })).filter((g) => g.items.length > 0);
  const note = pk.notes.find((n) => !s.flags.includes(packFlag(n.missing)) && !carried.has(n.missing) && all.some((i) => i.itemId === n.missing) && (!n.transports || n.transports.includes(p.transportId)));
  const want = all.filter((i) => i.group !== 'leave');
  const left = want.filter((i) => stateOf(i.itemId) === 'home').sort((a, b) => (a.group === b.group ? 0 : a.group === 'needed' ? -1 : 1));
  const loadMove: Move = { type: 'LoadCar' };
  const load = tryMove(s, loadMove, defs) ? ((): OfferAction => { const a: OfferAction = { id: idOf(loadMove, s), kind: 'load', key: null }; intents.set(a.id, loadMove); return a; })() : null;
  const over = overflow ? overflowCandidates(pk, p, s.flags).flatMap((i) => { const a = action({ type: 'LeaveItem', itemId: i.itemId }, 'leave', nameKey(i.itemId)); return a ? [{ key: nameKey(i.itemId) ?? i.itemId, units: i.units, action: a }] : []; }) : [];
  return { used: usedUnits(s.flags, pk, p), capacity: capacityOf(pk, p.transportId), groups, taken: want.length - left.length, total: want.length, leftKeys: left.map((i) => nameKey(i.itemId) ?? i.itemId), load, overflow: over, noteKey: note?.textKey ?? null };
}

/**
 * Підсумок останнього завершеного дня (GAME-106) — для екрана: id фактів → ключі текстів. Сам підсумок (що є фактом) вирішує
 * ядро; тут лише назви. Ночівля — ключ UI `sum.night.<вид>` (наявність підписів для кожного f.night-* контенту звіряє тест).
 */
/** Ритм дня для UI (GAME-242): усе з ядра — година, журнал сну; нічого не рахується тут вдруге. */
export function restOffer(sim: SimState): StoryOffer['rest'] {
  const now = sim.clock.minutes;
  const last = sim.journal.at(-1);
  const wake = last?.type === 'Sleep' && last.ref === 'auto' ? wakeMinute(last.at, true) : null;
  return { bedtime: bedtimeNight(now), shopClosed: shopClosedHere(sim.game, now), autoSlept: wake !== null && now >= wake && now - wake < 10 };
}

export function summaryOffer(sim: SimState, defs: CoreDefs): { daysEnded: number; summary: OfferSummary | null } {
  const st = defs.story;
  const ended = daysEnded(sim, defs);
  const sum = ended > 0 ? daySummary(sim, ended, defs) : null;
  if (!sum) return { daysEnded: ended, summary: null };
  return {
    daysEnded: ended,
    summary: {
      day: sum.day,
      money: sum.money,
      reward: sum.reward,
      nextKey: st && sim.game.player && !chapterComplete(sim.game, st) ? goalOf(sim.game, st)?.key ?? null : null,
      tomorrowKey: st && sim.game.player && !chapterComplete(sim.game, st) ? tomorrowKeyOf(sum.day) : null,
      sections: sum.sections.map((x) => ({ kind: x.kind, keys: x.ids.map((id) => (x.kind === 'night' ? `sum.night.${id.slice(NIGHT_PREFIX.length)}` : nameKey(id) ?? id)) })),
    },
  };
}

/**
 * GAME-181 · поточна ціль у HUD: назва першого активного ГОЛОВНОГО квесту, доречного цьому гравцеві (бічні не рахуються: ціль одна). Немає персонажа чи розділ
 * завершено — цілі немає. Той самий квест, що в ☰ під «Квест»: гравець бачить одне й те саме в двох місцях.
 */
export function goalOf(s: GameState, st: StoryDefs): { key: string } | null {
  const p = s.player;
  if (!p || chapterComplete(s, st)) return null;
  const id = Object.entries(s.quests).find(([qid, q]) => q.status === 'active' && st.quests[qid] && !st.quests[qid].optional && matches(st.quests[qid].when, p))?.[0];
  const key = id === undefined ? null : nameKey(id);
  return key ? { key } : null;
}

/** GAME-181 · XP, ОМ, звання й навички для ☰. Назви й підписи рангів — у content/locales (`title.N`, `skill.<напрям>.r<N>`, `.unlock`). */
export function progressOffer(s: GameState): OfferProgress {
  const pg = progressOf(s);
  const ts = titleStep(pg.xp);
  return {
    xp: pg.xp,
    om: pg.om,
    title: { index: ts.index, key: `title.${ts.index + 1}`, nextKey: ts.index + 1 < TITLE_COUNT ? `title.${ts.index + 2}` : null, into: ts.into, span: ts.span },
    skills: SKILL_IDS.map((id) => {
      const step = skillStep(Object.hasOwn(s.skills, id) ? (s.skills[id] as number) : 0);
      return { id, key: id, rank: step.rank, rankKey: step.rank > 0 ? `${id}.r${step.rank}` : null, pct: step.pct, mentor: step.mentor, maxed: step.rank >= MAX_RANK, unlockKey: step.rank < MAX_RANK ? `${id}.r${step.rank + 1}.unlock` : null };
    }),
  };
}

/** GAME-200 · тизер «Завтра…»: рядок `sum.tomorrow.<день>` у src/i18n (uk+en). Дня без рядка тизера не має — екран просто його не показує. */
export const tomorrowKeyOf = (day: number): Key | null => (Object.hasOwn(LOCALES.uk, `sum.tomorrow.${day}`) ? (`sum.tomorrow.${day}` as Key) : null);

/**
 * GAME-200 · відкриті цілі журналу: головна, побічні (бічний квест у роботі, прохання сусіда в роботі) і «нагорода близько» (nearestReward).
 * Не більше 4; головна й нагорода — завжди, поки є, побічні — між ними. Нічого не вигадує: порожньо там, де справді нічого немає.
 */
export function openGoals(s: GameState, st: StoryDefs, weather?: Weather): OfferGoal[] {
  const p = s.player;
  if (!p) return [];
  const main = goalOf(s, st);
  const sides: OfferGoal[] = [
    // GAME-208: справа дня за погодою — перша серед побічних: дощ і ясний день дають РІЗНІ цілі (не провал, а інше заняття).
    ...REQUESTS.filter((r) => r.weather !== undefined && p.locationId === REQUEST_LOCATION && ['active', 'ready'].includes(requestStatus(s.flags, r, REQUESTS, weather))).map((r) => ({ kind: 'side' as const, key: r.titleKey, ui: false })),
    ...Object.entries(s.quests).filter(([qid, q]) => q.status === 'active' && st.quests[qid]?.optional === true && matches(st.quests[qid]?.when, p)).map(([qid]) => ({ kind: 'side' as const, key: nameKey(qid) ?? qid, ui: false })),
    ...REQUESTS.filter((r) => r.weather === undefined && ['active', 'ready'].includes(requestStatus(s.flags, r))).map((r) => ({ kind: 'side' as const, key: r.titleKey, ui: false })),
  ].slice(0, 2);
  const n = nearestReward(s);
  return [...(main ? [{ kind: 'main' as const, key: main.key, ui: false }] : []), ...sides, ...(n ? [{ kind: 'reward' as const, key: n.labelKey, ui: n.ui, left: n.left }] : [])];
}

/** GAME-182 · сторінка Атласу: слоти — наклейки з content/stickers.json у порядку контенту, отримані (ядро: state.stickers) — кольорові, решта — силуети. */
export function atlasOffer(s: GameState): OfferAtlas {
  const have = stickersOf(s);
  const slots = STICKER_META.map((m) => ({ ...m, owned: have.includes(m.id) }));
  const henry = henryPage(s.flags);
  // GAME-200: заповнення сторінок. «Перша спроба» — наклейки (нагорода XP/ОМ за повну), «Шлях Генрі» — сліди (нагорода — листівка, її видає ядро).
  const pages = [
    ...ATLAS_PAGES.map((pg) => { const f = pageFill(have, pg.stickers); return { id: pg.id, titleKey: 'atlas.title', have: f.have, total: f.total, pct: f.pct, done: f.have === f.total && f.total > 0, reward: { xp: pg.xp, om: pg.om } }; }),
    { id: 'henry', titleKey: 'atlas.henry', have: henry.found, total: henry.total, pct: henry.total === 0 ? 0 : Math.floor((henry.found * 100) / henry.total), done: henry.postcard, reward: null },
  ];
  const sum = pages.reduce((a, x) => ({ have: a.have + x.have, total: a.total + x.total }), { have: 0, total: 0 });
  return { slots, total: STICKER_SLOTS, count: slots.filter((x) => x.owned).length, henry, photos: photoPage(s.flags), pages, fillPct: sum.total === 0 ? 0 : Math.floor((sum.have * 100) / sum.total) };
}

/** Картка мети (GAME-170, зріз 2): жива хвиля з ядра (waveView — хвилини за годинником симуляції) і тексти з content/waves.json. */
export function waveOffer(sim: SimState): OfferWave | null {
  const v = waveView(sim.game, sim.clock.minutes);
  if (!v) return null;
  const raw = RAW_WAVES.find((w) => w.id === v.waveId);
  const tasks = v.tasks.map((t) => ({ id: t.id, textKey: raw?.tasks.find((x) => x.id === t.id)?.textKey ?? t.id, remainingMin: t.remainingMin, outcome: t.outcome }));
  return { titleKey: raw?.titleKey ?? v.waveId, done: tasks.filter((t) => t.outcome === 'done').length, total: tasks.length, tasks };
}

/**
 * Текст цілі. Ціль «перевірка спорядження» (`gearCheck`, GAME-144) — сцена за ФАКТИЧНИМ станом речей: є проблема (gearIssue
 * ядра) — `<textKey>.<вид>-<стан>`, усе сухе й ціле — сам `textKey` (нейтральна сцена). Тексти всіх варіантів вимагає валідатор
 * (LOCALE_MISSING). Стану тут ніхто не міняє: сцена лише читає, а розв'язок — справжня дія ядра (DryGear) або «далі».
 */
export function objectiveKey(raw: { textKey?: string; gearCheck?: boolean } | undefined, id: string, s: Pick<GameState, 'inventory' | 'gear'>, defs: Pick<CoreDefs, 'items'>, issueOf = gearIssue): string {
  if (!raw?.textKey) return id;
  if (raw.gearCheck !== true) return raw.textKey;
  const issue = issueOf(s, defs.items);
  return issue ? `${raw.textKey}.${gearSceneVariant(issue)}` : raw.textKey;
}

/**
 * GAME-175 · вигляд екрана подорожі при мапі-першій грі. `mapFirst` — ховати дії, які мапа вже дає руками (кнопка зникає лише
 * там, де об'єкт мапи живий і шле ту саму команду — src/content/map-first.ts); `trunk` — відкрито багажник (сітка пакування показана
 * лише біля авто); `near` — об'єкт мапи, до якого гравець підійшов (підпис дії). Без вигляду (тести, режим `?panelActs=1`) — як було.
 */
export interface StoryView {
  readonly mapFirst: boolean; readonly trunk: boolean; readonly near: string | null; readonly backpack?: readonly string[];
  /** GAME-183: об'єкт мапи, що питає «що саме?» (авто — куди їхати, сушарка, приймальня, крок з вибором): його варіанти йдуть у рамку вибору замість ☰. Стан ПОКАЗУ. */
  readonly choice?: string | null;
  /** GAME-178: гравець щойно спробував рушити, а авто не готове — HUD показує причину. Стан ПОКАЗУ. */
  readonly departNote?: boolean;
  /** GAME-245: «Завантажити» щойно показало, що не влізло, — екран питає «що лишимо вдома». Стан ПОКАЗУ. */
  readonly overflow?: boolean;
  /** GAME-245: річ, щойно взята вдома (картка ~1,5 с). Стан ПОКАЗУ. */
  readonly card?: string | null;
}
/** Питання рамки вибору за об'єктом (ключі UI). */
/** id відповіді «Не зараз» у рамці вибору дії на мапі (GAME-183): команди не має — гра лише закриває рамку. */
export const CHOICE_CANCEL_ID = 'choice|cancel';
export const choicePrompt = (spot: string): Key => (spot === 'obj.vehicle' ? 'choice.where' : spot === 'obj.drying' ? 'choice.dry' : spot === 'obj.sell' ? 'choice.sell' : spot === 'obj.buy' ? 'choice.buy' : 'choice.step');
export const PANEL_VIEW: StoryView = { mapFirst: false, trunk: true, near: null };
const NO_KEYS: ReadonlySet<string> = new Set();

export function storyOffer(sim: SimState, defs: CoreDefs, view: StoryView = PANEL_VIEW): Offered {
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
  const nextT = s.player && view.mapFirst ? nextTarget(sim, defs, view.backpack ?? []) : null;
  const nearL = s.player && view.mapFirst && view.near !== null ? spotLabel(sim, defs, view.near) : null;
  // GAME-180: на мапі табору підказка «Далі:» веде до прохання в роботі (ціль → просильник), а біля цілі — підпис дії.
  const reqT = requestTarget(s);
  const reqNear = view.near !== null && view.mapFirst && isRequestSpot(view.near) && liveSpotFor(s, view.near, undefined, weather)
    ? REQUESTS.flatMap((r) => r.targets).find((t) => t.spot === view.near) : undefined;
  const hint = {
    backpack: view.backpack?.length ?? 0,
    next: reqT ? (reqT.startsWith('npc.') ? 'next.req.giver' : 'next.req.target') as Key : nextT?.key ?? null,
    nextSpot: reqT ?? nextT?.spot ?? null,
    blocked: view.mapFirst && view.departNote ? ((b) => (b ? { carry: b.kind === 'carry', itemKeys: b.kind === 'missing' ? b.items.map((i) => nameKey(i) ?? i) : [] } : null))(departBlock(sim, defs, view.backpack ?? [])) : null,
    card: view.card ? { nameKey: nameKey(view.card) ?? view.card, reactKey: `pack.react.${view.card.replace(/^item\./, '')}`, spot: `pack.${view.card}`, xp: awardsFor('TakeItem', view.card, defs).reduce((a, x) => a + x.xp, 0) } : null,
    near: nearL ? { label: nearL.label, itemKey: nearL.ref ? nameKey(nearL.ref) : null } : reqNear ? { label: 'near.req' as Key, itemKey: reqNear.labelKey }
      : view.near !== null && view.mapFirst && isTraceSpot(view.near) && liveTraceSpot(s, view.near) ? { label: 'near.trace' as Key, itemKey: null } : null,   // GAME-215: біля позначки олівцем
  };
  const ag = s.player && view.mapFirst ? agendaOf(sim, defs) : null;
  const agenda = ag ? { ...ag, items: ag.items.map((i) => ({ ...i, label: 'item' in i.label ? { content: nameKey(i.label.item) ?? i.label.item } : i.label })) } : null;
  const base = { mapFirst: view.mapFirst, agenda, hint, requests: trackerRows(s, REQUESTS, weather), goal: goalOf(s, st), progress: progressOffer(s), atlas: atlasOffer(s), nearest: nearestReward(s), goals: s.player ? openGoals(s, st, weather) : [], moneyCents: s.moneyCents, inventory, journal, lastTrip, weather, forecast: todayForecast(sim), day: dayOf(sim.clock) + 1, timeMinutes: timeOfDay(sim.clock.minutes), rest: restOffer(sim), wave: waveOffer(sim), mia: miaState(s, defs), ...summaryOffer(sim, defs) };

  if (!s.player) {
    const choices = characterChoices(defs);
    for (const c of choices) intents.set(c.offer.id, c.intent);
    return { intents, offer: { ...base, stage: 'create', characters: choices.map((c) => c.offer), locationKey: null, quests: [], dialogue: null, actions: [], packing: null, locked: [] } };
  }

  const p = s.player;
  const quests = Object.entries(s.quests).filter(([, q]) => q.status === 'active').map(([qid, q]) => {
    const def = st.quests[qid];
    const raw = CONTENT.quests.find((x) => x.id === qid) as { giverId?: string; objectives: { id: string; textKey?: string; gearCheck?: boolean }[] } | undefined;
    const objectives = (def?.objectives ?? [])
      .filter((o) => matches(o.when, p))
      .map((o) => ({
        key: objectiveKey(raw?.objectives.find((r) => r.id === o.id), o.id, s, defs),
        required: o.required,
        done: o.kind === 'collect' ? (s.inventory[o.target] ?? 0) >= 1 : q.done.includes(o.id),
      }));
    // GAME-179: хто дав завдання (портрет і ім'я в панелі); завдання без giverId — від оповідача (нейтральна іконка).
    return { key: nameKey(qid) ?? qid, objectives, giver: raw?.giverId ? { id: raw.giverId, key: nameKey(raw.giverId) } : null };
  });

  const offered: OfferAction[] = [];
  // Справи живої хвилі на екрані подорожі (GAME-170 зріз 3: дім, зупинка в дорозі — локацій без мапи): першими, бо в них строк.
  // Текст — textKey справи з content/waves.json; команда — CompleteTask (ядро саме звірить строк і «лише лідер»).
  const raw = RAW_WAVES.find((w) => w.id === s.wave?.active?.waveId);
  // GAME-175/183: дії, які мапа дає руками, панель не показує — лише там, де об'єкт мапи живий (тож нічого не зникає без заміни); справи хвиль — теж.
  const covered = view.mapFirst ? coveredKeys(sim, defs) : NO_KEYS;
  for (const move of menuTasks(sim, defs)) {
    if (move.type !== 'CompleteTask' || covered.has(moveKey(move))) continue;
    const a: OfferAction = { id: idOf(move, s), kind: 'task', key: raw?.tasks.find((t) => t.id === move.taskId)?.textKey ?? null };
    intents.set(a.id, move);
    offered.push(a);
  }
  for (const { move } of menuMoves(s, defs, weather)) {
    if (covered.has(moveKey(move))) continue;
    const a: OfferAction = { id: idOf(move, s), ...describe(move, defs, s, weather) };
    intents.set(a.id, move);
    offered.push(a);
  }

  // Недоступні купівлі: без наміру в `intents` — активувати їх нічим (і нічого не відправиться).
  let locked: OfferAction[] = view.mapFirst ? [] : unaffordableBuys(s, defs).map(({ move, shortCents }) => ({ id: `locked|${idOf(move, s)}`, ...describe(move, defs, s, weather), shortCents }));

  // GAME-242: крамниця зачинена — купівлі й продажі зникають (ядро відмовило б SHOP_CLOSED), лишаються дорога додому й «почекати»;
  // «лягти спати» — де ядро дозволяє (ліжко, намет, будь-де після 22:00). Одна відповідь і для UI, і для бота: питаємо ядро.
  if (!s.dialogue) {
    const now = sim.clock.minutes;
    if (shopClosedHere(s, now)) {
      const trade = offered.filter((a) => a.kind === 'buy' || a.kind === 'sell');
      for (const a of trade) offered.splice(offered.indexOf(a), 1);
      locked = [];
      const w: OfferAction = { id: 'rest|wait', kind: 'wait', key: null };
      intents.set(w.id, { type: 'WaitForShop' });
      offered.push(w);
    }
    if (canSleep(s, now)) {
      const z: OfferAction = { id: 'rest|sleep', kind: 'sleep', key: null };
      intents.set(z.id, { type: 'Sleep' });
      offered.push(z);
    }
  }

  let dialogue: StoryOffer['dialogue'] = null;
  if (s.dialogue) {
    const node = DIALOGUE_NODES.get(`${s.dialogue.id}#${s.dialogue.node}`);
    const npcId = st.dialogues[s.dialogue.id]?.npcId;
    // Розмова з NPC — його ім'я; подія в дорозі — її назва.
    const speakerKey = npcId === undefined ? nameKey(s.dialogue.id) : node?.speaker === 'npc' ? nameKey(npcId) : null;
    // GAME-179: хто говорить — для портрета. Репліка гравця — 'player' (його голова), подія в дорозі й сцена без NPC — оповідач (null).
    const speakerId = npcId === undefined ? null : node?.speaker === 'npc' ? npcId : 'player';
    // GAME-180: вузол `offer` розмови з просильником, поки прохання ще не взято, — картка прохання (цілі-картинки й нагорода) над кнопками «Беруся» / «Пізніше».
    const rq = npcId !== undefined ? requestOf(npcId, REQUESTS, s.flags) : undefined;
    const card = rq && s.dialogue.node === offerNodeOf(rq) && requestStatus(s.flags, rq) === 'available'
      ? { id: rq.id, titleKey: rq.titleKey, goalKey: rq.goalKey, goals: rq.targets.map((t) => ({ icon: t.icon, labelKey: t.labelKey })), reward: rq.reward }
      : undefined;
    // GAME-230: «Подарувати» — що з триманого герой може вручити саме цьому мешканцю зараз (без останніх дров, потрібних квесту, і не вдруге за день). Команди дару в перебір не входять.
    const gifts: OfferAction[] = [];
    if (view.mapFirst && npcId !== undefined && defs.friendship) {
      for (const itemId of giftOptions(s, npcId, dayOf(sim.clock), defs.friendship)) {
        const m = { type: 'GiveGift', npcId, itemId } as Move;
        if (!dispatch(s, { ...m, commandId: nextCommandId(s) } as Command, defs, undefined, dayOf(sim.clock)).ok) continue;
        const a: OfferAction = { id: `gift|${npcId}|${itemId}`, kind: 'gift', key: nameKey(itemId) };
        intents.set(a.id, m);
        gifts.push(a);
      }
    }
    dialogue = { speakerKey, speakerId, key: node?.textKey ?? null, answers: offered, ...(card ? { request: card } : {}), ...(gifts.length > 0 ? { gifts } : {}) };
  }

  // GAME-183: об'єкт мапи питає «що саме?» — варіанти в рамці вибору (те саме місце, що рамка розмови), а не кнопки ☰. Лише на мапі й без розмови.
  if (!dialogue && view.mapFirst && view.choice) {
    const spot = resolveSpot(sim, defs, view.choice);
    // Поїздка-підтвердження: ланцюг ходів — одна відповідь, її вигляд і намір — за останнім ходом (куди приїдемо); увесь ланцюг шле main.act.
    const options = spot?.confirm ? spot.moves.slice(-1) : spot?.options;
    if (options) {
      const answers = options.map((m): OfferAction => { const a: OfferAction = { id: idOf(m, s), ...describe(m, defs, s, weather) }; intents.set(a.id, m); return a; });
      // GAME-185: «Що беремо?» — купівлі, на які бракує грошей, лишаються вимкненими рядками з причиною (без наміру: активувати їх нічим), а не зникають.
      if (view.choice === 'obj.buy') for (const { move, shortCents } of unaffordableBuys(s, defs)) answers.push({ id: `locked|${idOf(move, s)}`, ...describe(move, defs, s, weather), shortCents });
      answers.splice(answers.findIndex((a) => a.shortCents !== undefined) < 0 ? answers.length : answers.findIndex((a) => a.shortCents !== undefined), 0, { id: CHOICE_CANCEL_ID, kind: 'cancel', key: null });
      dialogue = { speakerKey: null, speakerId: null, key: choicePrompt(view.choice), ui: true, answers };
    }
  }

  return {
    intents,
    offer: {
      ...base,
      stage: chapterComplete(s, st) ? 'ended' : 'play',   // GAME-144: кінець розділу — завершений квест-кінець, не прапорець
      characters: [],
      locationKey: nameKey(p.locationId),
      quests,
      dialogue,
      actions: dialogue ? [] : offered,
      packing: dialogue ? null : packingOffer(s, defs, intents, view.overflow === true),
      locked,
    },
  };
}
