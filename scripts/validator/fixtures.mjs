// Набір самотестів. Еталон — синтетичний міні-сюжет, НЕ контент гри.
// Кожен зламаний приклад — це еталон плюс одна навмисна поломка, і для нього заданий
// ТОЧНИЙ набір кодів, які мають спрацювати: ні менше (перевірка сліпа), ні більше (перевірка
// стріляє по сусідах). Знайшов дефект контенту в грі — додай сюди приклад, інакше він повернеться.

// GAME-70: рядки вузлів NPC (dlg.*) — репліки, тож еталон дає їм 4+ слів; решта — короткі заглушки.
const lineText = (lang, k) => (k.startsWith('dlg.') ? `[${lang}] ${k} one two three four` : `[${lang}] ${k}`);
const LOCALE_KEYS = [
  'item.map', 'item.firewood', 'item.gift', 'item.ticket',
  'npc.ranger', 'npc.shopkeeper', 'loc.camp', 'loc.forest', 'loc.lake',
  'q.st-001', 'q.st-001.o1', 'q.st-002', 'q.st-002.o1', 'q.st-002.o2', 'q.st-002.o3',
  'q.st-003', 'q.st-003.o1', 'q.st-003.o2', 'q.st-004', 'q.st-004.o1',
  'ev.rain', 'ev.lost-dog', 'fact.fixture-campfire', 'sticker.fixture-first', 'sticker.fixture-first.text',
  ...['title', 'hook', 'fallback', 'wood', 'wood.done', 'wood.late', 'tea', 'tea.done', 'tea.late'].map((k) => `wave.fixture-dusk.${k}`),
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
        // GAME-110: обидва прапорці еталона ще й прочитано тут — приклади, що переписують умову help.c1, не червоніють
        // заодно FLAG_NEVER_READ (той має власний приклад).
        { textKey: K('help.c1'), next: 'bye', when: { any: [{ flag: 'f.fixture-met' }, { flag: 'f.fixture-helped' }] } },
      ] },
      { id: 'thanks', speaker: 'player', textKey: K('thanks'), next: 'bye' },
      { id: 'bye', speaker: 'npc', textKey: K('bye'), end: true },
    ],
  };
}

export const TODAY = '2026-10-22';

// Хвиля напруги-еталон (GAME-170): дві справи зі строком і обома наслідками на етапі ST-002.
const WV = (k) => `wave.fixture-dusk.${k}`;
const waveTask = (id, extra = {}) => ({ id, textKey: WV(id), limitMin: 20, done: { textKey: WV(`${id}.done`) }, late: { textKey: WV(`${id}.late`) }, ...extra });
// Додаткова справа хвилі з уже наявними ключами локалізації (як у контролі нижче): без нових рядків у locales.
const extraTask = (id, extra = {}) => ({ id, textKey: WV('wood'), limitMin: 20, done: { textKey: WV('wood.done') }, late: { textKey: WV('wood.late') }, ...extra });
function duskWave() {
  return { id: 'wave.fixture-dusk', titleKey: WV('title'), hookKey: WV('hook'), stage: 'ST-002', fallback: { textKey: WV('fallback') }, tasks: [waveTask('wood'), waveTask('tea')] };
}

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
        id: 'ST-001', titleKey: 'q.st-001', optional: false, xp: 10, giverId: 'npc.ranger',
        objectives: [{ id: 'talk-ranger', textKey: 'q.st-001.o1', kind: 'talk', target: 'npc.ranger', required: true }],
        transitions: [{ on: 'complete', to: 'ST-002' }],
        reward: { grantId: 'rw.st-001', items: [{ item: 'item.map', qty: 1 }] },
      },
      {
        id: 'ST-002', titleKey: 'q.st-002', optional: false, xp: 10, requires: { items: ['item.map'] },
        objectives: [
          { id: 'visit-forest', textKey: 'q.st-002.o1', kind: 'visit', target: 'loc.forest', required: true },
          { id: 'collect-wood', textKey: 'q.st-002.o2', kind: 'collect', target: 'item.firewood', required: true },
          { id: 'deliver-wood', textKey: 'q.st-002.o3', kind: 'deliver', target: 'item.firewood', npcId: 'npc.ranger', required: true },
        ],
        transitions: [{ on: 'complete', to: 'ST-003' }],
        reward: { grantId: 'rw.st-002', money: 10 },
      },
      {
        id: 'ST-003', titleKey: 'q.st-003', optional: true, xp: 15,
        objectives: [
          { id: 'visit-lake', textKey: 'q.st-003.o1', kind: 'visit', target: 'loc.lake', required: true },
          { id: 'buy-gift', textKey: 'q.st-003.o2', kind: 'collect', target: 'item.gift', required: false },
        ],
        transitions: [{ on: 'complete', to: 'ST-004' }, { on: 'decline', to: 'ST-004' }],
        reward: { grantId: 'rw.st-003', money: 5 },
      },
      {
        id: 'ST-004', titleKey: 'q.st-004', optional: false, xp: 10, end: true, requires: { quests: ['ST-002'] },
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
    dialogues: [rangerDialogue(), shopDialogue([])],   // GAME-179: у кожного NPC є діалог (NPC_NO_DIALOGUE), крамар теж
    waves: [duskWave()],
    stickers: [{ id: 'sticker.fixture-first', nameKey: 'sticker.fixture-first', textKey: 'sticker.fixture-first.text', kind: 'place', icon: 'home', cond: { any: [{ quest: 'ST-001', status: 'active' }, { quest: 'ST-001', status: 'completed' }] } }],
    // GAME-115: реєстр — рівно ті прапорці, які вживає еталон (зайвий рядок — FLAG_REGISTERED_UNUSED).
    flags: [
      { id: 'f.fixture-helped', type: 'bool', initial: false, owner: 'dlg.fixture-ranger/hello' },
      { id: 'f.fixture-met', type: 'bool', initial: false, owner: 'dlg.fixture-ranger/hello' },
    ],
    locales: {
      uk: Object.fromEntries(LOCALE_KEYS.map((k) => [k, lineText('uk', k)])),
      en: Object.fromEntries(LOCALE_KEYS.map((k) => [k, lineText('en', k)])),
    },
  };
}

const q = (c, id) => c.quests.find((x) => x.id === id);
const wave = (c) => c.waves[0];

// Подія в дорозі (GAME-31): діалог без NPC, відкривається сам у лісі з шансом 50 %.
const EV = (k) => `dlg.fixture-rain.${k}`;
function withRoadEvent(c) {
  c.dialogues.push({
    id: 'dlg.fixture-rain', trigger: { at: ['loc.forest'], chance: 50, titleKey: EV('title') }, start: 'rain',
    nodes: [
      { id: 'rain', speaker: 'player', textKey: EV('rain'), choices: [{ textKey: EV('rain.c1'), next: 'bye', effects: [{ setFlag: 'f.fixture-wet' }] }, { textKey: EV('rain.c1'), next: 'bye', when: { flag: 'f.fixture-wet' } }] },
      { id: 'bye', speaker: 'player', textKey: EV('bye'), end: true },
    ],
  });
  for (const lang of c.meta.locales) for (const k of ['title', 'rain', 'rain.c1', 'bye']) c.locales[lang][EV(k)] = `[${lang}] ${k}`;
  c.flags.push({ id: 'f.fixture-wet', type: 'bool', initial: false, owner: 'dlg.fixture-rain' }, { id: 'f.seen-*', type: 'bool', initial: false, generatedFrom: 'dialogues.trigger', owner: 'ядро' });
  return c.dialogues[c.dialogues.length - 1];
}

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
    id: 'q.dog-walk', titleKey: 'q.dog-walk', optional: true, xp: 15, when: { animals: [DOG] },
    objectives: [{ id: 'visit-park', textKey: 'q.dog-walk.o1', kind: 'visit', target: 'loc.dog-park', required: true }],
    transitions: [{ on: 'complete', to: 'ST-004' }, { on: 'decline', to: 'ST-004' }],
    reward: { grantId: 'rw.dog-walk', money: 2 },
  });
  q(c, 'ST-002').transitions.push({ on: 'complete', to: 'q.dog-walk', choiceKey: 'q.dog-walk', when: { animals: [DOG] } });
  // Дороги (GAME-31): від табору до кожного місця й назад, обома транспортами.
  // Безкоштовні (SIM-TRAVEL-003): платну дорогу без доходу валідатор не пропускає. Старт — у таборі (ROAD_NO_HOME).
  const both = (minutes) => [{ transport: T_CAR, minutes, cents: 0 }, { transport: T_BIKE, minutes: minutes * 3, cents: 0 }];
  q(c, 'ST-001').locationId = 'loc.camp';
  c.roads = [
    { id: 'road.camp-forest', from: 'loc.camp', to: 'loc.forest', twoWay: true, ways: both(10) },
    { id: 'road.camp-lake', from: 'loc.camp', to: 'loc.lake', twoWay: true, ways: both(20) },
    { id: 'road.camp-dog-park', from: 'loc.camp', to: 'loc.dog-park', twoWay: true, ways: both(5) },
  ];
  for (const lang of c.meta.locales) for (const k of COMBO_KEYS) c.locales[lang][k] = `[${lang}] ${k}`;
  return c;
}
const dogEntry = (c) => q(c, 'ST-002').transitions[1];
const ticketFromOptional = (c) => {
  c.items.push({ id: 'item.ticket', nameKey: 'item.ticket' });
  q(c, 'ST-003').reward.items = [{ item: 'item.ticket', qty: 1 }];
};

// GAME-115: зареєструвати bool-прапорці чи факти пам'яті, яких вимагає приклад про ІНШЕ (інакше кожен приклад
// з новим прапорцем червонів би ще й FLAG_UNREGISTERED і звірка точного набору кодів втратила б сенс).
const reg = (c, ...ids) => { for (const id of ids) c.flags.push({ id, type: 'bool', initial: false, owner: 'fixture' }); };
// Факт стану «транспорт гравця» — його читає умова transport.
const withTransportFact = (c) => c.flags.push({ id: 's.transport', type: 'enum', valuesFrom: 'transports', initial: 'unset', owner: 'вибір гравця' });

const dlg = (c) => c.dialogues[0];
const node = (c, id) => dlg(c).nodes.find((n) => n.id === id);
// GAME-115: enum-прапорець «настрій» (calm | glad), закодований як f.fixture-mood-<значення>.
const withMood = (c) => { c.flags.push({ id: 'f.fixture-mood', type: 'enum', values: ['calm', 'glad'], initial: 'unset', owner: 'dlg.fixture-ranger/hello' }); return c; };
// Вжити значення enum: ефект у hello.c2 і умова в окремому виборі поруч із безумовним виходом.
const useMood = (c, set = 'f.fixture-mood-calm', read = 'f.fixture-mood-calm') => {
  node(c, 'hello').choices[1].effects.push({ setFlag: set });
  if (read) node(c, 'help').choices.push({ textKey: K('help.c1'), next: 'bye', when: { flag: read } });
};
const row = (id, extra = {}) => ({ id, type: 'bool', initial: false, owner: 'fixture', ...extra });

// Прохання сусідів (GAME-180): сусід біля табору просить дві речі — і є «Пізніше», і здача. Усе, що потрібне перевірці requests, додає цей помічник:
// NPC з діалогом (gate → offer / reminder / turnin), два прапорці-цілі (ставить ядро на дотик до об'єкта мапи), реєстр, тексти й запис журналу.
export const FIXTURE_MAPS = ['npc.ranger', 'req.fixture-chores.t1', 'req.fixture-chores.t2', 'req.fixture-more.t1'];
const RQ = (k) => `dlg.fixture-neighbor.${k}`;
const RF = (p) => `f.req-fixture-chores-${p}`;
function withRequest(c) {
  const N = RQ;
  c.npcs.push({ id: 'npc.neighbor', nameKey: 'npc.neighbor', locationId: 'loc.camp' });
  c.dialogues.push({
    id: 'dlg.fixture-neighbor', npcId: 'npc.neighbor', start: 'gate',
    nodes: [
      { id: 'gate', speaker: 'npc', textKey: N('gate'), next: 'bye', branches: [
        { when: { all: [{ flag: RF('t1') }, { flag: RF('t2') }, { notFlag: RF('done') }] }, next: 'turnin' },
        { when: { all: [{ flag: RF('taken') }, { notFlag: RF('done') }, { notFlag: RF('t2') }] }, next: 'reminder' },
        { when: { all: [{ notFlag: RF('taken') }, { notFlag: RF('done') }] }, next: 'offer' },
      ] },
      { id: 'offer', speaker: 'npc', textKey: N('offer'), choices: [
        { textKey: N('offer.c1'), next: 'accepted', effects: [{ setFlag: RF('taken') }] },
        { textKey: N('offer.c2'), next: 'later' },
      ] },
      { id: 'accepted', speaker: 'npc', textKey: N('accepted'), end: true },
      { id: 'later', speaker: 'npc', textKey: N('later'), end: true },
      { id: 'reminder', speaker: 'npc', textKey: N('reminder'), end: true },
      { id: 'turnin', speaker: 'npc', textKey: N('turnin'), choices: [{ textKey: N('turnin.c1'), next: 'bye', effects: [{ setFlag: RF('done') }] }] },
      { id: 'bye', speaker: 'npc', textKey: N('bye'), end: true },
    ],
  });
  c.flags.push(
    row(RF('taken'), { owner: 'dlg.fixture-neighbor/offer' }), row(RF('done'), { owner: 'dlg.fixture-neighbor/turnin' }),
    row(RF('t1'), { kind: 'interaction', owner: 'взаємодія на мапі' }), row(RF('t2'), { kind: 'interaction', owner: 'взаємодія на мапі' }),
  );
  c.requests = [{
    id: 'req.fixture-chores', giver: 'npc.neighbor', titleKey: 'req.fixture-chores', goalKey: 'req.fixture-chores.goal', trackKey: 'req.fixture-chores.track',
    targets: [
      { id: 't1', spot: 'req.fixture-chores.t1', icon: 'litter', labelKey: 'req.fixture-chores.t1' },
      { id: 't2', spot: 'req.fixture-chores.t2', icon: 'apple', labelKey: 'req.fixture-chores.t2' },
    ],
    reward: { xp: 15, om: 10, skills: ['skill.communication'] },
  }];
  const keys = ['npc.neighbor', 'req.fixture-chores', 'req.fixture-chores.goal', 'req.fixture-chores.track', 'req.fixture-chores.t1', 'req.fixture-chores.t2', `journal.${RF('done')}`,
    ...['gate', 'offer', 'offer.c1', 'offer.c2', 'accepted', 'later', 'reminder', 'turnin', 'turnin.c1', 'bye'].map(N)];
  for (const lang of c.meta.locales) for (const k of keys) c.locales[lang][k] = lineText(lang, k);
}
// GAME-184: продовження арки того ж просильника (`after`): вузли offer2/turnin2 і гілки на початку gate. Еталон коректного продовження — чисто.
const RF2 = (p) => `f.req-fixture-more-${p}`;
function withFollowUp(c) {
  withRequest(c);
  const d = c.dialogues.find((x) => x.id === 'dlg.fixture-neighbor');
  const gate = d.nodes.find((n) => n.id === 'gate');
  gate.branches.unshift(
    { when: { all: [{ flag: RF2('t1') }, { notFlag: RF2('done') }] }, next: 'turnin2' },
    { when: { all: [{ flag: RF2('taken') }, { notFlag: RF2('done') }] }, next: 'reminder2' },
    { when: { all: [{ flag: RF('done') }, { notFlag: RF2('taken') }, { notFlag: RF2('done') }] }, next: 'offer2' },
  );
  d.nodes.push(
    { id: 'offer2', speaker: 'npc', textKey: RQ('offer2'), choices: [{ textKey: RQ('offer2.c1'), next: 'accepted2', effects: [{ setFlag: RF2('taken') }] }, { textKey: RQ('offer2.c2'), next: 'later2' }] },
    { id: 'accepted2', speaker: 'npc', textKey: RQ('accepted2'), end: true },
    { id: 'later2', speaker: 'npc', textKey: RQ('later2'), end: true },
    { id: 'reminder2', speaker: 'npc', textKey: RQ('reminder2'), end: true },
    { id: 'turnin2', speaker: 'npc', textKey: RQ('turnin2'), choices: [{ textKey: RQ('turnin2.c1'), next: 'bye', effects: [{ setFlag: RF2('done') }] }] },
  );
  c.flags.push(row(RF2('taken'), { owner: 'dlg.fixture-neighbor/offer2' }), row(RF2('done'), { owner: 'dlg.fixture-neighbor/turnin2' }), row(RF2('t1'), { kind: 'interaction', owner: 'взаємодія на мапі' }));
  c.requests.push({
    id: 'req.fixture-more', giver: 'npc.neighbor', after: 'req.fixture-chores', titleKey: 'req.fixture-more', goalKey: 'req.fixture-more.goal', trackKey: 'req.fixture-more.track',
    targets: [{ id: 't1', spot: 'req.fixture-more.t1', icon: 'star', labelKey: 'req.fixture-more.t1' }], reward: { xp: 15, om: 10, skills: ['skill.communication'] },
  });
  const keys = ['req.fixture-more', 'req.fixture-more.goal', 'req.fixture-more.track', 'req.fixture-more.t1', `journal.${RF2('done')}`, ...['offer2', 'offer2.c1', 'offer2.c2', 'accepted2', 'later2', 'reminder2', 'turnin2', 'turnin2.c1'].map(RQ)];
  for (const lang of c.meta.locales) for (const k of keys) c.locales[lang][k] = lineText(lang, k);
}
const rqDialogue = (c) => c.dialogues.find((d) => d.id === 'dlg.fixture-neighbor');
const rqNode = (c, id) => rqDialogue(c).nodes.find((n) => n.id === id);

