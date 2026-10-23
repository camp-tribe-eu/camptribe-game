// Збирає сюжет для ядра (StoryDefs) з перевіреного content/ (GAME-29). Валідатор доводить
// досяжність і відсутність тупиків; тут — лише переклад полів у форму ядра. Те, чого ядро ще не
// вміє (`deliver`, продаж у NPC), не пропускається мовчки: збірка падає з назвою поля (закон 4).
import { stateHash } from '../core/hash';
import type { CondDef, DialogueDef, EffectDef, ObjectiveDef, QuestDef, StoryDefs, WhenDef } from '../core/defs';
import animals from '../../content/animals.json';
import locations from '../../content/locations.json';
import meta from '../../content/meta.json';
import npcs from '../../content/npcs.json';
import profiles from '../../content/profiles.json';
import quests from '../../content/quests.json';
import roads from '../../content/roads.json';
import transports from '../../content/transports.json';

interface RawWhen { profiles?: string[]; transports?: string[]; animals?: string[] }
interface RawQuest {
  id: string; optional: boolean; end?: boolean; locationId?: string; when?: RawWhen;
  requires?: { quests?: string[]; items?: string[] };
  objectives: { id: string; kind: string; target: string; required: boolean; when?: RawWhen }[];
  transitions: { on: string; to: string; choiceKey?: string; when?: RawWhen }[];
  reward?: { grantId: string; money?: number; items?: { item: string; qty: number }[]; once?: boolean };
}
interface RawDialogue {
  id: string; npcId: string; start: string;
  nodes: { id: string; end?: boolean; next?: string; choices?: { next: string; when?: CondDef; effects?: EffectDef[] }[] }[];
}
export interface RawContent {
  meta: { start: string };
  profiles: { id: string; transports?: string[] }[];
  transports: { id: string }[];
  animals: { id: string; transports?: string[] }[];
  locations: { id: string; unlockedBy?: string; when?: RawWhen; items?: string[] }[];
  npcs: { id: string; locationId: string; unlockedBy?: string; when?: RawWhen; sells?: string[] }[];
  quests: RawQuest[];
  dialogues: RawDialogue[];
  roads?: { id: string; from: string; to: string; twoWay?: boolean; ways: { transport: string; minutes: number; cents: number }[] }[];
}

const when = (w: RawWhen | undefined): { when?: WhenDef } => (w ? { when: w } : {});

function objective(qid: string, o: RawQuest['objectives'][number]): ObjectiveDef {
  if (o.kind !== 'visit' && o.kind !== 'talk' && o.kind !== 'collect') throw new Error(`story: ${qid}.${o.id}: objective kind "${o.kind}" is not supported by the core yet`);
  return { id: o.id, kind: o.kind, target: o.target, required: o.required, ...when(o.when) };
}

function dialogue(d: RawDialogue): DialogueDef {
  return {
    npcId: d.npcId,
    start: d.start,
    nodes: Object.fromEntries(d.nodes.map((n) => [n.id, {
      ...(n.end === true ? { end: true as const } : {}),
      ...(n.next !== undefined ? { next: n.next } : {}),
      ...(n.choices ? { choices: n.choices.map((c) => ({ next: c.next, ...(c.when ? { when: c.when } : {}), effects: c.effects ?? [] })) } : {}),
    }])),
  };
}

function quest(q: RawQuest): QuestDef {
  return {
    optional: q.optional,
    end: q.end === true,
    ...(q.locationId ? { locationId: q.locationId } : {}),
    ...when(q.when),
    ...(q.requires ? { requires: { quests: q.requires.quests ?? [], items: q.requires.items ?? [] } } : {}),
    objectives: q.objectives.map((o) => objective(q.id, o)),
    transitions: q.transitions.map((t) => {
      if (t.on !== 'complete' && t.on !== 'decline') throw new Error(`story: ${q.id}→${t.to}: transition "${t.on}"`);
      return { on: t.on, to: t.to, choice: t.choiceKey !== undefined, ...when(t.when) };
    }),
    // `money` у контенті — центи (CR-040, DC-008).
    ...(q.reward ? { reward: { grantId: q.reward.grantId, moneyCents: q.reward.money ?? 0, items: (q.reward.items ?? []).map((i) => ({ itemId: i.item, qty: i.qty })) } } : {}),
  };
}

export function compileStory(c: RawContent): StoryDefs {
  for (const n of c.npcs) if (n.sells?.length) throw new Error(`story: ${n.id}.sells: buying from NPCs is not supported by the core yet`);
  return {
    start: c.meta.start,
    profiles: Object.fromEntries(c.profiles.map((p) => [p.id, p.transports ? { transports: p.transports } : {}])),
    transports: c.transports.map((t) => t.id),
    animals: Object.fromEntries(c.animals.map((a) => [a.id, a.transports ? { transports: a.transports } : {}])),
    locations: Object.fromEntries(c.locations.map((l) => [l.id, { ...(l.unlockedBy ? { unlockedBy: l.unlockedBy } : {}), ...when(l.when), items: l.items ?? [] }])),
    npcs: Object.fromEntries(c.npcs.map((n) => [n.id, { locationId: n.locationId, ...(n.unlockedBy ? { unlockedBy: n.unlockedBy } : {}), ...when(n.when) }])),
    quests: Object.fromEntries(c.quests.map((q) => [q.id, quest(q)])),
    dialogues: Object.fromEntries(c.dialogues.map((d) => [d.id, dialogue(d)])),
    roads: (c.roads ?? []).flatMap((r) => {
      const ways = Object.fromEntries(r.ways.map((w) => [w.transport, { minutes: w.minutes, cents: w.cents }]));
      return r.twoWay ? [{ from: r.from, to: r.to, ways }, { from: r.to, to: r.from, ways }] : [{ from: r.from, to: r.to, ways }];
    }),
  };
}

// Тека dialogue/ — один файл на діалог (DC-011); glob, щоб новий файл не треба було реєструвати руками.
const dialogueFiles = import.meta.glob<RawDialogue>('../../content/dialogue/*.json', { eager: true, import: 'default' });

export const CONTENT: RawContent = {
  meta, profiles, transports, animals, locations, npcs, quests: quests as RawQuest[], roads,
  dialogues: Object.keys(dialogueFiles).sort().map((k) => dialogueFiles[k] as RawDialogue),
};
export const STORY: StoryDefs = compileStory(CONTENT);
/** Відбиток сюжету для сейву (діагностика сумісності, рецензія TL). */
export const STORY_REV: string = stateHash(STORY);
