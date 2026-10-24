// Реєстр кодів помилок. Кожен код належить рівно одній перевірці (або завантажувачу)
// і посилається на рядок специфікації brain/Передача/05-pershyi-kod.md.
// Самотест вимагає, щоб КОЖЕН код тут мав хоча б один зламаний приклад, на якому він спрацьовує.

export const CODES = {
  // завантажувач
  CONTENT_MISSING:      { check: 'loader', spec: 'порожній вивід із кодом 0 — збій (закон 4)' },
  CONTENT_PARSE:        { check: 'loader', spec: 'порожній вивід із кодом 0 — збій (закон 4)' },
  CONTENT_EMPTY:        { check: 'loader', spec: 'порожній вивід із кодом 0 — збій (закон 4)' },
  CONTENT_UNKNOWN_FILE: { check: 'loader', spec: 'файл з одруківкою в назві не має тихо ігноруватись' },
  DIALOGUE_FILE_NAME:   { check: 'loader', spec: 'GAME-28: файл dialogue/<x>.json містить діалог з id dlg.<x>' },

  // схеми
  SCHEMA_INVALID:       { check: 'schema', spec: '§1 типізовані схеми' },
  SCHEMA_UNKNOWN_FIELD: { check: 'schema', spec: '§1 визначення строго окремо від стану проходження' },

  // валідатор контенту, §2
  ID_FORMAT:            { check: 'id-format', spec: '§1 стабільний id, не назва і не індекс масиву' },
  ID_DUPLICATE:         { check: 'id-unique', spec: '§2 унікальність id у межах типу' },
  REF_MISSING:          { check: 'refs', spec: '§2 кожне посилання веде на існуючий запис' },
  OBJECTIVE_UNCOMPLETABLE: { check: 'objective-completable', spec: '§2 немає обов\u2019язкової цілі без досяжного шляху завершення' },
  ITEM_UNOBTAINABLE:    { check: 'item-obtainable', spec: '§2 немає вимоги предмета, який неможливо отримати' },
  CYCLE_NO_EXIT:        { check: 'cycle-exit', spec: '§2 немає циклу без умови виходу' },
  MAIN_GATE_NOT_GUARANTEED: { check: 'main-gate', spec: '§2 необов\u2019язкова гілка не блокує основний сюжет' },
  TRANSITION_REQUIRES_NOT_READY: { check: 'transition-gate', spec: '§3 перехід не впирається в requires, які в мить переходу ще неможливо виконати (рецензія GAME-29)' },
  REWARD_GRANT_DUPLICATE:     { check: 'reward-once', spec: '§2 нагорода не видається двічі за один id' },
  REWARD_REPEATABLE_UNGUARDED:{ check: 'reward-once', spec: '§2 нагорода не видається двічі за один id' },
  LOCALE_MISSING:       { check: 'locale-keys', spec: '§2 ключі локалізації існують для кожної мови' },
  DIALOGUE_OWNER:       { check: 'dialogue-owner', spec: 'GAME-31: діалог має рівно одного власника — NPC (npcId) або подію в дорозі (trigger)' },
  EVENT_EFFECT_UNSUPPORTED: { check: 'dialogue-owner', spec: 'GAME-31: подія в дорозі лише ставить прапорці — квести стартує й закриває розмова з NPC (на везінні сюжет не тримається)' },
  ROAD_UNREACHABLE:     { check: 'roads', spec: 'GAME-31: кожен вузол дороги досяжний від дому — для кожного транспорту' },
  ROAD_NO_RETURN:       { check: 'roads', spec: 'GAME-31: з кожного вузла є шлях назад (а отже й до кемпінгу) — для кожного транспорту' },
  ROAD_SELF_LOOP:       { check: 'roads', spec: 'GAME-31: дорога веде з локації в неї ж — одруківка (рецензія)' },
  ROAD_PAID_NO_ECONOMY: { check: 'roads', spec: 'SIM-TRAVEL-003: платна дорога без доходу — грошовий тупик; до економіки (GAME-47/71) дороги безкоштовні' },
  ROAD_NO_HOME:         { check: 'roads', spec: 'GAME-31: є дороги — стартовий квест мусить мати locationId (інакше перша дорога з «ніде»)' },
  ROAD_DUPLICATE:       { check: 'roads', spec: 'GAME-31: між двома вузлами одне ребро в кожен бік — інакше ціна дороги неоднозначна' },
  // GAME-72: навички профілю (startSkills) — лише вісім відомих напрямів, кожен раз.
  SKILL_UNKNOWN:        { check: 'skills', spec: 'GAME-72: startSkills профілю називає лише один із восьми напрямів навичок (SKILL_IDS)' },
  SKILL_DUPLICATE:      { check: 'skills', spec: 'GAME-72: навичка в startSkills профілю — щонайбільше раз (інакше стартовий ранг неоднозначний)' },
  // GAME-73: спорядження — повна картка характеристик, викуп ≤ ціни, тир — компроміс, а не «сильніше».
  GEAR_FIELD_MISSING:   { check: 'gear', spec: 'GAME-73: предмет спорядження (kind) має всі поля: tier, weightG, volumeL, waterproofMm, comfortC, sleeps, priceCents, resaleCents' },
  GEAR_RESALE_ABOVE_PRICE: { check: 'gear', spec: 'SIM-INV-004: викуп уживаного (resaleCents) не дорожчий за купівлю (priceCents) — інакше купи-продай дає гроші з нічого' },
  GEAR_DOMINATED:       { check: 'gear', spec: 'SIM-INV-005: річ корисна у своїй ситуації — немає іншої речі того ж виду, не гіршої ні в чому (вага, об’єм, вологостійкість, тепло, місця, ціна)' },
  // GAME-71: календар життя — справжні дати, канікули без перетинів, календар є, коли профіль працює чи має школяра.
  CALENDAR_MISSING:     { check: 'calendar', spec: 'GAME-71: профіль із роботою (job) чи школярем (childInSchool) потребує content/calendar.json — без нього ні зарплати, ні канікул' },
  CALENDAR_BAD_DATE:    { check: 'calendar', spec: 'GAME-71: start — справжня дата YYYY-MM-DD; свята й межі канікул — справжні MM-DD, що є щороку (не 02-30 і не 02-29)' },
  CALENDAR_RANGE_OVERLAP: { check: 'calendar', spec: 'GAME-71: канікули не перетинаються, свято не записане двічі — інакше межі канікул неоднозначні' },
  JOB_BILLS_EXCEED_SALARY: { check: 'calendar', spec: 'GAME-71, SIM-LIFE-008: рахунки профілю (billsCents) не більші за зарплату (salaryCents) — інакше робота веде в мінус, а гравця карають за сам час' },
  // GAME-109: пакування — кожна річ раз, місце на кожен транспорт, «потрібне» завжди вміщається, підписи лише про пакувальні речі.
  PACK_ITEM_DUPLICATE:  { check: 'packing', spec: 'GAME-109: річ у packing.items — раз, інакше її місце й група неоднозначні' },
  PACK_CAPACITY_MISSING: { check: 'packing', spec: 'GAME-109: для кожного транспорту рівно один запис місця (capacity) — без нього гравець не спакує нічого або спакує безмежно' },
  PACK_NEEDED_OVERFLOW: { check: 'packing', spec: 'GAME-109: усе «потрібне» (для будь-якої тварини) вміщається в кожен транспорт — інакше «укласти автоматично» не може включити його' },
  PACK_NOTE_UNPACKABLE: { check: 'packing', spec: 'GAME-109: підпис говорить про річ, яку справді можна спакувати (є в packing.items)' },
  FACT_SOURCE_MISSING:  { check: 'fact-source', spec: '§2 зовнішній факт має джерело' },
  FACT_DATE_INVALID:    { check: 'fact-source', spec: '§2 зовнішній факт має дату перевірки' },
  FACT_KIND_INVALID:    { check: 'fact-source', spec: '§2 зовнішній факт має тип' },
  // GAME-56: давність — попередження, не помилка (severity: 'warning' — запуск не червоніє).
  FACT_STALE:           { check: 'fact-stale', spec: 'GAME-56: факт, звірений понад FACT_STALE_DAYS днів тому, треба перезвірити', severity: 'warning' },

  // перевірник графа квестів, §3
  NODE_UNREACHABLE:     { check: 'reachable', spec: '§3 кожен вузол досяжний зі старту' },
  NO_PATH_TO_END:       { check: 'path-to-end', spec: '§3 з кожного вузла є шлях до завершення' },
  REQUIRES_CYCLE:       { check: 'requires-deadlock', spec: '§3 немає взаємного блокування двох квестів' },
  OPTIONAL_NO_DECLINE:  { check: 'optional-decline', spec: '§3 відмова від необов\u2019язкового вузла лишає шлях уперед' },
  BRANCH_NO_NEXT:       { check: 'branch-next', spec: '§3 кожна гілка має наступний етап або кінець' },

  // діалоги, GAME-28 (TD-005 граф, TD-006 типізовані умови)
  DIALOGUE_REF_MISSING:      { check: 'dialogue-refs', spec: '§2 кожне посилання діалогу (NPC, квест, ціль, транспорт, вузол) веде на існуючий запис' },
  DIALOGUE_NODE_UNREACHABLE: { check: 'dialogue-reachable', spec: '§3 кожен вузол діалогу досяжний зі старту' },
  DIALOGUE_DEAD_END:         { check: 'dialogue-dead-end', spec: '§3 з кожного вузла діалогу є безумовний шлях до end' },
  DIALOGUE_FLAG_NEVER_SET:   { check: 'dialogue-flags', spec: '§2 умова не читає прапорець, який ніщо досяжне не ставить (сетер за нездійсненною умовою — не сетер)' },
  DIALOGUE_COND_CONTRADICTION: { check: 'dialogue-flags', spec: '§3 умова all не вимагає водночас flag і notFlag того самого прапорця (чи remembers і notRemembers того самого факту)' },
  MEMORY_NEVER_SET:          { check: 'dialogue-memory', spec: 'GAME-48: умова не читає факт пам\u2019яті, який жоден здійсненний remember у розмові з ЦИМ NPC не ставить' },
  DIALOGUE_QUEST_GATE:       { check: 'dialogue-quest-gate', spec: '§2 startQuest не обходить requires.quests квесту-цілі' },
  OBJECTIVE_BY_DIALOGUE_KIND:   { check: 'dialogue-objective-gate', spec: 'GAME-87: byDialogue — лише для цілі talk' },
  OBJECTIVE_BY_DIALOGUE_OPEN:   { check: 'dialogue-objective-gate', spec: 'GAME-87: ціль byDialogue мусить мати репліку, що її закриває' },
  OBJECTIVE_BY_DIALOGUE_ALWAYS: { check: 'dialogue-objective-gate', spec: 'GAME-87: репліка-закривач не лежить на кожному шляху діалогу (інакше це будь-яка розмова)' },
  DIALOGUE_OBJECTIVE_KIND:   { check: 'dialogue-objective-kind', spec: '§2 розмова закриває лише ціль talk із цим самим NPC' },
  DIALOGUE_NPC_DUPLICATE:    { check: 'dialogue-npc-unique', spec: '§2 один діалог на NPC — інакше рушій не знає, який запускати' },

  // реєстр прапорців і фактів стану, GAME-115 (content/flags.json)
  FLAG_UNREGISTERED:      { check: 'flags', spec: 'GAME-115: прапорець (f.*), факт пам\u2019яті (m.*) чи факт стану (s.*) в умові чи ефекті — лише зареєстрований у content/flags.json' },
  FLAG_ENUM_VALUE:        { check: 'flags', spec: 'GAME-115: значення enum-прапорця (f.<назва>-<значення>) — лише з його values; «unset» — це відсутність прапорця, а не значення' },
  FLAG_TYPE_MISMATCH:     { check: 'flags', spec: 'GAME-115: умова читає запис реєстру як його тип — flag/notFlag/setFlag лише bool (enum — через конкретне значення), transport — лише enum s.transport' },
  FLAG_REGISTERED_UNUSED: { check: 'flags', spec: 'GAME-115: зареєстрований, але ніде не вживаний запис — помилка, якщо не позначений reserved: true (наперед для майбутніх розділів)' },
  FLAG_NEVER_READ:        { check: 'flags', spec: 'GAME-110: прапорець f.* чи факт пам\u2019яті m.*, який ставить ефект, читає хоч одна умова (enum — хоч одне значення); інакше вибір «пам\u2019ятається» без жодного наслідку' },
  FLAG_REGISTRY_INVALID:  { check: 'flags', spec: 'GAME-115: запис реєстру узгоджений — початкове значення відповідає типу й ядру, enum має значення, сімейство має породжувача, reserved не вживаний, назви не перетинаються' },

  // комбінації профіль × транспорт × тварина
  COMBO_NO_START:             { check: 'combos', spec: '§3 кожен вузол досяжний — у кожній комбінації стану гравця' },
  COMBO_TARGETED_UNREACHABLE: { check: 'combos', spec: '§3 вузол, адресований комбінації, у ній досяжний' },
  COMBO_DEAD_CONTENT:         { check: 'combos', spec: '§3 кожен вузол досяжний хоча б в одній комбінації' },
  COMBO_OPTION_UNUSABLE:      { check: 'combo-options', spec: '§1 кожен транспорт можна обрати хоча б в одній комбінації' },
  WHEN_UNSATISFIABLE:         { check: 'combo-options', spec: '§3 умова when (з умовами свого квесту, а для переходу — і квесту-цілі) відповідає хоча б одній дозволеній комбінації' },

  // перевірка, що впала сама, — теж червоне, а не зелене
  INTERNAL_ERROR:       { check: 'runner', spec: 'перевірка, що впала, не сміє виглядати як пройдена' },
};