// Другий діалог — у крамаря: «hi» → «bye» одним безумовним вибором із заданими ефектами.
const shopDialogue = (effects) => ({
  id: 'dlg.fixture-shop', npcId: 'npc.shopkeeper', start: 'hi',
  nodes: [
    { id: 'hi', speaker: 'npc', textKey: K('hello'), choices: [{ textKey: K('hello.c2'), next: 'bye', effects }] },
    { id: 'bye', speaker: 'npc', textKey: K('bye'), end: true },
  ],
});
// Крамар уже має діалог у еталоні (GAME-179): фікстура підміняє його, а не додає другий (DIALOGUE_NPC_DUPLICATE).
const putShop = (c, d) => { c.dialogues = c.dialogues.filter((x) => x.npcId !== 'npc.shopkeeper'); c.dialogues.push(d); };
// Ключ, якого прототип Object має сам (`__proto__`): у JS-патчі присвоєння міняє прототип, тож
// кладемо власну перелічувану властивість — саме таку дає JSON.parse('{"__proto__": …}').
const ownProto = (o) => Object.defineProperty(o, '__proto__', { value: {}, enumerable: true, configurable: true, writable: true });

// GAME-73: картка спорядження. Три намети — справжній компроміс: дешевий важкий, легкий дорогий, великий для сім'ї.
const tentCard = (id, stats) => ({ id, nameKey: id, kind: 'tent', tier: 1, weightG: 4000, volumeL: 18, waterproofMm: 1500, comfortC: 10, sleeps: 3, priceCents: 5000, resaleCents: 1500, ...stats });
function withGear(c, items) {
  c.items.push(...items);
  for (const lang of c.meta.locales) for (const i of items) c.locales[lang][i.nameKey] = `[${lang}] ${i.id}`;
}
// GAME-71: календар життя — канікули через Новий рік і літні; профіль A працює й має школяра.
const calendarCard = () => ({
  start: '2027-06-01', payday: 25, longTripDays: 4, maxLeaveDays: 31, bookAheadDays: 366,
  publicHolidays: ['01-01', '12-25'],
  schoolHolidays: [{ from: '07-01', to: '08-31' }, { from: '12-23', to: '01-06' }],
});
function withLife(c, cal = calendarCard()) {
  c.calendar = cal;
  c.profiles[0].job = { salaryCents: 250000, billsCents: 180000, vacationDays: 25 };
  c.profiles[0].childInSchool = true;
  return c;
}

// GAME-109: пакування. Карта — «потрібне» (2 од.), дрова — «корисне», подарунок — «можна лишити», лише для власника собаки.
const packingCard = () => ({
  openAfter: 'ST-002', at: ['loc.camp'],
  capacity: [{ transport: T_CAR, units: 5 }, { transport: T_BIKE, units: 3 }],
  items: [
    { item: 'item.map', group: 'needed', units: 2 }, { item: 'item.firewood', group: 'useful', units: 1 },
    { item: 'item.gift', group: 'leave', units: 1, when: { animals: [DOG] } },
  ],
  notes: [{ missing: 'item.map', transports: [T_BIKE], textKey: 'pack.note.fixture' }],
});
function withPacking(c, pk = packingCard()) {
  c.packing = pk;
  c.flags.push({ id: 'f.pack-*', type: 'bool', initial: false, generatedFrom: 'packing.items', owner: 'ядро' });
  for (const lang of c.meta.locales) c.locales[lang]['pack.note.fixture'] = `[${lang}] pack.note.fixture`;
  return c;
}
// Діалог читає прапорець пакування: окремий вибір поруч із безумовним виходом.
const readsPackFlag = (c, flag) => node(c, 'help').choices.unshift({ textKey: K('help.c1'), next: 'bye', when: { flag } });

const tents = () => [
  tentCard('item.fixture-tent-cheap', {}),
  tentCard('item.fixture-tent-light', { tier: 2, weightG: 1100, volumeL: 3, waterproofMm: 3000, comfortC: 5, sleeps: 1, priceCents: 25000, resaleCents: 11000 }),
  // Сімейний виграє ЛИШЕ місцями — так контроль доводить, що місця справді рахуються.
  tentCard('item.fixture-tent-family', { tier: 3, weightG: 14000, volumeL: 60, sleeps: 5, priceCents: 40000, resaleCents: 16000 }),
];

// Сцена сюжету (GAME-142): діалог без NPC, який відкриває StartScene. Факт сцени f.fixture-fire ставить стартер;
// вузол «open» сам обирає гілку за фактом: вогнище (лише за гілкою) чи ліхтар (безумовний next).
const SC = (k) => `dlg.fixture-fire.${k}`;
function withScene(c) {
  c.dialogues.push({
    id: 'dlg.fixture-fire', scene: { titleKey: SC('title'), facts: ['f.fixture-fire'] }, start: 'open',
    nodes: [
      { id: 'open', speaker: 'player', textKey: SC('open'), next: 'lantern', branches: [{ when: { flag: 'f.fixture-fire' }, next: 'fire' }] },
      { id: 'fire', speaker: 'player', textKey: SC('fire'), next: 'bye' },
      { id: 'lantern', speaker: 'player', textKey: SC('lantern'), choices: [{ textKey: SC('lantern.c1'), next: 'bye', effects: [{ setFlag: 'f.fixture-lit' }] }, { textKey: SC('lantern.c1'), next: 'bye', when: { flag: 'f.fixture-lit' } }] },
      { id: 'bye', speaker: 'player', textKey: SC('bye'), end: true },
    ],
  });
  for (const lang of c.meta.locales) for (const k of ['title', 'open', 'fire', 'lantern', 'lantern.c1', 'bye']) c.locales[lang][SC(k)] = `[${lang}] ${k}`;
  c.flags.push(row('f.fixture-fire'), row('f.fixture-lit'));
  return c.dialogues[c.dialogues.length - 1];
}
const sceneNode = (c, id) => c.dialogues.find((d) => d.id === 'dlg.fixture-fire').nodes.find((n) => n.id === id);

// Вибір «c2» базового діалогу стартує квест; умова на прапорець f.fixture-helped (його ставить c1). Із `byWave` той самий прапорець
// ставить ще й наслідок «встиг» хвилі — тоді розділ залежав би від хвилі.
function waveGate(c, byWave) {
  const dlg = c.dialogues.find((d) => d.npcId);
  const hello = dlg.nodes.find((n) => n.choices?.some((x) => x.next === 'bye' && x.effects?.some((e) => e.startQuest)));
  const gated = hello.choices.find((x) => x.effects?.some((e) => e.startQuest));
  gated.when = { flag: 'f.fixture-helped' };
  hello.choices.push({ textKey: gated.textKey, next: 'bye' }); // безумовний вихід, щоб умовний вибір не лишив діалог у глухому куті
  if (byWave) wave(c).tasks[0].done.effects = [{ setFlag: 'f.fixture-helped' }];
}


// GAME-111: Мія в еталоні комбінацій. `transports` не заданий — як у справжньому контенті, де його забули.
const MIA = 'animal.cat';
function addMia(c, transports) {
  c.animals.push({ id: MIA, nameKey: MIA, ...(transports ? { transports } : {}) });
  for (const lang of c.meta.locales) c.locales[lang][MIA] = `[${lang}] ${MIA}`;
}
const miaCarrierRow = (extra) => ({ item: 'item.mia-carrier', group: 'useful', units: 1, ...extra });
function addMiaItem(c) {
  c.items.push({ id: 'item.mia-carrier', nameKey: 'item.mia-carrier' });
  for (const lang of c.meta.locales) c.locales[lang]['item.mia-carrier'] = `[${lang}] item.mia-carrier`;
}
const miaTask = (extra) => extraTask('find-mia', { leaderOnly: true, targets: [{ id: 'spot.pines', safe: true }], ...extra });

