// GAME-194 · короткі ефекти рук (кілок, сокира, сірник, закидання, сплеск, улов, гілка) — через ЄДИНИЙ мікшер, канал sfx.
import { mixer as sharedMixer, type Mixer } from './index';

export type Sfx = 'peg' | 'chop' | 'match' | 'cast' | 'splash' | 'catch' | 'branch';

export const SFX_FILES: Readonly<Record<Sfx, { readonly key: string; readonly url: string }>> = {
  peg: { key: 'sfx-peg', url: 'audio/sfx-peg.ogg' },
  chop: { key: 'sfx-chop', url: 'audio/sfx-chop.ogg' },
  match: { key: 'sfx-match', url: 'audio/sfx-match.ogg' },
  cast: { key: 'sfx-cast', url: 'audio/sfx-cast.ogg' },
  splash: { key: 'sfx-splash', url: 'audio/sfx-splash.ogg' },
  catch: { key: 'sfx-catch', url: 'audio/sfx-catch.ogg' },
  branch: { key: 'sfx-branch', url: 'audio/sfx-branch.ogg' },
};

export interface SfxPlayer { play(name: Sfx): boolean; readonly played: readonly string[] }

export function createSfx(mx: Pick<Mixer, 'play'>): SfxPlayer {
  const played: string[] = [];
  return {
    played,
    play(name) {
      const key = SFX_FILES[name].key;
      const ok = mx.play('sfx', key);
      if (ok) { played.push(key); if (played.length > 32) played.shift(); }
      return ok;
    },
  };
}

export const sfxPlayer: SfxPlayer = createSfx(sharedMixer);
export const sfx = (name: Sfx): boolean => sfxPlayer.play(name);
