// Знімок сюжету для UI (GAME-32): лише дані й ключі текстів. Команд у ньому немає — UI просить дію
// за її `id`, а що це за команда, знає тільки шар view (src/view/story-offer.ts).
import type { Key } from '../i18n';
import type { AgendaItem } from '../content/agenda';

/** Що можна зробити зараз. `key` — ключ тексту контенту (content/locales), `null` — без назви. */
// GAME-244 · рюкзак (модель — src/view/backpack-model.ts)
export type BackpackGroup = 'gear' | 'story' | 'finds';
/** `home` — узято вдома (TakeItem/PackItem), `other` — журнал про річ мовчить (обрізаний чи сейв до журналу). */
export type BackpackOrigin = 'bought' | 'found' | 'gift' | 'reward' | 'home' | 'other';

export interface BackpackRow {
  readonly id: string;
  readonly qty: number;
  readonly group: BackpackGroup;
  readonly origin: BackpackOrigin;
  /** Скільки дасть приймальня (центи) — коли річ взагалі продається (є sellCents); інакше null. Показується й далеко від приймальні. */
  readonly sellCents: number | null;
  /** Спорядження зі станом (GAME-73). */
  readonly gear?: { readonly condition: number; readonly wet: boolean };
  /** Id продажу — лише біля приймальні й коли ядро прийме SellItem. */
  readonly sellId: string | null;
  /** GAME-244 ч.2: id дарунка сусіду поруч — лише коли гравець стоїть біля мешканця, що приймає дари, і ядро прийме GiveGift. */
  readonly giftId: string | null;
}

/** GAME-276: пропозиція обміну сусіда поруч; `tradeId` — лише коли у гравця є потрібне й ядро саме прийме обмін (сухий прогін TradeItem). */
export interface BackpackTrade {
  readonly id: string;
  readonly give: readonly { readonly id: string; readonly qty: number }[];
  readonly get: readonly { readonly id: string; readonly qty: number }[];
  readonly tradeId: string | null;
}
export interface OfferBackpack {
  readonly trades: readonly BackpackTrade[];
  readonly groups: readonly { readonly group: BackpackGroup; readonly rows: readonly BackpackRow[] }[];
  readonly atReception: boolean;
  /** Мешканець поруч, що приймає дари (npc.*), або null. */
  readonly giftTo: string | null;
  readonly count: number;
}

export interface OfferAction {
  readonly id: string;
  /** `task` — справа живої хвилі з екрана подорожі (GAME-170 зріз 3: дім, зупинка в дорозі — локації без мапи). */
  readonly kind: 'visit' | 'talk' | 'pickup' | 'buy' | 'checkout' | 'sell' | 'dry' | 'complete' | 'decline' | 'choose' | 'continue' | 'load' | 'leave' | 'task' | 'cancel' | 'gift' | 'sleep' | 'wait' | 'rest' | 'chapter';
  readonly key: string | null;
  readonly priceCents?: number;
  /** Скільки хвилин займе дорога (GAME-31); немає — дія на місці. */
  readonly minutes?: number;
  /** Лише для недоступної купівлі (GAME-83): скільки центів бракує. Така дія не має команди — клік нічого не робить. */
  readonly shortCents?: number;
}

export interface OfferCharacter {
  readonly id: string;
  readonly profileKey: string;
  readonly transportKey: string;
  /** null — без тварини. */
  readonly animalKey: string | null;
}

export interface OfferObjective { readonly key: string; readonly done: boolean; readonly required: boolean }

/**
 * Екран пакування (GAME-109, GAME-245): місце в одиницях, три групи (лише читання — стан кожної речі: вдома / у сумці / в авто), прогрес «Взято N/M · ще: …»,
 * одна дія «Завантажити речі» і, коли не влізло, вибір «що лишимо вдома» (кандидати: «можна лишити» першими).
 */
export interface OfferPacking {
  readonly used: number;
  readonly capacity: number;
  readonly groups: readonly {
    readonly group: 'needed' | 'useful' | 'leave';
    readonly items: readonly { readonly key: string; readonly units: number; readonly state: 'home' | 'bag' | 'car' }[];
  }[];
  /** Взято з дому (у сумці чи в авто) з усіх речей групи «потрібне» і «корисне»; `leftKeys` — що ще лежить удома (потрібне першим). */
  readonly taken: number;
  readonly total: number;
  readonly leftKeys: readonly string[];
  readonly load: OfferAction | null;
  readonly overflow: readonly { readonly key: string; readonly units: number; readonly action: OfferAction }[];
  /** Ключ підпису (content/locales), коли бракує речі, яку радить гра; null — нічого казати. */
  readonly noteKey: string | null;
}

