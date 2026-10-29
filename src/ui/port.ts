// Порт UI → гра. UI отримує лише цей інтерфейс: просить дії, але не має доступу на запис
// до стану ядра (TD-003, сторож — eslint.config.js, блок GAME-25).
import type { StoryOffer } from './story-types';

export interface UiPort {
  setPaused(paused: boolean): void;
  /** Записати сейв у сховище браузера (GAME-33). */
  save(): Promise<boolean>;
  /** Нова гра: стерти поточну й записати чисту; false — у пам'яті нова, але в сховище не записалась. */
  newGame(): Promise<boolean>;
  /** Код відновлення поточної гри (OD-008). */
  exportCode(): Promise<string>;
  /**
   * Відновити гру з коду: `ok`; `bad` — код пошкоджений (гра без змін); `outdated` — код цілий, але від
   * старішої версії гри (гра без змін); `newer` — код від новішої версії (оновіть сторінку); `unsaved` — відновлено, але не записано в сховище.
   */
  importCode(code: string): Promise<'ok' | 'bad' | 'outdated' | 'newer' | 'unsaved'>;
  /** Код відновлення сейву, відкладеного на старті як застарілий; null — такого немає. */
  staleCode(): Promise<string | null>;
  /** Сховати повідомлення про відкладений сейв (гравець код уже бачив); false — не вдалося. */
  dismissStale(): Promise<boolean>;
  /** Знімок сюжету для екрана подорожі (GAME-32). */
  story(): StoryOffer;
  /** Попросити дію зі знімка за її id. Дії, якої вже немає в нинішньому стані, не буде (без помилки). */
  act(id: string): void;
  /** Підписка на зміни сюжету; повертає відписку. */
  onStory(listener: () => void): () => void;
  /** GAME-179: гравець заговорив із NPC на мапі: рамка розмови (якщо ядро прийняло розмову) або екран подорожі (якщо ні — там видно чому); повертає відписку. */
  onTalk(listener: () => void): () => void;
  /**
   * GAME-179: портрет (голова по плечі) для id NPC: готовий файл assets/portraits/ або обрізок спрайта ходьби; null — оповідач чи невідомий id.
   * `sprite: true` — лише обрізок (файл не завантажився).
   */
  portrait(npcId: string | null, sprite?: boolean): { readonly src: string; readonly kind: 'file' | 'sprite' } | null;
  /** Гра просить відкрити екран подорожі (розмова з NPC на мапі); повертає відписку. */
  onOpenStory(listener: () => void): () => void;
}

/** Титри (GAME-21, OD-013): дані з assets/credits.json, який збирає й звіряє сторож ліцензій. */
export interface Credits {
  readonly licences: Readonly<Record<string, { readonly url: string }>>;
  readonly files: readonly { readonly file: string; readonly authors: readonly string[]; readonly licence: string; readonly sources: readonly string[]; readonly modified: string }[];
}
