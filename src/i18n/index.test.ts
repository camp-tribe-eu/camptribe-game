import { describe, expect, it } from 'vitest';
import en from './en.json';
import { LOCALES, pseudo, t, type Key } from './index';
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