/**
 * Підсумок дня (GAME-106): лише факти з ядра (src/core/day-summary.ts). `keys` — ключі текстів: для `night` — ключ UI
 * (`sum.night.<вид>`), для решти — ключ контенту (назва предмета, події, квесту). Порожніх секцій немає.
 */
export interface OfferSummary {
  readonly day: number;
  readonly sections: readonly { readonly kind: 'night' | 'packed' | 'events' | 'quests' | 'bought' | 'got' | 'sold'; readonly keys: readonly string[] }[];
  /** Гроші на початку й у кінці дня (центи); null — факту немає (сейв до GAME-106). */
  readonly money: { readonly start: number; readonly end: number } | null;
  /** GAME-181: що день дав — «+45 XP · +15 ОМ» (лише видане за записи цього дня). */
  readonly reward: { readonly xp: number; readonly om: number };
  /** GAME-181: «Наступного разу: …» — ключ назви активного головного квесту; null — розділ завершено. */
  readonly nextKey: string | null;
  /** GAME-200: «Завтра…» — ключ інтерфейсу короткого тизера наступного дня (`sum.tomorrow.<день>`); null — розділ завершено чи тизера для дня немає. */
  readonly tomorrowKey: string | null;
}

/** GAME-200: найближча нагорода («ще N…»): ключ підпису — контенту (`ui: false`) або інтерфейсу. */
export interface OfferNearest { readonly kind: 'request' | 'henry' | 'atlas'; readonly left: number; readonly labelKey: string; readonly ui: boolean }
/** GAME-200: відкрита ціль журналу — головна, побічна (квест/прохання) або «нагорода близько». Не більше 4. */
export interface OfferGoal { readonly kind: 'main' | 'side' | 'reward'; readonly key: string; readonly ui: boolean; readonly left?: number }

/** GAME-181: звання за XP — `key` (`title.N`) і `nextKey` у content/locales; `into/span` — просування до наступного (span 0 — найвище). */
export interface OfferTitle { readonly index: number; readonly key: string; readonly nextKey: string | null; readonly into: number; readonly span: number }
/** GAME-181: навичка для ☰ — назва, ранг, смужка до наступного рангу, що відкриє наступний (усі ключі — content/locales). */
export interface OfferSkill {
  readonly id: string;
  readonly key: string;
  readonly rank: number;
  readonly rankKey: string | null;
  readonly pct: number;
  /** Практика далі не веде — наступний ранг дає наставник. */
  readonly mentor: boolean;
  readonly maxed: boolean;
  readonly unlockKey: string | null;
}
/** GAME-182: сторінка Атласу «Перша спроба» — наклейки за слотами (у порядку контенту; не отримана — силует) і лічильник; печатка господаря — місце є, самої печатки в першому розділі ще немає. */
export interface OfferAtlasPage { readonly id: string; readonly titleKey: string; readonly have: number; readonly total: number; readonly pct: number; readonly done: boolean; readonly reward: { readonly xp: number; readonly om: number } | null }
export interface OfferAtlas {
  /** GAME-200: заповнення сторінок (відсоток і нагорода за повну) і загальне — за всіма сторінками разом. */
  readonly pages: readonly OfferAtlasPage[];
  readonly fillPct: number;
  readonly slots: readonly { readonly id: string; readonly nameKey: string; readonly textKey: string; readonly kind: string; readonly icon: string; readonly owned: boolean }[];
  /** Скільки слотів на сторінці (12). */
  readonly total: number;
  readonly count: number;
  /** GAME-215: сторінка «Шлях Генрі» — сліди дідуся за регіонами; `postcard` — усі знайдено (наклейка-листівка видана ядром). */
  /** GAME-213: фото камерою телефона (розділ «Фото» в Атласі). */
  readonly photos: { readonly photos: readonly { readonly id: string; readonly nameKey: string; readonly taken: boolean }[]; readonly taken: number; readonly total: number };
  /** GAME-287: сторінка розділу 2 «засушена орхідея + підпис дідуся» — є лише після кадру (`found`); `shot` — сухий чи дощовий. */
  readonly orchid?: { readonly found: boolean; readonly shot: 'orchid' | 'drops' | null };
  /** GAME-292: сторінка Люксембургу — є лише з печаткою (родина справді приїхала в Мюллерталь, luxembourgStamp). `medallion`: цілий чи дві половинки; `finale` — розділ 2 завершено (квест CH2-D3-HOME-001): тоді видно нотатку дідуся-тизер. */
  readonly luxembourg?: { readonly medallion: 'whole' | 'halves' | null; readonly microcard: boolean; readonly finale: boolean };
  readonly henry: { readonly traces: readonly { readonly id: string; readonly kind: string; readonly location: string; readonly nameKey: string; readonly textKey: string; readonly year: number | null; readonly found: boolean }[]; readonly found: number; readonly total: number; readonly postcard: boolean };
}
export interface OfferProgress { readonly xp: number; readonly om: number; readonly title: OfferTitle; readonly skills: readonly OfferSkill[] }

