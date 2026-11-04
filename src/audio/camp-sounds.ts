// GAME-225 · «Живий табір»: звуки матеріалів на дії біля речей табору. Синтез WebAudio тут, у src/audio (без файлів: стартовий пакет не росте);
// гучність — канал «sfx» єдиного мікшера (mute або 0 → навіть AudioContext не створюється). Матеріал → тон: дерево глухе й порожнисте,
// метал дзвінкий, вода булькає, листя шурхотить високо й тихо.
import { mixer as sharedMixer, type Mixer } from './index';
import { defaultContext } from './blip';

export type CampSoundName = 'plank' | 'thud' | 'leaf' | 'pop' | 'clank' | 'water' | 'splash' | 'sit' | 'paper' | 'crack' | 'clay' | 'hollow' | 'snap';
/** Кожен звук — короткий спад тону (from → to Гц) за ms мс; peak — частка гучності sfx. */
export const CAMP_SPECS: Readonly<Record<CampSoundName, { readonly type: 'sine' | 'triangle' | 'square'; readonly from: number; readonly to: number; readonly ms: number; readonly peak: number }>> = {
  plank: { type: 'triangle', from: 210, to: 130, ms: 70, peak: 0.1 },   // крок по дошках пірса: дерево, порожнисто
  thud: { type: 'sine', from: 120, to: 62, ms: 120, peak: 0.2 },        // стовбур під рукою
  leaf: { type: 'triangle', from: 1500, to: 900, ms: 60, peak: 0.04 },  // листя й гілки
  pop: { type: 'sine', from: 480, to: 960, ms: 80, peak: 0.12 },        // шишка чи ягода долітає до героя
  clank: { type: 'square', from: 820, to: 410, ms: 110, peak: 0.07 },   // кришка смітника
  water: { type: 'sine', from: 280, to: 520, ms: 200, peak: 0.1 },      // колонка: булькає
  splash: { type: 'triangle', from: 640, to: 240, ms: 110, peak: 0.12 },// калюжа під ногою
  sit: { type: 'sine', from: 170, to: 110, ms: 90, peak: 0.1 },         // сів на лавку
  paper: { type: 'triangle', from: 900, to: 700, ms: 50, peak: 0.05 },  // дошка оголошень
  crack: { type: 'square', from: 360, to: 130, ms: 95, peak: 0.1 },     // GAME-228: ящик тріснув (сухе дерево)
  clay: { type: 'triangle', from: 820, to: 380, ms: 110, peak: 0.1 },   // горщик розбився (глина дзвінка й коротка)
  hollow: { type: 'sine', from: 210, to: 85, ms: 140, peak: 0.16 },     // бочка: порожнисто
  snap: { type: 'square', from: 1100, to: 520, ms: 55, peak: 0.06 },    // суха гілка тріснула
};

interface CampContext {
  readonly currentTime: number; readonly destination: unknown; readonly state?: string; resume?(): unknown;
  createOscillator(): { type: string; frequency: { setValueAtTime(v: number, t: number): void; exponentialRampToValueAtTime(v: number, t: number): void }; connect(n: unknown): void; start(t: number): void; stop(t: number): void };
  createGain(): { gain: { setValueAtTime(v: number, t: number): void; linearRampToValueAtTime(v: number, t: number): void; exponentialRampToValueAtTime(v: number, t: number): void }; connect(n: unknown): void };
}

export interface CampSounds { play(name: CampSoundName): boolean; readonly played: readonly string[] }

export function createCampSounds(mx: Pick<Mixer, 'volume'>, makeContext: () => CampContext | null = defaultContext as () => CampContext | null): CampSounds {
  let ctx: CampContext | null | undefined;
  const played: string[] = [];
  return {
    played,
    play(name) {
      const spec = CAMP_SPECS[name];
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
        g.gain.linearRampToValueAtTime(v, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, end);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(t); osc.stop(end + 0.01);
        played.push(name); if (played.length > 32) played.shift();
        return true;
      } catch { return false; }
    },
  };
}

export const campSounds: CampSounds = createCampSounds(sharedMixer);
export const playCamp = (name: CampSoundName): boolean => campSounds.play(name);
