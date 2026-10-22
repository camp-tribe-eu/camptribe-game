import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings';

const mem = (): Storage => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); }, clear: () => m.clear(), key: () => null, get length() { return m.size; } };
};

describe('налаштування (GAME-25)', () => {
  it('зберігаються й читаються', () => {
    const s = mem();
    expect(saveSettings({ textScale: 150, language: 'en' }, s)).toBe(true);
    expect(loadSettings(s)).toEqual({ textScale: 150, language: 'en' });
  });
  it('зіпсований запис або чуже значення — типові, без винятку', () => {
    const s = mem();
    s.setItem('camplife.settings.v1', '{not json');
    expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS);
    s.setItem('camplife.settings.v1', JSON.stringify({ textScale: 999, language: 'xx' }));
    expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS);
  });
  it('недоступне сховище — гра працює на типових', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(loadSettings(broken)).toEqual(DEFAULT_SETTINGS);
    expect(saveSettings(DEFAULT_SETTINGS, broken)).toBe(false);
  });
});
