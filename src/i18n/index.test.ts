import { describe, expect, it } from 'vitest';
import en from './en.json';
import { LOCALES, pseudo, t, touchWording, type Key } from './index';
import uk from './uk.json';

describe('локалізація (GAME-26)', () => {
  it('uk і en мають однаковий набір ключів, жоден рядок не порожній', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(uk).sort());
    for (const lang of ['uk', 'en'] as const) for (const v of Object.values(LOCALES[lang])) expect(v.trim().length).toBeGreaterThan(0);
  });
  it('псевдолокаль довша щонайменше на 40 %', () => {
    for (const k of Object.keys(en) as Key[]) expect(t('pseudo', k).length).toBeGreaterThanOrEqual(Math.ceil(en[k].length * 1.4));
  });
  it('псевдолокаль позначена дужками й відрізняється від оригіналу', () => {
    expect(pseudo('Pause')).toMatch(/^\[.*\]$/);
    expect(pseudo('Pause')).not.toContain('Pause');
  });
});

describe('GAME-341: на дотику підписи не називають клавіші', () => {
  // Мутація (перевірено): прибрав replace в touchWording (повертає text) → цей тест червоний на «E чи ●».
  it('жоден підпис дії не містить «E» на дотику (uk і en), а на клавіатурі лишається як є', () => {
    for (const lang of ['uk', 'en'] as const) {
      for (const [k, v] of Object.entries(LOCALES[lang])) {
        if (!/[E●]/.test(v) || !v.includes('●')) continue;
        expect(touchWording(v, true), `${lang}:${k}`).not.toMatch(/\bE\b/);
        expect(touchWording(v, true), `${lang}:${k}`).toContain('●');
        expect(touchWording(v, false)).toBe(v);
      }
    }
    expect(touchWording('Колонка: E чи ●', true)).toBe('Колонка: ●');
  });
});
