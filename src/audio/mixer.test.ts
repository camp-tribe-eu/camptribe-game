// GAME-40 · критерій 2 (гучність 0 → жодного play з ненульовою гучністю) і 3 (гучність переживає перезавантаження).
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../platform/settings';
import { DEFAULT_AUDIO, clamp01, createMixer, effectiveVolume, parseAudio, type AudioSettings, type SoundOut } from './mixer';

const rec = (): SoundOut & { calls: { key: string; volume: number; loop: boolean }[] } => {
  const calls: { key: string; volume: number; loop: boolean }[] = [];
  return { calls, play: (key, volume, loop) => { calls.push({ key, volume, loop }); } };
};
const mem = (): Storage => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); }, clear: () => m.clear(), key: () => null, get length() { return m.size; } };
};
const with_ = (o: Partial<AudioSettings>): AudioSettings => ({ ...DEFAULT_AUDIO, ...o });

describe('мікшер: гучність 0 — тиша (GAME-40, критерій 2)', () => {
  const silent: [string, Partial<AudioSettings>][] = [
    ['master = 0', { master: 0 }], ['sfx = 0', { sfx: 0 }], ['mute', { muted: true }],
    ['master від’ємний → 0', { master: -5 }],
  ];
  for (const [name, o] of silent) {
    it(`${name}: play не викликається, жодного виклику з ненульовою гучністю`, () => {
      const out = rec();
      const m = createMixer(with_(o), out);
      expect(m.play('sfx', 'click')).toBe(false);
      expect(out.calls).toEqual([]);
    });
  }
  it('music = 0 мовчить, sfx при цьому грає (канали незалежні)', () => {
    const out = rec();
    const m = createMixer(with_({ music: 0 }), out);
    expect(m.play('music', 'theme', { loop: true })).toBe(false);
    expect(m.play('sfx', 'click')).toBe(true);
    expect(out.calls.map((c) => c.key)).toEqual(['click']);
  });
  it('позитивний контроль: ненульова гучність грає з master × канал, у межах 0..1', () => {
    const out = rec();
    const m = createMixer(with_({ master: 0.5, sfx: 0.5 }), out);
    expect(m.play('sfx', 'click')).toBe(true);
    expect(out.calls).toEqual([{ key: 'click', volume: 0.25, loop: false }]);
  });
  it('зниження до 0 після старту теж мовчить; повернення гучності оживляє', () => {
    const out = rec();
    const m = createMixer(DEFAULT_AUDIO, out);
    m.apply(with_({ master: 0 }));
    m.play('sfx', 'a');
    m.apply(with_({ master: 1 }));
    m.play('sfx', 'b');
    expect(out.calls.map((c) => c.key)).toEqual(['b']);
  });
  it('без виходу нічого не грає і не падає', () => {
    expect(createMixer(DEFAULT_AUDIO).play('sfx', 'x')).toBe(false);
  });
  it('обмеження 0..1: понад 1 → 1, ефективна гучність ніколи не більша за 1', () => {
    expect(clamp01(7)).toBe(1);
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(NaN)).toBe(0);
    expect(clamp01('0.5')).toBe(0);
    expect(effectiveVolume(with_({ master: 9, sfx: 9 }), 'sfx')).toBe(1);
  });
});

describe('гучність переживає перезавантаження (GAME-40, критерій 3)', () => {
  it('збережена через модуль налаштувань і прочитана «після перезавантаження» — та сама', () => {
    const store = mem();
    const audio = with_({ master: 0.3, sfx: 0.7, music: 0, muted: true });
    expect(saveSettings({ ...DEFAULT_SETTINGS, audio }, store)).toBe(true);
    expect(loadSettings(store).audio).toEqual(audio);
    expect(createMixer(loadSettings(store).audio).settings).toEqual(audio);
  });
  it('старий запис без audio — типові; зіпсовані числа — обмежені чи типові, не тиша й не вибух', () => {
    const store = mem();
    store.setItem('camplife.settings.v1', JSON.stringify({ textScale: 100, language: 'uk' }));
    expect(loadSettings(store).audio).toEqual(DEFAULT_AUDIO);
    store.setItem('camplife.settings.v1', JSON.stringify({ audio: { master: 5, sfx: 'x', music: -1, muted: 'yes' } }));
    expect(loadSettings(store).audio).toEqual({ master: 1, sfx: DEFAULT_AUDIO.sfx, music: 0, muted: false });
    expect(parseAudio(null)).toEqual(DEFAULT_AUDIO);
  });
});
