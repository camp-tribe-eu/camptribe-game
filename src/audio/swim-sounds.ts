// GAME-227 · звуки купання: «плюх» на вході, гребок, вихід і мокрий крок. Синтез WebAudio тут, у src/audio (без файлів: стартовий пакет не росте);
// гучність — канал «sfx» єдиного мікшера (mute або 0 → навіть AudioContext не створюється). Під водою решта звуків приглушена в ambientMix.
import { mixer as sharedMixer, type Mixer } from './index';
import { defaultContext } from './blip';

export type SwimSoundName = 'enter' | 'swim' | 'exit' | 'wet';
/** Кожен звук — короткий спад тону (from → to Гц) за ms мс; peak — частка гучності sfx (гребок найтихіший: «тихе переливання»). */
export const SWIM_SPECS: Readonly<Record<SwimSoundName, { readonly type: 'sine' | 'triangle'; readonly from: number; readonly to: number; readonly ms: number; readonly peak: number }>> = {
  enter: { type: 'triangle', from: 520, to: 150, ms: 190, peak: 0.2 },
  swim: { type: 'sine', from: 150, to: 210, ms: 130, peak: 0.05 },
  exit: { type: 'triangle', from: 260, to: 480, ms: 150, peak: 0.12 },
  wet: { type: 'sine', from: 760, to: 520, ms: 45, peak: 0.07 },
};

interface SwimContext {
  readonly currentTime: number; readonly destination: unknown; readonly state?: string; resume?(): unknown;
  createOscillator(): { type: string; frequency: { setValueAtTime(v: number, t: number): void; exponentialRampToValueAtTime(v: number, t: number): void }; connect(n: unknown): void; start(t: number): void; stop(t: number): void };
  createGain(): { gain: { setValueAtTime(v: number, t: number): void; linearRampToValueAtTime(v: number, t: number): void; exponentialRampToValueAtTime(v: number, t: number): void }; connect(n: unknown): void };
}

export interface SwimSounds { play(name: SwimSoundName): boolean; readonly played: readonly string[] }

export function createSwimSounds(mx: Pick<Mixer, 'volume'>, makeContext: () => SwimContext | null = defaultContext as () => SwimContext | null): SwimSounds {
  let ctx: SwimContext | null | undefined;
  const played: string[] = [];
  return {
    played,
    play(name) {
      const spec = SWIM_SPECS[name];
      const v = mx.volume('sfx') * spec.peak;
      if (!(v > 0)) return false;
      if (ctx === undefined) { try { ctx = makeContext(); } catch { ctx = null; } }
      if (!ctx) return false;
      try {
        if (ctx.state === 'suspended') ctx.resume?.();
        const t = ctx.currentTime; const end = t + spec.ms / 1000;
        const osc = ctx.createOscillator(); const g = ctx.createGain();
        osc.type = spec.type;
        osc.frequency.setValueAtTime(spec.from, t);
        osc.frequency.exponentialRampToValueAtTime(spec.to, end);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(v, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, end);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(t); osc.stop(end + 0.01);
        played.push(name); if (played.length > 32) played.shift();
        return true;
      } catch { return false; }
    },
  };
}

export const swimSounds: SwimSounds = createSwimSounds(sharedMixer);
export const playSwim = (name: SwimSoundName): boolean => swimSounds.play(name);