/** Жива хвиля напруги (GAME-170, зріз 2) для картки мети: заголовок, «зроблено/усього», хвилини ІГРОВОГО часу, що лишились. */
export interface OfferWave {
  readonly titleKey: string;
  readonly done: number;
  readonly total: number;
  readonly tasks: readonly { readonly id: string; readonly textKey: string; readonly remainingMin: number; readonly outcome: 'open' | 'done' | 'late' }[];
}

/**
 * GAME-175: підказки над мапою. `next` — рядок «Далі: …» (ключ UI; null — підказки немає), `nextSpot` — об'єкт мапи, на який він вказує
 * (сцена підсвічує його), `near` — що зробить дія біля найближчого об'єкта (ключ UI; для речі чи NPC ще й ключ назви з контенту).
 */
export interface OfferHint {
  /** Скільки речей у рюкзаку героя (дрібне, ще не розвантажене в авто). */
  readonly backpack: number;
  readonly next: Key | null;
  readonly nextSpot: string | null;
  readonly near: { readonly label: Key; readonly itemKey: string | null } | null;
  /** GAME-178: чому авто не рушає (рюкзак повний чи бракує речей); null — не показувати. */
  readonly blocked: { readonly carry: boolean; readonly itemKeys: readonly string[] } | null;
  /** GAME-245: велика картка речі, щойно взятої вдома (~1,5 с, покадрово): назва й репліка — ключі контенту, spot — для піктограми. null — картки нема. */
  readonly card: { readonly nameKey: string; readonly reactKey: string; readonly spot: string; readonly xp: number } | null;
}

/** Картка прохання (GAME-180): що зробити одним рядком, цілі-картинки (іконка + підпис) і нагорода (дані для GAME-181). */
export interface OfferRequestCard {
  readonly id: string;
  readonly titleKey: string;
  readonly goalKey: string;
  readonly goals: readonly { readonly icon: string; readonly labelKey: string }[];
  readonly reward: { readonly xp: number; readonly om: number; readonly skills: readonly string[] };
}

/** Рядок трекера прохання в HUD (GAME-180): «Сміття 2/3»; `ready` — усе зроблено, лишилось повернутись до просильника. */
export interface OfferTracker { readonly id: string; readonly trackKey: string; readonly done: number; readonly total: number; readonly ready: boolean }

/** GAME-304: річ на полиці контейнера. `key` — назва з контенту, `spot` — для піктограми, `action` — id відповіді «Взяти» (null — вже взято чи зараз не можна). */
export interface OfferBoxSlot { readonly id: string; readonly key: string; readonly spot: string; readonly group: 'needed' | 'useful' | 'leave'; readonly state: 'here' | 'taken'; readonly action: string | null }
/** GAME-304: відкритий контейнер дому («всередині»: холодильник, комора, шафа, тумба, скринька Мії). `nameKey` — ключ UI; `left` — скільки речей ще лежить. */
export interface OfferBox { readonly id: string; readonly nameKey: Key; readonly slots: readonly OfferBoxSlot[]; readonly left: number; /** id відповіді «Закрити» (команди не має — гра лише закриває вікно). */ readonly close: string }

/** GAME-243: пункт нотатника для екрана: назва — ключ UI чи ключ контенту речі. */
export interface OfferAgendaItem extends Omit<AgendaItem, 'label'> { readonly label: { readonly ui: Key } | { readonly content: string } }
export interface OfferAgenda { readonly phase: string; readonly items: readonly OfferAgendaItem[]; readonly total: number; readonly doneCount: number }

