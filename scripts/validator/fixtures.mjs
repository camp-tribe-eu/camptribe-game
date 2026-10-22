// Набір самотестів. Еталон — синтетичний міні-сюжет, НЕ контент гри.
// Кожен зламаний приклад — це еталон плюс одна навмисна поломка, і для нього заданий
// ТОЧНИЙ набір кодів, які мають спрацювати: ні менше (перевірка сліпа), ні більше (перевірка
// стріляє по сусідах). Знайшов дефект контенту в грі — додай сюди приклад, інакше він повернеться.

const LOCALE_KEYS = [
  'item.map', 'item.firewood', 'item.gift', 'item.ticket',
  'npc.ranger', 'npc.shopkeeper', 'loc.camp', 'loc.forest', 'loc.lake',
  'q.st-001', 'q.st-001.o1', 'q.st-002', 'q.st-002.o1', 'q.st-002.o2', 'q.st-002.o3',
  'q.st-003', 'q.st-003.o1', 'q.st-003.o2', 'q.st-004', 'q.st-004.o1',
  'ev.rain', 'ev.lost-dog', 'fact.fixture-campfire',
  ...['hello', 'hello.c1', 'hello.c2', 'help', 'help.c1', 'help.c2', 'thanks', 'bye'].map((k) => `dlg.fixture-ranger.${k}`),
];

// Діалог-еталон: умовні гілки на квест, прапорці (вкладені all/any, notFlag) і ефекти.
// hello: [ST-001 completed] → help | [без умови] → bye
// help:  [f.fixture-helped ∧ (¬f.fixture-met ∨ f.fixture-helped)] → thanks | [без умови] → bye
// thanks → bye (end)
const K = (k) => `dlg.fixture-ranger.${k}`;
function rangerDialogue() {
  return {
    id: 'dlg.fixture-ranger', npcId: 'npc.ranger', start: 'hello',
    nodes: [
      { id: 'hello', speaker: 'npc', textKey: K('hello'), choices: [
        { textKey: K('hello.c1'), next: 'help', when: { quest: 'ST-001', status: 'completed' },
          effects: [{ setFlag: 'f.fixture-helped' }, { completeObjective: { quest: 'ST-004', objective: 'talk-ranger' } }] },
        { textKey: K('hello.c2'), next: 'bye', effects: [{ setFlag: 'f.fixture-met' }, { startQuest: 'ST-003' }] },
      ] },
      { id: 'help', speaker: 'npc', textKey: K('help'), choices: [
        { textKey: K('help.c1'), next: 'thanks', when: { all: [{ flag: 'f.fixture-helped' }, { any: [{ notFlag: 'f.fixture-met' }, { flag: 'f.fixture-helped' }] }] } },
        { textKey: K('help.c2'), next: 'bye' },
      ] },
      { id: 'thanks', speaker: 'player', textKey: K('thanks'), next: 'bye' },
      { id: 'bye', speaker: 'npc', textKey: K('bye'), end: true },
    ],
  };
}

export const TODAY = '2026-10-22';

export function baseline() {
  return {
    meta: { start: 'ST-001', locales: ['uk', 'en'] },
    items: [
      { id: 'item.map', nameKey: 'item.map' },
      { id: 'item.firewood', nameKey: 'item.firewood' },
      { id: 'item.gift', nameKey: 'item.gift' },
    ],
    npcs: [
      { id: 'npc.ranger', nameKey: 'npc.ranger', locationId: 'loc.camp' },
      { id: 'npc.shopkeeper', nameKey: 'npc.shopkeeper', locationId: 'loc.camp', sells: ['item.gift'] },
    ],
    locations: [
      { id: 'loc.camp', nameKey: 'loc.camp' },
      { id: 'loc.forest', nameKey: 'loc.forest', unlockedBy: 'ST-001', items: ['item.firewood'] },
      { id: 'loc.lake', nameKey: 'loc.lake', unlockedBy: 'ST-002' },
    ],
    quests: [
      {
        id: 'ST-001', titleKey: 'q.st-001', optional: false, giverId: 'npc.ranger',
        objectives: [{ id: 'talk-ranger', textKey: 'q.st-001.o1', kind: 'talk', target: 'npc.ranger', required: true }],
        transitions: [{ on: 'complete', to: 'ST-002' }],
        reward: { grantId: 'rw.st-001', items: [{ item: 'item.map', qty: 1 }] },
      },
      {
        id: 'ST-002', titleKey: 'q.st-002', optional: false, requires: { items: ['item.map'] },
        objectives: [
          { id: 'visit-forest', textKey: 'q.st-002.o1', kind: 'visit', target: 'loc.forest', required: true },
          { id: 'collect-wood', textKey: 'q.st-002.o2', kind: 'collect', target: 'item.firewood', required: true },
          { id: 'deliver-wood', textKey: 'q.st-002.o3', kind: 'deliver', target: 'item.firewood', npcId: 'npc.ranger', required: true },
        ],
        transitions: [{ on: 'complete', to: 'ST-003' }],
        reward: { grantId: 'rw.st-002', money: 10 },
      },
      {
        id: 'ST-003', titleKey: 'q.st-003', optional: true,
        objectives: [
          { id: 'visit-lake', textKey: 'q.st-003.o1', kind: 'visit', target: 'loc.lake', required: true },
          { id: 'buy-gift', textKey: 'q.st-003.o2', kind: 'collect', target: 'item.gift', required: false },
        ],
        transitions: [{ on: 'complete', to: 'ST-004' }, { on: 'decline', to: 'ST-004' }],
        reward: { grantId: 'rw.st-003', money: 5 },
      },
      {
        id: 'ST-004', titleKey: 'q.st-004', optional: false, end: true, requires: { quests: ['ST-002'] },
        objectives: [{ id: 'talk-ranger', textKey: 'q.st-004.o1', kind: 'talk', target: 'npc.ranger', required: true }],
        transitions: [],
      },
    ],
    events: [
      { id: 'ev.rain', titleKey: 'ev.rain', repeatable: true },
      { id: 'ev.lost-dog', titleKey: 'ev.lost-dog', locationId: 'loc.forest', repeatable: false, reward: { grantId: 'rw.ev-lost-dog', money: 3 } },
    ],
    facts: [
      { id: 'fact.fixture-campfire', claimKey: 'fact.fixture-campfire', source: 'https://example.org/fixture-only', checkedAt: '2026-10-01', kind: 'regulation' },
    ],
    dialogues: [rangerDialogue()],
    locales: {
      uk: Object.fromEntries(LOCALE_KEYS.map((k) => [k, `[uk] ${k}`])),
      en: Object.fromEntries(LOCALE_KEYS.map((k) => [k, `[en] ${k}`])),
    },
  };
}

