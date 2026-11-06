// GAME-261 · нагадування про код відновлення: один раз за все життя налаштувань і лише в природній паузі, а не поверх кадру прибуття (шапка HUD).
// Чисте рішення без Preact — Shell лише виконує те, що тут вирішено; тест ганяє правила без DOM.

/** Скільки ігрових хвилин минуло від прибуття (годинник гри, 1 хв = 1 с кадрів; не стінний таймер — GAME-261), перш ніж нагадування виринає. */
export const REMIND_AFTER_GAME_MIN = 3;

export interface RemindInput {
  /** Нагадування вже показано колись (налаштування, переживає перезапуск). */
  readonly shownEver: boolean;
  /** Остання подорож (id прибуття) чи null — ще нікуди не їхали. */
  readonly trip: string | null;
  /** Подорож, про яку вже нагадали. */
  readonly remindedTrip: string | null;
  /** Хоч щось зайняло екран: пауза, сюжетна панель, розмова, підсумок, створення. */
  readonly busy: boolean;
}

/** Чи починати відлік до нагадування: ніколи не показували, є прибуття, воно нове, екран вільний. */
export function remindArmed(i: RemindInput): boolean {
  return !i.shownEver && i.trip !== null && i.trip !== i.remindedTrip && !i.busy;
}

/** Чи вже час показати: відлік іде, екран вільний і від прибуття минуло ≥ REMIND_AFTER_GAME_MIN ігрових хвилин (`armedAt` — ігровий час прибуття, `now` — зараз, у хвилинах). */
export function remindDue(i: RemindInput & { readonly armedAt: number | null; readonly now: number }): boolean {
  return remindArmed(i) && i.armedAt !== null && i.now - i.armedAt >= REMIND_AFTER_GAME_MIN;
}
