// Тексти контенту (content/locales): назви, квести, репліки. Ключі приходять зі знімка сюжету
// (src/ui/story-types.ts). Відсутній ключ не ховається: видно «⟦ключ⟧» — e2e шукає цю позначку.
import en from '../../content/locales/en.json';
import uk from '../../content/locales/uk.json';
import { pseudo, type AnyLang } from './index';

const CONTENT: Readonly<Record<'uk' | 'en', Readonly<Record<string, string>>>> = { uk, en };

export const MISSING_MARK = '⟦';

export function ct(lang: AnyLang, key: string | null): string {
  if (key === null) return '';
  const text = CONTENT[lang === 'pseudo' ? 'en' : lang][key];
  if (text === undefined) return `${MISSING_MARK}${key}⟧`;
  return lang === 'pseudo' ? pseudo(text) : text;
}
