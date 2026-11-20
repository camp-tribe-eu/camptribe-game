// GAME-340 · заголовок дошки табору не бреше про годину: зразковий день тримає годинник біля 23:30 (SAMPLE_HOLD_MINUTE), а дошка писала «Ранок · Лишилось часу».
// Раунди дошки — частини дня, а не показ годинника: три перші мають нейтральні назви, «Вечір» лишається (годинник у зразку вже вечірній).
// Мутація (перевірено): повернути "camp.round.morning": "Ранок" в uk.json → червоніє.
import { describe, expect, it } from 'vitest';
import uk from '../i18n/uk.json';
import en from '../i18n/en.json';
import { ROUNDS } from '../content/camp-day';
import { SAMPLE_HOLD_MINUTE } from '../content/sample-day';

const TIME_WORDS = /ранок|ранку|полудень|пополудні|вранці|morning|noon|midday|afternoon/i;

describe('GAME-340 · назви раундів дошки не суперечать годиннику', () => {
  it('зразок тримає вечірній годинник, тож ранішні назви раундів були б неправдою', () => {
    expect(SAMPLE_HOLD_MINUTE).toBeGreaterThanOrEqual(18 * 60);
  });
  it('кожен раунд має назву в обох мовах; ранок/полудень/пополудні — без слів про пору доби', () => {
    for (const [lang, dict] of [['uk', uk], ['en', en]] as const) {
      for (const r of ROUNDS) {
        const label = (dict as Record<string, string>)[`camp.round.${r}`];
        expect(label, `${lang} camp.round.${r}`).toBeTruthy();
        if (r !== 'evening') expect(label, `${lang} camp.round.${r}: назва пори доби суперечить годиннику`).not.toMatch(TIME_WORDS);
      }
    }
  });
});
