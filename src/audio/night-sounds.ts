// GAME-231 · нічні звуки табору: цвіркуни (дрібні серії писків) і зрідка сова. Синтез WebAudio тут, у src/audio (файлів нема: стартовий пакет не росте).
// Усе покадрово й детерміновано: цвіркуни — від накопиченої дельти кадру, сова — від ІГРОВОЇ хвилини доби (owlDue), без таймерів і Date.
// Гучність — канал «music» єдиного мікшера (фон і ця нічна «тиша» слухаються одного повзунка й mute): mute або 0 → навіть AudioContext не створюється.
// Коли звучить: табір, не вступ, не дощ (дощ глушить цвіркунів), вечір і ніч — від 19:00 (як вечірня музика) до світанку. Плавно вмикається й стихає (NIGHT_FADE_MS).
import { mixer as sharedMixer, type Mixer } from './index';
import { defaultContext } from './blip';
import { isEveningMinute } from './music';

/** Повний перехід тиша ↔ ніч, мс (як перехід музики — повільно, без «смикання»). */
export const NIGHT_FADE_MS = 2500;
/** Дельту кадру обмежуємо: після згорнутої вкладки не вистрілює черга писків. */
export const MAX_DT_MS = 100;
export const CRICKET_EVERY_MS = [1300, 1900] as const;
export const CRICKET_HZ = [4300, 4650] as const;
export const CRICKET_PEAK = 0.03;
export const OWL_PEAK = 0.07;
/** Сова: у кожному вікні з OWL_WINDOW ігрових хвилин (≈ 45 с реального часу) один крик у момент, заданий зсувом із таблиці. */
export const OWL_WINDOW = 45;
export const OWL_OFFSETS = [7, 29, 16, 38, 22] as const;

export interface NightState {
  readonly map: 'camp' | 'home' | 'shop' | 'road' | 'mullerthal' | null;
  readonly intro: boolean;
  readonly raining: boolean;
  /** Хвилина доби 0…1439 (daylight.timeOfDay), дробова. */
  readonly minuteOfDay: number;
}

/** Цільова гучність нічного шару: 1 — ніч у таборі без дощу, інакше 0. */
export function nightTarget(s: NightState): number {
  return s.map === 'camp' && !s.intro && !s.raining && isEveningMinute(s.minuteOfDay) ? 1 : 0;
}

/** Чи припадає крик сови на проміжок ігрових хвилин (prev, now]; доба по колу (північ). Чиста функція: той самий час — той самий крик. */
export function owlDue(prev: number, now: number): boolean {
  const a = ((prev % 1440) + 1440) % 1440;
  let b = ((now % 1440) + 1440) % 1440;
  if (b < a) b += 1440;   // перейшли північ
  if (b - a > OWL_WINDOW) return false;   // стрибок часу (завантаження, сон) — не «наздоганяємо» крики
  const k0 = Math.floor(a / OWL_WINDOW);
  for (let k = k0; k <= k0 + 2; k++) {
    const t = k * OWL_WINDOW + (OWL_OFFSETS[(k % 32) % OWL_OFFSETS.length] as number);
    if (t > a && t <= b) return true;
    if (t > b) break;
  }
  return false;
}

interface NightContext {
  readonly currentTime: number; readonly destination: unknown; readonly state?: string; resume?(): unknown;
  createOscillator(): { type: string; frequency: { setValueAtTime(v: number, t: number): void; exponentialRampToValueAtTime(v: number, t: number): void }; connect(n: unknown): void; start(t: number): void; stop(t: number): void };
  createGain(): { gain: { setValueAtTime(v: number, t: number): void; linearRampToValueAtTime(v: number, t: number): void; exponentialRampToValueAtTime(v: number, t: number): void }; connect(n: unknown): void };
}

