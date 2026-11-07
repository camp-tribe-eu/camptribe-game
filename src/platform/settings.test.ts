import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, onSettingsSaved, saveSettings } from './settings';

const mem = (): Storage => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); }, clear: () => m.clear(), key: () => null, get length() { return m.size; } };
};

describe('налаштування (GAME-25)', () => {
  it('зберігаються й читаються', () => {
    const s = mem();
    expect(saveSettings({ textScale: 150, language: 'en', hintSeen: true, remindedTrip: null, remindShown: false, audio: DEFAULT_SETTINGS.audio, hintMode: 'always', levelUps: true, zoom: 0 }, s)).toBe(true);
    expect(loadSettings(s)).toEqual({ textScale: 150, language: 'en', hintSeen: true, remindedTrip: null, remindShown: false, audio: DEFAULT_SETTINGS.audio, hintMode: 'always', levelUps: true, zoom: 0 });
    s.setItem('camplife.settings.v1', JSON.stringify({ hintMode: 'junk' }));
    expect(loadSettings(s).hintMode).toBe('stuck');   // GAME-192: типово «коли застряг»
    s.setItem('camplife.settings.v1', JSON.stringify({ levelUps: false }));
    expect(loadSettings(s).levelUps).toBe(false);   // GAME-229: вимкнений екран рангів переживає перезапуск
    s.setItem('camplife.settings.v1', JSON.stringify({ levelUps: 'junk' }));
    expect(loadSettings(s).levelUps).toBe(true);    // сміття — типове «показувати»
  });
  it('200 % (GAME-39) зберігається й читається; 175 — чуже значення, типове', () => {
    const s = mem();
    saveSettings({ textScale: 200, language: 'uk', hintSeen: false, remindedTrip: null, remindShown: false, audio: DEFAULT_SETTINGS.audio, hintMode: 'stuck', levelUps: true, zoom: 0 }, s);
    expect(loadSettings(s).textScale).toBe(200);
    s.setItem('camplife.settings.v1', JSON.stringify({ textScale: 175, language: 'uk' }));
    expect(loadSettings(s).textScale).toBe(DEFAULT_SETTINGS.textScale);
  });
  it('зіпсований запис або чуже значення — типові, без винятку', () => {
    const s = mem();
    s.setItem('camplife.settings.v1', '{not json');
    expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS);
    s.setItem('camplife.settings.v1', JSON.stringify({ textScale: 999, language: 'xx' }));
    expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS);
  });
  it('підказка першого запуску (GAME-83): старий запис без hintSeen — ще не бачена; не-true — теж', () => {
    const s = mem();
    s.setItem('camplife.settings.v1', JSON.stringify({ textScale: 100, language: 'uk' }));
    expect(loadSettings(s).hintSeen).toBe(false);
    s.setItem('camplife.settings.v1', JSON.stringify({ textScale: 100, language: 'uk', hintSeen: 'yes' }));
    expect(loadSettings(s).hintSeen).toBe(false);
  });
  it('недоступне сховище — гра працює на типових', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(loadSettings(broken)).toEqual(DEFAULT_SETTINGS);
    expect(saveSettings(DEFAULT_SETTINGS, broken)).toBe(false);
  });
});

describe('GAME-278 · zoom у налаштуваннях', () => {
  it('типово Авто (0); ціле 1..8 зберігається; сміття (дробове, 0, 9, текст) — Авто', () => {
    expect(loadSettings({ getItem: () => null }).zoom).toBe(0);
    for (const [z, want] of [[2, 2], [8, 8], [1.5, 0], [0, 0], [9, 0], ['2', 0], [-1, 0]] as [unknown, number][]) {
      expect(loadSettings({ getItem: () => JSON.stringify({ zoom: z }) }).zoom, String(z)).toBe(want);
    }
  });
  it('onSettingsSaved: слухач чує збереження, відписка працює', () => {
    const seen: number[] = [];
    const off = onSettingsSaved((s) => seen.push(s.zoom));
    saveSettings({ ...DEFAULT_SETTINGS, zoom: 3 }, { setItem: () => undefined });
    off();
    saveSettings({ ...DEFAULT_SETTINGS, zoom: 4 }, { setItem: () => undefined });
    expect(seen).toEqual([3]);
  });
});
