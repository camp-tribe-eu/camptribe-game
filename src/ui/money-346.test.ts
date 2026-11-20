// GAME-346 · гроші скрізь виглядають однаково: «15,02 EUR» (uk) / «€15.02» (en) — раніше підсумок дня й штраф дороги писали «15.02 €».
// Мутація (перевірено): у fineLine/walletLine повернути `${(cents / 100).toFixed(2)} €` → «усі місця однаково» червоніє.
import { describe, expect, it } from 'vitest';
import { money } from './money';
import { money as fromStory } from './StoryPanel';
import { fineLine } from './MinigameHost';
import { walletLine } from './SampleDay';
import { t } from '../i18n';
import type { Key } from '../i18n';

describe('GAME-346 · один формат грошей', () => {
  it('форматер: центи → валюта за мовою, без нерозривного пробілу', () => {
    expect(money('uk', 1502)).toBe('15,02 EUR');
    expect(money('en', 1502)).toBe('€15.02');
    expect(money('uk', 0)).toBe('0,00 EUR');
    expect(fromStory).toBe(money);
  });
  for (const lang of ['uk', 'en'] as const) {
    it(`гаманець підсумку й штраф дороги йдуть через нього — ${lang}`, () => {
      const tr = (k: Key): string => t(lang, k);
      expect(walletLine(tr, lang, 1502)).toBe(`${tr('sd.sum.wallet')}: ${money(lang, 1502)}`);
      expect(fineLine(tr, lang, 1502)).toBe(`${tr('mg.drive.fine')}: ${money(lang, 1502)}`);
      expect(walletLine(tr, lang, 1502)).not.toMatch(/\d\.\d{2} €/);
    });
  }
});
