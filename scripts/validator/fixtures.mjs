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
];

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
  { name: 'вимога предмета без жодного джерела', expect: ['ITEM_UNOBTAINABLE'], patch(c) {
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
  { name: 'основний квест вимагає необов\u2019язковий', expect: ['MAIN_GATE_NOT_GUARANTEED'], patch(c) { q(c, 'ST-004').requires.quests.push('ST-003'); } },
  { name: 'основний квест вимагає предмет лише з необов\u2019язкового', expect: ['MAIN_GATE_NOT_GUARANTEED'], patch(c) {
    ticketFromOptional(c);
    q(c, 'ST-004').requires.items = ['item.ticket'];
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
  { name: 'два квести вимагають один одного', expect: ['REQUIRES_CYCLE', 'MAIN_GATE_NOT_GUARANTEED'], patch(c) {
    q(c, 'ST-003').requires = { quests: ['ST-004'] };
    q(c, 'ST-004').requires.quests.push('ST-003');
  } },
  { name: 'квест вимагає сам себе', expect: ['REQUIRES_CYCLE'], patch(c) { q(c, 'ST-003').requires = { quests: ['ST-003'] }; } },
  { name: 'необов\u2019язковий квест без відмови', expect: ['OPTIONAL_NO_DECLINE'], patch(c) { q(c, 'ST-003').transitions = [{ on: 'complete', to: 'ST-004' }]; } },
  { name: 'гілка без наступного етапу', expect: ['BRANCH_NO_NEXT', 'NO_PATH_TO_END'], patch(c) {
    c.quests.push({ id: 'ST-005', titleKey: 'q.st-004', optional: false, objectives: [], transitions: [] });
    q(c, 'ST-002').transitions.push({ on: 'complete', to: 'ST-005', choiceKey: 'q.st-002' });
  } },
  { name: 'фінал втратив позначку кінця', expect: ['BRANCH_NO_NEXT', 'NO_PATH_TO_END'], patch(c) { q(c, 'ST-004').end = false; } },

  // ---- комбінації профіль × транспорт × тварина (синтетичні профілі) ----
  { base: 'combo', name: '[комб.] еталон із профілями, транспортом і собакою коректний', expect: [], patch() {} },
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
  { base: 'combo', name: '[комб.] предмет основного сюжету продають лише велосипедистам', expect: ['MAIN_GATE_NOT_GUARANTEED'], patch(c) {
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
  { name: 'одруківка в назві файлу', files: 'baseline', override: { 'quest.json': '[]' }, expectStatus: 'ISSUES', expect: ['CONTENT_UNKNOWN_FILE'] },
  { name: 'еталон із диска читається повністю й без втрат', files: 'baseline', expectStatus: 'OK', expect: [], roundTrip: true },
];
