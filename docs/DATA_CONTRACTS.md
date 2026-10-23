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
| DC-002 | `profiles` | життєвий профіль: `id`, `nameKey`, `transports` (доступні транспорти) | GDD профілі; GAME-51 | ACCEPTED |
| DC-003 | `transports` | транспорт: `id`, `nameKey` | GDD; OD-012 | ACCEPTED |
| DC-004 | `animals` | тварина: `id`, `nameKey`, `transports` — чим можна везти; `animal.none` зарезервовано | GDD; CR-017 | ACCEPTED |
| DC-005 | `items` | предмет: `id`, `nameKey` | GDD SIMULATION §інвентар | ACCEPTED |
| DC-006 | `npcs` | NPC: `locationId`, `unlockedBy`, `sells`, `when` | GDD; CR-016 | ACCEPTED |
| DC-007 | `locations` | локація: `unlockedBy`, `items`, `when` | GDD | ACCEPTED |
| DC-008 | `quests` | етап: `optional`, `end`, `requires`, `objectives[]`, `transitions[]` (`complete`/`decline`), `reward` (`money` — **центи**, CR-040; `items[].item`), `when`. Ядро виконує: `src/core/story.ts` (GAME-29); `deliver` ще не підтримано — збірка сюжету падає, а не мовчить | GDD §12.2; GAME-29 | ACCEPTED |
| DC-009 | `events` | подія: `repeatable`, `reward`, `locationId` | GDD §12.3 | ACCEPTED |
| DC-012 | `roads` | дорога між локаціями: `from`, `to`, `twoWay`, `ways[]` — `transport`, `minutes` (≥ 1), `cents` (≥ 0). Граф кожного транспорту сильно зв'язний (валідатор `roads`) | GAME-31 | ACCEPTED |
| DC-010 | `facts` | зовнішній факт: `source`, `checkedAt` (РРРР-ММ-ДД), `kind` | GDD §12.4; CR-019 | ACCEPTED |
| DC-011 | `dialogues` | діалог (`content/dialogue/<назва>.json`, один на файл): `npcId`, `start`, `nodes[]` — вузол із `speaker`, `textKey` і рівно одним виходом `end` / `next` / `choices`; вибір — `when` (умова) і `effects` (`setFlag`, `startQuest`, `completeObjective`). Кожен вузол досяжний і має безумовний шлях до `end` | GAME-28 | ACCEPTED |

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
| DC-022 | `profiles.job`, `profiles.incomeCents`, `profiles.vacationDays`, `profiles.schedule`, `profiles.startSkills`, `profiles.startItems` | профіль як джерело петлі OD-012 | GAME-51, GAME-71 | PROPOSED |
| DC-023 | `items.tier`, `items.weightG`, `items.volumeL`, `items.priceCents`, `items.resaleCents`, `items.condition` | спорядження з тиром, знос, продаж | GAME-73 | PROPOSED |
| DC-024 | `vehicles` (нова) | транспорт гравця з техпаспортом: двигун, шини/гальма, електрика, вода, опалення, кузов, житловий модуль; приховані дефекти | GAME-74 | PROPOSED |
| DC-025 | `skills` (нова) | 8 напрямів, ранги 0–5, крива досвіду | GAME-72 | PROPOSED |
| DC-026 | `calendar` (нова) | шкільні канікули, свята, сезони | GAME-71 | PROPOSED |
| DC-027 | `atlasPages` (нова) | шаблони сторінок Атласу за подорожжю й транспортом | GAME-78 | PROPOSED |
| DC-028 | `dialogues` (нова) | JSON-граф: вузли `id`, `speaker`, `text`, `choices[].next`, умови | TD-005; GAME-42; GAME-70 | PROPOSED |

## 3. Стан проходження (сейв; пише лише ядро)

| id | частина стану | що | джерело | статус |
|---|---|---|---|---|
| DC-040 | `save.meta` | `format`, `schemaVersion`, `checksum`, `accountId: null`, `contentRev` (відбиток сюжету — лише діагностика). Реалізовано v2: `src/core/save.ts`. `saveId`/`createdAt` — ще ні | GDD Core Rules §4; OD-008; рецензія TL 23.10 | ACCEPTED |
| DC-041 | `save.clock` | ігровий календар і час, зерно RNG | CR-034 | ACCEPTED |
| DC-042 | `save.player` | реалізовано v2 (GAME-29): `profileId`, `transportId`, `animalId`, `locationId` — **не пікселі**: позиція в пікселях живе в сцені (ARCHITECTURE §3.1); реплей відтворює команди, а не рух. Зовнішність (шари) і `spawnId` — ще ні (GAME-76) | GAME-76; GAME-29 | ACCEPTED |
| DC-043 | `save.household` | члени, тварина (без операції видалення) | CR-017 | ACCEPTED |
| DC-044 | `save.inventory` | предмети зі станом, екіпіроване й склад | GAME-73 | ACCEPTED |
| DC-045 | `save.money` | баланс у центах + журнал транзакцій (кожен запис — `commandId`) | CR-040…043 | ACCEPTED |
| DC-046 | `save.vehicles` | транспорт гравця й стан вузлів | GAME-74 | ACCEPTED |
| DC-047 | `save.trip` | маршрут, бронювання, бюджет поїздки | GAME-30, GAME-43 | ACCEPTED |
| DC-048 | `save.needs`, `save.skills` | потреби, навички, досвід | GAME-72 | ACCEPTED |
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
