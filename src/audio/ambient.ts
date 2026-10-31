// GAME-194 · фоновий шар звуку: ЧИСТИЙ вибір петель за станом (ambientMix) + плавний перехід (createAmbient). Тут немає Phaser:
// петлі запускає мікшер через SoundOut (phaser-out.ts). Гучність — канал «music» мікшера (ползунок і mute ті самі, що в налаштуваннях).
import { clamp01, type LoopHandle, type Mixer } from './mixer';

export type AmbientLayer = 'camp' | 'lake' | 'fire' | 'rain' | 'road-car' | 'road-bike' | 'shop';
/** Цільова гучність кожного шару 0..1; шару, якого немає в мапі, — тиша. */
export type AmbientMix = Readonly<Partial<Record<AmbientLayer, number>>>;

export interface AmbientState {
  /** Мапа, на якій герой; null — світ ще не завантажено. */
  readonly map: 'camp' | 'home' | 'shop' | 'road' | null;
  /** Вступ (лист і дощ за вікном). */
  readonly intro: boolean;
  /** Герой біля берега озера. */
  readonly nearLake: boolean;
  /** Вогнище розпалено. */
  readonly fireLit: boolean;
  /** Герой біля вогнища. */
  readonly nearFire: boolean;
  /** `transport.car` | `transport.bike` | null (ще не обрано). */
  readonly transport: string | null;
}

export const AMBIENT_FILES: Readonly<Record<AmbientLayer, { readonly key: string; readonly url: string }>> = {
  camp: { key: 'amb-camp', url: 'audio/amb-camp.ogg' },
  lake: { key: 'amb-lake', url: 'audio/amb-lake.ogg' },
  fire: { key: 'amb-fire', url: 'audio/amb-fire.ogg' },
  rain: { key: 'amb-rain', url: 'audio/amb-rain.ogg' },
  'road-car': { key: 'amb-road-car', url: 'audio/amb-road-car.ogg' },
  'road-bike': { key: 'amb-road-bike', url: 'audio/amb-road-bike.ogg' },
  shop: { key: 'amb-shop', url: 'audio/amb-shop.ogg' },
};

/** Який фон звучить у цьому стані. Вступ і двір — дощ; крамниця — тиха кімнатна «тиша»; табір — пташки з вітром, біля озера + хвилі, біля розпаленого вогнища + тріск; дорога — за транспортом. */
export function ambientMix(s: AmbientState): AmbientMix {
  if (s.intro) return { rain: 1 };
  switch (s.map) {
    case 'home': return { rain: 0.8 };
    case 'camp': return { camp: 1, ...(s.nearLake ? { lake: 0.8 } : {}), ...(s.fireLit && s.nearFire ? { fire: 0.9 } : {}) };
    case 'shop': return { shop: 0.7 };   // GAME-204: тиха вентиляція й рідкий шурхіт крамниці
    case 'road': return { [s.transport === 'transport.bike' ? 'road-bike' : 'road-car']: 1 };
    default: return {};
  }
}

export const FADE_MS = 1200;

export interface Ambient {
  /** Задати цільовий фон (null — тиша). Перехід — у tick. */
  setAmbient(mix: AmbientMix | null): void;
  /** Крок переходу й оновлення гучності (щокадру зі сцени). */
  tick(dtMs: number): void;
  /** Перший жест гравця: до нього нічого не стартує (політика автовідтворення браузерів). */
  unlock(): void;
  /** Поточні гучності шарів (лише читання, для тестів і зонда). */
  levels(): Readonly<Partial<Record<AmbientLayer, number>>>;
}

/** Програвач петель із плавним переходом між шарами; спільний для фону (ambient) і музики (music.ts, GAME-207).
 *  `ready` — чи файли вже в кеші (музика довантажується після першого кадру); поки ні — петля не стартує, але рівні вже ростуть. */
export function createLoopPlayer<L extends string>(files: Readonly<Record<L, { readonly key: string }>>, mx: Pick<Mixer, 'volume' | 'startLoop'>, opts: { readonly fadeMs?: number; readonly ready?: () => boolean } = {}): LoopPlayer<L> {
  const fadeMs = opts.fadeMs ?? FADE_MS;
  const ready = opts.ready ?? ((): boolean => true);
  const none: Readonly<Partial<Record<L, number>>> = Object.freeze({}) as Readonly<Partial<Record<L, number>>>;
  let target = none;
  let unlocked = false;
  const gain = new Map<L, number>();
  const loops = new Map<L, LoopHandle>();
  const layers = Object.keys(files) as L[];
  return {
    setAmbient(mix) { target = mix ?? none; },
    unlock() { unlocked = true; },
    levels() { const o: Partial<Record<L, number>> = {}; for (const [k, v] of gain) if (v > 0) o[k] = v; return o; },
    tick(dtMs) {
      const step = Math.max(0, dtMs) / fadeMs;
      const vol = mx.volume('music');
      for (const l of layers) {
        const want = clamp01(target[l] ?? 0);
        const cur = gain.get(l) ?? 0;
        const next = cur < want ? Math.min(want, cur + step) : Math.max(want, cur - step);
        gain.set(l, next);
        let h = loops.get(l);
        if (next <= 0 && want <= 0) { if (h) { h.stop(); loops.delete(l); } continue; }
        if (!h) {
          if (!unlocked || vol <= 0 || !ready()) continue;   // без жесту, в тиші чи до довантаження нічого не стартуємо; петля піде, щойно можна
          h = mx.startLoop(files[l].key, next * vol) ?? undefined;
          if (!h) continue;
          loops.set(l, h);
        }
        h.setVolume(next * vol);
      }
    },
  };
}

export interface LoopPlayer<L extends string> {
  setAmbient(mix: Readonly<Partial<Record<L, number>>> | null): void;
  tick(dtMs: number): void;
  unlock(): void;
  levels(): Readonly<Partial<Record<L, number>>>;
}

export function createAmbient(mx: Pick<Mixer, 'volume' | 'startLoop'>): Ambient {
  return createLoopPlayer(AMBIENT_FILES, mx);
}
