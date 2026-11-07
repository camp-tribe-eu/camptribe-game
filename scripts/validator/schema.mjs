// Мінімальний строгий валідатор схем без залежностей.
// Невідоме поле — помилка: так у визначення не просочується стан проходження
// (completed, progress, visited…) і не живуть одруківки.

import { FLAG_FAMILIES } from './codes.mjs';

const str = { t: 'string' };
const bool = { t: 'boolean' };
const int0 = { t: 'int', min: 0 };
const int1 = { t: 'int', min: 1 };
const arr = (of) => ({ t: 'array', of });
const obj = (fields) => ({ t: 'object', fields });
const en = (...values) => ({ t: 'string', enum: values });
const req = (s) => ({ ...s, required: true });
const ids = { t: 'array', of: str, min: 1 };

// Умова на стан гравця: усі названі виміри мусять збігтися, всередині виміру — будь-який зі списку.
// Порожній список заборонено: «нікому» — це одруківка, а не намір. Семантика: scripts/validator/combos.mjs.
const when = obj({ profiles: ids, transports: ids, animals: ids });

// Діалоги (GAME-28, TD-005/TD-006). Умова — типізований об'єкт, ніколи не рядок «car && x».
// union: об'єкт рівно з ОДНИМ ключем-дискримінатором зі списку варіантів; далі — строга схема варіанта.
const union = (variants) => ({ t: 'union', variants });
const cond = union({});
const conds = { t: 'array', of: cond, min: 1 };
Object.assign(cond.variants, {
  flag: obj({ flag: req(str) }),
  notFlag: obj({ notFlag: req(str) }),
  quest: obj({ quest: req(str), status: req(en('active', 'completed')) }),
  transport: obj({ transport: req(str) }),
  // GAME-184: тварина гравця (`animal.cat` чи `animal.none`) — репліка про Мію лише тому, хто справді їде з кішкою.
  animal: obj({ animal: req(str) }),
  // GAME-48: пам'ять NPC — того, чия це розмова (факт «m.назва»).
  remembers: obj({ remembers: req(str) }),
  notRemembers: obj({ notRemembers: req(str) }),
  // GAME-202: справа живої хвилі ще відкрита — доручення в розмові зникає, щойно справу зроблено чи вона спізнилась.
  taskOpen: obj({ taskOpen: req(str) }),
  all: obj({ all: req(conds) }),
  any: obj({ any: req(conds) }),
});
const effect = union({
  setFlag: obj({ setFlag: req(str) }),
  startQuest: obj({ startQuest: req(str) }),
  completeObjective: obj({ completeObjective: req(obj({ quest: req(str), objective: req(str) })) }),
  remember: obj({ remember: req(str) }),
});
const choice = obj({ textKey: req(str), next: req(str), when: cond, effects: arr(effect) });
// GAME-142: автоматична розвилка вузла з `next` — перша гілка, чия умова виконана, веде далі замість `next`.
// Гравець нічого не обирає: так сцена показує «вогнище чи ліхтар», «є фото чи ні» за фактами, а не за кліком.
// `next` лишається обов'язковим безумовним запасним виходом (без нього — SCHEMA_INVALID нижче).
const branch = obj({ when: req(cond), next: req(str) });
const node = obj({
  id: req(str), speaker: req(en('npc', 'player')), textKey: req(str),
  end: bool, translated: bool, next: str, branches: { t: 'array', of: branch, min: 1 }, choices: { t: 'array', of: choice, min: 1 },
});

const reward = obj({ grantId: req(str), items: arr(obj({ item: req(str), qty: req(int1) })), money: int0, once: bool });

