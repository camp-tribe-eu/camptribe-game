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
