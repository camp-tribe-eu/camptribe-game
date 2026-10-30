// GAME-40 · UI-події → ключі звуків; мікшер не грає при mute / гучності 0 / без виходу.
import { describe, expect, it } from 'vitest';
import { DEFAULT_AUDIO, createMixer, type SoundOut } from './mixer';
import { UI_SOUND_FILES, createUiSounds, soundForButton } from './ui-sounds';
import scene from '../view/world/scene.ts?raw';

const rig = (audio = DEFAULT_AUDIO, bound = true) => {
  const calls: { key: string; volume: number }[] = [];
  const out: SoundOut = { play: (key, volume) => { calls.push({ key, volume }); } };
  const mx = createMixer(audio, bound ? out : null);
  return { calls, ui: createUiSounds(mx) };
};

describe('звуки UI', () => {
  it('події → правильні ключі', () => {
    const { calls, ui } = rig();
    ui.play('press'); ui.play('confirm'); ui.play('back');
    expect(calls.map((c) => c.key)).toEqual(['ui-click', 'ui-confirmation', 'ui-back']);
    expect(calls.every((c) => c.volume > 0 && c.volume <= 1)).toBe(true);
    expect(ui.played).toEqual(['ui-click', 'ui-confirmation', 'ui-back']);
  });
  it('кнопки: «Продовжити»/підтвердити → confirm; закрити/скасувати → back; решта → press', () => {
    expect(['resume', 'summary-continue', 'confirm-new-yes'].map(soundForButton)).toEqual(['confirm', 'confirm', 'confirm']);
    expect(['story-close', 'confirm-new-no', 'recovery-close', 'summary-end', 'stale-dismiss'].map(soundForButton)).toEqual(['back', 'back', 'back', 'back', 'back']);
    expect(['save', 'mute', 'new-game', undefined, 'text-100'].map(soundForButton)).toEqual(['press', 'press', 'press', 'press', 'press']);
  });
  it('mute, master 0, sfx 0 → нічого не грає; без виходу — теж', () => {
    for (const a of [{ ...DEFAULT_AUDIO, muted: true }, { ...DEFAULT_AUDIO, master: 0 }, { ...DEFAULT_AUDIO, sfx: 0 }]) {
      const { calls, ui } = rig(a);
      expect(ui.play('press')).toBe(false);
      expect(calls).toEqual([]);
      expect(ui.played).toEqual([]);
    }
    const none = rig(DEFAULT_AUDIO, false);
    expect(none.ui.play('back')).toBe(false);
  });
  it('гучність = master × sfx', () => {
    const { calls, ui } = rig({ ...DEFAULT_AUDIO, master: 0.5, sfx: 0.5 });
    ui.play('press');
    expect(calls[0]?.volume).toBeCloseTo(0.25);
  });
  it('сцена вантажить рівно ті ключі й локальні файли, що в таблиці (preload), і файли лежать у public/audio', () => {
    const loads = [...scene.matchAll(/this\.load\.audio\('(ui-[^']+)',\s*'([^']+)'\)/g)].map((m) => [m[1], m[2]]);
    const table = Object.values(UI_SOUND_FILES).map((f) => [f.key, f.url]);
    expect(table).toHaveLength(3);
    expect(loads).toEqual(table);
    for (const [, u] of table) expect(u).toMatch(/^audio\/ui-[a-z]+_001\.ogg$/);   // відносний локальний шлях, без http(s)
  });
});
