// GAME-108 · правило власника (OD-014…016, CLAUDE.md): у грі без політики й релігії. Сторож — малий словник основ слів
// над УСІМА рядками uk/en (контент і інтерфейс). Знахідка — червоне; автор переписує рядок, а не словник.
//
// Ціна ХИБНОГО спрацювання (закон 5) — і чому словник саме такий малий:
//  * хибне червоне коштує авторові хвилину (переписати рядок або звузити основу тут, з коментарем); пропущена
//    політична чи релігійна репліка коштує довіри гравця й модерації платформи (YouTube Playables) — тож краще
//    перестрахуватись, але лише там, де слово майже завжди про тему;
//  * свідомо НЕ в словнику, бо в мирному тексті гри трапляються часто: «вибори» (= вибори гравця, GAME-110), «партія»
//    (партія товару, гра), «party» (свято), «saint»/«Saint-…» (реальні назви місць ЄС), «temple» (скроня), «уряд»
//    (основа є в «урядовий», але й у рідкісних мирних словах — лишаємо «уряд» лише цілим словом);
//  * «бог»/«god» — лише цілим словом (інакше червоніли б «убогий», «godwit»); «церкв»/«church» — основою: мирного
//    вжитку в нашому контенті немає, а пам'ятка-церква в Атласі, якщо колись буде, — окреме рішення власника.
// Словник — НЕ доказ «тем немає»: він ловить очевидне, решту ловить рецензія тексту (закон 4: мовчання — не факт).
import { describe, expect, it } from 'vitest';
import contentUk from '../../content/locales/uk.json';
import contentEn from '../../content/locales/en.json';
import uiUk from '../i18n/uk.json';
import uiEn from '../i18n/en.json';

/** Основи (префікс слова) і цілі слова. Межа слова — будь-яка не-літера (\p{L}). */
const STEMS = [
  // політика
  'політик', 'політичн', 'виборч', 'президент', 'парламент', 'депутат', 'мітинг',
  'politic', 'election', 'president', 'parliament', 'senator', 'protest',
  // релігія
  'церкв', 'церков', 'молит', 'релігі', 'мечет', 'синагог', 'священ', 'біблій',
  'church', 'pray', 'religio', 'mosque', 'synagogue', 'bible', 'priest', 'sermon',
];
const WORDS = ['бог', 'бога', 'богу', 'богом', 'уряд', 'уряду', 'god', 'gods', 'vote', 'votes', 'voting', 'government'];

const PATTERN = new RegExp(`(?<!\\p{L})(?:(?:${STEMS.join('|')})\\p{L}*|(?:${WORDS.join('|')})(?!\\p{L}))`, 'iu');

type Dict = Readonly<Record<string, unknown>>;
export function forbiddenHits(dict: Dict, file: string): string[] {
  return Object.entries(dict).flatMap(([key, value]) => {
    if (typeof value !== 'string') return [];
    const m = PATTERN.exec(value);
    return m ? [`${file} «${key}»: «${m[0]}» — політика чи релігія (правило власника)`] : [];
  });
}

const FILES: readonly [string, Dict][] = [
  ['content/locales/uk.json', contentUk], ['content/locales/en.json', contentEn], ['src/i18n/uk.json', uiUk], ['src/i18n/en.json', uiEn],
];

describe('без політики й релігії: словник над рядками uk/en (GAME-108)', () => {
  it('жодної знахідки в контенті й інтерфейсі', () => {
    expect(FILES.flatMap(([f, d]) => forbiddenHits(d, f))).toEqual([]);
  });

  it('сторож бачить, що стереже: рядків сотні, серед них — події дороги ev.ch1.road-*', () => {
    const total = FILES.reduce((a, [, d]) => a + Object.keys(d).length, 0);
    expect(total).toBeGreaterThan(400);
    expect(Object.keys(contentUk).filter((k) => k.startsWith('dlg.ev.ch1.road-')).length).toBeGreaterThan(30);
  });

  // Мутація (закон 1): подія дороги з забороненим словом мусить червоніти, і саме на своєму ключі.
  it.each([
    ['dlg.ev.ch1.road-009.window', 'Мед, свічки й листівки з президентом.', 'президентом'],
    ['dlg.ev.ch1.road-002.rain', 'Біля церкви раптом дощ.', 'церкви'],
    ['dlg.ev.ch1.road-007.photo', 'The photo looks like an election poster.', 'election'],
    ['dlg.ev.ch1.road-010.plan', 'Oh god, the wind.', 'god'],
    ['dlg.ev.ch1.road-005.game', 'Вікторія молиться, щоб корова з’явилась.', 'молиться'],
  ])('мутація: %s з «%s» — червоне', (key, text, word) => {
    expect(forbiddenHits({ ...contentUk, [key]: text }, 'probe')).toEqual([`probe «${key}»: «${word}» — політика чи релігія (правило власника)`]);
  });

  it.each([['Пам’ятні вибори'], ['Birthday party at the lake'], ['Saint-Hubert'], ['убогий'], ['Godwit на озері'], ['порядок'], ['політ на повітряній кулі'], ['Бібліотека в Намюрі']])(
    'позитивний контроль (без хибного червоного): «%s»', (text) => {
      expect(forbiddenHits({ k: text }, 'probe')).toEqual([]);
    });
});