/** Вузол розмови просильника з рядком про Мію: gated — лише за гілкою { animal }, інакше досяжний із next (GAME-184). */
function withMiaLine(c, gated) {
  const d = c.dialogues.find((x) => x.id === 'dlg.fixture-neighbor');
  d.nodes.push({ id: 'mia-line', speaker: 'npc', textKey: RQ('mia-line'), next: 'bye' });
  const gate = d.nodes.find((n) => n.id === 'gate');
  if (gated) gate.branches.unshift({ when: { animal: MIA }, next: 'mia-line' });
  else gate.branches.unshift({ when: { notFlag: RF('done') }, next: 'mia-line' });
  for (const lang of c.meta.locales) c.locales[lang][RQ("mia-line")] = `Mia ${lang}: line one two three four five`;
}
export const FIXTURES = [
  // Хвилі напруги (GAME-170). Еталон уже має хвилю з двома справами — «еталон коректний» нижче є позитивним контролем.
  { name: '[хвиля] контроль: три справи, одна лише для лідера з безпечною ціллю для тварини — коректно', expect: [], patch(c) {
    c.animals = [{ id: 'animal.fixture-cat', nameKey: 'npc.ranger' }];
    wave(c).tasks.push(waveTask('wood', { id: 'cat', textKey: WV('wood'), done: { textKey: WV('wood.done') }, late: { textKey: WV('wood.late') }, animal: 'animal.fixture-cat', leaderOnly: true, targets: [{ id: 'spot.pines', safe: true }] }));
  } },
  // GAME-182 · наклейки Атласу
  { name: '[наклейка] без умови видачі', expect: ['STICKER_NO_COND'], patch(c) { delete c.stickers[0].cond; } },
  { name: '[наклейка] контроль: умова за прапорцем, який ставить діалог — коректно', expect: [], patch(c) { c.stickers[0].cond = { flag: 'f.fixture-met' }; } },
  { name: '[наклейка] умова — порожній об’єкт (схема ловить першою)', expect: ['SCHEMA_INVALID'], patch(c) { c.stickers[0].cond = {}; } },
  { name: '[наклейка] умова за транспортом (ядро її не обчислює)', expect: ['STICKER_COND_UNSUPPORTED'], patch(c) { c.stickers[0].cond = { transport: 'transport.x' }; } },
  { name: '[наклейка] квесту з умови немає', expect: ['STICKER_COND_REF'], patch(c) { c.stickers[0].cond = { quest: 'ST-999', status: 'completed' }; } },
  { name: '[наклейка] прапорця з умови ніхто не ставить', expect: ['STICKER_FLAG_NEVER_SET'], patch(c) { c.stickers[0].cond = { flag: 'f.fixture-ghost' }; } },
  { name: '[наклейка] 13 наклейок на 12 слотів', expect: ['STICKER_TOO_MANY'], patch(c) { for (let i = 0; i < 12; i++) c.stickers.push({ ...c.stickers[0], id: `sticker.fixture-extra-${i}` }); } },
  { name: '[наклейка] контроль: рівно 12 — коректно', expect: [], patch(c) { for (let i = 0; i < 11; i++) c.stickers.push({ ...c.stickers[0], id: `sticker.fixture-extra-${i}` }); } },
  { name: '[наклейка] без тексту (textKey) — схема', expect: ['SCHEMA_INVALID'], patch(c) { delete c.stickers[0].textKey; } },
  { name: '[наклейка] немає англійського тексту', expect: ['LOCALE_MISSING'], patch(c) { delete c.locales.en['sticker.fixture-first.text']; } },
  { name: '[хвиля] одна справа', expect: ['WAVE_TOO_FEW_TASKS'], patch(c) { wave(c).tasks.pop(); } },
  { name: '[хвиля] п’ять справ — забагато', expect: ['WAVE_TOO_MANY_TASKS'], patch(c) { for (const id of ['a', 'b', 'c']) wave(c).tasks.push(extraTask(id)); } },
  { name: '[хвиля] контроль: чотири справи (межа) — коректно', expect: [], patch(c) { for (const id of ['a', 'b']) wave(c).tasks.push(extraTask(id)); } },
  { name: '[хвиля] справа про Мію без поля animal і з небезпечною ціллю', expect: ['WAVE_ANIMAL_UNSAFE'], patch(c) { wave(c).tasks.push(extraTask('find-mia', { leaderOnly: true, targets: [{ id: 'spot.shore', safe: false }] })); } },
  { name: '[хвиля] справа про Мію без поля animal і без цілей', expect: ['WAVE_ANIMAL_UNSAFE'], patch(c) { wave(c).tasks.push(extraTask('find-mia', { leaderOnly: true })); } },
  { name: '[хвиля] справа про кота без поля animal — помічник', expect: ['WAVE_ANIMAL_HELPER'], patch(c) { wave(c).tasks.push(extraTask('feed-cat', { targets: [{ id: 'spot.pines', safe: true }] })); } },
  { name: '[хвиля] ціль npc.mia без поля animal — небезпечна й для помічника', expect: ['WAVE_ANIMAL_UNSAFE', 'WAVE_ANIMAL_HELPER'], patch(c) { wave(c).tasks.push(extraTask('look', { targets: [{ id: 'npc.mia', safe: false }] })); } },
  { name: '[хвиля] контроль: справа про Мію без поля animal, але безпечна й лише для лідера — коректно', expect: [], patch(c) { wave(c).tasks.push(extraTask('find-mia', { leaderOnly: true, targets: [{ id: 'spot.pines', safe: true }] })); } },
  { name: '[хвиля] діалог рухає квест за прапорцем наслідку хвилі', expect: ['WAVE_FLAG_GATES_QUEST'], patch(c) { waveGate(c, true); } },
  { name: '[хвиля] контроль: діалог рухає квест за тим самим прапорцем, якого хвиля не ставить — коректно', expect: [], patch(c) { waveGate(c, false); } },
  { name: '[хвиля] строк 0', expect: ['WAVE_LIMIT_INVALID'], patch(c) { wave(c).tasks[0].limitMin = 0; } },
  { name: '[хвиля] строку немає', expect: ['WAVE_LIMIT_INVALID'], patch(c) { delete wave(c).tasks[0].limitMin; } },
  { name: '[хвиля] строк довший за хвилю (61)', expect: ['WAVE_LIMIT_INVALID'], patch(c) { wave(c).tasks[1].limitMin = 61; } },
  { name: '[хвиля] контроль: строк рівно на межі (60) — коректно', expect: [], patch(c) { wave(c).tasks[1].limitMin = 60; } },
  { name: '[хвиля] немає наслідку «не встиг»', expect: ['WAVE_OUTCOME_MISSING'], patch(c) { delete wave(c).tasks[0].late; } },
  { name: '[хвиля] немає наслідку «встиг»', expect: ['WAVE_OUTCOME_MISSING'], patch(c) { delete wave(c).tasks[1].done; } },
  { name: '[хвиля] наслідок без тексту', expect: ['SCHEMA_INVALID'], patch(c) { delete wave(c).tasks[0].late.textKey; } },
  { name: '[хвиля] контроль: наслідок «не встиг» мочить спорядження (wetGear) — коректно', expect: [], patch(c) { wave(c).tasks[0].late.effects = [{ wetGear: true }]; } },
  { name: '[хвиля] ефект wetGear не булевий', expect: ['SCHEMA_INVALID'], patch(c) { wave(c).tasks[0].late.effects = [{ wetGear: 'yes' }]; } },
  { name: '[хвиля] ефект невідомого виду', expect: ['SCHEMA_INVALID'], patch(c) { wave(c).tasks[0].late.effects = [{ dryGear: true }]; } },
  { name: '[хвиля] текст справи без перекладу', expect: ['LOCALE_MISSING'], patch(c) { delete c.locales.en[WV('tea.late')]; } },
  { name: '[хвиля] етап, якого немає', expect: ['REF_MISSING'], patch(c) { wave(c).stage = 'ST-099'; } },
  { name: '[хвиля] той самий набір справ на іншому етапі', expect: ['WAVE_REPEATED'], patch(c) { c.waves.push({ ...duskWave(), id: 'wave.fixture-dawn', stage: 'ST-003' }); } },
  { base: 'combo', name: '[хвиля] контроль: той самий набір справ на тому ж етапі з розведеним when — не повтор і не перекриття', expect: [], patch(c) { wave(c).when = { transports: [T_CAR] }; c.waves.push({ ...duskWave(), id: 'wave.fixture-dawn', when: { transports: [T_BIKE] } }); } },
  { base: 'combo', name: '[хвиля] дві хвилі на одному етапі без when — перекриття', expect: ['WAVE_STAGE_OVERLAP'], patch(c) { c.waves.push({ ...duskWave(), id: 'wave.fixture-dawn' }); } },
  { name: '[хвиля] wetGear: false — ефект, що нічого не робить', expect: ['SCHEMA_INVALID'], patch(c) { wave(c).tasks[0].late.effects = [{ wetGear: false }]; } },
  // Прохання сусідів (GAME-180).
  { name: '[прохання] контроль: коректне прохання (просильник, дві цілі на мапі, «Пізніше», здача) — чисто', expect: [], patch(c) { withRequest(c); } },
  { name: '[прохання] просильника немає серед NPC', expect: ['REQUEST_GIVER_INVALID'], patch(c) { withRequest(c); c.requests[0].giver = 'npc.nobody'; } },
  { name: '[прохання] немає жодної цілі', expect: ['REQUEST_NO_TARGET', 'REQUEST_NO_TURNIN'], patch(c) { withRequest(c); c.requests[0].targets = []; } },
  { name: '[прохання] МУТАЦІЯ: ціль без об’єкта на мапі', expect: ['REQUEST_TARGET_NO_MAP'], patch(c) { withRequest(c); c.requests[0].targets[1].spot = 'req.fixture-chores.ghost'; } },
  { name: '[прохання] два прохання вказують на один об’єкт мапи', expect: ['REQUEST_TARGET_NO_MAP', 'ID_DUPLICATE'], patch(c) { withRequest(c); c.requests.push({ ...structuredClone(c.requests[0]), id: 'req.fixture-chores' }); } },
  { name: '[прохання] «Пізніше» має наслідок (відмова не безкоштовна)', expect: ['REQUEST_NO_LATER'], patch(c) { withRequest(c); rqNode(c, 'offer').choices[1].effects = [{ setFlag: RF('taken') }]; } },
  { name: '[прохання] немає вузла пропозиції', expect: ['REQUEST_NO_LATER', 'DIALOGUE_NODE_UNREACHABLE', 'DIALOGUE_FLAG_NEVER_SET'], patch(c) { withRequest(c); const d = rqDialogue(c); d.nodes = d.nodes.filter((n) => n.id !== 'offer'); d.nodes.find((n) => n.id === 'gate').branches.pop(); } },
  { name: '[прохання] здача не вимагає всіх цілей', expect: ['REQUEST_NO_TURNIN'], patch(c) { withRequest(c); rqNode(c, 'gate').branches[0].when = { all: [{ flag: RF('t1') }, { notFlag: RF('done') }] }; } },
  { name: '[прохання] немає здачі: ніхто не ставить «здано»', expect: ['REQUEST_NO_TURNIN', 'DIALOGUE_FLAG_NEVER_SET'], patch(c) { withRequest(c); rqNode(c, 'turnin').choices[0].effects = []; } },
  { name: '[прохання] нагорода називає неіснуючу навичку', expect: ['REQUEST_REWARD_INVALID'], patch(c) { withRequest(c); c.requests[0].reward.skills = ['skill.nonsense']; } },
  { name: '[прохання] квест рушається за прапорцем прохання', expect: ['REQUEST_GATES_QUEST'], patch(c) { withRequest(c); rqNode(c, 'turnin').choices.push({ textKey: RQ('turnin.c1'), next: 'bye', when: { flag: RF('done') }, effects: [{ startQuest: 'ST-003' }] }); } },
  { name: '[прохання] гілка за прапорцем прохання веде до startQuest', expect: ['REQUEST_GATES_QUEST'], patch(c) { withRequest(c); rqNode(c, 'bye').end = undefined; delete rqNode(c, 'bye').end; rqNode(c, 'later').end = undefined; delete rqNode(c, 'later').end; rqNode(c, 'later').choices = [{ textKey: RQ('turnin.c1'), next: 'bye', effects: [{ startQuest: 'ST-003' }] }]; rqNode(c, 'bye').end = true; } },
  { name: '[прохання] вибір за прапорцем прохання ставить чужий прапорець', expect: ['REQUEST_GATES_QUEST'], patch(c) { withRequest(c); rqNode(c, 'turnin').choices.push({ textKey: RQ('turnin.c1'), next: 'bye', when: { flag: RF('done') }, effects: [{ setFlag: 'f.fixture-met' }] }); } },
  { name: '[прохання] немає тексту цілі в одній мові', expect: ['LOCALE_MISSING'], patch(c) { withRequest(c); delete c.locales.en['req.fixture-chores.t2']; } },
  { name: '[прохання] немає запису журналу про здачу', expect: ['LOCALE_MISSING'], patch(c) { withRequest(c); delete c.locales.uk[`journal.${RF('done')}`]; } },
  { name: '[прохання] id не за шаблоном (похідні прапорці й тексти теж розходяться з діалогом)', expect: ['ID_FORMAT', 'LOCALE_MISSING', 'REQUEST_NO_LATER', 'REQUEST_NO_TURNIN'], patch(c) { withRequest(c); c.requests[0].id = 'req.Fixture_chores'; } },
  { name: '[прохання] іконка не з переліку', expect: ['SCHEMA_INVALID'], patch(c) { withRequest(c); c.requests[0].targets[0].icon = 'dragon'; } },
  { name: '[прохання] контроль: продовження арки (after, вузли offer2/turnin2) — чисто', expect: [], patch(c) { withFollowUp(c); } },
  { name: '[прохання] МУТАЦІЯ: after називає неіснуюче прохання', expect: ['REQUEST_AFTER_INVALID'], patch(c) { withFollowUp(c); c.requests[1].after = 'req.fixture-ghost'; } },
  { name: '[прохання] after веде на прохання іншого просильника', expect: ['REQUEST_AFTER_INVALID', 'REQUEST_NO_LATER', 'REQUEST_NO_TURNIN'], patch(c) { withFollowUp(c); c.npcs.push({ id: 'npc.other', nameKey: 'npc.other', locationId: 'loc.camp' }); c.locales.uk['npc.other'] = 'x'; c.locales.en['npc.other'] = 'x'; c.requests[0].giver = 'npc.other'; c.dialogues.push({ id: 'dlg.fixture-other', npcId: 'npc.other', start: 'bye', nodes: [{ id: 'bye', speaker: 'npc', textKey: RQ('bye'), end: true }] }); } },
  { name: '[прохання] after утворює коло', expect: ['REQUEST_AFTER_INVALID', 'REQUEST_NO_LATER'], patch(c) { withFollowUp(c); c.requests[0].after = 'req.fixture-more'; } },
  { name: '[прохання] продовження без вузла offer2 — не взяти', expect: ['REQUEST_NO_LATER', 'DIALOGUE_NODE_UNREACHABLE', 'DIALOGUE_FLAG_NEVER_SET'], patch(c) { withFollowUp(c); const d = rqDialogue(c); d.nodes = d.nodes.filter((n) => n.id !== 'offer2'); d.nodes.find((n) => n.id === 'gate').branches = d.nodes.find((n) => n.id === 'gate').branches.filter((b) => b.next !== 'offer2'); } },
  { name: '[хвиля] та сама хвиля двічі на двох етапах', expect: ['ID_DUPLICATE', 'WAVE_REPEATED'], patch(c) { c.waves.push({ ...duskWave(), stage: 'ST-003' }); } },
  { name: '[хвиля] дубль id справи', expect: ['ID_DUPLICATE'], patch(c) { wave(c).tasks[1].id = 'wood'; } },
  { name: '[хвиля] id справи з підкресленням', expect: ['ID_FORMAT'], patch(c) { wave(c).tasks[1].id = 'hot_tea'; } },
  { name: '[хвиля] справа про тварину з ціллю біля води', expect: ['WAVE_ANIMAL_UNSAFE'], patch(c) {
    c.animals = [{ id: 'animal.fixture-cat', nameKey: 'npc.ranger' }];
    Object.assign(wave(c).tasks[0], { animal: 'animal.fixture-cat', leaderOnly: true, targets: [{ id: 'spot.pines', safe: true }, { id: 'spot.shore', safe: false }] });
  } },
  { name: '[хвиля] справа про тварину без жодної цілі', expect: ['WAVE_ANIMAL_UNSAFE'], patch(c) {
    c.animals = [{ id: 'animal.fixture-cat', nameKey: 'npc.ranger' }];
    Object.assign(wave(c).tasks[0], { animal: 'animal.fixture-cat', leaderOnly: true });
  } },
  { name: '[хвиля] справу про тварину може робити помічник', expect: ['WAVE_ANIMAL_HELPER'], patch(c) {
    c.animals = [{ id: 'animal.fixture-cat', nameKey: 'npc.ranger' }];
    Object.assign(wave(c).tasks[0], { animal: 'animal.fixture-cat', targets: [{ id: 'spot.pines', safe: true }] });
  } },
  { name: '[хвиля] тварина, якої немає', expect: ['REF_MISSING'], patch(c) { Object.assign(wave(c).tasks[0], { animal: 'animal.ghost', leaderOnly: true, targets: [{ id: 'spot.pines', safe: true }] }); } },
  { base: 'combo', name: '[хвиля] справа лише для велосипеда — водієві видно одну', expect: ['WAVE_VARIANT_INCOMPLETE'], count: { code: 'WAVE_VARIANT_INCOMPLETE', n: 4 }, patch(c) { wave(c).tasks[1].when = { transports: [T_BIKE] }; } },
  { base: 'combo', name: '[хвиля] контроль: варіант справи для кожного транспорту — коректно', expect: [], patch(c) {
    wave(c).tasks[1].when = { transports: [T_BIKE] };
    wave(c).tasks.push(waveTask('tea', { id: 'cover', when: { transports: [T_CAR] } }));
  } },
  { base: 'combo', name: '[хвиля] хвиля лише для власника собаки — комбінації без собаки (де видно одну справу) не рахуються', expect: [], patch(c) {
    wave(c).when = { animals: [DOG] };
    wave(c).tasks[1].when = { animals: [DOG] };
  } },
  { base: 'combo', name: '[хвиля] when справи поза when хвилі — нездійсненна', expect: ['WHEN_UNSATISFIABLE'], patch(c) {
    wave(c).when = { transports: [T_CAR] };
    wave(c).tasks.push(waveTask('tea', { id: 'cover', when: { transports: [T_BIKE] } }));
  } },
  { name: '[хвиля] наслідок ставить незареєстрований прапорець', expect: ['FLAG_UNREGISTERED'], patch(c) { wave(c).tasks[0].done.effects = [{ setFlag: 'f.fixture-ghost' }]; } },
  { name: '[хвиля] контроль: наслідок ставить прапорець, який читає розмова, — коректно (сетер хвилі зараховано)', expect: [], patch(c) {
    reg(c, 'f.fixture-warm');
    wave(c).tasks[0].done.effects = [{ setFlag: 'f.fixture-warm' }];
    node(c, 'help').choices.push({ textKey: K('help.c1'), next: 'bye', when: { flag: 'f.fixture-warm' } });
  } },
  { name: '[хвиля] наслідок стартує квест', expect: ['SCHEMA_INVALID'], patch(c) { wave(c).tasks[0].late.effects = [{ startQuest: 'ST-003' }]; } },
  { name: '[хвиля] стан проходження у хвилі', expect: ['SCHEMA_UNKNOWN_FIELD'], patch(c) { wave(c).tasks[0].outcome = 'done'; } },
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
  { name: 'sheltered локації — не булеве', expect: ['SCHEMA_INVALID'], patch(c) { c.locations[0].sheltered = 'yes'; } },
  { name: 'відсутнє обов\u2019язкове поле', expect: ['SCHEMA_INVALID'], patch(c) { delete q(c, 'ST-001').optional; } },
  { name: 'невідомий тип цілі', expect: ['SCHEMA_INVALID'], patch(c) { q(c, 'ST-001').objectives[0].kind = 'chat'; } },
  { name: 'стан проходження у визначенні', expect: ['SCHEMA_UNKNOWN_FIELD'], patch(c) { q(c, 'ST-001').completed = false; } },

  // ---- id ----
  { name: 'індекс масиву як id', expect: ['ID_FORMAT'], patch(c) { c.items.push({ id: '0', nameKey: 'item.map' }); } },
  { name: 'назва як id', expect: ['ID_FORMAT'], patch(c) { c.npcs.push({ id: 'Ranger Anna', nameKey: 'npc.ranger', locationId: 'loc.camp' }); } },
  { name: 'grantId без префікса rw.', expect: ['ID_FORMAT'], patch(c) { q(c, 'ST-002').reward.grantId = 'st-002'; } },
  { name: 'id основного етапу не за форматом (рецензія PR #62; решта кодів — від розірваних посилань на старий id)', expect: ['ID_FORMAT', 'NODE_UNREACHABLE', 'NO_PATH_TO_END', 'REF_MISSING'], patch(c) { q(c, 'ST-002').id = 'st-002x'; } },
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
  // GAME-70: довжина реплік героїв — 4–15 слів усередині лапок після «Ім'я:». Межі й обидві сторони доведені на самому коді.
  { name: '[репліка] коротша за 4 слова (3) — червоне', expect: ['LINE_LENGTH'], count: { code: 'LINE_LENGTH', n: 1 }, patch(c) { c.locales.uk['item.map'] = 'Карта. Джордж: «Для темряви. Логічно».'; } },
  { name: '[репліка] довша за 15 слів (16) — червоне', expect: ['LINE_LENGTH'], count: { code: 'LINE_LENGTH', n: 1 }, patch(c) { c.locales.uk['item.map'] = 'Карта. Вікторія: «Раз два три чотири п\u2019ять шість сім вісім дев\u2019ять десять один два три чотири п\u2019ять шість».'; } },
  { name: '[репліка] коротка лише в en — червоне саме в цій мові', expect: ['LINE_LENGTH'], count: { code: 'LINE_LENGTH', n: 1 }, patch(c) { c.locales.en['item.map'] = 'Map. Matthew: “Fine, thanks.”'; } },
  { name: '[репліка] контроль: рівно 4 і рівно 15 слів (межі) — коректно', expect: [], patch(c) { c.locales.uk['item.map'] = 'Карта. Метью: «Раз два три чотири». Джордж: «Раз два три чотири п\u2019ять шість сім вісім дев\u2019ять десять один два три чотири п\u2019ять».'; } },
  { name: '[репліка] вузол NPC із 16 слів (без префікса) — червоне', expect: ['LINE_LENGTH'], count: { code: 'LINE_LENGTH', n: 1 }, patch(c) { c.locales.uk[K('bye')] = 'Раз два три чотири п\u2019ять шість сім вісім дев\u2019ять десять один два три чотири п\u2019ять шість'; } },
  { name: '[репліка] вузол NPC із 15 слів — коректно', expect: [], patch(c) { c.locales.uk[K('bye')] = 'Раз два три чотири п\u2019ять шість сім вісім дев\u2019ять десять один два три чотири п\u2019ять'; } },
  { name: '[репліка] вузол гравця із 16 слів (кнопка) — не рахується', expect: [], patch(c) { c.locales.uk[K('thanks')] = 'Раз два три чотири п\u2019ять шість сім вісім дев\u2019ять десять один два три чотири п\u2019ять шість'; } },
  { name: '[репліка] контроль: «Табличка: «…»» і «Увага: «…»» — не репліки, бо не з відомого складу', expect: [], patch(c) { c.locales.uk['item.map'] = 'Табличка: «Зайти»'; c.locales.uk['item.gift'] = 'Увага: «Так»'; c.locales.en['item.gift'] = 'Sign: “Back soon”'; } },
  { name: '[репліка] ім\u2019я NPC з npcs.json — мовець (коротка репліка Ranger — червоне)', expect: ['LINE_LENGTH'], count: { code: 'LINE_LENGTH', n: 1 }, patch(c) { c.locales.uk['npc.ranger'] = 'Ranger'; c.locales.uk['item.map'] = 'Ranger: «Ні».'; } },
  { name: '[репліка] контроль: кнопка, підпис, табличка й назва в лапках без «Ім\u2019я:» — не репліки', expect: [], patch(c) {
    c.locales.uk['item.map'] = 'Ок'; c.locales.uk['item.gift'] = 'На дверях: «Зайти». Табличка тут: «Вхід»'; c.locales.uk['item.ticket'] = 'Назва «Так» і ще «Ні»';
    c.locales.en['item.gift'] = 'Sign on the door: “Back soon”'; c.locales.uk['npc.shopkeeper'] = 'Кнопка: Далі';
  } },
  // GAME-144: прапорець взаємодії (kind: interaction) ставить ядро на дотик до об'єкта мапи — умова в діалозі його читати може;
  // без kind валідатор не знає сетера й червоніє (Еліза дякує за пакети лише тим, хто їх прибрав).
  { name: 'прапорець взаємодії (kind: interaction) — умова в діалозі читає його, хоч ставить ядро', expect: [], patch(c) {
    c.flags.push(row('f.fixture-deed', { kind: 'interaction', owner: 'взаємодія на мапі' }));
    node(c, 'help').choices.push({ textKey: K('help.c1'), next: 'bye', when: { flag: 'f.fixture-deed' } });
  } },
  { name: 'той самий прапорець без kind — ніхто не ставить, червоно', expect: ['DIALOGUE_FLAG_NEVER_SET'], patch(c) {
    c.flags.push(row('f.fixture-deed'));
    node(c, 'help').choices.push({ textKey: K('help.c1'), next: 'bye', when: { flag: 'f.fixture-deed' } });
  } },
  // GAME-144: ціль gearCheck — текст на кожен варіант проблеми спорядження в кожній мові (4 варіанти × 2 мови = 8).
  { name: 'ціль gearCheck без текстів варіантів', expect: ['LOCALE_MISSING'], count: { code: 'LOCALE_MISSING', n: 8 }, patch(c) {
    c.quests.find((q) => q.id === 'ST-003').objectives[0].gearCheck = true;
  } },
  { name: 'ціль gearCheck з усіма текстами варіантів — коректно', expect: [], patch(c) {
    const o = c.quests.find((q) => q.id === 'ST-003').objectives[0];
    o.gearCheck = true;
    for (const lang of ['uk', 'en']) for (const v of ['tent-wet', 'tent-worn', 'sleeping-bag-wet', 'sleeping-bag-worn']) c.locales[lang][`${o.textKey}.${v}`] = v;
  } },

  // ---- зовнішній факт ----
  { name: 'факт без джерела', expect: ['FACT_SOURCE_MISSING'], patch(c) { delete c.facts[0].source; } },
  { name: 'факт із неіснуючою датою', expect: ['FACT_DATE_INVALID'], patch(c) { c.facts[0].checkedAt = '2026-02-30'; } },
  { name: 'факт із датою в майбутньому', expect: ['FACT_DATE_INVALID'], patch(c) { c.facts[0].checkedAt = '2999-01-01'; } },
  { name: 'факт без дати', expect: ['FACT_DATE_INVALID'], patch(c) { delete c.facts[0].checkedAt; } },
  { name: 'факт без типу', expect: ['FACT_KIND_INVALID'], patch(c) { c.facts[0].kind = 'rumour'; } },
  // GAME-56: давність факту. TODAY = 2026-10-22, поріг 365 днів; межа перевірена з обох боків.
  { name: 'факт звірено рівно 365 днів тому — ще не застарів', expect: [], patch(c) { c.facts[0].checkedAt = '2025-10-22'; } },
  { name: 'факт звірено 366 днів тому — попередження FACT_STALE', expect: ['FACT_STALE'], count: { code: 'FACT_STALE', n: 1 }, patch(c) { c.facts[0].checkedAt = '2025-10-21'; } },
  { name: 'факт без джерела й застарілий — помилка й попередження разом', expect: ['FACT_SOURCE_MISSING', 'FACT_STALE'], patch(c) { delete c.facts[0].source; c.facts[0].checkedAt = '2020-01-01'; } },

  // ---- граф квестів ----
  { name: 'вузол, у який не веде жоден перехід', expect: ['NODE_UNREACHABLE'], patch(c) {
    c.quests.push({ id: 'ST-009', titleKey: 'q.st-004', optional: false, xp: 10, objectives: [], transitions: [{ on: 'complete', to: 'ST-004' }] });
  } },
  // DIALOGUE_QUEST_GATE тут — справжня друга знахідка: рейнджер безумовно стартує ST-003, а той тепер чогось вимагає.
  { name: 'два квести вимагають один одного', expect: ['REQUIRES_CYCLE', 'MAIN_GATE_NOT_GUARANTEED', 'DIALOGUE_QUEST_GATE', 'TRANSITION_REQUIRES_NOT_READY'], patch(c) {
    q(c, 'ST-003').requires = { quests: ['ST-004'] };
    q(c, 'ST-004').requires.quests.push('ST-003');
  } },
  { name: 'квест вимагає сам себе', expect: ['REQUIRES_CYCLE', 'DIALOGUE_QUEST_GATE', 'TRANSITION_REQUIRES_NOT_READY'], patch(c) { q(c, 'ST-003').requires = { quests: ['ST-003'] }; } },
  { name: 'необов\u2019язковий квест без відмови', expect: ['OPTIONAL_NO_DECLINE'], patch(c) { q(c, 'ST-003').transitions = [{ on: 'complete', to: 'ST-004' }]; } },
  { name: 'гілка без наступного етапу', expect: ['BRANCH_NO_NEXT', 'NO_PATH_TO_END'], patch(c) {
    c.quests.push({ id: 'ST-005', titleKey: 'q.st-004', optional: false, xp: 10, objectives: [], transitions: [] });
    q(c, 'ST-002').transitions.push({ on: 'complete', to: 'ST-005', choiceKey: 'q.st-002' });
  } },
  { name: 'фінал втратив позначку кінця', expect: ['BRANCH_NO_NEXT', 'NO_PATH_TO_END'], patch(c) { q(c, 'ST-004').end = false; } },
  { name: 'межа дня на необов\u2019язковому квесті', expect: ['DAY_END_OPTIONAL'], patch(c) { q(c, 'ST-003').dayEnd = true; } },
  { name: 'межа дня на основному етапі — коректно', expect: [], patch(c) { q(c, 'ST-002').dayEnd = true; } },
  { name: '[xp] квест без XP', expect: ['QUEST_NO_XP'], patch(c) { delete q(c, 'ST-002').xp; } },
  { name: '[xp] XP нуль', expect: ['QUEST_NO_XP'], patch(c) { q(c, 'ST-002').xp = 0; } },
  { name: '[xp] XP кроку головного квесту завеликий', expect: ['QUEST_XP_RANGE'], patch(c) { q(c, 'ST-002').xp = 21; } },
  { name: '[xp] XP кроку головного квесту замалий', expect: ['QUEST_XP_RANGE'], patch(c) { q(c, 'ST-002').xp = 9; } },
  { name: '[xp] побічка не 15', expect: ['QUEST_XP_RANGE'], patch(c) { q(c, 'ST-003').xp = 10; } },
  { name: '[xp] межі 10 і 20 для головного та 15 для побічки — коректно', expect: [], patch(c) { q(c, 'ST-001').xp = 20; q(c, 'ST-002').xp = 10; } },

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
  { name: '[діалог] умова на прапорець, який ніщо не ставить', expect: ['DIALOGUE_FLAG_NEVER_SET'], patch(c) { reg(c, 'f.fixture-ghost'); node(c, 'help').choices[0].when = { flag: 'f.fixture-ghost' }; } },
  { name: '[діалог] неіснуючий прапорець усередині any', expect: ['DIALOGUE_FLAG_NEVER_SET'], patch(c) { reg(c, 'f.fixture-ghost');
    node(c, 'help').choices[0].when.all[1].any.push({ flag: 'f.fixture-ghost' });
  } },
  { name: '[діалог] notFlag на прапорець, який ніщо не ставить', expect: ['DIALOGUE_FLAG_NEVER_SET'], patch(c) { reg(c, 'f.fixture-ghost'); node(c, 'help').choices[0].when = { notFlag: 'f.fixture-ghost' }; } },
  { name: '[діалог] прапорець ставиться лише в іншому діалозі — коректно', expect: [], patch(c) { reg(c, 'f.fixture-elsewhere');
    putShop(c, shopDialogue([{ setFlag: 'f.fixture-elsewhere' }]));
    node(c, 'help').choices[0].when = { flag: 'f.fixture-elsewhere' };
  } },
  // Нерухома точка прапорців: сетер за нездійсненною умовою — не сетер.
  { name: '[діалог] прапорець ставить лише вибір, що сам вимагає цей прапорець', expect: ['DIALOGUE_FLAG_NEVER_SET'], count: { code: 'DIALOGUE_FLAG_NEVER_SET', n: 1 }, patch(c) { reg(c, 'f.fixture-loop');
    node(c, 'help').choices.push({ textKey: K('help.c1'), next: 'bye', when: { flag: 'f.fixture-loop' }, effects: [{ setFlag: 'f.fixture-loop' }] });
  } },
  // Сетер step2 (hello.c1) стоїть РАНІШЕ за сетер step1 (hello.c2), від якого залежить: один прохід
  // його пропустить. У грі це друга розмова: перша ставить step1, друга відкриває hello.c1.
  { name: '[діалог] контроль: ланцюжок сетерів через умовні вибори — коректно', expect: [], patch(c) { reg(c, 'f.fixture-step1', 'f.fixture-step2');
    node(c, 'hello').choices[0].when = { all: [{ quest: 'ST-001', status: 'completed' }, { flag: 'f.fixture-step1' }] };
    node(c, 'hello').choices[0].effects.push({ setFlag: 'f.fixture-step2' });
    node(c, 'hello').choices[1].effects.push({ setFlag: 'f.fixture-step1' });
    node(c, 'help').choices[0].when = { flag: 'f.fixture-step2' };
  } },
  { name: '[діалог] сетер за суперечливою умовою all не рахується', expect: ['DIALOGUE_COND_CONTRADICTION', 'DIALOGUE_FLAG_NEVER_SET'], patch(c) { reg(c, 'f.fixture-late');
    node(c, 'help').choices.push({ textKey: K('help.c1'), next: 'bye', when: { all: [{ flag: 'f.fixture-met' }, { notFlag: 'f.fixture-met' }] }, effects: [{ setFlag: 'f.fixture-late' }] });
    node(c, 'help').choices[0].when = { flag: 'f.fixture-late' };
  } },
  { name: '[діалог] all вимагає водночас flag і notFlag (у вкладеному all)', expect: ['DIALOGUE_COND_CONTRADICTION'], patch(c) {
    node(c, 'help').choices[0].when = { all: [{ flag: 'f.fixture-helped' }, { all: [{ notFlag: 'f.fixture-helped' }] }] };
  } },
  { name: '[діалог] контроль: flag і notFlag у різних гілках any всередині all — не суперечність', expect: [], patch(c) {
    node(c, 'help').choices[0].when = { all: [{ flag: 'f.fixture-met' }, { any: [{ flag: 'f.fixture-helped' }, { notFlag: 'f.fixture-helped' }] }] };
  } },
  { name: '[діалог] контроль: суперечність лише в одній гілці any — вибір живий через іншу (звірка з ядром)', expect: [], patch(c) {
    node(c, 'help').choices[0].when = { all: [{ any: [{ all: [{ flag: 'f.fixture-met' }, { notFlag: 'f.fixture-met' }] }, { flag: 'f.fixture-helped' }] }] };
  } },
  { name: '[діалог] суперечність у КОЖНІЙ гілці any — вибір не покажеться ніколи', expect: ['DIALOGUE_COND_CONTRADICTION'], patch(c) {
    node(c, 'help').choices[0].when = { any: [{ all: [{ flag: 'f.fixture-met' }, { notFlag: 'f.fixture-met' }] }, { all: [{ flag: 'f.fixture-helped' }, { notFlag: 'f.fixture-helped' }] }] };
  } },
  // Пам'ять NPC (GAME-48): remember у розмові з NPC → remembers/notRemembers у розмові з ТИМ САМИМ NPC.
  { name: '[пам’ять] контроль: рейнджер запам’ятовує й згадує в наступній розмові — коректно', expect: [], patch(c) { reg(c, 'm.fixture-met');
    node(c, 'hello').choices[1].effects.push({ remember: 'm.fixture-met' });
    node(c, 'help').choices.push({ textKey: K('help.c1'), next: 'bye', when: { remembers: 'm.fixture-met' } });
    node(c, 'help').choices.push({ textKey: K('help.c2'), next: 'bye', when: { notRemembers: 'm.fixture-met' } });
  } },
  { name: '[пам’ять] умова на факт, який ніхто не запам’ятовує', expect: ['MEMORY_NEVER_SET'], patch(c) { reg(c, 'm.fixture-ghost'); node(c, 'help').choices[0].when = { remembers: 'm.fixture-ghost' }; } },
  { name: '[пам’ять] notRemembers на факт, який ніхто не запам’ятовує', expect: ['MEMORY_NEVER_SET'], patch(c) { reg(c, 'm.fixture-ghost'); node(c, 'help').choices[0].when = { notRemembers: 'm.fixture-ghost' }; } },
  { name: '[пам’ять] неіснуючий факт усередині any', expect: ['MEMORY_NEVER_SET'], patch(c) { reg(c, 'm.fixture-ghost');
    node(c, 'help').choices[0].when.all[1].any.push({ remembers: 'm.fixture-ghost' });
  } },
  { name: '[пам’ять] факт запам’ятав крамар — рейнджер його не знає', expect: ['MEMORY_NEVER_SET'], count: { code: 'MEMORY_NEVER_SET', n: 1 }, patch(c) { reg(c, 'm.fixture-met');
    putShop(c, shopDialogue([{ remember: 'm.fixture-met' }]));
    node(c, 'help').choices[0].when = { remembers: 'm.fixture-met' };
  } },
  { name: '[пам’ять] факт запам’ятовує лише вибір, що сам його вимагає', expect: ['MEMORY_NEVER_SET'], count: { code: 'MEMORY_NEVER_SET', n: 1 }, patch(c) { reg(c, 'm.fixture-loop');
    node(c, 'help').choices.push({ textKey: K('help.c1'), next: 'bye', when: { remembers: 'm.fixture-loop' }, effects: [{ remember: 'm.fixture-loop' }] });
  } },
  // Ланцюжок, де пам'ять у другому проході росте САМА (прапорці вже ні): один прохід її загубив би.
  // hello.c2 → s1; help.c0 [s1] → s2; hello.new [s2] → s3 (другий прохід); hello.c1 [s3] → s4 (третій).
  { name: '[пам’ять] контроль: ланцюжок запам’ятовувань через три розмови — коректно', expect: [], patch(c) { reg(c, 'm.fixture-s1', 'm.fixture-s2', 'm.fixture-s3', 'm.fixture-s4');
    const hello = node(c, 'hello');
    hello.choices[1].effects.push({ remember: 'm.fixture-s1' });
    hello.choices.push({ textKey: K('hello.c2'), next: 'bye', when: { remembers: 'm.fixture-s2' }, effects: [{ remember: 'm.fixture-s3' }] });
    hello.choices[0].when = { all: [{ quest: 'ST-001', status: 'completed' }, { remembers: 'm.fixture-s3' }] };
    hello.choices[0].effects.push({ remember: 'm.fixture-s4' });
    node(c, 'help').choices[0].when = { remembers: 'm.fixture-s1' };
    node(c, 'help').choices[0].effects = [{ remember: 'm.fixture-s2' }];
    node(c, 'help').choices.push({ textKey: K('help.c1'), next: 'bye', when: { remembers: 'm.fixture-s4' } });
  } },
  { name: '[пам’ять] all вимагає водночас remembers і notRemembers', expect: ['DIALOGUE_COND_CONTRADICTION'], patch(c) { reg(c, 'm.fixture-met');
    node(c, 'hello').choices[1].effects.push({ remember: 'm.fixture-met' });
    node(c, 'help').choices[0].when = { all: [{ flag: 'f.fixture-helped' }, { all: [{ remembers: 'm.fixture-met' }, { notRemembers: 'm.fixture-met' }] }] };
  } },
  { name: '[пам’ять] контроль: суперечність лише в одній гілці any, інша гілка — живий факт', expect: [], patch(c) { reg(c, 'm.fixture-met', 'm.fixture-asked');
    node(c, 'hello').choices[1].effects.push({ remember: 'm.fixture-met' }, { remember: 'm.fixture-asked' });
    node(c, 'help').choices[0].when = { any: [{ all: [{ remembers: 'm.fixture-met' }, { notRemembers: 'm.fixture-met' }] }, { remembers: 'm.fixture-asked' }] };
  } },
  { name: '[пам’ять] id факту не за форматом (і у вжитку, і в реєстрі)', expect: ['ID_FORMAT', 'FLAG_NEVER_READ'], count: { code: 'ID_FORMAT', n: 2 }, patch(c) { reg(c, 'm.fixture_met'); node(c, 'hello').choices[1].effects.push({ remember: 'm.fixture_met' }); } },
  { name: '[пам’ять] ефект remember — не рядок', expect: ['SCHEMA_INVALID'], patch(c) { node(c, 'hello').choices[1].effects.push({ remember: 7 }); } },
  { name: '[пам’ять] умова з двома дискримінаторами remembers і notRemembers', expect: ['SCHEMA_INVALID'], patch(c) { node(c, 'help').choices[0].when = { remembers: 'm.x', notRemembers: 'm.x' }; } },
  { base: 'combo', name: '[пам’ять] подія в дорозі запам’ятовує й читає — NPC немає, пам’яті теж', expect: ['EVENT_EFFECT_UNSUPPORTED', 'MEMORY_NEVER_SET'], patch(c) { reg(c, 'm.fixture-wet');
    const d = withRoadEvent(c);
    d.nodes[0].choices[0].effects.push({ remember: 'm.fixture-wet' });
    d.nodes[0].choices.push({ textKey: EV('rain.c1'), next: 'bye', when: { remembers: 'm.fixture-wet' } });
  } },
  // GAME-179: «пустишка» — NPC на мапі, до якого підійшов, а сказати йому нічого.
  { name: '[діалог] NPC без жодного діалогу (пустишка)', expect: ['NPC_NO_DIALOGUE'], count: { code: 'NPC_NO_DIALOGUE', n: 1 }, patch(c) {
    c.dialogues = c.dialogues.filter((x) => x.npcId !== 'npc.shopkeeper');
  } },
  // Один діалог на NPC.
  { name: '[діалог] два діалоги для одного NPC', expect: ['DIALOGUE_NPC_DUPLICATE'], patch(c) {
    const d = shopDialogue([]);
    d.npcId = 'npc.ranger';
    d.id = 'dlg.fixture-ranger-two';
    c.dialogues.push(d);
  } },
  // completeObjective — лише talk із тим самим NPC.
  { name: '[діалог] розмова закриває ціль visit', expect: ['DIALOGUE_OBJECTIVE_KIND'], patch(c) {
    node(c, 'hello').choices[0].effects[1].completeObjective = { quest: 'ST-002', objective: 'visit-forest' };
  } },
  { name: '[діалог] розмова з крамарем закриває ціль «поговорити з рейнджером»', expect: ['DIALOGUE_OBJECTIVE_KIND'], patch(c) {
    putShop(c, shopDialogue([{ completeObjective: { quest: 'ST-004', objective: 'talk-ranger' } }]));
  } },
  // GAME-87: ціль byDialogue — лише репліка, і не на кожному шляху.
  { name: '[діалог] byDialogue на цілі visit', expect: ['OBJECTIVE_BY_DIALOGUE_KIND'], patch(c) {
    c.quests.find((q) => q.id === 'ST-002').objectives[0].byDialogue = true;
  } },
  { name: '[діалог] ціль byDialogue без репліки, що її закриває', expect: ['OBJECTIVE_BY_DIALOGUE_OPEN'], patch(c) {
    c.quests.find((q) => q.id === 'ST-004').objectives[0].byDialogue = true;
    node(c, 'hello').choices[0].effects.splice(1, 1); // прибрати completeObjective — лишився лише setFlag
  } },
  { name: '[діалог] ціль byDialogue закрита на кожному шляху (обхід «будь-якої розмови»)', expect: ['OBJECTIVE_BY_DIALOGUE_ALWAYS'], patch(c) {
    c.quests.find((q) => q.id === 'ST-004').objectives[0].byDialogue = true;
    const close = { completeObjective: { quest: 'ST-004', objective: 'talk-ranger' } };
    node(c, 'hello').choices[0].effects.push(close);
    node(c, 'hello').choices[1].effects.push(close);
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
    putShop(c, shopDialogue([{ startQuest: 'ST-004' }]));
  } },
  { name: '[діалог] NPC відкривається раніше, ніж завершено потрібний квест', expect: ['DIALOGUE_QUEST_GATE'], patch(c) {
    c.npcs[1].unlockedBy = 'ST-001';
    putShop(c, shopDialogue([{ startQuest: 'ST-004' }]));
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
  { name: '[діалог] прапорець із підкресленням (три вжитки й рядок реєстру)', expect: ['ID_FORMAT'], count: { code: 'ID_FORMAT', n: 4 }, patch(c) {
    c.flags[0].id = 'f.fixture_helped'; // і в реєстрі той самий id — ID_FORMAT, а не FLAG_UNREGISTERED
    node(c, 'hello').choices[0].effects[0].setFlag = 'f.fixture_helped';
    node(c, 'help').choices[0].when = { flag: 'f.fixture_helped' };
    node(c, 'help').choices[2].when.any[1].flag = 'f.fixture_helped';
  } },
  { name: '[діалог] id вузла з великою літерою', expect: ['ID_FORMAT'], patch(c) {
    node(c, 'thanks').id = 'Thanks';
    node(c, 'help').choices[0].next = 'Thanks';
  } },
  { name: '[діалог] id діалогу без префікса dlg.', expect: ['ID_FORMAT'], patch(c) { dlg(c).id = 'ranger-hello'; } },
  { name: '[діалог] два вузли з одним id', expect: ['ID_DUPLICATE'], patch(c) { dlg(c).nodes.push({ ...node(c, 'bye') }); } },
  { base: 'combo', name: '[діалог] умова на транспорт — коректно', expect: [], patch(c) { withTransportFact(c);
    node(c, 'help').choices[0].when = { any: [{ transport: 'transport.fixture-bike' }, { flag: 'f.fixture-helped' }] };
  } },
  { base: 'combo', name: '[діалог] умова на неіснуючий транспорт', expect: ['DIALOGUE_REF_MISSING'], patch(c) { withTransportFact(c); node(c, 'help').choices[0].when = { transport: 'transport.ghost' }; } },

  // ---- комбінації профіль × транспорт × тварина (синтетичні профілі) ----
  { base: 'combo', name: '[комб.] еталон із профілями, транспортом і собакою коректний', expect: [], patch() {} },
  // ---- GAME-42 (TD-006): умови-об'єкти на ПЕРЕХОДАХ квестів, не лише в діалогах ----
  // Дороги (GAME-31).
  { base: 'combo', name: '[дороги] ізольований вузол — до озера жодної дороги', expect: ['ROAD_UNREACHABLE'], patch(c) { c.roads = c.roads.filter((r) => r.id !== 'road.camp-lake'); } },
  { base: 'combo', name: '[дороги] дорога лише туди — з озера не повернутись', expect: ['ROAD_NO_RETURN'], patch(c) { c.roads.find((r) => r.id === 'road.camp-lake').twoWay = false; } },
  { base: 'combo', name: '[дороги] до озера лише автом — велосипедом не доїхати', expect: ['ROAD_UNREACHABLE'], patch(c) { const r = c.roads.find((x) => x.id === 'road.camp-lake'); r.ways = r.ways.filter((w) => w.transport === T_CAR); } },
  { base: 'combo', name: '[дороги] те саме ребро двічі', expect: ['ROAD_DUPLICATE'], patch(c) { c.roads.push({ id: 'road.camp-forest-2', from: 'loc.forest', to: 'loc.camp', ways: [{ transport: T_CAR, minutes: 1, cents: 0 }] }); } },
  { base: 'combo', name: '[дороги] контроль: до озера лише крізь замкнений ліс — проїхати можна', expect: [], patch(c) { const r = c.roads.find((x) => x.id === 'road.camp-lake'); r.from = 'loc.forest'; } },
  { base: 'combo', name: '[дороги] неіснуючий транспорт і локація', expect: ['REF_MISSING'], patch(c) { c.roads[0].ways.push({ transport: 'transport.ghost', minutes: 1, cents: 0 }); c.roads.push({ id: 'road.camp-ghost', from: 'loc.camp', to: 'loc.ghost', ways: [{ transport: T_CAR, minutes: 1, cents: 0 }] }); } },
  { base: 'combo', name: '[дороги] платна дорога без економіки', expect: ['ROAD_PAID_NO_ECONOMY'], patch(c) { c.roads[1].ways[0].cents = 300; } },
  { base: 'combo', name: '[дороги] дорога в саму себе', expect: ['ROAD_SELF_LOOP'], patch(c) { c.roads.push({ id: 'road.camp-camp', from: 'loc.camp', to: 'loc.camp', twoWay: true, ways: [{ transport: T_CAR, minutes: 1, cents: 0 }] }); } },
  { base: 'combo', name: '[дороги] стартовий квест без місця', expect: ['ROAD_NO_HOME'], patch(c) { delete q(c, 'ST-001').locationId; } },
  // GAME-72: небезпека дороги — ціле 0…3.
  { base: 'combo', name: '[дороги] контроль: небезпечна дорога (risk 3) — коректно', expect: [], patch(c) { c.roads[1].ways[1].risk = 3; c.roads[0].ways[0].risk = 0; } },
  { base: 'combo', name: '[дороги] небезпека поза 0…3', expect: ['SCHEMA_INVALID'], count: { code: 'SCHEMA_INVALID', n: 1 }, patch(c) { c.roads[1].ways[1].risk = 4; } },
  // GAME-72: стартові навички професії.
  { base: 'combo', name: '[навички] контроль: старт професії з відомих навичок — коректно', expect: [], patch(c) {
    c.profiles[0].startSkills = [{ skill: 'skill.camping', rank: 2 }, { skill: 'skill.mechanics', rank: 5 }];
    c.profiles[1].startSkills = [{ skill: 'skill.cooking', rank: 0 }];
  } },
  { base: 'combo', name: '[навички] невідома навичка', expect: ['SKILL_UNKNOWN'], count: { code: 'SKILL_UNKNOWN', n: 1 }, patch(c) { c.profiles[0].startSkills = [{ skill: 'skill.camping', rank: 2 }, { skill: 'skill.swimming', rank: 1 }]; } },
  { base: 'combo', name: '[навички] навичка двічі в одному профілі', expect: ['SKILL_DUPLICATE'], count: { code: 'SKILL_DUPLICATE', n: 1 }, patch(c) { c.profiles[0].startSkills = [{ skill: 'skill.camping', rank: 2 }, { skill: 'skill.camping', rank: 3 }]; } },
  { base: 'combo', name: '[навички] контроль: та сама навичка у двох профілях — не дубль', expect: [], patch(c) { c.profiles[0].startSkills = [{ skill: 'skill.camping', rank: 2 }]; c.profiles[1].startSkills = [{ skill: 'skill.camping', rank: 1 }]; } },
  { base: 'combo', name: '[навички] ранг 6 — поза 0…5', expect: ['SCHEMA_INVALID'], count: { code: 'SCHEMA_INVALID', n: 1 }, patch(c) { c.profiles[0].startSkills = [{ skill: 'skill.camping', rank: 6 }]; } },
  { base: 'combo', name: '[навички] порожній startSkills', expect: ['SCHEMA_INVALID'], patch(c) { c.profiles[0].startSkills = []; } },
  // GAME-73: спорядження.
  { name: '[спорядження] контроль: три намети-компроміси — коректно', expect: [], patch(c) { withGear(c, tents()); } },
  { name: '[спорядження] контроль: викуп дорівнює ціні — межа дозволена', expect: [], patch(c) { const t = tents(); t[0].resaleCents = t[0].priceCents; withGear(c, t); } },
  { name: '[спорядження] контроль: спальник кращий за намет у всьому — інший вид, не домінування', expect: [], patch(c) {
    withGear(c, [...tents(), { ...tentCard('item.fixture-bag', {}), kind: 'sleeping-bag', weightG: 900, volumeL: 3, waterproofMm: 5000, comfortC: -5, sleeps: 5, priceCents: 1000, resaleCents: 100 }]);
  } },
  { name: '[спорядження] немає ціни викупу', expect: ['GEAR_FIELD_MISSING'], count: { code: 'GEAR_FIELD_MISSING', n: 1 }, patch(c) { const t = tents(); delete t[1].resaleCents; withGear(c, t); } },
  { name: '[спорядження] немає ваги', expect: ['GEAR_FIELD_MISSING'], count: { code: 'GEAR_FIELD_MISSING', n: 1 }, patch(c) { const t = tents(); delete t[2].weightG; withGear(c, t); } },
  { name: '[спорядження] є ціна, але немає виду', expect: ['GEAR_FIELD_MISSING', 'ECON_NO_BASELINE', 'ECON_NO_CHEAPER_ALTERNATIVE'], count: { code: 'GEAR_FIELD_MISSING', n: 1 }, patch(c) { const t = tents(); delete t[0].kind; withGear(c, t); } },
  { name: '[спорядження] викуп дорожчий за купівлю', expect: ['GEAR_RESALE_ABOVE_PRICE'], count: { code: 'GEAR_RESALE_ABOVE_PRICE', n: 1 }, patch(c) { const t = tents(); t[1].resaleCents = t[1].priceCents + 1; withGear(c, t); } },
  { name: '[спорядження] намет, не кращий ні в чому за інший', expect: ['GEAR_DOMINATED'], count: { code: 'GEAR_DOMINATED', n: 1 }, patch(c) {
    withGear(c, [...tents(), tentCard('item.fixture-tent-worse', { weightG: 4500, priceCents: 5000 })]);
  } },
  { name: '[спорядження] точна копія іншого намету під новим id — одна знахідка, на копії', expect: ['GEAR_DOMINATED'], count: { code: 'GEAR_DOMINATED', n: 1 }, patch(c) {
    const t = tents(); withGear(c, [...t, { ...t[1], id: 'item.fixture-tent-copy', nameKey: 'item.fixture-tent-copy' }]);
    for (const lang of c.meta.locales) c.locales[lang]['item.fixture-tent-copy'] = `[${lang}] copy`;
  } },
  { name: '[спорядження] тир поза 1…3', expect: ['SCHEMA_INVALID'], count: { code: 'SCHEMA_INVALID', n: 1 }, patch(c) { const t = tents(); t[2].tier = 4; withGear(c, t); } },
  { name: '[спорядження] вигаданий вид', expect: ['SCHEMA_INVALID'], count: { code: 'SCHEMA_INVALID', n: 1 }, patch(c) { const t = tents(); t[0].kind = 'hammock'; withGear(c, t); } },
  // GAME-113: економіка — дешевша альтернатива, база не дорожча за стартові гроші, позик немає.
  { name: '[економіка] контроль: намет тиру 1 дешевший за тир 2 і 3 — коректно', expect: [], patch(c) { withGear(c, tents()); } },
  { name: '[економіка] контроль: база рівно за стартові гроші (5000) — межа дозволена', expect: [], patch(c) { const t = tents(); t[0].priceCents = 5000; withGear(c, t); } },
  { name: '[економіка] намет тиру 2 без дешевшого вихідця — усе однаково дороге', expect: ['ECON_NO_CHEAPER_ALTERNATIVE'], count: { code: 'ECON_NO_CHEAPER_ALTERNATIVE', n: 1 }, patch(c) {
    const t = tents(); t[1].priceCents = 5000; t[1].resaleCents = 1500; withGear(c, t.slice(0, 2)); // тир 2 за ту саму ціну, що й база: не «дешевший»
  } },
  { name: '[економіка] вид без бази тиру 1 за стартові гроші', expect: ['ECON_NO_BASELINE'], count: { code: 'ECON_NO_BASELINE', n: 1 }, patch(c) { const t = tents(); t[0].priceCents = 5001; withGear(c, t); } },
  { name: '[економіка] позика в id предмета', expect: ['ECON_LOAN_FORBIDDEN'], count: { code: 'ECON_LOAN_FORBIDDEN', n: 1 }, patch(c) { c.items.push({ id: 'item.loan-card', nameKey: 'item.map' }); } },
  { name: '[економіка] контроль: титри (credits) — не позика', expect: [], patch(c) { c.items.push({ id: 'item.credits', nameKey: 'item.map' }); } },
  { name: '[економіка] credit-note — позика', expect: ['ECON_LOAN_FORBIDDEN'], count: { code: 'ECON_LOAN_FORBIDDEN', n: 1 }, patch(c) { c.items.push({ id: 'item.credit-note', nameKey: 'item.map' }); } },
  { name: '[економіка] кредит у прапорці ефекту діалогу', expect: ['ECON_LOAN_FORBIDDEN', 'FLAG_UNREGISTERED'], patch(c) { node(c, 'bye'); c.dialogues[0].nodes[0].choices[0].effects.push({ setFlag: 'f.credit-taken' }); } },
  // GAME-71: календар життя.
  { base: 'combo', name: '[календар] контроль: календар, робота й школяр — коректно', expect: [], patch(c) { withLife(c); } },
  { base: 'combo', name: '[календар] контроль: рахунки дорівнюють зарплаті — межа дозволена', expect: [], patch(c) { withLife(c); c.profiles[0].job.billsCents = c.profiles[0].job.salaryCents; } },
  { base: 'combo', name: '[календар] контроль: канікули встик (08-31 і 09-01) — не перетин', expect: [], patch(c) { withLife(c).calendar.schoolHolidays.push({ from: '09-01', to: '09-02' }); } },
  { base: 'combo', name: '[календар] контроль: без календаря й без роботи — нічого не потрібно', expect: [], patch() {} },
  { base: 'combo', name: '[календар] робота без calendar.json', expect: ['CALENDAR_MISSING'], count: { code: 'CALENDAR_MISSING', n: 1 }, patch(c) { withLife(c); delete c.calendar; delete c.profiles[0].childInSchool; } },
  { base: 'combo', name: '[календар] школяр без calendar.json', expect: ['CALENDAR_MISSING'], count: { code: 'CALENDAR_MISSING', n: 1 }, patch(c) { withLife(c); delete c.calendar; delete c.profiles[0].job; } },
  { base: 'combo', name: '[календар] свято 02-30', expect: ['CALENDAR_BAD_DATE'], count: { code: 'CALENDAR_BAD_DATE', n: 1 }, patch(c) { withLife(c).calendar.publicHolidays.push('02-30'); } },
  { base: 'combo', name: '[календар] свято 02-29 — є не щороку', expect: ['CALENDAR_BAD_DATE'], count: { code: 'CALENDAR_BAD_DATE', n: 1 }, patch(c) { withLife(c).calendar.publicHolidays.push('02-29'); } },
  { base: 'combo', name: '[календар] межа канікул 13-01', expect: ['CALENDAR_BAD_DATE'], count: { code: 'CALENDAR_BAD_DATE', n: 1 }, patch(c) { withLife(c).calendar.schoolHolidays[0].to = '13-01'; } },
  { base: 'combo', name: '[календар] межа канікул 04-31', expect: ['CALENDAR_BAD_DATE'], count: { code: 'CALENDAR_BAD_DATE', n: 1 }, patch(c) { withLife(c).calendar.schoolHolidays.push({ from: '04-20', to: '04-31' }); } },
  { base: 'combo', name: '[календар] старт 2027-02-30', expect: ['CALENDAR_BAD_DATE'], count: { code: 'CALENDAR_BAD_DATE', n: 1 }, patch(c) { withLife(c).calendar.start = '2027-02-30'; } },
  { base: 'combo', name: '[календар] канікули перетинаються в один день (08-31)', expect: ['CALENDAR_RANGE_OVERLAP'], count: { code: 'CALENDAR_RANGE_OVERLAP', n: 1 }, patch(c) { withLife(c).calendar.schoolHolidays.push({ from: '08-31', to: '09-05' }); } },
  { base: 'combo', name: '[календар] канікули перетинаються через Новий рік (01-06)', expect: ['CALENDAR_RANGE_OVERLAP'], count: { code: 'CALENDAR_RANGE_OVERLAP', n: 1 }, patch(c) { withLife(c).calendar.schoolHolidays.push({ from: '01-06', to: '01-10' }); } },
  { base: 'combo', name: '[календар] свято записане двічі', expect: ['CALENDAR_RANGE_OVERLAP'], count: { code: 'CALENDAR_RANGE_OVERLAP', n: 1 }, patch(c) { withLife(c).calendar.publicHolidays.push('12-25'); } },
  { base: 'combo', name: '[календар] рахунки на 1 цент більші за зарплату', expect: ['JOB_BILLS_EXCEED_SALARY'], count: { code: 'JOB_BILLS_EXCEED_SALARY', n: 1 }, patch(c) { withLife(c); c.profiles[0].job.billsCents = c.profiles[0].job.salaryCents + 1; } },
  { base: 'combo', name: '[календар] день виплати 29 — є не в кожному місяці', expect: ['SCHEMA_INVALID'], count: { code: 'SCHEMA_INVALID', n: 1 }, patch(c) { withLife(c).calendar.payday = 29; } },
  { base: 'combo', name: '[календар] невідоме поле в календарі', expect: ['SCHEMA_UNKNOWN_FIELD'], count: { code: 'SCHEMA_UNKNOWN_FIELD', n: 1 }, patch(c) { withLife(c).calendar.timezone = 'CET'; } },
  // GAME-109: пакування.
  { base: 'combo', name: '[пакування] контроль: коректна картка й діалог, що читає f.pack-map', expect: [], patch(c) { withPacking(c); readsPackFlag(c, 'f.pack-map'); } },
  { base: 'combo', name: '[пакування] контроль: «потрібного» рівно стільки, скільки місця — межа дозволена', expect: [], patch(c) { withPacking(c).packing.capacity[1].units = 2; } },
  { base: 'combo', name: '[пакування] річ двічі', expect: ['PACK_ITEM_DUPLICATE'], count: { code: 'PACK_ITEM_DUPLICATE', n: 1 }, patch(c) { withPacking(c).packing.items.push({ item: 'item.map', group: 'leave', units: 1 }); } },
  { base: 'combo', name: '[пакування] для транспорту немає місця', expect: ['PACK_CAPACITY_MISSING'], count: { code: 'PACK_CAPACITY_MISSING', n: 1 }, patch(c) { withPacking(c).packing.capacity.pop(); } },
  { base: 'combo', name: '[пакування] для транспорту два записи місця', expect: ['PACK_CAPACITY_MISSING'], count: { code: 'PACK_CAPACITY_MISSING', n: 1 }, patch(c) { withPacking(c).packing.capacity.push({ transport: T_BIKE, units: 9 }); } },
  { base: 'combo', name: '[пакування] «потрібне» не вміщається у велосипед', expect: ['PACK_NEEDED_OVERFLOW'], count: { code: 'PACK_NEEDED_OVERFLOW', n: 1 }, patch(c) { withPacking(c).packing.capacity[1].units = 1; } },
  { base: 'combo', name: '[пакування] «потрібне» для власника собаки переливає лише разом із ним', expect: ['PACK_NEEDED_OVERFLOW'], count: { code: 'PACK_NEEDED_OVERFLOW', n: 1 }, patch(c) { const p = withPacking(c).packing; p.items.push({ item: 'item.gift', group: 'needed', units: 2, when: { animals: [DOG] } }); p.items.splice(2, 1); p.capacity[1].units = 3; } },
  { base: 'combo', name: '[пакування] підпис про річ, якої не пакують', expect: ['PACK_NOTE_UNPACKABLE'], count: { code: 'PACK_NOTE_UNPACKABLE', n: 1 }, patch(c) { withPacking(c).packing.notes[0].missing = 'item.ticket'; c.items.push({ id: 'item.ticket', nameKey: 'item.ticket' }); } },
  { base: 'combo', name: '[пакування] річ, якої немає в items.json', expect: ['REF_MISSING'], count: { code: 'REF_MISSING', n: 1 }, patch(c) { withPacking(c).packing.items[1].item = 'item.nope'; } },
  { base: 'combo', name: '[пакування] місце й квест-відкривач: неіснуючі посилання', expect: ['REF_MISSING'], count: { code: 'REF_MISSING', n: 3 }, patch(c) { const p = withPacking(c).packing; p.openAfter = 'ST-099'; p.at = ['loc.nowhere']; p.capacity[0].transport = 'transport.nope'; p.capacity.push({ transport: T_CAR, units: 5 }); } },
  { base: 'combo', name: '[пакування] група не з переліку', expect: ['SCHEMA_INVALID'], count: { code: 'SCHEMA_INVALID', n: 1 }, patch(c) { withPacking(c).packing.items[0].group = 'optional'; } },
  { base: 'combo', name: '[пакування] невідоме поле картки', expect: ['SCHEMA_UNKNOWN_FIELD'], count: { code: 'SCHEMA_UNKNOWN_FIELD', n: 1 }, patch(c) { withPacking(c).packing.weightLimit = 5; } },
  { base: 'combo', name: '[пакування] підпис без перекладу', expect: ['LOCALE_MISSING'], count: { code: 'LOCALE_MISSING', n: 1 }, patch(c) { withPacking(c); delete c.locales.en['pack.note.fixture']; } },
  { base: 'combo', name: '[пакування] діалог читає прапорець речі, якої не пакують', expect: ['DIALOGUE_FLAG_NEVER_SET', 'FLAG_UNREGISTERED'], count: { code: 'DIALOGUE_FLAG_NEVER_SET', n: 1 }, patch(c) { withPacking(c); readsPackFlag(c, 'f.pack-ticket'); } },
  { base: 'combo', name: '[пакування] діалог читає f.pack-map, а картки пакування немає (і сімейства f.pack-* у реєстрі)', expect: ['DIALOGUE_FLAG_NEVER_SET', 'FLAG_UNREGISTERED'], count: { code: 'DIALOGUE_FLAG_NEVER_SET', n: 1 }, patch(c) { readsPackFlag(c, 'f.pack-map'); } },
  { base: 'combo', name: '[дороги] транспорт, якого не дозволяє жоден профіль: лише COMBO_OPTION_UNUSABLE, без вимоги доріг', expect: ['COMBO_OPTION_UNUSABLE'], patch(c) {
    c.transports.push({ id: 'transport.fixture-boat', nameKey: 'transport.fixture-boat' });
    for (const lang of c.meta.locales) c.locales[lang]['transport.fixture-boat'] = `[${lang}] boat`;
    for (const p of c.profiles) p.transports = [T_CAR, T_BIKE];
  } },
  // GAME-56: попередження не бруднить контент — пізня перевірка комбінацій усе одно біжить і червоніє.
  { base: 'combo', name: '[факт] застарілий факт не вимикає перевірку комбінацій', expect: ['FACT_STALE', 'COMBO_OPTION_UNUSABLE'], patch(c) {
    c.facts[0].checkedAt = '2024-01-01';
    c.transports.push({ id: 'transport.fixture-boat', nameKey: 'transport.fixture-boat' });
    for (const lang of c.meta.locales) c.locales[lang]['transport.fixture-boat'] = `[${lang}] boat`;
    for (const p of c.profiles) p.transports = [T_CAR, T_BIKE];
  } },
  // GAME-115: реєстр прапорців і фактів стану (content/flags.json).
  { name: '[реєстр] контроль: enum ставиться й читається конкретним значенням — коректно', expect: [], patch(c) { useMood(withMood(c)); } },
  { name: '[реєстр] контроль: рядки наперед із reserved: true (bool, enum, number, location, факт стану) — не «невживані»', expect: [], patch(c) {
    c.flags.push(row('f.fixture-later', { reserved: true }), { id: 'f.fixture-plan', type: 'enum', values: ['car-carrier', 'anna-care'], initial: 'unset', owner: 'fixture', reserved: true },
      { id: 'f.fixture-count', type: 'number', initial: 0, owner: 'fixture', reserved: true }, { id: 's.fixture-target', type: 'location', initial: 'loc.camp', owner: 'fixture', reserved: true },
      { id: 's.fixture-weather', type: 'enum', values: ['sunny', 'rain'], initial: 'sunny', owner: 'fixture', reserved: true });
  } },
  { base: 'combo', name: '[реєстр] контроль: сімейства f.pack-* і f.seen-* з породжувачем, вміст їх не читає — вжиті ядром', expect: [], patch(c) { withPacking(c); withRoadEvent(c); } },
  { base: 'combo', name: '[реєстр] контроль: умова transport і факт стану s.transport — коректно', expect: [], patch(c) {
    withTransportFact(c);
    node(c, 'help').choices.push({ textKey: K('help.c1'), next: 'bye', when: { transport: 'transport.fixture-car' } });
  } },
  { name: '[реєстр] прибрано рядок вживаного прапорця', expect: ['FLAG_UNREGISTERED'], count: { code: 'FLAG_UNREGISTERED', n: 3 }, patch(c) { c.flags = c.flags.filter((f) => f.id !== 'f.fixture-met'); } },
  { name: '[реєстр] немає content/flags.json — червоніє кожен вжиток, а не мовчить', expect: ['FLAG_UNREGISTERED'], count: { code: 'FLAG_UNREGISTERED', n: 7 }, patch(c) { delete c.flags; } },
  { name: '[реєстр] факт пам’яті без рядка в реєстрі', expect: ['FLAG_UNREGISTERED'], count: { code: 'FLAG_UNREGISTERED', n: 2 }, patch(c) {
    node(c, 'hello').choices[1].effects.push({ remember: 'm.fixture-met' });
    node(c, 'help').choices.push({ textKey: K('help.c1'), next: 'bye', when: { remembers: 'm.fixture-met' } });
  } },
  { base: 'combo', name: '[реєстр] умова transport, а факту стану s.transport у реєстрі немає', expect: ['FLAG_UNREGISTERED'], count: { code: 'FLAG_UNREGISTERED', n: 1 }, patch(c) {
    node(c, 'help').choices.push({ textKey: K('help.c1'), next: 'bye', when: { transport: 'transport.fixture-car' } });
  } },
  { base: 'combo', name: '[реєстр] f.seen-<подія>, якої немає: сімейство є, але породжувач такого не дає', expect: ['FLAG_UNREGISTERED', 'DIALOGUE_FLAG_NEVER_SET'], count: { code: 'FLAG_UNREGISTERED', n: 1 }, patch(c) {
    withRoadEvent(c);
    node(c, 'help').choices.push({ textKey: K('help.c2'), next: 'bye', when: { notFlag: 'f.seen-fixture-snow' } });
  } },
  { name: '[реєстр] ефект ставить enum-значення поза списком (і жодна умова його не читає)', expect: ['FLAG_ENUM_VALUE', 'FLAG_NEVER_READ'], count: { code: 'FLAG_ENUM_VALUE', n: 1 }, patch(c) { useMood(withMood(c), 'f.fixture-mood-angry', null); } },
  { name: '[реєстр] умова читає enum-значення поза списком', expect: ['FLAG_ENUM_VALUE', 'DIALOGUE_FLAG_NEVER_SET'], count: { code: 'FLAG_ENUM_VALUE', n: 1 }, patch(c) { useMood(withMood(c), 'f.fixture-mood-calm', 'f.fixture-mood-angry'); } },
  { name: '[реєстр] «unset» як значення enum — це відсутність прапорця, не значення (і жодна умова його не читає)', expect: ['FLAG_ENUM_VALUE', 'FLAG_NEVER_READ'], count: { code: 'FLAG_ENUM_VALUE', n: 1 }, patch(c) { useMood(withMood(c), 'f.fixture-mood-unset', null); } },
  { name: '[реєстр] ефект ставить enum як bool (без значення; і жодна умова його не читає)', expect: ['FLAG_TYPE_MISMATCH', 'FLAG_NEVER_READ'], count: { code: 'FLAG_TYPE_MISMATCH', n: 1 }, patch(c) { useMood(withMood(c), 'f.fixture-mood', null); } },
  { name: '[реєстр] умова flag на прапорець типу number (reserved, але вжитий; і ніхто його не ставить)', expect: ['FLAG_TYPE_MISMATCH', 'FLAG_REGISTRY_INVALID', 'DIALOGUE_FLAG_NEVER_SET'], count: { code: 'FLAG_TYPE_MISMATCH', n: 2 }, patch(c) {
    c.flags.find((f) => f.id === 'f.fixture-met').type = 'number';
    c.flags.find((f) => f.id === 'f.fixture-met').initial = 0;
    c.flags.find((f) => f.id === 'f.fixture-met').reserved = true;
    node(c, 'hello').choices[1].effects = [{ startQuest: 'ST-003' }];
    node(c, 'help').choices[0].when = { flag: 'f.fixture-helped' };
    node(c, 'help').choices.push({ textKey: K('help.c1'), next: 'bye', when: { all: [{ quest: 'ST-001', status: 'completed' }, { notFlag: 'f.fixture-met' }] } });
  } },
  { base: 'combo', name: '[реєстр] s.transport зареєстровано як bool, а умова transport читає enum', expect: ['FLAG_TYPE_MISMATCH'], count: { code: 'FLAG_TYPE_MISMATCH', n: 1 }, patch(c) {
    c.flags.push(row('s.transport'));
    node(c, 'help').choices.push({ textKey: K('help.c1'), next: 'bye', when: { transport: 'transport.fixture-car' } });
  } },
  // GAME-110: другий бік «прапорця без пари» — ставлять, але жодна умова не читає (перший бік — DIALOGUE_FLAG_NEVER_SET).
  { name: '[реєстр] прапорець ставлять, але жодна умова не читає', expect: ['FLAG_NEVER_READ'], count: { code: 'FLAG_NEVER_READ', n: 1 }, patch(c) {
    reg(c, 'f.fixture-unread'); node(c, 'hello').choices[1].effects.push({ setFlag: 'f.fixture-unread' });
  } },
  { name: '[реєстр] факт пам’яті запам’ятовують, але жодна умова не згадує', expect: ['FLAG_NEVER_READ'], count: { code: 'FLAG_NEVER_READ', n: 1 }, patch(c) {
    reg(c, 'm.fixture-unread'); node(c, 'hello').choices[1].effects.push({ remember: 'm.fixture-unread' });
  } },
  { name: '[реєстр] enum: значення ставлять, жодне не читають', expect: ['FLAG_NEVER_READ'], count: { code: 'FLAG_NEVER_READ', n: 1 }, patch(c) { useMood(withMood(c), 'f.fixture-mood-calm', null); } },
  { name: '[реєстр] контроль: enum ставлять двома значеннями, читають одне — рядок прочитаний', expect: [], patch(c) {
    useMood(withMood(c), 'f.fixture-mood-glad', 'f.fixture-mood-glad'); node(c, 'hello').choices[1].effects.push({ setFlag: 'f.fixture-mood-calm' });
  } },
  { name: '[реєстр] контроль: notFlag — теж читання', expect: [], patch(c) {
    reg(c, 'f.fixture-unread'); node(c, 'hello').choices[1].effects.push({ setFlag: 'f.fixture-unread' });
    node(c, 'help').choices.push({ textKey: K('help.c1'), next: 'bye', when: { notFlag: 'f.fixture-unread' } });
  } },
  { name: '[реєстр] контроль: journal у bool і enum — є тексти journal.<id>[-<значення>] обома мовами', expect: [], patch(c) {
    useMood(withMood(c)); c.flags[0].journal = true; c.flags.at(-1).journal = true;
    for (const lang of c.meta.locales) for (const k of ['journal.f.fixture-helped', 'journal.f.fixture-mood-calm', 'journal.f.fixture-mood-glad']) c.locales[lang][k] = `[${lang}] ${k}`;
  } },
  { name: '[реєстр] journal без тексту запису в одній мові', expect: ['LOCALE_MISSING'], count: { code: 'LOCALE_MISSING', n: 1 }, patch(c) {
    c.flags[0].journal = true; c.locales.uk['journal.f.fixture-helped'] = '[uk] journal';
  } },
  { name: '[реєстр] journal у enum — текст на КОЖНЕ значення', expect: ['LOCALE_MISSING'], count: { code: 'LOCALE_MISSING', n: 2 }, patch(c) {
    useMood(withMood(c)); c.flags.at(-1).journal = true;
    for (const lang of c.meta.locales) c.locales[lang]['journal.f.fixture-mood-calm'] = `[${lang}] calm`;
  } },
  { base: 'combo', name: '[реєстр] journal у сімейства ядра чи факту стану — його ставить не вибір', expect: ['FLAG_REGISTRY_INVALID'], count: { code: 'FLAG_REGISTRY_INVALID', n: 2 }, patch(c) {
    withPacking(c).flags.at(-1).journal = true;
    withTransportFact(c); c.flags.at(-1).journal = true;
    node(c, 'help').choices.push({ textKey: K('help.c1'), next: 'bye', when: { transport: 'transport.fixture-car' } });
    for (const lang of c.meta.locales) for (const k of ['journal.f.pack-*', 'journal.s.transport']) c.locales[lang][k] = `[${lang}] ${k}`;
  } },
  { name: '[реєстр] journal — не булеве', expect: ['SCHEMA_INVALID'], count: { code: 'SCHEMA_INVALID', n: 1 }, patch(c) { c.flags[0].journal = 'yes'; } },
  { name: '[реєстр] зареєстровано, але ніде не вжито', expect: ['FLAG_REGISTERED_UNUSED'], count: { code: 'FLAG_REGISTERED_UNUSED', n: 1 }, patch(c) { c.flags.push(row('f.fixture-ghost')); } },
  { name: '[реєстр] enum зареєстровано, жодне значення не вжито', expect: ['FLAG_REGISTERED_UNUSED'], count: { code: 'FLAG_REGISTERED_UNUSED', n: 1 }, patch(c) { withMood(c); } },
  { base: 'combo', name: '[реєстр] сімейство f.pack-*, а картки пакування немає — породжувач порожній', expect: ['FLAG_REGISTERED_UNUSED'], count: { code: 'FLAG_REGISTERED_UNUSED', n: 1 }, patch(c) {
    c.flags.push(row('f.pack-*', { generatedFrom: 'packing.items' }));
  } },
  { name: '[реєстр] bool прапорця ядра з initial true — новий сейв не має прапорців', expect: ['FLAG_REGISTRY_INVALID'], count: { code: 'FLAG_REGISTRY_INVALID', n: 1 }, patch(c) { c.flags[0].initial = true; } },
  { name: '[реєстр] bool з initial-рядком', expect: ['FLAG_REGISTRY_INVALID'], count: { code: 'FLAG_REGISTRY_INVALID', n: 1 }, patch(c) { c.flags[0].initial = 'false'; } },
  { name: '[реєстр] enum без values (і вжите значення тоді поза списком, і лише ставиться)', expect: ['FLAG_REGISTRY_INVALID', 'FLAG_ENUM_VALUE', 'FLAG_NEVER_READ'], count: { code: 'FLAG_REGISTRY_INVALID', n: 1 }, patch(c) { delete withMood(c).flags.at(-1).values; useMood(c, 'f.fixture-mood-calm', null); } },
  { name: '[реєстр] enum-прапорець з initial не «unset»', expect: ['FLAG_REGISTRY_INVALID'], count: { code: 'FLAG_REGISTRY_INVALID', n: 1 }, patch(c) { withMood(c).flags.at(-1).initial = 'calm'; useMood(c); } },
  { name: '[реєстр] «unset» серед values', expect: ['FLAG_REGISTRY_INVALID'], count: { code: 'FLAG_REGISTRY_INVALID', n: 1 }, patch(c) { withMood(c).flags.at(-1).values.push('unset'); useMood(c); } },
  { name: '[реєстр] значення enum двічі', expect: ['FLAG_REGISTRY_INVALID'], count: { code: 'FLAG_REGISTRY_INVALID', n: 1 }, patch(c) { withMood(c).flags.at(-1).values.push('calm'); useMood(c); } },
  { name: '[реєстр] значення enum із підкресленням', expect: ['FLAG_REGISTRY_INVALID'], count: { code: 'FLAG_REGISTRY_INVALID', n: 1 }, patch(c) { withMood(c).flags.at(-1).values.push('lake_view'); useMood(c); } },
  { name: '[реєстр] valuesFrom у прапорця f.* (значення кодує назва; і лише ставиться)', expect: ['FLAG_REGISTRY_INVALID', 'FLAG_ENUM_VALUE', 'FLAG_NEVER_READ'], count: { code: 'FLAG_REGISTRY_INVALID', n: 1 }, patch(c) {
    const m = withMood(c).flags.at(-1); delete m.values; m.valuesFrom = 'transports'; useMood(c, 'f.fixture-mood-calm', null);
  } },
  { name: '[реєстр] bool f.<enum>-<значення> зареєстровано окремо — назва неоднозначна (а enum лишився без вжитку)', expect: ['FLAG_REGISTRY_INVALID', 'FLAG_REGISTERED_UNUSED'], count: { code: 'FLAG_REGISTRY_INVALID', n: 1 }, patch(c) { useMood(withMood(c)); c.flags.push(row('f.fixture-mood-calm')); } },
  { name: '[реєстр] пам’ять NPC типу enum', expect: ['FLAG_REGISTRY_INVALID'], count: { code: 'FLAG_REGISTRY_INVALID', n: 1 }, patch(c) { c.flags.push({ id: 'm.fixture-mood', type: 'enum', values: ['calm'], initial: 'unset', owner: 'fixture', reserved: true }); } },
  { name: '[реєстр] прапорець f.* типу number без reserved — ядро не вміє', expect: ['FLAG_REGISTRY_INVALID', 'FLAG_REGISTERED_UNUSED'], count: { code: 'FLAG_REGISTRY_INVALID', n: 1 }, patch(c) { c.flags.push({ id: 'f.fixture-count', type: 'number', initial: 0, owner: 'fixture' }); } },
  { name: '[реєстр] number з дробовим initial', expect: ['FLAG_REGISTRY_INVALID'], count: { code: 'FLAG_REGISTRY_INVALID', n: 1 }, patch(c) { c.flags.push({ id: 's.fixture-count', type: 'number', initial: 0.5, owner: 'fixture', reserved: true }); } },
  { name: '[реєстр] location з initial на неіснуючу локацію', expect: ['FLAG_REGISTRY_INVALID'], count: { code: 'FLAG_REGISTRY_INVALID', n: 1 }, patch(c) { c.flags.push({ id: 's.fixture-target', type: 'location', initial: 'loc.ghost', owner: 'fixture', reserved: true }); } },
  { name: '[реєстр] values у bool', expect: ['FLAG_REGISTRY_INVALID'], count: { code: 'FLAG_REGISTRY_INVALID', n: 1 }, patch(c) { c.flags[0].values = ['yes']; } },
  { name: '[реєстр] reserved, але вже вживається', expect: ['FLAG_REGISTRY_INVALID'], count: { code: 'FLAG_REGISTRY_INVALID', n: 1 }, patch(c) { c.flags[0].reserved = true; } },
  { base: 'combo', name: '[реєстр] сімейство названо не тим префіксом, що дає породжувач', expect: ['FLAG_REGISTRY_INVALID'], count: { code: 'FLAG_REGISTRY_INVALID', n: 1 }, patch(c) {
    withPacking(c).flags.at(-1).id = 'f.packed-*';
  } },
  { base: 'combo', name: '[реєстр] сімейство без породжувача', expect: ['FLAG_REGISTRY_INVALID', 'FLAG_REGISTERED_UNUSED'], count: { code: 'FLAG_REGISTRY_INVALID', n: 1 }, patch(c) { delete withPacking(c).flags.at(-1).generatedFrom; } },
  { name: '[реєстр] generatedFrom у звичайного прапорця', expect: ['FLAG_REGISTRY_INVALID'], count: { code: 'FLAG_REGISTRY_INVALID', n: 1 }, patch(c) { c.flags[0].generatedFrom = 'packing.items'; } },
  { base: 'combo', name: '[реєстр] s.transport з initial поза транспортами', expect: ['FLAG_REGISTRY_INVALID'], count: { code: 'FLAG_REGISTRY_INVALID', n: 1 }, patch(c) {
    withTransportFact(c); c.flags.at(-1).initial = 'transport.ghost';
    node(c, 'help').choices.push({ textKey: K('help.c1'), next: 'bye', when: { transport: 'transport.fixture-car' } });
  } },
  { base: 'combo', name: '[реєстр] контроль: s.transport з initial — справжній транспорт', expect: [], patch(c) {
    withTransportFact(c); c.flags.at(-1).initial = 'transport.fixture-car';
    node(c, 'help').choices.push({ textKey: K('help.c1'), next: 'bye', when: { transport: 'transport.fixture-car' } });
  } },
  { name: '[реєстр] id не за форматом', expect: ['ID_FORMAT'], count: { code: 'ID_FORMAT', n: 1 }, patch(c) { c.flags.push(row('flag_fixture', { reserved: true })); } },
  { name: '[реєстр] той самий id двічі', expect: ['ID_DUPLICATE'], count: { code: 'ID_DUPLICATE', n: 1 }, patch(c) { c.flags.push({ ...c.flags[0] }); } },
  { name: '[реєстр] тип поза переліком', expect: ['SCHEMA_INVALID'], count: { code: 'SCHEMA_INVALID', n: 1 }, patch(c) { c.flags[0].type = 'string'; } },
  { name: '[реєстр] initial — об’єкт', expect: ['SCHEMA_INVALID'], count: { code: 'SCHEMA_INVALID', n: 1 }, patch(c) { c.flags[0].initial = { v: false }; } },
  { name: '[реєстр] без owner', expect: ['SCHEMA_INVALID'], count: { code: 'SCHEMA_INVALID', n: 1 }, patch(c) { delete c.flags[0].owner; } },
  { name: '[реєстр] стан проходження в реєстрі', expect: ['SCHEMA_UNKNOWN_FIELD'], count: { code: 'SCHEMA_UNKNOWN_FIELD', n: 1 }, patch(c) { c.flags[0].value = true; } },
  // Події в дорозі (GAME-31).
  { base: 'combo', name: '[подія] контроль: подія в дорозі з прапорцем і умова на «подія була» — коректно', expect: [], patch(c) {
    withRoadEvent(c);
    node(c, 'help').choices.push({ textKey: K('help.c2'), next: 'bye', when: { notFlag: 'f.seen-fixture-rain' } });
  } },
  { base: 'combo', name: '[подія] діалог без власника (ні NPC, ні trigger)', expect: ['DIALOGUE_OWNER'], patch(c) { delete dlg(c).npcId; } },
  { base: 'combo', name: '[подія] діалог і з NPC, і з trigger', expect: ['DIALOGUE_OWNER'], patch(c) { c.dialogues = c.dialogues.filter((x) => x.npcId !== 'npc.shopkeeper'); withRoadEvent(c).npcId = 'npc.shopkeeper'; } },
  { base: 'combo', name: '[подія] подія стартує квест — сюжет на везінні', expect: ['EVENT_EFFECT_UNSUPPORTED'], patch(c) { withRoadEvent(c).nodes[0].choices[0].effects.push({ startQuest: 'ST-003' }); } },
  { base: 'combo', name: '[подія] у неіснуючій локації', expect: ['DIALOGUE_REF_MISSING'], patch(c) { withRoadEvent(c).trigger.at = ['loc.ghost']; } },
  { base: 'combo', name: '[подія] шанс 101 %', expect: ['SCHEMA_INVALID'], patch(c) { withRoadEvent(c).trigger.chance = 101; } },
  // GAME-108: when тригера — ті самі refs і combo-options, що й when квесту.
  { base: 'combo', name: '[подія] контроль: when тригера лише для велосипеда — коректно', expect: [], patch(c) { withRoadEvent(c).trigger.when = { transports: [T_BIKE] }; } },
  { base: 'combo', name: '[подія] when тригера з неіснуючим транспортом', expect: ['REF_MISSING'], patch(c) { withRoadEvent(c).trigger.when = { transports: ['transport.ghost'] }; } },
  { base: 'combo', name: '[подія] when тригера: собака на велосипеді, а собаку возять лише авто', expect: ['WHEN_UNSATISFIABLE'], patch(c) {
    withRoadEvent(c).trigger.when = { animals: [DOG], transports: [T_BIKE] };
    c.animals[0].transports = [T_CAR];
  } },
  { base: 'combo', name: '[подія] when тригера з невідомим полем', expect: ['SCHEMA_UNKNOWN_FIELD'], patch(c) { withRoadEvent(c).trigger.when = { weather: ['rain'] }; } },
  { base: 'combo', name: '[подія] без виходу — червоніє тими самими перевірками діалогів', expect: ['DIALOGUE_DEAD_END', 'DIALOGUE_NODE_UNREACHABLE'], patch(c) {
    const d = withRoadEvent(c);
    d.nodes[0].choices[0].next = 'rain';
    d.nodes[0].choices[1].next = 'rain';
  } },
  // Сцени сюжету й автоматичні гілки (GAME-142).
  { base: 'combo', name: '[сцена] контроль: сцена з фактом стартера й гілкою за ним — коректно', expect: [], patch(c) { withScene(c); } },
  { base: 'combo', name: '[сцена] і scene, і npcId', expect: ['DIALOGUE_OWNER'], patch(c) { c.dialogues = c.dialogues.filter((x) => x.npcId !== 'npc.shopkeeper'); withScene(c).npcId = 'npc.shopkeeper'; } },
  { base: 'combo', name: '[сцена] і scene, і trigger', expect: ['DIALOGUE_OWNER'], patch(c) { withScene(c).trigger = { at: ['loc.forest'], chance: 50, titleKey: SC('title') }; c.flags.push({ id: 'f.seen-*', type: 'bool', initial: false, generatedFrom: 'dialogues.trigger', owner: 'ядро' }); } },
  { base: 'combo', name: '[сцена] сцена стартує квест', expect: ['EVENT_EFFECT_UNSUPPORTED'], patch(c) { sceneNode(withScene(c) && c, 'lantern').choices[0].effects.push({ startQuest: 'ST-003' }); } },
  { base: 'combo', name: '[сцена] факт сцени не зареєстровано', expect: ['FLAG_UNREGISTERED'], patch(c) { withScene(c).scene.facts.push('f.fixture-ghost'); } },
  { base: 'combo', name: '[сцена] без перекладу назви', expect: ['LOCALE_MISSING'], patch(c) { withScene(c); delete c.locales.en[SC('title')]; } },
  { base: 'combo', name: '[сцена] гілку читає прапорець, якого не ставить ніхто (факт прибрано)', expect: ['DIALOGUE_FLAG_NEVER_SET', 'FLAG_REGISTERED_UNUSED'], patch(c) { withScene(c).scene.facts = []; sceneNode(c, 'open').branches[0].when = { flag: 'f.fixture-nobody' }; reg(c, 'f.fixture-nobody'); } },
  { base: 'combo', name: '[гілка] веде на неіснуючий вузол (вогнище стає недосяжним)', expect: ['DIALOGUE_NODE_UNREACHABLE', 'DIALOGUE_REF_MISSING'], patch(c) { withScene(c); sceneNode(c, 'open').branches[0].next = 'ghost'; } },
  { base: 'combo', name: '[гілка] без запасного next', expect: ['SCHEMA_INVALID'], patch(c) { withScene(c); delete sceneNode(c, 'open').next; } },
  { base: 'combo', name: '[гілка] гілка не рахується безумовним виходом (next по колу)', expect: ['DIALOGUE_DEAD_END', 'DIALOGUE_NODE_UNREACHABLE'], patch(c) { withScene(c); sceneNode(c, 'open').next = 'open'; } },
  { base: 'combo', name: '[гілка] суперечлива умова гілки', expect: ['DIALOGUE_COND_CONTRADICTION'], patch(c) { withScene(c); sceneNode(c, 'open').branches[0].when = { all: [{ flag: 'f.fixture-fire' }, { notFlag: 'f.fixture-fire' }] }; } },
  { base: 'combo', name: '[дороги] id не за форматом', expect: ['ID_FORMAT'], patch(c) { c.roads[0].id = 'camp-forest'; } },
  { base: 'combo', name: '[дороги] дорога за 0 хвилин', expect: ['SCHEMA_INVALID'], patch(c) { c.roads[0].ways[0].minutes = 0; } },
  { base: 'combo', name: '[умова] when переходу рядком', expect: ['SCHEMA_INVALID'], patch(c) { dogEntry(c).when = 'animals == dog'; } },
  { base: 'combo', name: '[умова] when самого квесту рядком', expect: ['SCHEMA_INVALID'], patch(c) { q(c, 'q.dog-walk').when = 'dog'; } },
  { base: 'combo', name: '[умова] when цілі рядком', expect: ['SCHEMA_INVALID'], patch(c) { q(c, 'q.dog-walk').objectives[0].when = 'dog'; } },
  { base: 'combo', name: '[умова] when локації рядком', expect: ['SCHEMA_INVALID'], patch(c) { c.locations.find((l) => l.id === 'loc.dog-park').when = 'dog'; } },
  { base: 'combo', name: '[умова] when NPC рядком', expect: ['SCHEMA_INVALID'], patch(c) { c.npcs[0].when = 'car'; } },
  { base: 'combo', name: '[умова] when квесту на неіснуючу тварину', expect: ['REF_MISSING'], patch(c) { q(c, 'q.dog-walk').when = { animals: ['animal.fixture-cat'] }; } },
  { base: 'combo', name: '[умова] when переходу на неіснуючий транспорт', expect: ['REF_MISSING'], patch(c) { dogEntry(c).when = { transports: ['transport.fixture-boat'] }; } },
  { base: 'combo', name: '[умова] основний шлях лише для кемпера з собакою — решта комбінацій без фіналу', expect: ['BRANCH_NO_NEXT', 'NO_PATH_TO_END'], patch(c) {
    c.transports.push({ id: 'transport.fixture-camper', nameKey: 'transport.fixture-camper' });
    for (const lang of c.meta.locales) c.locales[lang]['transport.fixture-camper'] = `[${lang}] camper`;
    for (const r of c.roads) r.ways.push({ transport: 'transport.fixture-camper', minutes: 30, cents: 0 }); // кемпер теж їздить дорогами
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
      id: 'q.bike-loop', titleKey: 'q.st-003', optional: true, xp: 15, when: { transports: [T_BIKE] },
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
    for (const id of ['npc.hiker-a', 'npc.hiker-b']) {
      c.npcs.push({ id, nameKey: 'npc.ranger', locationId: 'loc.camp', when: { profiles: [P_A], transports: [T_BIKE] } });
      c.dialogues.push({ ...shopDialogue([]), id: `dlg.fixture-${id.slice(4)}`, npcId: id });
    }
  } },
  { base: 'combo', name: '[сумісн.] нездійсненний when не ховає тупик старту для іншого профілю', expect: ['WHEN_UNSATISFIABLE', 'COMBO_NO_START'], patch(c) {
    c.profiles[0].transports = [T_CAR];
    c.npcs[1].when = { profiles: [P_A], transports: [T_BIKE] };
    q(c, 'ST-001').when = { profiles: [P_A] };
  } },

  // GAME-111 · Мія й велосипед (рішення власника 24.10): кішка не їде велосипедом, а контент про неї бачить лише той, хто їде з нею.
  // Мія — animal.cat (єдина тварина гри); у еталоні комбінацій є велосипед (T_BIKE), тож «Мія + велосипед» тут справжня комбінація.
  { base: 'combo', name: '[Мія] контроль: кішка лише в авто, справа про неї з умовою на кішку — коректно', expect: [], patch(c) {
    addMia(c, [T_CAR]); wave(c).tasks.push(miaTask({ when: { animals: [MIA] } }));
  } },
  { base: 'combo', name: '[Мія] кішка без transports — їде будь-чим, велосипедом теж', expect: ['MIA_ON_BIKE'], patch(c) { addMia(c, undefined); } },
  { base: 'combo', name: '[Мія] кішка дозволена на велосипеді', expect: ['MIA_ON_BIKE'], patch(c) { addMia(c, [T_CAR, T_BIKE]); } },
  { base: 'combo', name: '[Мія] справа про Мію без умови на кішку — була б і без неї', expect: ['MIA_CONTENT_UNGATED'], patch(c) {
    addMia(c, [T_CAR]); wave(c).tasks.push(miaTask({}));
  } },
  { base: 'combo', name: '[Мія] умова справи про Мію допускає й «без тварини»', expect: ['MIA_CONTENT_UNGATED'], patch(c) {
    addMia(c, [T_CAR]); wave(c).tasks.push(miaTask({ when: { animals: [MIA, 'animal.none'] } }));
  } },
  { base: 'combo', name: '[Мія] подія в дорозі про Мію без умови на кішку', expect: ['MIA_CONTENT_UNGATED'], patch(c) {
    addMia(c, [T_CAR]); const d = withRoadEvent(c); d.id = 'dlg.fixture-mia-box';
  } },
  { base: 'combo', name: '[Мія] контроль: переноска Мії в пакуванні з умовою на кішку — коректно', expect: [], patch(c) {
    addMia(c, [T_CAR]); withPacking(c).packing.items.push(miaCarrierRow({ when: { animals: [MIA] } })); addMiaItem(c);
  } },
  { base: 'combo', name: '[Мія] переноска Мії в пакуванні без умови на кішку', expect: ['MIA_CONTENT_UNGATED'], patch(c) {
    addMia(c, [T_CAR]); withPacking(c).packing.items.push(miaCarrierRow({})); addMiaItem(c);
  } },
  { base: 'combo', name: '[Мія] ціль квесту про Мію без умови на кішку', expect: ['MIA_CONTENT_UNGATED'], patch(c) {
    addMia(c, [T_CAR]); q(c, 'q.dog-walk').objectives.push({ id: 'mia-look', textKey: 'q.dog-walk.o1', kind: 'visit', target: 'loc.dog-park', required: false });
  } },
  // GAME-184: Мія у проханнях — картка прохання нейтральна, репліка про Мію лише за гілкою { animal: animal.cat }.
  { base: 'combo', name: '[Мія] контроль: репліка про Мію у проханні — лише за гілкою { animal: animal.cat } — коректно', expect: [], patch(c) {
    addMia(c, [T_CAR]); withRequest(c); withMiaLine(c, true);
  } },
  { base: 'combo', name: '[Мія] МУТАЦІЯ: репліка про Мію у проханні досяжна без умови на кішку', expect: ['MIA_CONTENT_UNGATED'], patch(c) {
    addMia(c, [T_CAR]); withRequest(c); withMiaLine(c, false);
  } },
  { base: 'combo', name: '[Мія] ціль прохання називає Мію (картку бачить і велосипедист)', expect: ['MIA_CONTENT_UNGATED'], patch(c) {
    addMia(c, [T_CAR]); withRequest(c); for (const lang of c.meta.locales) c.locales[lang]['req.fixture-chores.t1'] = `Mia ${lang}`;
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
  { name: 'назва файлу діалогу не збігається з id', files: 'baseline', override: { 'dialogue/fixture-shop.json': JSON.stringify({ ...shopDialogue([]), id: 'dlg.fixture-shop-x' }) }, expectStatus: 'ISSUES', expect: ['DIALOGUE_FILE_NAME'] },
  { name: 'одруківка в назві файлу', files: 'baseline', override: { 'quest.json': '[]' }, expectStatus: 'ISSUES', expect: ['CONTENT_UNKNOWN_FILE'] },
  { name: 'calendar.json (GAME-71) — відомий файл, не одруківка', files: 'baseline', override: { 'calendar.json': JSON.stringify(calendarCard()) }, expectStatus: 'OK', expect: [] },
  { name: 'packing.json (GAME-109) — відомий файл, не одруківка', files: 'baseline', override: { 'packing.json': JSON.stringify({ at: ['loc.camp'], capacity: [{ transport: 'transport.x', units: 1 }], items: [{ item: 'item.map', group: 'needed', units: 1 }] }) }, expectStatus: 'OK', expect: [] },
  { name: 'еталон із диска читається повністю й без втрат', files: 'baseline', expectStatus: 'OK', expect: [], roundTrip: true },
];