const q = (c, id) => c.quests.find((x) => x.id === id);

// Еталон комбінаторики: ДВА СИНТЕТИЧНІ профілі, не профілі гри (реальний перелік із 12 ще не
// передано, вигадувати його заборонено). 2 профілі × 2 транспорти × (без тварини | собака) = 8.
// Додано гілку лише для власника собаки, що повертається в основний сюжет.
const P_A = 'profile.fixture-a', P_B = 'profile.fixture-b';
const T_CAR = 'transport.fixture-car', T_BIKE = 'transport.fixture-bike';
const DOG = 'animal.fixture-dog';
const COMBO_KEYS = [P_A, P_B, T_CAR, T_BIKE, DOG, 'loc.dog-park', 'q.dog-walk', 'q.dog-walk.o1'];

export function comboBaseline() {
  const c = baseline();
  c.profiles = [P_A, P_B].map((id) => ({ id, nameKey: id }));
  c.transports = [T_CAR, T_BIKE].map((id) => ({ id, nameKey: id }));
  c.animals = [{ id: DOG, nameKey: DOG }];
  c.locations.push({ id: 'loc.dog-park', nameKey: 'loc.dog-park', when: { animals: [DOG] } });
  c.quests.push({
    id: 'q.dog-walk', titleKey: 'q.dog-walk', optional: true, when: { animals: [DOG] },
    objectives: [{ id: 'visit-park', textKey: 'q.dog-walk.o1', kind: 'visit', target: 'loc.dog-park', required: true }],
    transitions: [{ on: 'complete', to: 'ST-004' }, { on: 'decline', to: 'ST-004' }],
    reward: { grantId: 'rw.dog-walk', money: 2 },
  });
  q(c, 'ST-002').transitions.push({ on: 'complete', to: 'q.dog-walk', choiceKey: 'q.dog-walk', when: { animals: [DOG] } });
  for (const lang of c.meta.locales) for (const k of COMBO_KEYS) c.locales[lang][k] = `[${lang}] ${k}`;
  return c;
}
const dogEntry = (c) => q(c, 'ST-002').transitions[1];
const ticketFromOptional = (c) => {
  c.items.push({ id: 'item.ticket', nameKey: 'item.ticket' });
  q(c, 'ST-003').reward.items = [{ item: 'item.ticket', qty: 1 }];
};

const dlg = (c) => c.dialogues[0];
const node = (c, id) => dlg(c).nodes.find((n) => n.id === id);
// Другий діалог — у крамаря: «hi» → «bye» одним безумовним вибором із заданими ефектами.
const shopDialogue = (effects) => ({
  id: 'dlg.fixture-shop', npcId: 'npc.shopkeeper', start: 'hi',
  nodes: [
    { id: 'hi', speaker: 'npc', textKey: K('hello'), choices: [{ textKey: K('hello.c2'), next: 'bye', effects }] },
    { id: 'bye', speaker: 'npc', textKey: K('bye'), end: true },
  ],
});
// Ключ, якого прототип Object має сам (`__proto__`): у JS-патчі присвоєння міняє прототип, тож
// кладемо власну перелічувану властивість — саме таку дає JSON.parse('{"__proto__": …}').
const ownProto = (o) => Object.defineProperty(o, '__proto__', { value: {}, enumerable: true, configurable: true, writable: true });

