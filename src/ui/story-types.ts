// Знімок сюжету для UI (GAME-32): лише дані й ключі текстів. Команд у ньому немає — UI просить дію
// за її `id`, а що це за команда, знає тільки шар view (src/view/story-offer.ts).

/** Що можна зробити зараз. `key` — ключ тексту контенту (content/locales), `null` — без назви. */
export interface OfferAction {
  readonly id: string;
  readonly kind: 'visit' | 'talk' | 'pickup' | 'buy' | 'sell' | 'dry' | 'complete' | 'decline' | 'choose' | 'continue';
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
  /** Речі в руках; для спорядження (GAME-73) — ще стан 0…100 і чи мокре. */
  readonly inventory: readonly { readonly key: string; readonly qty: number; readonly gear?: { readonly condition: number; readonly wet: boolean } }[];
  /** Продаються тут, але бракує грошей (GAME-83): показуються вимкненими з причиною, а не зникають. */
  readonly locked: readonly OfferAction[];
  /** День гри з 1 і хвилина доби 0…1439 — для HUD (GAME-83). */
  readonly day: number;
  readonly timeMinutes: number;
  /** Погода сьогодні (GAME-46, SIM-WX-005). */
  readonly weather: 'sunny' | 'cloudy' | 'rain';
  /** Журнал подорожі, від старого до нового. */
  readonly journal: readonly { readonly type: string; readonly key: string | null; readonly at: number }[];
}
