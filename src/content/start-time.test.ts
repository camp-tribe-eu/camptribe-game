// GAME-89 №1 · час на старті гри збігається з тим, що каже перший квест. Годинник стартує з 00:00 дня 1 (newClock):
// ця точка вшита в записані програвання, вічні фікстури сейвів і календар життя (GAME-71), тож зсувати її заради
// одного слова в тексті — дорожче за дефект. Натомість текст не називає ні пори дня, ні дня тижня, яких годинник не підтверджує.
import { describe, expect, it } from 'vitest';
import { newSim } from '../core/sim';
import { ct } from '../i18n/content';

const DAY_MINUTES = 1440;
/** Пора дня чи день тижня в тексті: «вечір», «п'ятниця», evening, Friday. */
const CLAIMS = /вечір|вечер|п.ятниц|evening|friday/i;

describe('старт гри і текст першого квесту (GAME-89 №1)', () => {
  const startHour = Math.floor((newSim(1).clock.minutes % DAY_MINUTES) / 60);

  it('на старті — день 1 о 00:00 (якщо це зміниться, перегляньте програвання й фікстури, а потім цей тест)', () => {
    expect(newSim(1).clock.minutes).toBe(0);
  });

  for (const lang of ['uk', 'en'] as const) {
    it(`q.st-001.o1 (${lang}) не обіцяє вечора, поки годинник показує ніч`, () => {
      const text = ct(lang, 'q.st-001.o1');
      expect(text).not.toContain('⟦');                       // ключ існує — інакше перевірка порожня
      expect(text.length).toBeGreaterThan(20);
      const claimsEvening = CLAIMS.test(text);
      expect(claimsEvening && startHour < 17, `«${text}» при старті о ${startHour}:00`).toBe(false);
    });
  }

  it('негативний контроль: сторож упізнає колишній текст «Вечір п\'ятниці…»', () => {
    expect(CLAIMS.test("Вечір п'ятниці, а планів нуль.")).toBe(true);
    expect(CLAIMS.test('Friday evening and no plans at all.')).toBe(true);
  });
});
