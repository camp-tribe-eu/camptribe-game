// Усі дії, які гравець може спробувати в стані, — спільні для повного перебору (story.test) і
// бота (bot.ts). Ядро саме відмовить у недоречному; тут лише перелік спроб.
import type { Command } from '../core/commands';
import type { CoreDefs, StoryDefs } from '../core/defs';
import { canonical } from '../core/hash';
import type { GameState } from '../core/state';
import { eventSeenFlag } from '../core/story';

export type Move = Command extends infer C ? (C extends Command ? Omit<C, 'commandId'> : never) : never;

export function moves(s: GameState, defs: CoreDefs): Move[] {
  const st = defs.story as StoryDefs;
  const out: Record<string, unknown>[] = [];
  for (const id of Object.keys(st.locations)) out.push({ type: 'Visit', locationId: id });
  for (const id of Object.keys(st.npcs)) out.push({ type: 'Talk', npcId: id });
  // Подія в дорозі — хід СЕРЕДОВИЩА (кидок симуляції), а не гравця: перебір бачить і «сталась», і «ні».
  for (const [id, d] of Object.entries(st.dialogues)) if (d.trigger) out.push({ type: 'RoadEvent', eventId: id });
  // StartScene — хід СЮЖЕТУ (гачок кінця дня), не гравця; тут його навмисно немає: 16 проходжень сцени множили б простір станів
  // (shop.test вибухає), а законність доводять fireplace.test і day2.test на справжньому шляху.
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
  // Добра справа з прапорцем (GAME-170 зріз 2: obj.litter) — хід МАПИ, не меню: тут його навмисно немає, бо незалежний прапорець
  // подвоював би простір станів повного перебору (shop.test > 50 000); його законність доводить director.test на справжньому шляху.
  for (const [id, d] of Object.entries(defs.interactions)) if (!d.flags?.length) out.push({ type: 'Interact', targetId: id });
  // Висушити (GAME-73) — лише те, що мокре: інакше кожен стан мав би ще вісім заздалегідь марних спроб. Намокає спорядження
  // лише в дорозі симуляції (sim.step), тож у повному переборі ядра (без погоди) цих ходів немає — їх доводить gear.test.
  for (const [id, g] of Object.entries(s.gear)) if (g.wet) out.push({ type: 'DryGear', itemId: id });
  // Ремонт (GAME-72) читає навички. Поки в контенті ремонтів немає, цих ходів немає; з'являться — перевірка
  // «навички не змінюють жодного ходу» (story.test) почервоніє, і progressKey доведеться переглянути.
  for (const id of Object.keys(defs.repairs ?? {})) out.push({ type: 'Repair', targetId: id });
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
 * Ключ стану для перебору й меню: без лічильників команд і без навичок (GAME-72). Навички й практика
 * ростуть майже від кожної дії — з ними однакові за сюжетом стани множились би без кінця (перебір вибухнув би).
 * Чесно лише доти, доки жоден хід moves() не залежить від навичок: це доводить story.test
 * («навички не змінюють жодного ходу») на кожному досяжному стані — інакше зелене тут нічого не доводить.
 */
/** Поля, яких не бачить ключ перебору. Єдине джерело і для progressView, і для сторожа витоку в story.test. */
// GAME-181: `progress` (XP, ОМ, ключі нагород) — похідне від уже відстежуваного (квести, взаємодії, події в дорозі) і не читається жодним ходом; без цього ОМ за
// кожну подію в дорозі множили б стани перебору, як f.seen-* (див. seenFlags). Що жоден хід від нього не залежить, доводить сторож витоку в story.test (варіанти maxed/zeroed).
export const PROGRESS_IGNORED = ['processed', 'seq', 'skills', 'practice', 'progress'] as const satisfies readonly (keyof GameState)[];
// `progress` у стані необов'язкове (поля немає, доки нічого не нараховано): обнуляємо лише наявні поля — ключ не вигадує полів, яких у стані нема.
export const progressView = (s: GameState): object => ({ ...s, ...Object.fromEntries(PROGRESS_IGNORED.filter((k) => k in s).map((k) => [k, null])) });
export const progressKey = (s: GameState): string => canonical(progressView(s));

/**
 * GAME-110 · вигляд стану для ПОВНОГО ПЕРЕБОРУ в тестах: progressView без пам'ятних фактів (`story.memorable`). П'ять
 * пам'ятних виборів незалежні, тож разом вони множать простір станів у 2⁵+ разів — перебір вибухав (66 тис. станів замість 886).
 * Чесно, бо пам'ятні факти косметичні: їх читають лише вибори, чиє піддерево до кінця розмови ставить тільки пам'ятні
 * факти й більше нічого не змінює (доводить src/content/memory-flags.test.ts, «косметичні»). Тож два стани, що різняться
 * лише ними, мають ті самі сюжетні наслідки, а самі гілки-згадки проходить той самий тест (2⁵ комбінацій до кінця розділу).
 * Меню (outcomeKey = progressKey) цього вигляду НЕ вживає: два вибори, що різняться лише пам'ятним фактом, — різні кнопки.
 */
export function exploreView(s: GameState, st: Pick<StoryDefs, 'memorable' | 'dialogues'>): object {
  const mem = new Set([...(st.memorable ?? []), ...seenFlags(st)]);
  if (mem.size === 0) return progressView(s);
  const npcMemory = Object.fromEntries(Object.entries(s.npcMemory).map(([npc, facts]) => [npc, facts.filter((f) => !mem.has(f))] as const).filter(([, facts]) => facts.length > 0));
  return { ...progressView(s), flags: s.flags.filter((f) => !mem.has(f)), npcMemory };
}

/**
 * GAME-108 · прапорці «подія в дорозі вже була» (f.seen-*) теж поза ключем перебору. Подій на дорозі дев'ять+, кожна раз за
 * гру, тож будь-яка підмножина «вже були» множила б простір станів до 2⁹ разів (перебір не закінчувався за 10 хв). Чесно,
 * бо f.seen-* читає лише ядро (eventEligible) — тобто лише хід RoadEvent, а він хід везіння: шлях до кінця на нього не
 * покладається. Жодна умова контенту f.seen-* не читає — це стереже src/content/road-events.test.ts (з мутацією).
 */
const seenFlags = (st: Pick<StoryDefs, 'dialogues'>): string[] =>
  Object.entries(st.dialogues ?? {}).filter(([, d]) => d.trigger).map(([id]) => eventSeenFlag(id));

/**
 * Хід, що залежить від везіння (SIM-EV-003): КОЖНА подія в дорозі. Симуляція кидає лише після дороги з
 * хвилинами (не на першому приїзді, не в сюжеті без доріг) і ділить шанс між кількома подіями місця, тож
 * навіть «chance: 100» не гарантована (рецензія eb12626). Перебір заходить у стани після неї, але шлях до
 * кінця розділу на неї не покладається.
 */
export function isLuckMove(m: Move): boolean {
  return m.type === 'RoadEvent';
}
