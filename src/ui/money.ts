// GAME-346 · єдиний формат грошей для всього UI (раніше «15,02 EUR» в одному місці й «15.02 €» в іншому).
import type { AnyLang } from '../i18n';

export function money(lang: AnyLang, cents: number): string {
  // GAME-84 №7: Intl ставить між числом і валютою нерозривний пробіл. Коли «249,00 EUR» не вміщується в рядок (текст 200 %),
  // браузер різав її посеред слова («EU R»). Звичайний пробіл — рядок рветься між числом і валютою, а слово лишається цілим.
  return new Intl.NumberFormat(lang === 'uk' ? 'uk-UA' : 'en-IE', { style: 'currency', currency: 'EUR' }).format(cents / 100).replace(/[\u00a0\u202f]/g, ' ');
}
