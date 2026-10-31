// GAME-221 · «голос» рамки розмови: короткий м'який писк (blip) на кожну 3-тю озвучувану літеру друку, свій тон на кожного мовця.
// Усе синтезується WebAudio тут, у src/audio (поза ним AudioContext заборонено сторожем audio-boundary): жодних звукових файлів.
// Гучність — канал «sfx» єдиного мікшера (mute або 0 → blip не створює навіть AudioContext). Планувальник — чисті функції.
import { mixer as sharedMixer, type Mixer } from './index';

/** Кожна N-та озвучувана літера (літера чи цифра; пробіл і розділові знаки мовчать). 3 ≈ 20 писків/с при друку 62 літери/с — це «мовлення», а не тріск. */
export const BLIP_EVERY = 3;

/** Номери літер (за кодовими точками), на яких звучить blip: перша озвучувана й далі кожна `every`-та озвучувана. */
export function blipIndices(chars: readonly string[], every: number = BLIP_EVERY): number[] {
  const step = Math.max(1, Math.floor(every));
  const out: number[] = [];
  let voiced = 0;
  chars.forEach((ch, i) => {
    if (!/[\p{L}\p{N}]/u.test(ch)) return;
    if (voiced % step === 0) out.push(i);
    voiced++;
  });
  return out;
}

/** Чи є blip серед літер, що з'явились між кадрами: показано було `from`, стало `to` (півінтервал [from, to)). За кадр — щонайбільше один писк. */
export function blipDue(indices: readonly number[], from: number, to: number): boolean {
  return indices.some((i) => i >= from && i < to);
}

/** Тон кожного мовця, Гц. Рядки різні й розведені щонайменше на пів тону (звіряє blip.test.ts зі складом із content/npcs.json). */
export const VOICE_HZ: Readonly<Record<string, number>> = {
  'npc.george': 165, 'npc.luc': 185, 'npc.matthew': 233, 'npc.nora': 262, 'npc.victoria': 294,
  'npc.sarah': 311, 'npc.elise': 330, 'npc.amina': 349, 'npc.claire': 370, 'npc.ingrid': 392,
  player: 220, narrator: 147,
};

/** Мовці з ім'ям (id NPC): їх імена викликач підставляє в speakerPitch для сцен. */
export const VOICE_NPC_IDS: readonly string[] = Object.keys(VOICE_HZ).filter((id) => id.startsWith('npc.'));

/**
 * Тон мовця. Сцени (ch1-fire) говорять від 'player', а мовця називає початок рядка: «Вікторія: «…»» — тож, коли викликач передав імена
 * (id голосу → ім'я в поточній мові), підпис важливіший за speakerId. Невідомий мовець — стабільний тон із хешу id (не мовчання й не однаковий).
 * Імена не живуть у коді: їх бере з контенту той, хто викликає (мови й переклади — не справа аудіомодуля).
 */
export function speakerPitch(speakerId: string | null | undefined, text = '', names: Readonly<Record<string, string>> = {}): number {
  const named = Object.entries(names).find(([, name]) => name !== '' && text.trimStart().startsWith(`${name}:`));
  const id = named?.[0] ?? speakerId ?? 'narrator';
  const known = VOICE_HZ[id];
  if (known !== undefined) return known;
  let h = 0;
  for (const ch of id) h = (h * 31 + (ch.codePointAt(0) ?? 0)) % 9973;
  return 160 + (h % 24) * 10;
}

/** Найменше, що ми приймаємо від WebAudio-контексту; у тестах підміняється записом. */
interface BlipContext {
  readonly currentTime: number;
  readonly destination: unknown;
  readonly state?: string;
  resume?(): unknown;
  createOscillator(): { type: string; frequency: { value: number }; connect(n: unknown): void; start(t: number): void; stop(t: number): void };
  createGain(): { gain: { setValueAtTime(v: number, t: number): void; linearRampToValueAtTime(v: number, t: number): void; exponentialRampToValueAtTime(v: number, t: number): void }; connect(n: unknown): void };
}

/** Пік гучності blip при sfx = 1 і master = 1: тихий, щоб кілька хвилин читання не втомлювали (мікшер множить на свої повзунки). */
export const BLIP_PEAK = 0.12;

export interface Blipper {
  /** Зіграти один blip тоном hz; false — тиша (mute, гучність 0) або WebAudio недоступний. */
  blip(hz: number): boolean;
}

export function createBlipper(mx: Pick<Mixer, 'volume'>, makeContext: () => BlipContext | null = defaultContext): Blipper {
  let ctx: BlipContext | null | undefined;
  return {
    blip(hz) {
      const v = mx.volume('sfx') * BLIP_PEAK;
      if (!(v > 0)) return false;
      if (ctx === undefined) { try { ctx = makeContext(); } catch { ctx = null; } }
      if (!ctx) return false;
      try {
        if (ctx.state === 'suspended') ctx.resume?.();
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = hz;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(v, t + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.08);
        return true;
      } catch { return false; }
    },
  };
}

function defaultContext(): BlipContext | null {
  const C = (globalThis as { AudioContext?: new () => BlipContext; webkitAudioContext?: new () => BlipContext }).AudioContext
    ?? (globalThis as { webkitAudioContext?: new () => BlipContext }).webkitAudioContext;
  return C ? new C() : null;
}

export const blipper: Blipper = createBlipper(sharedMixer);