export const FIXTURES = [
  // ---- позитивні контролі: перевірки не сміють стріляти по коректному ----
  { name: 'еталон коректний', expect: [], patch() {} },
  { name: 'цикл із виходом — коректний', expect: [], patch(c) { q(c, 'ST-003').transitions = [{ on: 'complete', to: 'ST-002' }, { on: 'decline', to: 'ST-004' }]; } },
  { name: 'повторювана подія з once-нагородою — коректна', expect: [], patch(c) { c.events[0].reward = { grantId: 'rw.ev-rain', money: 1, once: true }; } },
  { name: 'предмет із необов\u2019язкового квесту для необов\u2019язкової цілі — коректно', expect: [], patch(c) {
    ticketFromOptional(c);
    q(c, 'ST-004').objectives.push({ id: 'show-ticket', textKey: 'q.st-004.o1', kind: 'deliver', target: 'item.ticket', npcId: 'npc.ranger', required: false });
  } },

  // ---- схеми ----
  { name: 'неправильний тип поля', expect: ['SCHEMA_INVALID'], patch(c) { q(c, 'ST-002').objectives = 'visit forest'; } },
  { name: 'відсутнє обов\u2019язкове поле', expect: ['SCHEMA_INVALID'], patch(c) { delete q(c, 'ST-001').optional; } },
  { name: 'невідомий тип цілі', expect: ['SCHEMA_INVALID'], patch(c) { q(c, 'ST-001').objectives[0].kind = 'chat'; } },
  { name: 'стан проходження у визначенні', expect: ['SCHEMA_UNKNOWN_FIELD'], patch(c) { q(c, 'ST-001').completed = false; } },

  // ---- id ----
  { name: 'індекс масиву як id', expect: ['ID_FORMAT'], patch(c) { c.items.push({ id: '0', nameKey: 'item.map' }); } },
  { name: 'назва як id', expect: ['ID_FORMAT'], patch(c) { c.npcs.push({ id: 'Ranger Anna', nameKey: 'npc.ranger', locationId: 'loc.camp' }); } },
  { name: 'grantId без префікса rw.', expect: ['ID_FORMAT'], patch(c) { q(c, 'ST-002').reward.grantId = 'st-002'; } },
  { name: 'дубль id у межах типу', expect: ['ID_DUPLICATE'], patch(c) { c.npcs.push({ ...c.npcs[1] }); } },
  { name: 'дубль id цілі в квесті', expect: ['ID_DUPLICATE'], patch(c) { q(c, 'ST-002').objectives[1].id = 'visit-forest'; } },

  // ---- посилання ----
  { name: 'ціль посилається на неіснуючого NPC', expect: ['REF_MISSING'], patch(c) { q(c, 'ST-004').objectives[0].target = 'npc.ghost'; } },
  { name: 'deliver без отримувача', expect: ['REF_MISSING'], patch(c) { delete q(c, 'ST-002').objectives[2].npcId; } },
  { name: 'перехід на неіснуючий етап', expect: ['REF_MISSING', 'NODE_UNREACHABLE', 'NO_PATH_TO_END'], patch(c) { q(c, 'ST-001').transitions = [{ on: 'complete', to: 'ST-099' }]; } },
  { name: 'старт на неіснуючий етап', expect: ['REF_MISSING', 'NODE_UNREACHABLE'], patch(c) { c.meta.start = 'ST-000'; } },

  // ---- обов'язкова ціль без шляху завершення ----
  { name: 'ціль у локації, що відкривається цим же квестом', expect: ['OBJECTIVE_UNCOMPLETABLE'], patch(c) { q(c, 'ST-002').objectives[0].target = 'loc.lake'; } },
  { name: 'NPC відкривається пізніше, ніж потрібен', expect: ['OBJECTIVE_UNCOMPLETABLE'], patch(c) { c.npcs[0].unlockedBy = 'ST-004'; } },
  { name: 'обов\u2019язкова ціль на предмет лише з необов\u2019язкового квесту', expect: ['OBJECTIVE_UNCOMPLETABLE'], patch(c) {
    ticketFromOptional(c);
    q(c, 'ST-004').objectives.push({ id: 'show-ticket', textKey: 'q.st-004.o1', kind: 'deliver', target: 'item.ticket', npcId: 'npc.ranger', required: true });
  } },

  // ---- предмет, який неможливо отримати ----
  { name: 'вимога предмета без жодного джерела', expect: ['ITEM_UNOBTAINABLE', 'TRANSITION_REQUIRES_NOT_READY', 'DIALOGUE_QUEST_GATE'], patch(c) {
    c.items.push({ id: 'item.key', nameKey: 'item.map' });
    q(c, 'ST-003').requires = { items: ['item.key'] };
  } },
  { name: 'зникло єдине джерело предмета', expect: ['ITEM_UNOBTAINABLE', 'OBJECTIVE_UNCOMPLETABLE'], patch(c) { c.locations[1].items = []; } },

  // ---- цикл без виходу ----
  { name: 'цикл із двох етапів без виходу', expect: ['CYCLE_NO_EXIT', 'NODE_UNREACHABLE', 'NO_PATH_TO_END'], patch(c) {
    q(c, 'ST-003').transitions = [{ on: 'complete', to: 'ST-002' }, { on: 'decline', to: 'ST-002' }];
  } },
  { name: 'петля етапу на себе без виходу', expect: ['CYCLE_NO_EXIT', 'NODE_UNREACHABLE', 'NO_PATH_TO_END'], patch(c) {
    q(c, 'ST-003').transitions = [{ on: 'complete', to: 'ST-003' }, { on: 'decline', to: 'ST-003' }];
  } },

  // ---- необов'язкова гілка блокує основний сюжет ----
  { name: 'основний квест вимагає необов\u2019язковий', expect: ['MAIN_GATE_NOT_GUARANTEED', 'TRANSITION_REQUIRES_NOT_READY'], patch(c) { q(c, 'ST-004').requires.quests.push('ST-003'); } },
  { name: 'основний квест вимагає предмет лише з необов\u2019язкового', expect: ['MAIN_GATE_NOT_GUARANTEED', 'TRANSITION_REQUIRES_NOT_READY'], patch(c) {
    ticketFromOptional(c);
    q(c, 'ST-004').requires.items = ['item.ticket'];
  } },

  // ---- рецензія GAME-29: requires цілі ще не виконуваний у мить переходу (main-gate тут зелений) ----
  { name: 'ціль вимагає предмет з локації, яку відчиняє саме джерело переходу', expect: ['TRANSITION_REQUIRES_NOT_READY'], patch(c) {
    q(c, 'ST-002').requires.items = ['item.firewood'];               // дрова в loc.forest, unlockedBy ST-001 = джерело
  } },

  { name: 'ціль вимагає предмет, який продає NPC, що його відчиняє саме джерело', expect: ['TRANSITION_REQUIRES_NOT_READY'], patch(c) {
    c.npcs.find((n) => n.id === 'npc.shopkeeper').unlockedBy = 'ST-001';   // подарунок — лише в нього
    q(c, 'ST-002').requires.items = ['item.gift'];
  } },
  { name: 'startQuest квесту, чий предмет у requires ще не можна мати там, де NPC доступний', expect: ['DIALOGUE_QUEST_GATE'], patch(c) {
    q(c, 'ST-003').requires = { items: ['item.firewood'] };                 // дрова — лише після ST-001, рейнджер — з початку
  } },

  // ---- нагорода двічі ----
  { name: 'той самий grantId у двох місцях', expect: ['REWARD_GRANT_DUPLICATE'], patch(c) { c.events[1].reward.grantId = 'rw.st-001'; } },
  { name: 'повторювана подія з нагородою без once', expect: ['REWARD_REPEATABLE_UNGUARDED'], patch(c) { c.events[0].reward = { grantId: 'rw.ev-rain', money: 1 }; } },

  // ---- локалізація ----
  { name: 'немає ключа в одній мові', expect: ['LOCALE_MISSING'], patch(c) { delete c.locales.en['q.st-003']; } },
  { name: 'порожній переклад', expect: ['LOCALE_MISSING'], patch(c) { c.locales.uk['npc.ranger'] = '  '; } },
  { name: 'підтримувана мова без файлу', expect: ['LOCALE_MISSING'], patch(c) { c.meta.locales.push('de'); } },

  // ---- зовнішній факт ----
  { name: 'факт без джерела', expect: ['FACT_SOURCE_MISSING'], patch(c) { delete c.facts[0].source; } },
  { name: 'факт із неіснуючою датою', expect: ['FACT_DATE_INVALID'], patch(c) { c.facts[0].checkedAt = '2026-02-30'; } },
  { name: 'факт із датою в майбутньому', expect: ['FACT_DATE_INVALID'], patch(c) { c.facts[0].checkedAt = '2999-01-01'; } },
  { name: 'факт без дати', expect: ['FACT_DATE_INVALID'], patch(c) { delete c.facts[0].checkedAt; } },
  { name: 'факт без типу', expect: ['FACT_KIND_INVALID'], patch(c) { c.facts[0].kind = 'rumour'; } },

  // ---- граф квестів ----
  { name: 'вузол, у який не веде жоден перехід', expect: ['NODE_UNREACHABLE'], patch(c) {
    c.quests.push({ id: 'ST-009', titleKey: 'q.st-004', optional: false, objectives: [], transitions: [{ on: 'complete', to: 'ST-004' }] });
  } },
  // DIALOGUE_QUEST_GATE тут — справжня друга знахідка: рейнджер безумовно стартує ST-003, а той тепер чогось вимагає.
  { name: 'два квести вимагають один одного', expect: ['REQUIRES_CYCLE', 'MAIN_GATE_NOT_GUARANTEED', 'DIALOGUE_QUEST_GATE', 'TRANSITION_REQUIRES_NOT_READY'], patch(c) {
    q(c, 'ST-003').requires = { quests: ['ST-004'] };
    q(c, 'ST-004').requires.quests.push('ST-003');
  } },
  { name: 'квест вимагає сам себе', expect: ['REQUIRES_CYCLE', 'DIALOGUE_QUEST_GATE', 'TRANSITION_REQUIRES_NOT_READY'], patch(c) { q(c, 'ST-003').requires = { quests: ['ST-003'] }; } },
  { name: 'необов\u2019язковий квест без відмови', expect: ['OPTIONAL_NO_DECLINE'], patch(c) { q(c, 'ST-003').transitions = [{ on: 'complete', to: 'ST-004' }]; } },
  { name: 'гілка без наступного етапу', expect: ['BRANCH_NO_NEXT', 'NO_PATH_TO_END'], patch(c) {
    c.quests.push({ id: 'ST-005', titleKey: 'q.st-004', optional: false, objectives: [], transitions: [] });
    q(c, 'ST-002').transitions.push({ on: 'complete', to: 'ST-005', choiceKey: 'q.st-002' });
  } },
  { name: 'фінал втратив позначку кінця', expect: ['BRANCH_NO_NEXT', 'NO_PATH_TO_END'], patch(c) { q(c, 'ST-004').end = false; } },

  // ---- діалоги (GAME-28) ----
  { name: '[діалог] контроль: умовні гілки без безумовної альтернативи, але з fallback — коректно', expect: [], patch(c) {
    delete node(c, 'thanks').next;
    node(c, 'thanks').choices = [
      { textKey: K('help.c1'), next: 'bye', when: { notFlag: 'f.fixture-met' } },
      { textKey: K('help.c2'), next: 'bye' },
    ];
  } },
  { name: '[діалог] вузол, на який не веде жоден вибір', expect: ['DIALOGUE_NODE_UNREACHABLE'], patch(c) {
    dlg(c).nodes.push({ id: 'orphan', speaker: 'npc', textKey: K('bye'), end: true });
  } },
  { name: '[діалог] вузол без виходу і не end', expect: ['DIALOGUE_DEAD_END'], patch(c) { delete node(c, 'thanks').next; } },
  { name: '[діалог] усі виходи вузла умовні', expect: ['DIALOGUE_DEAD_END'], patch(c) { node(c, 'help').choices[1].when = { flag: 'f.fixture-met' }; } },
  { name: '[діалог] петля без жодного end', expect: ['DIALOGUE_DEAD_END'], count: { code: 'DIALOGUE_DEAD_END', n: 4 }, patch(c) {
    delete node(c, 'bye').end;
    node(c, 'bye').next = 'hello';
  } },
  { name: '[діалог] умова на прапорець, який ніщо не ставить', expect: ['DIALOGUE_FLAG_NEVER_SET'], patch(c) { node(c, 'help').choices[0].when = { flag: 'f.fixture-ghost' }; } },
  { name: '[діалог] неіснуючий прапорець усередині any', expect: ['DIALOGUE_FLAG_NEVER_SET'], patch(c) {
    node(c, 'help').choices[0].when.all[1].any.push({ flag: 'f.fixture-ghost' });
  } },
  { name: '[діалог] notFlag на прапорець, який ніщо не ставить', expect: ['DIALOGUE_FLAG_NEVER_SET'], patch(c) { node(c, 'help').choices[0].when = { notFlag: 'f.fixture-ghost' }; } },
  { name: '[діалог] прапорець ставиться лише в іншому діалозі — коректно', expect: [], patch(c) {
    c.dialogues.push(shopDialogue([{ setFlag: 'f.fixture-elsewhere' }]));
    node(c, 'help').choices[0].when = { flag: 'f.fixture-elsewhere' };
  } },
  // Нерухома точка прапорців: сетер за нездійсненною умовою — не сетер.
  { name: '[діалог] прапорець ставить лише вибір, що сам вимагає цей прапорець', expect: ['DIALOGUE_FLAG_NEVER_SET'], count: { code: 'DIALOGUE_FLAG_NEVER_SET', n: 1 }, patch(c) {
    node(c, 'help').choices.push({ textKey: K('help.c1'), next: 'bye', when: { flag: 'f.fixture-loop' }, effects: [{ setFlag: 'f.fixture-loop' }] });
  } },
  // Сетер step2 (hello.c1) стоїть РАНІШЕ за сетер step1 (hello.c2), від якого залежить: один прохід
  // його пропустить. У грі це друга розмова: перша ставить step1, друга відкриває hello.c1.
  { name: '[діалог] контроль: ланцюжок сетерів через умовні вибори — коректно', expect: [], patch(c) {
    node(c, 'hello').choices[0].when = { all: [{ quest: 'ST-001', status: 'completed' }, { flag: 'f.fixture-step1' }] };
    node(c, 'hello').choices[0].effects.push({ setFlag: 'f.fixture-step2' });
    node(c, 'hello').choices[1].effects.push({ setFlag: 'f.fixture-step1' });
    node(c, 'help').choices[0].when = { flag: 'f.fixture-step2' };
  } },
  { name: '[діалог] сетер за суперечливою умовою all не рахується', expect: ['DIALOGUE_COND_CONTRADICTION', 'DIALOGUE_FLAG_NEVER_SET'], patch(c) {
    node(c, 'help').choices.push({ textKey: K('help.c1'), next: 'bye', when: { all: [{ flag: 'f.fixture-met' }, { notFlag: 'f.fixture-met' }] }, effects: [{ setFlag: 'f.fixture-late' }] });
    node(c, 'help').choices[0].when = { flag: 'f.fixture-late' };
  } },
  { name: '[діалог] all вимагає водночас flag і notFlag (у вкладеному all)', expect: ['DIALOGUE_COND_CONTRADICTION'], patch(c) {
    node(c, 'help').choices[0].when = { all: [{ flag: 'f.fixture-helped' }, { all: [{ notFlag: 'f.fixture-helped' }] }] };
  } },
  { name: '[діалог] контроль: flag і notFlag у різних гілках any всередині all — не суперечність', expect: [], patch(c) {
    node(c, 'help').choices[0].when = { all: [{ flag: 'f.fixture-met' }, { any: [{ flag: 'f.fixture-helped' }, { notFlag: 'f.fixture-helped' }] }] };
  } },
  // Один діалог на NPC.
  { name: '[діалог] два діалоги для одного NPC', expect: ['DIALOGUE_NPC_DUPLICATE'], patch(c) {
    const d = shopDialogue([]);
    d.npcId = 'npc.ranger';
    c.dialogues.push(d);
  } },
  // completeObjective — лише talk із тим самим NPC.
  { name: '[діалог] розмова закриває ціль visit', expect: ['DIALOGUE_OBJECTIVE_KIND'], patch(c) {
    node(c, 'hello').choices[0].effects[1].completeObjective = { quest: 'ST-002', objective: 'visit-forest' };
  } },
  { name: '[діалог] розмова з крамарем закриває ціль «поговорити з рейнджером»', expect: ['DIALOGUE_OBJECTIVE_KIND'], patch(c) {
    c.dialogues.push(shopDialogue([{ completeObjective: { quest: 'ST-004', objective: 'talk-ranger' } }]));
  } },
  // startQuest не обходить requires.quests квесту-цілі.
  { name: '[діалог] безумовний вибір стартує квест, що вимагає незавершеного', expect: ['DIALOGUE_QUEST_GATE'], patch(c) {
    node(c, 'hello').choices[1].effects.push({ startQuest: 'ST-004' });
  } },
  { name: '[діалог] контроль: when вибору вимагає завершення потрібного квесту — коректно', expect: [], patch(c) {
    node(c, 'hello').choices[0].when = { all: [{ quest: 'ST-001', status: 'completed' }, { quest: 'ST-002', status: 'completed' }] };
    node(c, 'hello').choices[0].effects.push({ startQuest: 'ST-004' });
  } },
  { name: '[діалог] when вибору з потрібним квестом лише всередині any — не гарантія', expect: ['DIALOGUE_QUEST_GATE'], patch(c) {
    node(c, 'hello').choices[0].when = { any: [{ quest: 'ST-001', status: 'completed' }, { quest: 'ST-002', status: 'completed' }] };
    node(c, 'hello').choices[0].effects.push({ startQuest: 'ST-004' });
  } },
  { name: '[діалог] when вибору вимагає потрібний квест лише активним — не гарантія', expect: ['DIALOGUE_QUEST_GATE'], patch(c) {
    node(c, 'hello').choices[0].when = { quest: 'ST-002', status: 'active' };
    node(c, 'hello').choices[0].effects.push({ startQuest: 'ST-004' });
  } },
  { name: '[діалог] контроль: NPC відкривається лише після потрібного квесту — коректно', expect: [], patch(c) {
    c.npcs[1].unlockedBy = 'ST-002';
    c.dialogues.push(shopDialogue([{ startQuest: 'ST-004' }]));
  } },
  { name: '[діалог] NPC відкривається раніше, ніж завершено потрібний квест', expect: ['DIALOGUE_QUEST_GATE'], patch(c) {
    c.npcs[1].unlockedBy = 'ST-001';
    c.dialogues.push(shopDialogue([{ startQuest: 'ST-004' }]));
  } },
  { name: '[діалог] неіснуючий NPC', expect: ['DIALOGUE_REF_MISSING'], patch(c) { dlg(c).npcId = 'npc.ghost'; } },
  { name: '[діалог] умова на неіснуючий квест', expect: ['DIALOGUE_REF_MISSING'], patch(c) { node(c, 'hello').choices[0].when.quest = 'ST-099'; } },
  { name: '[діалог] ефект на неіснуючий квест і неіснуючу ціль', expect: ['DIALOGUE_REF_MISSING'], count: { code: 'DIALOGUE_REF_MISSING', n: 2 }, patch(c) {
    node(c, 'hello').choices[1].effects[1].startQuest = 'q.ghost';
    node(c, 'hello').choices[0].effects[1].completeObjective.objective = 'ghost-step';
  } },
  { name: '[діалог] умовний вибір веде на неіснуючий вузол', expect: ['DIALOGUE_REF_MISSING'], patch(c) {
    node(c, 'help').choices.push({ textKey: K('help.c1'), next: 'ghost', when: { flag: 'f.fixture-helped' } });
  } },
  { name: '[діалог] старт на неіснуючий вузол — лише першопричина', expect: ['DIALOGUE_REF_MISSING'], patch(c) { dlg(c).start = 'ghost'; } },
  // next вузла на неіснуючий вузол: thanks лишається і без шляху до end — це друга, справжня знахідка.
  { name: '[діалог] next вузла веде на неіснуючий вузол', expect: ['DIALOGUE_REF_MISSING', 'DIALOGUE_DEAD_END'], count: { code: 'DIALOGUE_REF_MISSING', n: 1 }, patch(c) { node(c, 'thanks').next = 'ghost'; } },
  { name: '[діалог] completeObjective на неіснуючий квест — посилання, а не падіння', expect: ['DIALOGUE_REF_MISSING'], patch(c) {
    node(c, 'hello').choices[0].effects[1].completeObjective = { quest: 'q.ghost', objective: 'talk-ranger' };
  } },
  { name: '[діалог] немає перекладу вибору в одній мові', expect: ['LOCALE_MISSING'], patch(c) { delete c.locales.en[K('help.c2')]; } },
  { name: '[діалог] порожній переклад репліки вузла', expect: ['LOCALE_MISSING'], patch(c) { c.locales.uk[K('thanks')] = ''; } },
  { name: '[діалог] умова рядком, а не об’єктом (TD-006)', expect: ['SCHEMA_INVALID'], patch(c) { node(c, 'help').choices[0].when = 'f.fixture-helped && !f.fixture-met'; } },
  { name: '[діалог] умова з двома дискримінаторами', expect: ['SCHEMA_INVALID'], patch(c) { node(c, 'help').choices[0].when = { flag: 'f.fixture-helped', notFlag: 'f.fixture-met' }; } },
  { name: '[діалог] вузол і з next, і з choices', expect: ['SCHEMA_INVALID'], patch(c) { node(c, 'hello').next = 'bye'; } },
  { name: '[діалог] стан проходження у вузлі', expect: ['SCHEMA_UNKNOWN_FIELD'], patch(c) { node(c, 'bye').visited = true; } },
  { name: '[діалог] діалог без nodes — схема, а не падіння', expect: ['SCHEMA_INVALID'], patch(c) { delete dlg(c).nodes; } },
  { name: '[схема] прототипний ключ constructor у вузлі', expect: ['SCHEMA_UNKNOWN_FIELD'], patch(c) { node(c, 'bye').constructor = 'x'; } },
  { name: '[схема] власний ключ __proto__ у вузлі', expect: ['SCHEMA_UNKNOWN_FIELD'], patch(c) { ownProto(node(c, 'bye')); } },
  { name: '[схема] прототипний ключ constructor в умові', expect: ['SCHEMA_UNKNOWN_FIELD'], patch(c) { node(c, 'help').choices[0].when = { flag: 'f.fixture-helped', constructor: 'x' }; } },
  { name: '[схема] власний ключ __proto__ в умові', expect: ['SCHEMA_UNKNOWN_FIELD'], patch(c) { node(c, 'help').choices[0].when = ownProto({ flag: 'f.fixture-helped' }); } },
  { name: '[схема] умова лише з прототипним ключем', expect: ['SCHEMA_INVALID'], patch(c) { node(c, 'help').choices[0].when = { toString: 'f.fixture-helped' }; } },
  { name: '[діалог] прапорець із підкресленням', expect: ['ID_FORMAT'], patch(c) {
    node(c, 'hello').choices[0].effects[0].setFlag = 'f.fixture_helped';
    node(c, 'help').choices[0].when = { flag: 'f.fixture_helped' };
  } },
  { name: '[діалог] id вузла з великою літерою', expect: ['ID_FORMAT'], patch(c) {
    node(c, 'thanks').id = 'Thanks';
    node(c, 'help').choices[0].next = 'Thanks';
  } },
  { name: '[діалог] id діалогу без префікса dlg.', expect: ['ID_FORMAT'], patch(c) { dlg(c).id = 'ranger-hello'; } },
  { name: '[діалог] два вузли з одним id', expect: ['ID_DUPLICATE'], patch(c) { dlg(c).nodes.push({ ...node(c, 'bye') }); } },
  { base: 'combo', name: '[діалог] умова на транспорт — коректно', expect: [], patch(c) {
    node(c, 'help').choices[0].when = { any: [{ transport: 'transport.fixture-bike' }, { flag: 'f.fixture-helped' }] };
  } },
  { base: 'combo', name: '[діалог] умова на неіснуючий транспорт', expect: ['DIALOGUE_REF_MISSING'], patch(c) { node(c, 'help').choices[0].when = { transport: 'transport.ghost' }; } },

  // ---- комбінації профіль × транспорт × тварина (синтетичні профілі) ----
  { base: 'combo', name: '[комб.] еталон із профілями, транспортом і собакою коректний', expect: [], patch() {} },
  // ---- GAME-42 (TD-006): умови-об'єкти на ПЕРЕХОДАХ квестів, не лише в діалогах ----
  { base: 'combo', name: '[умова] when переходу рядком', expect: ['SCHEMA_INVALID'], patch(c) { dogEntry(c).when = 'animals == dog'; } },
  { base: 'combo', name: '[умова] when квесту на неіснуючу тварину', expect: ['REF_MISSING'], patch(c) { q(c, 'q.dog-walk').when = { animals: ['animal.fixture-cat'] }; } },
  { base: 'combo', name: '[умова] when переходу на неіснуючий транспорт', expect: ['REF_MISSING'], patch(c) { dogEntry(c).when = { transports: ['transport.fixture-boat'] }; } },
  { base: 'combo', name: '[умова] основний шлях лише для кемпера з собакою — решта комбінацій без фіналу', expect: ['BRANCH_NO_NEXT', 'NO_PATH_TO_END'], patch(c) {
    c.transports.push({ id: 'transport.fixture-camper', nameKey: 'transport.fixture-camper' });
    for (const lang of c.meta.locales) c.locales[lang]['transport.fixture-camper'] = `[${lang}] camper`;
    q(c, 'ST-002').transitions[0].when = { transports: ['transport.fixture-camper'], animals: [DOG] };
  } },
  { base: 'combo', name: '[комб.] квест без when, досяжний лише з собакою, без собаки не перевіряється', expect: [], patch(c) {
    const d = q(c, 'q.dog-walk');
    delete d.when;
    d.transitions.forEach((t) => { t.when = { animals: [DOG] }; });
  } },
  { base: 'combo', name: '[комб.] when посилається на неіснуючий профіль', expect: ['REF_MISSING'], patch(c) { q(c, 'q.dog-walk').when = { profiles: ['profile.ghost'] }; } },
  { base: 'combo', name: '[комб.] порожній список у when', expect: ['SCHEMA_INVALID'], patch(c) { q(c, 'q.dog-walk').when = { animals: [] }; } },
  { base: 'combo', name: '[комб.] animal.none оголошено як тварину', expect: ['ID_FORMAT'], patch(c) { c.animals.push({ id: 'animal.none', nameKey: DOG }); } },
  { base: 'combo', name: '[комб.] стартовий етап лише для одного профілю', expect: ['COMBO_NO_START'], patch(c) { q(c, 'ST-001').when = { profiles: [P_A] }; } },
  { base: 'combo', name: '[комб.] єдиний загальний перехід лише для велосипеда', expect: ['BRANCH_NO_NEXT', 'NO_PATH_TO_END'], patch(c) {
    q(c, 'ST-002').transitions[0].when = { transports: [T_BIKE] };
  } },
  { base: 'combo', name: '[комб.] обов’язкова ціль у локації лише для собаки', expect: ['OBJECTIVE_UNCOMPLETABLE'], patch(c) {
    q(c, 'ST-004').objectives.push({ id: 'visit-park', textKey: 'q.st-004.o1', kind: 'visit', target: 'loc.dog-park', required: true });
  } },
  { base: 'combo', name: '[комб.] відмова лише для одного профілю', expect: ['OPTIONAL_NO_DECLINE'], patch(c) { q(c, 'ST-003').transitions[1].when = { profiles: [P_A] }; } },
  { base: 'combo', name: '[комб.] предмет основного сюжету продають лише велосипедистам', expect: ['MAIN_GATE_NOT_GUARANTEED', 'TRANSITION_REQUIRES_NOT_READY'], patch(c) {
    c.npcs[1].when = { transports: [T_BIKE] };
    q(c, 'ST-004').requires.items = ['item.gift'];
  } },
  { base: 'combo', name: '[комб.] цикл, вихід із якого є лише в одного профілю', expect: ['CYCLE_NO_EXIT', 'NO_PATH_TO_END', 'OPTIONAL_NO_DECLINE'], patch(c) {
    q(c, 'ST-003').transitions = [{ on: 'complete', to: 'ST-002' }, { on: 'decline', to: 'ST-004', when: { profiles: [P_A] } }];
  } },
  { base: 'combo', name: '[комб.] квест для собаки досяжний лише в одного профілю', expect: ['COMBO_TARGETED_UNREACHABLE'], patch(c) {
    dogEntry(c).when = { animals: [DOG], profiles: [P_A] };
  } },
  { base: 'combo', name: '[комб.] квест для собаки, а вхід у нього лише без тварини', expect: ['COMBO_DEAD_CONTENT', 'COMBO_TARGETED_UNREACHABLE', 'WHEN_UNSATISFIABLE'], patch(c) {
    dogEntry(c).when = { animals: ['animal.none'] };
  } },

  // ---- сумісність: transports у профілів і тварин ----
  // Вхід у прогулянку з собакою лише на авто: для велосипеда з собакою квест адресований, але недосяжний.
  { base: 'combo', name: '[сумісн.] контроль: без обмеження велосипед із собакою — тупик', expect: ['COMBO_TARGETED_UNREACHABLE'], patch(c) {
    dogEntry(c).when = { animals: [DOG], transports: [T_CAR] };
  } },
  { base: 'combo', name: '[сумісн.] собаку возять лише авто — та сама гілка не червоніє', expect: [], patch(c) {
    dogEntry(c).when = { animals: [DOG], transports: [T_CAR] };
    c.animals[0].transports = [T_CAR];
  } },
  { base: 'combo', name: '[сумісн.] контроль: вхід до собаки лише профілю A, профіль B із собакою — тупик', expect: ['COMBO_TARGETED_UNREACHABLE'], patch(c) {
    dogEntry(c).when = { animals: [DOG], profiles: [P_A] };
  } },
  { base: 'combo', name: '[сумісн.] профіль B їздить лише велосипедом, собака лише авто — та сама гілка не червоніє', expect: [], patch(c) {
    dogEntry(c).when = { animals: [DOG], profiles: [P_A] };
    c.animals[0].transports = [T_CAR];
    c.profiles[1].transports = [T_BIKE];
  } },
  { base: 'combo', name: '[сумісн.] транспорт тварини не існує — лише першопричина, без дубля', expect: ['REF_MISSING'], patch(c) { c.animals[0].transports = ['transport.ghost']; } },
  { base: 'combo', name: '[сумісн.] порожній список транспортів профілю', expect: ['SCHEMA_INVALID'], patch(c) { c.profiles[0].transports = []; } },
  { base: 'combo', name: '[сумісн.] велосипед не дозволено жодному профілю', expect: ['COMBO_OPTION_UNUSABLE'], patch(c) {
    c.profiles.forEach((p) => { p.transports = [T_CAR]; });
  } },
  { base: 'combo', name: '[сумісн.] контроль: перехід лише для собаки на велосипеді, без обмеження — коректний', expect: [], patch(c) {
    q(c, 'ST-002').transitions.push({ on: 'complete', to: 'q.dog-walk', choiceKey: 'q.dog-walk', when: { animals: [DOG], transports: [T_BIKE] } });
  } },
  { base: 'combo', name: '[сумісн.] перехід лише для собаки на велосипеді, а собаку возять лише авто', expect: ['WHEN_UNSATISFIABLE'], patch(c) {
    q(c, 'ST-002').transitions.push({ on: 'complete', to: 'q.dog-walk', choiceKey: 'q.dog-walk', when: { animals: [DOG], transports: [T_BIKE] } });
    c.animals[0].transports = [T_CAR];
  } },
  { base: 'combo', name: '[сумісн.] єдина ціль квесту для собаки — лише на велосипеді, а собаку возять лише авто', expect: ['WHEN_UNSATISFIABLE'], patch(c) {
    q(c, 'q.dog-walk').objectives[0].when = { transports: [T_BIKE] };
    c.animals[0].transports = [T_CAR];
  } },
  { base: 'combo', name: '[сумісн.] NPC лише для профілю, що не має його транспорту', expect: ['WHEN_UNSATISFIABLE'], patch(c) {
    c.profiles[0].transports = [T_CAR];
    c.npcs[1].when = { profiles: [P_A], transports: [T_BIKE] };
  } },
  { base: 'combo', name: '[сумісн.] перехід лише для велосипеда веде у квест для собаки, а собаку возять лише авто', expect: ['COMBO_DEAD_CONTENT', 'COMBO_TARGETED_UNREACHABLE', 'WHEN_UNSATISFIABLE'], patch(c) {
    dogEntry(c).when = { transports: [T_BIKE] };
    c.animals[0].transports = [T_CAR];
  } },
  { base: 'combo', name: '[сумісн.] контроль: той самий перехід без обмеження собаки — тупик для авто, але перехід живий', expect: ['COMBO_TARGETED_UNREACHABLE'], patch(c) {
    dogEntry(c).when = { transports: [T_BIKE] };
  } },
  // Квест лише для велосипеда, у який можна потрапити і з прогулянки з собакою — перехід без власного when.
  { base: 'combo', name: '[сумісн.] перехід без when із квесту для собаки у квест для велосипеда, а собаку возять лише авто', expect: ['WHEN_UNSATISFIABLE'], count: { code: 'WHEN_UNSATISFIABLE', n: 1 }, patch(c) {
    c.animals[0].transports = [T_CAR];
    c.quests.push({
      id: 'q.bike-loop', titleKey: 'q.st-003', optional: true, when: { transports: [T_BIKE] },
      objectives: [{ id: 'visit-lake', textKey: 'q.st-003.o1', kind: 'visit', target: 'loc.lake', required: true }],
      transitions: [{ on: 'complete', to: 'ST-004' }, { on: 'decline', to: 'ST-004' }],
    });
    q(c, 'ST-002').transitions.push({ on: 'complete', to: 'q.bike-loop', choiceKey: 'q.st-003', when: { transports: [T_BIKE] } });
    q(c, 'q.dog-walk').transitions.push({ on: 'complete', to: 'q.bike-loop' });
  } },
  { base: 'combo', name: '[сумісн.] мертва умова квесту звітує один раз, а не з кожного його переходу', expect: ['COMBO_DEAD_CONTENT', 'WHEN_UNSATISFIABLE'], count: { code: 'WHEN_UNSATISFIABLE', n: 1 }, patch(c) {
    c.animals[0].transports = [T_CAR];
    q(c, 'q.dog-walk').when = { animals: [DOG], transports: [T_BIKE] };
  } },
  { base: 'combo', name: '[сумісн.] ціль мертвого квесту не дублює його звіт', expect: ['COMBO_DEAD_CONTENT', 'WHEN_UNSATISFIABLE'], count: { code: 'WHEN_UNSATISFIABLE', n: 1 }, patch(c) {
    c.animals[0].transports = [T_CAR];
    q(c, 'q.dog-walk').when = { animals: [DOG], transports: [T_BIKE] };
    q(c, 'q.dog-walk').objectives[0].when = { profiles: [P_A] };
  } },
  { base: 'combo', name: '[сумісн.] дві незалежні мертві умови — дві знахідки, не одна', expect: ['WHEN_UNSATISFIABLE'], count: { code: 'WHEN_UNSATISFIABLE', n: 2 }, patch(c) {
    c.profiles[0].transports = [T_CAR];
    for (const id of ['npc.hiker-a', 'npc.hiker-b']) c.npcs.push({ id, nameKey: 'npc.ranger', locationId: 'loc.camp', when: { profiles: [P_A], transports: [T_BIKE] } });
  } },
  { base: 'combo', name: '[сумісн.] нездійсненний when не ховає тупик старту для іншого профілю', expect: ['WHEN_UNSATISFIABLE', 'COMBO_NO_START'], patch(c) {
    c.profiles[0].transports = [T_CAR];
    c.npcs[1].when = { profiles: [P_A], transports: [T_BIKE] };
    q(c, 'ST-001').when = { profiles: [P_A] };
  } },
];

