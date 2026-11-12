// GAME-301 · чек після каси: «Куплено» → «Намет, Спальник — 34,98 €» → «Залишилось 15,02 €». Чиста функція: текст перевіряє receipt.test.ts, а Shell лише малює.
import { ct } from '../i18n/content';
import type { AnyLang } from '../i18n';
import { money } from './StoryPanel';

/** Другий рядок чека: назви куплених речей і сума, що пішла з гаманця. */
export function receiptItems(lang: AnyLang, nameKeys: readonly string[], spentCents: number): string {
  return `${nameKeys.map((k) => ct(lang, k)).join(', ')} — ${money(lang, spentCents)}`;
}
