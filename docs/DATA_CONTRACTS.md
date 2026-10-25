# DATA_CONTRACTS · формати даних гри

Що лежить у `content/` (визначення) і в сейві (стан проходження). Перший — пишуть люди й
перевіряє валідатор. Другий — пише лише ядро.

🔴 **Виконувана схема — `scripts/validator/schema.mjs` (`SCHEMAS`).** Цей файл її описує.
Розійшлися — правий код, а файл виправляється. `node scripts/check-rules.mjs` червоніє, якщо
контракт `DC-…` посилається на колекцію, якої немає в `SCHEMAS`, і навпаки.

Формат рядка: `id` · колекція · що · джерело · статус.

## 1. Визначення (`content/`, строгі схеми, невідоме поле — помилка)

| id | колекція | що | джерело | статус |
|---|---|---|---|---|
| DC-001 | `meta` | старт кампанії (`start`) і мови (`locales`) | 05-pershyi-kod.md | ACCEPTED |
| DC-002 | `profiles` | життєвий профіль: `id`, `nameKey`, `transports` (доступні транспорти); `startSkills`, `job`, `childInSchool` — DC-022 | GDD профілі; GAME-51 | ACCEPTED |
| DC-003 | `transports` | транспорт: `id`, `nameKey` | GDD; OD-012 | ACCEPTED |
| DC-004 | `animals` | тварина: `id`, `nameKey`, `transports` — чим можна везти; `animal.none` зарезервовано | GDD; CR-017 | ACCEPTED |
| DC-005 | `items` | предмет: `id`, `nameKey` | GDD SIMULATION §інвентар | ACCEPTED |
| DC-006 | `npcs` | NPC: `locationId`, `unlockedBy`, `sells`, `when` | GDD; CR-016 | ACCEPTED |
| DC-007 | `locations` | локація: `unlockedBy`, `items`, `when` | GDD | ACCEPTED |
| DC-008 | `quests` | етап: `optional`, `end`, `requires`, `objectives[]`, `transitions[]` (`complete`/`decline`), `reward` (`money` — **центи**, CR-040; `items[].item`), `when`. Ядро виконує: `src/core/story.ts` (GAME-29); `deliver` ще не підтримано — збірка сюжету падає, а не мовчить | GDD §12.2; GAME-29 | ACCEPTED |
| DC-009 | `events` | подія: `repeatable`, `reward`, `locationId` | GDD §12.3 | ACCEPTED |
| DC-012 | `roads` | дорога між локаціями: `from`, `to`, `twoWay`, `ways[]` — `transport`, `minutes` (≥ 1), `cents` (≥ 0). Граф кожного транспорту сильно зв'язний (валідатор `roads`) | GAME-31 | ACCEPTED |
| DC-010 | `facts` | зовнішній факт: `source`, `checkedAt` (РРРР-ММ-ДД), `kind` | GDD §12.4; CR-019 | ACCEPTED |
| DC-013 | `calendar` | календар гри (`content/calendar.json`, один об'єкт): `start`, `payday`, `longTripDays`, `maxLeaveDays`, `bookAheadDays`, `publicHolidays[]`, `schoolHolidays[]` — докладно DC-026. Ядро виконує: `src/core/life.ts` (GAME-71) | GAME-71 | ACCEPTED |
| DC-014 | `packing` | пакування перед першою дорогою (`content/packing.json`, один об'єкт): `openAfter` (квест), `at` (локації), `capacity` (місце в одиницях на транспорт), `items` (12 речей: `item`, `group` — `needed`/`useful`/`leave`, `units`, `when`), `notes` (підпис, коли речі бракує). Стан гри — прапорці `f.pack-<річ>` у `flags` сейву (формат сейву v3 не змінюється); їх ставить лише ядро (PackItem/UnpackItem/AutoPack), діалоги читають | GAME-109; рішення власника 24.10 | ACCEPTED |
| DC-011 | `dialogues` | діалог (`content/dialogue/<назва>.json`, один на файл): `npcId`, `start`, `nodes[]` — вузол із `speaker`, `textKey` і рівно одним виходом `end` / `next` / `choices`; вибір — `when` (умова) і `effects` (`setFlag`, `startQuest`, `completeObjective`). Кожен вузол досяжний і має безумовний шлях до `end` | GAME-28 | ACCEPTED |
| DC-016 | `waves` | хвиля напруги (GAME-170, `content/waves.json`, рішення власника 24–25.10): `id`, `titleKey`, `hookKey`, `stage` (квест, унікальна для етапу), `when`, `tasks[]` (2–4: `id`, `textKey`, `limitMin` — ігрові хвилини 1–60, `leaderOnly`, `animal`, `targets[{id, safe}]`, `when`, `done`/`late` — `{ textKey, effects[setFlag] }`), `allDone`, `fallback`. Стан гри — `game.wave` (жива хвиля зі строками в ігрових хвилинах і наслідки минулих), поле необов'язкове: сейв v3 без нього читається. Ядро: `src/core/wave.ts`; пауза зупиняє годинник — і строки; кінець розділу від хвиль не залежить | GAME-170; сценарій v3 §6 | ACCEPTED |
| DC-015 | `flags` | реєстр прапорців і фактів стану (GAME-115): `content/flags.json` — масив `{ id, type: bool\|enum\|number\|item\|location, initial, owner, note?, values?, valuesFrom?, generatedFrom?, reserved?, aka? }`; `f.*` — прапорець (enum кодується як `f.<назва>-<значення>`), `f.<префікс>-*` — сімейство ядра, `m.*` — пам'ять NPC, `s.*` — факт стану. Умова чи ефект, а згодом запис журналу й підпис Matthew (GAME-140, кожен зі стабільним `id`), посилаються лише на зареєстроване. Деталі й коди — `docs/CONTENT-VALIDATOR.md`, розділ «Реєстр прапорців» | GAME-115; GAME-140 | ACCEPTED |

Спільні частини:

* **`when`** — умова на стан гравця: `{ profiles?, transports?, animals? }`. Усі названі виміри
  мусять збігтися, порожній список заборонено (TD-006).
* **`reward`** — `{ grantId, items[], money, once }`. `grantId` унікальний на весь контент
  (TD-004). `money` — цілі центи (CR-040).
* **id** — стабільний префіксний рядок (`profile.…`, `npc.…`, `ST-001`), ніколи не назва й не
  індекс.

## 2. Заплановані розширення (кожне — з карткою, до реалізації `PROPOSED`)

| id | колекція / поле | що | картка | статус |
|---|---|---|---|---|
| DC-020 | `events.family`, `events.tags`, `events.weight`, `events.choices[]` | сім'я подій, теги `positive`/`neutral`/`negative`/`plan_change`/`eco`, вага, ≥ 2 виходи без втрати прогресу для `negative` | GAME-45 | PROPOSED |
| DC-021 | `events.trigger`, `events.cooldownDays`, `events.maxPerTrip` | передумова й обмеження повторів | GAME-45 | PROPOSED |
| DC-022 | `profiles.job`, `profiles.childInSchool`, `profiles.schedule`, `profiles.startSkills`, `profiles.startItems` | профіль як джерело петлі OD-012. `startSkills` — реалізовано (GAME-72): `[{ "skill": "skill.camping", "rank": 2 }]`, ранг 0–5, id — один із восьми (`SKILL_UNKNOWN`, `SKILL_DUPLICATE`). `job` і `childInSchool` — реалізовано (GAME-71): `"job": { "salaryCents": 280000, "billsCents": 200000, "vacationDays": 25 }` — зарплата й рахунки за місяць (центи), днів відпустки на рік (0…60); рахунки ≤ зарплати (`JOB_BILLS_EXCEED_SALARY`); `childInSchool: true` — у родині школяр (SIM-LIFE-010). Робота чи школяр без `calendar.json` — `CALENDAR_MISSING`. Усі числа — **тимч.**, смак власника. `schedule` (зміни, нестандартний тиждень) і `startItems` — ще ні | GAME-51, GAME-71, GAME-72 | PROPOSED |
| DC-023 | `items.kind`, `items.tier`, `items.weightG`, `items.volumeL`, `items.waterproofMm`, `items.comfortC`, `items.sleeps`, `items.priceCents`, `items.resaleCents` | спорядження з тиром. Реалізовано v1 (GAME-73): `kind` — `tent`/`sleeping-bag`; предмет із `kind` чи будь-яким полем картки мусить мати всі (`GEAR_FIELD_MISSING`), викуп ≤ ціни (`GEAR_RESALE_ABOVE_PRICE`), немає речі того ж виду, не гіршої ні в чому (`GEAR_DOMINATED`). Стан — не в картці, а в сейві (DC-044). Ціни дров і ліхтаря ще в `src/content/slice-defs.ts`. Усі числа каталогу (ціни, викуп, вага, об'єм, водостійкість, комфорт) — **тимч.**, смак власника | GAME-73 | PROPOSED |
| DC-024 | `vehicles` (нова) | транспорт гравця з техпаспортом: двигун, шини/гальма, електрика, вода, опалення, кузов, житловий модуль; приховані дефекти | GAME-74 | PROPOSED |
| DC-025 | `skills` (нова) | 8 напрямів, ранги 0–5, крива досвіду. Реалізовано GAME-72 без окремого файлу: вісім id фіксовано в коді (`src/core/skills.ts` і валідатор `codes.mjs`, звірка в `semantics.test.ts`), крива — SIM-SKL-005…007 | GAME-72 | PROPOSED |
| DC-026 | `calendar` (нова) | шкільні канікули, свята, сезони. Реалізовано v1 (GAME-71): `content/calendar.json` — один об'єкт: `start` (`YYYY-MM-DD`, день 0 гри), `payday` (1…28), `longTripDays`, `maxLeaveDays`, `bookAheadDays`, `publicHolidays` (`["MM-DD"]`), `schoolHolidays` (`[{ "from": "MM-DD", "to": "MM-DD" }]`, from > to — через Новий рік). Перевірка `calendar`: `CALENDAR_BAD_DATE` (не справжня дата, 02-29), `CALENDAR_RANGE_OVERLAP` (канікули перетинаються, свято двічі). Один календар на гру — регіону/країни ще немає; сезони — ще ні | GAME-71 | PROPOSED |
| DC-027 | `atlasPages` (нова) | шаблони сторінок Атласу за подорожжю й транспортом | GAME-78 | PROPOSED |
| DC-028 | `dialogues` (нова) | JSON-граф: вузли `id`, `speaker`, `text`, `choices[].next`, умови | TD-005; GAME-42; GAME-70 | PROPOSED |

## 3. Стан проходження (сейв; пише лише ядро)

| id | частина стану | що | джерело | статус |
|---|---|---|---|---|
| DC-040 | `save.meta` | `format`, `schemaVersion`, `checksum`, `accountId: null`, `contentRev` (відбиток сюжету — лише діагностика). Реалізовано v3: `src/core/save.ts` (`SAVE_VERSION` 3). Вічні фікстури `tests/saves/v1.json`, `v2.json` (рівно та, що на main і в грі на GitHub Pages — без `life`), `v3.json`; кожна завантажується й проходить round-trip. `saveId`/`createdAt` — ще ні | GDD Core Rules §4; OD-008; рецензія TL 23.10 | ACCEPTED |
| DC-041 | `save.clock` | ігровий календар і час, зерно RNG | CR-034 | ACCEPTED |
| DC-042 | `save.player` | реалізовано v2 (GAME-29): `profileId`, `transportId`, `animalId`, `locationId` — **не пікселі**: позиція в пікселях живе в сцені (ARCHITECTURE §3.1); реплей відтворює команди, а не рух. Зовнішність (шари) і `spawnId` — ще ні (GAME-76) | GAME-76; GAME-29 | ACCEPTED |
| DC-043 | `save.household` | члени, тварина (без операції видалення) | CR-017 | ACCEPTED |
| DC-044 | `save.inventory` | предмети зі станом, екіпіроване й склад. Стан — реалізовано v2 (GAME-73): `gear` — `{ [itemId]: { condition, wet } }`, ціле 0…100 і boolean, лише для предмета в інвентарі й лише відхилення від нового сухого (інше — `SAVE_SHAPE`); v1 після міграції — `{}`. Екіпіроване й склад — ще ні | GAME-73 | ACCEPTED |
| DC-045 | `save.money` | баланс у центах + журнал транзакцій (кожен запис — `commandId`) | CR-040…043 | ACCEPTED |
| DC-054 | `save.life` | реалізовано v3 (GAME-71): `{ paydays, leave }` — скільки днів виплати вже враховано (ціле ≥ 0) і заброньовані відпустки `[{ from, days, vacation }]` (цілі дні гри; відсортовано за `from`, без перетинів, `vacation` ≤ `days` — інше `SAVE_SHAPE`); v2 опубліковано без цього поля, тому воно з'явилось лише разом із v3: міграція v2 → v3 — `{ paydays: дні виплати, що вже настали за годинником сейву (без грошей), leave: [] }`, якщо гра передала календар (`fromSave(…, { life })`; гра передає завжди), інакше `paydays: 0`; v1 іде через v2. Зарплата в журнал транзакцій не пишеться (журналу транзакцій ще немає) | GAME-71 | ACCEPTED |
| DC-046 | `save.vehicles` | транспорт гравця й стан вузлів | GAME-74 | ACCEPTED |
| DC-047 | `save.trip` | маршрут, бронювання, бюджет поїздки | GAME-30, GAME-43 | ACCEPTED |
| DC-048 | `save.needs`, `save.skills` | `skills` — реалізовано v2 (GAME-72): рівно вісім id → досвід, ціле ≥ 0; `practice` — ключ дії → лічильник 1…12 (інше — `SAVE_SHAPE`); v1 після міграції — нулі й `{}`. `needs` — ще ні | GAME-72 | ACCEPTED |
| DC-049 | `save.npcMemory` | реалізовано v2 (GAME-48): `{ [npcId]: факти[] }`, факт — `m.назва`, відсортовано, без повторів (інше — `SAVE_SHAPE`); v1 після міграції — `{}`. Змінює лише ефект `remember` відповіді в розмові з цим NPC; читають умови `remembers`/`notRemembers` (`SIMULATION_RULES` SIM-NPC) | GAME-48 | ACCEPTED |
| DC-050 | `save.quests` | реалізовано v2: `status` (`active`/`completed`/`declined`) і `done[]` (виконані цілі `visit`/`talk`; `collect` рахується з інвентаря). «Обрані гілки» видно з того, який квест-ціль став активним; окремого поля немає. Ревізія контенту — `contentRev` сейву (DC-040); сейв, що посилається на зниклий квест, профіль, транспорт, тварину чи локацію, не вантажиться (`SAVE_CONTENT_MISMATCH`) і йде в карантин, а не губиться | GDD §12.2; рецензія TL 23.10 | ACCEPTED |
| DC-051 | `save.flags`, `save.history` | `flags[]` — реалізовано v2 (ставлять лише ефекти діалогів); `dialogue` — відкрита розмова `{id, node}`. `history` — ще ні (події з відкатом, GAME-45, → v3) | GDD Core Rules §4 | ACCEPTED |
| DC-052 | `save.grants` | множина виданих `grantId` — сторож «рівно раз» | TD-004 | ACCEPTED |
| DC-053 | `save.atlas` | сторінки Атласу | GAME-78 | ACCEPTED |

## 4. Команди (ядро, TD-004)

Кожна команда: `{ type, commandId, payload }` → `{ ok: true, events[] } | { ok: false, code, reason }`.
Повтор `commandId` повертає попередній результат і стану не змінює. Перелік типів команд
веде код ядра (`src/core/commands/`), а цей файл фіксує лише конверт.

| id | правило | джерело | статус |
|---|---|---|---|
| DC-060 | Відмова завжди має машинний `code`; людський текст — ключ локалізації `reject.<code>`, який UI бере з коду (ядро текстів не знає). Реалізовано: `src/core/commands.ts` (GAME-12) | CR-032 | ACCEPTED |
| DC-061 | Успішна команда повертає події-факти `events[]` (`ItemPurchased`, `ItemSold`, `RewardGranted`) з `commandId`-причиною; відмова й повтор — `[]`. Реалізовано: `src/core/commands.ts` (TL PR #13). Ігровий час у події — з появою журналу (GAME-32) | GDD Core Rules §5 | ACCEPTED |
| DC-062 | Той самий `commandId` з іншим вмістом — відмова `COMMAND_ID_REUSED`, а не кешований результат (відбиток вмісту в `processed`) | рецензія PR #13 | ACCEPTED |
| DC-063 | Команда — **намір** (`BuyItem{itemId}`, `SellItem{itemId}`, `Interact{targetId}`), не ефект: ціни й нагороди ядро бере лише з каталогу `CoreDefs` (CR-041); команди «видати нагороду» назовні немає. `commandId` видає місток із `seq` стану, тож після завантаження сейву id не повторюється. Реалізовано: `src/core/{commands,defs,state}.ts`, `src/view/world/bridge.ts` | рецензія TL PR #13 | ACCEPTED |
