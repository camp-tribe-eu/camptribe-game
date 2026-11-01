// GAME-216 · холодний початок демо: таблиця кадрів («бітів») кіносцени — чиста послідовність без DOM і без годинника.
// Малює її src/view/cold-open.ts, показує src/ui/ColdOpen.tsx. Сума тривалостей ≤ COLD_OPEN_MAX_MS (OD-025: кіно дозовано,
// пропуск будь-якої миті). Кожен біт має вихід: за часом — у наступний, останній — у вступ (Intro); тап — одразу у вступ.
import type { Key } from '../i18n';

export type BeatKind = 'window' | 'family' | 'atlas' | 'postcard' | 'fade';

export interface Beat {
  readonly kind: BeatKind;
  /** Тривалість біта, мс. */
  readonly ms: number;
  /** Рядок підпису (друкується з голосом) або null — тиша. */
  readonly text: Key | null;
  /** Голос підпису: ключ NPC з content/npcs.json, 'narrator' — оповідач, 'henry' — дідусь (тон із хешу, speakerPitch). */
  readonly voice: string;
}

/** Межа довжини всієї сцени (рішення картки GAME-216: ≤ 45 с). */
export const COLD_OPEN_MAX_MS = 45_000;
/** Репліка ≤ 110 знаків у кожній мові (game-content: два рядки рамки на телефоні). */
export const LINE_MAX_CHARS = 110;

export const BEATS: readonly Beat[] = [
  { kind: 'window', ms: 7_000, text: 'cold.window', voice: 'narrator' },
  { kind: 'family', ms: 8_000, text: 'cold.family', voice: 'narrator' },
  { kind: 'atlas', ms: 6_000, text: 'cold.atlas', voice: 'narrator' },
  { kind: 'postcard', ms: 11_000, text: 'cold.postcard', voice: 'henry' },
  { kind: 'fade', ms: 3_000, text: null, voice: 'narrator' },
];

export const totalMs = (beats: readonly Beat[]): number => beats.reduce((s, b) => s + b.ms, 0);
/** Повна тривалість сцени після дотику «почати», мс. */
export const COLD_OPEN_MS = totalMs(BEATS);

export interface BeatAt { readonly index: number; readonly beat: Beat; /** мс від початку цього біта */ readonly local: number; /** 0…1 у межах біта */ readonly u: number }

/** Який біт іде на `ms` від початку; після кінця — null (сцена завершена, вихід у вступ). */
export function beatAt(ms: number, beats: readonly Beat[] = BEATS): BeatAt | null {
  let start = 0;
  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i] as Beat;
    if (ms < start + beat.ms) { const local = Math.max(0, ms - start); return { index: i, beat, local, u: Math.min(1, local / beat.ms) }; }
    start += beat.ms;
  }
  return null;
}

/** Плавність камери (ease in-out), 0…1 → 0…1. */
export const ease = (u: number): number => { const x = Math.min(1, Math.max(0, u)); return x < 0.5 ? 2 * x * x : 1 - ((-2 * x + 2) ** 2) / 2; };

/**
 * Перевірка таблиці: кожен біт ≥ 1 с (інакше підпис не прочитати), сума ≤ межі, кінець — 'fade' (вихід у вступ), рядки не довші за межу
 * в усіх мовах. Повертає перелік порушень (коди англійською — сторож i18n не пускає кирилицю в рядки коду) — порожній, коли все гаразд. Мутації на це — у cold-open-beats.test.ts.
 */
export function beatsProblems(beats: readonly Beat[], lines: Readonly<Record<string, readonly string[]>> = {}): string[] {
  const out: string[] = [];
  if (beats.length === 0) out.push('EMPTY: no beats');
  for (const b of beats) if (!(b.ms >= 1000)) out.push(`TOO_SHORT ${b.kind}: ${b.ms} ms < 1000`);
  const total = totalMs(beats);
  if (total > COLD_OPEN_MAX_MS) out.push(`TOO_LONG: ${total} ms > ${COLD_OPEN_MAX_MS}`);
  if (beats.at(-1)?.kind !== 'fade') out.push('NO_EXIT: last beat is not fade');
  for (const b of beats) {
    if (b.text === null) continue;
    const texts = lines[b.text];
    if (!texts) continue;
    for (const s of texts) if (Array.from(s).length > LINE_MAX_CHARS) out.push(`LINE_TOO_LONG ${b.text}: ${Array.from(s).length} > ${LINE_MAX_CHARS}`);
  }
  return out;
}

/** Кімната (paintRoom при 320×120): центр вікна й атлас у руках Метью — опорні точки камери. */
const WINDOW_AT = { x: 58, y: 36 } as const;
const MATTHEW_AT = { x: 110, y: 96 } as const;
export interface Cam { readonly cx: number; readonly cy: number; readonly z: number }
const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;

/** Камера біта: наїзд на вікно → загальний план → панорама по родині → наїзд на атлас. `zBase` — «вся висота кімнати в кадр». */
export function cameraFor(beat: Beat, u: number, zBase: number, reduced: boolean): Cam {
  const k = reduced ? 1 : ease(u);
  switch (beat.kind) {
    case 'window': return { cx: lerp(WINDOW_AT.x, 96, k), cy: lerp(WINDOW_AT.y, 72, k), z: zBase * lerp(2.6, 1.15, k) };
    case 'family': return { cx: lerp(96, 196, k), cy: 72, z: zBase * 1.15 };
    case 'atlas': return { cx: lerp(150, MATTHEW_AT.x, k), cy: lerp(72, MATTHEW_AT.y - 8, k), z: zBase * lerp(1.15, 2.4, k) };
    default: return { cx: 150, cy: 72, z: zBase * 1.15 };
  }
}

