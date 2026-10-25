// Знімок сюжету для UI (GAME-32): лише дані й ключі текстів. Команд у ньому немає — UI просить дію
// за її `id`, а що це за команда, знає тільки шар view (src/view/story-offer.ts).

/** Що можна зробити зараз. `key` — ключ тексту контенту (content/locales), `null` — без назви. */
export interface OfferAction {
  readonly id: string;
  readonly kind: 'visit' | 'talk' | 'pickup' | 'buy' | 'sell' | 'dry' | 'complete' | 'decline' | 'choose' | 'continue' | 'pack' | 'unpack' | 'autopack';
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

/** Екран пакування (GAME-109): місце в одиницях, три групи, підпис за фактами стану. `action` null — річ не вміщається. */
export interface OfferPacking {
  readonly used: number;
  readonly capacity: number;
  readonly groups: readonly {
    readonly group: 'needed' | 'useful' | 'leave';
    readonly items: readonly { readonly key: string; readonly units: number; readonly packed: boolean; readonly action: OfferAction | null }[];
  }[];
  readonly auto: OfferAction;
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
}

/** Жива хвиля напруги (GAME-170, зріз 2) для картки мети: заголовок, «зроблено/усього», хвилини ІГРОВОГО часу, що лишились. */
export interface OfferWave {
  readonly titleKey: string;
  readonly done: number;
  readonly total: number;
  readonly tasks: readonly { readonly id: string; readonly textKey: string; readonly remainingMin: number; readonly outcome: 'open' | 'done' | 'late' }[];
}

export interface StoryOffer {
  /** create — персонажа ще немає; play — гра йде; ended — кінець розділу. */
  readonly stage: 'create' | 'play' | 'ended';
  readonly characters: readonly OfferCharacter[];
  readonly locationKey: string | null;
  readonly moneyCents: number;
  readonly quests: readonly { readonly key: string; readonly objectives: readonly OfferObjective[] }[];
  /** Відкрита розмова: репліка й відповіді (лише ті, що ядро прийме). */
  readonly dialogue: { readonly speakerKey: string | null; readonly key: string | null; readonly answers: readonly OfferAction[] } | null;
  readonly actions: readonly OfferAction[];
  /** Пакування перед дорогою; null — зараз закрите. */
  readonly packing: OfferPacking | null;
  /** Речі в руках; для спорядження (GAME-73) — ще стан 0…100 і чи мокре. */
  readonly inventory: readonly { readonly key: string; readonly qty: number; readonly gear?: { readonly condition: number; readonly wet: boolean } }[];
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
}
