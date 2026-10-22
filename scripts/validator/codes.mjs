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
  FACT_SOURCE_MISSING:  { check: 'fact-source', spec: '§2 зовнішній факт має джерело' },
  FACT_DATE_INVALID:    { check: 'fact-source', spec: '§2 зовнішній факт має дату перевірки' },
  FACT_KIND_INVALID:    { check: 'fact-source', spec: '§2 зовнішній факт має тип' },

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
  DIALOGUE_COND_CONTRADICTION: { check: 'dialogue-flags', spec: '§3 умова all не вимагає водночас flag і notFlag того самого прапорця' },
  DIALOGUE_QUEST_GATE:       { check: 'dialogue-quest-gate', spec: '§2 startQuest не обходить requires.quests квесту-цілі' },
  DIALOGUE_OBJECTIVE_KIND:   { check: 'dialogue-objective-kind', spec: '§2 розмова закриває лише ціль talk із цим самим NPC' },
  DIALOGUE_NPC_DUPLICATE:    { check: 'dialogue-npc-unique', spec: '§2 один діалог на NPC — інакше рушій не знає, який запускати' },

  // комбінації профіль × транспорт × тварина
  COMBO_NO_START:             { check: 'combos', spec: '§3 кожен вузол досяжний — у кожній комбінації стану гравця' },
  COMBO_TARGETED_UNREACHABLE: { check: 'combos', spec: '§3 вузол, адресований комбінації, у ній досяжний' },
  COMBO_DEAD_CONTENT:         { check: 'combos', spec: '§3 кожен вузол досяжний хоча б в одній комбінації' },
  COMBO_OPTION_UNUSABLE:      { check: 'combo-options', spec: '§1 кожен транспорт можна обрати хоча б в одній комбінації' },
  WHEN_UNSATISFIABLE:         { check: 'combo-options', spec: '§3 умова when (з умовами свого квесту, а для переходу — і квесту-цілі) відповідає хоча б одній дозволеній комбінації' },

  // перевірка, що впала сама, — теж червоне, а не зелене
  INTERNAL_ERROR:       { check: 'runner', spec: 'перевірка, що впала, не сміє виглядати як пройдена' },
};

export const FACT_KINDS = ['regulation', 'geography', 'price', 'schedule', 'culture'];