export interface StoryOffer {
  /** GAME-243: нотатник Вікторії (мапа-перша гра); null — його немає (панельний режим, персонажа ще немає). */
  readonly agenda: OfferAgenda | null;
  /** GAME-185: мапа-перша гра — ☰ це лише меню (Атлас, Журнал, налаштування, закрити), без дій сюжету; квести, навички й речі живуть на екрані «Журнал». */
  readonly mapFirst: boolean;
  /** create — персонажа ще немає; play — гра йде; ended — кінець розділу. */
  readonly stage: 'create' | 'play' | 'ended';
  /** GAME-292: якого розділу кінець (лише 2 — завершено квест CH2-D3-HOME-001); немає — кінець розділу 1. Від нього тексти кінця й картка-«серія». */
  readonly chapterEnd?: 2;
  readonly characters: readonly OfferCharacter[];
  readonly locationKey: string | null;
  readonly moneyCents: number;
  readonly quests: readonly { readonly key: string; readonly objectives: readonly OfferObjective[];
    /** GAME-179: хто дав завдання (id NPC для портрета й ключ імені); null — оповідач. */
    readonly giver: { readonly id: string; readonly key: string | null } | null }[];
  /** Відкрита розмова: репліка й відповіді (лише ті, що ядро прийме). */
  readonly dialogue: { readonly speakerKey: string | null;
    /** GAME-179: хто говорить: id NPC; 'player' — репліка героя; null — оповідач (подія в дорозі, сцена). Від нього портрет у рамці розмови. */
    readonly speakerId: string | null; readonly key: string | null; readonly answers: readonly OfferAction[];
    /** GAME-183: `key` — ключ UI (src/i18n), а не контенту: рамка вибору дії на мапі («Куди їдемо?»), а не репліка; остання відповідь — «Не зараз». */
    readonly ui?: boolean;
    /** GAME-180: вузол пропозиції прохання — картка (портрет просильника є в рамці; тут що зробити, цілі-картинки й нагорода). */
    readonly request?: OfferRequestCard;
    /** GAME-230: що герой може подарувати співрозмовнику (кнопка «Подарувати» розгортає цей список); немає — нічого дарувати чи сьогодні вже дарував. */
    readonly gifts?: readonly OfferAction[] } | null;
  readonly actions: readonly OfferAction[];
  /** Пакування перед дорогою; null — зараз закрите. */
  readonly packing: OfferPacking | null;
  /** Речі в руках; для спорядження (GAME-73) — ще стан 0…100 і чи мокре. */
  /** GAME-244: екран рюкзака — що є, звідки, ціна; «Продати» лише біля приймальні. */
  readonly backpack: OfferBackpack;
  /** GAME-304: відкритий контейнер дому (вікно «всередині»); null — жоден не відкрито. */
  readonly box: OfferBox | null;
  readonly inventory: readonly { readonly key: string; readonly qty: number; readonly gear?: { readonly condition: number; readonly wet: boolean } }[];
  /** Ритм дня (GAME-242): похідне від ядра. `bedtime` — номер ночі, поки триває вікно «пора спати» [22:00, 00:30), інакше null;
   *  `shopClosed` — стоїмо в крамниці, а вона зачинена (08:00–20:00); `autoSlept` — щойно прокинулись після того, як герой заснув сам. */
  readonly rest: { readonly bedtime: number | null; readonly shopClosed: boolean; readonly autoSlept: boolean; /** GAME-264: id останнього сну в журналі — кожна команда сну дає новий (лічильник slept після SLEEP_CAP не росте, а тизер мусить спрацьовувати на сам сон). */ readonly sleepMark: string };
  /** Продаються тут, але бракує грошей (GAME-83): показуються вимкненими з причиною, а не зникають. */
  readonly locked: readonly OfferAction[];
  /** День гри з 1 і хвилина доби 0…1439 — для HUD (GAME-83). */
  readonly day: number;
  readonly timeMinutes: number;
  /** Погода сьогодні (GAME-46, SIM-WX-005). */
  readonly weather: 'sunny' | 'cloudy' | 'rain';
  /** Прогноз на сьогодні (GAME-131, R1-12): лише підказка, може не справдитись; ефекти беруть тільки `weather`. */
  readonly forecast: 'sunny' | 'cloudy' | 'rain';
  /** Ідентичність останньої завершеної подорожі (GAME-94): commandId останнього запису журналу «Visit»; null — ще не їздили.
   *  Похідна від стану ядра, тож однакова після перезавантаження; журнал обрізається з голови, а id лишається унікальним. */
  readonly lastTrip: string | null;
  /** Скільки днів історії вже завершено (GAME-106): зростання після дії гравця — сигнал показати підсумок. */
  readonly daysEnded: number;
  /** Підсумок останнього завершеного дня; null — жоден день ще не завершився. */
  readonly summary: OfferSummary | null;
  /** Журнал подорожі, від старого до нового. */
  readonly journal: readonly { readonly type: string; readonly key: string | null; readonly at: number }[];
  /** Жива хвиля напруги або null (GAME-170). */
  readonly wave: OfferWave | null;
  /** Стан Мії (GAME-111): два текстові стани, без чисел; null — кішки в грі немає. */
  readonly mia: 'settled' | 'pause' | null;
  /** Підказки на мапі (GAME-175). */
  readonly hint: OfferHint;
  /** Прийняті прохання сусідів у роботі (GAME-180); порожньо — жодного. */
  readonly requests: readonly OfferTracker[];
  /** GAME-181: поточна ціль — назва активного головного квесту (ключ контенту); null — персонажа ще немає чи розділ завершено. */
  readonly goal: { readonly key: string } | null;
  /** GAME-181: XP, ОМ, звання й навички. */
  readonly progress: OfferProgress;
  /** GAME-182: Атлас. */
  readonly atlas: OfferAtlas;
  /** GAME-200: найближча нагорода й відкриті цілі журналу. */
  readonly nearest: OfferNearest | null;
  readonly goals: readonly OfferGoal[];
}
