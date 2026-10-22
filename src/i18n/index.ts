// Локалізація (GAME-26): жодного тексту в коді — лише ключі. Тексти — у uk.json / en.json.
// Псевдолокаль `pseudo` (+40 % довжини, діакритика) — лише для тестів переповнення інтерфейсу.
import en from './en.json';
import uk from './uk.json';

export type Key = keyof typeof uk;
export type Lang = 'uk' | 'en';
export type AnyLang = Lang | 'pseudo';

export const LOCALES: Readonly<Record<Lang, Readonly<Record<Key, string>>>> = { uk, en };

const ACCENT: Readonly<Record<string, string>> = { a: 'á', e: 'é', i: 'í', o: 'ö', u: 'ü', A: 'Á', E: 'É', I: 'Í', O: 'Ö', U: 'Ü', c: 'ç', n: 'ñ' };

/** Псевдопереклад: діакритика + розширення до ≥ 140 % довжини англійського рядка, у дужках. */
export function pseudo(text: string): string {
  const accented = [...text].map((ch) => ACCENT[ch] ?? ch).join('');
  const pad = Math.ceil(text.length * 0.4);
  return `[${accented}${'~'.repeat(pad)}]`;
}

export function t(lang: AnyLang, key: Key): string {
  return lang === 'pseudo' ? pseudo(LOCALES.en[key]) : LOCALES[lang][key];
}
