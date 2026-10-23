// Знімок сюжету для UI (GAME-32): лише дані й ключі текстів. Команд у ньому немає — UI просить дію
// за її `id`, а що це за команда, знає тільки шар view (src/view/story-offer.ts).

/** Що можна зробити зараз. `key` — ключ тексту контенту (content/locales), `null` — без назви. */
export interface OfferAction {
  readonly id: string;
  readonly kind: 'visit' | 'talk' | 'pickup' | 'buy' | 'sell' | 'complete' | 'decline' | 'choose' | 'continue';
  readonly key: string | null;
  readonly priceCents?: number;
  /** Скільки хвилин займе дорога (GAME-31); немає — дія на місці. */
  readonly minutes?: number;
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
  readonly inventory: readonly { readonly key: string; readonly qty: number }[];
  /** Журнал подорожі, від старого до нового. */
  readonly journal: readonly { readonly type: string; readonly key: string | null; readonly at: number }[];
}