// content/dialogue/<назва>.json — один діалог на файл; завантажувач складає їх у content.dialogues.
// У SCHEMAS як `dialogues` (DC-011), але НЕ в COLLECTIONS: це тека файлів, а не один <колекція>.json.
// Власник діалогу — рівно один: npcId (розмова), trigger (подія в дорозі, GAME-31) або scene (сцена сюжету, GAME-142).
// «Рівно один» стереже перевірка dialogue-owner власним кодом, а не загальний SCHEMA_INVALID.
// when (GAME-108) — кому подія взагалі може трапитись (профіль × транспорт × тварина), як when квесту.
const trigger = obj({ at: req(ids), chance: req({ t: 'int', min: 1, max: 100 }), titleKey: req(str), when });
// Сцена (GAME-142): діалог, який відкриває сюжет командою ядра StartScene — без NPC і без кидка RNG. `facts` — bool-прапорці,
// які стартер сцени може поставити в мить старту (напр. «вогнище дозволене»): ядро приймає лише їх. `atQuest` — квест, поки який
// активний, сцену дозволено починати (і ніде більше); немає — без обмеження.
const scene = obj({ titleKey: req(str), facts: arr(str), atQuest: str });
export const DIALOGUE_SCHEMA = obj({ id: req(str), npcId: str, trigger, scene, start: req(str), nodes: req({ t: 'array', of: node, min: 1 }) });

// Хвилі напруги (GAME-170, рішення власника 24–25.10): 2–4 одночасні справи зі строком в ігрових хвилинах; наслідки «встиг»
// і «не встиг» — обидва, і жоден не поразка. limitMin, done/late навмисно НЕ required тут: їх стереже перевірка waves власними
// кодами (WAVE_LIMIT_INVALID, WAVE_OUTCOME_MISSING), щоб забутий строк не ховався під загальним SCHEMA_INVALID.
// Ефект наслідку — лише setFlag або wetGear (зріз 3: «не встигли до дощу» — спорядження вологе через наявну систему вологи GAME-73);
// хвиля не рухає сюжет (кінець розділу від хвиль не залежить, fallback — завжди).
const waveEffect = union({ setFlag: obj({ setFlag: req(str) }), wetGear: obj({ wetGear: req({ t: 'boolean', only: true }) }) });
const waveOutcome = obj({ textKey: req(str), effects: arr(waveEffect) });
const waveTask = obj({
  id: req(str), textKey: req(str), limitMin: { t: 'int' }, leaderOnly: bool, animal: str, after: obj({ objectives: arr(str), tasks: arr(str) }),
  targets: { t: 'array', of: obj({ id: req(str), safe: req(bool) }), min: 1 }, when, done: waveOutcome, late: waveOutcome,
});
export const WAVE_SCHEMA = obj({ id: req(str), titleKey: req(str), hookKey: req(str), stage: req(str), when, tasks: req(arr(waveTask)), allDone: waveOutcome, fallback: obj({ textKey: req(str) }) });

// Наклейки Атласу (GAME-182): `cond` НЕ required тут — його відсутність стереже перевірка stickers власним кодом STICKER_NO_COND (як limitMin у хвиль), щоб забута умова не ховалась під загальним SCHEMA_INVALID.
export const STICKER_SCHEMA = obj({ id: req(str), nameKey: req(str), textKey: req(str), kind: req(en('place', 'people', 'mia', 'team', 'gold')), icon: req(str), cond });

// Сліди дідуся Генрі (GAME-215): позначка олівцем на мапі регіону (`spot` — об'єкт мапи) або людина, що пам'ятає (`npc` — розмова ставить
// прапорець). `year` — рік сліду (1978; немає — свіжий слід цієї осені: дата на листівці каже, що є що). `reward` НЕ required тут:
// її відсутність стереже перевірка traces власним кодом TRACE_NO_REWARD (як cond у наклейок), щоб слід без нагороди не ховався під SCHEMA_INVALID.
export const TRACE_SCHEMA = obj({
  id: req(str), kind: req(en('cache', 'person', 'inscription', 'riddle', 'gift')), location: req(str), spot: str, npc: str,
  nameKey: req(str), textKey: req(str), year: { t: 'int', min: 1900, max: 2100 }, reward: obj({ xp: req(int0) }),
});

