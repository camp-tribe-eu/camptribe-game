// GAME-301 · текст чека після каси: «що куплено — скільки заплачено» і «Залишилось …», обома мовами. Негативний контроль: без рядка чека (Shell) e2e game-301 червоніє;
// тут — що текст не губить речей, суму й залишок, а ключі є в обох мовах.
import { describe, expect, it } from 'vitest';
import uk from '../i18n/uk.json';
import en from '../i18n/en.json';
import { t } from '../i18n';
import { money } from './StoryPanel';
import { receiptItems } from './receipt';

describe('GAME-301 · чек після каси', () => {
  it('uk: «Намет, Спальник — 34,98 €» і «Залишилось 15,02 €»', () => {
    expect(receiptItems('uk', ['item.tent', 'item.sleeping-bag'], 3498)).toMatch(/^Намет, Спальник — 34,98\s?(€|EUR)$/);
    expect(t('uk', 'shop.receipt.title')).toBe('Куплено');
    expect(`${t('uk', 'shop.receipt.left')} ${money('uk', 1502)}`).toMatch(/^Залишилось 15,02\s?(€|EUR)$/);
  });
  it('en: той самий чек англійською', () => {
    expect(receiptItems('en', ['item.tent', 'item.sleeping-bag'], 3498)).toMatch(/^Tent, Sleeping bag — (€|EUR\s?)34\.98$/);
    expect(t('en', 'shop.receipt.title')).toBe('Bought');
    expect(`${t('en', 'shop.receipt.left')} ${money('en', 1502)}`).toMatch(/^Left (€|EUR\s?)15\.02$/);
  });
  it('ключі чека й підпису «авто не готове» є в обох мовах, і підпис не збігається зі «Сісти в авто»', () => {
    for (const k of ['shop.receipt.title', 'shop.receipt.left', 'near.vehicle.wait'] as const) {
      expect((uk as Record<string, string>)[k], k).toBeTruthy();
      expect((en as Record<string, string>)[k], k).toBeTruthy();
    }
    expect(uk['near.vehicle.wait']).not.toBe(uk['near.vehicle.car']);
  });
});