// GAME-72: вісім напрямів навичок. Той самий перелік — SKILL_IDS у src/core/skills.ts; звірку тримає
// src/content/semantics.test.ts — розійдуться, і тест почервоніє.
export const SKILL_IDS = ['skill.planning', 'skill.camping', 'skill.mechanics', 'skill.electrics', 'skill.cooking', 'skill.finance', 'skill.endurance', 'skill.communication'];

// GAME-73: поля картки спорядження (крім kind — він і робить предмет спорядженням).
export const GEAR_FIELDS = ['tier', 'weightG', 'volumeL', 'waterproofMm', 'comfortC', 'sleeps', 'priceCents', 'resaleCents'];

// GAME-115: сімейства прапорців, які ставить ЯДРО, а не контент. Сімейство в реєстрі — «<префікс>*» з generatedFrom;
// конкретні назви породжує gen(content). Ті самі формати — packFlag (src/core/packing.ts) і eventSeenFlag
// (src/core/story.ts); звірку тримає src/content/flags.test.ts.
export const FLAG_FAMILIES = {
  'packing.items': { prefix: 'f.pack-', gen: (content) => (content.packing?.items ?? []).map((x) => `f.pack-${String(x.item).replace(/^item\./, '')}`) },
  'dialogues.trigger': { prefix: 'f.seen-', gen: (content) => (content.dialogues ?? []).filter((d) => d.trigger).map((d) => `f.seen-${String(d.id).replace(/^dlg\./, '')}`) },
};

export const FACT_KINDS = ['regulation', 'geography', 'price', 'schedule', 'culture'];

// GAME-56: факт, звірений понад рік тому, — попередження. Чому 365, див. docs/CONTENT-VALIDATOR.md.
export const FACT_STALE_DAYS = 365;

// Попередження друкується як ::warning:: і не робить код виходу ненульовим; решта кодів — помилки.
export const isWarning = (code) => CODES[code]?.severity === 'warning';