export const SCHEMAS = {
  traces: TRACE_SCHEMA,
  stickers: STICKER_SCHEMA,
  dialogues: DIALOGUE_SCHEMA,
  waves: WAVE_SCHEMA,
  meta: obj({ start: req(str), locales: req(arr(str)) }),
  // transports — з якими транспортами сумісний запис; немає поля — з усіма. Несумісні комбінації
  // не перебираються: гравець не може їх обрати, тож тупик у них — не тупик (закон 5).
  // startSkills (GAME-72, DC-022): стартові ранги професії 0–5; які id відомі — перевірка skills.
  // job (GAME-71, DC-022): зарплата й рахунки за місяць, центи; днів відпустки на рік. childInSchool — у родині школяр:
  // довга подорож поза канікулами — лише явним рішенням (SIM-LIFE-004). Рахунки ≤ зарплати — перевірка calendar.
  profiles: obj({
    id: req(str), nameKey: req(str), transports: ids, startSkills: { t: 'array', of: obj({ skill: req(str), rank: req({ t: 'int', min: 0, max: 5 }) }), min: 1 },
    job: obj({ salaryCents: req(int1), billsCents: req(int0), vacationDays: req({ t: 'int', min: 0, max: 60 }) }), childInSchool: bool,
  }),
  // Календар гри (GAME-71, DC-026): дата дня 0 «YYYY-MM-DD», день виплати 1…28 (є в кожному місяці), свята й канікули —
  // «MM-DD» щороку. Справжність дат і перетини — перевірка calendar власними кодами, не SCHEMA_INVALID.
  calendar: obj({
    start: req(str), payday: req({ t: 'int', min: 1, max: 28 }), longTripDays: req(int1), maxLeaveDays: req(int1), bookAheadDays: req(int1),
    publicHolidays: req(arr(str)), schoolHolidays: req(arr(obj({ from: req(str), to: req(str) }))),
  }),
  // Пакування (GAME-109): одна картка. openAfter — квест, після якого відкривається екран; at — де пакують;
  // capacity — місце (одиниці) на транспорт; items — 12 речей у трьох групах, when — лише для частини гравців (переноска — з кішкою);
  // notes — підпис на екрані, коли речі бракує. Посилання, перелив місця й дублі — перевірка packing власними кодами.
  packing: obj({
    openAfter: str, at: req(ids),
    capacity: req({ t: 'array', of: obj({ transport: req(str), units: req(int1) }), min: 1 }),
    items: req({ t: 'array', of: obj({ item: req(str), group: req(en('needed', 'useful', 'leave')), units: req(int1), when }), min: 1 }),
    notes: arr(obj({ missing: req(str), transports: ids, textKey: req(str) })),
  }),
  transports: obj({ id: req(str), nameKey: req(str) }),
  animals: obj({ id: req(str), nameKey: req(str), transports: ids }),
  // Спорядження (GAME-73, DC-023): вид, тир і характеристики. Поля НЕ required тут: їх стереже перевірка gear
  // власним кодом GEAR_FIELD_MISSING, щоб забута вага не ховалась під загальним SCHEMA_INVALID. Простий предмет
  // (дрова, ліхтар) не має жодного з них. comfortC — нижня температура комфорту, °C; waterproofMm — водяний стовп.
  items: obj({
    id: req(str), nameKey: req(str), kind: en('tent', 'sleeping-bag'), tier: { t: 'int', min: 1, max: 3 },
    weightG: int1, volumeL: int1, waterproofMm: int0, comfortC: { t: 'int', min: -40, max: 40 }, sleeps: int1,
    priceCents: int0, resaleCents: int0,
  }),
  // follows (GAME-202): член родини ходить із героєм — розмова можлива на будь-якій мапі, locationId — лише «домашня» мапа для панелі.
  // card (GAME-211): картка персонажа — звичка, вподобання, манера мови (2–3 фрази), розклад ранок/день/вечір, страх або мрія. Поля НЕ required
  // тут: їх відсутність стереже перевірка npc-cards власними кодами (NPC_CARD_MISSING, NPC_CARD_NO_SCHEDULE), а не загальний SCHEMA_INVALID.
  // schedule.<пора>.zone — зона табору (ZONES у src/view/world/ambient.ts), лише для мешканців; збіг із розкладом руху звіряє юніт-тест.
  npcs: obj({
    id: req(str), nameKey: req(str), locationId: req(str), unlockedBy: str, sells: arr(str), when, follows: bool,
    // gifts/heart (GAME-230): що мешканець любить/не любить із подарунків (id предметів) і сцена серця (діалог зі `scene`) за `at` серць (1…5).
    // Узгодженість (предмет існує, любить ≥ 1, сцена справді сцена й єдина) стереже перевірка gifts кодами GIFT_PREF_INVALID / HEART_EVENT_INVALID.
    gifts: obj({ likes: arr(str), dislikes: arr(str) }),
    heart: obj({ scene: str, at: { t: 'int', min: 1, max: 5 } }),
    // trades (GAME-276): обмін «річ за річ» із сусідом; узгодженість (предмети є, не дорожче, ніж віддано) — перевірка gifts кодом TRADE_OFFER_INVALID.
    trades: arr(obj({ id: req(str), give: req(arr(obj({ itemId: req(str), qty: req(int1) }))), get: req(arr(obj({ itemId: req(str), qty: req(int1) }))) })),
    card: obj({
      habit: str, likes: str, dislikes: str, dream: str, phrases: arr(str),
      schedule: obj({ morning: obj({ textKey: str, zone: str }), day: obj({ textKey: str, zone: str }), evening: obj({ textKey: str, zone: str }) }),
    }),
  }),
  locations: obj({ id: req(str), nameKey: req(str), unlockedBy: str, items: arr(str), sheltered: bool, when }),
  quests: obj({
    id: req(str), titleKey: req(str), optional: req(bool), end: bool, dayEnd: bool, xp: int0,
    giverId: str, locationId: str, when,
    gate: obj({ day: req(int0), fromMinute: int0 }),
    requires: obj({ quests: arr(str), items: arr(str) }),
    objectives: req(arr(obj({
      id: req(str), textKey: req(str), kind: req(en('talk', 'visit', 'collect', 'deliver')),
      target: req(str), npcId: str, required: req(bool), byDialogue: bool, gearCheck: bool, when,
    }))),
    transitions: req(arr(obj({ on: req(en('complete', 'decline')), to: req(str), choiceKey: str, when }))),
    reward,
  }),
  events: obj({ id: req(str), titleKey: req(str), locationId: str, repeatable: req(bool), reward }),
  // Дороги (GAME-31): ребро між двома локаціями; ways — якими транспортами і скільки це коштує часу й грошей.
  // Транспорту немає в ways — цим ребром він не їде. twoWay — те саме ребро і назад.
  roads: obj({
    id: req(str), from: req(str), to: req(str), twoWay: bool,
    // risk (GAME-72) — небезпека дороги цим транспортом 0…3; навичка її не знижує (SIM-SKL-003).
    ways: req({ t: 'array', of: obj({ transport: req(str), minutes: req(int1), cents: req(int0), risk: { t: 'int', min: 0, max: 3 } }), min: 1 }),
  }),
  // source/checkedAt/kind навмисно не required тут: їх стереже перевірка fact-source
  // власними кодами, щоб відсутнє джерело не ховалось під загальним SCHEMA_INVALID.
  facts: obj({ id: req(str), claimKey: req(str), source: str, checkedAt: str, kind: str }),
  // Прохання сусідів (GAME-180): просильник, цілі на мапі (іконка + об'єкт), нагорода-гачок для GAME-181. Решту (діалог, мапу, прапорці) звіряє перевірка requests.
  requests: obj({
    id: req(str), giver: str, weather: str, after: str, titleKey: req(str), goalKey: req(str), trackKey: req(str),   // after (GAME-184): продовження арки — доступне, коли здано прохання `after` того ж просильника
    targets: req(arr(obj({ id: req(str), spot: req(str), icon: req(en('litter', 'bird', 'chain', 'lantern', 'cookie', 'apple', 'camera', 'star', 'wire')), labelKey: req(str), mia: bool }))),
    reward: req(obj({ xp: req(int0), om: req(int0), skills: arr(str) })),
  }),
  // Реєстр прапорців і фактів стану (GAME-115, DC-015): f.* — прапорці (bool або enum, закодований як f.<назва>-<значення>;
  // сімейство «f.<префікс>-*» ставить ядро — generatedFrom), m.* — пам'ять NPC, s.* — факт стану гравця (транспорт, погода).
  // initial — scalar: тип звіряє перевірка flags власним кодом FLAG_REGISTRY_INVALID, не SCHEMA_INVALID.
  // reserved — зареєстровано наперед для майбутнього розділу; aka — назви з реєстру радника, з якими зведено.
  // journal — вибір, що ставить цей факт, пишеться в журнал подорожі (GAME-110); текст — journal.<id>[-<значення>].
  flags: obj({
    id: req(str), type: req(en('bool', 'enum', 'number', 'item', 'location')), initial: req({ t: 'scalar' }), owner: req(str), note: str,
    values: { t: 'array', of: str, min: 1 }, valuesFrom: en('transports'), generatedFrom: en(...Object.keys(FLAG_FAMILIES)),
    reserved: bool, kind: en('interaction'), aka: arr(str), journal: bool,
  }),
};


