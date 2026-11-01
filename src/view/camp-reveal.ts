// GAME-216 · сцена-заставка рушієм посеред розділу (OD-025: кіно дозовано): перший приїзд у табір — камера на кілька секунд
// відпливає від героя до озера й табору і повертається. Чиста таблиця бітів: кадр за кадром від дельти сцени (без tweens і таймерів),
// кожен біт має вихід за часом, останній — завжди 'player' (камера знову на героєві), будь-який дотик чи клавіша виходить одразу.
// Малює src/view/world/scene.ts (stopFollow → setScroll по центру з цієї таблиці → startFollow).

export type RevealKind = 'lake' | 'camp' | 'player';
export interface RevealBeat { readonly kind: RevealKind; readonly ms: number }
export interface Pt { readonly x: number; readonly y: number }

/** Межа довжини заставки (картка GAME-216: ≤ 10 с). */
export const REVEAL_MAX_MS = 10_000;

export const REVEAL_BEATS: readonly RevealBeat[] = [
  { kind: 'lake', ms: 3_200 },
  { kind: 'camp', ms: 3_000 },
  { kind: 'player', ms: 1_800 },
];

export const totalMs = (beats: readonly RevealBeat[]): number => beats.reduce((s, b) => s + b.ms, 0);
export const REVEAL_MS = totalMs(REVEAL_BEATS);

const ease = (u: number): number => { const x = Math.min(1, Math.max(0, u)); return x < 0.5 ? 2 * x * x : 1 - ((-2 * x + 2) ** 2) / 2; };
const lerp = (a: Pt, b: Pt, u: number): Pt => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });

/** Опорні точки: де герой, де озеро (середина берега), де табір (вогнище). */
export interface RevealAnchors { readonly player: Pt; readonly lake: Pt; readonly camp: Pt }

/**
 * Центр камери на `ms` від початку заставки; null — заставка скінчилась (камера знову стежить за героєм).
 * Біти: герой → озеро (наїзд), озеро → табір (панорама), табір → герой (повернення).
 */
export function revealCenter(ms: number, a: RevealAnchors, beats: readonly RevealBeat[] = REVEAL_BEATS): Pt | null {
  let start = 0;
  const legs: Record<RevealKind, [Pt, Pt]> = { lake: [a.player, a.lake], camp: [a.lake, a.camp], player: [a.camp, a.player] };
  for (const b of beats) {
    if (ms < start + b.ms) { const [from, to] = legs[b.kind]; return lerp(from, to, ease((ms - start) / b.ms)); }
    start += b.ms;
  }
  return null;
}

/** Перевірка таблиці (закон 1, мутації — camp-reveal.test.ts): ≥ 1 біт, кожен ≥ 0,5 с, разом ≤ 10 с, останній — 'player' (вихід). */
export function revealProblems(beats: readonly RevealBeat[]): string[] {
  const out: string[] = [];
  if (beats.length === 0) out.push('EMPTY: no beats');
  for (const b of beats) if (!(b.ms >= 500)) out.push(`TOO_SHORT ${b.kind}: ${b.ms} ms < 500`);
  if (totalMs(beats) > REVEAL_MAX_MS) out.push(`TOO_LONG: ${totalMs(beats)} ms > ${REVEAL_MAX_MS}`);
  if (beats.at(-1)?.kind !== 'player') out.push('NO_EXIT: last beat does not return the camera to the player');
  return out;
}