// Файлові приклади для завантажувача: files → вміст теки content/ (null — теки немає).
export const FILE_FIXTURES = [
  { name: 'теки контенту немає', files: null, expectStatus: 'ISSUES', expect: ['CONTENT_MISSING'] },
  { name: 'теки немає, але явно дозволено → NOT_RUN, а не OK', files: null, allowMissing: true, expectStatus: 'NOT_RUN', expect: [] },
  { name: 'зламаний JSON', files: 'baseline', override: { 'quests.json': '[{' }, expectStatus: 'ISSUES', expect: ['CONTENT_PARSE'] },
  { name: 'порожній список квестів', files: 'baseline', override: { 'quests.json': '[]' }, expectStatus: 'ISSUES', expect: ['CONTENT_EMPTY'] },
  { name: 'зламаний JSON діалогу', files: 'baseline', override: { 'dialogue/fixture-ranger.json': '{' }, expectStatus: 'ISSUES', expect: ['CONTENT_PARSE'] },
  { name: 'чернетка не-JSON у dialogue/', files: 'baseline', override: { 'dialogue/notes.md': '# draft' }, expectStatus: 'ISSUES', expect: ['CONTENT_UNKNOWN_FILE'] },
  { name: 'тека з назвою x.json у dialogue/', files: 'baseline', dirs: ['dialogue/x.json'], expectStatus: 'ISSUES', expect: ['CONTENT_UNKNOWN_FILE'] },
  { name: 'назва файлу діалогу не збігається з id', files: 'baseline', override: { 'dialogue/shop.json': JSON.stringify(shopDialogue([])) }, expectStatus: 'ISSUES', expect: ['DIALOGUE_FILE_NAME'] },
  { name: 'одруківка в назві файлу', files: 'baseline', override: { 'quest.json': '[]' }, expectStatus: 'ISSUES', expect: ['CONTENT_UNKNOWN_FILE'] },
  { name: 'еталон із диска читається повністю й без втрат', files: 'baseline', expectStatus: 'OK', expect: [], roundTrip: true },
];