export const COLLECTIONS = ['profiles', 'transports', 'animals', 'items', 'npcs', 'locations', 'quests', 'events', 'facts', 'roads', 'flags', 'waves', 'requests', 'stickers', 'traces'];

function typeOk(s, v) {
  switch (s.t) {
    case 'string': return typeof v === 'string' && (!s.enum || s.enum.includes(v));
    case 'boolean': return typeof v === 'boolean' && (s.only === undefined || v === s.only);
    case 'scalar': return typeof v === 'string' || typeof v === 'boolean' || Number.isFinite(v);
    case 'int': return Number.isInteger(v) && v >= (s.min ?? -Infinity) && v <= (s.max ?? Infinity);
    case 'array': return Array.isArray(v) && v.length >= (s.min ?? 0);
    case 'object': case 'union': return v !== null && typeof v === 'object' && !Array.isArray(v);
    default: return false;
  }
}

function walk(s, v, where, out) {
  if (!typeOk(s, v)) {
    const want = s.enum ? `одне з ${s.enum.join('|')}` : (s.only !== undefined ? `${s.t} ${s.only}` : s.t) + (s.min != null ? (s.t === 'array' ? ` довжини >= ${s.min}` : ` >= ${s.min}`) : '') + (s.max != null ? ` <= ${s.max}` : '');
    out.push({ code: 'SCHEMA_INVALID', where, msg: `очікується ${want}, отримано ${JSON.stringify(v)}` });
    return;
  }
  if (s.t === 'union') {
    // Object.hasOwn, а не `in`: інакше `constructor`/`__proto__` з JSON рахуються за варіант.
    const keys = Object.keys(v).filter((k) => Object.hasOwn(s.variants, k));
    if (keys.length !== 1) {
      out.push({ code: 'SCHEMA_INVALID', where, msg: `очікується рівно один із ключів ${Object.keys(s.variants).join('|')}, отримано ${JSON.stringify(v)}` });
      return;
    }
    return walk(s.variants[keys[0]], v, where, out);
  }
  if (s.t === 'array') v.forEach((x, i) => walk(s.of, x, `${where}[${i}]`, out));
  if (s.t === 'object') {
    for (const [k, fs] of Object.entries(s.fields)) {
      if (v[k] === undefined) {
        if (fs.required) out.push({ code: 'SCHEMA_INVALID', where: `${where}.${k}`, msg: 'обов\u2019язкове поле відсутнє' });
      } else walk(fs, v[k], `${where}.${k}`, out);
    }
    for (const k of Object.keys(v)) {
      // Object.hasOwn, а не `in`: прототипні ключі (`constructor`, `__proto__` з JSON) — теж невідомі поля.
      if (!Object.hasOwn(s.fields, k)) out.push({ code: 'SCHEMA_UNKNOWN_FIELD', where: `${where}.${k}`, msg: 'невідоме поле (стан проходження чи одруківка?)' });
    }
  }
}

