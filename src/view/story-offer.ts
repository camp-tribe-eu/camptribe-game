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
import { canonical } from '../core/hash';
import type { SimState } from '../core/sim';
import { initialState, type GameState } from '../core/state';
import { matches } from '../core/story';
import { CONTENT } from '../content/story';
import { moves, type Move } from '../content/moves';
import items from '../../content/items.json';
import type { OfferAction, OfferCharacter, StoryOffer } from '../ui/story-types';

const NO_ANIMAL = 'animal.none';

interface Named { id: string; nameKey?: string; titleKey?: string }
interface RawNode { id: string; speaker?: string; textKey?: string; choices?: { textKey?: string }[] }
interface RawTransition { on: string; to: string; choiceKey?: string }

/** id сутності → ключ її назви в content/locales. Невідомий id — null (UI покаже лише тип запису). */
const NAMES: ReadonlyMap<string, string> = new Map(
  ([...CONTENT.profiles, ...CONTENT.transports, ...CONTENT.animals, ...CONTENT.locations, ...CONTENT.npcs, ...CONTENT.quests, ...items] as Named[])
    .flatMap((x) => { const k = x.nameKey ?? x.titleKey; return k ? [[x.id, k] as const] : []; }),
);
export const nameKey = (id: string | null | undefined): string | null => (id ? NAMES.get(id) ?? null : null);

const DIALOGUE_NODES: ReadonlyMap<string, RawNode> = new Map(
  CONTENT.dialogues.flatMap((d) => (d.nodes as RawNode[]).map((n) => [`${d.id}#${n.id}`, n] as const)),
);
const TRANSITIONS: ReadonlyMap<string, readonly RawTransition[]> = new Map(
  CONTENT.quests.map((q) => [q.id, q.transitions as RawTransition[]] as const),
);

/** Ключ стану для порівняння наслідків: без лічильників команд (як у бота). */
export const outcomeKey = (s: GameState): string => canonical({ ...s, processed: null, seq: null });

const tryMove = (s: GameState, m: Move | Omit<Command, 'commandId'>, defs: CoreDefs): GameState | null => {
  const r = dispatch(s, { ...m, commandId: nextCommandId(s) } as Command, defs);
  return r.ok ? r.state : null;
};

/**
 * id дії — сама спроба канонічним рядком: стабільний між кадрами, тож клік не влучить у чужу дію.
 * Відповідь у розмові ще й прив'язана до вузла (рецензія: «відповідь 0» є в кожному вузлі — без
 * цього затиснутий Enter проходив би розмову сам).
 */
const idOf = (m: Move, s: GameState): string =>
  canonical(m.type === 'Choose' || m.type === 'Continue' ? { ...m, at: s.dialogue } : m);

function describe(m: Move, defs: CoreDefs, s: GameState): Omit<OfferAction, 'id'> {
  switch (m.type) {
    case 'Visit': return { kind: 'visit', key: nameKey(m.locationId) };
    case 'Talk': return { kind: 'talk', key: nameKey(m.npcId) };
    case 'Pickup': return { kind: 'pickup', key: nameKey(m.itemId) };
    case 'BuyItem': return { kind: 'buy', key: nameKey(m.itemId), priceCents: defs.items[m.itemId]?.buyCents ?? 0 };
    case 'SellItem': return { kind: 'sell', key: nameKey(m.itemId), priceCents: defs.items[m.itemId]?.sellCents ?? 0 };
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
export function menuMoves(s: GameState, defs: CoreDefs): { move: Move; next: GameState }[] {
  const talking = s.dialogue !== null;
  const here = outcomeKey(s);
  const seen = new Set<string>();
  const out: { move: Move; next: GameState }[] = [];
  for (const m of moves(s, defs)) {
    if (m.type === 'Interact') continue;
    if (talking && m.type !== 'Choose' && m.type !== 'Continue') continue;
    const next = tryMove(s, m, defs);
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

export function storyOffer(sim: SimState, defs: CoreDefs): Offered {
  const s = sim.game;
  const st = defs.story as StoryDefs;
  const intents = new Map<string, Move>();
  const journal = sim.journal.map((e) => ({ type: e.type, key: nameKey(e.ref), at: e.at }));
  const inventory = Object.entries(s.inventory).sort(([a], [b]) => a.localeCompare(b)).map(([id, qty]) => ({ key: nameKey(id) ?? id, qty }));
  const base = { moneyCents: s.moneyCents, inventory, journal };

  if (!s.player) {
    const choices = characterChoices(defs);
    for (const c of choices) intents.set(c.offer.id, c.intent);
    return { intents, offer: { ...base, stage: 'create', characters: choices.map((c) => c.offer), locationKey: null, quests: [], dialogue: null, actions: [] } };
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
  for (const { move } of menuMoves(s, defs)) {
    const a: OfferAction = { id: idOf(move, s), ...describe(move, defs, s) };
    intents.set(a.id, move);
    offered.push(a);
  }

  let dialogue: StoryOffer['dialogue'] = null;
  if (s.dialogue) {
    const node = DIALOGUE_NODES.get(`${s.dialogue.id}#${s.dialogue.node}`);
    const npcId = st.dialogues[s.dialogue.id]?.npcId;
    dialogue = { speakerKey: node?.speaker === 'npc' ? nameKey(npcId) : null, key: node?.textKey ?? null, answers: offered };
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
    },
  };
}
