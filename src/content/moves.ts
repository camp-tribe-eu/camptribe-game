// Усі дії, які гравець може спробувати в стані, — спільні для повного перебору (story.test) і
// бота (bot.ts). Ядро саме відмовить у недоречному; тут лише перелік спроб.
import type { Command } from '../core/commands';
import type { CoreDefs, StoryDefs } from '../core/defs';
import { canonical } from '../core/hash';
import type { GameState } from '../core/state';
import { eventSeenFlag } from '../core/story';
import { ERRAND_PREFIX } from './errands';

/**
 * Прапорець, косметичний для сюжету: прохання (f.req-*, GAME-180) і доручення родині (f.errand-*, GAME-202). Жоден квест їх не читає (валідатор REQUEST_GATES_QUEST;
 * доручення лише веде виконавця сцени до справи хвилі — ядро закриває її тією ж CompleteTask), тож перебір і бот не множать на них простір станів.
 */
export const cosmeticFlag = (f: string): boolean => f.startsWith('f.req-') || f.startsWith(ERRAND_PREFIX);

export type Move = Command extends infer C ? (C extends Command ? Omit<C, 'commandId'> : never) : never;

const chatMemo = new WeakMap<StoryDefs, ReadonlySet<string>>();
/**
 * GAME-179 · NPC «лише побалакати»: його діалог не ставить жодного прапорця й не рухає жодного квесту, і сам він не ціль завдань. Така розмова
 * не змінює сюжету, тож не входить у перелік спроб перебору й бота (інакше кожен із цих NPC множив би простір станів: shop.test вибухає), а меню ☰ не
 * засмічується кнопками — говорять із ними на мапі. Ядро розмову приймає як завжди (Talk), а що вона справді нічого не чіпає, доводить npc-talk.test.
 */
export function chatOnlyNpcs(st: StoryDefs): ReadonlySet<string> {
  const hit = chatMemo.get(st);
  if (hit) return hit;
  const involved = new Set<string>();
  for (const q of Object.values(st.quests)) for (const o of q.objectives) { involved.add(o.target); }
  const out = new Set<string>();
  for (const d of Object.values(st.dialogues)) {
    if (d.npcId === undefined || involved.has(d.npcId)) continue;
    // GAME-180: розмова просильника ставить ЛИШЕ прапорці прохань (f.req-*) — вони косметичні для сюжету (progressView їх не розрізняє, валідатор REQUEST_GATES_QUEST
    // забороняє квестам їх читати): ні квестів, ні предметів, ні грошей така розмова не змінює. Тож для перебору й бота вона теж «лише побалакати»: без цього чотири
    // розмови з гілками додавали б до кожного стану табору десятки Choose/Continue — бот на 80 кроках не доходив до кінця жодного разу з 300 (save-size.test),
    // а повний перебір дня 3 вибухав. Повний шлях кожного прохання на ядрі доводить requests.test, графи розмов — валідатор (DIALOGUE_DEAD_END, REQUEST_*).
    const effects = Object.values(d.nodes).flatMap((n) => (n.choices ?? []).flatMap((c) => c.effects));
    const request = effects.length > 0 && effects.every((e) => 'setFlag' in e && cosmeticFlag(e.setFlag));
    const inert = Object.values(d.nodes).every((n) => (n.choices ?? []).every((c) => c.effects.length === 0 || request) && (!n.branches || request));
    if (inert) out.add(d.npcId);
  }
  chatMemo.set(st, out);
  return out;
}

/**
 * Усі спроби гравця в стані. `withRequests` (GAME-180): чи включати вибір-хаб прохання (умова читає f.req-*). Меню й рамка розмови (story-offer) показують його —
 * інакше прохання Елізи не взяти; перебір і бот викликають без нього (косметика, див. нижче).
 */
export function moves(s: GameState, defs: CoreDefs, withRequests = false): Move[] {
  const st = defs.story as StoryDefs;
  const out: Record<string, unknown>[] = [];
  const chat = chatOnlyNpcs(st);
  for (const id of Object.keys(st.locations)) out.push({ type: 'Visit', locationId: id });
  for (const id of Object.keys(st.npcs)) if (!chat.has(id)) out.push({ type: 'Talk', npcId: id });
  // Подія в дорозі — хід СЕРЕДОВИЩА (кидок симуляції), а не гравця: перебір бачить і «сталась», і «ні».
  for (const [id, d] of Object.entries(st.dialogues)) if (d.trigger) out.push({ type: 'RoadEvent', eventId: id });
  // StartScene — хід СЮЖЕТУ (гачок кінця дня), не гравця; тут його навмисно немає: 16 проходжень сцени множили б простір станів
  // (shop.test вибухає), а законність доводять fireplace.test і day2.test на справжньому шляху.
  if (s.dialogue) {
    const node = st.dialogues[s.dialogue.id]?.nodes[s.dialogue.node];
    // GAME-180: вибір, що відкриває прохання (умова читає f.req-*: хаб Елізи «Є щось, із чим допомогти?»), — не хід сюжету, а косметика: перебір і бот його не пропонують
    // (як розмови просильників вище; меню гравця — з withRequests). Індекси решти виборів не міняються. Шлях прохання й відсутність тупиків у ньому доводить requests.test.
    (node?.choices ?? []).forEach((c, i) => { const w = JSON.stringify(c.when ?? null); if (withRequests || !(w.includes('"f.req-') || w.includes(`"${ERRAND_PREFIX}`))) out.push({ type: 'Choose', choice: i }); });
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
export const PROGRESS_IGNORED = ['processed', 'seq', 'skills', 'practice', 'progress', 'stickers'] as const satisfies readonly (keyof GameState)[];
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
export function exploreView(s: GameState, st: Pick<StoryDefs, 'memorable' | 'requestFlags' | 'dialogues'>): object {
  const mem = new Set([...(st.memorable ?? []), ...(st.requestFlags ?? []), ...seenFlags(st)]);
  if (mem.size === 0) return progressView(s);
  const npcMemory = Object.fromEntries(Object.entries(s.npcMemory).map(([npc, facts]) => [npc, facts.filter((f) => !mem.has(f))] as const).filter(([, facts]) => facts.length > 0));
  // GAME-180: дотик до цілі прохання видає разову нагороду (grantId `rw.req-…`, 0 центів) — теж косметика; без цього вісім цілей давали б 2⁸ станів у перебору «меню + сцена».
  const grants = (st.requestFlags?.length ?? 0) > 0 ? s.grants.filter((g) => !g.startsWith('rw.req-')) : s.grants;
  return { ...progressView(s), flags: s.flags.filter((f) => !mem.has(f)), grants, npcMemory };
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
