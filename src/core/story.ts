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
import type { QuestDef, RewardDef, StoryDefs, WhenDef } from './defs';
import type { GameEvent } from './commands';
import type { PlayerState, QuestProgress, RejectCode } from './state';

export const NO_ANIMAL = 'animal.none';

export type StoryCommand =
  | { readonly type: 'CreateCharacter'; readonly commandId: string; readonly profileId: string; readonly transportId: string; readonly animalId?: string }
  | { readonly type: 'Visit'; readonly commandId: string; readonly locationId: string }
  | { readonly type: 'Talk'; readonly commandId: string; readonly npcId: string }
  | { readonly type: 'Pickup'; readonly commandId: string; readonly itemId: string }
  | { readonly type: 'CompleteQuest'; readonly commandId: string; readonly questId: string; readonly to?: string }
  | { readonly type: 'DeclineQuest'; readonly commandId: string; readonly questId: string; readonly to?: string };

export interface StoryDraft {
  moneyCents: number;
  inventory: Record<string, number>;
  grants: string[];
  events: GameEvent[];
  player: PlayerState | null;
  quests: Record<string, QuestProgress>;
  campaignEnded: boolean;
}

const own = <T>(o: Readonly<Record<string, T>>, k: string): T | undefined => (Object.hasOwn(o, k) ? o[k] : undefined);
const isCents = (n: number): boolean => Number.isSafeInteger(n) && n >= 0;

export function matches(when: WhenDef | undefined, p: PlayerState): boolean {
  if (!when) return true;
  return (!when.profiles || when.profiles.includes(p.profileId))
    && (!when.transports || when.transports.includes(p.transportId))
    && (!when.animals || when.animals.includes(p.animalId));
}

const completed = (d: StoryDraft, questId: string | undefined): boolean => questId === undefined || own(d.quests, questId)?.status === 'completed';

export function locationOpen(st: StoryDefs, d: StoryDraft, p: PlayerState, id: string): boolean {
  const loc = own(st.locations, id);
  return !!loc && matches(loc.when, p) && completed(d, loc.unlockedBy);
}

export function npcOpen(st: StoryDefs, d: StoryDraft, p: PlayerState, id: string): boolean {
  const npc = own(st.npcs, id);
  return !!npc && matches(npc.when, p) && completed(d, npc.unlockedBy) && locationOpen(st, d, p, npc.locationId);
}

/** Цілі квесту, що існують для цього гравця. */
const objectivesFor = (q: QuestDef, p: PlayerState) => q.objectives.filter((o) => matches(o.when, p));

export function objectiveDone(d: StoryDraft, questId: string, o: QuestDef['objectives'][number]): boolean {
  if (o.kind === 'collect') return (own(d.inventory, o.target) ?? 0) >= 1;
  return own(d.quests, questId)?.done.includes(o.id) ?? false;
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
    const hits = objectivesFor(q, p).filter((o) => o.kind === kind && o.target === target && !prog.done.includes(o.id)).map((o) => o.id);
    if (hits.length) d.quests = { ...d.quests, [qid]: { ...prog, done: [...prog.done, ...hits].sort() } };
  }
}

function giveReward(d: StoryDraft, commandId: string, questId: string, r: RewardDef): RejectCode | null {
  if (d.grants.includes(r.grantId)) return null; // нагорода — рівно раз за grantId (TD-004); квест усе одно завершено
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
function leave(st: StoryDefs, d: StoryDraft, p: PlayerState, cmd: { commandId: string; questId: string; to?: string }, on: 'complete' | 'decline'): RejectCode | null {
  const q = own(st.quests, cmd.questId);
  if (!q || !matches(q.when, p)) return 'UNKNOWN_TARGET';
  if (own(d.quests, cmd.questId)?.status !== 'active') return 'QUEST_NOT_ACTIVE';
  if (on === 'decline' && !q.optional) return 'QUEST_NOT_OPTIONAL';
  if (on === 'complete' && objectivesFor(q, p).some((o) => o.required && !objectiveDone(d, cmd.questId, o))) return 'QUEST_OBJECTIVES_OPEN';

  const exits = exitsFor(st, q, on, p);
  let to: string | undefined;
  if (cmd.to !== undefined) {
    if (!exits.some((t) => t.to === cmd.to)) return 'INVALID_CHOICE';
    to = cmd.to;
  } else if (exits.length) {
    to = exits.find((t) => !t.choice)?.to;
    if (to === undefined) return 'INVALID_CHOICE'; // лише вибори — гравець мусить назвати один
  } else if (!(on === 'complete' && q.end)) {
    return 'QUEST_NO_EXIT'; // тупик: валідатор не мав цього пропустити
  }

  const prev = own(d.quests, cmd.questId) as QuestProgress;
  d.quests = { ...d.quests, [cmd.questId]: { ...prev, status: on === 'complete' ? 'completed' : 'declined' } };
  if (on === 'complete' && q.reward) {
    const bad = giveReward(d, cmd.commandId, cmd.questId, q.reward);
    if (bad) return bad;
  }
  if (to === undefined) {
    d.campaignEnded = true;
    return null;
  }
  const target = own(st.quests, to) as QuestDef;
  const req = target.requires;
  if (req && (req.quests.some((r) => !completed(d, r)) || req.items.some((i) => (own(d.inventory, i) ?? 0) < 1))) return 'QUEST_REQUIRES_UNMET';
  // Повторний вхід (цикл у графі, валідатор його дозволяє за наявності виходу — cycle-exit) знову
  // робить квест активним із чистими цілями; нагорода за grantId однаково не повториться.
  if (own(d.quests, to)?.status !== 'active') d.quests = { ...d.quests, [to]: { status: 'active', done: [] } };
  return null;
}

export function applyStory(cmd: StoryCommand, d: StoryDraft, st: StoryDefs | undefined, isId: (s: unknown) => boolean): RejectCode | null {
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
    return null;
  }

  const p = d.player;
  if (!p) return 'NO_CHARACTER';
  switch (cmd.type) {
    case 'Visit': {
      if (!isId(cmd.locationId)) return 'INVALID_COMMAND';
      if (!own(st.locations, cmd.locationId)) return 'UNKNOWN_TARGET';
      if (!locationOpen(st, d, p, cmd.locationId)) return 'LOCKED';
      d.player = { ...p, locationId: cmd.locationId };
      mark(st, d, d.player, 'visit', cmd.locationId);
      return null;
    }
    case 'Talk': {
      if (!isId(cmd.npcId)) return 'INVALID_COMMAND';
      const npc = own(st.npcs, cmd.npcId);
      if (!npc) return 'UNKNOWN_TARGET';
      if (!npcOpen(st, d, p, cmd.npcId)) return 'LOCKED';
      if (p.locationId !== npc.locationId) return 'NOT_HERE';
      mark(st, d, p, 'talk', cmd.npcId);
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
      if (!isId(cmd.questId) && !/^ST-\d{3}$/.test(cmd.questId)) return 'INVALID_COMMAND';
      if (cmd.to !== undefined && !isId(cmd.to) && !/^ST-\d{3}$/.test(cmd.to)) return 'INVALID_COMMAND';
      return leave(st, d, p, cmd, cmd.type === 'CompleteQuest' ? 'complete' : 'decline');
  }
}
