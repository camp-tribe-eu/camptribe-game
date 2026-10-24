// GAME-139 (R1-06) · конвенція DECISIONS радника: в uk-текстах імена героїв і місць — кирилицею (Джордж, Вікторія, Метью, Мія,
// Анна, Еліза, Камій Моро, Бенуа Маршаль, Олів'є Ламбер, Софі Дюбуа, родина Мартін); в en/fr/de/es — латиницею.
// Сторож дивиться лише ЗНАЧЕННЯ uk-словників (ID на кшталт `item.mia-carrier` — ключі, їх не чіпаємо).
import { describe, expect, it } from 'vitest';
import contentUk from '../../content/locales/uk.json';
import uiUk from '../i18n/uk.json';

/** Латинські форми імен, яких не має бути в uk-рядках. Слово цілком, без урахування регістру. */
const LATIN_NAMES = ['George', 'Victoria', 'Matthew', 'Mia', 'Anna', 'Elise', 'Eliza', 'Camille', 'Moreau', 'Beno[iî]t', 'Marchal',
  'Olivier', 'Lambert', 'Sophie', 'Dubois', 'Martin'];
const PATTERN = new RegExp(`(?<![\\p{L}])(${LATIN_NAMES.join('|')})(?![\\p{L}])`, 'iu');

type Dict = Readonly<Record<string, unknown>>;
function hits(dict: Dict, file: string): string[] {
  return Object.entries(dict).flatMap(([key, value]) => {
    if (typeof value !== 'string') return [];
    const m = PATTERN.exec(value);
    return m ? [`${file} «${key}»: «${m[1]}» латиницею — в uk кирилицею (DECISIONS)`] : [];
  });
}

describe('uk: імена кирилицею (GAME-139)', () => {
  it('жодного латинського імені героя чи місця в значеннях uk-словників', () => {
    expect([...hits(contentUk as Dict, 'content/locales/uk.json'), ...hits(uiUk as Dict, 'src/i18n/uk.json')]).toEqual([]);
  });

  it('сторож бачить, що стереже: словники не порожні', () => {
    expect(Object.keys(contentUk).length).toBeGreaterThan(20);
    expect(Object.keys(uiUk).length).toBeGreaterThan(20);
  });

  // Негативні контролі (закон 1): кожна форма мусить червоніти, кирилиця й ID — ні.
  it.each([
    ['Переноска Mia', 'Mia'], ['Привіт, George!', 'George'], ['Benoît чекає', 'Benoît'], ['родина Martin', 'Martin'], ['ELISE', 'ELISE'],
  ])('негативний контроль: «%s» червоніє', (text, name) => {
    expect(hits({ k: text }, 'probe')).toEqual([`probe «k»: «${name}» латиницею — в uk кирилицею (DECISIONS)`]);
  });
  it.each([['Переноска Мії'], ['Джордж і Вікторія'], ['Martini'], ['Annabelle']])('позитивний контроль: «%s» — не знахідка', (text) => {
    expect(hits({ k: text }, 'probe')).toEqual([]);
  });
});