export interface NightSounds {
  /** Крок кадру: dtMs — дельта кадру, s — стан. Нічого не робить у тиші, без жесту чи в mute. */
  tick(dtMs: number, s: NightState): void;
  /** Перший жест гравця (політика автовідтворення): до нього контекст не створюється. */
  unlock(): void;
  readonly level: number;
  /** Що зіграно (лише для тестів і проби e2e). */
  readonly played: readonly string[];
  readonly counts: { readonly cricket: number; readonly owl: number };
}

export function createNightSounds(mx: Pick<Mixer, 'volume'>, makeContext: () => NightContext | null = defaultContext as () => NightContext | null): NightSounds {
  let ctx: NightContext | null | undefined;
  let unlocked = false;
  let level = 0;
  let prevMin: number | null = null;
  const acc = [0, 0];
  const played: string[] = [];
  const counts = { cricket: 0, owl: 0 };
  const log = (n: string): void => { played.push(n); if (played.length > 32) played.shift(); };

  const open = (): NightContext | null => {
    if (ctx === undefined) { try { ctx = makeContext(); } catch { ctx = null; } }
    if (ctx && ctx.state === 'suspended') ctx.resume?.();
    return ctx ?? null;
  };
  /** Одна нота: тон from → to за ms мс, початок через `at` с. */
  const note = (c: NightContext, type: string, from: number, to: number, at: number, ms: number, v: number): void => {
    const t = c.currentTime + at; const end = t + ms / 1000;
    const osc = c.createOscillator(); const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, end);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + Math.min(0.02, ms / 3000));
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(g); g.connect(c.destination);
    osc.start(t); osc.stop(end + 0.01);
  };
  const play = (name: 'cricket' | 'owl', i: number, v: number): void => {
    const c = open();
    if (!c) return;
    try {
      if (name === 'cricket') {
        const hz = CRICKET_HZ[i] as number;
        for (let p = 0; p < 3; p++) note(c, 'sine', hz, hz * 0.97, p * 0.045, 24, v * CRICKET_PEAK);
      } else {
        note(c, 'sine', 430, 390, 0, 380, v * OWL_PEAK);
        note(c, 'sine', 370, 330, 0.55, 520, v * OWL_PEAK * 0.9);
      }
      counts[name]++; log(name);
    } catch { /* звук не вдався — тиша безпечніша за збій кадру */ }
  };

  return {
    played, counts,
    get level() { return level; },
    unlock() { unlocked = true; },
    tick(dtMs, s) {
      const dt = Math.min(MAX_DT_MS, Math.max(0, dtMs));
      const want = nightTarget(s);
      const step = dt / NIGHT_FADE_MS;
      level = level < want ? Math.min(want, level + step) : Math.max(want, level - step);
      const prev = prevMin ?? s.minuteOfDay;
      prevMin = s.minuteOfDay;
      if (level <= 0) { acc[0] = 0; acc[1] = 0; return; }
      const v = mx.volume('music') * level;
      if (!unlocked || !(v > 0)) return;   // без жесту й у mute — жодного AudioContext
      if (owlDue(prev, s.minuteOfDay)) play('owl', 0, v);
      for (let i = 0; i < 2; i++) {
        acc[i] = (acc[i] ?? 0) + dt;
        if ((acc[i] ?? 0) >= (CRICKET_EVERY_MS[i] as number)) { acc[i] = (acc[i] ?? 0) - (CRICKET_EVERY_MS[i] as number); play('cricket', i, v); }
      }
    },
  };
}

export const nightSounds: NightSounds = createNightSounds(sharedMixer);

/** Перший жест: знімає слухачі після першого (як armFirstGesture у index.ts — той не імпортуємо, щоб не було циклу). */
export function armNightUnlock(target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>, n: Pick<NightSounds, 'unlock'> = nightSounds): void {
  const events = ['pointerdown', 'keydown', 'touchstart'] as const;
  const fire = (): void => { n.unlock(); for (const e of events) target.removeEventListener(e, fire); };
  for (const e of events) target.addEventListener(e, fire);
}
if (typeof window !== 'undefined') armNightUnlock(window);