export function checkSchema(content) {
  const out = [];
  if (!typeOk({ t: 'object' }, content)) return [{ code: 'SCHEMA_INVALID', where: 'content', msg: 'не об\u2019єкт' }];
  const known = ['meta', 'calendar', 'packing', 'locales', 'dialogues', ...COLLECTIONS];
  for (const k of Object.keys(content)) {
    if (!known.includes(k)) out.push({ code: 'SCHEMA_UNKNOWN_FIELD', where: k, msg: 'невідомий розділ контенту' });
  }
  walk(SCHEMAS.meta, content.meta, 'meta', out);
  if (content.calendar !== undefined) walk(SCHEMAS.calendar, content.calendar, 'calendar', out);
  if (content.packing !== undefined) walk(SCHEMAS.packing, content.packing, 'packing', out);
  for (const c of COLLECTIONS) {
    if (content[c] === undefined) continue;
    if (!Array.isArray(content[c])) { out.push({ code: 'SCHEMA_INVALID', where: c, msg: 'очікується масив' }); continue; }
    content[c].forEach((e, i) => walk(SCHEMAS[c], e, `${c}[${i}]`, out));
  }
  if (content.dialogues !== undefined) {
    if (!Array.isArray(content.dialogues)) out.push({ code: 'SCHEMA_INVALID', where: 'dialogues', msg: 'очікується масив' });
    else content.dialogues.forEach((d, i) => {
      const where = `dialogue:${typeof d?.id === 'string' ? d.id : i}`;
      const before = out.length;
      walk(DIALOGUE_SCHEMA, d, where, out);
      if (out.length > before) return;
      // Вихід вузла — рівно один спосіб: end, next або choices. Два одразу — рушій не знає, що робити.
      for (const n of d.nodes) {
        const ways = [n.end === true, n.next !== undefined, n.choices !== undefined].filter(Boolean).length;
        if (ways > 1) out.push({ code: 'SCHEMA_INVALID', where: `${where}/${n.id}`, msg: 'вузол має більше одного способу виходу: лише одне з end | next | choices' });
        if (n.branches !== undefined && n.next === undefined) out.push({ code: 'SCHEMA_INVALID', where: `${where}/${n.id}.branches`, msg: 'branches — лише разом із next: next — безумовний запасний вихід, коли жодна гілка не збіглась' });
      }
    });
  }
  const loc = content.locales;
  if (loc !== undefined) {
    if (!typeOk({ t: 'object' }, loc)) out.push({ code: 'SCHEMA_INVALID', where: 'locales', msg: 'очікується об\u2019єкт мова → ключі' });
    else for (const [lang, table] of Object.entries(loc)) {
      if (!typeOk({ t: 'object' }, table)) { out.push({ code: 'SCHEMA_INVALID', where: `locales.${lang}`, msg: 'очікується об\u2019єкт ключ → рядок' }); continue; }
      for (const [k, v] of Object.entries(table)) {
        if (typeof v !== 'string') out.push({ code: 'SCHEMA_INVALID', where: `locales.${lang}.${k}`, msg: 'переклад має бути рядком' });
      }
    }
  }
  return out;
}
