// Усі дії, які гравець може спробувати в стані, — спільні для повного перебору (story.test) і
// бота (bot.ts). Ядро саме відмовить у недоречному; тут лише перелік спроб.
import type { Command } from '../core/commands';
import type { CoreDefs, StoryDefs } from '../core/defs';
import type { GameState } from '../core/state';

export type Move = Command extends infer C ? (C extends Command ? Omit<C, 'commandId'> : never) : never;

export function moves(s: GameState, defs: CoreDefs): Move[] {
  const st = defs.story as StoryDefs;
  const out: Record<string, unknown>[] = [];
  for (const id of Object.keys(st.locations)) out.push({ type: 'Visit', locationId: id });
  for (const id of Object.keys(st.npcs)) out.push({ type: 'Talk', npcId: id });
  // Подія в дорозі — хід СЕРЕДОВИЩА (кидок симуляції), а не гравця: перебір бачить і «сталась», і «ні».
  for (const [id, d] of Object.entries(st.dialogues)) if (d.trigger) out.push({ type: 'RoadEvent', eventId: id });
  if (s.dialogue) {
    const node = st.dialogues[s.dialogue.id]?.nodes[s.dialogue.node];
    (node?.choices ?? []).forEach((_, i) => out.push({ type: 'Choose', choice: i }));
    out.push({ type: 'Continue' });
  }
  for (const l of Object.values(st.locations)) for (const id of l.items) out.push({ type: 'Pickup', itemId: id });
  for (const id of Object.keys(defs.items)) {
    if (!s.inventory[id]) out.push({ type: 'BuyItem', itemId: id }); // лише перший примірник — інакше простір станів нескінченний
    out.push({ type: 'SellItem', itemId: id });
  }
  for (const id of Object.keys(defs.interactions)) out.push({ type: 'Interact', targetId: id });
  for (const [qid, p] of Object.entries(s.quests)) {
    if (p.status !== 'active') continue;
    for (const type of ['CompleteQuest', 'DeclineQuest']) {
      out.push({ type, questId: qid });
      for (const t of st.quests[qid]?.transitions ?? []) out.push({ type, questId: qid, to: t.to });
    }
  }
  return out as Move[];
}

/**
 * Хід, що залежить від везіння (SIM-EV-003): подія в дорозі з шансом < 100. Перебір проходить і в стани
 * після неї, але шлях до кінця розділу не сміє на неї покладатись — кінець мусить бути досяжним без удачі.
 */
export function isLuckMove(m: Move, defs: CoreDefs): boolean {
  return m.type === 'RoadEvent' && (defs.story?.dialogues[m.eventId]?.trigger?.chance ?? 0) < 100;
}
